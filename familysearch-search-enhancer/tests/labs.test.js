// labs.test.js — FamilySearch Labs experiments (v1.0.2):
//   (1) the page-world capture of the user's "fslabs.labs" preference in src/dqs-listen.js —
//       the batch GET, the single GET, a PUT read from its request body, the late ping; the
//       Quality Score path untouched;
//   (2) the isolated FSSE.labs store in src/labs.js — the storage cache, another tab's fresher
//       write, the message guards, the experiment URLs byte-exact (Kevin's "Try It" link,
//       2026-11-04), and the not-found banner on a fake experiment page;
//   (3) the Temple row in sites.js — URL, confirm question and tooltip per state.
// Run: node tests/run.js labs
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const wait = () => new Promise((r) => setTimeout(r, 5));
const J = (x) => JSON.stringify(x);

const ID = "MX7KPMRHCN1ACK3DZ6AGT";
const ORIGIN = "https://www.familysearch.org";
const PREFS = ORIGIN + "/service/cmn/user-preferences/users/cis.user.MMMM-XXXX/preferences";
const BATCH = PREFS + "?name=fslabs.labs&name=softLaunch.treeWeb_personR9_sourceCentricDetails&name=tree.cetTest";
const SINGLE = PREFS + "/fslabs.labs";
const OTHER = PREFS + "?name=tree.cetTest&name=tree.nameTemplate";
const SCORES_URL = ORIGIN + "/service/tree/tree-data/quality/person/GJJ3-YGN/scores?treeId=PRIVATE";
const PAGE_URL = ORIGIN + "/en/temple/family-remaining-ordinances";
const OPT_IN_URL = ORIGIN + "/en/labs/on/MX7KPMRHCN1ACK3DZ6AGT?redirectUrl=%2Fen%2Ftemple%2Ffamily-remaining-ordinances";
const batchBody = (ids) => J({ "fslabs.labs": { value: ids }, "tree.cetTest": { value: "x" } });

// =========================================================================================
// 1. The page-world listener (src/dqs-listen.js)
// =========================================================================================
const listen = require(path.join(SRC, "dqs-listen.js"));
check("isLabsUrl: the batch GET naming fslabs.labs, the single-preference path, an encoded name", listen.isLabsUrl(BATCH) && listen.isLabsUrl(SINGLE) && listen.isLabsUrl(PREFS + "?name=fslabs%2Elabs"));
check("isLabsUrl: other preferences, another single preference, the scores URL, junk → false", !listen.isLabsUrl(OTHER) && !listen.isLabsUrl(PREFS + "/tree.cetTest") && !listen.isLabsUrl(SCORES_URL) && !listen.isLabsUrl("") && !listen.isLabsUrl(null));
check("labsOf: the batch shape → the array, strings only", J(listen.labsOf(batchBody([ID, 7, "A", null]))) === J([ID, "A"]));
check("labsOf: the key present with a non-array value → [] (FamilySearch's own reading: none on)", J(listen.labsOf(J({ "fslabs.labs": { value: null } }))) === "[]" && J(listen.labsOf(J({ "fslabs.labs": "" }))) === "[]" && J(listen.labsOf(J({ value: "" }))) === "[]");
check("labsOf: a batch without the key says nothing → null", listen.labsOf(J({ "tree.cetTest": { value: "x" } })) === null);
check("labsOf: the single shape {value:[…]}, and a bare array", J(listen.labsOf(J({ value: ["A"] }))) === '["A"]' && J(listen.labsOf('["B"]')) === '["B"]');
check("labsOf: an empty / non-JSON response falls back to the PUT's request body", J(listen.labsOf("", J({ value: [ID] }))) === J([ID]) && listen.labsOf("", "nope") === null && listen.labsOf("not json") === null && listen.labsOf(J({ value: [ID] }), "ignored") !== null);

