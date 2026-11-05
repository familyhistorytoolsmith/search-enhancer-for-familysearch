// release.test.js — the v1.0.0 store-build shape: the load-time asset-URL cache and the one-line
// orphaned-tab notice (inject.js), no fetch of our own in the scraper (the Tree API fallback is
// gone), the bounded per-person source cache (sources.js), and the manifest's store limits.
// Run: node tests/run.js release
const fs = require("fs");
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
// Load a src file afresh under the current globals (each section sets its own chrome fake).
const fresh = (file, fsse) => {
  const p = path.join(SRC, file);
  delete require.cache[require.resolve(p)];
  delete globalThis.FSSE;
  if (fsse) globalThis.FSSE = fsse;
  require(p);
  return globalThis.FSSE;
};
const warns = [];
const realWarn = console.warn;
console.warn = (...a) => warns.push(a.join(" "));

// ---- 1. inject.js under a live runtime: every icon resolved once at load, then cached ----------
let calls = [];
let alive = true;
globalThis.chrome = {
  runtime: {
    get id() { return alive ? "abcdefghijklmnop" : undefined; },
    getURL(p) {
      if (!alive) throw new Error("Extension context invalidated.");
      calls.push(p);
      return "chrome-extension://abcdefghijklmnop/" + p;
    },
    getManifest() { return { version: "1.0.0" }; },
  },
};
let FSSE = fresh("inject.js");
check("inject.js: FSSE.DEBUG is false (release build)", FSSE.DEBUG === false);
check("assetUrl: the ten icon files are resolved once at load", FSSE._assetUrls.size === 10 && calls.length === 10, `${FSSE._assetUrls.size} cached, ${calls.length} runtime calls`);
check("assetUrl: every shipped icon is among them", ["icon16", "icon32", "icon48", "icon128", "freebmd32", "gro32", "sp32", "news32", "ri32", "ig32"].every((n) => FSSE._assetUrls.has(`icons/${n}.png`)));
let before = calls.length;
check("assetUrl: a cached path costs no runtime call", FSSE.assetUrl("icons/gro32.png") === "chrome-extension://abcdefghijklmnop/icons/gro32.png" && calls.length === before);
check("assetUrl: a new path resolves live and is cached", FSSE.assetUrl("src/map.html") === "chrome-extension://abcdefghijklmnop/src/map.html" && calls.length === before + 1 && FSSE._assetUrls.has("src/map.html"));
check("contextAlive: true with a live runtime", FSSE.contextAlive() === true);
check("version(): read from the manifest", FSSE.version() === "1.0.0");
check("no notice while the context is alive", warns.length === 0);

// ---- 2. the same tab after an update / reload orphaned it -------------------------------------
alive = false;
before = calls.length;
check("orphaned: a cached icon URL still comes back, no runtime call", FSSE.assetUrl("icons/freebmd32.png") === "chrome-extension://abcdefghijklmnop/icons/freebmd32.png" && calls.length === before);
check("orphaned: contextAlive is false", FSSE.contextAlive() === false);
check("orphaned: still no notice (nothing has failed yet)", warns.length === 0);
const miss = FSSE.assetUrl("icons/never-seen.png");
check("orphaned: an uncached asset → null and ONE notice naming the asset", miss === null && warns.length === 1 && /updated or reloaded/.test(warns[0]) && /refresh the page/.test(warns[0]) && /icons\/never-seen\.png/.test(warns[0]), warns.join(" | "));
FSSE.assetUrl("icons/another.png");
FSSE.orphaned("page tick");
FSSE.orphaned("page tick");
check("orphaned: later misses and ticks add no second line", warns.length === 1 && FSSE._orphaned === true, `${warns.length} line(s)`);
check("orphaned(): returns true (so callers can `return FSSE.orphaned(...)`)", FSSE.orphaned("x") === true);

// ---- 3. no runtime at all (node, every other suite): inert, silent ----------------------------
delete globalThis.chrome;
warns.length = 0;
FSSE = fresh("inject.js");
check("no chrome: nothing cached at load, assetUrl null, contextAlive true, no notice", FSSE._assetUrls.size === 0 && FSSE.assetUrl("icons/gro32.png") === null && FSSE.contextAlive() === true && warns.length === 0);
check("no chrome: version() answers ?", FSSE.version() === "?");

