// settings.test.js — the user settings store (v0.2.133, src/settings.js): the schema against the
// site registry, defaults and merging, the sync → local → localStorage → defaults fallbacks, the
// watchdog, saving, storage.onChanged from another tab, the debug override. chrome.storage is a
// plain callback-API fake (the first storage fake in the suite). Run: node tests/run.js settings
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const tick = () => new Promise((r) => setTimeout(r, 5));

// ---- a fake chrome: callback storage areas with get/set/remove, onChanged, runtime.lastError ----
function fakeChrome(seedSync, seedLocal) {
  const listeners = [];
  const runtime = { lastError: null, getManifest: () => ({ version: "0.0.0-test" }) };
  const area = (name, data) => {
    const a = {
      name, data, failWith: null, throws: false, hang: false, pending: [], writes: 0,
      get(keys, cb) {
        if (a.throws) throw new Error("no " + name);
        const out = {};
        for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
        const fire = () => { runtime.lastError = a.failWith ? { message: a.failWith } : null; cb(out); runtime.lastError = null; };
        if (a.hang) a.pending.push(fire);
        else fire();
      },
      set(obj, cb) {
        if (a.throws) throw new Error("no " + name);
        a.writes++;
        const changes = {};
        if (!a.failWith) for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = v; }
        runtime.lastError = a.failWith ? { message: a.failWith } : null;
        if (cb) cb();
        runtime.lastError = null;
        if (!a.failWith) for (const fn of listeners) fn(changes, name);
      },
      remove(keys, cb) { for (const k of [].concat(keys)) delete data[k]; if (cb) cb(); },
    };
    return a;
  };
  const sync = area("sync", Object.assign({}, seedSync || {}));
  const local = area("local", Object.assign({}, seedLocal || {}));
  return { runtime, storage: { sync, local, onChanged: { addListener: (fn) => listeners.push(fn) } }, _listeners: listeners };
}

