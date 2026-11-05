// content.js — orchestrator. Detects the person, scrapes vitals from the page, and keeps
// the extra rows injected as FamilySearch's React SPA re-renders / navigates between people.
//
// Data and injection are decoupled: rows can be injected before vitals are available, and
// the click handler reads FSSE.currentPerson at click time (set here once scraping yields a
// name). This survives the SPA rendering the panel and the vitals at different moments.
// Rows that declare `applies(p)` are the exception: they wait for the person, are removed
// again if the (re-scraped) person no longer qualifies, and keep a live tooltip via
// `describe(p)`. Menu rows (`options(p)`) additionally refresh their open list each tick.

(() => {
  const FSSE = globalThis.FSSE;
  if (!FSSE) return;

  // sources = the cached Sources-tab scrape for this PID ({titles, count, scrapedAt} or null);
  // seen = titles accumulated during the CURRENT Sources-tab visit (the list may render in
  // pieces, so each tick unions into it); savedSig = what was last written to the cache.
  const state = { fsid: null, sources: null, seen: null, savedSig: null };
  FSSE.currentPerson = null;

  // Attached-source awareness (v0.2.33): load this person's cached source titles on
  // navigation, and while ON the Sources tab scrape + save them.
  function loadSourcesFor(fsid) {
    state.sources = null;
    state.seen = null;
    state.savedSig = null;
    if (!FSSE.loadSources) return;
    FSSE.loadSources(fsid).then((rec) => {
      if (state.fsid !== fsid) return; // navigated away meanwhile
      state.sources = rec;
      FSSE.log("sources cache:", rec ? `${(rec.titles || []).length} title(s), count=${rec.count}, read ${new Date(rec.scrapedAt).toLocaleString()}` : "(none for this person yet)");
      schedule(); // re-tick so the menu / footer pick the cache up
    });
  }

  function scanSources() {
    if (!FSSE.scrapeSources) return;
    // null = no source list on this page (v0.2.92: the Labs Details page lists the sources in a
    // column, so the scrape runs there too — awareness no longer needs a Sources-tab visit).
    const res = FSSE.scrapeSources();
    if (!res) {
      if (!FSSE.isSourcesTab()) state.seen = null;
      return;
    }
    if (!state.seen) state.seen = new Map();
    // Keep the WHOLE parsed record (collection / mentioned / principal — v0.2.34 rebuilt bare
    // {title, via} here and lost the mentioned-in flag on save; seen on Edward Cummings L81M-MJX).
    for (const t of res.titles) state.seen.set(t.title, t);
    const titles = [...state.seen.values()];
    if (!titles.length && res.count !== 0) return; // list not rendered yet — never overwrite a good cache with nothing
    const sig = JSON.stringify([titles, res.count]);
    if (sig === state.savedSig) return;
    state.savedSig = sig;
    const fsid = state.fsid;
    FSSE.saveSources(fsid, { titles, count: res.count }).then((rec) => {
      if (state.fsid === fsid && rec) state.sources = rec;
    });
    FSSE.log(`sources saved for ${fsid}: ${titles.length} title(s), count=${res.count == null ? "?" : res.count}`);
  }

  // Keep FSSE.currentPerson in sync with the displayed person; reset on navigation.
  // We refresh on every tick (not just once) because the Vitals and Family sections render
  // at different times — the spouse / married surname often appears after the name does.
  function ensurePerson() {
    const fsid = FSSE.getFsid();
    if (!fsid) return;
    if (fsid !== state.fsid) {
      state.fsid = fsid;
      FSSE.currentPerson = null;
      FSSE._cycle = {}; // reset the Shift+click cycles for the new person
      state.key = null;
      // Rows + menu panels of the person-driven sites. The temple rows are person-independent
      // and live in the header, which the SPA keeps across navigations — removing them here
      // (v0.2.63–78) left a still-mounted dropdown empty until a tick happened to run while it
      // was open (v0.2.79).
      const keep = new Set(FSSE.SITES.filter((s) => s.section === "temple").map((s) => s.id));
      document.querySelectorAll("[data-fsse-id]").forEach((el) => {
        if (!keep.has(el.dataset.fsseId)) el.remove();
      });
      loadSourcesFor(fsid);
    }
    scanSources();
    const person = FSSE.getPerson();
    if (!person) return;
    // Attached-source data for sites.js (null = Sources tab never visited for this person).
    person.attachedSources = state.sources ? state.sources.titles || [] : null;
    person.attachedMeta = state.sources ? { count: state.sources.count, scrapedAt: state.sources.scrapedAt } : null;
    person.sourcesCount = FSSE.sourcesCount ? FSSE.sourcesCount() : null;
    FSSE.currentPerson = person; // always adopt the latest (more complete) scrape
    const key = [
      person.fullName, person.sex, person.living, person.birthYear, person.birthPlace,
      person.deathYear, person.deathPlace, person.christeningYear, person.burialYear,
      (person.spouseSurnames || []).join(","),
      (person.spouses || []).map((s) => `${s.surname}@${s.marriageYear || "?"}`).join(","),
      (person.parents || []).map((x) => x.id).join(","),
      (person.facts || []).map((f) => `${f.kind}@${f.year || "?"}:${f.place}`).join(","),
      person.attachedSources ? `src:${person.attachedSources.length}@${person.attachedMeta.scrapedAt}` : "src:none",
      `count:${person.sourcesCount}`,
    ].join("|");
    if (key !== state.key) {
      state.key = key;
      // Stringified so a pasted log shows the values; the source list is summarised (it is logged
      // in full by the Sources-tab DIAG).
      const brief = { ...person, attachedSources: person.attachedSources ? `${person.attachedSources.length} titles` : null };
      FSSE.log("person ready:", JSON.stringify(brief));
    }
  }

  // Per-tick refresh of an existing row: live tooltip + (for menus) the open option list.
  function refresh(row, site, person) {
    if (typeof row._fsseRefresh === "function") row._fsseRefresh(person);
    if (!site.describe) return;
    // v1.0.2: a Temple row's tooltip follows the Labs state, not the tree — it describes
    // without a person (the dropdown is on every page).
    if (!person && site.section !== "temple") return;
    try {
      const t = site.describe(person || {});
      const wrapped = FSSE.wrapTip(t);
      if (wrapped && row.getAttribute("title") !== wrapped) row.setAttribute("title", wrapped);
    } catch (err) {
      console.warn("[FSSE] describe failed for", site.id, err);
    }
  }

  // Inject any site rows not already present. Idempotent via the data-fsse-id marker.
  // Sites carry an optional `section`: "temple" rows go into the Temple dropdown (v0.2.63,
  // members only — silently skipped when that menu isn't in the DOM; it may render only
  // while open, in which case the rows appear on the tick the menu opens); everything else
  // goes into the Search Records panel.
  // v0.2.101: a site may `replaces` a native entry (fs-records: the classic card's
  // "FamilySearch" row / the Labs dropdown's "FamilySearch Records" entry — Kevin: ONE
  // FamilySearch entry point). Every tick that entry is located afresh (React may re-render
  // it), the URL its link carries is handed to the menu's options() as p.nativeUrls[site.id]
  // (→ the "Indexed Historical Records" / "All Results" entry), and it is kept hidden while our row is present
  // or merely waiting for the person to scrape — restored should our row be gone for any
  // other reason (an inject failure), so the user never loses the native search.
  // v0.2.133: a site switched OFF in the settings (FSSE.settings, src/settings.js) is skipped
  // entirely — pruneDisabled() first clears what it had put on the page.
  function tryInject() {
    pruneDisabled();
    const searchSection = FSSE.findSection();
    const templeSection = FSSE.findTempleSection ? FSSE.findTempleSection() : null;
    if (!searchSection && !templeSection) return;
    if (searchSection) FSSE.dumpDiag(); // one-time page map (only logs once)
    const person = FSSE.currentPerson;
    for (const site of FSSE.SITES) {
      if (FSSE.settings && !FSSE.settings.siteEnabled(site.id)) continue; // off in the settings
      const section = site.section === "temple" ? templeSection : searchSection;
      if (!section) continue;
      const native = site.replaces && FSSE.findNativeEntry ? FSSE.findNativeEntry(section, site.replaces) : null;
      if (site.replaces) {
        // Keyed by site id (v0.2.102 — two menus replace two native rows): p.nativeUrls =
        // { "fs-records": url | null, "ancestry-records": url | null }.
        if (person) {
          (person.nativeUrls = person.nativeUrls || {})[site.id] = native ? native.url : null;
          // v0.2.105: present-but-link-less (FS builds the partner link at click time) → the
          // menu's entry carries nativeClick and hands the click to the row (see below).
          (person.nativeRows = person.nativeRows || {})[site.id] = !!native;
        }
        noteNative(site, native);
      }
      const row = syncSite(site, section, person);
      if (row && site.replaces) row._fsseNative = native; // the live click target for injectMenu (v0.2.105)
      if (native) {
        // Hidden while our row is present — and already while the row is only waiting for
        // the person to scrape (a person page: the swap then never flashes the native row;
        // a page with no person ID would wait forever, so it keeps the native entry).
        const hide = !!row || (!person && !!site.applies && !!FSSE.getFsid());
        if (FSSE.setNativeHidden(native.row, hide, site.id)) {
          FSSE.log(`${hide ? "hid" : "restored"} the native "${native.label}" entry (${site.id} ${hide ? "takes its place" : "row absent"})`);
        }
      }
    }
  }

  // v0.2.133: a site switched off in the settings leaves no trace — its rows and menu panels
  // go, and a native entry it had hidden comes back (the marker carries the site id since
  // v0.2.133, so no section lookup is needed). Runs BEFORE the section lookup on purpose: on
  // the Labs layout the Search Records dropdown — and the Temple dropdown on every layout —
  // exists only while open, so a cleanup that waited for a found section would leave a
  // switched-off menu's row in place (and the native row hidden) until the user opened it.
  const prunedSeen = {};
  function pruneDisabled() {
    if (!FSSE.settings) return;
    for (const site of FSSE.SITES) {
      if (FSSE.settings.siteEnabled(site.id)) {
        prunedSeen[site.id] = false;
        continue;
      }
      let removed = 0;
      for (const el of document.querySelectorAll(`[data-fsse-id="${site.id}"], [data-fsse-id="${site.id}-menu"]`)) (el.remove(), removed++);
      let restored = 0;
      for (const el of document.querySelectorAll(`[data-fsse-hidden="${site.id}"]`)) if (FSSE.setNativeHidden(el, false)) restored++;
      if (removed || restored || !prunedSeen[site.id]) {
        FSSE.log(`settings: ${site.id} is switched off — ${removed} row/panel(s) removed, ${restored} native entr${restored === 1 ? "y" : "ies"} restored`);
      }
      prunedSeen[site.id] = true;
    }
  }

  // Log the native entry a site replaces once per change: its label and the URL its link
  // carries — or the fact that it has none, in which case the menu opens a URL of our own.
  const nativeSeen = {};
  function noteNative(site, native) {
    const desc = native
      ? `"${native.label}" → ${native.url ? native.url + " (read off the row, kept as the reserve)" : "(no link on the row — FS builds it on the click)"}; the menu's entry hands its click to the row`
      : "none on this layout (the menu's entry uses a URL of our own)";
    if (nativeSeen[site.id] === desc) return;
    nativeSeen[site.id] = desc;
    FSSE.log(`native entry replaced by ${site.id}:`, desc);
  }

  // One site per tick: stray-copy cleanup, applies() gating, refresh or inject. Returns the
  // site's row when it sits in the picked panel after this tick, else null.
  function syncSite(site, section, person) {
    // Two search panels can coexist (the classic card + the narrow-viewport layout's
    // third-party cluster), and a panel can even be DETACHED during a React re-render — a tick injects
    // into the other panel, the detached one comes back with our old row still inside, and
    // the page holds two copies. So: gather ALL copies, keep the one inside the picked panel,
    // remove every other (and every menu panel that no longer sits right after the kept row).
    const copies = [...document.querySelectorAll(`[data-fsse-id="${site.id}"]`)];
    const existing = copies.find((el) => section.contains(el)) || null;
    let removed = 0;
    for (const el of copies) if (el !== existing) (el.remove(), removed++);
    for (const p of document.querySelectorAll(`[data-fsse-id="${site.id}-menu"]`)) {
      if (!existing || p.previousElementSibling !== existing) (p.remove(), removed++);
    }
    if (removed) FSSE.log(`removed ${removed} stray cop${removed > 1 ? "ies" : "y"} of ${site.id} outside the picked panel`);
    if (site.applies) {
      if (!person) return null; // person-dependent rows wait for the scrape
      if (!site.applies(person)) {
        if (existing) {
          existing.remove();
          document.querySelector(`[data-fsse-id="${site.id}-menu"]`)?.remove();
          FSSE.log("removed row (no longer applies):", site.id);
        }
        return null;
      }
    }
    if (existing) {
      refresh(existing, site, person);
      return existing;
    }
    // anchorLabel may list fallbacks (an earlier injected row first, then a native one) so
    // the extra rows keep a stable order even when an optional row is absent.
    const labels = [].concat(site.anchorLabel);
    let anchor = null;
    let anchorLabel = null;
    for (const label of labels) {
      anchor = FSSE.findEntryByLabel(section, label);
      if (anchor) {
        anchorLabel = label;
        break;
      }
    }
    if (!anchor) {
      FSSE.log(`no anchor among [${labels.join(", ")}] for ${site.id}`);
      return null;
    }
    try {
      const row = site.options
        ? FSSE.injectMenu(anchor, site, anchorLabel)
        : FSSE.injectRow(anchor, site, anchorLabel);
      refresh(row, site, person);
      return row;
    } catch (err) {
      console.warn("[FSSE] inject failed for", site.id, err);
      return null;
    }
  }

  let timer = null;
  function tick() {
    // v0.2.133: nothing is injected until the settings have loaded (a few ms; the watchdog in
    // settings.js hands the defaults over if storage never answers). Ticks dropped here are
    // re-run by the schedule() that settings.ready triggers below.
    if (FSSE.settings && !FSSE.settings.loaded) return;
    // v1.0.0: a tab whose content script an update / reload has orphaned keeps working on the
    // asset URLs cached at load (inject.js); say so once, in a release build too.
    if (FSSE.contextAlive && !FSSE.contextAlive()) FSSE.orphaned("page tick");
    ensurePerson();
    tryInject();
    // v0.2.80: on the Source Linker (/search/linker) append the "📍 compare" map links to the
    // record's and the tree's places (linker.js; a no-op on every other page).
    if (FSSE.linker && FSSE.linker.isLinkerPage()) {
      try {
        FSSE.linker.tick();
      } catch (err) {
        console.warn("[FSSE] linker tick failed", err);
      }
    }
    // v0.2.125: on a person page a "📍 map" link after every place the page mentions — the
    // Vitals rows, each couple block's marriage, the Other Information facts (linker.js, the
    // same scan + single-pin click flow; `[FSSE] places:` lines).
    if (FSSE.linker && FSSE.linker.isPersonPage && FSSE.linker.isPersonPage()) {
      try {
        FSSE.linker.tickPerson();
      } catch (err) {
        console.warn("[FSSE] person-page map pins tick failed", err);
      }
    }
    // v0.2.90: on a person page put the numeric Quality Score (+ thresholds + the actions
    // that would raise it) in a tooltip on the Low/Medium/High badge (dqs.js; the number
    // comes from the page's own scores response via dqs-listen.js — no request of ours).
    if (FSSE.dqs) {
      try {
        FSSE.dqs.tick();
      } catch (err) {
        console.warn("[FSSE] dqs tick failed", err);
      }
    }
    // v1.0.2: on a Labs experiment's own page that shows FamilySearch's "Page Not Found" (the
    // experiment is off for this account, or has ended), a banner offering FamilySearch's own
    // opt-in route (labs.js; a no-op on every other page).
    if (FSSE.labs) {
      try {
        FSSE.labs.tick();
      } catch (err) {
        console.warn("[FSSE] labs tick failed", err);
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, 300);
  }

  // v0.2.133: the load line waits for the settings (a stored "Console diagnostics" switch turns
  // FSSE.DEBUG on as they land — so a release build with it on still shows this line), and every
  // settings change re-syncs the page: a switched-off menu goes and its native row returns, a
  // switched-on one injects, the map pins and the Quality Score tooltip follow (each module reads
  // the live values on its next tick).
  const booted = () => {
    FSSE.log("content script loaded", "v" + FSSE.version(), "on", location.pathname, "fsid=", FSSE.getFsid());
    schedule();
  };
  if (FSSE.settings && FSSE.settings.ready) {
    FSSE.settings.ready.then(booted);
    FSSE.settings.onChange(() => {
      FSSE.log("settings changed — re-syncing the page");
      schedule();
    });
  } else booted();
  // v1.0.2: the Labs state arriving (or changing in another tab) re-syncs too — the Temple
  // row's tooltip follows it.
  if (FSSE.labs && FSSE.labs.onChange) FSSE.labs.onChange(schedule);
  // v0.2.67: arm the temple-row injection on the FIRST user gesture (see findTempleSection —
  // injecting into the header before React finished hydrating it duplicated the whole header
  // on /en/campaign/temple-tools; a gesture-opened dropdown proves hydration is done).
  // v0.2.79: EVERY gesture schedules a tick, not just the first (Kevin: the temple rows
  // "do not always appear" until a page refresh). The MutationObserver below sees only node
  // insertions/removals — when FS opens an already-mounted dropdown by toggling a class or
  // style, no tick ran, so the rows were never injected (or, after a person-to-person
  // navigation had removed them, never re-injected). A dropdown can only open on a click or
  // a key, so a tick 300 ms after each gesture plus a 1 s follow-up (an open animation may
  // keep the copy "hidden" past the first tick) catches it every time. Attribute observation
  // was rejected on purpose: the menu rebuild re-pads the group headers via style, which
  // would re-trigger the observer forever while a menu is open.
  let later = null;
  const onGesture = () => {
    FSSE._userGestureSeen = true;
    schedule();
    clearTimeout(later);
    later = setTimeout(tick, 1000);
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"]) {
    document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  schedule();
})();