function fakeWindow(bodyFor) {
  const win = { posted: [], listeners: {}, location: { origin: ORIGIN } };
  win.postMessage = (msg, origin) => win.posted.push({ msg, origin });
  win.addEventListener = (t, fn) => (win.listeners[t] = win.listeners[t] || []).push(fn);
  win.dispatch = (t, e) => (win.listeners[t] || []).forEach((fn) => fn(e));
  win.fetchCalls = [];
  win.fetch = function (input, init) {
    win.fetchCalls.push({ input, init });
    const body = bodyFor(typeof input === "string" ? input : input.url);
    const res = { ok: true, status: 200, cloned: 0, clone() { this.cloned++; return this; }, text: () => Promise.resolve(body) };
    return Promise.resolve(res);
  };
  function XHR() { this._l = {}; }
  XHR.prototype.open = function (m, u) { this.opened = [m, u]; };
  XHR.prototype.send = function (b) { this.sentBody = b; };
  XHR.prototype.addEventListener = function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); };
  XHR.prototype.fire = function (t) { (this._l[t] || []).forEach((fn) => fn.call(this)); };
  win.XMLHttpRequest = XHR;
  return win;
}

(async () => {
  const bodies = { [BATCH]: batchBody([ID]), [SINGLE]: J({ value: ["A"] }), [OTHER]: J({ "tree.cetTest": { value: "x" } }), [SCORES_URL]: J({ isValid: true, personScores: { overallDisplayScore: 0.5, issues: [] } }) };
  const win = fakeWindow((u) => bodies[u] || "{}");
  const inst = listen.install(win);
  const last = () => win.posted[win.posted.length - 1];
  const r1 = await win.fetch(BATCH);
  await wait();
  check("the page's batch preferences GET → one FSSE_LABS message with the ids, read from a clone", win.posted.length === 1 && last().msg.source === "fsse-dqs-page" && last().msg.type === "FSSE_LABS" && J(last().msg.labs) === J([ID]) && last().origin === ORIGIN && r1.cloned === 1);
  check("the array is kept for the ping", J(inst.labs()) === J([ID]));
  await win.fetch(OTHER);
  await wait();
  check("a preferences GET for other names posts nothing", win.posted.length === 1);
  await win.fetch(SINGLE);
  await wait();
  check("the single-preference GET → the new array", win.posted.length === 2 && J(last().msg.labs) === '["A"]');
  const x = new win.XMLHttpRequest();
  x.open("PUT", SINGLE);
  x.send(J({ value: [ID, "A"] }));
  x.status = 200;
  x.responseType = "";
  x.responseText = "";
  x.fire("load");
  await wait();
  check("a PUT whose response carries no body is read from its request body (XHR — what FamilySearch's axios uses)", win.posted.length === 3 && J(last().msg.labs) === J([ID, "A"]) && x.sentBody === J({ value: [ID, "A"] }));
  await win.fetch(SINGLE, { method: "PUT", body: J({ value: [] }) });
  await wait();
  check("a PUT via fetch: the response body wins when it carries the value", win.posted.length === 4 && J(last().msg.labs) === '["A"]');
  win.posted.length = 0;
  win.dispatch("message", { source: win, data: { source: "fsse-dqs", type: "FSSE_LABS_REQUEST" } });
  check("a FSSE_LABS_REQUEST ping re-posts the last array", win.posted.length === 1 && win.posted[0].msg.type === "FSSE_LABS" && J(win.posted[0].msg.labs) === '["A"]');
  win.posted.length = 0;
  win.dispatch("message", { source: {}, data: { source: "fsse-dqs", type: "FSSE_LABS_REQUEST" } });
  win.dispatch("message", { source: win, data: { source: "other", type: "FSSE_LABS_REQUEST" } });
  check("a ping from a foreign source, or not ours, posts nothing", win.posted.length === 0);
  await win.fetch(SCORES_URL);
  await wait();
  check("the Quality Score path is untouched (an FSSE_DQS message for the PID)", win.posted.length === 1 && win.posted[0].msg.type === "FSSE_DQS" && win.posted[0].msg.pid === "GJJ3-YGN");
  const win2 = fakeWindow(() => "{}");
  listen.install(win2);
  win2.dispatch("message", { source: win2, data: { source: "fsse-dqs", type: "FSSE_LABS_REQUEST" } });
  check("before any preference response a ping posts nothing", win2.posted.length === 0);

  // =======================================================================================
  // 2. FSSE.labs (src/labs.js) on a fake environment
  // =======================================================================================
  class El {
    constructor(tag, text, attrs) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = Object.assign({}, attrs || {});
      this.parent = null;
      this._text = text || "";
      this.style = {};
      this.listeners = {};
    }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
    set textContent(t) { this._text = String(t); this.children = []; }
    appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parent = null; }
    remove() { if (this.parent) this.parent.removeChild(this); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    click() { (this.listeners.click || []).forEach((fn) => fn({})); }
    all() { const out = []; const walk = (e) => { for (const c of e.children) { out.push(c); walk(c); } }; walk(this); return out; }
    querySelectorAll(sel) {
      const m = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(sel);
      return this.all().filter((e) => m && e.getAttribute(m[1]) != null && (m[2] == null || e.getAttribute(m[1]) === m[2]));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const body = new El("body");
  const doc = {
    body, documentElement: body,
    querySelector: (s) => body.querySelector(s), querySelectorAll: (s) => body.querySelectorAll(s),
    createElement: (t) => new El(t), createTextNode: (t) => new El("#text", t),
  };
  globalThis.document = doc;
  globalThis.FSSE = {
    log() {},
    deepElements: (root) => (root && root.all ? root : body).all(),
    findSmallestWithText(els, text) {
      for (const el of els) {
        if (el.textContent.trim() !== text) continue;
        if (!el.children.some((c) => c.textContent.trim() === text)) return el;
      }
      return null;
    },
  };
  globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: ORIGIN, assigned: [], assign(u) { this.assigned.push(u); } };
  const storeListeners = [];
  const localData = { "fsse.labs": { ids: ["OLD"], at: 5 } };
  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        data: localData, writes: 0,
        get(keys, cb) { const out = {}; for (const k of [].concat(keys)) if (k in localData) out[k] = localData[k]; cb(out); },
        set(obj, cb) {
          chrome.storage.local.writes++;
          const changes = {};
          for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: localData[k], newValue: v }; localData[k] = v; }
          if (cb) cb();
          for (const fn of storeListeners) fn(changes, "local");
        },
      },
      onChanged: { addListener: (fn) => storeListeners.push(fn) },
    },
    _fire: (changes, area) => storeListeners.forEach((fn) => fn(changes, area)),
  };
  const L = require(path.join(SRC, "labs.js"));
  check("module.exports is FSSE.labs; the state is unknown before any source", L === FSSE.labs && L.isOn(ID) === null && L.ids() === null);
  const exp = L.experiment("familyRemainingOrdinances");
  check("experiment: id, title, site, the page URL and FamilySearch's opt-in URL byte-exact; unknown key → null", exp.id === ID && exp.title === "Families with Remaining Ordinances" && exp.site === "family-remaining-ordinances" && exp.pageUrl === PAGE_URL && exp.optInUrl === OPT_IN_URL && L.experiment("nope") === null && L.LABS_HOME === ORIGIN + "/en/labs/");
  const changes = [];
  L.onChange((ids) => changes.push(ids.slice()));
  const pw = { posted: [], listeners: {}, location: { origin: ORIGIN }, postMessage(m, o) { this.posted.push({ m, o }); }, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }, dispatch(t, e) { (this.listeners[t] || []).forEach((fn) => fn(e)); } };
  L.wire(pw);
  check("wire: the cached record is adopted (OLD on, from the cache) and a FSSE_LABS_REQUEST ping goes to the page origin", L.isOn("OLD") === true && L.isOn(ID) === false && L._state.from === "cache" && pw.posted.length === 1 && pw.posted[0].m.type === "FSSE_LABS_REQUEST" && pw.posted[0].m.source === "fsse-dqs" && pw.posted[0].o === ORIGIN && changes.length === 1 && J(changes[0]) === '["OLD"]');
  const pageMsg = (labs) => ({ source: pw, origin: ORIGIN, data: { source: "fsse-dqs-page", type: "FSSE_LABS", labs } });
  pw.dispatch("message", pageMsg([ID]));
  check("a page message replaces the cache: ID on, OLD gone, saved to chrome.storage.local with a timestamp", L.isOn(ID) === true && L.isOn("OLD") === false && L._state.from === "page" && localData["fsse.labs"].ids[0] === ID && localData["fsse.labs"].at > 5 && changes.length === 2);
  pw.dispatch("message", pageMsg([ID]));
  check("the same list again changes nothing (no listener call)", changes.length === 2 && L.isOn(ID) === true);
  pw.dispatch("message", { source: {}, origin: ORIGIN, data: { source: "fsse-dqs-page", type: "FSSE_LABS", labs: ["X"] } });
  pw.dispatch("message", { source: pw, origin: "https://evil.example", data: { source: "fsse-dqs-page", type: "FSSE_LABS", labs: ["X"] } });
  pw.dispatch("message", { source: pw, origin: ORIGIN, data: { source: "fsse-dqs-page", type: "FSSE_DQS", labs: ["X"] } });
  pw.dispatch("message", pageMsg("X"));
  check("a foreign source / origin / type, or a non-array payload, is ignored", L.isOn("X") === false && changes.length === 2);
  chrome._fire({ "fsse.labs": { newValue: { ids: [ID, "NEW"], at: Date.now() + 1000 } } }, "local");
  check("another tab's NEWER record (the Labs page toggled there) is adopted", L.isOn("NEW") === true && L.isOn(ID) === true && changes.length === 3);
  chrome._fire({ "fsse.labs": { newValue: { ids: ["STALE"], at: 1 } } }, "local");
  chrome._fire({ "fsse.labs": { newValue: { ids: ["S2"], at: Date.now() + 5000 } } }, "sync");
  chrome._fire({ other: { newValue: 1 } }, "local");
  check("an older record, one in another area, or another key is ignored", L.isOn("STALE") === false && L.isOn("S2") === false && L.isOn("NEW") === true && changes.length === 3);
  check("receive refuses junk and reports no change", L.receive(null, "page") === false && L.receive("x", "page") === false && L.receive({ a: 1 }, "cache", 9) === false && L.isOn("NEW") === true);

  // ---- the not-found banner on the experiment's page ----
  const BANNER = "[data-fsse-labs-banner]";
  const buttonsOf = (d) => d.children.filter((c) => c.tagName === "BUTTON").map((b) => b.textContent);
  L.tick();
  check("on another page tick() does nothing", body.querySelector(BANNER) === null);
  location.pathname = "/en/temple/family-remaining-ordinances";
  L.tick();
  check("the experiment page still loading (no not-found marker, no heading) → no banner yet", body.querySelector(BANNER) === null);
  const nf = body.appendChild(new El("div", "", { "data-testid": "notfound" }));
  nf.appendChild(new El("h4", "Well, this is unexpected..."));
  L.tick();
  let d = body.querySelector(BANNER);
  check("state ON + FamilySearch's not-found page → the 'may have ended' banner with an Open FamilySearch Labs button", !!d && /may have ended/.test(d.textContent) && buttonsOf(d).includes("Open FamilySearch Labs") && d.getAttribute("data-fsse-labs-banner") === `${ID}:on`);
  L.tick();
  check("a second tick keeps the one banner", body.querySelectorAll(BANNER).length === 1 && body.querySelector(BANNER) === d);
  pw.dispatch("message", pageMsg([]));
  d = body.querySelector(BANNER);
  check("the state turning OFF (a page message) redraws the banner as the opt-in offer", body.querySelectorAll(BANNER).length === 1 && /off for your account/.test(d.textContent) && buttonsOf(d).includes("Turn it on and open it") && d.getAttribute("data-fsse-labs-banner") === `${ID}:off`);
  d.children.find((c) => c.tagName === "BUTTON" && c.textContent === "Turn it on and open it").click();
  check("its button navigates this tab to FamilySearch's opt-in URL", J(location.assigned) === J([OPT_IN_URL]));
  d.children.find((c) => c.tagName === "BUTTON" && c.textContent === "×").click();
  check("× dismisses it", body.querySelector(BANNER) === null);
  L.tick();
  check("the next tick shows it again (the page is still not found)", body.querySelector(BANNER) !== null);
  nf.remove();
  body.appendChild(new El("h4", "Well, this is unexpected..."));
  L.tick();
  check("FamilySearch's not-found wording alone (no test id) is recognised too", body.querySelector(BANNER) !== null);
  L._state.ids = null;
  L.tick();
  check("state unknown → the banner says the experiment is not turned on, with the opt-in button", /not turned on for your account/.test(body.querySelector(BANNER).textContent) && buttonsOf(body.querySelector(BANNER)).includes("Turn it on and open it"));
  body.appendChild(new El("h1", "Families with Remaining Ordinances"));
  L.tick();
  check("the real page rendered (its heading) → banner removed", body.querySelector(BANNER) === null);
  body.children.pop().parent = null;
  L.tick();
  check("…and back when it is gone", body.querySelector(BANNER) !== null);
  FSSE.settings = { loaded: true, siteEnabled: (id) => id !== "family-remaining-ordinances" };
  L.tick();
  check("the row's settings switch off → no banner", body.querySelector(BANNER) === null);
  FSSE.settings = { loaded: false, siteEnabled: () => true };
  L.tick();
  check("settings still loading → nothing", body.querySelector(BANNER) === null);
  delete FSSE.settings;
  location.pathname = "/en/tree/person/details/LH18-4BZ";
  L.tick();
  check("leaving the page clears any banner", body.querySelector(BANNER) === null);
  check("the on/off wording is what the row's user reads", /is on for your account, but FamilySearch did not find this page/.test(L._bannerText(exp, true)) && /which is off for your account/.test(L._bannerText(exp, false)) && /not turned on for your account/.test(L._bannerText(exp, null)));

  // =======================================================================================
  // 3. The Temple row in sites.js, per state
  // =======================================================================================
  require(path.join(SRC, "sources.js"));
  require(path.join(SRC, "fs-collections.js"));
  require(path.join(SRC, "sites.js"));
  const fro = FSSE.SITES.find((s) => s.id === "family-remaining-ordinances");
  L.receive([], "page");
  const q = fro.confirmText({}, {});
  check("row, state OFF: the click goes to FamilySearch's opt-in URL after a confirm question naming Labs and Try It", fro.buildUrl({}, {}) === OPT_IN_URL && typeof q === "string" && /FamilySearch Labs experiment/.test(q) && /OFF for your account/.test(q) && /Try It/.test(q) && /Cancel/.test(q));
  check("row, state OFF: Shift+click → the Labs page, no question", fro.buildUrl({}, { shift: true }) === L.LABS_HOME && fro.confirmText({}, { shift: true }) === null);
  check("row tooltip, state OFF", /OFF for your account/.test(fro.describe({})) && /Shift\+click/.test(fro.describe({})));
  L.receive([ID], "page");
  check("row, state ON: the page itself, no question, the tooltip says on", fro.buildUrl({}, {}) === PAGE_URL && fro.confirmText({}, {}) === null && /is on for your account/.test(fro.describe({})));
  L._state.ids = null;
  check("row, state unknown: the page itself, no question; the static tooltip is the unknown wording", fro.buildUrl({}, {}) === PAGE_URL && fro.confirmText({}, {}) === null && fro.describe({}) === fro.tooltip && /turned on at FamilySearch Labs/.test(fro.tooltip));
  const saved = FSSE.labs;
  delete FSSE.labs;
  check("without labs.js the row degrades to the page URL and never asks", fro.buildUrl({}, {}) === PAGE_URL && fro.confirmText({}, {}) === null && fro.describe({}) === fro.tooltip);
  FSSE.labs = saved;
  check("the row's settings key matches labs.js's site id for the experiment", exp.site === fro.id);

  process.exit(fails ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
