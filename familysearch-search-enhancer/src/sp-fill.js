// sp-fill.js — content script for https://www.scotlandspeople.gov.uk/*.
//
// ScotlandsPeople has no GET deep links (Drupal POST forms with per-page tokens), but its
// per-record-type search pages load anonymously and render the form once you're logged in
// (element ids probed via WikiTree Sourcer's production scotp module, 2026-09-04 — the
// long-planned route from the 2026-08-31 feasibility probe). Each FSSE menu entry opens
// `search-records/<type path>#fsse=<json>`; the payload is `{ path, fields }` where `fields`
// maps ELEMENT IDS to values (sites.js owns the per-record-type id knowledge, so this script
// stays generic): a string fills a text/select field, `true` checks a radio/checkbox.
//
// Flow (the GRO stash-and-resume pattern, v0.2.49): stash the fragment payload in
// sessionStorage (per-tab, 15-min TTL, single-shot), strip the hash; when the search form
// (`advanced-search-form`) is present, fill it and call form.submit() — Sourcer's own submit
// path, so this behaves as a user search; when the page shows the logged-out marker
// (`div.log-in`, Sourcer's check), wait — after the sign-in, the next SP page in this tab
// navigates once back to the search path and the fill completes. Nothing is submitted unless
// at least one field was actually set (a wrong page sets none).
//
// Logs go to console.debug (visible only with the console's Verbose level on), so the script
// is silent on ScotlandsPeople in normal use.

(() => {
  const log = (...a) => console.debug("[FSSE sp]", ...a);
  const SP_BASE = "https://www.scotlandspeople.gov.uk/search-records/";
  const KEY = "fsse.sp.pending";
  const TTL = 15 * 60 * 1000;

  // Pure parser (node-testable): "#fsse=<uri-encoded json>" → { path, fields } | null.
  // Empty value slots → null (v0.2.73): a RootsMagic template run on a person with no
  // death (or birth) year substitutes NOTHING into that year slot, leaving `"…year-to":}`
  // — invalid JSON that used to abort the whole fill (see freebmd-fill.js).
  function repairJson(s) {
    return s.replace(/:(?=\s*[,}\]])/g, ":null");
  }

  function parseParams(hash) {
    const m = /[#&]fsse=([^&]+)/.exec(hash || "");
    if (!m) return null;
    try {
      const p = JSON.parse(repairJson(decodeURIComponent(m[1])));
      return p && typeof p === "object" && typeof p.path === "string" && p.fields && typeof p.fields === "object" ? p : null;
    } catch (_) {
      return null;
    }
  }

  // Fill by element id: true → check (radio/checkbox), anything else → value. A key of the
  // form "so:<field id>" sets that name field's SEARCH-OPTION radio instead (v0.2.53): the
  // radios sit in a div.so-wrapper around the field and are selected by VALUE ("exact",
  // "fuzzy", "soundex" = SP's "Phonetic matching") — Sourcer's own mechanism. A missing
  // wrapper/radio just logs; the search then runs with SP's default option.
  // Returns { set, missing } so the caller can decide whether submitting makes sense.
  function fill(doc, fields) {
    let set = 0;
    const missing = [];
    for (const [id, v] of Object.entries(fields)) {
      if (v == null || v === "") continue; // empty slot (unknown year in an RM template, v0.2.73) → leave SP's default
      if (id.startsWith("so:")) {
        const input = doc.getElementById(id.slice(3));
        const wrapper = input && input.closest ? input.closest("div.so-wrapper") : null;
        let done = false;
        if (wrapper && wrapper.querySelectorAll) {
          for (const r of wrapper.querySelectorAll('input[type="radio"]')) {
            if (r.value === v) {
              r.checked = true;
              done = true;
            }
          }
        }
        if (done) set++;
        else missing.push(id);
        continue;
      }
      const el = doc.getElementById(id);
      if (!el) {
        missing.push(id);
        continue;
      }
      if (v === true || el.type === "radio" || el.type === "checkbox") el.checked = true;
      else el.value = String(v);
      set++;
    }
    return { set, missing };
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

  // Why the form is being left for the user (v0.2.75), or null when it can be submitted.
  // Year fields are the `…-year-from` / `…-year-to` ids (statutory and church forms alike);
  // when the payload carries such fields and EVERY one is empty (an RM template run on a
  // christening-only / burial-only person — nothing substituted for [StartYear]/[EndYear]),
  // submitting would search every year. One known bound still submits (v0.2.73 behaviour);
  // census payloads carry no year fields and are never held.
  function holdNotice(p) {
    const fields = (p && p.fields) || {};
    const yearKeys = Object.keys(fields).filter((k) => /-year-(from|to)$/.test(k));
    if (!yearKeys.length) return null;
    if (yearKeys.some((k) => fields[k] != null && fields[k] !== "")) return null;
    const path = String((p && p.path) || "");
    const what = /births/i.test(path) ? "birth" : /deaths/i.test(path) ? "death" : "birth or death";
    return (
      `Search Enhancer for FamilySearch: your tree has no ${what} year for this person, so the form was not submitted. ` +
      "Enter the year range (a christening or burial year is a good stand-in), then press Search. " +
      "The other fields are already filled."
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

    const form = document.getElementById("advanced-search-form");
    if (form) {
      dropStash(); // single-shot: the results page must never re-submit
      const r = fill(document, stash.params.fields);
      log("filled", r.set, "fields", JSON.stringify(stash.params.fields), r.missing.length ? "missing: " + r.missing.join(", ") : "");
      const hold = holdNotice(stash.params);
      if (hold) {
        log("no year at all in the payload — form left filled, not submitted");
        showNotice(hold);
        return;
      }
      if (r.set > 0) form.submit();
      else log("no matching fields on this form — nothing submitted");
      return;
    }

    // Sourcer's logged-out marker: the page renders without the search form and with a login box.
    if (document.querySelector("div.log-in")) {
      log("not signed in — the search resumes after you log in to ScotlandsPeople");
      return;
    }

    // Some other SP page (e.g. wherever the login lands): head to the search page once.
    if (!stash.navigated) {
      stash.navigated = true;
      saveStash(stash);
      log("resuming — navigating to", stash.params.path);
      location.replace(SP_BASE + stash.params.path);
    } else {
      dropStash();
      log("search form still not reachable — giving up on this stash");
    }
  }

  // Exposed for node tests (no FSSE namespace on scotlandspeople.gov.uk — this file is standalone).
  if (typeof module !== "undefined" && module.exports) module.exports = { parseParams, fill, holdNotice };
  else if (typeof globalThis !== "undefined" && globalThis.FSSE) globalThis.FSSE._spFill = { parseParams, fill, holdNotice };

  if (typeof document !== "undefined" && document.forms) run();
})();
