// extend.test.js — the "extend reservation" aid on Temple › My Reservations (v1.0.8, step 1:
// read-only + rehearsal):
//   (1) the page-world capture of the page's own reservation list in src/dqs-listen.js — nothing
//       posted until asked, the rows slimmed, the user's own list ids, the other paths untouched;
//   (2) src/extend.js — dates, a list row read from its texts, the page's data, the flags, the
//       days-left line / Extend link on a fake My Reservations page
//       shaped like Kevin's two screenshots of 2026-11-26, our confirmation, and the rehearsal
//       engine: the pure nextAction table and one whole run on a fake Ordinances tab.
// Run: node tests/run.js extend
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const wait = () => new Promise((r) => setTimeout(r, 5));
const J = (x) => JSON.stringify(x);
const ORIGIN = "https://www.familysearch.org";

// ---- a small fake DOM -----------------------------------------------------------------------
function matcher(sel) {
  const parts = sel.split(",").map((s) => s.trim()).map((part) => {
    const m = /^([a-z*]*)((?:\[[^\]]+\])*)$/i.exec(part);
    if (!m) throw new Error("fake DOM: selector not supported: " + part);
    const tag = m[1] && m[1] !== "*" ? m[1].toUpperCase() : null;
    const tests = [...m[2].matchAll(/\[([\w-]+)(?:([\^*]?=)"([^"]*)"(\s+i)?)?\]/g)].map((a) => ({ name: a[1], op: a[2], val: a[3], ci: !!a[4] }));
    return (el) =>
      (!tag || el.tagName === tag) &&
      tests.every((t) => {
        const v = el.getAttribute(t.name);
        if (v == null) return false;
        if (!t.op) return true;
        const a = t.ci ? v.toLowerCase() : v;
        const b = t.ci ? t.val.toLowerCase() : t.val;
        return t.op === "=" ? a === b : t.op === "^=" ? a.startsWith(b) : a.includes(b);
      });
  });
  return (el) => parts.some((p) => p(el));
}
class El {
  constructor(tag, text, attrs) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.parentElement = null;
    this._text = text || "";
    this._tail = "";
    this.style = { cssText: "" };
    this.listeners = {};
    this.rect = { width: 100, height: 20 };
    for (const k of Object.keys(attrs || {})) this.attrs[k] = String(attrs[k]);
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join("") + this._tail; }
  set textContent(v) { this._text = String(v); this._tail = ""; for (const c of this.children) c.parentElement = null; this.children = []; }
  get type() { return this.attrs.type; }
  set type(v) { this.attrs.type = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  appendChild(c) {
    if (c.isText) { this._tail += c.textContent; return c; }
    if (c.parentElement) c.remove();
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  add(...kids) { for (const k of kids) this.appendChild(k); return this; }
  remove() { const p = this.parentElement; if (!p) return; p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; }
  insertAdjacentElement(where, n) {
    if (where !== "afterend") throw new Error("fake DOM: only afterend");
    const p = this.parentElement;
    if (n.parentElement) n.remove();
    p.children.splice(p.children.indexOf(this) + 1, 0, n);
    n.parentElement = p;
    return n;
  }
  get nextElementSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  click() { const e = { target: this, preventDefault() {}, stopPropagation() {} }; (this.listeners.click || []).forEach((fn) => fn(e)); }
  getBoundingClientRect() { return this.rect; }
  querySelectorAll(sel) {
    const ok = matcher(sel);
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (ok(c)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}
const h = (tag, text, attrs) => new El(tag, text, attrs);
const body = h("body");
globalThis.document = {
  body,
  documentElement: body,
  createElement: (t) => new El(t),
  createTextNode: (t) => ({ isText: true, textContent: String(t) }),
  querySelectorAll: (s) => body.querySelectorAll(s),
};
const loc = { pathname: "/en/temple/reservations/", origin: ORIGIN, assigned: [], assign(u) { this.assigned.push(u); } };
globalThis.location = loc;
const session = new Map();
globalThis.sessionStorage = { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)), removeItem: (k) => session.delete(k) };
const logs = [];
const values = { "temple.extend": true, "temple.extendDays": "14" };
globalThis.FSSE = { log: (...a) => logs.push(a.join(" ")), settings: { loaded: true, get: (k) => values[k] } };

const listen = require(path.join(SRC, "dqs-listen.js"));
const E = require(path.join(SRC, "extend.js"));

// ---- fixtures: Kevin's two screenshots, the dates moved to stand relative to today -------------
const today = new Date();
const inDays = (n) => E.fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
function listRow(pid, name, life, ords, reservedText, expiresText, opts) {
  const o = opts || {};
  const row = h("div", "", o.noMarker ? {} : { "data-testid": "table-row-" + pid });
  row.add(h("input", "", { type: "checkbox" }));
  row.add(h("div").add(h("span", name), o.splitLife ? h("span").add(h("span", life), h("span", pid)) : h("span", `${life} • ${pid}`)));
  if (o.sealing) row.add(h("div").add(...o.sealing.map((n) => h("span", n))));
  const od = h("div");
  for (const [letter, status] of ords) od.add(h("span", letter), h("span", status));
  row.add(od);
  const dates = h("div").add(h("p", "Reserved: " + reservedText), h("p", "Expires: " + expiresText));
  if (o.note) dates.add(h("p", o.note));
  row.add(dates);
  return row;
}
const DONE4 = [["B", "Completed"], ["C", "Completed"], ["I", "Completed"], ["E", "Completed"]];
function buildList(opts) {
  body.textContent = "";
  const toolbar = h("div").add(h("button", "Print"), h("button", "Share"), h("button", "Unreserve", { "data-testid": "unreserve-button", disabled: "" }));
  const table = h("div");
  table.add(
    listRow("G7W9-WCV", "Alfred Robert Darley", "1873–1946", [...DONE4, ["SP", "Not Printed"]], inDays(-1095), inDays(5), Object.assign({ sealing: ["Jonathan Darley", "Elizabeth Catherine Yorke"] }, opts)),
    listRow("GLJX-S49", "Robert Ellsworth Wiley", "1897–1932", [...DONE4, ["SP", "Printed"]], inDays(-1095), inDays(12), Object.assign({ sealing: ["Robert Wiley", "Mary Ellen Pybus"] }, opts)),
    listRow("GGGJ-7MT", "David Cowan Dickie", "1891–1968", [["B", "Completed"], ["C", "Completed"], ["I", "Completed"], ["E", "Printed"]], inDays(-110), inDays(10), Object.assign({ note: "Ordinances that were previously shared with the temple cannot be shared again." }, opts)),
    listRow("L7M5-WLQ", "Samuel Roberts", "1849–Deceased", [["B", "Completed"], ["C", "Completed"], ["I", "Not Printed"], ["E", "Not Printed"]], inDays(-692), inDays(38), opts),
    listRow("GDW3-13W", "Annie McLeod", "1844–1913", [["B", "Completed"], ["C", "Completed"], ["I", "Not Printed"], ["E", "Not Printed"]], inDays(-920), inDays(175), opts)
  );
  body.add(toolbar, table);
  return { toolbar, table };
}
const iso = (n) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dataOrd = (type, o) => Object.assign({ type, status: "Reserved", canUnreserve: true, canReserve: false, printed: false, assignedToTemple: false }, o);

(async () => {
  // =======================================================================================
  // 1. The page-world capture (src/dqs-listen.js)
  // =======================================================================================
  const LIST = ORIGIN + "/service/tree/tree-data/reservations/list/cis.user.MMMM-XXXX?sharedWithTemple=false";
  const SHARED = ORIGIN + "/service/tree/tree-data/reservations/list/cis.user.MMMM-XXXX?sharedWithTemple=true";
  const COUNTS = ORIGIN + "/service/tree/tree-data/reservations/list/cis.user.MMMM-XXXX/counts";
  const ROWS = ORIGIN + "/service/tree/tree-data/reservations/person/G7W9-WCV,L7M5-WLQ?locale=en&owner=cis.user.MMMM-XXXX&pendingTransfer=true";
  const POPUP = ORIGIN + "/service/tree/tree-data/reservations/popup/person/L7M5-WLQ?locale=en";
  check("the watched paths: the list and the rows — never the counts, never the Request dialog's own read",
    listen.RES_LIST_RE.test(LIST) && listen.RES_LIST_RE.test(SHARED) && !listen.RES_LIST_RE.test(COUNTS) && listen.RES_ROWS_RE.test(ROWS) && !listen.RES_ROWS_RE.test(POPUP) && !listen.RES_ROWS_RE.test(LIST));
  const rawRow = {
    id: "l7m5-wlq", name: "Samuel Roberts", lifespan: "1849-Deceased", gender: "MALE", dateExpiry: "3 January 2027", comparableDateExpiry: 20270103,
    baptism: { status: "Completed", canUnreserve: false, printed: false },
    initiatory: { status: "Reserved", canUnreserve: true, printed: false, expiryDate: "3 January 2027", comparableExpiryDate: "+2027-01-03", reservedDate: "3 January 2025", owner: "cis.user.MMMM-XXXX", relationships: [{ id: "X" }] },
    endowment: { status: "Reserved", canUnreserve: true, printed: true, expiryDate: "3 January 2027" },
    sealingToSpouse: [{ status: "Reserved", canUnreserve: true, assignedToTemple: true }, { status: "Not Available" }],
  };
  const slim = listen.slimRow(rawRow);
  check("slimRow: the id upper-cased, name and life span, the row's dates, no other field", slim.id === "L7M5-WLQ" && slim.name === "Samuel Roberts" && slim.dateExpiry === "3 January 2027" && slim.comparableDateExpiry === 20270103 && !("gender" in slim), J(slim));
  check("slimRow: one entry per ordinance present, a list of sealings entry by entry, flags as booleans, dates carried, nothing else",
    slim.ords.map((o) => o.type).join(",") === "baptism,initiatory,endowment,sealingToSpouse,sealingToSpouse" && slim.ords[1].canUnreserve === true && slim.ords[1].comparableExpiryDate === "+2027-01-03" && slim.ords[1].reservedDate === "3 January 2025" &&
    !("owner" in slim.ords[1]) && !("relationships" in slim.ords[1]) && slim.ords[2].printed === true && slim.ords[3].assignedToTemple === true && slim.ords[4].canUnreserve === false, J(slim.ords));
  check("slimRow: ordinances under an `ordinances` object or list are found too; junk → null",
    listen.slimRow({ id: "AAAA-111", ordinances: { endowment: { status: "Reserved", canUnreserve: true } } }).ords.length === 1 && listen.slimRow({ id: "AAAA-111", ordinances: [{ type: "endowment", canUnreserve: true }] }).ords[0].type === "endowment" && listen.slimRow(null) === null && listen.slimRow({ name: "x" }) === null);
  check("listIds: every primaryPersonId wherever it sits, once each, upper-cased", J(listen.listIds({ list: { reservation: [{ a: { primaryPersonId: "g7w9-wcv" } }, { b: { primaryPersonId: "L7M5-WLQ" }, c: { primaryPersonId: "G7W9-WCV" } }] } })) === J(["G7W9-WCV", "L7M5-WLQ"]));
  const shape = listen.shapeOf(rawRow);
  check("shapeOf: keys with types, samples for dates and flags only — never the name", /dateExpiry:string=3 January 2027/.test(shape) && /canUnreserve:boolean=true/.test(shape) && /name:string(,|})/.test(shape) && !/Samuel/.test(shape), shape);

  const win = { posted: [], listeners: {}, location: { origin: ORIGIN } };
  win.postMessage = (msg, origin) => win.posted.push({ msg, origin });
  win.addEventListener = (t, fn) => (win.listeners[t] = win.listeners[t] || []).push(fn);
  win.dispatch = (t, e) => (win.listeners[t] || []).forEach((fn) => fn(e));
  const bodies = {
    [LIST]: J({ list: { reservation: [{ k: { primaryPersonId: "G7W9-WCV" } }, { k: { primaryPersonId: "L7M5-WLQ" } }] } }),
    [SHARED]: J({ list: { reservation: [{ k: { primaryPersonId: "ZZZZ-999" } }] } }),
    [ROWS]: J({ rows: [rawRow, { id: "G7W9-WCV", name: "Alfred Robert Darley", lifespan: "1873-1946", sealingToParents: { status: "Reserved", canUnreserve: true, expiryDate: "25 November 2026" } }] }),
    [COUNTS]: J({ rows: [{ id: "QQQQ-111" }] }),
    [POPUP]: J({ rows: [{ id: "QQQQ-222" }] }),
  };
  win.fetch = (input) => Promise.resolve({ ok: true, status: 200, clone() { return this; }, text: () => Promise.resolve(bodies[input] || "{}") });
  const inst = listen.install(win);
  await win.fetch(LIST);
  await win.fetch(ROWS);
  await wait();
  check("the page's own list and rows are kept in page memory — and NOTHING is posted before the extension asks", win.posted.length === 0 && inst.reservations().rows.length === 2 && J(inst.reservations().mine) === J(["G7W9-WCV", "L7M5-WLQ"]));
  win.dispatch("message", { source: {}, data: { source: "fsse-dqs", type: "FSSE_RESERVATIONS_REQUEST" } });
  check("a request from a foreign source is ignored", win.posted.length === 0);
  win.dispatch("message", { source: win, data: { source: "fsse-dqs", type: "FSSE_RESERVATIONS_REQUEST" } });
  const first = win.posted[0] && win.posted[0].msg;
  check("the extension's request → one FSSE_RESERVATIONS message: both rows, the user's own ids, the shape line", win.posted.length === 1 && first.source === "fsse-dqs-page" && first.type === "FSSE_RESERVATIONS" && first.rows.length === 2 && first.mine.length === 2 && /canUnreserve/.test(first.shape) && win.posted[0].origin === ORIGIN);
  await win.fetch(SHARED);
  await win.fetch(COUNTS);
  await win.fetch(POPUP);
  await wait();
  check("the shared-with-temple list, the counts and the Request dialog's read change nothing", win.posted.length === 1 && inst.reservations().rows.length === 2 && inst.reservations().mine.length === 2);
  await win.fetch(ROWS);
  await wait();
  check("once asked, a later rows response is passed on as it arrives (rows replaced, not doubled)", win.posted.length === 2 && win.posted[1].msg.rows.length === 2);

  // v1.0.9 — Kevin's first live run heard the 58 ids but not one row: the reader is tolerant now,
  // and every reservations request of the page is noted for the findings.
  const seen = win.posted[1].msg.seen;
  check("every reservations request of the page is noted: method, address with ids and the user masked, how often, the response's shape",
    seen.length === 5 && seen.some((s) => /^GET \/service\/tree\/tree-data\/reservations\/person\/<2 id>\?locale=en&owner=<user>&pendingTransfer=true ×2 → \{rows:\[2: \{id:string/.test(s)) &&
    seen.some((s) => /reservations\/list\/<user>\/counts ×1 → /.test(s)) && seen.some((s) => /popup\/person\/<1 id>/.test(s)) && !seen.some((s) => /MMMM|G7W9|L7M5|Samuel|Alfred/.test(s)), seen.join("\n"));
  check("maskUrl: person ids (comma or %2C separated) and the user id never appear", listen.maskUrl(ORIGIN + "/service/tree/tree-data/reservations/person/AAAA-111%2CBBBB-222,CCCC-333?owner=cis.user.MMMM-XXXX") === "/service/tree/tree-data/reservations/person/<3 id>?owner=<user>");
  const ordRow = (id) => ({ personId: id, fullName: "N " + id, endowment: { status: "Reserved", canUnreserve: true, expiryDate: "3 January 2027" } });
  check("rowsOf: the rows are found under `rows`, as the response itself, under another key, one level down, or as the values of a map",
    listen.rowsOf({ rows: [ordRow("AAAA-111")] }).length === 1 && listen.rowsOf([ordRow("AAAA-111")]).length === 1 && listen.rowsOf({ persons: [ordRow("AAAA-111"), ordRow("BBBB-222")] }).length === 2 &&
    listen.rowsOf({ data: { people: [ordRow("AAAA-111")] } }).length === 1 && listen.rowsOf({ "AAAA-111": ordRow("AAAA-111"), "BBBB-222": ordRow("BBBB-222") }).length === 2);
  check("rowsOf: a list of things without ordinances is not a list of rows", listen.rowsOf({ rows: [{ id: "QQQQ-111" }] }) === null && listen.rowsOf({ count: 3 }) === null && listen.rowsOf(null) === null && listen.rowsOf("x") === null);
  check("slimRow: the id and name under other field names (personId / fullName, or a nested person)", listen.slimRow(ordRow("aaaa-111")).id === "AAAA-111" && listen.slimRow(ordRow("AAAA-111")).name === "N AAAA-111" && listen.slimRow({ person: { id: "BBBB-222", name: "B", lifespan: "1850-1900" }, endowment: {} }).lifespan === "1850-1900");
  const POSTED = ORIGIN + "/service/tree/tree-data/reservations/persons?locale=en";
  bodies[POSTED] = J({ persons: [ordRow("CCCC-333")] });
  await win.fetch(POSTED, { method: "POST", body: J(["CCCC-333"]) });
  await wait();
  check("a row request of another address and shape (a POST, the rows under another key) is heard all the same", inst.reservations().rows.length === 3 && inst.reservations().rows[2].id === "CCCC-333" && inst.reservations().seen.some((s) => /^POST \/service\/tree\/tree-data\/reservations\/persons\?locale=en ×1 → \{persons:/.test(s)));

  // =======================================================================================
  // 2. Dates
  // =======================================================================================
  const d = (x) => { const v = E.parseDate(x); return v ? `${v.getFullYear()}-${v.getMonth() + 1}-${v.getDate()}` : null; };
  check("parseDate: FamilySearch's display form, an abbreviated month, month-first", d("25 November 2026") === "2026-11-25" && d("3 Jan 2027") === "2027-1-3" && d("November 25, 2026") === "2026-11-25");
  // v1.0.12 — a full timestamp is a moment in UTC and is shown as the day it falls on here (the
  // page does the same: read as a bare date it was a day late for 33 of Kevin's 50 rows).
  const localDay = (isoZ) => { const t = new Date(isoZ); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; };
  check("parseDate: a timestamp, with or without a zone, is the LOCAL day of that UTC moment",
    d("2026-11-25T00:00:00Z") === localDay("2026-11-25T00:00:00Z") && d("2027-05-21T05:29:41.415") === localDay("2027-05-21T05:29:41.415Z") && d("2026-11-26T03:10:00.000") === localDay("2026-11-26T03:10:00.000Z") && d("2026-11-26T12:00:00+00:00") === localDay("2026-11-26T12:00:00Z"));
  check("parseDate: a signed ISO date, a compact number or string, epoch milliseconds", d("2026-11-25") === "2026-11-25" && d("+2027-01-03") === "2027-1-3" && d(20270103) === "2027-1-3" && d("20270103") === "2027-1-3" && d(new Date(2027, 0, 3, 15).getTime()) === "2027-1-3" && d(String(new Date(2027, 0, 3, 15).getTime())) === "2027-1-3");
  check("parseDate: nothing usable → null", d("") === null && d(null) === null && d("Deceased") === null && d("31 Smarch 2026") === null && d(12) === null && d("2026-13-40") === null);
  check("daysBetween counts calendar days, whatever the hour", E.daysBetween(new Date(2026, 10, 26, 23, 50), new Date(2026, 10, 27, 0, 5)) === 1 && E.daysBetween(new Date(2026, 10, 26), new Date(2027, 0, 3)) === 38 && E.daysBetween(new Date(2026, 10, 26), new Date(2026, 10, 25)) === -1);
  check("daysText: the wording of the days-left chip", E.daysText(12) === "expires in 12 days" && E.daysText(1) === "expires tomorrow" && E.daysText(0) === "expires today" && E.daysText(-1) === "expired yesterday" && E.daysText(-4) === "expired 4 days ago" && E.daysText(null) === "");

  // =======================================================================================
  // 3. A list row from its texts; the page's data; the flags
  // =======================================================================================
  const darley = E.parseRowTexts(["Alfred Robert Darley", "1873–1946 • G7W9-WCV", "Jonathan Darley", "Elizabeth Catherine Yorke", "B", "Completed", "C", "Completed", "I", "Completed", "E", "Completed", "SP", "Not Printed", "Reserved: 25 November 2023", "Expires: 25 November 2026"]);
  check("parseRowTexts (Alfred Robert Darley): ID, name, life span, birth year, both dates", darley.pid === "G7W9-WCV" && darley.name === "Alfred Robert Darley" && darley.lifespan === "1873–1946" && darley.birthYear === 1873 && d(darley.reserved) === "2023-11-25" && d(darley.expires) === "2026-11-25" && darley.expiresText === "25 November 2026", J(darley));
  check("parseRowTexts: the five ordinances with their status", darley.ords.map((o) => o.letter + "=" + o.status).join(",") === "B=Completed,C=Completed,I=Completed,E=Completed,SP=Not Printed" && darley.ords[4].type === "sealingToParents");
  const split = E.parseRowTexts(["Samuel Roberts", "1849–Deceased", "L7M5-WLQ", "I", "Not Printed", "E", "Not Printed", "Reserved: 3 January 2025", "Expires: 3 January 2027"]);
  check("parseRowTexts: a life span and an ID in separate texts read the same", split.pid === "L7M5-WLQ" && split.name === "Samuel Roberts" && split.birthYear === 1849 && split.ords.length === 2, J(split));
  check("v1.0.9: the portrait's gender label between the name and the life span is not the name (every name read \"Male\" on the live page)",
    E.parseRowTexts(["Alfred Robert Darley", "Male", "1873–1946 • G7W9-WCV"]).name === "Alfred Robert Darley" && E.parseRowTexts(["Annie McLeod", "Female", "1844–1913", "GDW3-13W"]).name === "Annie McLeod" && E.parseRowTexts(["Male", "1873–1946 • G7W9-WCV"]).name === "");
  const pDarley = E.fromPage(darley);
  check("fromPage: only what the row shows as still reserved — a card status, never Completed", pDarley.ords.length === 1 && pDarley.ords[0].letter === "SP" && pDarley.ords[0].printed === false && pDarley.source === "page");
  check("fromPage: a Printed status is a printed card", E.fromPage(E.parseRowTexts(["X", "1897–1932 • GLJX-S49", "SP", "Printed", "Expires: 25 November 2026"])).ords[0].printed === true);
  const dRoberts = E.fromData(slim);
  check("fromData: the ordinances FamilySearch says can be unreserved — never one that is with the temple (v1.0.10) — the earliest expiry, the reserved date, the birth year",
    dRoberts.ords.map((o) => o.letter).join(",") === "I,E" && dRoberts.ords[1].printed === true && d(dRoberts.expires) === "2027-1-3" && d(dRoberts.reserved) === "2025-1-3" && dRoberts.birthYear === 1849, J(dRoberts));
  check("fromData: a row with no dated ordinance falls back to the row's own expiry; junk → null", d(E.fromData({ id: "AAAA-111", ords: [{ type: "endowment", canUnreserve: true }], comparableDateExpiry: 20270520 }).expires) === "2027-5-20" && E.fromData(null) === null && E.fromData({}) === null);
  const merged = E.merge(E.fromPage(split), dRoberts);
  check("merge: the page's name and dates, the data's ordinances (they know what can be unreserved and what was printed)", merged.name === "Samuel Roberts" && merged.ords.length === 2 && merged.source === "page+data" && E.merge(null, dRoberts) === dRoberts && E.merge(pDarley, null) === pDarley);
  const NOW = new Date(2026, 10, 26);
  const flag = (c) => E.flagsOf(c, NOW);
  check("flags: a 120-day reservation (the Dickies: 4 September 2026 → 2 January 2027), not a 2-year or 3-year one",
    flag({ ords: [], reserved: E.parseDate("4 September 2026"), expires: E.parseDate("2 January 2027") }).short === true && flag({ ords: [], reserved: E.parseDate("3 January 2025"), expires: E.parseDate("3 January 2027") }).short === false && flag({ ords: [], reserved: null, expires: E.parseDate("3 January 2027") }).short === false);
  check("flags: a printed card; a birth within the last 110 years (1916 is not, 1917 is)", flag({ ords: [{ printed: true }] }).printed === true && flag({ ords: [{ printed: false }] }).printed === false && flag({ ords: [], birthYear: 1917 }).young === true && flag({ ords: [], birthYear: 1916 }).young === false && flag({ ords: [], birthYear: null }).young === false);
  const dec = E.decorate(E.fromPage(darley), NOW, 14);
  check("decorate: days left (25 November seen on the 26th = expired yesterday), inside the window, extendable, not flagged", dec.days === -1 && dec.inWindow === true && dec.extendable === true && dec.flagged === false);
  check("decorate: nothing reserved or no expiry date → not extendable", E.decorate(E.fromPage(E.parseRowTexts(["X", "1873–1946 • G7W9-WCV", "B", "Completed", "Expires: 25 November 2026"])), NOW, 14).extendable === false && E.decorate(E.fromPage(E.parseRowTexts(["X", "1873–1946 • G7W9-WCV", "E", "Not Printed"])), NOW, 14).extendable === false);

  // =======================================================================================
  // 4. My Reservations: the days-left line and the Extend link (no button for all — v1.0.22)
  // =======================================================================================
  buildList();
  check("the page: Temple › My Reservations is recognised; an Ordinances tab is not", E.isReservationsPage() === true && E.ordinancesPid() === null);
  const rows = E.findRows();
  check("findRows: the five rows by FamilySearch's row marker", rows.length === 5 && rows.every((r) => r.via === "marker") && rows[0].pid === "G7W9-WCV");
  let m = E.syncList();
  const ours = (kind) => body.querySelectorAll(`[data-fsse-extend="${kind}"]`);
  check("every row gets one line of ours right after its \"Expires:\" line", ours("row").length === 5 && body.querySelectorAll('[data-testid="table-row-G7W9-WCV"]')[0].querySelectorAll("p")[1].nextElementSibling === ours("row")[0]);
  const lineOf = (pid) => ours("row").find((n) => n.getAttribute("data-pid") === pid);
  check("inside the 14-day window: a chip with the days left and an Extend link", lineOf("G7W9-WCV").children[0].textContent === "expires in 5 days" && lineOf("G7W9-WCV").children[1].textContent === "↻ Extend" && /background/.test(lineOf("G7W9-WCV").children[0].style.cssText));
  check("v1.0.14, outside the window: the days left in plain grey and NO Extend link — an extension months ahead makes no sense — with a tooltip saying when one is offered",
    lineOf("L7M5-WLQ").children.length === 1 && lineOf("L7M5-WLQ").children[0].textContent === "38 days left" && !/background/.test(lineOf("L7M5-WLQ").children[0].style.cssText) && /offered within 14 days of the expiry date/.test(lineOf("L7M5-WLQ").children[0].title) &&
    lineOf("GDW3-13W").children.length === 1 && ours("row").filter((n) => n.children.length === 2).map((n) => n.getAttribute("data-pid")).join(",") === "G7W9-WCV,GLJX-S49,GGGJ-7MT");
  check("…and nothing outside the window can be started by any route: our dialog does not open for such a relative", E.openDialog(m.byPid.get("L7M5-WLQ")) === null && body.querySelectorAll('[data-fsse-extend="dialog"]').length === 0);
  check("the three rows inside the window, soonest first; the flags: Wiley printed, Dickie printed + 120-day",
    m.expiring.map((c) => c.pid).join(",") === "G7W9-WCV,GGGJ-7MT,GLJX-S49" && m.byPid.get("GLJX-S49").flags.printed && m.byPid.get("GGGJ-7MT").flags.short && m.byPid.get("GGGJ-7MT").flags.printed && !m.byPid.get("G7W9-WCV").flagged);
  // v1.0.22 (Kevin: "it will be sufficient to offer one name at a time"): no button for all of them.
  check("v1.0.22: there is no button for all expiring reservations — the row lines are all that is added, and nothing of ours sits beside FamilySearch's Unreserve button",
    body.querySelectorAll("[data-fsse-extend]").every((n) => n.getAttribute("data-fsse-extend") === "row") && ours("bulk").length === 0 && body.querySelectorAll('[data-testid="unreserve-button"]').length >= 1 &&
    !body.querySelectorAll("button").some((b) => /EXTEND EXPIRING/i.test(b.textContent)) && E.BULK_MAX === undefined);
  const logged = logs.length;
  E.syncList();
  E.syncList();
  check("a second and third pass change nothing: no second line, no new log line", ours("row").length === 5 && logs.length === logged && lineOf("G7W9-WCV") === ours("row")[0]);
  values["temple.extendDays"] = "60";
  m = E.syncList();
  check("the window is a setting: 60 days takes Samuel Roberts in (chip rewritten)", m.expiring.length === 4 && lineOf("L7M5-WLQ").children[0].textContent === "expires in 38 days" && ours("row").length === 5);
  check("…and gives him the Extend link; back at 14 days the link is gone again", lineOf("L7M5-WLQ").children.length === 2 && lineOf("L7M5-WLQ").children[1].textContent === "↻ Extend" && (() => { values["temple.extendDays"] = "14"; E.syncList(); return lineOf("L7M5-WLQ").children.length === 1; })());
  values["temple.extendDays"] = "14";
  E.syncList();

  // the page's own data: what can be unreserved, and the relatives on the list's other pages
  E.receive(
    [
      { id: "G7W9-WCV", name: "Alfred Robert Darley", lifespan: "1873-1946", ords: [dataOrd("sealingToParents", { expiryDate: iso(5) })] },
      { id: "GLJX-S49", name: "Robert Ellsworth Wiley", lifespan: "1897-1932", ords: [dataOrd("sealingToParents", { printed: true, expiryDate: iso(12) })] },
      { id: "PAGE-2AA", name: "Second Page Person", lifespan: "1850-1900", ords: [dataOrd("endowment", { expiryDate: iso(9), reservedDate: iso(-721) })] },
      { id: "PAGE-2BB", name: "Later Person", lifespan: "1850-1900", ords: [dataOrd("endowment", { expiryDate: iso(300) })] },
      { id: "SHAR-EDD", name: "Shared Person", lifespan: "1850-1900", ords: [dataOrd("endowment", { expiryDate: iso(2) })] },
      { id: "NONE-000", name: "Nothing Of Mine", lifespan: "1850-1900", ords: [dataOrd("endowment", { canUnreserve: false, expiryDate: iso(2) })] },
    ],
    ["G7W9-WCV", "GLJX-S49", "GGGJ-7MT", "L7M5-WLQ", "GDW3-13W", "PAGE-2AA", "PAGE-2BB", "NONE-000"],
    "{id:string}"
  );
  m = E.syncList();
  check("the page's data knows the relatives on the list's other pages too (for the console line, and for the check after a run)",
    m.expiring.map((c) => c.pid).join(",") === "G7W9-WCV,PAGE-2AA,GGGJ-7MT,GLJX-S49" && m.byPid.get("PAGE-2AA").source === "data");
  check("…but never a relative of another list (shared with the temple), nor one with nothing this user can unreserve", !m.byPid.has("SHAR-EDD") && !m.byPid.has("NONE-000") && m.byPid.has("PAGE-2BB") && !m.byPid.get("PAGE-2BB").inWindow);
  check("a rendered row keeps the page's name and dates and takes the data's ordinances", m.byPid.get("GLJX-S49").source === "page+data" && m.byPid.get("GLJX-S49").name === "Robert Ellsworth Wiley" && m.byPid.get("GLJX-S49").ords[0].printed === true);
  check("the console: the shape of the page's data once, then one summary line per change", logs.filter((l) => /first row as received/.test(l)).length === 1 && logs.some((l) => /5 row\(s\) on the page \(marker\).*6 reservation\(s\), 8 on this list.*4 inside the 14-day window/.test(l)), logs.slice(-3).join("\n"));
  check("v1.0.11: …and a count of what the page's data says could stand in the way of requesting again", /the page's data over 6 relative\(s\): 5 ordinance\(s\) you can unreserve — duplicates flags stated for 0, a request would be refused over possible duplicates for 0; 0 with a reason listed/.test(logs[logs.length - 1]), logs[logs.length - 1]);

  // no row marker at all: the rows are found by their visible text
  buildList({ noMarker: true, splitLife: true });
  const byText = E.findRows();
  check("without FamilySearch's row marker the rows are found by the visible \"Expires:\" text, each with its own ID", byText.length === 5 && byText.every((r) => r.via === "text") && byText.map((r) => r.pid).join(",") === "G7W9-WCV,GLJX-S49,GGGJ-7MT,L7M5-WLQ,GDW3-13W");
  E.syncList();
  check("…and get the same line of ours", ours("row").length === 5 && ours("row")[3].getAttribute("data-pid") === "L7M5-WLQ" && ours("row")[3].children[0].textContent === "38 days left");

  // a date line built from a label text plus a child element holding the date
  body.textContent = "";
  const splitRow = h("div", "", { "data-testid": "table-row-GDW3-13W" });
  const expP = h("p", "Expires: ").add(h("span", inDays(9)));
  splitRow.add(h("span", "Annie McLeod"), h("span", "1844–1913 • GDW3-13W"), h("span", "E"), h("span", "Not Printed"), h("div").add(h("p", "Reserved: ").add(h("span", inDays(-721))), expP));
  body.add(splitRow);
  m = E.syncList();
  check("a date line made of a label and a child element is read all the same, and our line follows the whole of it",
    m.rendered.length === 1 && m.rendered[0].c.days === 9 && m.rendered[0].c.flags.short === false && expP.nextElementSibling === ours("row")[0] && ours("row")[0].children[0].textContent === "expires in 9 days");

  // =======================================================================================
  // 5. Our confirmation
  // =======================================================================================
  buildList();
  values["temple.extendDays"] = "60"; // Samuel Roberts (38 days) has a link only inside the window
  E.syncList();
  const dialog = () => body.querySelectorAll('[data-fsse-extend="dialog"]')[0] || null;
  const ticks = () => dialog().querySelectorAll('input[type="checkbox"]');
  const press = (label) => dialog().querySelectorAll("button").find((b) => b.textContent === label).click();
  lineOf("L7M5-WLQ").children[1].click();
  values["temple.extendDays"] = "14";
  check("a row's Extend link → our dialog with that one relative, ticked; this version says it only rehearses", !!dialog() && ticks().length === 1 && ticks()[0].checked === true && /rehearsal/i.test(dialog().textContent) && /Nothing is changed/.test(dialog().textContent) && dialog().querySelectorAll("p")[0].textContent.length < 160 && /Samuel Roberts/.test(dialog().textContent) && /I, E/.test(dialog().textContent));
  press("Cancel");
  check("Cancel closes it and starts nothing", !dialog() && E.loadJob() === null && loc.assigned.length === 0);
  E.syncList();
  lineOf("GGGJ-7MT").children[1].click();
  // v1.0.16 (Kevin's practice): a printed card and a 120-day reservation are NOTES, not reasons to hold back.
  check("David Cowan Dickie's link → that one relative, ticked; a printed card and a 120-day reservation are plain notes (the same card can still be used; reserving again is fine)",
    ticks().length === 1 && ticks()[0].checked === true && ticks()[0]._fssePid === "GGGJ-7MT" && /the same card can still be used/.test(dialog().textContent) && /120-day reservation/.test(dialog().textContent) && !/Not ticked because/.test(dialog().textContent) && !/must be printed again/.test(dialog().textContent),
    dialog() ? ticks().map((t) => t._fssePid + "=" + t.checked).join(",") : "no dialog");
  check("v1.0.22: the dialog speaks of this one relative — nothing about several, a run of them or a limit", /^Extend this reservation — rehearsal/.test(dialog().textContent) && /this relative's Ordinances tab/.test(dialog().textContent) && !/ticked below|one after the other|at a time|more inside the window/.test(dialog().textContent), dialog().textContent.slice(0, 200));
  check("…the two are still known per relative, without flagging anyone", (() => { const mm = E.model(); return mm.byPid.get("GLJX-S49").flags.printed && mm.byPid.get("GGGJ-7MT").flags.short && !mm.byPid.get("GLJX-S49").flagged && !mm.byPid.get("GGGJ-7MT").flagged && E.noteTexts(mm.byPid.get("GGGJ-7MT")).length === 2; })());
  ticks()[0].checked = false;
  press("Rehearse");
  check("the box unticked by hand: the dialog stays open and says so, nothing starts", !!dialog() && E.loadJob() === null && /Nothing is ticked/.test(dialog().textContent));
  ticks()[0].checked = true;
  press("Rehearse");
  const job = E.loadJob();
  check("Rehearse → a job in this tab's sessionStorage for that one relative, marked as a rehearsal", !dialog() && !!job && job.rehearsal === true && job.queue.map((q) => q.pid).join(",") === "GGGJ-7MT" && J(job.queue[0].ords) === J(["E"]) && session.has(E.JOB_KEY));
  check("…and the first step opens the relative's Ordinances tab", loc.assigned.length === 1 && loc.assigned[0] === ORIGIN + "/en/tree/person/ordinances/GGGJ-7MT");
  check("nothing of the job is written anywhere but sessionStorage (no chrome.storage in this module)", !/chrome\.storage|localStorage/.test(require("fs").readFileSync(path.join(SRC, "extend.js"), "utf8").replace(/\/\/.*$/gm, "")));
  E.clearJob();

  // =======================================================================================
  // 6. The engine — nextAction (pure)
  // =======================================================================================
  const T0 = 1000000;
  const mk = (phase, extra) => Object.assign(E.newJob({ pid: "AAAA-111", name: "A", ords: [{ letter: "E" }], expires: null }, T0), { phase }, extra);
  const snap = (o) => Object.assign({ now: T0 + 100, ordPid: "AAAA-111", onList: false, pageReady: true, unreserveOpener: false, requestButton: { found: false, disabled: false }, unreserveForm: false, reserveForm: false }, o);
  const A = (j, s) => E.nextAction(j, s);
  check("open: another page → navigate to the relative's Ordinances tab; while that load is under way → wait; a third try → stop",
    A(mk("open"), snap({ ordPid: null })).url === ORIGIN + "/en/tree/person/ordinances/AAAA-111" && A(mk("open", { navAt: T0, navs: 1 }), snap({ ordPid: null })).type === "wait" && A(mk("open", { navAt: T0 - 20000, navs: 2 }), snap({ ordPid: null })).type === "fail");
  check("open: on the tab → wait for it to render, then on to the Unreserve button (with a page inventory for the console)", A(mk("open"), snap({ pageReady: false })).type === "wait" && J(A(mk("open"), snap())) === J({ type: "goto", phase: "unreserve-open", report: "page" }));
  check("unreserve-open: press FamilySearch's Unreserve control once, then wait for its dialog", A(mk("unreserve-open"), snap({ unreserveOpener: true })).target === "unreserveOpener" && A(mk("unreserve-open", { clicked: T0 }), snap({ unreserveOpener: true })).type === "wait" && A(mk("unreserve-open"), snap({ unreserveForm: true })).phase === "unreserve-look");
  check("unreserve-open: no control within 15 s → noted, on to Request (a rehearsal gathers what it can)", A(mk("unreserve-open"), snap({ now: T0 + 15001 })).result.unreserve === "no Unreserve control found" && A(mk("unreserve-open", { clicked: T0 }), snap({ now: T0 + 15001, unreserveOpener: true })).result.unreserve === "the dialog did not open");
  check("unreserve-look: the rehearsal presses CANCEL — never the submit button — and waits for the dialog to close", A(mk("unreserve-look"), snap({ unreserveForm: true })).target === "unreserveCancel" && A(mk("unreserve-look", { clicked: T0 }), snap({ unreserveForm: true })).type === "wait" && A(mk("unreserve-look", { clicked: T0 }), snap()).result.unreserve === "dialog found");
  check("unreserve-look: a dialog that will not close stops the run, saying nothing was unreserved", /nothing was unreserved/.test(A(mk("unreserve-look", { clicked: T0 }), snap({ unreserveForm: true, now: T0 + 15001 })).reason));
  check("request-open: no Request button while everything is still reserved → noted after 3 s, not 15", A(mk("request-open"), snap({ now: T0 + 2000 })).type === "wait" && /expected while everything is still reserved/.test(A(mk("request-open"), snap({ now: T0 + 3001 })).result.request) && /disabled/.test(A(mk("request-open"), snap({ now: T0 + 3001, requestButton: { found: true, disabled: true } })).result.request));
  check("request-open / request-look: an offered Request is opened, read and cancelled", A(mk("request-open"), snap({ requestButton: { found: true, disabled: false } })).target === "requestButton" && A(mk("request-look"), snap({ reserveForm: true })).target === "reserveCancel" && A(mk("request-look", { clicked: T0 }), snap()).result.request === "dialog found");
  check("a rehearsal never presses a submit button, and a rehearsal is what runs unless the settings say otherwise in as many words", ["open", "unreserve-open", "unreserve-look", "request-open", "request-look", "next", "return"].every((p) => [snap(), snap({ unreserveForm: true, reserveForm: true, unreserveOpener: true, requestButton: { found: true, disabled: false } })].every((s) => !/submit/i.test(J(A(mk(p), s))))) && E.isReal() === false && mk("open").rehearsal === true);
  check("v1.0.22: a job holds one relative, and after that relative the run goes back to My Reservations — there is no next one", mk("open").queue.length === 1 && mk("open").queue[0].pid === "AAAA-111" && J(A(mk("next"), snap())) === J({ type: "goto", phase: "return", advance: true }));
  check("return: navigate to the list, and finish once there", A(mk("return", { i: 1 }), snap()).url === ORIGIN + "/en/temple/reservations/" && A(mk("return", { i: 1 }), snap({ onList: true })).type === "finish");
  const adv = E.advance(mk("unreserve-look", { clicked: 5, navs: 1, navAt: 3 }), { type: "goto", phase: "request-open", result: { unreserve: "dialog found" } }, T0 + 500);
  check("advance: the result is kept per relative, the step clock and the click / navigation marks start afresh", adv.phase === "request-open" && adv.phaseAt === T0 + 500 && adv.clicked === null && adv.navs === 0 && adv.navAt === null && adv.results[0].unreserve === "dialog found" && adv.i === 0);

  // =======================================================================================
  // 7. One whole rehearsal on a fake Ordinances tab
  // =======================================================================================
  logs.length = 0;
  loc.assigned.length = 0;
  buildList();
  loc.pathname = "/en/temple/reservations/";
  E.startJob(E.model().byPid.get("L7M5-WLQ"));
  check("the run starts by opening Samuel Roberts's Ordinances tab", loc.assigned[0] === ORIGIN + "/en/tree/person/ordinances/L7M5-WLQ" && E.loadJob().navs === 1);
  // the tab has loaded:
  loc.pathname = "/en/tree/person/ordinances/L7M5-WLQ";
  body.textContent = "";
  let submitPressed = 0;
  const opener = h("button", "Unreserve", { "data-testid": "ordinance-unreserve-button" });
  opener.addEventListener("click", () => {
    const form = h("form", "", { "data-testid": "unreserve-form" });
    const cancel = h("button", "Cancel", { "data-testid": "unreserve-cancel-button" });
    const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button", disabled: "" });
    cancel.addEventListener("click", () => form.remove());
    submit.addEventListener("click", () => submitPressed++);
    form.add(h("h2", "Unreserve Ordinances"), h("p", "All selected ordinances will be unreserved and made available to others."), h("input", "", { type: "checkbox", name: "INITIATORY" }), h("span", "Initiatory"), h("input", "", { type: "checkbox", name: "ENDOWMENT" }), h("span", "Endowment"), cancel, submit);
    body.add(form);
  });
  // (the account menu and a contributor chip are buttons too — v1.0.23 keeps their texts out of the findings)
  body.add(h("button", "Pat Account"), h("div", "", { "data-testid": "person-ordinances-list" }).add(h("span", "Initiatory"), h("span", "Reserved"), h("button", "ssomeotherpatron1"), opener));
  let t = Date.now() + 1000;
  const stepType = () => (E.step((t += 200)) || {}).type;
  const seq = [stepType(), stepType(), stepType(), stepType(), stepType()];
  check("on the tab: page read → Unreserve pressed → its dialog read → Cancel pressed → dialog gone", seq.join(",") === "goto,click,goto,click,goto" && body.querySelectorAll('[data-testid="unreserve-form"]').length === 0 && submitPressed === 0, seq.join(","));
  check("the console names the page's markers and buttons, and what FamilySearch's dialog holds — its texts, both tick boxes, both buttons",
    logs.some((l) => /Ordinances tab of L7M5-WLQ — markers \(2\): ordinance-unreserve-button, person-ordinances-list ;; buttons of this feature \(1\): "Unreserve" #ordinance-unreserve-button ;; 2 other button\(s\) on the page, not listed/.test(l)) &&
    !logs.some((l) => /Pat Account|someotherpatron/.test(l)) &&
    logs.some((l) => /dialog "unreserve-form".*made available to others.*checkboxes \(2\): INITIATORY, ENDOWMENT.*"Cancel" #unreserve-cancel-button, "Unreserve" #unreserve-submit-button \(disabled\)/.test(l)), logs.join("\n"));
  check("the dialog is described once, not at every step", logs.filter((l) => /dialog "unreserve-form"/.test(l)).length === 1);
  check("a banner says what is going on and that nothing is being changed, with a Stop button", /Search Enhancer: rehearsal — Samuel Roberts: opening the Request dialog\. Nothing is changed\./.test(ours("banner")[0].textContent) && ours("banner")[0].querySelectorAll("button")[0].textContent === "Stop");
  check("Request is not offered while everything is still reserved: waited for 3 s, then noted", stepType() === "wait" && (E.step((t += 3100)) || {}).phase === "next" && /no Request button/.test(E.loadJob().results[0].request));
  const back = [stepType(), stepType()];
  check("then back to My Reservations", back.join(",") === "goto,navigate" && loc.assigned[1] === ORIGIN + "/en/temple/reservations/");
  loc.pathname = "/en/temple/reservations/";
  buildList();
  const fin = stepType();
  check("there the run ends: the job is gone, a banner sums up — nothing was changed", fin === "finish" && E.loadJob() === null && !session.has(E.JOB_KEY) && /rehearsal finished, nothing changed — Samuel Roberts: Unreserve — dialog found; Request — no Request button/.test(ours("banner")[0].textContent) && submitPressed === 0, ours("banner")[0] && ours("banner")[0].textContent);
  check("with no job a step does nothing", E.step((t += 200)) === null);

  // v1.0.9 — the findings travel with the job (the console of the Ordinances tab is gone by the
  // time the tab is back on the list) and the final banner hands them over.
  const copied = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: (x) => (copied.push(x), Promise.resolve()) } }, configurable: true });
  E.receive(null, null, null, ["GET /service/tree/tree-data/reservations/list/<user>?sharedWithTemple=false ×1 → {list:{…}}"]);
  const copyBtn = ours("banner")[0].querySelectorAll("button")[0];
  check("the final banner offers \"Copy the findings\" instead of asking for console lines", copyBtn.textContent === "Copy the findings" && !/F12/.test(ours("banner")[0].textContent));
  copyBtn.click();
  await wait();
  const found = copied[0] || "";
  check("the findings: a header, the summary, the page's data and requests, then every step of the run in order",
    copied.length === 1 && /^Search Enhancer for FamilySearch v.* — extend-reservation rehearsal findings\nrehearsal finished, nothing changed — /.test(found) && /request seen: GET .*reservations\/list\/<user>/.test(found) &&
    found.indexOf("rehearsal started for L7M5-WLQ \"Samuel Roberts\" [I, E]") >= 0 && found.indexOf("rehearsal started for L7M5-WLQ \"Samuel Roberts\" [I, E]") < found.indexOf("Ordinances tab of L7M5-WLQ — markers") && found.indexOf("Ordinances tab of L7M5-WLQ — markers") < found.indexOf("dialog \"unreserve-form\""), found);
  check("…including what was logged on the Ordinances tab: the list row's texts, the page's markers, each press, the dialog, each result",
    /list row of L7M5-WLQ \(found by marker\), its texts in order: Samuel Roberts \| 1849–Deceased • L7M5-WLQ \| B \| Completed/.test(found) && /step "unreserve-open": pressing unreserveOpener <button> #ordinance-unreserve-button "Unreserve"/.test(found) &&
    /step "unreserve-look": pressing unreserveCancel <button> #unreserve-cancel-button "Cancel"/.test(found) && /L7M5-WLQ: unreserve — dialog found/.test(found) && /L7M5-WLQ: request — no Request button/.test(found) && /dialog "unreserve-form" on \/en\/tree\/person\/ordinances\/<id>/.test(found));
  check("the button says so once the text is on the clipboard", /^Copied ✓/.test(copyBtn.textContent));
  const tick1 = h("input", "", { type: "checkbox", name: "ENDOWMENT" });
  const labelled = h("form").add(h("label").add(tick1, h("span", "Endowment")), h("input", "", { type: "checkbox", "aria-label": "Initiatory" }));
  check("a dialog's tick boxes are described with what they are for", /checkboxes \(2\): ENDOWMENT "Endowment", \? "Initiatory"/.test(E.describeForm(labelled)), E.describeForm(labelled));

  // Stop, and a job gone stale
  E.startJob(E.model().byPid.get("L7M5-WLQ"));
  E.step((t += 200));
  ours("banner")[0].querySelectorAll("button")[0].click();
  check("Stop ends the run at once in a rehearsal and says nothing was changed", E.loadJob() === null && /stopped — Stop pressed; nothing was changed/.test(ours("banner")[0].textContent));
  E.saveJob(E.newJob({ pid: "AAAA-111", name: "A", ords: [], expires: null }, 5000), 5000);
  check("a job left over from more than 15 minutes ago is dropped, not resumed", E.loadJob(5000 + 14 * 60000) !== null && E.loadJob(5000 + 16 * 60000) === null && !session.has(E.JOB_KEY));

  // =======================================================================================
  // 8. The switch
  // =======================================================================================
  loc.pathname = "/en/temple/reservations/";
  buildList();
  E.tick();
  check("tick with the switch on: the lines are there", ours("row").length === 5);
  E.saveJob(E.newJob({ pid: "AAAA-111", name: "A", ords: [], expires: null }));
  values["temple.extend"] = false;
  E.tick();
  check("switched off: everything of ours leaves the page, and a job in progress is dropped", body.querySelectorAll("[data-fsse-extend]").length === 0 && E.loadJob() === null);
  buildList();
  E.tick();
  check("…and stays off: a fresh page gets nothing", body.querySelectorAll("[data-fsse-extend]").length === 0 && E.enabled() === false);
  values["temple.extend"] = true;
  globalThis.FSSE.settings.loaded = false;
  E.tick();
  check("while the settings are still loading nothing is added", body.querySelectorAll("[data-fsse-extend]").length === 0);
  globalThis.FSSE.settings.loaded = true;
  E.tick();
  check("switched on again: back without a reload", ours("row").length === 5);
  loc.pathname = "/en/temple/shared";
  E.tick();
  check("on another temple page the lines are removed", ours("row").length === 0);
  const manifest = require(path.join(SRC, "..", "manifest.json"));
  const fsBlock = manifest.content_scripts.find((c) => c.js.includes("src/content.js")).js;
  check("the manifest loads extend.js before content.js, with no new permission and no new host", fsBlock.indexOf("src/extend.js") > 0 && fsBlock.indexOf("src/extend.js") < fsBlock.indexOf("src/content.js") && J(manifest.permissions) === J(["storage"]) && manifest.content_scripts.length === 5);

  // =======================================================================================
  // 9. v1.0.10 — the real run for one relative, built from Kevin's findings of 2026-11-26
  //    (Alfred Robert Darley G7W9-WCV: one box in the Unreserve dialog, ticked; the Request
  //    dialog with every requestable ordinance ticked, also a Sealing to Spouse that was never
  //    reserved; "you have 120 days to complete them").
  // =======================================================================================
  const SP_BOX = "G7W9-WCV_SEALING_TO_PARENTS_MP6B-4DC_KCMD-LW4";
  const SS_BOX = "G7W9-WCV_SEALING_TO_SPOUSE_LRBK-W8Y";
  check("the real run is on only when \"Rehearse only\" is switched off in as many words", (() => {
    const was = E.isReal();
    values["temple.extendRehearsal"] = true;
    const on = E.isReal();
    values["temple.extendRehearsal"] = false;
    return was === false && on === false && E.isReal() === true;
  })());

  // ---- the engine table ----
  const R0 = 5000000;
  const mkR = (phase, extra, ords) => {
    const j = E.newJob({ pid: "G7W9-WCV", name: "Alfred Robert Darley", ords: (ords || ["SP"]).map((letter) => ({ letter })), expires: new Date(2026, 10, 25) }, R0, true);
    return Object.assign(j, { phase }, extra);
  };
  const bx = (id, on, disabled) => ({ id, on: !!on, disabled: !!disabled, pid: "G7W9-WCV", type: /PARENTS/.test(id) ? "sealingToParents" : /SPOUSE/.test(id) ? "sealingToSpouse" : /INITIATORY/.test(id) ? "initiatory" : /ENDOWMENT/.test(id) ? "endowment" : null });
  const sn = (o) => Object.assign({ now: R0 + 100, steps: 99, ordPid: "G7W9-WCV", onList: false, pageReady: true, hidden: false, unreserveOpener: true, requestButton: { found: true, disabled: false }, unreserveForm: false, reserveForm: false,
    unreserveBoxes: [], unreserveSubmit: { found: false, disabled: false }, reserveBoxes: [], reserveSubmit: { found: false, disabled: false }, reserveTerm: "", form110: false, dataSeen: true, dataBlock: "", saysUnreserved: false, saysRequested: false, blocked: "", maxed: "" }, o);
  const uOpen = { unreserveForm: true, unreserveSubmit: { found: true, disabled: false } };
  const rOpen = { reserveForm: true, reserveSubmit: { found: true, disabled: false } };
  const released = [{ id: SP_BOX, letter: "SP" }];
  const withReleased = (phase, extra) => { const j = mkR(phase, extra); j.queue[0].released = released; return j; };
  check("a real job is marked as one, and its steps go through the real table", mkR("open").rehearsal === false && A(mkR("unreserve-open"), sn({ unreserveForm: true })).phase === "unreserve-set" && A(mkR("unreserve-open"), sn()).target === "unreserveOpener");
  // v1.0.11 — Kevin's first real run (Francis Lambert GNDD-46Z, 2026-11-26): the Sealing to Parents
  // was unreserved, and FamilySearch's Request dialog then read "Sealing to Parents. Please resolve
  // the possible duplicates before reserving this ordinance." with no box for it.
  const FS_REFUSAL = "Sealing to Parents. Please resolve the possible duplicates before reserving this ordinance.";
  check("open (real): once the tab is ready the run first looks at the Request dialog; a rehearsal goes on as before", A(mkR("open"), sn()).phase === "request-peek" && A(mk("open"), snap()).phase === "unreserve-open");
  check("request-peek: Request offered → opened; nothing in the way → Cancel, on to Unreserve with the look noted",
    A(mkR("request-peek"), sn()).target === "requestButton" && A(mkR("request-peek", { clicked: R0 }), sn({ now: R0 + 900 })).type === "wait" &&
    J(A(mkR("request-peek"), sn(Object.assign({ reserveWarns: [] }, rOpen)))) === J({ type: "click", target: "reserveCancel", then: "unreserve-open", result: { peek: "nothing in the way shown" } }));
  check("request-peek: the dialog already says the ordinance cannot be requested → stopped BEFORE anything is unreserved, the dialog left open",
    (() => { const a = A(mkR("request-peek"), sn(Object.assign({ reserveWarns: [FS_REFUSAL] }, rOpen))); return a.type === "fail" && a.stage === "before" && a.reason.includes(FS_REFUSAL) && /left open/.test(a.reason); })());
  check("request-peek: a refusal about another ordinance does not stop the run, but is noted; one whose ordinance cannot be told does stop it",
    /about other ordinances: Sealing to Spouse\. Please resolve/.test(A(mkR("request-peek"), sn(Object.assign({ reserveWarns: ["Sealing to Spouse. Please resolve the possible duplicates before reserving this ordinance."] }, rOpen))).result.peek) &&
    A(mkR("request-peek"), sn(Object.assign({ reserveWarns: ["Please resolve duplicates and data problems before requesting ordinances."] }, rOpen))).type === "fail");
  check("request-peek: Request not offered before the unreserve → noted after 3 s, on to Unreserve; a dialog that will not open → stopped, nothing changed",
    A(mkR("request-peek"), sn({ requestButton: { found: false, disabled: false }, now: R0 + 3001 })).result.peek === "Request is not offered before the unreserve" && A(mkR("request-peek", { clicked: R0 }), sn({ now: R0 + 15001 })).stage === "before");
  check("unreserve-open: waits for the Request dialog of the look to be gone, then presses Unreserve once", A(mkR("unreserve-open"), sn({ reserveForm: true })).type === "wait" && A(mkR("unreserve-open", { clicked: R0 }), sn({ now: R0 + 300 })).type === "wait" && A(mkR("unreserve-open", { clicked: R0 }), sn({ now: R0 + 900 })).count === "opens" && A(mkR("unreserve-open", { opens: 1 }), sn({ now: R0 + 900 })).type === "wait");
  const refused = (() => { const j = mkR("request-set"); j.queue[0].released = [{ id: SP_BOX, letter: "SP" }]; return A(j, sn(Object.assign({ reserveBoxes: [bx("G7W9-WCV_checkbox", true), bx(SS_BOX, true)], reserveWarns: [FS_REFUSAL] }, rOpen))); })();
  check("request-set: FamilySearch's dialog says why it does not offer the ordinance → stopped AT ONCE (no closing and reopening), with its sentence, the dialog left open",
    refused.type === "fail" && refused.stage === "unreserved" && refused.reason.includes(FS_REFUSAL) && /View Duplicates/.test(refused.reason), J(refused));
  check("…and the red banner then reads: not reserved, FamilySearch's sentence, what to do",
    /Alfred Robert Darley: SP is NOT RESERVED\. FamilySearch's Request dialog \(left open\) says: "Sealing to Parents\. Please resolve the possible duplicates before reserving this ordinance\." Resolve that first/.test(E.failText((() => { const j = mkR("request-set"); j.queue[0].released = [{ id: SP_BOX, letter: "SP" }]; return j; })(), refused)));
  // the data that may tell beforehand
  const rawFrancis = { id: "GNDD-46Z", name: "Francis Lambert", hasPossibleDuplicates: null, requiresPermission: false, rollupStatus: "Invalid",
    baptism: { status: "Completed", canUnreserve: false, whyNotQualifyingReasons: ["COMPLETED"] },
    sealingsToParents: [{ status: "NotReady", statusText: "Not Ready", canReserve: false, canUnreserve: false, hoverText: FS_REFUSAL, whyNotQualifyingReasons: [{ reason: "POSSIBLE_DUPLICATES", personId: "GLJV-LLD" }],
      // the relationships object as Kevin's console paste of 2026-11-26 showed it (v1.0.12)
      relationships: { parent1HasPossibleDuplicates: false, parent2HasPossibleDuplicates: true, spouseGender: null, spouseHasPossibleDuplicates: false, spouseId: null, spouseLifeSpan: null, spouseName: null } }] };
  const sFrancis = listen.slimRow(rawFrancis);
  check("the capture keeps what FamilySearch's data says about why an ordinance cannot be requested — its reasons, its hover text, the flags of the people involved — and reads the Ordinances tab's \"sealingsToParents\" spelling",
    sFrancis.ords.map((o) => o.type).join(",") === "baptism,sealingToParents" && J(sFrancis.ords[1].reasons) === J(["reason=POSSIBLE_DUPLICATES,personId=GLJV-LLD"]) && sFrancis.ords[1].hover === FS_REFUSAL && sFrancis.ords[1].rel === "parent2HasPossibleDuplicates=true" && J(sFrancis.ords[1].dups) === J(["parent2"]) && sFrancis.ords[0].dups === undefined && sFrancis.dup === null && sFrancis.permission === false && sFrancis.rollup === "Invalid", J(sFrancis));
  E.receive([sFrancis, { id: "DUPL-111", name: "D", dup: true, permission: false, ords: [dataOrd("endowment", { comparableExpiryDate: iso(5), reasons: ["POSSIBLE_DUPLICATES"] })] }]);
  check("dataNote: one line per relative for the findings", /^GNDD-46Z: possibleDuplicates=null, requiresPermission=false, rollup=Invalid; SP NotReady "Not Ready" reasons\[reason=POSSIBLE_DUPLICATES,personId=GLJV-LLD\] duplicates\[parent2\] hover"Sealing to Parents\. Please resolve.*people\{parent2HasPossibleDuplicates=true\}$/.test(E.dataNote("GNDD-46Z")) && /no row/.test(E.dataNote("NONE-999")), E.dataNote("GNDD-46Z"));
  check("census: how often the data names a reason or possible duplicates at all", /over 2 relative\(s\): 1 ordinance\(s\) you can unreserve — duplicates flags stated for 0, a request would be refused over possible duplicates for 0; 1 with a reason listed \(POSSIBLE_DUPLICATES ×1\); a parent or the spouse flagged for 1 relative\(s\); the relative's own possible duplicates true for 1, not stated for 1; permission required for 0; flagged: DUPL-111/.test(E.census()), E.census());
  const cDup = E.decorate(E.fromData(E._state.rows.get("DUPL-111")), new Date(), 14);
  check("a relative whose data names possible duplicates of their own, or a reason on a reserved ordinance, is flagged with what the data says", cDup.flags.blocked === true && cDup.flags.doubt === true && cDup.flagged === true && /this relative has possible duplicates/.test(E.flagTexts(cDup).join(" ")) && /E: POSSIBLE_DUPLICATES/.test(E.flagTexts(cDup).join(" ")) && /may block the request/.test(E.flagTexts(cDup).join(" ")), E.flagTexts(cDup).join(" | "));
  // v1.0.12 — the pre-check from the data: who has possible duplicates, read by the kind of ordinance
  const spRow = (dups, extra) => ({ id: "G7W9-WCV", name: "Alfred Robert Darley", dup: null, permission: false, ords: [dataOrd("sealingToParents", Object.assign({ comparableExpiryDate: iso(5), dups }, extra))] });
  const cBlocked = E.decorate(E.fromData(spRow(["parent2"])), new Date(), 14);
  check("a Sealing to Parents whose parent has possible duplicates is BLOCKED: FamilySearch would refuse the request, so it must never be unreserved",
    cBlocked.flags.blocked === true && cBlocked.flagged === true && E.blockText(cBlocked) === "a parent has possible duplicates (SP)" && /a parent has possible duplicates \(SP\)\. It would refuse the request — resolve the duplicates first\./.test(E.flagTexts(cBlocked).join(" ")), E.flagTexts(cBlocked).join(" | "));
  check("…read by the kind of ordinance: the spouse's duplicates do not block a sealing to parents or an endowment, the parents' do not block a sealing to spouse; nobody flagged, or flags not stated → not blocked",
    E.decorate(E.fromData(spRow(["spouse"])), new Date(), 14).flags.blocked === false && E.blockersOf({ type: "endowment", dups: ["parent1", "spouse"] }).length === 0 && E.blockersOf({ type: "sealingToSpouse", dups: ["parent1"] }).length === 0 && J(E.blockersOf({ type: "sealingToSpouse", dups: ["spouse"] })) === J(["the spouse"]) &&
    E.decorate(E.fromData(spRow([])), new Date(), 14).flags.blocked === false && E.decorate(E.fromData(spRow(undefined)), new Date(), 14).flags.blocked === false && E.blockText(cBlocked, ["E"]) === "");
  E.openDialog(cBlocked);
  check("real mode: a blocked relative cannot be ticked at all, and the dialog says why", ticks()[0].disabled === true && ticks()[0].checked === false && /resolve the duplicates first/.test(dialog().textContent));
  press("Unreserve and request again");
  check("…and nothing starts: the dialog stays and says nothing can be started", !!dialog() && E.loadJob() === null && /Cannot be extended until that is resolved/.test(dialog().textContent) && /Nothing can be started/.test(dialog().textContent));
  press("Cancel");
  check("request-peek: the page's data is waited for (4 s at most), and data that says the request would be refused stops the run before anything is pressed",
    A(mkR("request-peek"), sn({ dataSeen: false })).type === "wait" && A(mkR("request-peek"), sn({ dataSeen: false, now: R0 + 4001 })).target === "requestButton" &&
    (() => { const a = A(mkR("request-peek"), sn({ dataBlock: "a parent has possible duplicates (SP)" })); return a.type === "fail" && a.stage === "before" && /FamilySearch's data says a parent has possible duplicates \(SP\); it would refuse the request/.test(a.reason); })());
  check("…and one for whom FamilySearch's data requires permission counts as a 110-year relative", E.flagsOf({ ords: [], permission: true, birthYear: 1800 }, new Date()).young === true);
  check("unreserve-open: no Unreserve button within the time → stopped, nothing changed", (() => { const a = A(mkR("unreserve-open"), sn({ unreserveOpener: false, now: R0 + 15001 })); return a.type === "fail" && a.stage === "before"; })());
  const subU = A(mkR("unreserve-set"), sn(Object.assign({ unreserveBoxes: [bx(SP_BOX, true)] }, uOpen)));
  check("unreserve-set: the one box is ticked as FamilySearch delivers it → Unreserve is pressed, the job noting exactly which box", subU.type === "click" && subU.target === "unreserveSubmit" && subU.then === "unreserve-wait" && J(subU.released) === J(released), J(subU));
  const ie = [bx("G7W9-WCV_INITIATORY", true), bx("G7W9-WCV_ENDOWMENT", false)];
  check("unreserve-set: two reserved ordinances, one not ticked → tick it first", (() => { const a = A(mkR("unreserve-set", null, ["I", "E"]), sn(Object.assign({ unreserveBoxes: ie }, uOpen))); return a.target === "box" && a.id === "G7W9-WCV_ENDOWMENT" && a.form === "unreserve"; })());
  check("unreserve-set: an ordinance that was not asked for is unticked before anything is pressed", (() => { const a = A(mkR("unreserve-set", null, ["I"]), sn(Object.assign({ unreserveBoxes: [bx("G7W9-WCV_INITIATORY", true), bx("G7W9-WCV_ENDOWMENT", true)] }, uOpen))); return a.target === "box" && a.id === "G7W9-WCV_ENDOWMENT"; })());
  check("unreserve-set: …and if it cannot be unticked the run stops with nothing changed", (() => { const a = A(mkR("unreserve-set", null, ["I"]), sn(Object.assign({ unreserveBoxes: [bx("G7W9-WCV_INITIATORY", true), bx("G7W9-WCV_ENDOWMENT", true, true)] }, uOpen))); return a.type === "fail" && a.stage === "before" && /cannot be unticked/.test(a.reason); })());
  check("unreserve-set: right after a press of ours the page is left to settle; no box for the ordinance → wait, then stop with nothing changed",
    A(mkR("unreserve-set", { clicked: R0 }), sn(Object.assign({ unreserveBoxes: [bx(SP_BOX, false)] }, uOpen))).type === "wait" && A(mkR("unreserve-set"), sn(uOpen)).type === "wait" &&
    A(mkR("unreserve-set"), sn(Object.assign({ now: R0 + 6001 }, uOpen))).stage === "before" && A(mkR("unreserve-set"), sn(Object.assign({ unreserveBoxes: [bx(SP_BOX, true)] }, uOpen, { unreserveSubmit: { found: true, disabled: true } }))).type === "wait");
  check("unreserve-set: a box of another person is not this relative's", A(mkR("unreserve-set"), sn(Object.assign({ unreserveBoxes: [Object.assign(bx(SP_BOX, true), { pid: "XXXX-999" })] }, uOpen))).type === "wait");
  check("unreserve-wait: dialog closed → on to Request; still open after the time → stopped, saying it is not known whether the unreserve went through",
    A(mkR("unreserve-wait"), sn({ saysUnreserved: true })).phase === "request-open" && /confirmed/.test(A(mkR("unreserve-wait"), sn({ saysUnreserved: true })).result.unreserve) && A(mkR("unreserve-wait"), sn({ unreserveForm: true, now: R0 + 15001 })).stage === "unsure-unreserve");
  check("a tab in the background does not time out: the clock alone is not enough, and nothing is pressed while the tab is hidden",
    A(mkR("unreserve-wait"), sn({ unreserveForm: true, now: R0 + 15001, steps: 2 })).type === "wait" && A(mkR("unreserve-set"), sn(Object.assign({ hidden: true, unreserveBoxes: [bx(SP_BOX, true)] }, uOpen))).type === "wait");
  check("request-open: the page is given 2.5 s to take the unreserve in, then Request is pressed", A(withReleased("request-open"), sn({ now: R0 + 2000 })).type === "wait" && A(withReleased("request-open"), sn({ now: R0 + 2600 })).target === "requestButton");
  check("request-open: no Request, a disabled one, FamilySearch's own reason, the 110-year form → stopped, the relative reported as NOT reserved",
    A(withReleased("request-open"), sn({ now: R0 + 15001, requestButton: { found: false, disabled: false } })).stage === "unreserved" && /disabled/.test(A(withReleased("request-open"), sn({ now: R0 + 15001, requestButton: { found: true, disabled: true } })).reason) &&
    /FamilySearch says: "Please resolve duplicates/.test(A(withReleased("request-open"), sn({ now: R0 + 15001, requestButton: { found: true, disabled: true }, blocked: "Please resolve duplicates and data problems before requesting ordinances." })).reason) &&
    A(withReleased("request-open"), sn({ now: R0 + 15001, requestButton: { found: false, disabled: false } })).type === "fail");
  // v1.0.17 — FamilySearch's 110-year permission form: the run holds for the user, it does not stop
  check("the 110-year permission form, at any step: the run HOLDS — nothing pressed, no clock running — and knows whether anything has been unreserved yet",
    J(A(mkR("request-peek"), sn({ form110: true }))) === J({ type: "hold", after: false }) && J(A(mkR("unreserve-set"), sn(Object.assign({ form110: true, unreserveBoxes: [bx(SP_BOX, true)] }, uOpen)))) === J({ type: "hold", after: false }) &&
    J(A(withReleased("request-open"), sn({ form110: true, now: R0 + 99999 }))) === J({ type: "hold", after: true }) && A(withReleased("request-set"), sn(Object.assign({ form110: true }, rOpen))).type === "hold" && A(withReleased("request-wait"), sn({ form110: true })).after === true);
  check("…once the form has been answered after the unreserve: FamilySearch's confirmation ends the relative; a later stop says \"check whether it is reserved again\", not \"not reserved\"",
    A(withReleased("request-open", { heldAfter: true }), sn({ saysRequested: true })).result.ok === true && A(withReleased("request-open", { heldAfter: true }), sn({ now: R0 + 15001, requestButton: { found: false, disabled: false } })).stage === "unsure-request" &&
    A(withReleased("request-open"), sn({ saysRequested: true, now: R0 + 2600 })).target === "requestButton");
  const live = [bx("G7W9-WCV_checkbox", true), bx(SP_BOX, true), bx(SS_BOX, true)];
  const untick = A(withReleased("request-set"), sn(Object.assign({ reserveBoxes: live }, rOpen)));
  check("request-set: FamilySearch ticks everything requestable — the Sealing to Spouse that was never reserved is UNTICKED first", untick.type === "click" && untick.target === "box" && untick.form === "reserve" && untick.id === SS_BOX, J(untick));
  const subR = A(withReleased("request-set"), sn(Object.assign({ reserveBoxes: [bx("G7W9-WCV_checkbox", false), bx(SP_BOX, true), bx(SS_BOX, false)], reserveTerm: "You may reserve these ordinances, and then you have 120 days to complete them." }, rOpen)));
  check("request-set: only what was unreserved is ticked → Request is pressed, the dialog's own sentence about the term taken along", subR.target === "reserveSubmit" && subR.then === "request-wait" && /120 days/.test(subR.term), J(subR));
  check("request-set: the box that was unreserved is not ticked → tick it; a box under another name is matched by its ordinance",
    A(withReleased("request-set"), sn(Object.assign({ reserveBoxes: [bx(SP_BOX, false), bx(SS_BOX, false)] }, rOpen))).id === SP_BOX &&
    A(withReleased("request-set"), sn(Object.assign({ reserveBoxes: [bx("G7W9-WCV_SEALING_TO_PARENTS_KCMD-LW4_MP6B-4DC", false)] }, rOpen))).id === "G7W9-WCV_SEALING_TO_PARENTS_KCMD-LW4_MP6B-4DC");
  const stale = sn(Object.assign({ reserveBoxes: [bx(SS_BOX, true)] }, rOpen));
  check("request-set: the dialog does not offer what was unreserved → wait 6 s, close and reopen it twice, then stop: NOT reserved",
    A(withReleased("request-set"), stale).type === "wait" && J(A(withReleased("request-set"), Object.assign({}, stale, { now: R0 + 6001 }))) === J({ type: "click", target: "reserveCancel", then: "request-open", count: "retries" }) &&
    (() => { const a = A(withReleased("request-set", { retries: 2 }), Object.assign({}, stale, { now: R0 + 6001 })); return a.type === "fail" && a.stage === "unreserved" && /does not offer SP/.test(a.reason); })());
  check("request-set: something else ticked that cannot be unticked → stop rather than reserve more than before", /would also request SS/.test(A(withReleased("request-set"), sn(Object.assign({ reserveBoxes: [bx(SP_BOX, true), bx(SS_BOX, true, true)] }, rOpen))).reason));
  check("request-wait → request-check → done: the dialog closes, FamilySearch confirms (or four quiet seconds pass)",
    A(withReleased("request-wait"), sn()).phase === "request-check" && A(withReleased("request-wait"), sn({ reserveForm: true, now: R0 + 15001 })).stage === "unsure-request" &&
    A(withReleased("request-check"), sn({ saysRequested: true })).result.ok === true && A(withReleased("request-check"), sn()).type === "wait" && A(withReleased("request-check"), sn({ now: R0 + 4001 })).result.ok === true &&
    /Max Reservations Exceeded/.test(A(withReleased("request-check"), sn({ maxed: "Max Reservations Exceeded" })).reason));
  check("the tab leaving the relative's page stops the run, with where things stand", A(mkR("unreserve-set"), sn({ ordPid: "OTHR-123" })).stage === "before" && A(withReleased("request-open"), sn({ ordPid: null })).stage === "unreserved");
  check("return (real): the run ends when the list shows a new expiry date, or after 20 s without one",
    A(mkR("return", { i: 1, results: [{ ok: true }] }), sn({ onList: true, ordPid: null, expiry: { "G7W9-WCV": "25 November 2026" } })).type === "wait" &&
    A(mkR("return", { i: 1, results: [{ ok: true }] }), sn({ onList: true, ordPid: null, expiry: { "G7W9-WCV": "26 March 2027" }, reservedNow: { "G7W9-WCV": ["SP"] } })).type === "finish" &&
    // v1.0.19: a new date alone is not enough — everything that was reserved before must show as reserved again
    A(mkR("return", { i: 1, results: [{ ok: true }] }, ["I", "E"]), sn({ onList: true, ordPid: null, expiry: { "G7W9-WCV": "26 March 2027" }, reservedNow: { "G7W9-WCV": ["I"] } })).type === "wait" &&
    J(A(mkR("return", { i: 1, results: [{ ok: true }] }, ["I", "E"]), sn({ onList: true, ordPid: null, now: R0 + 20001, expiry: { "G7W9-WCV": "26 March 2027" }, reservedNow: { "G7W9-WCV": ["I"] } })).reserved) === J({ "G7W9-WCV": ["I"] }) &&
    A(mkR("return", { i: 1, results: [{ ok: true }] }), sn({ onList: true, ordPid: null, expiry: {}, now: R0 + 20001 })).type === "finish");
  const ft = (stage) => E.failText(withReleased("request-open"), { reason: "FamilySearch offers no Request button", stage });
  check("failText: each stage says exactly where things stand",
    ft("unreserved") === "Alfred Robert Darley: SP is NOT RESERVED. FamilySearch offers no Request button. Press Request on this page to reserve again" &&
    /Nothing was changed$/.test(ft("before")) && /Check here whether SP is still reserved/.test(ft("unsure-unreserve")) && /whether SP is reserved again/.test(ft("unsure-request")), ft("unreserved"));

  // ---- our dialog in real mode ----
  loc.pathname = "/en/temple/reservations/";
  buildList();
  E.clearJob();
  E.syncList();
  check("real mode: a relative with months left has no Extend link at all (v1.0.14); the \"more than 120 days left\" flag remains as a guard behind it",
    lineOf("GDW3-13W").children.length === 1 && E.model().byPid.get("GDW3-13W").flags.long === true && E.openDialog(E.model().byPid.get("GDW3-13W")) === null);
  lineOf("GLJX-S49").children[1].click();
  check("real mode, a relative with a printed card (v1.0.16): the real dialog, TICKED, the card mentioned as a note only",
    /Extend this reservation/.test(dialog().textContent) && /the same card can still be used/.test(dialog().textContent) && ticks()[0].checked === true && !/Not ticked because/.test(dialog().textContent) && /for the ordinances below only/.test(dialog().textContent) && /stay unreserved until you press Request yourself/.test(dialog().textContent) &&
    // v1.0.24 (Kevin: "too verbose … perhaps 4 or so lines"): ONE short paragraph above the relative
    dialog().querySelectorAll("p").filter((p) => p.textContent).length === 1 && dialog().querySelectorAll("p")[0].textContent.length < 360);
  press("Cancel");
  // a relative that IS held back: FamilySearch's data lists a reason on the reserved ordinance
  const cDoubt = Object.assign({}, E.model().byPid.get("GLJX-S49"));
  cDoubt.ords = cDoubt.ords.map((o) => Object.assign({}, o, { reasons: ["SOME_REASON"] }));
  E.openDialog(E.decorate(cDoubt, new Date(), 14));
  check("real mode, a relative with a real doubt: NOT ticked", ticks()[0].checked === false && /SOME_REASON/.test(dialog().textContent));
  press("Unreserve and request again");
  // v1.0.15 — Kevin's David Cowan Dickie: the box started unticked, the button closed the dialog, "nothing happened".
  check("…the dialog says why the box is not ticked and how to go ahead", /Not ticked because of the note above\. Tick the box to go ahead anyway\./.test(dialog().textContent));
  const hintOf = () => dialog().querySelectorAll("[data-fsse-extend-hint]")[0];
  const navsBefore = loc.assigned.length;
  check("pressing the button with nothing ticked starts nothing AND keeps the dialog open, saying so", !!dialog() && E.loadJob() === null && hintOf().style.display === "block" && /Nothing is ticked\. Tick the box, or press Cancel\./.test(hintOf().textContent));
  ticks()[0].checked = true;
  press("Unreserve and request again");
  check("…and once the box is ticked the same button starts the run for that relative", !dialog() && !!E.loadJob() && E.loadJob().rehearsal === false && E.loadJob().queue[0].pid === "GLJX-S49" && loc.assigned.length === navsBefore + 1 && loc.assigned[loc.assigned.length - 1] === ORIGIN + "/en/tree/person/ordinances/GLJX-S49");
  E.clearJob();
  loc.assigned.length = 0;
  // v1.0.17 (Kevin): a relative born within the last 110 years was reserved with permission and is extended like any other
  const cYoung = E.decorate(Object.assign({}, E.model().byPid.get("G7W9-WCV"), { birthYear: new Date().getFullYear() - 60 }), new Date(), 14);
  E.openDialog(cYoung);
  check("real mode: a relative born within the last 110 years is offered like any other — ticked, tickable — with a note that the run waits at FamilySearch's permission form",
    cYoung.flags.young === true && cYoung.flagged === false && ticks()[0].disabled !== true && ticks()[0].checked === true && /the run waits for your answer/.test(dialog().textContent) && !/Not ticked because/.test(dialog().textContent));
  check("v1.0.22, real mode: the dialog is for this one relative — \"Extend this reservation\", nothing about several relatives or a run that stops at the first",
    /^Extend this reservation/.test(dialog().textContent) && !/rehearsal/i.test(dialog().textContent) && !/one after the other|ticked below|stops at the first relative|not started/.test(dialog().textContent) && !!dialog().querySelectorAll("button").find((b) => b.textContent === "Unreserve and request again") && ticks().length === 1);
  press("Cancel");
  check("…and nothing on the page offers all of them at once", ours("bulk").length === 0);

  // ---- one whole real run on a fake Ordinances tab shaped like the findings ----
  logs.length = 0;
  loc.assigned.length = 0;
  lineOf("G7W9-WCV").children[1].click();
  check("real mode, Alfred Robert Darley (5 days left, nothing flagged): offered ticked, with what will be pressed", ticks().length === 1 && ticks()[0].checked === true && /Alfred Robert Darley/.test(dialog().textContent) && /SP/.test(dialog().textContent));
  press("Unreserve and request again");
  const rj = E.loadJob();
  check("→ a real job for that one relative; the tab goes to his Ordinances tab", !!rj && rj.rehearsal === false && rj.queue.length === 1 && J(rj.queue[0].ords) === J(["SP"]) && loc.assigned[0] === ORIGIN + "/en/tree/person/ordinances/G7W9-WCV");
  loc.pathname = "/en/tree/person/ordinances/G7W9-WCV";
  body.textContent = "";
  const fs = { reserved: true, unreservedWith: null, requestedWith: null, opens: 0, staleOnce: false };
  const tickBox = (id, on) => { const b = h("input", "", { type: "checkbox", "data-testid": id }); b.checked = on; b.addEventListener("click", () => { b.checked = !b.checked; }); return b; };
  const tickedIn = (form) => form.querySelectorAll('input[type="checkbox"]').filter((b) => b.checked).map((b) => b.getAttribute("data-testid"));
  const fsOpener = h("button", "Unreserve", { "data-testid": "unreserve-button" });
  fsOpener.addEventListener("click", () => {
    const form = h("form", "", { "data-testid": "unreserve-form" });
    const cancel = h("button", "Cancel", { "data-testid": "unreserve-cancel-button" });
    const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button" });
    cancel.addEventListener("click", () => form.remove());
    submit.addEventListener("click", () => { fs.unreservedWith = tickedIn(form); fs.reserved = false; form.remove(); fsOpener.remove(); body.add(h("div", "The selected ordinances were succesfully unreserved.")); });
    form.add(h("h2", "Unreserve Ordinances"), h("p", "All selected ordinances will be unreserved and made available to others."), h("label").add(tickBox(SP_BOX, true), h("span", "Sealing to Parents not printed.")), cancel, submit);
    body.add(form);
  });
  const fsRequest = h("button", "Request", { "data-testid": "ordinance-request-button" });
  fsRequest.addEventListener("click", () => {
    fs.opens++;
    const form = h("form", "", { "data-testid": "reserve-form" });
    const cancel = h("button", "Cancel", { "data-testid": "reserve-cancel-button" });
    const submit = h("button", "Request", { "data-testid": "reserve-dialog-request-button" });
    cancel.addEventListener("click", () => form.remove());
    submit.addEventListener("click", () => { fs.requestedWith = tickedIn(form); fs.reserved = true; form.remove(); body.add(h("div", "The ordinances were successfully requested.")); });
    form.add(h("h2", "Request Family Names"), h("label").add(tickBox("G7W9-WCV_checkbox", true), h("span", "Alfred Robert Darley")));
    // the first time the dialog is drawn from what the page knew BEFORE the unreserve: no SP box
    // (opening 1 is the look before the unreserve; opening 2 is the first one after it)
    if (!fs.reserved && !(fs.staleOnce && fs.opens === 2)) form.add(h("label").add(tickBox(SP_BOX, true), h("span", "Sealing to Parents can be requested.")));
    form.add(h("label").add(tickBox(SS_BOX, true), h("span", "Sealing to Spouse can be requested.")), h("p", "You may reserve these ordinances, and then you have 120 days to complete them."), cancel, submit);
    body.add(form);
  });
  body.add(h("div", "", { "data-testid": "ordinance-action-bar" }).add(fsOpener, fsRequest));
  fs.staleOnce = true;
  // the tab's own data has arrived and says nobody involved has possible duplicates
  E.receive([{ id: "G7W9-WCV", name: "Alfred Robert Darley", dup: null, permission: false, ords: [dataOrd("sealingToParents", { comparableExpiryDate: iso(5), dups: [] })] }]);
  let rt = Date.now() + 1000;
  const trail = [];
  const runUntil = (stop, max) => { for (let k = 0; k < (max || 80) && !stop(); k++) { const a = E.step((rt += 450)); trail.push(a ? a.type + (a.target ? ":" + a.target : a.phase ? ":" + a.phase : "") : "none"); } };
  runUntil(() => fs.unreservedWith);
  check("v1.0.11: first a look at FamilySearch's Request dialog (nothing in the way shown → Cancel); then Unreserve: its dialog opened, its one box left as delivered, FamilySearch's own Unreserve pressed for Sealing to Parents only",
    J(fs.unreservedWith) === J([SP_BOX]) && fs.opens === 1 && trail.join(",") === "goto:request-peek,click:requestButton,wait,click:reserveCancel,wait,click:unreserveOpener,goto:unreserve-set,click:unreserveSubmit" && E.loadJob().results[0].peek === "nothing in the way shown", trail.join(","));
  check("…and before that press the job already knew it was being made (it survives a page load at that moment)", E.loadJob().phase === "unreserve-wait" && J(E.loadJob().queue[0].released) === J(released) && /extending — Alfred Robert Darley: Unreserve pressed\. Keep this tab in front\./.test(ours("banner")[0].textContent));
  runUntil(() => fs.requestedWith);
  check("Request: a first dialog drawn from stale data (no box for what was unreserved) is closed and opened again; then the Sealing to Spouse that was never reserved is unticked and Request pressed for Sealing to Parents ONLY",
    // (the person's own "select all" box, G7W9-WCV_checkbox, is FamilySearch's and is left alone)
    J(fs.requestedWith.filter((id) => !/_checkbox$/.test(id))) === J([SP_BOX]) && !fs.requestedWith.includes(SS_BOX) && fs.opens === 3 && trail.filter((x) => x === "click:reserveCancel").length === 2 && trail.filter((x) => x === "click:box").length >= 1 && trail.filter((x) => x === "click:reserveSubmit").length === 1, J(fs.requestedWith) + " opens " + fs.opens + " " + trail.join(","));
  check("the two buttons that change something were each pressed exactly once", trail.filter((x) => x === "click:unreserveSubmit").length === 1 && trail.filter((x) => x === "click:reserveSubmit").length === 1);
  runUntil(() => loc.assigned.length === 2);
  check("FamilySearch's confirmation seen → back to My Reservations", loc.assigned[1] === ORIGIN + "/en/temple/reservations/" && E.loadJob().results[0].ok === true && /confirmed/.test(E.loadJob().results[0].request));
  loc.pathname = "/en/temple/reservations/";
  buildList();
  body.querySelectorAll("p")[0].textContent = "Reserved: " + inDays(0);
  body.querySelectorAll("p")[1].textContent = "Expires: " + inDays(120);
  runUntil(() => E.loadJob() === null);
  const sum = ours("banner")[0].textContent;
  check("there the run ends with one line: the new expiry date read from the list (v1.0.24 — FamilySearch's term sentence is no longer quoted)",
    E.loadJob() === null && sum.includes(`Search Enhancer: extended — Alfred Robert Darley: SP, new expiry date ${inDays(120)} (was ${inDays(5)}). `) && !/120 days|The button copies/.test(sum), sum);
  check("…and the steps of the run can be copied", ours("banner")[0].querySelectorAll("button")[0].textContent === "Copy the findings" && /pressing unreserveSubmit <button> #unreserve-submit-button "Unreserve" — for SP/.test(E.findingsText(E._state.lastJob)) && /pressing tick box G7W9-WCV_SEALING_TO_SPOUSE_LRBK-W8Y/.test(E.findingsText(E._state.lastJob)) && /run findings/.test(E.findingsText(E._state.lastJob)));

  // ---- a second fake tab, and what a stop says (v1.0.22: one relative per run) ----
  // A fake Ordinances tab for one relative with one reserved ordinance (the shape proven live on
  // David Cowan Dickie: Unreserve → its box ticked → Request offers that box and two others, ticked).
  const presses = [];
  function fakeTab(pid, boxId, refuse) {
    loc.pathname = "/en/tree/person/ordinances/" + pid;
    body.textContent = "";
    let reserved = true;
    const opener = h("button", "Unreserve", { "data-testid": "unreserve-button" });
    opener.addEventListener("click", () => {
      const form = h("form", "", { "data-testid": "unreserve-form" });
      const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button" });
      submit.addEventListener("click", () => { presses.push("unreserve " + tickedIn(form).join("+")); reserved = false; form.remove(); body.add(h("div", "The selected ordinances were succesfully unreserved.")); });
      form.add(tickBox(boxId, true), h("button", "Cancel", { "data-testid": "unreserve-cancel-button" }), submit);
      body.add(form);
    });
    const request = h("button", "Request", { "data-testid": "ordinance-request-button" });
    request.addEventListener("click", () => {
      const form = h("form", "", { "data-testid": "reserve-form" });
      const cancel = h("button", "Cancel", { "data-testid": "reserve-cancel-button" });
      const submit = h("button", "Request", { "data-testid": "reserve-dialog-request-button" });
      cancel.addEventListener("click", () => form.remove());
      submit.addEventListener("click", () => { presses.push("request " + tickedIn(form).filter((id) => !/_checkbox$/.test(id)).join("+")); reserved = true; form.remove(); body.add(h("div", "The ordinances were successfully requested.")); });
      form.add(tickBox(pid + "_checkbox", true));
      if (!reserved && !refuse) form.add(tickBox(boxId, true));
      if (!reserved && refuse) form.add(h("p", "Sealing to Parents. Please resolve the possible duplicates before reserving this ordinance."));
      form.add(tickBox(pid + "_SEALING_TO_SPOUSE_XXXX-999", true), h("p", "You may reserve these ordinances, and then you have 120 days to complete them."), cancel, submit);
      body.add(form);
    });
    body.add(opener, request);
    E.receive([{ id: pid, name: "x", dup: null, permission: false, ords: [dataOrd("sealingToParents", { comparableExpiryDate: iso(5), dups: [] })] }]);
  }
  const oneOf = () => { loc.pathname = "/en/temple/reservations/"; buildList(); E.receive([]); return E.syncList().byPid.get("G7W9-WCV"); };
  loc.assigned.length = 0;
  presses.length = 0;
  E.startJob(oneOf(), true);
  check("a real job is for one relative, whose Ordinances tab is opened", E.loadJob().rehearsal === false && E.loadJob().queue.length === 1 && loc.assigned[0] === ORIGIN + "/en/tree/person/ordinances/G7W9-WCV" && /^extending — Alfred Robert Darley: /.test(E.progressText(E.loadJob())), E.progressText(E.loadJob()));
  fakeTab("G7W9-WCV", "G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222");
  runUntil(() => loc.assigned.length === 2);
  check("…it is unreserved and requested again (its own ordinance only), then the run goes straight back to My Reservations", J(presses) === J(["unreserve G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222", "request G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222"]) && loc.assigned[1] === ORIGIN + "/en/temple/reservations/", J(presses) + " " + loc.assigned.join(" "));
  E.clearJob();
  // FamilySearch refuses the request after the unreserve
  loc.assigned.length = 0;
  presses.length = 0;
  E.startJob(oneOf(), true);
  fakeTab("G7W9-WCV", "G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222", true);
  runUntil(() => E.loadJob() === null);
  check("a request FamilySearch refuses: the run stops and the banner says where this relative stands — nothing about other relatives",
    J(presses) === J(["unreserve G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222"]) && loc.assigned.length === 1 &&
    /Alfred Robert Darley: SP is NOT RESERVED\..*Please resolve the possible duplicates.*Press Request on this page/.test(ours("banner")[0].textContent) && !/Before this|not started|after this/.test(ours("banner")[0].textContent), ours("banner")[0].textContent);
  check("failText: one relative, one plain sentence", (() => {
    const j = E.newJob({ pid: "AAAA-111", name: "A", ords: [{ letter: "E" }], expires: null }, R0, true);
    j.phase = "unreserve-open";
    return E.failText(j, { reason: "no button", stage: "before" }) === "A: no button. Nothing was changed" && E.failText(j, { reason: "it would not close", stage: "unreserved" }) === "A: E is NOT RESERVED. it would not close. Press Request on this page to reserve again";
  })());
  check("Stop asked after an unreserve: the relative is finished, then back to the list", J(A(Object.assign(E.newJob({ pid: "AAAA-111", name: "A", ords: [{ letter: "E" }], expires: null }, R0, true), { phase: "next", stopAsked: true }), sn())) === J({ type: "goto", phase: "return", advance: true }));
  check("the capture never keeps the name of whoever holds a reservation", listen.slimRow({ id: "AAAA-111", endowment: { status: "InProgressPrinted", canUnreserve: true, hoverText: "Endowment printed. Reserved by Some Other Patron." } }).ords[0].hover === "Endowment printed. Reserved by <someone>.");

  // ---- v1.0.19: ONE BOX FOR TWO ORDINANCES (Kevin's run on Samuel Roberts L7M5-WLQ, 2026-11-26:
  //      the Unreserve dialog's single box L7M5-WLQ_INITIATORY_ENDOWMENT; v1.0.18 read it as
  //      "Initiatory", requested only that again and UNTICKED the Endowment — left unreserved) ----
  const PAIR = "L7M5-WLQ_INITIATORY_ENDOWMENT";
  const pairForm = h("form").add(h("input", "", { type: "checkbox", "data-testid": PAIR }), h("input", "", { type: "checkbox", "data-testid": "L7M5-WLQ_checkbox" }), h("input", "", { type: "checkbox", "data-testid": "L7M5-WLQ_SEALING_TO_PARENTS_AAAA-111_BBBB-222" }), h("input", "", { type: "checkbox", "data-testid": "L7M5-WLQ_BAPTISM_CONFIRMATION" }));
  const pb = E.boxesOf(pairForm);
  check("a box name is read for EVERY ordinance it names: the pair box is Initiatory AND Endowment; the person's own box is none; relative ids after a sealing are not ordinances",
    J(pb.map((b) => b.letters)) === J([["I", "E"], [], ["SP"], ["B", "C"]]) && pb[0].pid === "L7M5-WLQ");
  const mkS = (phase, extra) => Object.assign(E.newJob({ pid: "L7M5-WLQ", name: "Samuel Roberts", ords: [{ letter: "I" }, { letter: "E" }], expires: new Date(2027, 0, 3) }, R0, true), { phase }, extra);
  const sbx = (id, on) => ({ id, on, disabled: false, pid: "L7M5-WLQ", letters: E.boxesOf(h("form").add(h("input", "", { type: "checkbox", "data-testid": id })))[0].letters });
  const sSn = (o) => sn(Object.assign({ ordPid: "L7M5-WLQ" }, o));
  const pairU = A(mkS("unreserve-set"), sSn(Object.assign({ unreserveBoxes: [sbx(PAIR, true)], unreserveLetters: ["I", "E"] }, uOpen)));
  check("unreserve-set with the pair box: Unreserve is pressed and the job records BOTH ordinances as released", pairU.target === "unreserveSubmit" && J(pairU.released) === J([{ id: PAIR, letter: "I" }, { id: PAIR, letter: "E" }]), J(pairU));
  const sReleased = (phase, extra) => { const j = mkS(phase, extra); j.queue[0].released = pairU.released; return j; };
  const apart = [sbx("L7M5-WLQ_checkbox", true), sbx("L7M5-WLQ_INITIATORY", true), sbx("L7M5-WLQ_ENDOWMENT", true)];
  const pairR = A(sReleased("request-set"), sSn(Object.assign({ reserveBoxes: apart }, rOpen)));
  check("request-set: the two ordinances stand apart there — BOTH are kept ticked and Request is pressed (the Endowment is NOT unticked)", pairR.type === "click" && pairR.target === "reserveSubmit", J(pairR));
  check("…an unticked one of the two is ticked first; a sealing offered alongside is unticked",
    A(sReleased("request-set"), sSn(Object.assign({ reserveBoxes: [sbx("L7M5-WLQ_INITIATORY", true), sbx("L7M5-WLQ_ENDOWMENT", false)] }, rOpen))).id === "L7M5-WLQ_ENDOWMENT" &&
    A(sReleased("request-set"), sSn(Object.assign({ reserveBoxes: [...apart, sbx("L7M5-WLQ_SEALING_TO_SPOUSE_KGD3-33N", true)] }, rOpen))).id === "L7M5-WLQ_SEALING_TO_SPOUSE_KGD3-33N");
  check("…and if the dialog offers only one of the two, the run stops and names the other as not offered — never a silent loss", (() => { const a = A(sReleased("request-set", { retries: 2 }), sSn(Object.assign({ now: R0 + 6001, reserveBoxes: [sbx("L7M5-WLQ_INITIATORY", true)] }, rOpen))); return a.type === "fail" && a.stage === "unreserved" && /does not offer E/.test(a.reason); })());
  check("the banner then names both ordinances", /Samuel Roberts: I, E are NOT RESERVED\./.test(E.failText(sReleased("request-set"), { reason: "x", stage: "unreserved" })));
  check("safety net 1 — before Unreserve: an ordinance the dialog lists that no understood box stands for → nothing is pressed",
    (() => { const a = A(mkS("unreserve-set"), sSn(Object.assign({ unreserveBoxes: [sbx("L7M5-WLQ_INITIATORY", true)], unreserveLetters: ["I", "E"] }, uOpen))); return a.type === "fail" && a.stage === "before" && /lists E but no tick box was recognised/.test(a.reason); })());
  const sumJob = sReleased("return", { i: 1, results: [{ ok: true, now: "26 November 2028", missing: ["E"] }] });
  check("safety net 2 — after the run: something reserved before that the list does not show as reserved again is called out, in capitals",
    E.summaryText(sumJob) === "extended — Samuel Roberts: I, E, new expiry date 26 November 2028 (was 3 January 2027). CHECK: E is NOT shown as reserved now — open this relative's Ordinances tab and press Request if needed.", E.summaryText(sumJob));
  // v1.0.23 — the dialog's "120 days" sentence can be about ANOTHER ordinance in it (one the temple
  // holds, left unticked). v1.0.24 — so the summary never quotes it: the new date is the message.
  const far = E.fmtDate(new Date(Date.now() + 730 * 864e5));
  const near = E.fmtDate(new Date(Date.now() + 120 * 864e5));
  const TERM = "You may reserve these ordinances, and then you have 120 days to complete them.";
  const termJob = (now) => { const j = sReleased("return", { i: 1, results: [{ ok: true, now }] }); j.queue[0].term = TERM; return E.summaryText(j); };
  check("the term sentence of FamilySearch's dialog is not in the summary, whatever the new date: one line with the dates",
    termJob(near) === `extended — Samuel Roberts: I, E, new expiry date ${near} (was 3 January 2027).` && termJob(far) === `extended — Samuel Roberts: I, E, new expiry date ${far} (was 3 January 2027).` &&
    (() => { const j = sReleased("return", { i: 1, results: [{ ok: true, now: null }] }); return E.summaryText(j) === "extended — Samuel Roberts: I, E requested again; reload this page to see the new expiry date."; })(), termJob(near) + "\n" + termJob(far));
  // the whole run on a fake tab shaped like his findings
  loc.pathname = "/en/temple/reservations/";
  buildList();
  E.receive([]);
  values["temple.extendDays"] = "60";
  const samuel = E.syncList().byPid.get("L7M5-WLQ");
  values["temple.extendDays"] = "14";
  loc.assigned.length = 0;
  E.startJob(samuel, true);
  loc.pathname = "/en/tree/person/ordinances/L7M5-WLQ";
  body.textContent = "";
  const sr = { reserved: true, un: null, rq: null };
  const srOpener = h("button", "Unreserve", { "data-testid": "unreserve-button" });
  srOpener.addEventListener("click", () => {
    const form = h("form", "", { "data-testid": "unreserve-form" });
    const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button" });
    submit.addEventListener("click", () => { sr.un = tickedIn(form); sr.reserved = false; form.remove(); body.add(h("div", "The selected ordinances were succesfully unreserved.")); });
    form.add(h("label").add(tickBox(PAIR, true), h("span", "Initiatory not printed."), h("span", "I"), h("span", "Endowment not printed."), h("span", "E")), h("button", "Cancel", { "data-testid": "unreserve-cancel-button" }), submit);
    body.add(form);
  });
  const srRequest = h("button", "Request", { "data-testid": "ordinance-request-button" });
  srRequest.addEventListener("click", () => {
    const form = h("form", "", { "data-testid": "reserve-form" });
    const cancel = h("button", "Cancel", { "data-testid": "reserve-cancel-button" });
    const submit = h("button", "Request", { "data-testid": "reserve-dialog-request-button" });
    cancel.addEventListener("click", () => form.remove());
    submit.addEventListener("click", () => { sr.rq = tickedIn(form).filter((id) => !/_checkbox$/.test(id)); sr.reserved = true; form.remove(); body.add(h("div", "The ordinances were successfully requested.")); });
    if (!sr.reserved) form.add(tickBox("L7M5-WLQ_checkbox", true), tickBox("L7M5-WLQ_INITIATORY", true), tickBox("L7M5-WLQ_ENDOWMENT", true));
    form.add(h("p", "Sealing to Parents. Please resolve the possible duplicates before reserving this ordinance."), h("span", "SP"), h("p", "Sealing to Spouse. Please resolve the possible duplicates before reserving this ordinance."), h("span", "SS"), cancel, submit);
    body.add(form);
  });
  body.add(srOpener, srRequest);
  E.receive([{ id: "L7M5-WLQ", name: "Samuel Roberts", dup: null, permission: false, ords: [dataOrd("initiatory", { dups: [] }), dataOrd("endowment", { dups: [] })] }]);
  trail.length = 0;
  runUntil(() => sr.rq);
  check("Samuel Roberts on the test double: the pair box unreserves both, and Request is pressed with BOTH Initiatory and Endowment ticked — nothing unticked",
    J(sr.un) === J([PAIR]) && J(sr.rq) === J(["L7M5-WLQ_INITIATORY", "L7M5-WLQ_ENDOWMENT"]) && trail.filter((x) => x === "click:box").length === 0 && /nothing about I, E; about other ordinances/.test(E.loadJob().results[0].peek), J(sr.rq) + " " + trail.join(","));
  E.clearJob();
  // the "Possible Duplicates · View Duplicates" mark, read by the ordinance it stands under
  loc.pathname = "/en/tree/person/ordinances/G7W9-WCV";
  body.textContent = "";
  const markForm = h("form", "", { "data-testid": "reserve-form" }).add(
    h("p", "Endowment not printed."), h("span", "E"),
    h("p", "Sealing to Parents not printed."), h("span", "SP"), h("span", "Parents"), h("span", "Some Father"), h("span", "Some Mother"), h("span", "Possible Duplicates"), h("a", "View Duplicates"),
    h("p", "Sealing to Spouse can be requested."), h("span", "SS"), h("span", "Spouse"), h("span", "Some Wife"), h("button", "Cancel", { "data-testid": "reserve-cancel-button" }), h("button", "Request", { "data-testid": "reserve-dialog-request-button" }));
  body.add(h("button", "Unreserve", { "data-testid": "unreserve-button" }), h("button", "Request", { "data-testid": "ordinance-request-button" }), markForm);
  E.saveJob(mkR("request-peek", { phaseAt: Date.now() }));
  const markSnap = E.snapshot(Date.now(), E.loadJob());
  check("the mark is attributed to the ordinance whose line precedes it", J(markSnap.reserveDupLetters) === J(["SP"]));
  check("request-peek: the mark under an ordinance of the run stops it before anything is unreserved; under another ordinance it does not",
    (() => { const a = A(mkR("request-peek"), sn(Object.assign({ reserveDupLetters: ["SP"] }, rOpen))); return a.type === "fail" && a.stage === "before" && /shows possible duplicates for SP/.test(a.reason); })() &&
    A(mkR("request-peek"), sn(Object.assign({ reserveDupLetters: ["SS"] }, rOpen))).target === "reserveCancel");
  E.clearJob();

  // ---- a run that cannot finish: FamilySearch will not take the request ----
  loc.pathname = "/en/temple/reservations/";
  buildList();
  E.receive([]);
  loc.assigned.length = 0;
  E.syncList();
  E.startJob(E.model().byPid.get("GLJX-S49"), true);
  loc.pathname = "/en/tree/person/ordinances/GLJX-S49";
  body.textContent = "";
  const WILEY_BOX = "GLJX-S49_SEALING_TO_PARENTS_AAAA-111_BBBB-222";
  let wileyUnreserved = 0;
  const wOpener = h("button", "Unreserve", { "data-testid": "unreserve-button" });
  wOpener.addEventListener("click", () => {
    const form = h("form", "", { "data-testid": "unreserve-form" });
    const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button" });
    submit.addEventListener("click", () => { wileyUnreserved++; form.remove(); wOpener.remove(); });
    form.add(tickBox(WILEY_BOX, true), h("button", "Cancel", { "data-testid": "unreserve-cancel-button" }), submit);
    body.add(form);
  });
  body.add(wOpener, h("button", "Request", { "data-testid": "ordinance-request-button", disabled: "" }), h("p", "Please resolve duplicates and data problems before requesting ordinances."));
  trail.length = 0;
  runUntil(() => E.loadJob() === null, 80);
  const red = ours("banner")[0].textContent;
  check("Request blocked after the unreserve: the run stops and says, in red, that the ordinance is NOT reserved, with FamilySearch's own reason and what to do",
    wileyUnreserved === 1 && E.loadJob() === null && /stopped — Robert Ellsworth Wiley: SP is NOT RESERVED\. FamilySearch says: "Please resolve duplicates and data problems before requesting ordinances\."\. Press Request on this page to reserve again\./.test(red) &&
    /b3261e/.test(ours("banner")[0].style.cssText) && loc.assigned.length === 1, red);

  // ---- v1.0.13: a reservation made after the temple took the first one (the row Kevin's console showed) ----
  const rawAlt = { id: "ALTR-111", name: "X", comparableDateExpiry: "", dateExpiry: "",
    alternateReservationDetails: { comparableDateExpiry: "2027-03-26T20:09:27.930", dateExpiry: "26 March 2027", comparableDateReserved: "2026-11-26T20:09:27.222", dateReserved: "26 November 2026", ownerName: "someone" },
    sealingToSpouse: { status: "InProgressNotPrinted", statusText: "Not Printed", canUnreserve: true, primaryReservationAssignedToTemple: true, reservedDate: "31 December 2023", comparableReservedDate: "2023-12-31T15:38:18.237",
      alternateReservationDetails: { reservedDate: "26 November 2026", comparableReservedDate: "2026-11-26T20:09:27.222", expiryDate: "26 March 2027", comparableExpiryDate: "2027-03-26T20:09:27.930", ownerName: "someone" },
      relationships: { parent1HasPossibleDuplicates: false, parent2HasPossibleDuplicates: false, spouseHasPossibleDuplicates: false } } };
  const sAlt = listen.slimRow(rawAlt);
  const cAlt = E.decorate(E.fromData(sAlt), new Date(2026, 10, 26), 14);
  check("an ordinance the temple holds, reserved again by the user: the dates are those of the user's (alternate) reservation — never a name from it — and it is a 120-day reservation",
    sAlt.ords[0].alternate === true && sAlt.ords[0].templeHeld === true && sAlt.ords[0].expiryDate === "26 March 2027" && sAlt.ords[0].reservedDate === "26 November 2026" && sAlt.dateExpiry === "26 March 2027" && !/someone/.test(J(sAlt)) &&
    !!cAlt.expires && cAlt.extendable === true && cAlt.days >= 119 && cAlt.days <= 121 && cAlt.flags.short === true && /the temple holds the first one/.test(E.noteTexts(cAlt).join(" ")) && E.flagTexts(cAlt).length === 0 && J(sAlt.ords[0].dups) === J([]), J(sAlt) + " days " + cAlt.days);

  // ---- v1.0.12: the tab's own data says a parent has possible duplicates → stopped before any press ----
  loc.pathname = "/en/tree/person/ordinances/G7W9-WCV";
  body.textContent = "";
  let fsPresses = 0;
  const bOpener = h("button", "Unreserve", { "data-testid": "unreserve-button" });
  const bRequest = h("button", "Request", { "data-testid": "ordinance-request-button" });
  bOpener.addEventListener("click", () => fsPresses++);
  bRequest.addEventListener("click", () => fsPresses++);
  body.add(bOpener, bRequest);
  E.receive([spRow(["parent2"])]);
  E.saveJob(mkR("open", { phaseAt: Date.now() }));
  check("the snapshot reads the refusal off the page's own data for the relative and ordinances of the run", E.snapshot(Date.now(), E.loadJob()).dataBlock === "a parent has possible duplicates (SP)" && E.snapshot(Date.now(), E.loadJob()).dataSeen === true);
  trail.length = 0;
  runUntil(() => E.loadJob() === null, 20);
  check("…and the run stops there: none of FamilySearch's buttons was pressed, the banner says nothing was changed and why",
    fsPresses === 0 && E.loadJob() === null && trail.join(",") === "goto:request-peek,fail" &&
    /stopped — Alfred Robert Darley: FamilySearch's data says a parent has possible duplicates \(SP\); it would refuse the request until that is resolved\. Nothing was changed\./.test(ours("banner")[0].textContent), trail.join(",") + " | " + ours("banner")[0].textContent);

  // ---- v1.0.17: FamilySearch's permission form comes up after the unreserve → the run holds, then carries on ----
  body.textContent = "";
  const permForm = h("form", "", { "data-testid": "110-year-form" }).add(h("p", "Permission is required to request ordinances for a person born in the last 110 years."), h("button", "I have permission", { "data-testid": "i-have-permission-button" }));
  let permPressed = 0;
  permForm.querySelectorAll("button")[0].addEventListener("click", () => permPressed++);
  body.add(h("button", "Request", { "data-testid": "ordinance-request-button" }), permForm);
  const held = withReleased("request-open", { phaseAt: Date.now() - 60000 });
  E.saveJob(held);
  rt = Date.now();
  const h1 = E.step((rt += 450));
  const h2 = E.step((rt += 60000));
  check("the permission form up for a minute after the unreserve: the run holds — no stop, no press of FamilySearch's form — and the banner says what is waited for and that the ordinance is not reserved meanwhile",
    h1.type === "hold" && h2.type === "hold" && !!E.loadJob() && E.loadJob().heldAfter === true && permPressed === 0 &&
    /waiting for you — answer FamilySearch's 110-year permission form for Alfred Robert Darley; the run then carries on\. Until then SP is not reserved\./.test(ours("banner")[0].textContent), ours("banner")[0].textContent);
  permForm.remove();
  body.add(h("div", "The ordinances were successfully requested."));
  const h3 = E.step((rt += 450));
  check("…the form answered and FamilySearch's confirmation shown: the relative is done", h3.type === "goto" && h3.phase === "next" && E.loadJob().results[0].ok === true && /after its permission form/.test(E.loadJob().results[0].request));
  E.clearJob();

  // ---- v1.0.20: the Ordinances tab's data arriving AFTER the first note (Kevin's run on GNDD-SNP) ----
  const lateRun = (arrives) => {
    loc.assigned.length = 0;
    presses.length = 0;
    E.startJob(oneOf(), true);
    fakeTab("G7W9-WCV", "G7W9-WCV_SEALING_TO_PARENTS_AAAA-111_BBBB-222");
    E.receive([]); // the tab has not received its data yet
    rt = Date.now() + 1000;
    E.step((rt += 450));
    if (arrives) E.receive([{ id: "G7W9-WCV", name: "x", dup: null, permission: false, ords: [dataOrd("sealingToParents", { comparableExpiryDate: iso(5), dups: [] })] }]);
    runUntil(() => presses.length >= 1, 40);
    const text = E.findingsText(E.loadJob());
    E.clearJob();
    return text;
  };
  const lateYes = lateRun(true);
  check("data that arrives after the first note is noted once more, when the look at the Request dialog begins",
    /before anything is pressed — G7W9-WCV: the page's data has no row/.test(lateYes) && (lateYes.match(/arrived before the look at the Request dialog — G7W9-WCV: possibleDuplicates=null/g) || []).length === 1, lateYes.slice(-900));
  const lateNo = lateRun(false);
  check("…and data that never arrives is said so: the check was skipped, the run went on to the dialog", /Ordinances tab data: none for G7W9-WCV by the time the look at the Request dialog began \(waited 4 s\)/.test(lateNo) && !/arrived before the look/.test(lateNo), lateNo.slice(-900));

  // ---- v1.0.21: the findings never name whoever holds a reservation (Kevin's rehearsal on GLJX-S49:
  //      "Sealing to Parents printed. Reserved by <contact name>." in the row, the dialog and a box label) ----
  check("a holder's name is left out of a row's texts, a dialog's texts and a tick-box label alike",
    E._unnamed('Sealing to Parents printed. Reserved by SomePatron. | SP | Printed') === "Sealing to Parents printed. Reserved by <someone>. | SP | Printed" &&
    E._unnamed('checkboxes (1): X_SEALING_TO_PARENTS "Sealing to Parents printed. Reserved by Some Other Patron" ✓') === 'checkboxes (1): X_SEALING_TO_PARENTS "Sealing to Parents printed. Reserved by <someone>" ✓' &&
    E._unnamed("Reserved: 25 November 2023 | Expires: 25 November 2026") === "Reserved: 25 November 2023 | Expires: 25 November 2026");
  E._state.notes.length = 0;
  E._note("list row — Endowment printed. Reserved by SomePatron. | E");
  check("…and every note passes through it", E._state.notes[0] === "list row — Endowment printed. Reserved by <someone>. | E");
  E._state.notes.length = 0;
  check("the capture leaves the \"visible to all\" flags of the people involved out of an ordinance's flags",
    !("rel" in listen.slimRow({ id: "AAAA-111", sealingToParents: { status: "InProgressPrinted", canUnreserve: true, relationships: { parent1VisibleToAll: true, parent2VisibleToAllWhenUsingFamilySearchApps: true, parent1HasPossibleDuplicates: false } } }).ords[0]) ||
    !/Visible/.test(listen.slimRow({ id: "AAAA-111", sealingToParents: { status: "InProgressPrinted", canUnreserve: true, relationships: { parent1VisibleToAll: true, parent1HasPossibleDuplicates: false } } }).ords[0].rel || ""));

  // ---- Stop ----
  E.saveJob(mkR("unreserve-set"));
  E.askStop();
  check("Stop before Unreserve was pressed: the run ends at once, nothing changed", E.loadJob() === null && /before anything was unreserved; nothing was changed/.test(ours("banner")[0].textContent));
  E.saveJob(withReleased("request-open"));
  E.askStop();
  check("Stop after Unreserve was pressed: the relative is finished first — the job goes on, marked to stop afterwards", !!E.loadJob() && E.loadJob().stopAsked === true && /Stopping once this is reserved again/.test(ours("banner")[0].textContent));
  E.clearJob();
  values["temple.extendRehearsal"] = true;
  check("with \"Rehearse only\" switched on the row link rehearses again", E.isReal() === false);

  // =======================================================================================
  // v1.0.28 — the demo (Advanced: "Extend reservations: demo"). Kevin, 2026-11-27: "a fake temple
  // ordinance reservation that is about to expire … Clicking on Extend … will effectively walk
  // through the steps but will not actually unreserve and reserve the target person."
  // =======================================================================================
  {
    E.clearJob();
    E.receive([], []);
    loc.pathname = "/en/temple/reservations/";
    loc.assigned.length = 0;
    values["temple.extendDays"] = "14";
    values["temple.extendRehearsal"] = false; // the REAL run is on — the demo must still change nothing
    buildList();
    let dm = E.syncList();
    const fsExpires = (pid) => body.querySelectorAll(`[data-testid="table-row-${pid}"]`)[0].querySelectorAll("p")[1].textContent;
    check("demo off (the default): nothing is pretended — Samuel Roberts, 38 days away, has no link", E.demoOn() === false && dm.demoPid === null && lineOf("L7M5-WLQ").children.length === 1 && lineOf("L7M5-WLQ").children[0].textContent === "38 days left");
    values["temple.extendDemo"] = true;
    dm = E.syncList();
    const chip = lineOf("L7M5-WLQ").children[0];
    check("demo on: the reservation that expires soonest OUTSIDE the window is shown as expiring in 5 days, marked as a demo, with an Extend link",
      E.demoOn() === true && dm.demoPid === "L7M5-WLQ" && chip.textContent === "expires in 5 days (demo)" && /background/.test(chip.style.cssText) && lineOf("L7M5-WLQ").children[1].textContent === "↻ Extend", chip.textContent);
    check("…its tooltips give the real date and say nothing is changed; FamilySearch's own \"Expires:\" text is not touched",
      chip.title === `Demo (an Advanced setting): the real expiry date is ${inDays(38)}.` && /^Demo: opens FamilySearch's dialogs and cancels them\. Nothing is changed\./.test(lineOf("L7M5-WLQ").children[1].title.replace(/\s+/g, " ")) &&
      fsExpires("L7M5-WLQ") === "Expires: " + inDays(38), lineOf("L7M5-WLQ").children[1].title);
    check("…one relative only: the really expiring rows and the far-off one are as before",
      lineOf("G7W9-WCV").children[0].textContent === "expires in 5 days" && lineOf("GDW3-13W").children.length === 1 && lineOf("GDW3-13W").children[0].textContent === "175 days left" && ours("row").filter((n) => /\(demo\)/.test(n.textContent)).length === 1);
    const dc = dm.byPid.get("L7M5-WLQ");
    check("the demo's relative: the same person and ordinances, a pretended date, the real one kept, never \"too long left\"",
      dc.demo === true && dc.days === E.DEMO_DAYS && dc.inWindow === true && E.fmtDate(dc.expires) === inDays(5) && E.fmtDate(dc.realExpires) === inDays(38) && dc.flags.long === false && dc.flagged === false && dc.ords.map((o) => o.letter).join() === "I,E" &&
      dm.byPid.get("GDW3-13W").demo === undefined && dm.byPid.get("GDW3-13W").flags.long === true);
    values["temple.extendDays"] = "90";
    check("the pick follows the window: with 90 days Samuel Roberts is really inside it, so the demo moves to the next one out", E.model().demoPid === "GDW3-13W" && E.model().byPid.get("L7M5-WLQ").demo === undefined);
    values["temple.extendDays"] = "14";
    E.syncList();
    lineOf("L7M5-WLQ").children[1].click();
    check("its Extend link → our dialog as a demo: the real date, what happens, \"Nothing is changed\", one short paragraph, the box ticked",
      !!dialog() && /^Extend this reservation — demo/.test(dialog().textContent) && dialog().textContent.includes(`really expires on ${inDays(38)}`) && /cancels it\. Nothing is changed\./.test(dialog().textContent) &&
      dialog().querySelectorAll("p")[0].textContent.length < 260 && ticks().length === 1 && ticks()[0].checked === true, dialog() && dialog().textContent.slice(0, 300));
    check("…with \"Start the demo\" — and no button of the real run, although the real run is switched on", E.isReal() === true && !!dialog().querySelectorAll("button").find((b) => b.textContent === "Start the demo") && !dialog().querySelectorAll("button").find((b) => /Unreserve and request again|Rehearse/.test(b.textContent)));
    press("Start the demo");
    const dj = E.loadJob();
    check("Start the demo → a job that is a rehearsal and says it is a demo, for that relative; the tab goes to his Ordinances tab",
      !dialog() && !!dj && dj.rehearsal === true && dj.demo === true && dj.queue.length === 1 && dj.queue[0].pid === "L7M5-WLQ" && dj.queue[0].expires === inDays(5) && dj.queue[0].realExpires === inDays(38) &&
      loc.assigned.length === 1 && loc.assigned[0] === ORIGIN + "/en/tree/person/ordinances/L7M5-WLQ", J(dj));
    // the engine: a demo leaves each dialog up for a moment, then presses Cancel — never a submit
    const mkD = (phase, extra) => Object.assign(mk(phase, extra), { demo: true });
    check("engine: the Unreserve dialog stays up for the pause, then CANCEL is pressed; the same for Request",
      A(mkD("unreserve-look"), snap({ unreserveForm: true })).type === "wait" && A(mkD("unreserve-look"), snap({ unreserveForm: true, now: T0 + E.DEMO_PAUSE_MS + 1 })).target === "unreserveCancel" &&
      A(mkD("request-look"), snap({ reserveForm: true })).type === "wait" && A(mkD("request-look"), snap({ reserveForm: true, now: T0 + E.DEMO_PAUSE_MS + 1 })).target === "reserveCancel" &&
      A(mk("unreserve-look"), snap({ unreserveForm: true })).target === "unreserveCancel");
    check("engine: a demo never presses a submit button and never enters the real run's steps",
      mkD("open").rehearsal === true && A(mkD("open"), snap()).phase === "unreserve-open" &&
      ["open", "unreserve-open", "unreserve-look", "request-open", "request-look", "next", "return"].every((p) => [snap(), snap({ now: T0 + 20000, unreserveForm: true, reserveForm: true, unreserveOpener: true, requestButton: { found: true, disabled: false } })].every((s) => !/submit/i.test(J(A(mkD(p), s))))));
    check("the banner of a demo says where a real run would press",
      E.progressText(mkD("unreserve-look")) === "demo — A: the Unreserve dialog — a real run presses Unreserve here; the demo cancels. Nothing is changed." &&
      E.progressText(mkD("request-look")) === "demo — A: the Request dialog — a real run requests the same ordinances here; the demo cancels. Nothing is changed." &&
      E.progressText(mkD("unreserve-open")) === "demo — A: opening the Unreserve dialog. Nothing is changed.");
    // one whole demo on a fake Ordinances tab
    loc.pathname = "/en/tree/person/ordinances/L7M5-WLQ";
    body.textContent = "";
    let pressed = 0;
    let cancelled = 0;
    const openerD = h("button", "Unreserve", { "data-testid": "unreserve-button" });
    openerD.addEventListener("click", () => {
      const form = h("form", "", { "data-testid": "unreserve-form" });
      const cancel = h("button", "Cancel", { "data-testid": "unreserve-cancel-button" });
      const submit = h("button", "Unreserve", { "data-testid": "unreserve-submit-button" });
      cancel.addEventListener("click", () => { cancelled++; form.remove(); });
      submit.addEventListener("click", () => pressed++);
      form.add(h("h2", "Unreserve Ordinances"), h("input", "", { type: "checkbox", "data-testid": "L7M5-WLQ_INITIATORY_ENDOWMENT", checked: "" }), cancel, submit);
      body.add(form);
    });
    body.add(openerD);
    let td = Date.now() + 1000;
    const stepD = (ms) => (E.step((td += ms || 200)) || {}).type;
    const seqD = [stepD(), stepD(), stepD(), stepD()];
    check("on the tab: page read → Unreserve opened → its dialog up, and left up", seqD.join(",") === "goto,click,goto,wait" && body.querySelectorAll('[data-testid="unreserve-form"]').length === 1 && cancelled === 0, seqD.join(","));
    check("…while the banner says what a real run would do here", /Search Enhancer: demo — Samuel Roberts: the Unreserve dialog — a real run presses Unreserve here; the demo cancels\. Nothing is changed\./.test(ours("banner")[0].textContent), ours("banner")[0].textContent);
    check("after the pause Cancel is pressed and the dialog is gone", stepD(E.DEMO_PAUSE_MS + 100) === "click" && cancelled === 1 && body.querySelectorAll('[data-testid="unreserve-form"]').length === 0 && pressed === 0);
    const restD = [stepD(), stepD(), stepD(3100), stepD(), stepD()];
    check("then Request (not offered while everything is reserved), and back to My Reservations", restD.join(",") === "goto,wait,goto,goto,navigate" && loc.assigned[1] === ORIGIN + "/en/temple/reservations/", restD.join(","));
    loc.pathname = "/en/temple/reservations/";
    buildList();
    const finD = stepD();
    check("there the demo ends: the job gone, one line that nothing was changed — and FamilySearch's Unreserve was never pressed",
      finD === "finish" && E.loadJob() === null && /Search Enhancer: demo finished, nothing was changed — Samuel Roberts: a real run ends here with the new expiry date\. $/.test(ours("banner")[0].textContent) && ours("banner")[0].querySelectorAll("button")[0].textContent === "Copy the findings" && pressed === 0, ours("banner")[0] && ours("banner")[0].textContent);
    check("the findings of a demo say that it was one", /extend-reservation demo findings\ndemo finished, nothing was changed/.test(E.findingsText(E._state.lastJob)) && /demo started for L7M5-WLQ/.test(E.findingsText(E._state.lastJob)));
    // A real run of another day, with the demo still switched on: the new expiry date it reports is
    // read off the list as FamilySearch shows it, never the pretended one.
    const realJob = E.newJob(E.model(null, true).byPid.get("L7M5-WLQ"), null, true);
    check("a real run reads the list without the demo: the true date, even for the relative the demo has picked",
      E.model().byPid.get("L7M5-WLQ").demo === true && E.model(null, true).demoPid === null && realJob.rehearsal === false && realJob.demo === undefined && E.snapshot(Date.now(), realJob).expiry["L7M5-WLQ"] === inDays(38));
    values["temple.extendDemo"] = false;
    dm = E.syncList();
    check("demo switched off: the pretended line is gone, the row shows its real days again", dm.demoPid === null && lineOf("L7M5-WLQ").children.length === 1 && lineOf("L7M5-WLQ").children[0].textContent === "38 days left" && E.openDialog(dm.byPid.get("L7M5-WLQ")) === null);
    values["temple.extendRehearsal"] = true;
  }

  console.log(fails ? `\n${fails} FAILURE(S)` : "\nall extend checks passed");
  process.exit(fails ? 1 : 0);
})();
