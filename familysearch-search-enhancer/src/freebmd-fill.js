// freebmd-fill.js — content script for https://www.freebmd.org.uk/*.
//
// FreeBMD's search (/cgi/search.pl) is a POST form guarded by per-page hidden tokens (db, v)
// and ignores GET parameters, so it cannot be deep-linked. The FSSE FreeBMD menu therefore
// opens the search page with the parameters in the URL FRAGMENT (#fsse=<json>) — the fragment
// is never sent to FreeBMD's server — and this script fills the page's own rendered form
// (which carries valid tokens) and clicks the real Find button, exactly as the user would.
//
// Params (see freebmdOptions in sites.js): { type: "Births"|"Marriages"|"Deaths",
//   surname, given, s_surname (spouse / mother's maiden), start, sq, end, eq }.
// Quarters: 1=Mar, 2=Jun, 3=Sep, 4=Dec.
//
// Logs go to console.debug (visible only with the console's Verbose level on), so the script
// is silent on FreeBMD's site in normal use.

(() => {
  const log = (...a) => console.debug("[FSSE freebmd]", ...a);
  const FORM_URL = "https://www.freebmd.org.uk/cgi/search.pl";
  const KEY = "fsse.freebmd.pending";
  const TTL = 15 * 60 * 1000;

  // Per-tab stash (v0.2.77), single-shot, 15-minute TTL — the GRO pattern. Used only by the
  // reused-tab path below: a payload arriving as a fragment-only navigation is stashed here
  // and picked up by run() once the form page has loaded for real.
  const loadStash = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY));
      if (s && s.params && Date.now() - s.ts < TTL) return s;
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

  // Empty value slots → null (v0.2.73). RootsMagic WebSearch templates substitute a person's
  // years into the payload's number slots, and a person with no death (or birth) year gets
  // NOTHING substituted — the fragment then reads `"end":}` (Kevin's Daniel Stow Hind
  // marriage search, 2026-09-06), which is invalid JSON and used to abort the whole fill.
  function repairJson(s) {
    return s.replace(/:(?=\s*[,}\]])/g, ":null");
  }

  // Pure parser (node-testable via FSSE._freebmdFill): "#fsse=<uri-encoded json>" → params | null.
  function parseParams(hash) {
    const m = /[#&]fsse=([^&]+)/.exec(hash || "");
    if (!m) return null;
    try {
      const p = JSON.parse(repairJson(decodeURIComponent(m[1])));
      return p && typeof p === "object" && p.type ? p : null;
    } catch (_) {
      return null;
    }
  }

  // Second and later forenames are trimmed to their INITIALS (v0.2.72): FreeBMD's given
  // matching is a prefix match, so "Sidney J" finds entries indexed "Sidney Joseph" AND
  // "Sidney J" (the later printed GRO indexes shortened second forenames to initials),
  // while the full "Sidney Joseph" misses the initial-only entries — Kevin's live
  // experiment 2026-09-05, confirmed across Births/Marriages/Deaths. First forename
  // stays whole; a single-word given is untouched.
  function initials(name) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    return words.length > 1 ? [words[0], ...words.slice(1).map((w) => w[0])].join(" ") : name;
  }

  // Clamp the date window to what FreeBMD's own validate() accepts (v0.2.74): start no
  // earlier than Sep 1837 (civil registration began 1 July 1837 — the first index quarter is
  // September), end no later than Dec 1999. The FS-side menu already clamps, but a
  // RootsMagic template substitutes the person's RAW years — Kevin's Daniel Stow Hind
  // (b. 1825) marriage search filled "Mar 1825" and FreeBMD alerted "Start of search must be
  // September 1837 or later" instead of searching (2026-09-06). Returns the adjusted
  // {start, sq, end, eq} plus `searchable` = false when the whole window lies outside
  // coverage (e.g. died 1830, or born 2003) — the form is then left filled, Find not pressed.
  function clampWindow(p) {
    const num = (v) => (v == null || v === "" || isNaN(v) ? null : Number(v));
    let start = num(p.start), sq = num(p.sq) || 1, end = num(p.end), eq = num(p.eq) || 4;
    if (start != null && (start < 1837 || (start === 1837 && sq < 3))) { start = 1837; sq = 3; }
    if (end != null && end > 1999) { end = 1999; eq = 4; }
    let searchable = true;
    if (start != null && end != null && start * 4 + sq > end * 4 + eq) searchable = false;
    if (end != null && (end < 1837 || (end === 1837 && eq < 3))) searchable = false;
    if (start != null && start > 1999) searchable = false;
    return { start, sq, end, eq, searchable };
  }

  function fill(form, p) {
    p = { ...p, ...clampWindow(p) };
    // Record type: checkboxes named "type" (All / Births / Deaths / Marriages) — tick exactly ours.
    let typeOk = false;
    for (const box of form.querySelectorAll('input[name="type"]')) {
      box.checked = box.value === p.type;
      if (box.checked) typeOk = true;
    }
    const set = (name, value) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && value != null && value !== "") el.value = String(value);
    };
    set("surname", p.surname);
    set("given", initials(p.given));
    set("s_surname", p.s_surname);
    set("s_given", initials(p.s_given));
    // v0.2.108: the "Death age/DoB" box — a birth-year range such as "1879-1881" (sites.js sends
    // the tree's birth year ±1 on death searches); FreeBMD matches it against each entry's
    // recorded age (from 1866) or date of birth (from 1969). Deaths searches only.
    set("aad", p.aad);
    // A quarter is only meaningful next to its year: a payload with an empty end year (an
    // RM template run on a person with no death year) leaves the end date blank so FreeBMD
    // searches from the start year onwards, instead of "Dec quarter of year ''" (v0.2.73).
    const has = (v) => v != null && v !== "";
    if (has(p.start)) {
      set("start", p.start);
      set("sq", p.sq);
    }
    if (has(p.end)) {
      set("end", p.end);
      set("eq", p.eq);
    }
    return typeOk;
  }

  // Why the form is being left for the user (v0.2.75), or null when Find can be pressed.
  // An RM template run on a person with NO known year at all substitutes nothing for both
  // [StartYear] and [EndYear] (christening-only / burial-only people); one known bound still
  // searches (the v0.2.73 Daniel Stow Hind case, verified) — only the year-less form and a
  // window outside FreeBMD's coverage are held, with the reason shown on the page.
  function holdNotice(p) {
    const has = (v) => v != null && v !== "" && !isNaN(v);
    const type = String(p.type || "");
    if (!has(p.start) && !has(p.end)) {
      const what = /birth/i.test(type) ? "birth" : /death/i.test(type) ? "death" : "birth or death";
      return (
        `Search Enhancer for FamilySearch: your tree has no ${what} year for this person, so Find was not pressed. ` +
        "Enter the date range (a christening or burial year is a good stand-in), then press Find. " +
        "The other fields are already filled."
      );
    }
    if (!clampWindow(p).searchable) {
      return (
        "Search Enhancer for FamilySearch: the date range lies outside FreeBMD's coverage (Sep 1837 – Dec 1999), " +
        "so Find was not pressed. Adjust the dates, then press Find. The other fields are already filled."
      );
    }
    return null;
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

  // A fresh #fsse payload arriving in THIS tab (v0.2.77): the FSSE menu and the worklist reuse
  // one named FreeBMD tab, and every search URL is search.pl + fragment — the same URL the
  // results page sits on (the form posts back to search.pl) — so the browser does a fragment
  // navigation: no page load, so run() never fires. Stash the payload and load the plain
  // form page (a URL without a fragment is a full navigation); run() on the new document
  // takes the stash. Returns the URL to load, or null when the hash carries no payload.
  function retarget(hash) {
    const p = parseParams(hash);
    if (!p) return null;
    saveStash({ params: p, ts: Date.now() });
    return FORM_URL;
  }

  function run() {
    let p = parseParams(location.hash);
    if (p) {
      // Drop the fragment first: a reload or the browser Back button must show the plain form,
      // never re-trigger the automated search.
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (_) {}
    } else {
      const stash = loadStash();
      p = stash ? stash.params : null;
    }
    dropStash(); // single-shot either way
    if (!p) return;
    const form = document.forms.search || document.querySelector('form[action*="search.pl"]');
    if (!form) {
      log("no search form on this page — nothing filled");
      return;
    }
    const ok = fill(form, p);
    const win = clampWindow(p);
    log("filled", JSON.stringify(p), "type set:", ok, "window:", JSON.stringify(win));
    if (!ok) return; // unknown record type → leave the filled form for the user
    const hold = holdNotice(p);
    if (hold) {
      log(win.searchable ? "no year at all in the payload" : "date window lies outside FreeBMD's Sep 1837 – Dec 1999 coverage", "— form left filled, Find not pressed");
      showNotice(hold);
      return;
    }
    // Click the real Find button (an <input type=image name=find>) so FreeBMD's own onclick +
    // onsubmit validation run exactly as for a manual search. If it's missing, the form is
    // left filled for the user to submit.
    const find = form.querySelector('input[name="find"]');
    if (find) find.click();
    else log("Find button not found — form left filled");
  }

  // Exposed for node tests (no FSSE namespace on freebmd.org.uk — this file is standalone).
  if (typeof module !== "undefined" && module.exports) module.exports = { parseParams, fill, initials, clampWindow, holdNotice, retarget };
  else if (typeof globalThis !== "undefined" && globalThis.FSSE) globalThis.FSSE._freebmdFill = { parseParams, fill, initials, clampWindow, holdNotice, retarget };

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
