// settingspage.test.js — the settings page's LIVE Temple-menu check (v1.0.5, src/options.js):
// FamilySearch draws the Temple menu for church members only, so the page asks every open tab
// whether its masthead shows one and leaves its Temple group out when a signed-in FamilySearch
// tab says no (Kevin, 2026-11-12 — a community patron at a FamilySearch Center). Nothing is
// stored and no permission is added; every doubt shows the group. The verdict table, the tab
// round with a fake chrome.tabs, and the rendered page on a small fake DOM.
// Run: node tests/run.js settingspage
const fs = require("fs");
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- a fake chrome.tabs: each tab answers, rejects (no listener there) or never settles -------
// `reply`: an object → resolves with it; "none" → rejects like a tab without our script;
// "hang" → never settles; "throw" → sendMessage throws synchronously.
function fakeTabs(tabs, opts) {
  const sent = [];
  return {
    sent,
    query(q) {
      if (opts && opts.queryThrows) throw new Error("tabs unavailable");
      if (opts && opts.queryRejects) return Promise.reject(new Error("no tabs"));
      sent.push({ query: q });
      return Promise.resolve(tabs.map((t, i) => ({ id: t.id === undefined ? i + 1 : t.id })));
    },
    sendMessage(id, msg) {
      sent.push({ id, msg });
      const t = tabs.find((x, i) => (x.id === undefined ? i + 1 : x.id) === id);
      if (t.reply === "throw") throw new Error("boom");
      if (t.reply === "none") return Promise.reject(new Error("Could not establish connection. Receiving end does not exist."));
      if (t.reply === "hang") return new Promise(() => {});
      return new Promise((r) => setTimeout(() => r(t.reply), t.after || 0));
    },
  };
}

// ---- a small fake DOM for the page itself -----------------------------------------------------
function fakeDocument() {
  const node = (tag) => {
    const n = {
      tagName: String(tag).toUpperCase(), children: [], _text: "", _attrs: {}, _on: {}, className: "", hidden: false, checked: false, value: "",
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; },
      setAttribute(k, v) { this._attrs[k] = String(v); if (k === "id") this.id = String(v); },
      getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(ev, fn) { (this._on[ev] = this._on[ev] || []).push(fn); },
    };
    return n;
  };
  const byId = { ver: node("span"), groups: node("main"), status: node("span"), reset: node("button"), nostore: node("div") };
  byId.nostore.hidden = true;
  return {
    byId,
    getElementById: (id) => byId[id] || null,
    createElement: node,
    createTextNode: (t) => ({ tagName: "#text", children: [], textContent: String(t) }),
  };
}
const storageFake = () => {
  const area = { get: (keys, cb) => cb({}), set: (obj, cb) => cb && cb(), remove: (keys, cb) => cb && cb() };
  return { sync: area, local: area, onChanged: { addListener() {} } };
};
// Load a fresh copy of the page (settings.js + options.js) against the given tabs.
async function openPage(tabs, tabOpts, noTabsApi) {
  for (const f of ["settings.js", "options.js"]) delete require.cache[require.resolve(path.join(SRC, f))];
  delete globalThis.FSSE;
  const doc = fakeDocument();
  globalThis.document = doc;
  const tabsApi = fakeTabs(tabs, tabOpts);
  globalThis.chrome = { runtime: { lastError: null, getManifest: () => ({ version: "9.9.9" }) }, storage: storageFake() };
  if (!noTabsApi) globalThis.chrome.tabs = tabsApi;
  const S = require(path.join(SRC, "settings.js"));
  require(path.join(SRC, "options.js"));
  await S.ready;
  const sections = () => doc.byId.groups.children.map((sec) => ({ title: sec.children[0].textContent, hidden: sec.hidden, sec }));
  return { doc, sections, tabsApi, S };
}
const temple = (page) => page.sections().find((s) => s.title === "Temple menu");
const others = (page) => page.sections().filter((s) => s.title !== "Temple menu");