// ---- 4. the scraper makes no request of its own ------------------------------------------------
const fsjs = fs.readFileSync(path.join(SRC, "familysearch.js"), "utf8");
check("familysearch.js: no fetch( and no fetchPerson (the Tree API fallback is gone)", !/\bfetch\s*\(/.test(fsjs) && !/fetchPerson/.test(fsjs));
const fetchers = fs.readdirSync(SRC).filter((f) => f.endsWith(".js") && /\bfetch\s*\(/.test(fs.readFileSync(path.join(SRC, f), "utf8")));
const allowed = new Set(["linker.js", "dqs-listen.js"]); // Nominatim on a map click; the page-world wrapper of the PAGE's fetch
check("the only src files that call fetch are linker.js (on a click) and dqs-listen.js (wrapping the page's)", fetchers.every((f) => allowed.has(f)), fetchers.join(", "));
const inject = fs.readFileSync(path.join(SRC, "inject.js"), "utf8");
check("inject.js: chrome.runtime.getURL is called only inside assetUrl (never at row-clone time)", (inject.match(/chrome\.runtime\.getURL\(/g) || []).length === 1 && /img\.src = iconSrc/.test(inject));

// ---- 5. sources.js: the per-person cache is bounded ----------------------------------------------
const store = {};
const removed = [];
globalThis.chrome = {
  runtime: { id: "abc", getURL: (p) => "x/" + p, getManifest: () => ({ version: "1.0.0" }) },
  storage: {
    local: {
      get(k, cb) { cb(k === null ? { ...store } : k in store ? { [k]: store[k] } : {}); },
      set(obj, cb) { Object.assign(store, obj); if (cb) cb(); },
      remove(keys, cb) { for (const k of [].concat(keys)) { delete store[k]; removed.push(k); } if (cb) cb(); },
    },
  },
};
globalThis.location = { pathname: "/en/tree/person/sources/NEW0-001", origin: "https://www.familysearch.org" };
FSSE = fresh("sources.js", { log() {}, DEBUG: false, deepElements: () => [], getFsid: () => "NEW0-001" });
const MAX = FSSE._SOURCES_CACHE_MAX;
check("sources.js: the cap is 200 people", MAX === 200, String(MAX));
for (let i = 0; i < MAX + 5; i++) store[`fsse.sources.P${String(i).padStart(3, "0")}`] = { pid: `P${i}`, titles: [], count: 0, scrapedAt: 1000 + i };
store["fsse.settings"] = { "site.gro": false };
store["fsse.mapsKey"] = "key";
(async () => {
  const rec = await FSSE.saveSources("NEW0-001", { titles: [{ title: "t" }], count: 1 });
  const cacheKeys = Object.keys(store).filter((k) => k.startsWith("fsse.sources."));
  check("saveSources: the new person is written and resolved", rec && rec.pid === "NEW0-001" && store["fsse.sources.NEW0-001"] && store["fsse.sources.NEW0-001"].titles.length === 1);
  check("prune: the cache holds exactly the cap after the save", cacheKeys.length === MAX, `${cacheKeys.length} keys`);
  check("prune: the 6 OLDEST entries went (P000–P005), the person just saved never does", removed.length === 6 && removed.every((k) => /P00[0-5]$/.test(k)) && store["fsse.sources.P006"] && store["fsse.sources.NEW0-001"], removed.join(", "));
  check("prune: other keys (settings, map key) untouched", store["fsse.settings"] && store["fsse.mapsKey"] === "key");
  removed.length = 0;
  await FSSE.saveSources("NEW0-001", { titles: [{ title: "t" }, { title: "u" }], count: 2 });
  check("prune: at the cap, re-saving the same person removes nothing", removed.length === 0 && Object.keys(store).filter((k) => k.startsWith("fsse.sources.")).length === MAX);
  await FSSE.saveSources("NEW0-002", { titles: [], count: 0 });
  check("prune: one more person → exactly one oldest entry goes", removed.length === 1 && removed[0] === "fsse.sources.P006", removed.join(", "));
  // storage that throws (an orphaned context) must not break the save
  globalThis.chrome.storage.local.get = () => { throw new Error("Extension context invalidated."); };
  let threw = false;
  try { await FSSE.saveSources("NEW0-003", { titles: [], count: 0 }); } catch (_) { threw = true; }
  check("prune: a throwing storage.get is swallowed (the save itself still resolves)", !threw && store["fsse.sources.NEW0-003"]);

  // ---- 6. the manifest's store limits -----------------------------------------------------------
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  check("manifest: minimum_chrome_version ≥ 111 (world: MAIN content scripts)", parseInt(manifest.minimum_chrome_version, 10) >= 111, manifest.minimum_chrome_version);
  check("manifest: name within the store's 45 characters", manifest.name.length <= 45, `${manifest.name.length}`);
  check("manifest: description within the 132-character limit", manifest.description.length <= 132, `${manifest.description.length}`);
  check("manifest: description opens with the Unofficial word", /^Unofficial\b/.test(manifest.description));
  check("manifest: the only permission is storage", JSON.stringify(manifest.permissions) === '["storage"]' && !manifest.host_permissions);
  check("manifest: version is three dotted integers", /^\d+\.\d+\.\d+$/.test(manifest.version), manifest.version);

  console.warn = realWarn;
  console.log(fails ? `\n${fails} FAILED` : "\nrelease OK");
  process.exit(fails ? 1 : 0);
})();
