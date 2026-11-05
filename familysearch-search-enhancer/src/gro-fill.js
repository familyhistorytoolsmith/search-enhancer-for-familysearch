// gro-fill.js — content script for https://www.gro.gov.uk/*.
//
// GRO's online index search (indexes_search.asp) honours GET parameters — the server renders
// the form PRE-FILLED from the query string (verified live, Kevin 2026-09-04: index=EW_Birth&
// Year=1897&Range=2&Surname=HISCOCKS&Forename1=DORIS&Gender=F filled the Birth form) — but it
// never runs the search: that still needs a click, and the whole site sits behind a login
// (no session → the server 302s every page to Login.asp, dropping the query string).
//
// So each FSSE menu entry opens the search URL with the parameters BOTH ways: in the query
// string (the server pre-fills when logged in) and in the URL FRAGMENT (#fsse=<json> — never
// sent to GRO's server, and fragments survive the login redirect). This script:
//   1. stashes the fragment payload in sessionStorage (per-tab) and strips the hash;
//   2. on the search form: re-checks/fills the fields and clicks the real Search button —
//      the same automating-the-user's-click posture as freebmd-fill.js;
//   3. on the login page: waits (the stash survives); after the login, whatever GRO page
//      loads next in this tab navigates once to the search URL and step 2 completes it.
// The stash is single-shot (removed before the click) and expires after 15 minutes, so a
// reload, the Back button, or ordinary GRO browsing never re-triggers a search.
//
// Params (see groOptions in sites.js): { index: "EW_Birth"|"EW_Death", Year, Range, Surname,
//   Forename1, Forename2, Gender: "M"|"F", MothersSurname (births), Age, AgeRange (deaths) }.
//
// Logs go to console.debug (visible only with the console's Verbose level on), so the script
// is silent on GRO's site in normal use.

