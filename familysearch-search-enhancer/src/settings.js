// settings.js — the user settings store (v0.2.133, Kevin's ask 2026-10-29: "a user may not have a
// MyHeritage.com account and only wants the standard search menu for that website … may not want
// to see the map pins … may want to disable one or more of our search options from the Temple
// menu", plus the regional Ancestry / Findmypast site).
//
// WHAT IS CONFIGURABLE: whole features — each injected menu (a switched-off `replaces` menu gives
// FamilySearch's own row back), the map pins per page kind, the Quality Score tooltip, each Temple
// row, the regional host our Ancestry / Findmypast links open on, and a console-diagnostics switch.
// NOT configurable, on purpose: anything INSIDE a menu (groups, collections, years, surnames) — the
// content-aware core stays driven by the person page (Kevin's 2026-08-30 decision).
//
// STORAGE: one object under "fsse.settings" in chrome.storage.sync (follows the Chrome profile;
// Chrome keeps it locally when sync is off), chrome.storage.local as the fallback, localStorage
// after that, the defaults last. An absent key = its default, so an install with nothing stored
// behaves exactly as before this file existed. `ready` ALWAYS resolves (a watchdog hands the
// defaults over if storage never answers — an orphaned content script throws, a hung callback
// never fires), so a storage hiccup can never make the extension inert.
//
// LOADED TWICE OVER: as the second content script on familysearch.org (after inject.js, so
// FSSE.DEBUG is the build's constant when captured below) AND by src/options.html, where no other
// FSSE file is present — hence it creates the namespace itself and depends on nothing.
//
// Node-testable: `module.exports` = the same object as FSSE.settings (tests/settings.test.js fakes
// `chrome.storage`).

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});
  const log = (...a) => {
    if (typeof FSSE.log === "function") FSSE.log(...a);
    else if (FSSE.DEBUG && typeof console !== "undefined") console.log("[FSSE]", ...a);
  };

  const STORE = "fsse.settings";
  // The build's own DEBUG constant (inject.js sets it before this file loads in the content-script
  // world; undefined on the options page). The "debug" setting FORCES diagnostics on; switched off
  // again it restores this constant — so a dev build keeps logging whatever the setting says.
  const CODE_DEBUG = FSSE.DEBUG;

  // Regional hosts — WikiTree Sourcer's production `domain` options (read 2026-10-29); the search
  // grammar is identical on every regional site (v0.2.118 proved it for Findmypast). Values are bare
  // domains; sites.js prepends "https://www.".
  const ANCESTRY_HOSTS = [
    { value: "ancestry.com", label: "ancestry.com (United States)", group: "Regional sites" },
    { value: "ancestry.co.uk", label: "ancestry.co.uk (United Kingdom)", group: "Regional sites" },
    { value: "ancestry.ca", label: "ancestry.ca (Canada)", group: "Regional sites" },
    { value: "ancestry.com.au", label: "ancestry.com.au (Australia)", group: "Regional sites" },
    { value: "ancestry.de", label: "ancestry.de (Germany)", group: "Regional sites" },
    { value: "ancestry.fr", label: "ancestry.fr (France)", group: "Regional sites" },
    { value: "ancestry.it", label: "ancestry.it (Italy)", group: "Regional sites" },
    { value: "ancestry.se", label: "ancestry.se (Sweden)", group: "Regional sites" },
    { value: "ancestry.mx", label: "ancestry.mx (Mexico)", group: "Regional sites" },
    { value: "ancestryinstitution.com", label: "ancestryinstitution.com (FamilySearch Centers, archives)", group: "Library and FamilySearch Center editions" },
    { value: "ancestrylibrary.com", label: "ancestrylibrary.com (public libraries)", group: "Library and FamilySearch Center editions" },
  ];
  const FINDMYPAST_HOSTS = [
    { value: "findmypast.com", label: "findmypast.com (United States)" },
    { value: "findmypast.co.uk", label: "findmypast.co.uk (United Kingdom)" },
    { value: "findmypast.ie", label: "findmypast.ie (Ireland)" },
    { value: "findmypast.com.au", label: "findmypast.com.au (Australia)" },
  ];

  // The options page renders GROUPS in this order; every SCHEMA entry names one. Regional sites
  // sits last before Advanced (Kevin, 2026-10-30).
  const GROUPS = [
    { id: "menus", title: "Search Records menus", intro: "These four menus stand in for FamilySearch's own row for that site. Untick one to get the standard row back.", columns: 2 },
    { id: "extra", title: "Extra menus", intro: "Shown only when the person's places fit the site.", columns: 2 },
    { id: "pins", title: "Map pins 📍", intro: "A small \"📍 map\" link after each place; a click locates it and opens Google Maps in one reused tab." },
    { id: "dqs", title: "Quality Score" },
    { id: "temple", title: "Temple menu", intro: "For signed-in church members: four links after \"Ordinances Ready\" in the Temple menu (the fourth is a FamilySearch Labs experiment). Untick any FamilySearch starts offering itself." },
    { id: "hosts", title: "Regional sites", intro: "Select your desired regional website subscription:" },
    { id: "advanced", title: "Advanced" },
  ];

  // key / group / label / hint / default; `type: "select"` entries carry `choices` (value, label,
  // optional group for an <optgroup>). The `site.<id>` keys name FSSE.SITES ids — a test cross-checks
  // the two lists both ways, so a new site needs its entry here.
  const SCHEMA = [
    { key: "site.fs-records", group: "menus", label: "FamilySearch", hint: "Every pre-filled FamilySearch search that fits the person — censuses, indexes, full text.", default: true },
    { key: "site.ancestry-records", group: "menus", label: "Ancestry", hint: "Country searches, censuses, civil and parish sets, Public Member Trees.", default: true },
    { key: "site.mh-records", group: "menus", label: "MyHeritage", hint: "All-records searches per country, censuses, Family Trees.", default: true },
    { key: "site.fmp-records", group: "menus", label: "Findmypast", hint: "All records per country, censuses incl. 1921 and the 1939 Register, civil deaths, parish records.", default: true },
    { key: "site.freebmd", group: "extra", label: "FreeBMD", hint: "England & Wales GRO indexes, free; the form is filled and submitted for you.", default: true },
    { key: "site.gro", group: "extra", label: "GRO Index", hint: "GRO's own birth and death indexes (free login); the search is pressed for you.", default: true },
    { key: "site.scotlandspeople", group: "extra", label: "ScotlandsPeople", hint: "Statutory registers, Old Parish Registers and the censuses 1841–1921 (login).", default: true },
    { key: "site.rootsireland", group: "extra", label: "RootsIreland", hint: "County-centre and all-Ireland quick searches (free counts).", default: true },
    { key: "site.irishgenealogy", group: "extra", label: "IrishGenealogy", hint: "Ireland's free civil and church register indexes with images.", default: true },
    { key: "site.newspapers", group: "extra", label: "Newspapers", hint: "Newspapers.com, OldNews, GenealogyBank, Chronicling America, Findmypast newspapers, Trove, Papers Past.", default: true },
    { key: "host.ancestry", group: "hosts", label: "Ancestry", hint: "Every Ancestry link this extension builds uses this site.", type: "select", default: "ancestry.com", choices: ANCESTRY_HOSTS },
    { key: "host.findmypast", group: "hosts", label: "FindMyPast", hint: "Every Findmypast link this extension builds — the Newspapers menu's Findmypast entries too — uses this site.", type: "select", default: "findmypast.com", choices: FINDMYPAST_HOSTS },
    { key: "pins.person", group: "pins", label: "Person page", hint: "Details, Family Members and Other Information places.", default: true },
    { key: "pins.sources", group: "pins", label: "Sources tab", hint: "The place fields of an expanded record's indexed information.", default: true },
    { key: "pins.linker", group: "pins", label: "Source Linker", hint: "\"📍 compare\" between the record's and the tree's places, \"📍 map\" for the rest.", default: true },
    { key: "dqs.tooltip", group: "dqs", label: "Quality Score tooltip", hint: "Hovering the Low / Medium / High badge shows the number behind the word, the thresholds and the steps that would reach High (read from the page's own data).", default: true },
    { key: "site.temple-opportunities", group: "temple", label: "Temple Opportunities", hint: "Ancestors with ordinances ready to reserve, close relatives first.", default: true },
    { key: "site.family-ordinance-opportunities", group: "temple", label: "Family Ordinance Opportunities", hint: "The Blue Fan Chart of available ordinances among your ancestors' descendants.", default: true },
    { key: "site.remaining-ordinances", group: "temple", label: "Remaining Temple Ordinances", hint: "Further ordinances for people on your Completed list.", default: true },
    { key: "site.family-remaining-ordinances", group: "temple", label: "Families with Remaining Ordinances", hint: "A FamilySearch Labs experiment: families on your Completed list whose members still need ordinances. While the experiment is off, the click offers to turn it on (through FamilySearch's own Labs page) before opening it.", default: true },
    { key: "debug", group: "advanced", label: "Console diagnostics", hint: "Write the extension's [FSSE] messages to the DevTools console — for a bug report, filter the console by FSSE and paste the lines.", default: false },
  ];
  const DEFAULTS = {};
  for (const s of SCHEMA) DEFAULTS[s.key] = s.default;
  const byKey = {};
  for (const s of SCHEMA) byKey[s.key] = s;

  // Merge a stored object over the defaults: unknown keys dropped, booleans coerced, a select
  // value outside its choices → the default.
  function normalize(raw) {
    const out = Object.assign({}, DEFAULTS);
    if (!raw || typeof raw !== "object") return out;
    for (const s of SCHEMA) {
      const v = raw[s.key];
      if (v === undefined) continue;
      if (s.type === "select") {
        if (s.choices.some((c) => c.value === v)) out[s.key] = v;
      } else out[s.key] = !!v;
    }
    return out;
  }

  // ---- storage ----------------------------------------------------------------------------
  const areas = () => {
    try {
      const st = globalThis.chrome && chrome.storage;
      return st ? { sync: st.sync || null, local: st.local || null } : { sync: null, local: null };
    } catch (_) {
      return { sync: null, local: null }; // an orphaned content script throws on chrome.* access
    }
  };
  const lastError = () => {
    try {
      return (globalThis.chrome && chrome.runtime && chrome.runtime.lastError) || null;
    } catch (_) {
      return null;
    }
  };
  // The stored object, null when the area holds none, undefined when the area failed.
  function readFrom(area) {
    return new Promise((resolve) => {
      if (!area || typeof area.get !== "function") return resolve(undefined);
      try {
        area.get(STORE, (res) => {
          if (lastError()) return resolve(undefined);
          resolve(res && res[STORE] != null ? res[STORE] : null);
        });
      } catch (_) {
        resolve(undefined);
      }
    });
  }
  function readLocalStorage() {
    try {
      const raw = globalThis.localStorage && localStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }
  function writeTo(area, value) {
    return new Promise((resolve) => {
      if (!area || typeof area.set !== "function") return resolve(false);
      try {
        area.set({ [STORE]: value }, () => resolve(!lastError()));
      } catch (_) {
        resolve(false);
      }
    });
  }

  // ---- the store -------------------------------------------------------------------------
  const listeners = [];
  let resolveReady = null;
  const S = {
    STORE,
    SCHEMA,
    GROUPS,
    DEFAULTS,
    ANCESTRY_HOSTS,
    FINDMYPAST_HOSTS,
    loaded: false, // synchronous flag — the Quality Score listener can run before `ready` resolves
    values: Object.assign({}, DEFAULTS),
    _timeoutMs: 1500, // the watchdog; tests shorten it
    ready: null, // a Promise resolving to the values; ALWAYS resolves
    get: (key) => S.values[key],
    siteEnabled: (id) => S.values["site." + id] !== false, // a site with no entry stays on
    onChange(cb) {
      if (typeof cb === "function") listeners.push(cb);
    },
  };

  function applyDebug() {
    if (S.values.debug === true) FSSE.DEBUG = true;
    else if (CODE_DEBUG !== undefined) FSSE.DEBUG = CODE_DEBUG;
  }
  // Adopt a stored object (or null → defaults). Resolves `ready` the first time; notifies the
  // listeners when the values actually changed.
  function settle(raw, why) {
    const next = normalize(raw);
    const changed = JSON.stringify(next) !== JSON.stringify(S.values);
    S.values = next;
    S.loaded = true;
    applyDebug();
    if (resolveReady) {
      const r = resolveReady;
      resolveReady = null;
      r(S.values);
    } else if (changed) {
      log(`settings: ${why || "changed"} —`, JSON.stringify(diffFromDefaults(S.values)));
      for (const cb of listeners) {
        try {
          cb(S.values);
        } catch (err) {
          console.warn("[FSSE] settings listener failed", err);
        }
      }
    }
    return S.values;
  }
  const diffFromDefaults = (v) => {
    const d = {};
    for (const k of Object.keys(v)) if (v[k] !== DEFAULTS[k]) d[k] = v[k];
    return d;
  };

  // sync first; local when sync failed OR holds nothing (a save that fell back to local must be
  // found again); localStorage after that.
  async function read() {
    const { sync, local } = areas();
    let stored = await readFrom(sync);
    if (stored == null) {
      const l = await readFrom(local);
      if (l != null) stored = l;
    }
    if (stored == null) stored = readLocalStorage();
    return stored || null;
  }

  // Load with a watchdog. Returns `ready`; a late answer after the watchdog still settles.
  S.load = function load() {
    S.ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      log(`settings: storage did not answer within ${S._timeoutMs} ms — defaults in force until it does`);
      settle(null, "watchdog");
    }, S._timeoutMs);
    if (timer && typeof timer.unref === "function") timer.unref();
    read().then(
      (stored) => {
        clearTimeout(timer);
        const late = done;
        done = true;
        settle(stored, late ? "storage answered late" : "loaded");
        if (!late) log("settings loaded:", JSON.stringify(diffFromDefaults(S.values)), "(differences from the defaults)");
      },
      () => {
        clearTimeout(timer);
        if (!done) (done = true), settle(null, "read failed");
      }
    );
    return S.ready;
  };

  // Write the WHOLE normalized object (one small item): sync, then local when sync refuses, then
  // localStorage when there is no chrome.storage at all. Listeners hear about it through
  // storage.onChanged (or directly when no storage event will come).
  S.save = async function save(patch) {
    const next = normalize(Object.assign({}, S.values, patch || {}));
    const before = JSON.stringify(S.values);
    S.values = next;
    applyDebug();
    const { sync, local } = areas();
    let ok = await writeTo(sync, next);
    if (!ok) ok = await writeTo(local, next);
    if (!ok) {
      try {
        if (globalThis.localStorage) localStorage.setItem(STORE, JSON.stringify(next));
      } catch (_) {
        /* quota / disabled storage — the values hold for this page only */
      }
      if (JSON.stringify(next) !== before) for (const cb of listeners) cb(S.values);
    }
    return S.values;
  };
  S.resetDefaults = () => S.save(Object.assign({}, DEFAULTS));
  S.normalize = normalize;
  S.schemaFor = (key) => byKey[key] || null;

  // Another page (the settings page, a second FamilySearch tab) changed the stored object.
  try {
    if (globalThis.chrome && chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!changes || !changes[STORE]) return;
        if (areaName && areaName !== "sync" && areaName !== "local") return;
        settle(changes[STORE].newValue, `changed in another tab (${areaName || "storage"})`);
      });
    }
  } catch (_) {
    /* no storage events in this world */
  }

  S.load();
  FSSE.settings = S;
  if (typeof module !== "undefined" && module.exports) module.exports = S;
})();