(async () => {
  globalThis.FSSE = undefined;
  const O = require(path.join(SRC, "options.js")); // no document yet: only the exports are set up
  check("options.js exports the check for tests and renders nothing without a document", typeof O.askTemple === "function" && typeof O.templeVerdict === "function" && O.TEMPLE_QUERY === "FSSE_TEMPLE_QUERY");

  // ---- the verdict table ----
  const V = O.templeVerdict;
  check("verdict: no answers → unknown", V([]) === null);
  check("verdict: only unknowns → unknown", V([null, null, undefined]) === null);
  check("verdict: one 'no Temple menu' among unknowns → false", V([null, false, null]) === false);
  check("verdict: any sighting wins over every 'no' (two tabs, one still loading its masthead)", V([false, true, false]) === true && V([true]) === true && V([null, true]) === true);
  check("verdict: only a real boolean counts (a stray string or number is no answer)", V(["true", 1, 0, "false"]) === null);

  // ---- the tab round ----
  const T = (reply, extra) => Object.assign({ reply }, extra || {});
  let tabs = fakeTabs([T("none"), T({ temple: false }), T("none")]);
  check("ask: one FamilySearch tab without a Temple menu among other sites' tabs → false", (await O.askTemple({ tabs }, 200)) === false);
  check("ask: every tab was asked the one question, by id, with nothing else in the message",
    tabs.sent.length === 4 && JSON.stringify(tabs.sent[0].query) === "{}" && tabs.sent.slice(1).every((s, i) => s.id === i + 1 && JSON.stringify(s.msg) === '{"type":"FSSE_TEMPLE_QUERY"}'), JSON.stringify(tabs.sent));
  check("ask: a member's tab → true", (await O.askTemple({ tabs: fakeTabs([T({ temple: true })]) }, 200)) === true);
  check("ask: a tab that cannot tell (signed out, loading) → unknown", (await O.askTemple({ tabs: fakeTabs([T({ temple: null }), T("none")]) }, 200)) === null);
  check("ask: no FamilySearch tab open at all → unknown", (await O.askTemple({ tabs: fakeTabs([T("none"), T("none")]) }, 200)) === null && (await O.askTemple({ tabs: fakeTabs([]) }, 200)) === null);
  check("ask: a sighting in any tab beats a 'no' in another", (await O.askTemple({ tabs: fakeTabs([T({ temple: false }), T({ temple: true })]) }, 200)) === true);
  let t0 = Date.now();
  check("ask: a sighting settles at once — a tab that never answers is not waited for",
    (await O.askTemple({ tabs: fakeTabs([T("hang"), T({ temple: true })]) }, 2000)) === true && Date.now() - t0 < 500, String(Date.now() - t0));
  t0 = Date.now();
  const hung = await O.askTemple({ tabs: fakeTabs([T("hang"), T({ temple: false })]) }, 60);
  check("ask: the watchdog — a tab that never answers cannot hold the page; what arrived decides", hung === false && Date.now() - t0 < 500, hung + " " + (Date.now() - t0));
  check("ask: nothing arrived before the watchdog → unknown", (await O.askTemple({ tabs: fakeTabs([T("hang")]) }, 40)) === null);
  check("ask: an answer after the watchdog is ignored (the promise resolved once)", (await O.askTemple({ tabs: fakeTabs([T({ temple: false }, { after: 120 })]) }, 30)) === null);
  check("ask: a malformed answer is no answer", (await O.askTemple({ tabs: fakeTabs([T("yes"), T({}), T({ temple: "no" }), T(undefined)]) }, 200)) === null);
  check("ask: sendMessage throwing for one tab does not lose the others", (await O.askTemple({ tabs: fakeTabs([T("throw"), T({ temple: false })]) }, 200)) === false);
  check("ask: no tabs API (a test page, another browser) → unknown, at once",
    (await O.askTemple(null, 5000)) === null && (await O.askTemple({}, 5000)) === null && (await O.askTemple({ tabs: { query() {} } }, 5000)) === null);
  check("ask: tabs.query throwing or rejecting → unknown", (await O.askTemple({ tabs: fakeTabs([], { queryThrows: true }) }, 200)) === null && (await O.askTemple({ tabs: fakeTabs([], { queryRejects: true }) }, 200)) === null);
  check("ask: a tab without an id is skipped", (await O.askTemple({ tabs: { query: () => Promise.resolve([{}, null, { id: 7 }]), sendMessage: (id) => Promise.resolve({ temple: id === 7 ? false : true }) } }, 200)) === false);

  // ---- the rendered page ----
  let page = await openPage([T({ temple: false })]);
  await wait(20);
  check("page: a signed-in FamilySearch tab without a Temple menu → the Temple group is left out", temple(page) && temple(page).hidden === true, JSON.stringify(page.sections().map((s) => [s.title, s.hidden])));
  check("page: … and only that group — every other group is shown, in the usual order",
    others(page).length === 7 && others(page).every((s) => !s.hidden) && page.sections().map((s) => s.title).join("|") === "Search Records menus|Extra menus|FamilySearch Center menus|Map pins 📍|Quality Score|Temple menu|Regional sites|Advanced",
    page.sections().map((s) => s.title).join("|"));
  check("page: nothing takes the group's place (no note, no link) and its switches stay in the page for Restore defaults",
    page.doc.byId.groups.children.length === 8 && temple(page).sec.children.length === 3 && temple(page).sec.children[2].children.length === 4);
  check("page: the version shows; the storage warning stays hidden", page.doc.byId.ver.textContent === "v9.9.9" && page.doc.byId.nostore.hidden === true);

  page = await openPage([T({ temple: true })]);
  await wait(20);
  check("page: a member's tab → the Temple group is shown", temple(page).hidden === false && others(page).every((s) => !s.hidden));
  page = await openPage([T("none"), T("none")]);
  await wait(20);
  check("page: no FamilySearch tab open → the Temple group is shown (as before 1.0.5)", temple(page).hidden === false);
  page = await openPage([T({ temple: null })]);
  await wait(20);
  check("page: a signed-out FamilySearch tab → shown", temple(page).hidden === false);
  page = await openPage([], null, true);
  await wait(20);
  check("page: no tabs API → shown", temple(page).hidden === false);
  page = await openPage([T({ temple: false }), T({ temple: true })]);
  await wait(20);
  check("page: two FamilySearch tabs, one sighting → shown", temple(page).hidden === false);
  page = await openPage([T({ temple: true }, { after: 80 })]);
  const early = temple(page).hidden;
  await wait(140);
  check("page: until the answer is in, the group is held back — a patron never sees it flash — then it appears", early === true && temple(page).hidden === false);
  page = await openPage([T("hang")]);
  const before = temple(page).hidden;
  await wait(520);
  check("page: a tab that never answers delays the group by the watchdog at most, then it shows", before === true && temple(page).hidden === false);

  // ---- nothing stored, nothing new asked of Chrome ----
  const src = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "..", "manifest.json"), "utf8"));
  check("manifest: still one permission (storage) — the check needs none, and no host permissions", JSON.stringify(manifest.permissions) === '["storage"]' && !manifest.host_permissions && !manifest.optional_permissions);
  const opt = src("options.js");
  const askBody = opt.slice(opt.indexOf("function askTemple"), opt.indexOf("if (typeof module"));
  check("options.js: the check writes nothing — no storage call inside it, and the verdict lives in a variable only", askBody.length > 200 && !/storage|localStorage|sessionStorage/.test(askBody) && !/S\.save\([^)]*temple/i.test(opt));
  const inj = src("inject.js");
  const stateBody = inj.slice(inj.indexOf("FSSE.templeMenuState = "), inj.indexOf("FSSE.findTempleSection = "));
  check("inject.js: the page-side answer is computed on demand and never saved", stateBody.length > 500 && !/storage|localStorage|sessionStorage|fetch\(/.test(stateBody));
  check("no stored key for it anywhere in src", fs.readdirSync(SRC).filter((f) => f.endsWith(".js")).every((f) => !/["'`]fsse\.(temple|member)/.test(src(f))));
  check("content.js wires the answer to chrome.runtime.onMessage", /onMessage\.addListener\(\(msg, sender, sendResponse\) => \{\s*const answer = FSSE\.answerTempleQuery\(msg\);\s*if \(answer\) sendResponse\(answer\);/.test(src("content.js")));

  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