(async () => {
  // A dev build: inject.js would have set DEBUG true before settings.js loads.
  globalThis.FSSE = { DEBUG: true, log() {}, deepElements: () => [] };
  globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
  globalThis.chrome = fakeChrome({ "fsse.settings": { "site.gro": false, "host.ancestry": "ancestry.co.uk", "pins.linker": 0, junk: 1, "host.findmypast": "example.org" } });
  const S = require(path.join(SRC, "settings.js"));
  check("module.exports is FSSE.settings", S === FSSE.settings && typeof S.get === "function");
  check("not loaded synchronously at require time (storage answers in a microtask)", S.loaded === false && S.get("site.gro") === true);
  const v = await S.ready;
  check("ready resolves to the values; loaded flips", S.loaded === true && v === S.values);
  check("stored values merged over the defaults: site.gro off, host.ancestry .co.uk", S.get("site.gro") === false && S.get("host.ancestry") === "ancestry.co.uk" && S.siteEnabled("gro") === false);
  check("a 0 is coerced to false; an unknown key is dropped; a select value outside its choices → the default", S.get("pins.linker") === false && S.get("junk") === undefined && S.get("host.findmypast") === "findmypast.com");
  check("every other switch keeps its default", S.get("site.fs-records") === true && S.get("pins.person") === true && S.get("dqs.tooltip") === true && S.get("debug") === false);
  check("siteEnabled: an id with no schema entry stays on", S.siteEnabled("some-future-site") === true && S.siteEnabled("mh-records") === true);
  check("the debug switch off leaves a dev build's DEBUG alone", FSSE.DEBUG === true);

  // ---- schema ⇔ the site registry ----
  require(path.join(SRC, "sources.js"));
  require(path.join(SRC, "fs-collections.js"));
  require(path.join(SRC, "sites.js"));
  const siteKeys = S.SCHEMA.filter((s) => s.key.startsWith("site.")).map((s) => s.key.slice(5));
  const ids = FSSE.SITES.map((s) => s.id);
  check("every FSSE.SITES id has a site.<id> setting", ids.every((id) => siteKeys.includes(id)), ids.filter((id) => !siteKeys.includes(id)).join(", "));
  check("every site.<id> setting names a real site", siteKeys.every((id) => ids.includes(id)), siteKeys.filter((id) => !ids.includes(id)).join(", "));
  check("each site setting's label is the site's own label", S.SCHEMA.filter((s) => s.key.startsWith("site.")).every((s) => FSSE.SITES.find((x) => x.id === s.key.slice(5)).label === s.label));
  check("the four replacing menus sit in the 'menus' group, the temple rows in 'temple'", ["fs-records", "ancestry-records", "mh-records", "fmp-records"].every((id) => S.schemaFor("site." + id).group === "menus") && FSSE.SITES.filter((s) => s.section === "temple").every((s) => S.schemaFor("site." + s.id).group === "temple"));
  check("every schema entry belongs to a listed group; every key is unique", S.SCHEMA.every((s) => S.GROUPS.some((g) => g.id === s.group)) && new Set(S.SCHEMA.map((s) => s.key)).size === S.SCHEMA.length);
  check("defaults: every boolean on except debug; both hosts .com and within their choices", S.SCHEMA.every((s) => (s.type === "select" ? s.choices.some((c) => c.value === s.default) : s.default === (s.key !== "debug"))) && S.DEFAULTS["host.ancestry"] === "ancestry.com" && S.DEFAULTS["host.findmypast"] === "findmypast.com");
  check("the regional lists (Sourcer's domain options): 9 Ancestry sites + 2 library editions, 4 Findmypast sites", S.ANCESTRY_HOSTS.length === 11 && S.ANCESTRY_HOSTS.filter((c) => c.group === "Regional sites").length === 9 && S.FINDMYPAST_HOSTS.map((c) => c.value).join(",") === "findmypast.com,findmypast.co.uk,findmypast.ie,findmypast.com.au");
  check("v0.2.134: Regional sites is the last group before Advanced, which is last (Kevin, 2026-10-30)",
    S.GROUPS[S.GROUPS.length - 1].id === "advanced" && S.GROUPS[S.GROUPS.length - 2].id === "hosts", S.GROUPS.map((g) => g.id).join(" > "));
  check("v0.2.136: Regional sites reads the asked wording - the intro and the two bare labels", S.GROUPS.find((g) => g.id === "hosts").intro === "Select your desired regional website subscription:" && S.schemaFor("host.ancestry").label === "Ancestry" && S.schemaFor("host.findmypast").label === "FindMyPast");
  check("v0.2.134: the options page carries no Google Maps key field", !/mapsKey|mapskey/.test(require("fs").readFileSync(path.join(SRC, "options.js"), "utf8")));
  check("v0.2.135: no in-page settings line - no site carries settingsLink, inject.js holds no settingsDiv / SETTINGS_PAGE, options.html is not web-accessible", FSSE.SITES.every((s) => !s.settingsLink) && !/settingsDiv|SETTINGS_PAGE|fsse-settings/.test(require("fs").readFileSync(path.join(SRC, "inject.js"), "utf8")) && !(require(path.join(SRC, "..", "manifest.json")).web_accessible_resources || []).some((w) => w.resources.includes("src/options.html")));
  check("the pins and the tooltip and the hosts are settings too", ["pins.person", "pins.sources", "pins.linker", "dqs.tooltip", "host.ancestry", "host.findmypast", "debug"].every((k) => S.schemaFor(k)));
  check("sites.js reads the hosts from the store", FSSE.ancestryHost() === "https://www.ancestry.co.uk" && FSSE.findmypastHost() === "https://www.findmypast.com");

  // ---- save: the whole normalized object to sync; our own echo changes nothing; others hear ----
  const heard = [];
  S.onChange((vals) => heard.push(JSON.stringify(vals)));
  const syncArea = chrome.storage.sync;
  await S.save({ "site.gro": true, "host.findmypast": "findmypast.ie", debug: true });
  const stored = syncArea.data["fsse.settings"];
  check("save writes the full normalized object to sync", syncArea.writes === 1 && stored && stored["site.gro"] === true && stored["host.findmypast"] === "findmypast.ie" && stored["host.ancestry"] === "ancestry.co.uk" && Object.keys(stored).length === S.SCHEMA.length);
  check("save applies at once; our own storage echo fires no listener", S.get("site.gro") === true && S.get("host.findmypast") === "findmypast.ie" && heard.length === 0);
  check("debug on forces FSSE.DEBUG on", FSSE.DEBUG === true);
  FSSE.DEBUG = false; // pretend a release build…
  await S.save({ debug: false });
  check("…debug off restores the build's constant (true here — captured when settings.js loaded)", FSSE.DEBUG === true);
  // another tab writes
  syncArea.set({ "fsse.settings": Object.assign({}, S.values, { "site.mh-records": false, "pins.sources": false }) });
  check("a change written by another tab lands via storage.onChanged and the listeners hear it once", heard.length === 1 && S.get("site.mh-records") === false && S.get("pins.sources") === false && S.siteEnabled("mh-records") === false);
  syncArea.set({ "fsse.sources.X": { pid: "X" } });
  check("a change to another key is ignored", heard.length === 1);
  for (const fn of chrome._listeners) fn({ "fsse.settings": { newValue: { "site.gro": false } } }, "managed");
  check("a change in an unknown storage area is ignored", heard.length === 1 && S.get("site.gro") === true);
  for (const fn of chrome._listeners) fn({ "fsse.settings": { newValue: undefined } }, "sync");
  check("the object removed in another tab → defaults, listeners told", heard.length === 2 && S.get("site.mh-records") === true && S.get("host.ancestry") === "ancestry.com");
  await S.resetDefaults();
  check("resetDefaults writes the defaults", JSON.stringify(syncArea.data["fsse.settings"]) === JSON.stringify(S.DEFAULTS) && JSON.stringify(S.values) === JSON.stringify(S.DEFAULTS));

  // ---- fallbacks ----
  globalThis.chrome = fakeChrome(null, { "fsse.settings": { "site.freebmd": false } });
  await S.load();
  check("sync holds nothing → local is read", S.get("site.freebmd") === false);
  globalThis.chrome = fakeChrome({ "fsse.settings": { "site.freebmd": false } }, { "fsse.settings": { "site.freebmd": true, "site.gro": false } });
  await S.load();
  check("sync holds a value → it wins over local", S.get("site.freebmd") === false && S.get("site.gro") === true);
  globalThis.chrome = fakeChrome(null, { "fsse.settings": { "pins.linker": false } });
  chrome.storage.sync.throws = true;
  await S.load();
  check("sync throws (an orphaned content script) → local", S.get("pins.linker") === false);
  globalThis.chrome = fakeChrome({ "fsse.settings": { "pins.linker": false } }, { "fsse.settings": { "pins.person": false } });
  chrome.storage.sync.failWith = "quota";
  await S.load();
  check("sync answers with runtime.lastError → local", S.get("pins.linker") === true && S.get("pins.person") === false);
  globalThis.chrome = fakeChrome();
  chrome.storage.sync.failWith = "no sync for you";
  await S.save({ "site.newspapers": false });
  check("save: sync refuses → written to local", chrome.storage.local.data["fsse.settings"]["site.newspapers"] === false && !chrome.storage.sync.data["fsse.settings"]);
  await S.load();
  check("…and the next load finds it there", S.get("site.newspapers") === false);
  delete globalThis.chrome;
  globalThis.localStorage = { store: { "fsse.settings": JSON.stringify({ "dqs.tooltip": false }) }, getItem(k) { return this.store[k] == null ? null : this.store[k]; }, setItem(k, v) { this.store[k] = String(v); } };
  await S.load();
  check("no chrome.storage at all → localStorage", S.get("dqs.tooltip") === false && S.loaded === true);
  heard.length = 0;
  await S.save({ "dqs.tooltip": true });
  check("save without chrome.storage → localStorage, listeners told directly", JSON.parse(localStorage.store["fsse.settings"])["dqs.tooltip"] === true && heard.length === 1);
  delete globalThis.localStorage;
  await S.load();
  check("nothing anywhere → the defaults, loaded all the same", JSON.stringify(S.values) === JSON.stringify(S.DEFAULTS) && S.loaded === true);

  // ---- the watchdog ----
  globalThis.chrome = fakeChrome({ "fsse.settings": { "site.gro": false } });
  chrome.storage.sync.hang = true;
  S._timeoutMs = 20;
  const t0 = Date.now();
  await S.load();
  check("storage never answers → the watchdog resolves ready with the defaults", Date.now() - t0 < 500 && S.loaded === true && S.get("site.gro") === true);
  heard.length = 0;
  for (const fire of chrome.storage.sync.pending) fire();
  await tick();
  check("a late answer still lands, and the listeners hear it", S.get("site.gro") === false && heard.length === 1);
  S._timeoutMs = 1500;
  chrome.storage.sync.hang = false;

  // ---- normalize alone ----
  check("normalize: null / junk → defaults; a valid select kept; booleans coerced", JSON.stringify(S.normalize(null)) === JSON.stringify(S.DEFAULTS) && JSON.stringify(S.normalize("x")) === JSON.stringify(S.DEFAULTS) && S.normalize({ "host.ancestry": "ancestry.de", "site.gro": "" })["host.ancestry"] === "ancestry.de" && S.normalize({ "site.gro": "" })["site.gro"] === false);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log("FAIL  suite crashed\n      → " + ((e && e.stack) || e));
  process.exit(1);
});