(() => {
  const log = (...a) => console.debug("[FSSE gro]", ...a);
  const SEARCH_URL = "https://www.gro.gov.uk/gro/content/certificates/indexes_search.asp";
  const SEARCH_PATH_RE = /indexes_search\.asp$/i;
  const KEY = "fsse.gro.pending";
  const TTL = 15 * 60 * 1000;

  // Pure parser (node-testable): "#fsse=<uri-encoded json>" → params | null.
  // Empty value slots → null (v0.2.73): a RootsMagic template run on a person with no
  // death (or birth) year substitutes NOTHING into the Year slot, leaving `"Year":,` —
  // invalid JSON that used to abort the whole fill (see freebmd-fill.js).
  function repairJson(s) {
    return s.replace(/:(?=\s*[,}\]])/g, ":null");
  }

  function parseParams(hash) {
    const m = /[#&]fsse=([^&]+)/.exec(hash || "");
    if (!m) return null;
    try {
      const p = JSON.parse(repairJson(decodeURIComponent(m[1])));
      return p && typeof p === "object" && p.index ? p : null;
    } catch (_) {
      return null;
    }
  }

  function buildQuery(p) {
    return Object.entries(p)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  // The search form = the one holding a Surname field ("Surname at Birth" / "Surname at Death").
  function findSearchForm(doc) {
    for (const f of doc.forms) {
      if (f.querySelector && f.querySelector('[name="Surname" i]')) return f;
    }
    return null;
  }

  // Fill the form from the params. The server usually pre-filled everything from the query
  // string already — this pass covers the after-login resume and any field the server skipped.
  // Returns false only when index radios exist and none matched (wrong form → don't submit).
  function fill(form, p) {
    // A multi-word Forename1 with no Forename2 is split across GRO's two forename boxes
    // (v0.2.71): RootsMagic-style template payloads can only substitute the person's WHOLE
    // given name into Forename1 ("Sidney Joseph"), and GRO's exact matching then returns
    // nothing (Kevin's live RM test, 2026-09-05). First word → Forename1, second →
    // Forename2; GRO has only the two fields, so further middle names are dropped. The
    // FS-menu payloads already send the names split, so this never touches them.
    if (p.Forename1 && !p.Forename2) {
      const words = String(p.Forename1).trim().split(/\s+/);
      if (words.length > 1) p = { ...p, Forename1: words[0], Forename2: words[1] };
    }
    const radios = Array.from(form.querySelectorAll('input[name="index" i]'));
    let idxOk = radios.length === 0; // no radios → trust the server's GET pre-fill
    for (const r of radios) {
      r.checked = r.value === p.index;
      if (r.checked) idxOk = true;
    }
    const missing = [];
    for (const name of ["Year", "Range", "Surname", "Forename1", "Forename2", "Gender", "MothersSurname", "Age", "AgeRange"]) {
      const v = p[name];
      if (v == null || v === "") continue;
      const el = form.querySelector(`[name="${name}" i]`);
      if (el) el.value = String(v);
      else missing.push(name);
    }
    if (missing.length) log("fields not found on the form:", missing.join(", "));
    return idxOk;
  }

  // The real submit control: prefer Sourcer-documented name=SearchIndexes, else anything
  // submit-like whose name/value/alt/text says "search".
  function findSearchButton(form) {
    const exact = form.querySelector('[name="SearchIndexes" i]');
    if (exact) return exact;
    for (const el of form.querySelectorAll('input[type="submit"], input[type="image"], button')) {
      const txt = `${el.name || ""} ${el.value || ""} ${el.alt || ""} ${el.textContent || ""}`;
      if (/search/i.test(txt)) return el;
    }
    return null;
  }

  const loadStash = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY));
      if (s && s.params && Date.now() - s.ts < TTL) return s;
    } catch (_) {}
    try {
      sessionStorage.removeItem(KEY);
    } catch (_) {}
    return null;
  };
  const saveStash = (s) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch (_) {}
  };
  const dropStash = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch (_) {}
  };

  // Why the form is being left for the user (v0.2.75), or null when the search can run.
  // GRO insists on a year; an RM template run on a person whose birth (or death) year is
  // unknown substitutes nothing for [StartYear]/[EndYear] — Kevin's Alice Jane Brain
  // (christening 1864, no birth) stalled silently on the v0.2.73 console-only line.
  // `formYear` = the value GRO's own Year box already holds (the user chose one on the
  // year-only page, v0.2.76) — a year from either source lets the search run.
  function holdNotice(p, formYear) {
    if (p.Year != null && p.Year !== "") return null;
    if (formYear != null && String(formYear).trim() !== "") return null;
    const death = /death/i.test(p.index || "");
    return (
      `Search Enhancer for FamilySearch: your tree has no ${death ? "death" : "birth"} year for this person, ` +
      `so the search was not run. Choose the year (a ${death ? "burial" : "christening"} year is a good stand-in), ` +
      "then press Search. The other fields are already filled."
    );
  }

  // The year-only page (v0.2.76 — Kevin's Alice Jane Brain screenshot): with no Year in the
  // query GRO renders just the index radios and the Year box; the name fields (and so the
  // Surname field findSearchForm keys on) only exist once a year is chosen. The banner
  // says what to do and what the search holds, in case the hand-off below misses.
  function awaitingYearNotice(p) {
    const death = /death/i.test(p.index || "");
    const bits = [
      p.Surname ? `surname ${p.Surname}` : "",
      [p.Forename1, p.Forename2].filter(Boolean).length ? `forenames ${[p.Forename1, p.Forename2].filter(Boolean).join(" ")}` : "",
      p.Gender ? (String(p.Gender).toUpperCase() === "F" ? "female" : "male") : "",
      p.MothersSurname ? `mother ${p.MothersSurname}` : "",
    ].filter(Boolean);
    return (
      `Search Enhancer for FamilySearch: your tree has no ${death ? "death" : "birth"} year for this person, ` +
      `so GRO shows only the year box. Choose the year (a ${death ? "burial" : "christening"} year is a good stand-in); ` +
      "the rest of the form then fills itself and the search runs." +
      (bits.length ? ` Search details: ${bits.join(", ")}.` : "")
    );
  }

  // A dismissable banner across the top of the page — the site-agnostic way to say why the
  // automation stopped (console lines are invisible in normal use).
  function showNotice(text) {
    try {
      const d = document.createElement("div");
      d.setAttribute("data-fsse-notice", "");
      d.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff4ce;color:#222;" +
        "border-bottom:2px solid #d4a72c;font:15px/1.4 system-ui,Arial,sans-serif;padding:10px 44px 10px 16px;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.2)";
      d.textContent = text;
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.title = "Dismiss";
      x.style.cssText = "position:absolute;top:4px;right:10px;border:0;background:none;font-size:22px;cursor:pointer;color:#444";
      x.addEventListener("click", () => d.remove());
      d.appendChild(x);
      (document.body || document.documentElement).appendChild(d);
    } catch (_) {}
  }

  // Fill the recognised search form and press Search (single-shot: the stash goes first, so
  // the results page — same URL — can never re-submit).
  function complete(form, stash) {
    dropStash();
    const ok = fill(form, stash.params);
    log("filled", JSON.stringify(stash.params), "index set:", ok);
    if (!ok) return; // wrong/unknown form → leave it filled for the user
    // GRO insists on a year; without one (an RM template run on a person whose year is
    // unknown, v0.2.73) pressing Search only yields GRO's validation message — leave the
    // form filled for the user to add the year, and say so on the page (v0.2.75). A year
    // the user already chose on GRO's year-only page counts (v0.2.76).
    const yearEl = form.querySelector('[name="Year" i]');
    const hold = holdNotice(stash.params, yearEl ? yearEl.value : null);
    if (hold) {
      log("no year in the payload — form left filled, Search not pressed");
      showNotice(hold);
      return;
    }
    for (const n of document.querySelectorAll("[data-fsse-notice]")) n.remove();
    const btn = findSearchButton(form);
    if (btn) btn.click();
    else log("Search button not found — form left filled");
  }

  // Year-only page: if GRO reveals the full form in place once a year is chosen (rather than
  // reloading), complete the search from here. Idle otherwise; the stash's TTL bounds it.
  function watchForForm(stash) {
    if (typeof MutationObserver === "undefined") return;
    try {
      const obs = new MutationObserver(() => {
        const form = findSearchForm(document);
        if (!form) return;
        obs.disconnect();
        if (!loadStash()) return; // already completed elsewhere (or expired)
        log("full form appeared in place — completing the search");
        complete(form, stash);
      });
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (_) {}
  }

  function run() {
    const fromHash = parseParams(location.hash);
    if (fromHash) {
      // Drop the fragment first: a reload or the Back button must show the plain page.
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (_) {}
      saveStash({ params: fromHash, ts: Date.now() });
    }
    const stash = loadStash();
    if (!stash) return;

    const form = findSearchForm(document);
    if (form) {
      complete(form, stash);
      return;
    }

    // The search page itself, but year-only (no Year in the query — an RM template run on a
    // person whose year is unknown, v0.2.76): keep the stash, explain on the page, and finish
    // the search once the full form exists — revealed in place (the observer below) or on the
    // reload GRO does after the year is chosen (run() again, stash still there).
    if (SEARCH_PATH_RE.test(location.pathname) && (stash.params.Year == null || stash.params.Year === "")) {
      if (!stash.awaitingYear) {
        stash.awaitingYear = true;
        saveStash(stash);
      }
      log("year-only search page (no year in the payload) — waiting for a year to be chosen");
      showNotice(awaitingYearNotice(stash.params));
      watchForForm(stash);
      return;
    }

    if (/login/i.test(document.title) || /login\.asp/i.test(location.pathname)) {
      log("login page — the search resumes after you sign in");
      return;
    }

    // Some other GRO page (e.g. the post-login menu): head to the search form once.
    if (!stash.navigated) {
      stash.navigated = true;
      saveStash(stash);
      log("resuming — navigating to the search form");
      location.replace(`${SEARCH_URL}?${buildQuery(stash.params)}`);
    } else {
      dropStash();
      log("search form still not reachable — giving up on this stash");
    }
  }

  // A fresh #fsse payload arriving in THIS tab (v0.2.77): the FSSE menus and the worklist
  // reuse one named GRO tab, and when the new search URL differs from the tab's current URL
  // only by its fragment the browser does a fragment navigation — no page load, so run()
  // never fires. Stash the payload and load the search form for real (the URL without a
  // fragment is a full navigation); run() on the new document finds the stash and
  // completes the search, login redirect and year-only page included. Returns the URL to
  // load, or null when the hash carries no payload.
  function retarget(hash) {
    const p = parseParams(hash);
    if (!p) return null;
    saveStash({ params: p, ts: Date.now() });
    return `${SEARCH_URL}?${buildQuery(p)}`;
  }

  // Exposed for node tests (no FSSE namespace on gro.gov.uk — this file is standalone).
  if (typeof module !== "undefined" && module.exports) module.exports = { parseParams, buildQuery, fill, findSearchButton, holdNotice, awaitingYearNotice, retarget };
  else if (typeof globalThis !== "undefined" && globalThis.FSSE) globalThis.FSSE._groFill = { parseParams, buildQuery, fill, findSearchButton, holdNotice, awaitingYearNotice, retarget };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("hashchange", () => {
      const to = retarget(location.hash);
      if (!to) return;
      log("new search arrived in this tab — loading the search form");
      for (const n of document.querySelectorAll("[data-fsse-notice]")) n.remove();
      location.replace(to);
    });
  }

  if (typeof document !== "undefined" && document.forms) run();
})();
