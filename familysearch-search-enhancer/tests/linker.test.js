// linker.test.js — the Source Linker "📍 compare" map links (v0.2.80–81): pure helpers (dates,
// labels, place completion, Google Maps URLs) and the text-node scan / pair / inject cycle on
// fake DOMs — the Florence M Brain linker page from Kevin's 2026-09-15 screenshots (1901
// census vs P6QN-SGS) including the v0.2.80 phantoms (hidden labels, texts far from any
// label), a <br>-structured fact whose values are bare text nodes, and a table-ish fact.
// Run: node tests/run.js linker
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

// ---- minimal DOM: elements + text nodes with their own boxes ---------------------------
const sib = (n) => {
  const p = n.parentElement;
  if (!p) return null;
  const i = p.childNodes.indexOf(n);
  return i >= 0 ? p.childNodes[i + 1] || null : null;
};
function txt(s, rect) {
  return { nodeType: 3, textContent: s, parentElement: null, parentNode: null, _rect: rect || null, get nextSibling() { return sib(this); } };
}
const proto = {
  nodeType: 1,
  appendChild(c) { return this.insertBefore(c, null); },
  insertBefore(c, ref) {
    const old = c.parentElement; // a real insertBefore MOVES a node: detach it from its previous parent first (v0.2.129's unclip relies on it)
    if (old) {
      old.childNodes = old.childNodes.filter((n) => n !== c);
      old.children = old.children.filter((n) => n !== c);
    }
    c.parentElement = c.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(c);
    else this.childNodes.splice(i, 0, c);
    this.children = this.childNodes.filter((n) => n.nodeType === 1);
    return c;
  },
  remove() {
    const p = this.parentElement;
    if (!p) return;
    p.childNodes = p.childNodes.filter((n) => n !== this);
    p.children = p.children.filter((n) => n !== this);
    this.parentElement = this.parentNode = null;
  },
  getAttribute(n) { return n in this._attrs ? this._attrs[n] : null; },
  setAttribute(n, v) { this._attrs[n] = String(v); },
  getBoundingClientRect() { return this._rect; },
  addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
  click(opts) {
    const ev = Object.assign({ preventDefault() { ev.prevented = true; }, stopPropagation() { ev.stopped = true; } }, opts || {});
    for (const fn of this._handlers.click || []) fn(ev);
    return ev;
  },
  get nextSibling() { return sib(this); },
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); },
  set textContent(s) {
    const t = txt(String(s));
    t.parentElement = t.parentNode = this;
    this.childNodes = [t];
    this.children = [];
  },
};
function mk(tag, kids, attrs, rect) {
  const n = Object.create(proto);
  Object.assign(n, { tagName: tag.toUpperCase(), childNodes: [], children: [], parentElement: null, parentNode: null, _attrs: Object.assign({}, attrs || {}), _rect: rect || { top: 0, left: 0, width: 100, height: 20 }, _handlers: {}, style: {} });
  for (const k of kids || []) n.appendChild(typeof k === "string" ? txt(k) : k);
  return n;
}
const box = (top, left) => ({ top, left, width: 300, height: 24 });
const leaf = (text, top, left, tag) => mk(tag || "div", [text], {}, box(top, left));

globalThis.FSSE = { log() {}, deepElements: () => [], wrapTip: (t) => t };
globalThis.location = { pathname: "/en/search/linker", search: "?ark=/61903/1:1:XSDV-T51&id=P6QN-SGS", origin: "https://www.familysearch.org" };
globalThis.innerWidth = 2000;
globalThis.getComputedStyle = (el) => (el && el._cs) || {}; // v0.2.129: a fixture element's `_cs` plays its computed style (clamp / overflow)
globalThis.document = {
  createElement: (t) => mk(t, []),
  createRange: () => ({
    selectNodeContents(n) { this.n = n; },
    getBoundingClientRect() { return this.n._rect || (this.n.parentElement && this.n.parentElement._rect) || { top: 0, left: 0, width: 0, height: 0 }; },
  }),
};
require(path.join(SRC, "linker.js"));
const L = FSSE.linker;
globalThis.fetch = null; // no geocoder until the v0.2.82 section stubs one — a click must never reach the network here

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};

// ---- pure helpers -------------------------------------------------------------------
check("isLinkerPage on /search/linker", L.isLinkerPage());
check("isDateText: years and full dates", ["1897", "31 Mar 1901", "31 March 1901", "March 1901", "about 1896", "from 1901 to 1911", "1896–1901", "bef. 1900"].every(L.isDateText));
check("isDateText rejects places / words / lifespans with a dash", !["Kingswood, Gloucestershire", "Bristol", "Single", "Florence M Brain", "1897-", ""].some(L.isDateText));
check("parseLabel record side", JSON.stringify(L.parseLabel("Birth")) === JSON.stringify({ fact: "Birth", tree: false, placeFact: true, noPlace: false, titled: false }));
check("parseLabel tree side with sources chip", JSON.stringify(L.parseLabel("Birth • 2 Sources")) === JSON.stringify({ fact: "Birth", tree: true, placeFact: true, noPlace: false, titled: false }));
check("parseLabel: a Custom / Other Event or Fact is titled (its first line names it); ordinary facts are not",
  ["Custom Event • 0 Sources", "Custom Fact", "Other Event • 1 Source", "Other Fact"].every((t) => L.parseLabel(t).titled) && !["Residence • 1 Source", "Birth", "Marriage", "Occupation", "Other (Marital Status) • 1 Source"].some((t) => L.parseLabel(t).titled));
check("parseLabel Other (…) is not a place fact — and the fact inside decides noPlace", (() => { const x = L.parseLabel("Other (Marital Status) • 1 Source"); return x && x.fact === "Other (Marital Status)" && x.tree && !x.placeFact && x.noPlace; })());
check("parseLabel: facts whose value is never a place (v0.2.124)",
  ["Marital Status", "Occupation • 1 Source", "Name", "Sex • 4 Sources", "Education", "Race", "Cause of Death"].every((t) => L.parseLabel(t).noPlace && !L.parseLabel(t).placeFact) &&
    ["Residence", "Birth • 2 Sources", "Military Service", "Event", "Other (Residence)"].every((t) => !L.parseLabel(t).noPlace) && L.parseLabel("Other (Residence)").placeFact);
check("parseLabel rejects values, chips, headers and titles", ["Florence M Brain", "Different", "• 2 Sources", "England and Wales, Census, 1901", "Kingswood, Gloucestershire", "Person of Record and Spouse", "4 Tags Automatically Added", "Others on Record (0)"].every((t) => L.parseLabel(t) === null));
// v0.2.128 — the record-index vocabulary (the Sources tab's Indexed Information) by shape.
check("parseLabel: every '<fact> Place' record-index field is a place fact",
  ["Event Place", "Event Place (Original)", "Birth Place", "Marriage Place", "Residence Place", "Father's Birthplace", "Mother’s Birthplace", "Military Service Place", "Registration District", "Place of Origin", "Immigration Place"].every((t) => { const x = L.parseLabel(t); return x && x.placeFact && !x.noPlace && !x.tree && !x.titled && x.fact === t; }));
check("parseLabel: date / year / name / number / details fields are labels whose value is never a place",
  ["Event Date", "Source Date", "Birth Year (Estimated)", "Source Details", "Record Number", "Line Number", "Mother's Maiden Name", "Father's Name", "Household Identifier", "Indexing Project (Batch) Number", "GS Film Number", "Document Type", "Age at Death", "Relationship to Head of Household"].every((t) => { const x = L.parseLabel(t); return x && x.noPlace && !x.placeFact; }));
check("parseLabel: a person surnamed Place, a cemetery, a place and a lower-case phrase are not labels; a label text is never a place value",
  ["Francis Place", "Mary Ann Place", "Karrakatta Cemetery", "York, Western Australia, Australia", "no place", "Date", "Nathanael Eli Trew"].every((t) => L.parseLabel(t) === null) && !L.looksLikePlace("Event Place", { placeFact: true, afterDate: true, first: true }) && !L.looksLikePlace("Source Date", { placeFact: true, first: true }));
check("looksLikePlace rejects section headers / page chrome", !L.looksLikePlace("Children on Record (0)", { placeFact: true, first: true }) && !L.looksLikePlace("4 Tags Automatically Added", { placeFact: true, first: true }) && !L.looksLikePlace("Siblings in Tree (3)"));
check("looksLikePlace: comma always, single word only for a place fact right after a date / as sole value",
  L.looksLikePlace("Kingswood, Gloucestershire") && L.looksLikePlace("Gloucestershire", { placeFact: true, afterDate: true }) && L.looksLikePlace("Gloucestershire", { placeFact: true, first: true }) &&
    !L.looksLikePlace("Gloucestershire", { placeFact: false, afterDate: true }) && !L.looksLikePlace("Single", { placeFact: true, first: true }) && !L.looksLikePlace("Deceased", { placeFact: true, first: true }) && !L.looksLikePlace("1897", { placeFact: true, first: true }));
check("looksLikePlace: a comma-bearing value of a no-place fact is NOT a place (Norman Monnett's 'Single, without dependents', 2026-10-28)",
  !L.looksLikePlace("Single, without dependents", { noPlace: true, first: true }) && !L.looksLikePlace("Farmer, retired", { noPlace: true, afterDate: true }) && !L.looksLikePlace("Monnett, Norman L", { noPlace: true, first: true }) &&
    L.looksLikePlace("Cumberland, Allegany, Maryland, United States", { placeFact: true, noPlace: false, afterDate: true }) && L.looksLikePlace("Bedford", { placeFact: true, noPlace: false, first: true }));
check("completePlace appends the partner's hierarchy after the shared part",
  L.completePlace("Kingswood, Gloucestershire", "Warmley, Gloucestershire, England, United Kingdom") === "Kingswood, Gloucestershire, England, United Kingdom");
check("completePlace: bare town completes from a same-town partner", L.completePlace("Bristol", "Bristol, Gloucestershire, England, United Kingdom") === "Bristol, Gloucestershire, England, United Kingdom");
check("completePlace: no shared part → unchanged", L.completePlace("Kingswood, Surrey", "Warmley, Gloucestershire, England, United Kingdom") === "Kingswood, Surrey");
check("completePlace: longer or equal stays as is", L.completePlace("Warmley, Gloucestershire, England, United Kingdom", "Kingswood, Gloucestershire") === "Warmley, Gloucestershire, England, United Kingdom");
check("mapsUrl directions (driving, both pins)",
  L.mapsUrl("Kingswood, Gloucestershire, England, United Kingdom", "Warmley, Gloucestershire, England, United Kingdom") ===
    "https://www.google.com/maps/dir/?api=1&origin=Kingswood%2C%20Gloucestershire%2C%20England%2C%20United%20Kingdom&destination=Warmley%2C%20Gloucestershire%2C%20England%2C%20United%20Kingdom&travelmode=driving");
check("mapsUrl single pin", L.mapsUrl("Bristol, Gloucestershire, England") === "https://www.google.com/maps/search/?api=1&query=Bristol%2C%20Gloucestershire%2C%20England");
check("MAPS_SITE reuses one named tab", L.MAPS_SITE.tab === "fsse-maps");

// ---- the Florence page (positions from the screenshots, CSS px) ----------------------
const R = 453; // record column x
const T = 1013; // tree column x
const page = mk("div", [
  leaf("England and Wales, Census, 1901", 166, 276),
  leaf("FamilySearch Tree", 166, 1073),
  leaf("Parents on Record (2)", 261, 216),
  leaf("Annie J Brain (Mother)", 150, 537), leaf("1876-", 167, 537), leaf("DETACH", 151, 914),
  leaf("Ann Jane O'Hara (Mother)", 147, 1051), leaf("1873-Deceased • 9J87-P7P", 166, 1051), leaf("DETAILS", 145, 1444),
  // v0.2.80 phantom: a hidden "Residence" label (a closed menu / a11y copy at 0,0) right before a header
  mk("span", ["Residence"], {}, { top: 0, left: 0, width: 0, height: 0 }),
  leaf("Person of Record and Spouse", 195, R),
  leaf("Tree Person and Spouse", 195, 1005),
  // record column
  mk("div", [
    leaf("Florence M Brain", 225, 493), leaf("1897-", 242, 493),
    leaf("Name", 268, R), leaf("Florence M Brain", 287, R),
    leaf("Sex", 318, R), leaf("Female", 337, R),
    leaf("Birth", 366, R), leaf("1897", 385, R), leaf("Kingswood, Gloucestershire", 403, R),
    leaf("Marital Status", 435, R), leaf("Single, without dependents", 454, R), // Norman Monnett's 1940 census wording (2026-10-28): the comma must NOT earn a pin
    leaf("Residence", 486, R), leaf("31 Mar 1901", 505, R), leaf("Bristol, Gloucestershire, England, United Kingdom", 523, R), leaf("ADD", 508, 938),
  ]),
  // tree column (a screen-reader-only "Birth" duplicate precedes the shown label)
  mk("div", [
    leaf("Florence May Brain", 222, 1051), leaf("1896-Deceased • P6QN-SGS", 241, 1051),
    leaf("Name", 269, T), leaf("• 2 Sources", 269, 1063), leaf("Different", 269, 1143), leaf("Florence May Brain", 289, T),
    leaf("Sex • 2 Sources", 318, T), leaf("Female", 337, T),
    mk("span", ["Birth"], {}, { top: 367, left: 1013, width: 1, height: 1 }),
    leaf("Birth • 2 Sources", 367, T), leaf("Different", 367, 1136), leaf("1896", 387, T), leaf("Warmley, Gloucestershire, England, United Kingdom", 405, T),
    leaf("Other (Marital Status) • 1 Source", 435, T), leaf("Single", 453, T),
    leaf("Residence • 1 Source", 553, T), leaf("1911", 571, T), leaf("Bristol, Gloucestershire, England", 590, T),
    leaf("Residence • 1 Source", 620, T), leaf("1921", 638, T), leaf("St George, Bristol, England, United Kingdom", 656, T),
    leaf("Death • 0 Sources", 700, T), leaf("Deceased", 718, T),
  ]),
  leaf("4 Tags Automatically Added", 715, R), leaf("SHOW ALL", 715, 703),
  leaf("Siblings in Tree (3)", 909, 1001),
  leaf("William James Brain (Brother)", 990, 1051), leaf("1898-Deceased • GJJR-T3H", 1008, 1051), leaf("DETAILS", 988, 1445),
  leaf("Mary Elizabeth Brain (Sister)", 1043, 1051), leaf("1903-Deceased • GJJT-ZSM", 1062, 1051),
  leaf("Others on Record (0)", 1104, 496), leaf("OPEN", 1104, 941),
]);

const scan1 = L.textUnits(page);
check("textUnits reads every text node in document order", scan1.units.length > 40 && scan1.units[0].text === "England and Wales, Census, 1901" && scan1.units[scan1.units.length - 1].text === "OPEN");
const places = L.scanPlaces(scan1.units);
const by = (side, fact, i) => places.filter((p) => p.side === side && p.fact === fact)[i || 0];
check("five places: record Birth + Residence, tree Birth + Residence ×2", places.length === 5, JSON.stringify(places.map((p) => [p.side, p.fact, p.place])));
check("record Birth place + date", by("record", "Birth") && by("record", "Birth").place === "Kingswood, Gloucestershire" && by("record", "Birth").date === "1897");
check("tree Birth place (chips skipped, side from the sources chip; sr-only duplicate label ignored)", by("tree", "Birth") && by("tree", "Birth").place === "Warmley, Gloucestershire, England, United Kingdom" && by("tree", "Birth").date === "1896" && Math.round(by("tree", "Birth").labelTop) === 367);
check("record Residence with a full date", by("record", "Residence") && by("record", "Residence").date === "31 Mar 1901" && by("record", "Residence").place === "Bristol, Gloucestershire, England, United Kingdom");
check("tree Residences 1911 and 1921", by("tree", "Residence", 0).place === "Bristol, Gloucestershire, England" && by("tree", "Residence", 1).place === "St George, Bristol, England, United Kingdom");
check("v0.2.80 phantoms gone: headers, tags line, sibling cards, 'Others on Record' are NOT places",
  !places.some((p) => /Person of Record|Tags|Mary Elizabeth|Others on Record|Tree Person/.test(p.place)));
check("Name / Sex / Marital Status / Death-Deceased yield no place", !places.some((p) => /Name|Sex|Marital|Death|Other/.test(p.fact)));

const pairs = L.pairPlaces(places);
check("exactly one pair: Birth ↔ Birth (labels 366 vs 367)", pairs.length === 1 && pairs[0][0].fact === "Birth" && pairs[0][0].side === "record" && pairs[0][1].side === "tree");
check("Residences NOT paired (rows 486 vs 553/620 — unmatched rows stack)", !by("record", "Residence").partner && !by("tree", "Residence", 0).partner && !by("tree", "Residence", 1).partner);

const spec = L.linkFor(by("tree", "Birth"));
check("pair link: compare, record→tree, short place completed",
  spec.kind === "pair" && spec.text === "📍 compare" &&
    spec.url === "https://www.google.com/maps/dir/?api=1&origin=Kingswood%2C%20Gloucestershire%2C%20England%2C%20United%20Kingdom&destination=Warmley%2C%20Gloucestershire%2C%20England%2C%20United%20Kingdom&travelmode=driving",
  spec.url);
check("pair tooltip names both places as sent", /Record: Kingswood, Gloucestershire, England, United Kingdom\. Tree: Warmley, Gloucestershire, England, United Kingdom\./.test(spec.tip));
check("same URL from the record side of the pair", L.linkFor(by("record", "Birth")).url === spec.url);
const single = L.linkFor(by("record", "Residence"));
check("unpaired place: single-pin map link", single.kind === "single" && single.text === "📍 map" && single.url === "https://www.google.com/maps/search/?api=1&query=Bristol%2C%20Gloucestershire%2C%20England%2C%20United%20Kingdom" && /No place of the same kind/.test(single.tip));

// ---- inject: links inserted after the text, idempotent, refreshed, removed ------------
let opened = [];
FSSE.openUrl = (url, site) => opened.push([url, site && site.tab]);
const injected = L.inject(L.textUnits(page));
const linkOf = (p) => (p.node.nextSibling && p.node.nextSibling.getAttribute && p.node.nextSibling.getAttribute("data-fsse-map") != null ? p.node.nextSibling : null);
check("a link is inserted right after each of the 5 place texts", injected.length === 5 && injected.every((p) => linkOf(p) && linkOf(p).tagName === "A"));
check("link kinds: pair on both Births, single on the Residences",
  linkOf(injected.find((p) => p.side === "tree" && p.fact === "Birth")).getAttribute("data-fsse-map") === "pair" &&
    linkOf(injected.find((p) => p.side === "record" && p.fact === "Residence")).getAttribute("data-fsse-map") === "single");
const treeBirth = injected.find((p) => p.side === "tree" && p.fact === "Birth");
const firstLink = linkOf(treeBirth);
check("the link's own text is not read back as a value", L.textUnits(page).units.every((u) => u.text !== "📍 compare" && u.text !== "📍 map"));
const again = L.inject(L.textUnits(page));
check("second pass is idempotent (same link object, one link per place)", again.length === 5 && linkOf(again.find((p) => p.side === "tree" && p.fact === "Birth")) === firstLink && treeBirth.host.children.length === 1);
const ev = firstLink.click();
check("click opens the compare URL in the reused fsse-maps tab, default + propagation stopped", opened.length === 1 && opened[0][0] === spec.url && opened[0][1] === "fsse-maps" && ev.prevented && ev.stopped);
// the tree re-renders with a corrected birthplace → same link object, new URL
treeBirth.node.textContent = "Kingswood, Gloucestershire, England, United Kingdom";
const after = L.inject(L.textUnits(page));
const tb = after.find((p) => p.side === "tree" && p.fact === "Birth");
check("identical places on both sides → single-pin links, href refreshed in place",
  tb && linkOf(tb) === firstLink && firstLink.getAttribute("data-fsse-map") === "single" && /maps\/search/.test(firstLink._fsseUrl) && /Both sides name the same place/.test(firstLink.getAttribute("title")));
// a text that stops being a place loses its link
treeBirth.node.textContent = "Deceased";
const gone = L.inject(L.textUnits(page));
check("text that is no longer a place: link removed", !gone.some((p) => p.node === treeBirth.node) && treeBirth.host.children.length === 0);

// ---- <br>-structured facts (values are bare text nodes), table-ish fact, geometry side -
globalThis.innerWidth = 1600;
const b = (s, top, left) => txt(s, box(top, left));
const page2 = mk("div", [
  leaf("Person of Record and Spouse", 100, 150),
  // record: <p><b>Birth</b><br>1841<br>Gloucestershire</p>
  mk("p", [mk("b", ["Birth"], {}, box(200, 150)), mk("br"), b("1841", 228, 150), mk("br"), b("Gloucestershire", 256, 150)], {}, { top: 200, left: 150, width: 300, height: 80 }),
  // tree: <p><b>Birth</b><span>• 1 Source</span><br>1840<br>Bitton, Gloucestershire, England</p> (no sources text inside the label → side by x)
  mk("p", [mk("b", ["Birth"], {}, box(202, 900)), mk("span", ["• 1 Source"], {}, box(202, 960)), mk("br"), b("1840", 230, 900), mk("br"), b("Bitton, Gloucestershire, England", 258, 900)], {}, { top: 202, left: 900, width: 300, height: 80 }),
  // record: one text node holding date + place
  mk("p", [mk("b", ["Marriage"], {}, box(300, 150)), mk("br"), b("1862 Bitton, Gloucestershire", 328, 150)], {}, { top: 300, left: 150, width: 300, height: 50 }),
  // record, table-ish: <tr><th>Death</th><td>1850<br>Bristol</td></tr>
  mk("tr", [mk("th", ["Death"], {}, box(400, 150)), mk("td", [b("1850", 400, 300), mk("br"), b("Bristol", 428, 300)], {}, { top: 400, left: 300, width: 200, height: 50 })], {}, { top: 400, left: 150, width: 400, height: 50 }),
  // a "Birth" label whose next text is a header far away → no place
  mk("div", [leaf("Birth", 600, 150), leaf("Children on Record (0)", 700, 150)]),
]);
const p2 = L.scanPlaces(L.textUnits(page2).units);
L.pairPlaces(p2);
check("bare text-node values after <br> are captured (record Gloucestershire; tree Bitton…)",
  p2.some((p) => p.place === "Gloucestershire" && p.side === "record" && p.date === "1841") && p2.some((p) => /^Bitton, Gloucestershire, England$/.test(p.place) && p.side === "tree" && p.date === "1840"), JSON.stringify(p2.map((p) => [p.side, p.fact, p.place])));
check("tree side by x-position when the sources chip is a sibling element", p2.find((p) => /Bitton, Gloucestershire, England$/.test(p.place)).side === "tree");
check("date + place in ONE text node split (Marriage 1862 / Bitton, Gloucestershire)", p2.some((p) => p.fact === "Marriage" && p.date === "1862" && p.place === "Bitton, Gloucestershire"));
check("table-ish fact: values beside the label, later lines aligned with the first value", p2.some((p) => p.fact === "Death" && p.place === "Bristol" && p.date === "1850"));
check("a label whose next text is far below / a header claims nothing", !p2.some((p) => /Children on Record/.test(p.place)) && p2.length === 4);
const pr = p2.find((p) => p.place === "Gloucestershire");
check("pair by geometry: Gloucestershire ↔ Bitton…; completion → 'Gloucestershire, England', which the tree place contains BY NAME → '📍 in Gloucestershire' (v0.2.132): a pin on Bitton, Shift+click the county framed",
  pr.partner && /Bitton/.test(pr.partner.place) && L.linkFor(pr).kind === "within" && L.linkFor(pr).text === "📍 in Gloucestershire" && L.linkFor(pr).url === L.mapsUrl("Bitton, Gloucestershire, England") && L.linkFor(pr).alt === L.mapsUrl("Gloucestershire, England"), L.linkFor(pr).url);
const inj2 = L.inject(L.textUnits(page2));
const glos = inj2.find((p) => p.place === "Gloucestershire");
check("link inserted after the bare text node, inside its <p>, before any following node", linkOf(glos) && glos.host.tagName === "P" && glos.host.childNodes.indexOf(linkOf(glos)) === glos.host.childNodes.indexOf(glos.node) + 1);

// ---- v0.2.82 geocoding: two Kingswoods in Gloucestershire ------------------------------
// Shapes as Nominatim jsonv2 returns them (probed live 2026-09-15): category place/highway/amenity…
const NOMINATIM = {
  Kingswood: [
    { name: "Kingswood", category: "place", type: "town", lat: "51.4605", lon: "-2.5044", importance: 0.5, display_name: "Kingswood, South Gloucestershire, England, United Kingdom", address: { town: "Kingswood", county: "South Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "Kingswood", category: "place", type: "village", lat: "51.6250", lon: "-2.3640", importance: 0.45, display_name: "Kingswood, Stroud, Gloucestershire, England, United Kingdom", address: { village: "Kingswood", city: "Stroud", county: "Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "Kingswood", category: "place", type: "village", lat: "51.2900", lon: "-0.2100", importance: 0.4, display_name: "Kingswood, Reigate and Banstead, Surrey, England, United Kingdom", address: { village: "Kingswood", county: "Surrey", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "Kingswood Road", category: "highway", type: "residential", lat: "51.4600", lon: "-2.5000", importance: 0.2, display_name: "Kingswood Road, Kingswood, South Gloucestershire, England, United Kingdom", address: { road: "Kingswood Road", town: "Kingswood", county: "South Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  Warmley: [
    { name: "Warmley", category: "place", type: "village", lat: "51.4586", lon: "-2.4790", importance: 0.35, display_name: "Warmley, South Gloucestershire, England, United Kingdom", address: { village: "Warmley", county: "South Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  Newport: [
    { name: "Newport", category: "place", type: "city", lat: "51.5842", lon: "-2.9977", importance: 0.6, display_name: "Newport, Wales, United Kingdom", address: { city: "Newport", state: "Wales", country: "United Kingdom", country_code: "gb" } },
    { name: "Newport", category: "place", type: "town", lat: "50.7010", lon: "-1.2938", importance: 0.5, display_name: "Newport, Isle of Wight, England, United Kingdom", address: { town: "Newport", county: "Isle of Wight", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  // v0.2.83 — Kevin's "Saint Georges, Shropshire" (a mis-standardised St George, Bristol): the
  // live results for the three name forms + the full string, as probed 2026-09-15.
  Mangotsfield: [
    { name: "Mangotsfield", category: "place", type: "suburb", lat: "51.4832202", lon: "-2.4848594", importance: 0.3, display_name: "Mangotsfield, Staple Hill and Mangotsfield, Kingswood, South Gloucestershire, England, United Kingdom", address: { suburb: "Mangotsfield", county: "South Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  "Saint Georges": [
    { name: "Saint Georges", category: "highway", type: "residential", lat: "52.0167", lon: "-2.5674", display_name: "Saint Georges, Herefordshire, England, United Kingdom", address: { road: "Saint Georges", county: "Herefordshire", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "Saint Georges", category: "amenity", type: "place_of_worship", lat: "52.6059", lon: "1.0041", display_name: "Saint Georges, Breckland, Norfolk, England, United Kingdom", address: { amenity: "Saint Georges", city: "Breckland", county: "Norfolk", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  "St Georges": [
    { name: "St. Georges", category: "place", type: "suburb", lat: "52.6938", lon: "-2.4360", importance: 0.4, display_name: "St. Georges, Telford, Telford and Wrekin, England, United Kingdom", address: { suburb: "St. Georges", town: "Telford", county: "Telford and Wrekin", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "St Georges", category: "highway", type: "residential", lat: "54.9484", lon: "-3.9251", display_name: "St Georges, Castle Douglas, Dumfries and Galloway, Scotland, United Kingdom", address: { road: "St Georges", town: "Castle Douglas", county: "Dumfries and Galloway", state: "Scotland", country: "United Kingdom", country_code: "gb" } },
  ],
  "St George": [
    { name: "St George", category: "amenity", type: "place_of_worship", lat: "53.4253", lon: "-2.9714", display_name: "St George, Liverpool, England, United Kingdom", address: { amenity: "St George", city: "Liverpool", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "St George", category: "place", type: "suburb", lat: "51.4589", lon: "-2.5342", importance: 0.45, display_name: "St George, Bristol, City of Bristol, England, United Kingdom", address: { suburb: "St George", city: "Bristol", county: "City of Bristol", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "St. George", category: "place", type: "village", lat: "53.2690", lon: "-3.5400", importance: 0.35, display_name: "St. George, Conwy, Wales, United Kingdom", address: { village: "St. George", county: "Conwy", state: "Wales", country: "United Kingdom", country_code: "gb" } },
  ],
  "Saint Georges, Shropshire, England, United Kingdom": [
    { name: "Saint Georges Place", category: "highway", type: "residential", lat: "52.7121549", lon: "-2.7589718", display_name: "Saint Georges Place, Mount Street, Mountfields, Shrewsbury, Shropshire, England, United Kingdom", address: { road: "Saint Georges Place", town: "Shrewsbury", county: "Shropshire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  // v0.2.85 singles
  Bristol: [
    { name: "Bristol", category: "place", type: "city", lat: "51.4538", lon: "-2.5973", importance: 0.7, display_name: "Bristol, City of Bristol, West of England, England, United Kingdom", address: { city: "Bristol", county: "City of Bristol", state_district: "West of England", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
  Siston: [
    { name: "Siston", category: "place", type: "village", lat: "51.4700", lon: "-2.4600", importance: 0.25, display_name: "Siston, South Gloucestershire, England, United Kingdom", address: { village: "Siston", county: "South Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ],
};
// v0.2.88 — Kevin's Herbert Roy Garland: record "Kobe, Japan" vs tree "Kōbe-shi, Hyōgo-ken, Japan"
// (live shape, probed 2026-09-15 with Accept-Language: en — the name is the English one and
// namedetails carries every form).
const KOBE = { name: "Kobe", category: "boundary", type: "administrative", lat: "34.6932379", lon: "135.1943764", importance: 0.6, display_name: "Kobe, Hyogo Prefecture, Japan", address: { city: "Kobe", province: "Hyogo Prefecture", "ISO3166-2-lvl4": "JP-28", country: "Japan", country_code: "jp" }, namedetails: { ref: "281000", name: "神戸市", "name:en": "Kobe", "name:ja": "神戸市", "name:ko": "고베시" } };
NOMINATIM["Kōbe-shi"] = [KOBE];
NOMINATIM.Kobe = [KOBE];
// v1.0.1 — the REST of a place is located too when nothing fits it by address: the counties the
// earlier cases' rests resolve to (live shapes, probed 2026-11-03; the Gloucestershire box is the
// v0.2.132 fixture's, which holds Bristol and Kingswood), and Kevin's Frederick William Garber
// KPHT-ZKX case: the burial "LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania" pinned a
// field in rural Oklahoma — the ONE "Lawnview Cemetery" the map knows in the US; the cemetery
// beside Fox Chase is mapped as "Lawnview Memorial Park" (found only by the bounded bare-name search).
NOMINATIM.Shropshire = [
  { lat: "52.6523394", lon: "-2.7958679", category: "boundary", type: "administrative", place_rank: 12, importance: 0.49, addresstype: "county", name: "Shropshire", display_name: "Shropshire, England, United Kingdom", address: { county: "Shropshire", "ISO3166-2-lvl6": "GB-SHR", state: "England", country: "United Kingdom", country_code: "gb" }, namedetails: { name: "Shropshire", "name:en": "Shropshire" }, boundingbox: ["52.3062639", "52.9983946", "-3.2355408", "-2.2328985"] },
];
NOMINATIM.Gloucestershire = [
  { name: "Gloucestershire", category: "boundary", type: "administrative", addresstype: "county", place_rank: 12, lat: "51.8", lon: "-2.1", importance: 0.7, boundingbox: ["51.3800", "52.1100", "-2.6900", "-1.6200"], display_name: "Gloucestershire, England, United Kingdom", address: { county: "Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
];
const OKLAHOMA_CEMETERY = (name) => ({ lat: "36.2395103", lon: "-97.3889769", category: "landuse", type: "cemetery", place_rank: 24, importance: 0.08, addresstype: "cemetery", name, display_name: `${name}, Noble County, Oklahoma, United States`, address: { cemetery: name, county: "Noble County", state: "Oklahoma", "ISO3166-2-lvl4": "US-OK", country: "United States", country_code: "us" }, namedetails: { name }, boundingbox: ["36.2389362", "36.2400843", "-97.3896264", "-97.3883274"] });
NOMINATIM["LawnView Cemetery"] = [OKLAHOMA_CEMETERY("Lawnview Cemetery")];
NOMINATIM["Unmapped Cemetery"] = [OKLAHOMA_CEMETERY("Unmapped Cemetery")];
NOMINATIM["Fox Chase"] = [
  { lat: "38.0456219", lon: "-85.6927366", category: "boundary", type: "administrative", place_rank: 16, importance: 0.41, addresstype: "city", name: "Fox Chase", display_name: "Fox Chase, Bullitt County, Kentucky, United States", address: { city: "Fox Chase", county: "Bullitt County", state: "Kentucky", country: "United States", country_code: "us" }, namedetails: { name: "Fox Chase", "name:en": "Fox Chase", "_place_name:en": "Fox Chase" }, boundingbox: ["38.0403080", "38.0513590", "-85.6963750", "-85.6786264"] },
  { lat: "40.0771601", lon: "-75.0771797", category: "place", type: "neighbourhood", place_rank: 24, importance: 0.38, addresstype: "neighbourhood", name: "Fox Chase", display_name: "Fox Chase, Northeast Philadelphia, Philadelphia, Philadelphia County, Pennsylvania, 19111, United States", address: { neighbourhood: "Fox Chase", suburb: "Northeast Philadelphia", city: "Philadelphia", county: "Philadelphia County", state: "Pennsylvania", postcode: "19111", country: "United States", country_code: "us" }, namedetails: { name: "Fox Chase" }, boundingbox: ["40.0671601", "40.0871601", "-75.0871797", "-75.0671797"] },
  { lat: "40.0759538", lon: "-75.0835851", category: "railway", type: "station", place_rank: 30, importance: 0.35, addresstype: "railway", name: "Fox Chase", display_name: "Fox Chase, Rhawn Street, Northeast Philadelphia, Philadelphia, Philadelphia County, Pennsylvania, 19111, United States", address: { railway: "Fox Chase", road: "Rhawn Street", city: "Philadelphia", county: "Philadelphia County", state: "Pennsylvania", country: "United States", country_code: "us" }, boundingbox: ["40.0709538", "40.0809538", "-75.0885851", "-75.0785851"] },
  { lat: "39.8565042", lon: "-74.7262704", category: "place", type: "hamlet", place_rank: 20, importance: 0.13, addresstype: "hamlet", name: "Fox Chase", display_name: "Fox Chase, Tabernacle Township, Burlington County, New Jersey, 08088, United States", address: { hamlet: "Fox Chase", county: "Burlington County", state: "New Jersey", country: "United States", country_code: "us" }, boundingbox: ["39.8365042", "39.8765042", "-74.7462704", "-74.7062704"] },
];
// the bare-name search bounded to ±10 mi of Fox Chase (viewbox + bounded=1) — keyed "bounded:<q>" by the fake below
NOMINATIM["bounded:LawnView"] = [
  { lat: "40.0809599", lon: "-75.0963749", category: "landuse", type: "cemetery", place_rank: 24, importance: 0.2, addresstype: "cemetery", name: "Lawnview Memorial Park", display_name: "Lawnview Memorial Park, Hollywood, Abington Township, Montgomery County, Pennsylvania, United States", address: { cemetery: "Lawnview Memorial Park", hamlet: "Hollywood", town: "Abington Township", county: "Montgomery County", state: "Pennsylvania", "ISO3166-2-lvl4": "US-PA", country: "United States", country_code: "us" }, namedetails: { name: "Lawnview Memorial Park" }, boundingbox: ["40.0779567", "40.0842880", "-75.1009429", "-75.0909011"] },
];
const qOf = (search) => new URLSearchParams(search).get("q");
const fetched = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  fetched.push(u.search);
  const q = u.searchParams.get("q");
  if (/Nowhere/.test(q)) throw new Error("network down");
  const key = u.searchParams.get("bounded") === "1" ? "bounded:" + q : q; // v1.0.1: a bounded (viewbox) search answers from its own fixtures
  return { ok: true, json: async () => NOMINATIM[key] || [] };
};
L._geo.gapMs = 0;
check("haversine: Kingswood (South Glos) ↔ Warmley ≈ 1.1 mi; Stroud Kingswood ≈ 13 mi",
  Math.abs(L.haversine({ lat: 51.4605, lon: -2.5044 }, { lat: 51.4586, lon: -2.479 }) - 1.1) < 0.15 && Math.abs(L.haversine({ lat: 51.625, lon: -2.364 }, { lat: 51.4586, lon: -2.479 }) - 12.6) < 1);
check("countryCodeOf from the trailing components", L.countryCodeOf("Kingswood, Gloucestershire, England, United Kingdom") === "gb" && L.countryCodeOf("Brooklyn, Kings, New York, United States") === "us" && L.countryCodeOf("Clonleigh, Donegal, Ireland") === "ie" && L.countryCodeOf("Kingswood") === null);
const kcAll = L.filterCandidates(NOMINATIM.Kingswood, "Kingswood, Gloucestershire, England, United Kingdom");
check("filterCandidates: name-matched settlements with a fit flag; 'Kingswood Road' (a road) dropped", kcAll.length === 3 && kcAll.filter((c) => c.fit).length === 2 && !kcAll.some((c) => /Road/.test(c.name)) && kcAll.every((c) => c.rank === 0));
const kc = L.bestTier(kcAll);
check("bestTier keeps both Gloucestershire Kingswoods (South Gloucestershire counts), drops Surrey",
  kc.length === 2 && kc.every((c) => c.name === "Kingswood" && c.fit) && kc.some((c) => c.label === "Kingswood, South Gloucestershire") && kc.some((c) => c.label === "Kingswood, Stroud, Gloucestershire"), JSON.stringify(kc.map((c) => c.label)));
check("filterCandidates: 'Co. Donegal' matches 'County Donegal'", L.filterCandidates([{ name: "Clonleigh", lat: "54.8", lon: "-7.5", display_name: "Clonleigh, County Donegal, Ireland", address: { village: "Clonleigh", county: "County Donegal", country: "Ireland" } }], "Clonleigh, Co. Donegal, Ireland").length === 1);
check("Isle of Wight Newport: the fitting tier excludes the Welsh one", L.bestTier(L.filterCandidates(NOMINATIM.Newport, "Newport, Isle of Wight, England")).length === 1 && L.bestTier(L.filterCandidates(NOMINATIM.Newport, "Newport, Isle of Wight, England"))[0].label === "Newport, Isle of Wight");
const wc = L.filterCandidates(NOMINATIM.Warmley, "Warmley, Gloucestershire, England, United Kingdom");
const best = L.choosePair(kc, wc);
const PAIR_PAGE = L.mapPageUrl({ a: best.a, b: best.b }, "Kingswood, Gloucestershire, England, United Kingdom", "Warmley, Gloucestershire, England, United Kingdom");
check("mapPageUrl: the two-pin page with both coordinates, labels and the texts as written (v0.2.86)",
  PAIR_PAGE === "src/map.html#a=51.46050%2C-2.50440&al=Kingswood%2C+South+Gloucestershire&at=Kingswood%2C+Gloucestershire%2C+England%2C+United+Kingdom&b=51.45860%2C-2.47900&bl=Warmley%2C+South+Gloucestershire&bt=Warmley%2C+Gloucestershire%2C+England%2C+United+Kingdom", PAIR_PAGE);
check("choosePair picks the Kingswood nearest Warmley (South Gloucestershire, not Stroud)", best && /South Gloucestershire/.test(best.a.label) && best.miles < 2, JSON.stringify(best));
check("coordsUrl: directions by coordinates, 5 decimals, driving", L.coordsUrl(best.a, best.b) === "https://www.google.com/maps/dir/?api=1&origin=51.46050,-2.50440&destination=51.45860,-2.47900&travelmode=driving");

// the page for the click flow
globalThis.innerWidth = 2000;
const page3 = mk("div", [
  leaf("Person of Record and Spouse", 195, R),
  leaf("Birth", 366, R), leaf("1897", 385, R), leaf("Kingswood, Gloucestershire", 403, R),
  leaf("Birth • 2 Sources", 367, T), leaf("1896", 387, T), leaf("Warmley, Gloucestershire, England, United Kingdom", 405, T),
  leaf("Death", 500, R), leaf("1950", 519, R), leaf("Nowhere, Gloucestershire", 537, R),
  leaf("Death • 1 Source", 501, T), leaf("1950", 520, T), leaf("Warmley, Gloucestershire, England, United Kingdom", 538, T),
]);
globalThis.document.nodeType = 9;
globalThis.document.childNodes = [page3];
let fakeWin = null;
globalThis.window = { open: (url, name) => { fakeWin = { url, name, location: { href: url }, focused: 0, focus() { this.focused++; } }; return fakeWin; } };
const p3 = L.inject(L.textUnits(page3));
const kLink = linkOf(p3.find((p) => p.side === "record" && p.fact === "Birth"));
check("before the click: compare link by name, pair recorded on the link", kLink.getAttribute("data-fsse-map") === "pair" && kLink.textContent === "📍 compare" && kLink._fssePair && kLink._fssePair[0] === "Kingswood, Gloucestershire, England, United Kingdom");
opened = [];
kLink.click();
check("click on an unresolved pair opens the named tab at once (inside the click) and shows locating…", fakeWin && fakeWin.name === "fsse-maps" && fakeWin.url === "" && kLink.textContent === "📍 locating…" && opened.length === 0);
(async () => {
  await new Promise((r) => setTimeout(r, 50));
  check("two Nominatim requests, bare names within the country, addressdetails on", fetched.length === 2 && /q=Kingswood&countrycodes=gb/.test(fetched[0]) && /q=Warmley&countrycodes=gb/.test(fetched[1]) && fetched.every((s) => /addressdetails=1/.test(s) && /format=jsonv2/.test(s)));
  check("the tab is navigated to the two-pin page with the South Gloucestershire Kingswood", fakeWin.location.href === PAIR_PAGE && fakeWin.focused >= 1, fakeWin.location.href);
  const p3b = L.inject(L.textUnits(page3));
  const kb = p3b.find((p) => p.side === "record" && p.fact === "Birth");
  check("after locating: both links of the pair read the straight-line distance and carry the coordinates URL",
    linkOf(kb).textContent === "📍 1.1 mi" && linkOf(kb)._fsseUrl === PAIR_PAGE && linkOf(kb)._fsseAlt === L.coordsUrl(best.a, best.b) && linkOf(kb.partner).textContent === "📍 1.1 mi" && /2 places match "Kingswood, Gloucestershire, England, United Kingdom"/.test(linkOf(kb).getAttribute("title")) && /Shift\+click: the Google Maps driving route/.test(linkOf(kb).getAttribute("title")));
  check("candidates cached per place (a second resolve makes no request)", (await L.resolvePair("Kingswood, Gloucestershire, England, United Kingdom", "Warmley, Gloucestershire, England, United Kingdom")).miles === best.miles && fetched.length === 2);
  opened = [];
  linkOf(kb).click();
  check("a resolved pair opens the two-pin page straight away through the reused tab (no fetch, no blank tab)", opened.length === 1 && opened[0][0] === PAIR_PAGE && opened[0][1] === "fsse-maps" && fetched.length === 2);
  opened = [];
  linkOf(kb).click({ shiftKey: true });
  check("Shift+click on a resolved pair opens the Google Maps driving route instead", opened.length === 1 && opened[0][0] === L.coordsUrl(best.a, best.b));
  // failure path: the geocoder is unreachable → open by name, link text restored, pair marked failed
  const dLink = linkOf(p3b.find((p) => p.side === "record" && p.fact === "Death"));
  const before = dLink._fsseUrl;
  fakeWin = null;
  dLink.click();
  await new Promise((r) => setTimeout(r, 50));
  check("geocoder failure: tab navigated by name, text back to compare, pair remembered as failed",
    fakeWin && fakeWin.location.href === before && dLink.textContent === "📍 compare" && L._geo.failed.has(L.pairKey("Nowhere, Gloucestershire, England, United Kingdom", "Warmley, Gloucestershire, England, United Kingdom")), fakeWin && fakeWin.location.href);
  // ---- v0.2.83: Saint/St name forms, settlement ranking, county-less fallback ----------
  check("nameVariants: Saint Georges → St Georges → St George → Saint George; plain names unchanged",
    JSON.stringify(L.nameVariants("Saint Georges")) === JSON.stringify(["Saint Georges", "St Georges", "St George", "Saint George"]) && JSON.stringify(L.nameVariants("Kingswood")) === JSON.stringify(["Kingswood"]) && L.nameVariants("St. Mary Bourne")[1] === "Saint Mary Bourne");
  const sg = L.filterCandidates(NOMINATIM["St Georges"].concat(NOMINATIM["St George"], NOMINATIM["Saint Georges"]), "Saint Georges, Shropshire, England, United Kingdom", L.nameVariants("Saint Georges"));
  check("filterCandidates with name forms: roads dropped, churches rank 1, settlements rank 0, none fits 'Shropshire' (Telford's county is Telford and Wrekin)",
    sg.length === 5 && sg.every((c) => !c.fit) && sg.filter((c) => c.rank === 0).length === 3 && !sg.some((c) => /Castle Douglas|Herefordshire/.test(c.label)), JSON.stringify(sg.map((c) => [c.label, c.rank, c.fit])));
  check("bestTier: nothing fits → settlement namesakes only (Telford, Bristol, Conwy)", L.bestTier(sg).length === 3 && L.bestTier(sg).every((c) => c.rank === 0));
  check("candLabel: 'St George, Bristol' (county 'City of Bristol' adds nothing); 'St. Georges, Telford' (county 'Telford and Wrekin' repeats the town)", sg.some((c) => c.label === "St George, Bristol") && sg.some((c) => c.label === "St. Georges, Telford"));
  const before83 = fetched.length;
  const rsg = await L.resolvePair("Mangotsfield, Gloucestershire", "Saint Georges, Shropshire, England, United Kingdom");
  check("requests: Mangotsfield once (fits at once); Saint Georges → St Georges → St George → the full string → the REST of the place, Shropshire (v1.0.1: it bounds the namesakes)",
    fetched.slice(before83).map(qOf).join(" | ") === "Mangotsfield | Saint Georges | St Georges | St George | Saint Georges, Shropshire, England, United Kingdom | Shropshire", fetched.slice(before83).map(qOf).join(" | "));
  check("→ St. Georges, Telford: the one namesake INSIDE Shropshire's boundary (v1.0.1 — the Bristol St George, 58 mi south of the county, is no longer taken for a 'Shropshire' place); ≈84 mi; the county unmatched by address, matched by the box",
    rsg.b.label === "St. Georges, Telford" && rsg.b.fit === false && rsg.b.bound === "Shropshire, England, United Kingdom" && rsg.b.tailMi === 0 && rsg.a.fit === true && Math.abs(rsg.miles - 84) < 1.5 && rsg.nB === 1, JSON.stringify(rsg));
  const sgSpec = L.linkFor({ side: "record", place: "Mangotsfield, Gloucestershire", partner: { side: "tree", place: "Saint Georges, Shropshire, England, United Kingdom" } });
  check("link: '📍 84 mi', coordinates of St. Georges, Telford, tooltip explains the boundary match and the mis-standardised-place hint",
    sgSpec.text === "📍 84 mi" && /b=52\.69380%2C-2\.43600/.test(sgSpec.url) && /destination=52\.69380,-2\.43600/.test(sgSpec.alt) && /No "Saint Georges" is listed under "Shropshire, England, United Kingdom" by address \(modern boundaries differ from the tree's\), but this one lies inside it, so it was taken — if the tree's place is mis-standardised, the pin shows where its words point\./.test(sgSpec.tip) && !/match/.test(sgSpec.tip), sgSpec.tip);
  // ---- v0.2.85: single places get a real pin -------------------------------------------
  check("pinUrl: a coordinate search (drops a pin)", L.pinUrl({ lat: 51.4538, lon: -2.5973 }) === "https://www.google.com/maps/search/?api=1&query=51.45380,-2.59730");
  const bristolBefore = fetched.length;
  const rb = await L.resolveSingle("Bristol, Gloucestershire, England, United Kingdom", []);
  check("single Bristol: bare name, the full string (the historic county never matches 'City of Bristol'), then the rest — Gloucestershire — which bounds it (v1.0.1): one candidate, inside the county's box, no anchor lookup",
    rb.c.label === "Bristol" && rb.n === 1 && rb.near === null && rb.c.bound === "Gloucestershire, England, United Kingdom" && rb.c.tailMi === 0 && fetched.slice(bristolBefore).map(qOf).join(" | ") === "Bristol | Bristol, Gloucestershire, England, United Kingdom | Gloucestershire", fetched.slice(bristolBefore).map(qOf).join(" | ") + " · " + JSON.stringify(rb.c));
  const kwBefore = fetched.length;
  const rk = await L.resolveSingle("Kingswood, Gloucestershire, England, United Kingdom", ["Warmley, Gloucestershire, England, United Kingdom"]);
  check("ambiguous single Kingswood with a cached anchor (Warmley): the South Gloucestershire one, no new request",
    rk.c.label === "Kingswood, South Gloucestershire" && rk.n === 2 && rk.anchor === "Warmley, Gloucestershire, England, United Kingdom" && rk.miles < 2 && fetched.length === kwBefore, JSON.stringify(rk));
  L._geo.singles.delete("kingswood, gloucestershire, england, united kingdom");
  const sisBefore = fetched.length;
  const rk2 = await L.resolveSingle("Kingswood, Gloucestershire, England, United Kingdom", ["Siston, Gloucestershire, England, United Kingdom"]);
  check("ambiguous single with an uncached anchor: the anchor is looked up once (Kingswood's candidates come from the cache)",
    rk2.c.label === "Kingswood, South Gloucestershire" && rk2.anchor === "Siston, Gloucestershire, England, United Kingdom" && fetched.length === sisBefore + 1 && qOf(fetched[fetched.length - 1]) === "Siston", JSON.stringify(rk2));
  const kSpec = L.linkFor({ side: "record", place: "Kingswood, Gloucestershire, England, United Kingdom", partner: null });
  check("resolved single link: pin URL by coordinates, tooltip names the pin, the candidate count and the anchor",
    kSpec.kind === "single" && kSpec.text === "📍 map" && kSpec.url === "https://www.google.com/maps/search/?api=1&query=51.46050,-2.50440" && /^Pinned at Kingswood, South Gloucestershire\. 2 places match .* nearest Siston, South Gloucestershire \(another place on this page, /.test(kSpec.tip), kSpec.tip);
  // the click flow: a single that is not yet located → blank tab, lookup, pin; a located one → straight to the pin
  page3.appendChild(leaf("Residence", 600, R)); page3.appendChild(leaf("31 Mar 1901", 619, R)); page3.appendChild(leaf("Bristol, Gloucestershire, England, United Kingdom", 637, R));
  page3.appendChild(leaf("Residence • 1 Source", 700, T)); page3.appendChild(leaf("1911", 718, T)); page3.appendChild(leaf("Warmley, Gloucestershire, England, United Kingdom", 736, T));
  const p3c = L.inject(L.textUnits(page3));
  const bLink = linkOf(p3c.find((p) => p.fact === "Residence" && p.side === "record"));
  const wLink = linkOf(p3c.find((p) => p.fact === "Residence" && p.side === "tree"));
  check("an already-located single renders with the pin URL at once; anchors list the page's other places nearest row first",
    bLink && bLink._fsseUrl === L.pinUrl(rb.c) && /Pinned at Bristol\./.test(bLink.getAttribute("title")) && bLink._fsseAnchors[0] === "Warmley, Gloucestershire, England, United Kingdom" && bLink._fsseAnchors.includes("Kingswood, Gloucestershire, England, United Kingdom"), JSON.stringify(bLink && bLink._fsseAnchors));
  opened = [];
  bLink.click();
  check("click on a located single opens the pin through the reused tab, no lookup", opened.length === 1 && opened[0][0] === L.pinUrl(rb.c) && opened[0][1] === "fsse-maps");
  check("an unlocated single still shows the name-search URL and says the click will locate it", wLink && /maps\/search\/\?api=1&query=Warmley/.test(wLink._fsseUrl) && /The click first locates the place/.test(wLink.getAttribute("title")));
  fakeWin = null;
  const wBefore = fetched.length;
  wLink.click();
  check("clicking it opens the tab blank inside the click and shows locating…", fakeWin && fakeWin.url === "" && wLink.textContent === "📍 locating…");
  await new Promise((r) => setTimeout(r, 50));
  const p3d = L.inject(L.textUnits(page3));
  const wLink2 = linkOf(p3d.find((p) => p.fact === "Residence" && p.side === "tree"));
  check("…then the tab is navigated to the pin (Warmley's candidates were cached: no request), the link rewritten",
    fakeWin.location.href === "https://www.google.com/maps/search/?api=1&query=51.45860,-2.47900" && fetched.length === wBefore && wLink2 === wLink && wLink.textContent === "📍 map" && /Pinned at Warmley, South Gloucestershire\./.test(wLink.getAttribute("title")), fakeWin.location.href);
  // ---- v0.2.88: romanised / suffixed names (Kobe) and same-place pairs -----------------
  check("normComp strips accents and Japanese admin suffixes; other names untouched",
    L.normComp("Kōbe-shi") === "kobe" && L.normComp("Hyōgo-ken") === "hyogo" && L.normComp("Co. Donegal") === "donegal" && L.normComp("Saint Georges") === "saint georges" && L.normComp("Kyōto-fu") === "kyoto" && L.normComp("Toronto") === "toronto");
  check("nameVariants: Kōbe-shi also asks for the plain Kobe; plain names gain nothing", JSON.stringify(L.nameVariants("Kōbe-shi")) === JSON.stringify(["Kōbe-shi", "Kobe"]) && JSON.stringify(L.nameVariants("Kingswood")) === JSON.stringify(["Kingswood"]));
  check("countryCodeOf knows Japan", L.countryCodeOf("Kōbe-shi, Hyōgo-ken, Japan") === "jp" && L.countryCodeOf("Kobe, Japan") === "jp");
  const kbBefore = fetched.length;
  const rkobe = await L.resolvePair("Kobe, Japan", "Kōbe-shi, Hyōgo-ken, Japan");
  check("Kobe, Japan ↔ Kōbe-shi, Hyōgo-ken, Japan: both resolve to Kobe (name forms + normalised components), 0 mi, one request each with countrycodes=jp and namedetails",
    rkobe.a.label === "Kobe, Hyogo Prefecture" && rkobe.b.label === "Kobe, Hyogo Prefecture" && rkobe.miles < 0.01 && rkobe.b.fit === true && fetched.slice(kbBefore).map(qOf).join(" | ") === "Kobe | Kōbe-shi" && fetched.slice(kbBefore).every((s) => /countrycodes=jp/.test(s) && /namedetails=1/.test(s)),
    JSON.stringify(rkobe) + " " + fetched.slice(kbBefore).map(qOf).join(" | "));
  const kobeSpec = L.linkFor({ side: "record", place: "Kobe, Japan", partner: { side: "tree", place: "Kōbe-shi, Hyōgo-ken, Japan" } });
  check("same place → '📍 same place', a single pin (never a route from Kobe to Kobe)", kobeSpec.text === "📍 same place" && kobeSpec.kind === "single" && kobeSpec.url === L.pinUrl(rkobe.a) && /Both names resolve to the same place: Kobe, Hyogo Prefecture\./.test(kobeSpec.tip) && !kobeSpec.alt);
  check("filterCandidates matches through namedetails even when the primary name is in another script",
    L.filterCandidates([Object.assign({}, KOBE, { name: "神戸市" })], "Kōbe-shi, Hyōgo-ken, Japan", L.nameVariants("Kōbe-shi")).length === 1);
  // ---- not the linker page → tick is a no-op -----------------------------------------
  globalThis.location.pathname = "/en/tree/person/details/P6QN-SGS";
  check("isLinkerPage false on a person page; tick returns nothing", !L.isLinkerPage() && L.tick() === undefined);

  // ---- v0.2.125: map pins on the PERSON PAGE ---------------------------------------------
  // A composite person page in the shapes the scraper has met live: the Vitals card (label ·
  // "• N Sources" chip · date · place as separate leaves; a "Deceased" death; a burial whose
  // date carries FS's age note as a text of its own and whose place is FS's TWO lines — the
  // free text over the standardised place), a hidden narrow-layout copy at 0×0, a Labs
  // Sources-column title on a Vitals label's line far to the right, a couple block ("Marriage"
  // with the date beside it, the place under the date, a "Children (4)" list with lifespans),
  // Other Information (a residence with its date beside the label, an occupation with a
  // comma, a sole-word immigration place, the census record's "Military Induction" type) and
  // one of our own menu rows.
  check("isPersonPage on the person paths, not on the linker / a search / a pedigree page", (() => {
    const was = globalThis.location.pathname;
    const yes = ["/en/tree/person/details/P6QN-SGS", "/tree/person/sources/P6QN-SGS", "/en/tree/person/P6QN-SGS"].every((p) => (globalThis.location.pathname = p, L.isPersonPage()));
    const no = ["/en/search/linker", "/en/search/record/results", "/en/tree/pedigree/landscape/P6QN-SGS"].every((p) => (globalThis.location.pathname = p, !L.isPersonPage()));
    globalThis.location.pathname = was;
    return yes && no;
  })());
  check("isDateText accepts a date carrying FS's age note; the note alone or a free-text place is no date",
    L.isDateText("13 Feb 1965 (aged 93–94)") && L.isDateText("1965 (about 94)") && !L.isDateText("(aged 93–94)") && !L.isDateText("Karrakatta Cemetery and Crematorium"));
  const V = 300; // the Vitals / Other Information column x
  const hidden = (text) => mk("span", [text], {}, { top: 0, left: 0, width: 0, height: 0 });
  const personPage = mk("div", [
    leaf("Nathaniel Eli Trew", 120, V), leaf("1871–1965 • 9JWT-KH9", 140, V),
    hidden("Birth • 3 Sources"), hidden("12 May 1871"), hidden("York, Western Australia, Australia"),
    leaf("Vitals", 260, V),
    mk("div", [
      leaf("Name • 8 Sources", 300, V), leaf("Trew, Nathaniel Eli", 320, V),
      leaf("Sex • 4 Sources", 350, V), leaf("Male", 370, V),
      leaf("Birth • 3 Sources", 400, V), leaf("12 May 1871", 420, V), leaf("York, Western Australia, Australia", 440, V),
      leaf("Christening • 1 Source", 470, V), leaf("1871", 490, V), leaf("Saint Mary, York, Western Australia, Australia", 510, V),
      leaf("Death • 0 Sources", 540, V), leaf("Deceased", 560, V), leaf('Mary Ann Trew, "Australia, Death Index, 1787-1985"', 540, 1400),
      leaf("Burial • 1 Source", 590, V), leaf("13 Feb 1965", 610, V), leaf("(aged 93–94)", 610, 400),
      leaf("Karrakatta Cemetery and Crematorium", 630, V), leaf("Karrakatta, Nedlands City, Western Australia, Australia", 650, V),
    ]),
    mk("div", [leaf("Sources (8)", 300, 1400), leaf('Nathaniel Eli Trew, "Australia, Births and Baptisms, 1792-1981"', 400, 1400), leaf("View", 400, 1800)]),
    leaf("Family Members", 690, V),
    mk("div", [
      leaf("Spouses and Children", 700, V),
      leaf("Nathaniel Eli Trew", 720, V), leaf("Mary Ann Fuller", 720, 520),
      leaf("Marriage", 745, V), leaf("4 June 1895", 745, 380), leaf("Perth, Western Australia, Australia", 765, 380),
      leaf("Children (4)", 790, V), leaf("Louisa Trew", 810, 320), leaf("1896–1962", 810, 520),
    ]),
    leaf("Other Information", 880, V),
    mk("div", [
      leaf("Residence • 1 Source", 900, V), leaf("1911", 900, 450), leaf("Fremantle, Western Australia, Australia", 920, 450),
      leaf("Occupation • 1 Source", 960, V), leaf("1911", 980, V), leaf("Farmer, retired", 1000, V),
      leaf("Immigration", 1030, V), leaf("1908", 1050, V), leaf("Siston", 1070, V),
      leaf("Military Induction", 1100, V), leaf("2 March 1943", 1120, V), leaf("ALTOONA PENNSYLVANIA", 1140, V),
    ]),
    mk("div", ["1900 US Federal Census — Nathaniel Trew, Bristol, England"], { "data-fsse-id": "fs-records-menu" }, box(1300, V)),
  ]);
  const pScan = L.textUnits(personPage);
  const pp = L.scanPlaces(pScan.units, "person");
  const pFact = (f) => pp.find((p) => p.fact === f);
  check("person mode: seven places — Birth, Christening, Burial, Marriage, Residence, Immigration, Military Induction",
    pp.map((p) => p.fact).join("|") === "Birth|Christening|Burial|Marriage|Residence|Immigration|Military Induction", pp.map((p) => [p.fact, p.place]).join(" · "));
  check("Name (comma-bearing), Sex, Death 'Deceased', Occupation 'Farmer, retired', the Sources titles, the hidden copy, the lifespans and our menu row yield no place",
    !pp.some((p) => /Name|Sex|Death|Occupation/.test(p.fact) || /Births and Baptisms|Death Index|Trew|1896|Census/.test(p.place)) && pp.every((p) => p.node.textContent === p.place));
  check("the burial's age note beside the date is skipped and the STANDARDISED line (the comma hierarchy) is the place, not the free text above it",
    pFact("Burial") && pFact("Burial").place === "Karrakatta, Nedlands City, Western Australia, Australia" && pFact("Burial").date === "13 Feb 1965" && Math.round(pFact("Burial").top) === 650);
  check("a value beside its label counts within BESIDE_PX (the residence's date, then the place under the date); a Sources title 1100 px to the right on the Death label's line does not",
    pFact("Residence") && pFact("Residence").place === "Fremantle, Western Australia, Australia" && pFact("Residence").date === "1911" && pFact("Birth").place === "York, Western Australia, Australia" && L.BESIDE_PX === 400);
  check("the couple block's marriage (date beside the bare 'Marriage' label) and sole-word places after a date (Immigration 'Siston', 'ALTOONA PENNSYLVANIA')",
    pFact("Marriage").place === "Perth, Western Australia, Australia" && pFact("Marriage").date === "4 June 1895" && pFact("Immigration").place === "Siston" && pFact("Military Induction").place === "ALTOONA PENNSYLVANIA");
  check("every person-page place is solo — no partner, never paired", pp.every((p) => p.solo && !p.partner));
  globalThis.document.childNodes = [personPage];
  const pInj = L.inject(pScan, "person");
  const pLink = (f) => linkOf(pInj.find((p) => p.fact === f));
  check("inject (person): a '📍 map' single link right after each place's text node, none paired",
    pInj.length === 7 && pInj.every((p) => linkOf(p) && linkOf(p).textContent === "📍 map" && linkOf(p).getAttribute("data-fsse-map") === "single" && !p.partner));
  check("the person-page tooltip never talks about 'the other side of this row'",
    pInj.every((p) => /^Show this place on Google Maps: /.test(linkOf(p).getAttribute("title")) && !/other side of this row|Both sides/.test(linkOf(p).getAttribute("title"))));
  const leafNode = (n, text) => { if (n.nodeType === 3) return n.textContent === text ? n : null; for (const c of n.childNodes || []) { const r = leafNode(c, text); if (r) return r; } return null; };
  const hasLink = (text) => { const n = leafNode(personPage, text); return !!(n && n.nextSibling && n.nextSibling.getAttribute && n.nextSibling.getAttribute("data-fsse-map") != null); };
  check("the burial link follows the standardised line; the free-text line, the Sources titles, the occupation and the name carry none",
    hasLink("Karrakatta, Nedlands City, Western Australia, Australia") && !hasLink("Karrakatta Cemetery and Crematorium") && !hasLink('Nathaniel Eli Trew, "Australia, Births and Baptisms, 1792-1981"') && !hasLink('Mary Ann Trew, "Australia, Death Index, 1787-1985"') && !hasLink("Farmer, retired") && !hasLink("Trew, Nathaniel Eli"));
  const pInj2 = L.inject(L.textUnits(personPage), "person");
  check("a second pass re-uses the links (idempotent) and textUnits reports exactly the seven links", pInj2.length === 7 && pInj2.every((p, i) => linkOf(p) === linkOf(pInj[i])) && L.textUnits(personPage).links.length === 7);
  const guard = { stopped: 0, stopPropagation() { this.stopped++; } };
  for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend"]) for (const fn of pLink("Birth")._handlers[t] || []) fn(guard);
  check("pointer gestures on a link never reach FamilySearch's clickable Vitals row (propagation stopped on all six)", guard.stopped === 6);
  const sLink = pLink("Immigration");
  check("an unlocated person-page place links by name; its anchors are the page's other places, nearest row first",
    /maps\/search\/\?api=1&query=Siston$/.test(sLink._fsseUrl) && sLink._fsseAnchors[0] === "ALTOONA PENNSYLVANIA" && sLink._fsseAnchors[1] === "Fremantle, Western Australia, Australia" && sLink._fsseAnchors.includes("Perth, Western Australia, Australia"), JSON.stringify(sLink._fsseAnchors));
  fakeWin = null;
  sLink.click();
  check("click: the Maps tab opens blank inside the click and the link reads locating…", fakeWin && fakeWin.url === "" && fakeWin.name === "fsse-maps" && sLink.textContent === "📍 locating…");
  await new Promise((r) => setTimeout(r, 50));
  check("…then the tab is navigated to a pin on Siston by coordinates", fakeWin.location.href === "https://www.google.com/maps/search/?api=1&query=51.47000,-2.46000", fakeWin.location.href);
  const pInj3 = L.inject(L.textUnits(personPage), "person");
  const sLink3 = linkOf(pInj3.find((p) => p.fact === "Immigration"));
  check("after locating: the same link carries the pin URL and says where it is pinned",
    sLink3 === sLink && sLink._fsseUrl === "https://www.google.com/maps/search/?api=1&query=51.47000,-2.46000" && /^Pinned at Siston, South Gloucestershire\./.test(sLink.getAttribute("title")) && sLink.textContent === "📍 map", sLink.getAttribute("title"));
  const tp = L.tickPerson();
  check("tickPerson() on a person page scans the document and returns the seven places", Array.isArray(tp) && tp.length === 7);
  globalThis.location.pathname = "/en/search/record/results";
  check("neither tick runs on a search-results page", L.tick() === undefined && L.tickPerson() === undefined);
  // ---- v0.2.133: the settings switches (FSSE.settings — absent in this suite until here = all on) ----
  globalThis.location.pathname = "/en/tree/person/details/9JWT-KH9";
  globalThis.document.childNodes = [personPage];
  FSSE.settings = { loaded: true, get: (k) => k !== "pins.person" };
  const offRun = L.tickPerson();
  check("settings: person-page pins off → tickPerson returns no places and removes every link on the page", Array.isArray(offRun) && offRun.length === 0 && L.textUnits(personPage).links.length === 0, L.textUnits(personPage).links.length);
  check("settings: enabledFor reads the per-page key — linker on, person off", L.enabledFor("linker") === true && L.enabledFor("person") === false);
  FSSE.isSourcesTab = () => true;
  check("settings: on the Sources tab the person mode reads pins.sources instead", L.enabledFor("person") === true);
  delete FSSE.isSourcesTab;
  FSSE.settings = { loaded: true, get: () => true };
  check("settings: switched back on → the next tick re-inserts the seven links", L.tickPerson().length === 7 && L.textUnits(personPage).links.length === 7);
  FSSE.settings = { loaded: false, get: () => false };
  check("settings: still loading → the tick does nothing and the links stay", L.tickPerson().length === 0 && L.textUnits(personPage).links.length === 7);
  delete FSSE.settings;
  check("no settings at all (the suites' stub) = everything on", L.enabledFor("linker") && L.enabledFor("person") && L.tickPerson().length === 7);
  globalThis.location.pathname = "/en/search/record/results";
  // ---- v0.2.126: the Detail View's "Last Changed" lines (Kevin's Norman Lewis Monnett GM9P-TG9
  // screenshot, 2026-10-28: the death's "United States" had no pin and "Last Changed: June 9,
  // 2024" under it had one — the two-line rule had taken that comma-bearing line for the
  // standardised place). Positions as on his classic page with Detail View on (CSS px): the
  // Last Changed line sits 45 px under the place, indented 20 px, with the contributor's
  // initial and name beside it; Christening is empty with a "+ ADD" button.
  const detailPage = mk("div", [
    mk("div", [
      leaf("Birth • 8 Sources", 800, V), leaf("26 August 1923", 825, V), leaf("Cumberland, Allegany, Maryland, United States", 850, V),
      leaf("Last Changed: June 9, 2024", 920, V + 20), leaf("J", 920, 520), leaf("J B Buss", 920, 540),
      leaf("Christening", 800, 724), leaf("+ ADD", 826, 724),
      leaf("Death • 2 Sources", 977, V), leaf("October 1977", 1002, V), leaf("United States", 1027, V),
      leaf("Last Changed: June 9, 2024", 1072, V + 20), leaf("J", 1072, 520), leaf("J B Buss", 1072, 540),
      leaf("Burial • 1 Source", 977, 724), leaf("Short Gap, Mineral, West Virginia, United States of America", 1002, 724),
      leaf("Last Changed: January 28, 2020", 1072, 744), leaf("C", 1072, 1000), leaf("Cherise Armstrong", 1072, 1024),
      leaf("Residence • 1 Source", 1150, V), leaf("1940", 1175, V),
      leaf("Last Changed: June 9, 2024", 1220, V + 20), leaf("J", 1220, 520), leaf("J B Buss", 1220, 540),
    ]),
  ]);
  const dp = L.scanPlaces(L.textUnits(detailPage).units, "person");
  check("Detail View: Birth, Death ('United States' — a comma-less place keeps its pin) and Burial; the Last Changed lines, the contributors and the date-only Residence yield nothing",
    dp.map((p) => [p.fact, p.place].join("=")).join("|") === "Birth=Cumberland, Allegany, Maryland, United States|Death=United States|Burial=Short Gap, Mineral, West Virginia, United States of America", dp.map((p) => [p.fact, p.place]).join(" · "));
  check("an empty Christening's '+ ADD' button is a chip, not a place; looksLikePlace refuses colons and quotes outright",
    !dp.some((p) => p.fact === "Christening") && !L.looksLikePlace("Last Changed: June 9, 2024", { placeFact: true, afterDate: true }) && !L.looksLikePlace('Norman Monnett, "United States Census, 1940"', { placeFact: true, first: true }) && !L.looksLikePlace("+ ADD", { placeFact: true, first: true }) && L.looksLikePlace("United States", { placeFact: true, afterDate: true }));
  // ---- v0.2.127: Custom Events name themselves on their first line (Kevin's second Norman
  // Monnett screenshot, 2026-10-28 — "Social Program Application" and "Military Draft
  // Registration" had taken the pins; the draft registration's real place had none). Shapes
  // from the screenshot: title → date; title → date → place; title → description (no date);
  // a title that is itself a fact word ("Marital Status", "Education") plus its value.
  const customPage = mk("div", [
    mk("div", [
      leaf("Residence • 1 Source", 300, V), leaf("1940", 325, V), leaf("Londonderry Township, Bedford, Pennsylvania, United States", 350, V),
      leaf("Last Changed: January 28, 2020", 420, V + 20), leaf("C", 420, 520), leaf("Cherise Armstrong", 420, 540),
      leaf("Custom Event • 0 Sources", 480, V), leaf("Social Program Application", 505, V), leaf("March 1941", 530, V),
      leaf("Last Changed: February 29, 2024", 600, V + 20), leaf("B", 600, 520), leaf("Brandee91", 600, 540),
      leaf("Custom Event • 1 Source", 650, V), leaf("Military Draft Registration", 675, V), leaf("30 June 1942", 700, V), leaf("Londonderry Township, Bedford, Pennsylvania, United States", 725, V),
      leaf("Last Changed: June 9, 2024", 795, V + 20), leaf("J", 795, 520), leaf("J B Buss", 795, 540),
      leaf("Custom Event • 0 Sources", 850, 724), leaf("Social Program Correspondence", 875, 724), leaf("Social Program Correspondence", 910, 724),
      leaf("Occupation • 1 Source", 960, 724), leaf("School", 985, 724),
      leaf("Custom Event • 1 Source", 1030, 724), leaf("Marital Status", 1055, 724), leaf("Married", 1090, 724),
      leaf("Custom Event • 1 Source", 1140, 724), leaf("Education", 1165, 724), leaf("2 years of high school", 1200, 724),
      leaf("Custom Fact • 0 Sources", 1250, 724), leaf("Naturalization Petition", 1275, 724), leaf("Filed at Pittsburgh, Allegheny, Pennsylvania", 1300, 724),
    ]),
  ]);
  const cp = L.scanPlaces(L.textUnits(customPage).units, "person");
  check("Custom Events: the title line never pins; the draft registration's place after its date does (the pin on the place line, not the title)",
    cp.map((p) => [p.fact, p.place].join("=")).join("|") === "Residence=Londonderry Township, Bedford, Pennsylvania, United States|Custom Event=Londonderry Township, Bedford, Pennsylvania, United States" && Math.round(cp[1].top) === 725 && cp[1].date === "30 June 1942",
    cp.map((p) => [p.fact, p.place, p.top]).join(" · "));
  check("…a title followed only by a date, by a description or by a status word yields nothing, and a Custom FACT (a description, never a place) yields nothing even with a comma",
    !cp.some((p) => /Social Program|Military Draft|Married|high school|School|Pittsburgh/.test(p.place)) && L.parseLabel("Custom Fact • 0 Sources").noPlace && !L.parseLabel("Custom Event • 0 Sources").noPlace);
  // ---- v0.2.128: the Sources tab (Kevin's Nathaniel Eli Trew screenshot, 2026-10-28 — an expanded
  // source's Indexed Information had "📍 map" after Birthplace but not after Event Place). The
  // card at his screenshot's geometry: the tag chips in a row, the Source Date / Web Page /
  // Citation blocks, then the index panel's label / value rows side by side (labels right-aligned
  // in one column, values in the next), the parents table under it.
  const sourcesPage = mk("div", [
    mk("div", [
      leaf("Tags", 403, 335), leaf("Birth", 440, 340), leaf("Christening", 440, 405), leaf("Sex", 440, 505), leaf("Name", 440, 558), leaf("+ ADD TAG", 440, 617),
      leaf("Source Date", 482, 335), leaf("23 January 1883", 503, 335),
      leaf("Web Page (Link to the Record)", 535, 335), leaf("https://familysearch.org/ark:/61903/1:1:XTD7-49F", 561, 335),
      leaf("Where The Record Is Found (Citation)", 596, 335), leaf('"Australia, Births and Baptisms, 1792-1981", FamilySearch (https://www.familysearch.org/ark:/61903/1:1:XTD7-49F : Thu Sep 10 00:49:33 UTC 2026), Nathanael Eli Trew, 23 Jan 1883.', 618, 335),
      leaf("Indexed Information", 692, 335),
      leaf("Nathanael Eli Trew", 731, 345), leaf("Vital • Australia, Births and Baptisms, 1792-1981", 757, 345), leaf("EDIT", 729, 1605),
      leaf("Name", 808, 668), leaf("Nathanael Eli Trew", 808, 729),
      leaf("Sex", 839, 686), leaf("Male", 839, 729),
      leaf("Birthplace", 870, 637), leaf("York, Western Australia, Australia", 870, 729),
      leaf("Event Type", 901, 631), leaf("Christening", 901, 729),
      leaf("Event Date", 938, 631), leaf("23 Jan 1883", 938, 729),
      leaf("Event Place", 979, 627), leaf("York, Western Australia, Australia", 979, 729),
      leaf("Source Details", 1011, 605), leaf("p 7", 1011, 729),
      leaf("Nathanael Eli Trew's Parents and Siblings", 1075, 345), leaf("OPEN ALL", 1075, 1022),
      leaf("Geo Trew", 1113, 345), leaf("Father", 1113, 493), leaf("M", 1113, 640),
    ]),
    // a second card tagged "Burial" alone — its "Source Date" block sits right under the chip
    mk("div", [
      leaf("Tags", 1303, 335), leaf("Burial", 1340, 340), leaf("+ ADD TAG", 1340, 405),
      leaf("Source Date", 1382, 335), leaf("14 February 1965", 1403, 335),
      leaf("Death Date", 1508, 631), leaf("13 Feb 1965", 1508, 729),
      leaf("Death Place", 1539, 627), leaf("Nedlands, Western Australia, Australia", 1539, 729),
      leaf("Age at Death", 1570, 620), leaf("93", 1570, 729),
      leaf("Burial Place", 1601, 627), leaf("Karrakatta Cemetery, Karrakatta, Western Australia, Australia", 1601, 729),
      leaf("Cemetery", 1632, 650), leaf("Karrakatta Cemetery", 1632, 729),
    ]),
  ]);
  const sp = L.scanPlaces(L.textUnits(sourcesPage).units, "person");
  check("Sources tab: every place field of an expanded source pins — Birthplace AND Event Place, Death Place and Burial Place — all solo",
    sp.map((p) => [p.fact, p.place].join("=")).join("|") === "Birthplace=York, Western Australia, Australia|Event Place=York, Western Australia, Australia|Death Place=Nedlands, Western Australia, Australia|Burial Place=Karrakatta Cemetery, Karrakatta, Western Australia, Australia" && sp.every((p) => p.solo),
    sp.map((p) => [p.fact, p.place]).join(" · "));
  check("…and nothing else: the tag chips, Source Date, the web link, the citation, the panel's name / collection line, Event Type's 'Christening' value, Source Details, the parents table and the bare Cemetery field",
    !sp.some((p) => /Source Date|Web Page|Citation|Indexed|Vital|Nathanael|Christening|p 7|Father|Geo Trew|ADD TAG|Karrakatta Cemetery$/.test(p.place)) && sp.length === 4);
  // ---- v0.2.131: "Same Place" on a 1940 census (Kevin's Ray Oliver McGahey G2W8-QCC Sources-tab
  // screenshot, 2026-10-28 — the 1935 Residence Place "Same Place" carried a pin that opened
  // Mumbai). The card at his screenshot's geometry: labels right-aligned, values at x = 671.
  const EP = "Ward 19, Pittsburgh, Pittsburgh City, Allegheny, Pennsylvania, United States";
  const census1940 = mk("div", [
    mk("div", [
      leaf("Indexed Information", 242, 189),
      leaf("Ray O Mcgahey", 291, 201), leaf("Census • United States, Census, 1940", 322, 201), leaf("EDIT", 288, 1740),
      leaf("Name", 384, 596), leaf("Ray O Mcgahey", 384, 671),
      leaf("Sex", 422, 620), leaf("Male", 422, 671),
      leaf("Age", 461, 617), leaf("17", 461, 671),
      leaf("Birthplace", 499, 558), leaf("Pennsylvania", 499, 671),
      leaf("Residence Date", 537, 510), leaf("1935", 537, 671),
      leaf("Residence Place", 576, 505), leaf("Same Place", 576, 671),
      leaf("Marital Status", 614, 524), leaf("Single", 614, 671),
      leaf("Race", 652, 609), leaf("White", 652, 671),
      leaf("Relationship to Head of Household", 690, 335), leaf("Son", 690, 671),
      leaf("Event Type", 728, 551), leaf("Census", 728, 671),
      leaf("Event Date", 766, 551), leaf("1940", 766, 671),
      leaf("Event Place", 805, 547), leaf(EP, 805, 671),
      leaf("Event Place (Original)", 867, 458), leaf(EP, 867, 671),
      leaf("Enumeration District Number", 930, 382), leaf("69-547 Pittsburgh City Ward 19 (Tract 19-D - part)", 930, 671),
      leaf("Line Number", 992, 531), leaf("19", 992, 671),
      leaf("Sheet Letter", 1030, 540), leaf("A", 1030, 671),
      leaf("Sheet Number", 1068, 518), leaf("1", 1068, 671),
      leaf("Affiliate Publication Number", 1106, 391), leaf("T627", 1106, 671),
    ]),
    // a second expanded card far below with no Event Place: "Same House" has nothing to stand for; "Rural" is no place
    mk("div", [
      leaf("Birthplace", 2400, 558), leaf("Ohio", 2400, 671),
      leaf("Residence Place", 2438, 505), leaf("Same House", 2438, 671),
      leaf("Previous Residence Place", 2476, 440), leaf("Rural", 2476, 671),
    ]),
  ]);
  const c40 = L.scanPlaces(L.textUnits(census1940).units, "person");
  check("1940 census: 'Same Place' stands for the record's own Event Place — the Residence Place entry carries the Event Place text with rawPlace 'Same Place'; 'Same House' with no Event Place in reach is dropped; 'Rural' is never a place; Pennsylvania and Ohio pin",
    c40.map((p) => `${p.fact}=${p.rawPlace ? p.rawPlace + "→" : ""}${p.place}`).join("|") === `Birthplace=Pennsylvania|Residence Place=Same Place→${EP}|Event Place=${EP}|Event Place (Original)=${EP}|Birthplace=Ohio`,
    c40.map((p) => [p.fact, p.rawPlace, p.place]).join(" · "));
  check("…and the enumeration district (a Number field) claims nothing", !c40.some((p) => /69-547/.test(p.place)));
  check("SAME_PLACE_RE: Same Place / Same House / same house / Same County; not Same, Sameness, Same Place Road, Pittsburgh",
    ["Same Place", "Same House", "same house", "Same County"].every((t) => L.SAME_PLACE_RE.test(t)) && !["Same", "Sameness", "Same Place Road", "Pittsburgh"].some((t) => L.SAME_PLACE_RE.test(t)));
  check("looksLikePlace refuses the census shorthand that names no place: Rural / Abroad / At Sea / Not Stated under a place fact; Bedford still passes",
    !["Rural", "Abroad", "At Sea", "Not Stated"].some((t) => L.looksLikePlace(t, { placeFact: true, first: true })) && L.looksLikePlace("Bedford", { placeFact: true, first: true }));
  const ci = L.inject(L.textUnits(census1940), "person");
  const sameP = ci.find((p) => p.rawPlace === "Same Place");
  const evP = ci.find((p) => p.fact === "Event Place");
  check("the 'Same Place' link sits after the 'Same Place' text, opens the SAME map as the Event Place link, and its tooltip says why",
    sameP && sameP.link && sameP.link === sameP.node.nextSibling && sameP.node.textContent === "Same Place" && sameP.link._fsseUrl === evP.link._fsseUrl && sameP.link._fsseUrl === L.mapsUrl(EP) && sameP.link.getAttribute("title").startsWith(`"Same Place" on this record means its own Event Place — ${EP}.`),
    sameP && sameP.link ? sameP.link.getAttribute("title") : "no link");
  check("a second pass keeps the five links, nothing duplicated", L.inject(L.textUnits(census1940), "person").length === 5 && L.textUnits(census1940).links.length === 5);
  // the Source Linker: the record's "Same Place" pairs with the tree's residence BY the Event Place
  const linker1940 = mk("div", [
    leaf("Residence Place", 500, R), leaf("Same Place", 519, R),
    leaf("Event Place", 560, R), leaf(EP, 579, R),
    leaf("Residence • 1 Source", 500, T), leaf("1935", 519, T), leaf("Pittsburgh, Allegheny, Pennsylvania, United States", 537, T),
  ]);
  const lp = L.scanPlaces(L.textUnits(linker1940).units);
  L.pairPlaces(lp);
  const lSame = lp.find((p) => p.rawPlace === "Same Place");
  const lSpec = lSame && L.linkFor(lSame);
  check("linker: the record's aliased 'Same Place' pairs with the tree Residence on its row and the compare runs from the Event Place; the Event Place row itself has no partner",
    lp.length === 3 && lSame && lSame.side === "record" && lSame.partner && lSame.partner.side === "tree" && lSpec.kind === "pair" && lSpec.text === "📍 compare" && lSpec.url.includes(`origin=${encodeURIComponent(EP)}&destination=${encodeURIComponent("Pittsburgh, Allegheny, Pennsylvania, United States")}`) && lSpec.tip.startsWith('"Same Place" on this record means its own Event Place') && !lp.find((p) => p.fact === "Event Place").partner,
    JSON.stringify(lp.map((p) => [p.side, p.fact, p.place, !!p.partner])) + " " + (lSpec && lSpec.url));
  // ---- v0.2.132: regions in a compare pair + county-level US places (Kevin: "please take care
  // of these two small limits"). A US census names a birthplace by state: record "Pennsylvania"
  // vs tree "Coalmont, Huntingdon, Pennsylvania, United States" used to route from the state's
  // centroid; "Huntingdon, Pennsylvania, United States" (FS's county level) pinned the borough.
  check("nestedBy: the shorter place's components are the tail of the longer's",
    L.nestedBy("Pennsylvania, United States", "Coalmont, Huntingdon, Pennsylvania, United States") && L.nestedBy("England, United Kingdom", "Kingswood, Gloucestershire, England, United Kingdom") && L.nestedBy("United States", "Pennsylvania, United States") &&
    !L.nestedBy("Coalmont, Huntingdon, Pennsylvania, United States", "Pennsylvania, United States") && !L.nestedBy("Pennsylvania, United States", "Pennsylvania, United States") && !L.nestedBy("Pennsylvania, USA", "Coalmont, Huntingdon, Pennsylvania, United States") && !L.nestedBy("Gloucestershire, England", "Kingswood, South Gloucestershire, England, United Kingdom"));
  check("countyLevel: '<X>, <State>[, United States]' only",
    L.countyLevel("Huntingdon, Pennsylvania, United States") && L.countyLevel("Huntingdon, Pennsylvania") && L.countyLevel("Huntingdon, Pennsylvania, USA") && !L.countyLevel("Coalmont, Huntingdon, Pennsylvania, United States") && !L.countyLevel("Pennsylvania, United States") && !L.countyLevel("Toronto, Ontario, Canada") && !L.countyLevel("Kingswood, Gloucestershire, England"));
  check("regionNameOf adds the county word for Google; other places unchanged", L.regionNameOf("Huntingdon, Pennsylvania, United States") === "Huntingdon County, Pennsylvania, United States" && L.regionNameOf("Pennsylvania, United States") === "Pennsylvania, United States");
  check("countryCodeOf infers the US from a trailing state; 'Georgia' stays open", L.countryCodeOf("Huntingdon, Pennsylvania") === "us" && L.countryCodeOf("Brooklyn, New York") === "us" && L.countryCodeOf("Tbilisi, Georgia") === null && L.countryCodeOf("Kingswood") === null);
  check("bboxContains: Coalmont inside Pennsylvania's box, Kingswood outside it; a box over the antimeridian; no box → null",
    L.bboxContains({ bbox: [39.7197989, 42.514681, -80.5198949, -74.6895018] }, { lat: 40.2559, lon: -78.2003 }) === true && L.bboxContains({ bbox: [39.7197989, 42.514681, -80.5198949, -74.6895018] }, { lat: 51.46, lon: -2.5 }) === false && L.bboxContains({ bbox: [-14.76, 71.6, 170, -60] }, { lat: 40, lon: -100 }) === true && L.bboxContains({ bbox: null }, { lat: 1, lon: 1 }) === null);
  // (1) nested BY NAME — no lookup at all for the state
  NOMINATIM.Coalmont = [
    { name: "Coalmont", category: "place", type: "village", addresstype: "village", place_rank: 19, lat: "40.2559", lon: "-78.2003", importance: 0.3, boundingbox: ["40.2500", "40.2620", "-78.2100", "-78.1900"], display_name: "Coalmont, Huntingdon County, Pennsylvania, United States", address: { village: "Coalmont", county: "Huntingdon County", state: "Pennsylvania", country: "United States", country_code: "us" } },
  ];
  const nestedPage = mk("div", [
    leaf("Birth", 300, R), leaf("1859", 319, R), leaf("Pennsylvania", 337, R),
    leaf("Birth • 2 Sources", 300, T), leaf("1859", 319, T), leaf("Coalmont, Huntingdon, Pennsylvania, United States", 337, T),
  ]);
  const np = L.scanPlaces(L.textUnits(nestedPage).units);
  L.pairPlaces(np);
  const nRec = np.find((p) => p.side === "record");
  const nSpec = L.linkFor(nRec);
  check("record 'Pennsylvania' vs tree 'Coalmont, …': nested BY NAME — '📍 in Pennsylvania' on both sides, a single on the inner place (no pair), Shift+click frames the state, before any request",
    np.length === 2 && nRec.partner && nSpec.kind === "within" && nSpec.text === "📍 in Pennsylvania" && nSpec.single === "Coalmont, Huntingdon, Pennsylvania, United States" && !nSpec.pair && nSpec.url === L.mapsUrl("Coalmont, Huntingdon, Pennsylvania, United States") && nSpec.alt === L.mapsUrl("Pennsylvania, United States") && /lies within "Pennsylvania, United States"/.test(nSpec.tip) && L.linkFor(nRec.partner).text === "📍 in Pennsylvania", JSON.stringify(nSpec));
  const ni = L.inject(L.textUnits(nestedPage));
  const nestLink = linkOf(ni.find((p) => p.side === "record"));
  const nestBefore = fetched.length;
  fakeWin = null;
  nestLink.click();
  await new Promise((r) => setTimeout(r, 50));
  const ni2 = L.inject(L.textUnits(nestedPage));
  const nestLink2 = linkOf(ni2.find((p) => p.side === "record"));
  check("its click locates ONLY Coalmont (one request; the state is never looked up) and pins it; the link keeps '📍 in Pennsylvania' with the pinned tooltip and the Shift+click alt",
    fakeWin && fakeWin.location.href === "https://www.google.com/maps/search/?api=1&query=40.25590,-78.20030" && fetched.slice(nestBefore).map(qOf).join(" | ") === "Coalmont" && nestLink2 === nestLink && nestLink.textContent === "📍 in Pennsylvania" && /Pinned at Coalmont, Huntingdon County\./.test(nestLink.getAttribute("title")) && /Shift\+click: the map framed on Pennsylvania\./.test(nestLink.getAttribute("title")) && nestLink._fsseAlt === L.mapsUrl("Pennsylvania, United States"),
    (fakeWin && fakeWin.location.href) + " · " + fetched.slice(nestBefore).map(qOf).join(" | ") + " · " + nestLink.getAttribute("title"));
  // (2) located pairs where one side turns out a region
  NOMINATIM.Gloucestershire = [
    { name: "Gloucestershire", category: "boundary", type: "administrative", addresstype: "county", place_rank: 12, lat: "51.8", lon: "-2.1", importance: 0.7, boundingbox: ["51.3800", "52.1100", "-2.6900", "-1.6200"], display_name: "Gloucestershire, England, United Kingdom", address: { county: "Gloucestershire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ];
  NOMINATIM.Somerset = [
    { name: "Somerset", category: "boundary", type: "administrative", addresstype: "county", place_rank: 12, lat: "51.1", lon: "-3.0", importance: 0.7, boundingbox: ["50.8000", "51.3300", "-3.8400", "-2.2500"], display_name: "Somerset, England, United Kingdom", address: { county: "Somerset", state: "England", country: "United Kingdom", country_code: "gb" } },
  ];
  const KW = "Kingswood, South Gloucestershire, England, United Kingdom";
  const rg = await L.resolvePair("Gloucestershire, England, United Kingdom", KW);
  const gSpec = L.linkFor({ side: "record", place: "Gloucestershire, England", partner: { side: "tree", place: KW } });
  check("located pair, record = a county: '📍 in Gloucestershire' by the county's box, the click a pin on Kingswood, Shift+click the county framed, no distance shown",
    L.isRegion(rg.a) && !L.isRegion(rg.b) && gSpec.text === "📍 in Gloucestershire" && gSpec.url === L.pinUrl(rg.b) && gSpec.alt === L.mapsUrl("Gloucestershire, England, United Kingdom") && /lies within Gloucestershire \(a county;/.test(gSpec.tip) && !/mi apart/.test(gSpec.tip) && L.pairUrl(rg, "Gloucestershire, England, United Kingdom", KW) === L.pinUrl(rg.b), JSON.stringify(gSpec));
  const rs = await L.resolvePair("Somerset, England, United Kingdom", KW);
  const sSpec = L.linkFor({ side: "record", place: "Somerset, England", partner: { side: "tree", place: KW } });
  check("…a county whose box does not hold the point: '📍 not in Somerset', the tooltip says OUTSIDE, the pin still on Kingswood", sSpec.text === "📍 not in Somerset" && /lies OUTSIDE Somerset/.test(sSpec.tip) && sSpec.url === L.pinUrl(rs.b), sSpec.tip);
  const rr = await L.resolvePair("Gloucestershire, England, United Kingdom", "Somerset, England, United Kingdom");
  const rrSpec = L.linkFor({ side: "record", place: "Gloucestershire, England, United Kingdom", partner: { side: "tree", place: "Somerset, England, United Kingdom" } });
  check("two regions: '📍 two regions', the record's framed on click, the tree's on Shift+click, the centres' distance only in the tooltip",
    rrSpec.text === "📍 two regions" && rrSpec.url === L.mapsUrl("Gloucestershire, England, United Kingdom") && rrSpec.alt === L.mapsUrl("Somerset, England, United Kingdom") && /their centres are \d+ mi apart/.test(rrSpec.tip) && L.pairUrl(rr, "x", "y") === rrSpec.url, rrSpec.tip);
  check("a plain town pair is untouched: Kingswood ↔ Warmley still opens the two-pin page", L.linkFor({ side: "record", place: "Kingswood, Gloucestershire", partner: { side: "tree", place: "Warmley, Gloucestershire, England, United Kingdom" } }).url.startsWith(L.MAP_PAGE));
  // the county level: "<X>, Pennsylvania, United States" → the county, framed
  NOMINATIM.Huntingdon = [
    { name: "Huntingdon", category: "place", type: "town", addresstype: "town", place_rank: 18, lat: "40.4848", lon: "-78.0103", importance: 0.45, boundingbox: ["40.4700", "40.5000", "-78.0300", "-77.9900"], display_name: "Huntingdon, Huntingdon County, Pennsylvania, United States", address: { town: "Huntingdon", county: "Huntingdon County", state: "Pennsylvania", country: "United States", country_code: "us" } },
    { name: "Huntingdon County", category: "boundary", type: "administrative", addresstype: "county", place_rank: 12, lat: "40.4200", lon: "-77.9800", importance: 0.5, boundingbox: ["40.0600", "40.7100", "-78.3500", "-77.6400"], display_name: "Huntingdon County, Pennsylvania, United States", address: { county: "Huntingdon County", state: "Pennsylvania", country: "United States", country_code: "us" } },
    { name: "Huntingdon", category: "place", type: "town", addresstype: "town", place_rank: 18, lat: "52.3300", lon: "-0.1800", importance: 0.5, boundingbox: ["52.3200", "52.3400", "-0.2000", "-0.1600"], display_name: "Huntingdon, Cambridgeshire, England, United Kingdom", address: { town: "Huntingdon", county: "Cambridgeshire", state: "England", country: "United Kingdom", country_code: "gb" } },
  ];
  const hc = L.filterCandidates(NOMINATIM.Huntingdon, "Huntingdon, Pennsylvania, United States");
  check("filterCandidates: 'Huntingdon County' (a county-kind result) answers to 'Huntingdon' and is flagged county; the English Huntingdon fails the fit",
    hc.length === 3 && hc.filter((c) => c.county).length === 1 && hc.find((c) => c.county).label === "Huntingdon County" && hc.filter((c) => c.fit).length === 2, JSON.stringify(hc.map((c) => [c.label, c.county, c.fit])));
  const hBefore = fetched.length;
  const rh = await L.resolveSingle("Huntingdon, Pennsylvania, United States", []);
  check("'Huntingdon, Pennsylvania, United States' (FS's county level) resolves to the COUNTY, framed by name, one request within the US",
    rh.c.county === true && rh.n === 1 && L.isRegion(rh.c) && L.singleUrl(rh.c) === L.mapsUrl("Huntingdon County, Pennsylvania, United States") && fetched.slice(hBefore).map(qOf).join(" | ") === "Huntingdon" && /countrycodes=us/.test(fetched[fetched.length - 1]) && /^Huntingdon County is a county, so the map opens framed/.test(L.linkFor({ side: "tree", place: "Huntingdon, Pennsylvania, United States", partner: null, solo: true }).tip), JSON.stringify(rh));
  const rh2 = await L.resolveSingle("Huntingdon, Pennsylvania", []);
  check("…'Huntingdon, Pennsylvania' (no country) the same — the state names the country", rh2.c.county === true && L.singleUrl(rh2.c) === L.mapsUrl("Huntingdon County, Pennsylvania, United States"));
  NOMINATIM.Pittsburgh = [
    { name: "Pittsburgh", category: "boundary", type: "administrative", addresstype: "city", place_rank: 16, lat: "40.4417", lon: "-79.9901", importance: 0.8, boundingbox: ["40.3600", "40.5000", "-80.0900", "-79.8700"], display_name: "Pittsburgh, Allegheny County, Pennsylvania, United States", address: { city: "Pittsburgh", county: "Allegheny County", state: "Pennsylvania", country: "United States", country_code: "us" } },
  ];
  const rp = await L.resolveSingle("Pittsburgh, Pennsylvania, United States", []);
  check("a county-level string with no county of that name keeps the city, pinned (Pittsburgh)", rp.c.kind === "city" && !rp.c.county && L.singleUrl(rp.c) === L.pinUrl(rp.c));
  // ---- v0.2.138: a name the map knows as SEVERAL boundaries is settled by containment, not by
  // centre (Kevin's Charles Mansfield KPW8-BD4 linker, 2026-10-30: record "Shoreditch, Middlesex"
  // vs tree "London, England, United Kingdom" read "📍 not in City of London" and pinned Shoreditch
  // alone — Nominatim answers "London" with Greater London (rank 9, _place_name "London") AND the
  // square-mile City of London (rank 12, short_name "London"); the City's CENTRE is nearer
  // Shoreditch than Greater London's, so the centroid rule took the square mile, whose box excludes
  // Shoreditch). Live shapes, probed 2026-10-30 (the namedetails trimmed to the forms that matter).
  const GREATER_LONDON = { name: "Greater London", category: "boundary", type: "administrative", addresstype: "city", place_rank: 9, lat: "51.5074456", lon: "-0.1277653", importance: 0.892, boundingbox: ["51.2867601", "51.6918741", "-0.5103751", "0.3340155"], display_name: "Greater London, England, United Kingdom", address: { city: "Greater London", state: "England", "ISO3166-2-lvl4": "GB-ENG", country: "United Kingdom", country_code: "gb" }, namedetails: { name: "Greater London", "name:en": "Greater London", "name:fr": "Grand Londres", "name:hu": "London", _place_name: "London", "_place_name:fr": "Londres", official_name: "Greater London" } };
  const CITY_OF_LONDON = { name: "City of London", category: "boundary", type: "administrative", addresstype: "city", place_rank: 12, lat: "51.5156177", lon: "-0.0919983", importance: 0.662, boundingbox: ["51.5068709", "51.5233122", "-0.1138295", "-0.0727619"], display_name: "City of London, Greater London, England, United Kingdom", address: { city: "City of London", "ISO3166-2-lvl6": "GB-LND", state: "England", country: "United Kingdom", country_code: "gb" }, namedetails: { name: "City of London", "name:en": "City of London", alt_name: "The City", short_name: "London", official_name: "City and County of the City of London" } };
  NOMINATIM.London = [GREATER_LONDON, CITY_OF_LONDON];
  NOMINATIM.Shoreditch = [
    { name: "Shoreditch", category: "place", type: "suburb", addresstype: "suburb", place_rank: 19, lat: "51.5266694", lon: "-0.0798926", importance: 0.504, boundingbox: ["51.5066694", "51.5466694", "-0.0998926", "-0.0598926"], display_name: "Shoreditch, London Borough of Hackney, Greater London, England, EC2A 3AR, United Kingdom", address: { suburb: "Shoreditch", city_district: "London Borough of Hackney", city: "Greater London", state: "England", postcode: "EC2A 3AR", country: "United Kingdom", country_code: "gb" } },
    { name: "Old Shoreditch Station", category: "building", type: "yes", addresstype: "building", place_rank: 30, lat: "51.5227101", lon: "-0.0709002", importance: 0.417, boundingbox: ["51.5226525", "51.5227677", "-0.0710050", "-0.0707955"], display_name: "Old Shoreditch Station, Pedley Street, Spitalfields, Whitechapel, London Borough of Tower Hamlets, Greater London, England, E1 5ER, United Kingdom", address: { building: "Old Shoreditch Station", road: "Pedley Street", suburb: "Whitechapel", city: "Greater London", state: "England", country: "United Kingdom", country_code: "gb" } },
    { name: "Shoreditch", category: "place", type: "hamlet", addresstype: "hamlet", place_rank: 20, lat: "50.9946766", lon: "-3.0814490", importance: 0.133, boundingbox: ["50.9746766", "51.0146766", "-3.1014490", "-3.0614490"], display_name: "Shoreditch, Stoke St. Mary, Somerset, England, TA3 7BL, United Kingdom", address: { hamlet: "Shoreditch", village: "Stoke St. Mary", county: "Somerset", state: "England", postcode: "TA3 7BL", country: "United Kingdom", country_code: "gb" } },
  ];
  NOMINATIM["Shoreditch, Middlesex"] = []; // the whole string finds nothing more
  const lnc = L.filterCandidates(NOMINATIM.London, "London, England, United Kingdom");
  check("filterCandidates: both Londons answer to 'London' (Greater London through _place_name, the City through short_name); Greater London is NAMED by its everyday name while its display stays Google's; the City keeps its own name; both regions, both fit",
    lnc.length === 2 && lnc[0].name === "London" && lnc[0].label === "London" && lnc[0].display === "Greater London, England, United Kingdom" && lnc[1].name === "City of London" && lnc[1].label === "City of London" && lnc.every((c) => L.isRegion(c) && c.fit && c.kind === "city"), JSON.stringify(lnc.map((c) => [c.name, c.label, c.display, c.prank])));
  check("…a name that IS the boundary's own keeps it ('Gloucestershire' — no _place_name in play)", L.filterCandidates(NOMINATIM.Gloucestershire, "Gloucestershire, England, United Kingdom")[0].name === "Gloucestershire");
  const shcs = L.bestTier(L.filterCandidates(NOMINATIM.Shoreditch, "Shoreditch, Middlesex"));
  check("Shoreditch: the Hackney suburb and the Somerset hamlet (neither under a 'Middlesex' — fit false), the station building dropped, neither a region", shcs.length === 2 && shcs.every((c) => c.name === "Shoreditch" && c.fit === false && !L.isRegion(c)), JSON.stringify(shcs.map((c) => c.label)));
  const shHackney = shcs.find((c) => c.lat > 51.5);
  const shSomerset = shcs.find((c) => c.lat < 51.5);
  check("boxDistance: a point inside a region's box is 0 from it (either way round); outside, as far as the box's nearest edge (Shoreditch ≈ 0.2 mi north of the City of London); two overlapping boxes 0; two points their great-circle distance; a region's box never used for a point candidate (the suburb's own box is a shape, not an area)",
    L.boxDistance(shHackney, lnc[0]) === 0 && L.boxDistance(lnc[0], shHackney) === 0 && L.boxDistance(shHackney, lnc[1]) > 0.15 && L.boxDistance(shHackney, lnc[1]) < 0.35 && L.boxDistance(lnc[0], lnc[1]) === 0 && Math.abs(L.boxDistance(shHackney, shSomerset) - L.haversine(shHackney, shSomerset)) < 1e-9 && L.boxDistance(shSomerset, lnc[0]) > 100,
    [L.boxDistance(shHackney, lnc[1]), L.boxDistance(lnc[0], lnc[1]), L.boxDistance(shSomerset, lnc[0])].join(" · "));
  const lnp = L.choosePair(shcs, lnc);
  check("choosePair: Shoreditch ↔ Greater London (which holds it) beats the City of London (whose centre is nearer); `miles` stays the centre-to-centre distance (≈ 2.4), the choosing distance 0",
    lnp.a === shHackney && lnp.b === lnc[0] && lnp.near === 0 && lnp.miles > 2 && lnp.miles < 3, JSON.stringify(lnp));
  check("…a point inside the square mile (Cheapside) lies in BOTH boxes — the better-known London wins the tie", L.choosePair([{ lat: 51.5142, lon: -0.0937, importance: 0.3, name: "Cheapside", label: "Cheapside" }], lnc).b === lnc[0]);
  check("…the plain Kingswood ↔ Warmley choice is unchanged (no region in play)", (() => { const b = L.choosePair(kc, wc); return /South Gloucestershire/.test(b.a.label) && b.near === b.miles; })());
  const lnBefore = fetched.length;
  const lnr = await L.resolvePair("Shoreditch, Middlesex", "London, England, United Kingdom");
  const lnSpec = L.linkFor({ side: "record", place: "Shoreditch, Middlesex", partner: { side: "tree", place: "London, England, United Kingdom" } });
  check("the live pair: '📍 in London' (not 'not in City of London'), the click a pin on the Hackney Shoreditch, Shift+click Greater London framed, the tooltip 'lies within London (a city;', the tree side the same text, pairUrl agreeing",
    lnr.a.lat === shHackney.lat && lnr.a.lon === shHackney.lon && lnr.b.name === "London" && lnSpec.text === "📍 in London" && lnSpec.url === "https://www.google.com/maps/search/?api=1&query=51.52667,-0.07989" && lnSpec.alt === L.mapsUrl("Greater London, England, United Kingdom") && /^Shoreditch, Middlesex lies within London \(a city;/.test(lnSpec.tip) && L.linkFor({ side: "tree", place: "London, England, United Kingdom", partner: { side: "record", place: "Shoreditch, Middlesex" } }).text === "📍 in London" && L.pairUrl(lnr, "Shoreditch, Middlesex", "London, England, United Kingdom") === lnSpec.url,
    JSON.stringify(lnSpec) + " · " + JSON.stringify([lnr.a.label, lnr.b.label, lnr.miles]));
  check("…the requests: Shoreditch, then the whole string (no settlement fits 'Middlesex'), then London — three in all, London settled on its first", fetched.slice(lnBefore).map(qOf).join(" | ") === "Shoreditch | Shoreditch, Middlesex | London", fetched.slice(lnBefore).map(qOf).join(" | "));
  const lnrs = await L.resolveSingle("London, England, United Kingdom", ["Shoreditch, Middlesex"]);
  check("a single 'London, England, United Kingdom' beside Shoreditch (cached) picks Greater London the same way, framed, 'London is a city, so the map opens framed'",
    lnrs.c === lnc.find((c) => c.name === "London") || lnrs.c.name === "London", JSON.stringify(lnrs.c && [lnrs.c.name, lnrs.c.label]));
  check("…its URL frames Greater London by name and the tooltip names the city", L.singleUrl(lnrs.c) === L.mapsUrl("Greater London, England, United Kingdom") && /^London is a city, so the map opens framed on the whole region/.test(L.linkFor({ side: "tree", place: "London, England, United Kingdom", partner: null, solo: true }).tip), L.linkFor({ side: "tree", place: "London, England, United Kingdom", partner: null, solo: true }).tip);
  // ---- v0.2.129: a long place clamped to two lines (Kevin's Adam Jackson Black GS6Q-ZK7
  // screenshot, 2026-10-28 — the 1900 residence "Coalmont Borough, Dudley borough, Broad Top City
  // borough, Huntingdon, Pennsylvania, United…" had no pin: the link sat on the clamped third
  // line). The 1880 row beside it = a box that merely wraps: its link sits on the box's own second
  // line and stays. Boxes carry their computed style as `_cs`; the links' boxes come from a
  // createElement override — the first link inside the open box, the second below the clamped one.
  const clampedBox = leaf("Coalmont Borough, Dudley borough, Broad Top City borough, Huntingdon, Pennsylvania, United States", 990, 245);
  clampedBox._rect = { top: 990, left: 245, width: 410, height: 48 };
  clampedBox._cs = { webkitLineClamp: "2", overflow: "hidden", overflowY: "hidden" };
  const openBox = leaf("Carbon, Huntingdon, Pennsylvania, United States", 829, 245);
  openBox._rect = { top: 829, left: 245, width: 410, height: 48 };
  openBox._cs = { overflow: "hidden", overflowY: "hidden" };
  const clampRow = mk("div", [leaf("Residence • 0 Sources", 944, 245), leaf("1900", 967, 245), clampedBox, leaf("Last Changed: August 6, 2019", 1055, 265)]);
  const clampPage = mk("div", [
    mk("div", [leaf("Residence • 0 Sources", 783, 245), leaf("1880", 806, 245), openBox, leaf("Last Changed: August 11, 2019", 894, 265)]),
    clampRow,
  ]);
  const plainCreate = globalThis.document.createElement;
  const linkRects = [{ top: 853, left: 253, width: 40, height: 16 }, { top: 1040, left: 253, width: 40, height: 16 }];
  globalThis.document.createElement = (t) => { const e = mk(t, []); e._rect = linkRects.shift() || e._rect; return e; };
  const cl = L.inject(L.textUnits(clampPage), "person");
  globalThis.document.createElement = plainCreate;
  check("clamped box: the 1880 link stays inline inside its box; the 1900 link, hidden on the clamped third line, moves right after the box",
    cl.length === 2 && cl[0].link.parentNode === openBox && openBox.childNodes[1] === cl[0].link && cl[1].link.parentNode === clampRow && clampRow.childNodes[3] === cl[1].link && clampedBox.childNodes.length === 1 && cl[1].link._fsseFor === clampedBox.childNodes[0] && /Coalmont/.test(cl[1].link.getAttribute("href")),
    cl.map((p) => [p.place.slice(0, 20), p.link.parentNode === clampRow ? "after box" : "inline"]).join(" · "));
  const cl2 = L.inject(L.textUnits(clampPage), "person");
  check("…and a second pass finds the moved link by its text node — no duplicate, nothing swept",
    cl2[1].link === cl[1].link && cl2[0].link === cl[0].link && L.textUnits(clampPage).links.length === 2 && clampRow.childNodes.length === 5 && clampedBox.childNodes.length === 1);
  const probe = mk("a", []); probe._rect = { top: 1040, left: 253, width: 40, height: 16 }; clampedBox.appendChild(probe);
  const probe2 = mk("a", []); probe2._rect = { top: 5000, left: 253, width: 40, height: 16 }; clampRow.appendChild(probe2);
  const probe3 = mk("a", []); probe3._rect = { top: 860, left: 253, width: 40, height: 16 }; openBox.appendChild(probe3);
  check("clipper: a link below a clamped box names the box; one inside an overflow-hidden box that shows it, or under no clipping ancestor at all, names nothing",
    L.clipper(probe) === clampedBox && L.clipper(probe2) === null && L.clipper(probe3) === null);
  probe.remove(); probe2.remove(); probe3.remove();
  // ---- v0.2.130: a region (a country, a state, a county) is FRAMED, not pinned ------------
  // Kevin: a "United States" pin "zoomed in on a field in Nebraska", Pennsylvania "a pasture".
  // Shapes as Nominatim jsonv2 returns an administrative boundary (addresstype, place_rank, boundingbox).
  NOMINATIM.Pennsylvania = [
    { name: "Pennsylvania", category: "boundary", type: "administrative", addresstype: "state", place_rank: 8, lat: "40.9699889", lon: "-77.7278831", importance: 0.82, boundingbox: ["39.7197989", "42.5146810", "-80.5198949", "-74.6895018"], display_name: "Pennsylvania, United States", address: { state: "Pennsylvania", "ISO3166-2-lvl4": "US-PA", country: "United States", country_code: "us" } },
  ];
  NOMINATIM.Nebraska = [
    { name: "Nebraska", category: "boundary", type: "administrative", addresstype: "state", place_rank: 8, lat: "41.7370229", lon: "-99.5873816", importance: 0.8, boundingbox: ["39.9999980", "43.0017020", "-104.0535000", "-95.3080800"], display_name: "Nebraska, United States", address: { state: "Nebraska", "ISO3166-2-lvl4": "US-NE", country: "United States", country_code: "us" } },
  ];
  NOMINATIM["United States"] = [
    { name: "United States", category: "boundary", type: "administrative", addresstype: "country", place_rank: 4, lat: "39.7837304", lon: "-100.445882", importance: 0.95, boundingbox: ["-14.7608358", "71.6048217", "-180.0000000", "180.0000000"], display_name: "United States", address: { country: "United States", country_code: "us" } },
  ];
  const pa = L.filterCandidates(NOMINATIM.Pennsylvania, "Pennsylvania, United States");
  check("filterCandidates keeps the kind, place rank, bounding box, display name and country code",
    pa.length === 1 && pa[0].kind === "state" && pa[0].prank === 8 && pa[0].display === "Pennsylvania, United States" && pa[0].cc === "us" && Array.isArray(pa[0].bbox) && pa[0].bbox.length === 4 && Math.abs(pa[0].bbox[1] - 42.514681) < 1e-6 && pa[0].fit === true, JSON.stringify(pa));
  const usCand = L.filterCandidates(NOMINATIM["United States"], "United States")[0];
  check("isRegion: a state (by kind), a country (rank 4), a rank-16 place whose box spans 100 mi; not Bristol, Kingswood or a bare lat/lon; Pennsylvania's box ≈ 360 mi corner to corner",
    L.isRegion(pa[0]) && L.isRegion(usCand) && L.isRegion({ kind: "city", prank: 16, bbox: [50.0, 51.5, -2.0, -2.0] }) && !L.isRegion({ kind: "city", prank: 16, bbox: [51.4, 51.5, -2.6, -2.5] }) && !L.isRegion(rb.c) && !L.isRegion(rk.c) && !L.isRegion({ lat: 1, lon: 2 }) && Math.abs(L.bboxSpan(pa[0]) - 360) < 5, String(L.bboxSpan(pa[0])));
  const paBefore = fetched.length;
  const rpa = await L.resolveSingle("Pennsylvania, United States", ["Coalmont Borough, Huntingdon, Pennsylvania, United States"]);
  check("single 'Pennsylvania, United States': one request (the bare name within the US), the state, no anchor needed",
    rpa.c.kind === "state" && rpa.n === 1 && rpa.anchor === null && fetched.slice(paBefore).map(qOf).join(" | ") === "Pennsylvania" && /countrycodes=us/.test(fetched[fetched.length - 1]), fetched.slice(paBefore).map(qOf).join(" | "));
  check("a state opens FRAMED — Google's name search fits the map to the region and outlines it — not pinned at its centroid",
    L.singleUrl(rpa.c) === "https://www.google.com/maps/search/?api=1&query=Pennsylvania%2C%20United%20States" && L.pinUrl(rpa.c) === "https://www.google.com/maps/search/?api=1&query=40.96999,-77.72788" && L.regionUrl(rpa.c) === L.singleUrl(rpa.c));
  const paSpec = L.linkFor({ side: "tree", place: "Pennsylvania, United States", partner: null, solo: true });
  check("the resolved link carries the framed URL and a tooltip that says why",
    paSpec.kind === "single" && paSpec.text === "📍 map" && paSpec.url === L.singleUrl(rpa.c) && /^Pennsylvania is a state, so the map opens framed on the whole region \(Google fits it to the boundary and outlines it\) rather than pinned at its centre\./.test(paSpec.tip) && /Located with OpenStreetMap \(Nominatim\)\. Click: Google Maps framed on the region\.$/.test(paSpec.tip), paSpec.tip);
  const usBefore = fetched.length;
  const rus = await L.resolveSingle("United States", ["Pennsylvania, United States"]);
  check("a bare country needs no lookup: framed by name, no request, never cached as a located place",
    rus.c.kind === "country" && rus.c.own === true && rus.n === 1 && fetched.length === usBefore && L.singleUrl(rus.c) === "https://www.google.com/maps/search/?api=1&query=United%20States" && !L._geo.places.has("united states"), JSON.stringify(rus));
  const usSpec = L.linkFor({ side: "tree", place: "United States", partner: null, solo: true });
  check("…its tooltip calls it a country and claims no Nominatim lookup", /^United States is a country, so the map opens framed/.test(usSpec.tip) && !/Nominatim/.test(usSpec.tip) && /Click: Google Maps framed on it\.$/.test(usSpec.tip), usSpec.tip);
  check("countryOnly: 'United Kingdom' / 'USA' / 'England' yes; 'Kingswood', 'Pennsylvania, United States', '' no",
    !!L.countryOnly("United Kingdom") && !!L.countryOnly("USA") && L.countryOnly("England").cc === "gb" && L.countryOnly("Kingswood") === null && L.countryOnly("Pennsylvania, United States") === null && L.countryOnly("") === null);
  check("a geocoded region's word: state / country / county / England as a country / a bare region", L.linkFor({ side: "tree", place: "United States", partner: null, solo: true }).tip.startsWith("United States is a country") && /is a state,/.test(paSpec.tip));
  check("towns still get a dropped pin: Bristol / Kingswood / Kobe unchanged", L.singleUrl(rb.c) === L.pinUrl(rb.c) && L.singleUrl(rk.c) === L.pinUrl(rk.c) && L.singleUrl(rkobe.a) === L.pinUrl(rkobe.a) && L.linkFor({ side: "record", place: "Kobe, Japan", partner: { side: "tree", place: "Kōbe-shi, Hyōgo-ken, Japan" } }).url === L.pinUrl(rkobe.a));
  // a country is no anchor for a namesake: the UK's centroid (Cumbria) would pick the Stroud Kingswood
  const UK = { name: "United Kingdom", category: "boundary", type: "administrative", addresstype: "country", place_rank: 4, lat: "54.7023545", lon: "-3.2765753", importance: 0.9, display_name: "United Kingdom", address: { country: "United Kingdom", country_code: "gb" } };
  L._geo.places.set("u.k.", L.filterCandidates([UK], "United Kingdom"));
  check("(the cached 'U.K.' anchor is a country candidate, not a bare country name)", L._geo.places.get("u.k.").length === 1 && L.countryOnly("U.K.") === null);
  L._geo.singles.delete("kingswood, gloucestershire, england, united kingdom");
  const ukBefore = fetched.length;
  const rk3 = await L.resolveSingle("Kingswood, Gloucestershire, England, United Kingdom", ["United Kingdom", "U.K.", "Warmley, Gloucestershire, England, United Kingdom"]);
  check("country anchors are skipped — by name ('United Kingdom') and by cached kind ('U.K.') — so Warmley decides: the South Gloucestershire Kingswood, no request",
    rk3.c.label === "Kingswood, South Gloucestershire" && rk3.anchor === "Warmley, Gloucestershire, England, United Kingdom" && fetched.length === ukBefore, JSON.stringify(rk3));
  // the click flow on a state: blank tab inside the click, one lookup, then the FRAMED map
  page3.appendChild(leaf("Residence • 1 Source", 800, T)); page3.appendChild(leaf("1920", 818, T)); page3.appendChild(leaf("Nebraska, United States", 836, T));
  const p3e = L.inject(L.textUnits(page3));
  const nLink = linkOf(p3e.find((p) => p.place === "Nebraska, United States"));
  check("an unlocated state shows the name-search URL like any single", nLink && nLink._fsseUrl === "https://www.google.com/maps/search/?api=1&query=Nebraska%2C%20United%20States" && nLink.textContent === "📍 map");
  fakeWin = null;
  const nBefore = fetched.length;
  nLink.click();
  check("clicking it opens the tab blank inside the click and shows locating…", fakeWin && fakeWin.url === "" && nLink.textContent === "📍 locating…");
  await new Promise((r) => setTimeout(r, 50));
  const p3f = L.inject(L.textUnits(page3));
  const nLink2 = linkOf(p3f.find((p) => p.place === "Nebraska, United States"));
  check("…then the tab is navigated to the FRAMED map (one request: Nebraska), the link rewritten with the region tooltip",
    fakeWin.location.href === "https://www.google.com/maps/search/?api=1&query=Nebraska%2C%20United%20States" && fetched.slice(nBefore).map(qOf).join(" | ") === "Nebraska" && nLink2 === nLink && nLink.textContent === "📍 map" && /^Nebraska is a state, so the map opens framed/.test(nLink.getAttribute("title")), fakeWin.location.href + " · " + nLink.getAttribute("title"));
  // ---- v0.2.137: pairs by FACT and YEAR, not by row height alone (Kevin's Charles Mansfield
  // KPW8-BD4 linker, 2026-10-30: the record's Census 1851 had paired with the tree's Death 1915 in
  // Perth — two unmatched rows stacked on opposite sides at the same height; "it should be paired
  // with the 1851 residence and not a later death date") -----------------------------------------
  check("factFamily: Census and Residence (and the index-shaped 'Residence Place') are one family; Baptism = Christening; Cremation = Burial; 'Other (Emigration)' unwraps; Event / Event Place have none",
    L.factFamily("Census") === "residence" && L.factFamily("Residence") === "residence" && L.factFamily("Residence Place") === "residence" && L.factFamily("Baptism") === "christening" && L.factFamily("Cremation") === "burial" && L.factFamily("Other (Emigration)") === "migration" && L.factFamily("Probate") === "death" && L.factFamily("Event") === null && L.factFamily("Event Place") === null && L.factFamily("Birth • 2 Sources") === null);
  check("yearSpan: a year, a full date, a range, none", JSON.stringify([L.yearSpan("1851"), L.yearSpan("31 Mar 1901"), L.yearSpan("from 1849 to 1853"), L.yearSpan("1896–1901"), L.yearSpan("Deceased"), L.yearSpan(null)]) === "[[1851,1851],[1901,1901],[1849,1853],[1896,1901],null,null]");
  const pl = (side, fact, date, labelTop) => ({ side, fact, date, labelTop, top: labelTop + 40, place: "x" });
  const sc = (a, b) => L.pairScore(a, b);
  check("pairScore: a record Census never pairs with a tree Death, however aligned the rows", sc(pl("record", "Census", "1851", 540), pl("tree", "Death", "24 March 1915", 565)) === null);
  check("pairScore: Census 1851 ↔ Residence 1851 pairs by year 300 px apart; ↔ Residence 1861 never, aligned or not", sc(pl("record", "Census", "1851", 540), pl("tree", "Residence", "1851", 838)).by === "year" && sc(pl("record", "Census", "1851", 540), pl("tree", "Residence", "1861", 545)) === null && sc(pl("record", "Census", "1851", 540), pl("tree", "Residence", "1861", 929)) === null);
  check("pairScore: a residence dated as a range that covers the census year pairs by year", sc(pl("record", "Residence", "31 Mar 1901", 400), pl("tree", "Residence", "from 1899 to 1905", 800)).by === "year");
  check("pairScore: Birth 1848 ↔ Birth 1847 pairs by fact off the row; Birth 1840 ↔ Birth 1847 only on one row", sc(pl("record", "Birth", "1848", 383), pl("tree", "Birth", "20 June 1847", 700)).by === "fact" && sc(pl("record", "Birth", "1840", 383), pl("tree", "Birth", "1847", 700)) === null && sc(pl("record", "Birth", "1840", 383), pl("tree", "Birth", "1847", 390)).by === "row");
  check("pairScore: a record Birth may stand against a tree Christening (second choice, any gap), never against a Marriage", sc(pl("record", "Birth", "1848", 383), pl("tree", "Christening", "12 January 1851", 474)).key[0] === 1 && sc(pl("record", "Birth", "1848", 383), pl("tree", "Marriage", "1869", 390)) === null);
  check("pairScore: a fact of no known kind ('Event') pairs by the row alone, and not when the years contradict", sc(pl("record", "Event", null, 300), pl("tree", "Residence", "1851", 310)).by === "row" && sc(pl("record", "Event", "1851", 300), pl("tree", "Residence", "1861", 310)) === null && sc(pl("record", "Event", "1851", 300), pl("tree", "Residence", "1851", 600)) === null);
  check("pairScore: no year on one side → FS's own row decides", sc(pl("record", "Residence Place", null, 500), pl("tree", "Residence", "1935", 500)).by === "row" && sc(pl("record", "Residence Place", null, 500), pl("tree", "Residence", "1935", 700)) === null);
  // the screenshot's geometry (CSS px): record Birth / Occupation / Census on the left, seven tree facts on the right — the tree labels bare (no sources chip), side by x
  const RC = 257;
  const TC = 1021;
  const charles = mk("div", [
    leaf("Person of Record and Spouse", 281, RC), leaf("Tree Person and Spouse", 281, 1013),
    mk("div", [
      leaf("Charles", 322, 307), leaf("1848-", 346, 307),
      leaf("Birth", 383, RC), leaf("1848", 409, RC), leaf("Shoreditch, Middlesex", 434, RC),
      leaf("Occupation", 474, RC), leaf("Scholar", 500, RC),
      leaf("Census", 540, RC), leaf("1851", 566, RC), leaf("Liberty Old Artillery Ground, Middlesex, England", 591, RC),
    ]),
    mk("div", [
      leaf("Charles Mansfield", 320, 1084), leaf("1847-1915 • KPW8-BD4", 345, 1084),
      leaf("Birth", 383, TC), leaf("20 June 1847", 409, TC), leaf("London, England, United Kingdom", 434, TC),
      leaf("Christening", 474, TC), leaf("12 January 1851", 500, TC), leaf("Whitechapel, Middlesex, England, United Kingdom", 525, TC),
      leaf("Death", 565, TC), leaf("24 March 1915", 591, TC), leaf("Perth, Western Australia, Australia", 616, TC),
      leaf("Burial", 656, TC), leaf("25 March 1915", 682, TC), leaf("Karrakatta Cemetery, Karrakatta, Western Australia, Australia", 707, TC),
      leaf("Other (Emigration)", 747, TC), leaf("7 October 1873", 773, TC), leaf("London, England, United Kingdom", 798, TC),
      leaf("Residence", 838, TC), leaf("1851", 864, TC), leaf("Middlesex, England, United Kingdom", 889, TC),
      leaf("Residence", 929, TC), leaf("1861", 955, TC), leaf("London, England", 980, TC),
    ]),
    leaf("Maria Louisa Warren (Wife)", 1029, 1084),
  ]);
  const cmp = L.scanPlaces(L.textUnits(charles).units);
  const cmPairs = L.pairPlaces(cmp);
  const cmBy = (side, fact, i) => cmp.filter((p) => p.side === side && p.fact === fact)[i || 0];
  check("Charles: nine places — record Birth + Census, tree Birth / Christening / Death / Burial / Other (Emigration) / Residence ×2", cmp.length === 9 && cmp.filter((p) => p.side === "record").length === 2, JSON.stringify(cmp.map((p) => [p.side, p.fact, p.date, p.place])));
  check("Charles: exactly two pairs — Birth ↔ Birth and Census 1851 ↔ Residence 1851 (300 px down the page), the Death row NOT taken though it sits 25 px from the Census row",
    cmPairs.length === 2 && cmBy("record", "Birth").partner === cmBy("tree", "Birth") && cmBy("record", "Census").partner === cmBy("tree", "Residence", 0) && cmBy("tree", "Residence", 0).date === "1851" && !cmBy("tree", "Death").partner && !cmBy("tree", "Residence", 1).partner && !cmBy("tree", "Christening").partner && !cmBy("tree", "Burial").partner && !cmBy("tree", "Other (Emigration)").partner,
    JSON.stringify(cmPairs.map(([r, t]) => [r.fact + " " + r.date, t.fact + " " + t.date])));
  check("Charles: the pairs say how they were chosen — Birth ↔ Birth by fact (1848 vs 1847), Census ↔ Residence by year", cmBy("record", "Birth").pairedBy === "fact" && cmBy("record", "Census").pairedBy === "year" && cmBy("tree", "Residence", 0).pairedBy === "year");
  const cmSpec = L.linkFor(cmBy("record", "Census"));
  check("Charles: the Census compare link runs Liberty Old Artillery Ground → Middlesex, and its tooltip opens with the pairing note", cmSpec.kind === "pair" && cmSpec.text === "📍 compare" && /origin=Liberty%20Old%20Artillery%20Ground/.test(cmSpec.url) && /destination=Middlesex%2C%20England%2C%20United%20Kingdom/.test(cmSpec.url) && cmSpec.tip.startsWith("Paired as the same kind of fact in the same year: the record's Census 1851 against the tree's Residence 1851. "), cmSpec.url + " · " + cmSpec.tip);
  check("Charles: the tree Residence 1851 link is the other side of that pair (same URL); the Death and Residence 1861 links are singles that say why", L.linkFor(cmBy("tree", "Residence", 0)).url === cmSpec.url && L.linkFor(cmBy("tree", "Death")).kind === "single" && /No place of the same kind/.test(L.linkFor(cmBy("tree", "Death")).tip) && L.linkFor(cmBy("tree", "Residence", 1)).kind === "single");
  check("Charles: Birth ↔ Birth, the same fact on one row, carries no pairing note", !/^Paired as/.test(L.linkFor(cmBy("record", "Birth")).tip));
  // two marriages in the tree: the record's 1869 marriage meets the tree's 1869 one, not the 1890 one that happens to share its row
  const twoMarriages = mk("div", [
    leaf("Marriage", 300, RC), leaf("28 August 1869", 326, RC), leaf("Stepney, Middlesex, England", 351, RC),
    leaf("Marriage", 310, TC), leaf("1890", 336, TC), leaf("Perth, Western Australia, Australia", 361, TC),
    leaf("Marriage", 600, TC), leaf("28 August 1869", 626, TC), leaf("Stepney, London, England, United Kingdom", 651, TC),
  ]);
  const mp = L.scanPlaces(L.textUnits(twoMarriages).units);
  L.pairPlaces(mp);
  check("two tree marriages: the record's 1869 marriage pairs with the tree's 1869 marriage 300 px down, not the 1890 one on its row", mp.length === 3 && mp[0].partner && mp[0].partner.date === "28 August 1869" && mp[0].pairedBy === "year" && !mp.find((p) => p.date === "1890").partner, JSON.stringify(mp.map((p) => [p.side, p.fact, p.date, !!p.partner])));
  const fl = L.scanPlaces(L.textUnits(page).units); // Florence, whose tree birthplace an earlier check rewrote to "Deceased": four places, no pair
  check("the linker page's scan is unchanged by person mode: Florence still yields her four places, none solo, no pair", fl.length === 4 && fl.every((p) => !p.solo) && L.pairPlaces(fl).length === 0 && L.scanPlaces(L.textUnits(page).units, "linker").length === 4, fl.map((p) => [p.side, p.fact, p.place]).join(" · "));
  // ---- v1.0.1: the stated hierarchy bounds the namesakes (Kevin's Frederick William Garber KPHT-ZKX,
  // 2026-11-03: the burial "LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania" pinned rural
  // Oklahoma — the one "Lawnview Cemetery" the map knows in the US; the cemetery beside Fox Chase is
  // mapped as "Lawnview Memorial Park") ------------------------------------------------------------
  check("isVenue: a venue word ends the name or opens it as '… of'; a town with the word inside is not one",
    ["LawnView Cemetery", "St Mary's Church", "Holy Trinity Churchyard", "Royal Infirmary", "Church of St Mary", "Karrakatta Cemetery and Crematorium", "Lawnview Memorial Park", "Abington Memorial Hospital", "Mount Moriah Cemetery"].every(L.isVenue) && !["Church Stretton", "Kingswood", "Fox Chase", "Chapel Hill", "Chapel Hill Road", "Bristol", "Hospital Hill"].some(L.isVenue));
  check("bareVenueName strips the venue words and connectors; a name that is nothing but venue words stays",
    L.bareVenueName("LawnView Cemetery") === "LawnView" && L.bareVenueName("Church of St Mary") === "St Mary" && L.bareVenueName("Karrakatta Cemetery and Crematorium") === "Karrakatta" && L.bareVenueName("Cemetery") === "Cemetery" && L.bareVenueName("St Andrew's Church") === "St Andrew's" && L.bareVenueName("Church of the Holy Trinity") === "Holy Trinity");
  const sb = L.searchBox({ lat: 40.0772, lon: -75.0772 }, 10);
  check("searchBox: ±10 mi around a point as [west, north, east, south] (lon, lat pairs — Nominatim's viewbox order)",
    sb && +sb[0] < -75.0772 && +sb[1] > 40.0772 && +sb[2] > -75.0772 && +sb[3] < 40.0772 && Math.abs(+sb[1] - +sb[3] - 20 / 69) < 0.001 && +sb[2] - +sb[0] > 0.3, JSON.stringify(sb));
  const sbr = L.searchBox({ kind: "county", prank: 12, bbox: [52.3, 53.0, -3.2, -2.2], lat: 52.65, lon: -2.7 }, 10);
  check("searchBox around a region grows its bounding box on every side", sbr && +sbr[3] < 52.3 && +sbr[1] > 53.0 && +sbr[0] < -3.2 && +sbr[2] > -2.2, JSON.stringify(sbr));
  check("GEO_STORE moved to v7 (v6 entries could hold a namesake a thousand miles off)", /fsse.geo.v7/.test(require("fs").readFileSync(path.join(SRC, "linker.js"), "utf8")));
  // the live case, request by request
  const lvBefore = fetched.length;
  const rlv = await L.resolveSingle("LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania", ["Philadelphia, Philadelphia, Pennsylvania, United States"]);
  check("requests: the bare venue within the US, the full string, the REST of the place (Fox Chase — settled at once, the Kentucky and New Jersey namesakes do not fit), then the bare name 'LawnView' bounded to ±10 mi of it; the anchor is never needed",
    fetched.slice(lvBefore).map(qOf).join(" | ") === "LawnView Cemetery | LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania | Fox Chase | LawnView", fetched.slice(lvBefore).map(qOf).join(" | "));
  const boundedReq = fetched.slice(lvBefore).find((s) => new URLSearchParams(s).get("bounded") === "1");
  check("the bounded request carries countrycodes=us, bounded=1 and a viewbox ±10 mi around Fox Chase",
    boundedReq && /countrycodes=us/.test(boundedReq) && /viewbox=-75\.2\d+%2C40\.2\d+%2C-74\.8\d+%2C39\.9\d+/.test(boundedReq), boundedReq);
  check("→ the Oklahoma namesake (1,300 mi from Fox Chase) is rejected and the cemetery is found under the map's own name, 'Lawnview Memorial Park', a mile from Fox Chase",
    rlv.c.name === "Lawnview Memorial Park" && rlv.c.bounded === true && rlv.c.venueOf === "LawnView Cemetery" && rlv.c.standsFor === "Fox Chase, Philadelphia, Pennsylvania" && Math.abs(rlv.c.lat - 40.08096) < 0.001 && Math.abs(rlv.c.lon + 75.09637) < 0.001 && rlv.c.tailMi < 2 && rlv.n === 1 && !rlv.c.standIn, JSON.stringify(rlv.c));
  const lvSpec = L.linkFor({ side: "tree", place: "LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania", partner: null, solo: true });
  check("the link: a pin on the memorial park; the tooltip names the map's name for it and the area it was found in; Shift+click searches Google Maps by the full name",
    lvSpec.url === "https://www.google.com/maps/search/?api=1&query=40.08096,-75.09637" && /^Pinned at Lawnview Memorial Park, Abington Township, Montgomery County\. "LawnView Cemetery" is on OpenStreetMap as "Lawnview Memorial Park", found within 10 mi of Fox Chase, Philadelphia, Pennsylvania/.test(lvSpec.tip) && /Located with OpenStreetMap \(Nominatim\)\. Click: Google Maps with the pin; Shift\+click: Google Maps searched by the full name instead\.$/.test(lvSpec.tip) && lvSpec.alt === L.mapsUrl("LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania"), lvSpec.tip + " · " + lvSpec.url);
  // a venue the bounded search cannot find either → the rest of the place stands in; a venue's click goes to Google by name
  const umBefore = fetched.length;
  const rum = await L.resolveSingle("Unmapped Cemetery, Fox Chase, Philadelphia, Pennsylvania", []);
  check("a venue the bounded search cannot find either: the rest of the place stands in (Fox Chase, from the cache), flagged with the words it stands for and how far the only namesake is",
    rum.c.standIn === "Unmapped Cemetery" && rum.c.standsFor === "Fox Chase, Philadelphia, Pennsylvania" && rum.c.byName === true && rum.c.name === "Fox Chase" && rum.c.fit === true && /^ \(the one "Unmapped Cemetery" the map knows is 1\d\d\d mi away\)$/.test(rum.c.farNote) && fetched.slice(umBefore).map(qOf).join(" | ") === "Unmapped Cemetery | Unmapped Cemetery, Fox Chase, Philadelphia, Pennsylvania | Unmapped", JSON.stringify(rum.c) + " · " + fetched.slice(umBefore).map(qOf).join(" | "));
  const umSpec = L.linkFor({ side: "tree", place: "Unmapped Cemetery, Fox Chase, Philadelphia, Pennsylvania", partner: null, solo: true });
  check("its click searches Google Maps by the full name (Google knows most cemeteries); Shift+click pins Fox Chase; the tooltip says so",
    umSpec.url === L.mapsUrl("Unmapped Cemetery, Fox Chase, Philadelphia, Pennsylvania") && umSpec.alt === L.pinUrl(rum.c) && /^"Unmapped Cemetery" is not on OpenStreetMap near Fox Chase, Philadelphia, Pennsylvania \(the one "Unmapped Cemetery" the map knows is \d+ mi away\), so Fox Chase, Philadelphia stands in for it\. Located with OpenStreetMap \(Nominatim\)\. Google Maps knows most cemeteries and churches, so the click searches it by the full name; Shift\+click: a pin on Fox Chase, Philadelphia\.$/.test(umSpec.tip), umSpec.tip);
  check("singleUrl / singleAlt on the stand-in agree with the link; a plain candidate has no alt",
    L.singleUrl(rum.c) === umSpec.url && L.singleAlt(rum.c, "x") === umSpec.alt && L.singleAlt(rb.c, "Bristol, Gloucestershire, England, United Kingdom") === null);
  // a first component the map does not know at all, not a venue → the rest stands in with a pin
  const nfBefore = fetched.length;
  const rnf = await L.resolveSingle("Nonesuch Farm, Fox Chase, Philadelphia, Pennsylvania", []);
  const nfSpec = L.linkFor({ side: "tree", place: "Nonesuch Farm, Fox Chase, Philadelphia, Pennsylvania", partner: null, solo: true });
  check("a first component with no namesake anywhere, not a venue: the rest stands in with a PIN on it (no bounded search), Shift+click = Google by the full name, the tooltip says what stands for what",
    rnf.c.standIn === "Nonesuch Farm" && !rnf.c.byName && !rnf.c.farNote && nfSpec.url === L.pinUrl(rnf.c) && nfSpec.alt === L.mapsUrl("Nonesuch Farm, Fox Chase, Philadelphia, Pennsylvania") && /^"Nonesuch Farm" is not on OpenStreetMap near Fox Chase, Philadelphia, Pennsylvania, so Fox Chase, Philadelphia stands in for it\. Located with OpenStreetMap \(Nominatim\)\. Click: Google Maps with the pin; Shift\+click: Google Maps searched by the full name instead\.$/.test(nfSpec.tip) && fetched.slice(nfBefore).map(qOf).join(" | ") === "Nonesuch Farm | Nonesuch Farm, Fox Chase, Philadelphia, Pennsylvania", nfSpec.tip + " · " + fetched.slice(nfBefore).map(qOf).join(" | "));
  // the tiers, on a point rest: inside (0) → within TAIL_NEAR_MI → stand in
  const REST = ["fox chase", "philadelphia", "pennsylvania"];
  const nearCand = L.candidateOf({ name: "Nonesuch", category: "place", type: "hamlet", lat: "40.15", lon: "-75.08", importance: 0.1, display_name: "Nonesuch, Montgomery County, Pennsylvania, United States", address: { hamlet: "Nonesuch", county: "Montgomery County", state: "Pennsylvania", country: "United States", country_code: "us" } }, "Nonesuch", REST);
  const farCand = L.candidateOf(OKLAHOMA_CEMETERY("Nonesuch"), "Nonesuch", REST);
  const bt = await L.boundByTail("Nonesuch, Fox Chase, Philadelphia, Pennsylvania", ["Nonesuch", "Fox Chase", "Philadelphia", "Pennsylvania"], "us", [farCand, nearCand]);
  check("boundByTail: a namesake within 15 mi of the stated area is kept (modern boundaries drift), one a thousand miles off is dropped; both carry the distance and the bound",
    bt.length === 1 && bt[0] === nearCand && nearCand.tailMi > 4.5 && nearCand.tailMi < 5.5 && nearCand.bound === "Fox Chase, Philadelphia, Pennsylvania" && farCand.tailMi > 1000 && L.TAIL_NEAR_MI === 15 && L.VENUE_NEAR_MI === 10, JSON.stringify(bt.map((c) => [c.name, c.tailMi])));
  check("…and the tooltip on such a candidate says it lies within N mi of the stated area",
    /^ No "Nonesuch" is listed under "Fox Chase, Philadelphia, Pennsylvania" by address \(modern boundaries differ from the tree's\), but this one lies within 5\.\d mi of it, so it was taken — if the tree's place is mis-standardised, the pin shows where its words point\.$/.test(L.boundNote(nearCand, "Nonesuch, Fox Chase, Philadelphia, Pennsylvania", "single")), L.boundNote(nearCand, "Nonesuch, Fox Chase, Philadelphia, Pennsylvania", "single"));
  const farVenue = L.candidateOf(OKLAHOMA_CEMETERY("Nonesuch Cemetery"), "Nonesuch Cemetery", REST);
  const btv = await L.boundByTail("Nonesuch Cemetery, Fox Chase, Philadelphia, Pennsylvania", ["Nonesuch Cemetery", "Fox Chase", "Philadelphia", "Pennsylvania"], "us", [farVenue]);
  check("a venue namesake a thousand miles off → the bounded search runs (nothing) → the rest stands in, Google by name", btv.length === 1 && btv[0].standIn === "Nonesuch Cemetery" && btv[0].byName === true && qOf(fetched[fetched.length - 1]) === "Nonesuch" && new URLSearchParams(fetched[fetched.length - 1]).get("bounded") === "1", JSON.stringify(btv));
  // a pair whose record side stands in: geoTip carries the stand-in sentence and no "places match" count
  const FOX = L._geo.places.get("fox chase, philadelphia, pennsylvania")[0];
  const gt = L.geoTip({ a: rum.c, b: FOX, miles: 0, nA: 2, nB: 1 }, "Unmapped Cemetery, Fox Chase, Philadelphia, Pennsylvania", "Fox Chase, Philadelphia, Pennsylvania");
  check("geoTip on a pair whose record side stands in: the stand-in sentence, no 'places match' count for that side",
    /"Unmapped Cemetery" is not on OpenStreetMap near Fox Chase, Philadelphia, Pennsylvania \(the one "Unmapped Cemetery" the map knows is \d+ mi away\), so Fox Chase, Philadelphia stands in for it\./.test(gt) && !/places match/.test(gt), gt);
  check("geoTip on a rescued venue side names the map's name for it", /"LawnView Cemetery" is on OpenStreetMap as "Lawnview Memorial Park", found within 10 mi of Fox Chase, Philadelphia, Pennsylvania/.test(L.geoTip({ a: rlv.c, b: FOX, miles: 1.1, nA: 1, nB: 1 }, "LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania", "Fox Chase, Philadelphia, Pennsylvania")));
  // a place that names no country is never bounded by its rest (the rest could resolve anywhere)
  const blankBefore = fetched.length;
  const rkb = await L.geocode("Kingswood, Blankshire");
  check("a place that names no country is never bounded by its rest: the three Kingswoods stay, no 'Blankshire' request",
    rkb.length === 3 && rkb.every((c) => c.fit === false && c.bound == null) && fetched.slice(blankBefore).map(qOf).join(" | ") === "Kingswood | Kingswood, Blankshire", fetched.slice(blankBefore).map(qOf).join(" | ") + " · " + rkb.length);
  // the click flow end to end on the person page: the burial's link → blank tab → the four lookups → a pin on the memorial park
  L._geo.places.delete("lawnview cemetery, fox chase, philadelphia, pennsylvania");
  L._geo.singles.delete("lawnview cemetery, fox chase, philadelphia, pennsylvania");
  const garber = mk("div", [], {}, box(0, 0));
  garber.appendChild(leaf("Burial • 4 Sources", 940, 723)); garber.appendChild(leaf("8 Feb 1934", 964, 723)); garber.appendChild(leaf("LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania", 989, 723));
  garber.appendChild(leaf("Death • 7 Sources", 940, 170)); garber.appendChild(leaf("5 Feb 1934", 964, 170)); garber.appendChild(leaf("Philadelphia, Philadelphia, Pennsylvania, United States", 989, 170));
  const gi = L.inject(L.textUnits(garber), "person");
  const burialLink = linkOf(gi.find((p) => p.fact === "Burial"));
  check("the burial place gets a '📍 map' link whose anchor is the death place", burialLink && burialLink.textContent === "📍 map" && burialLink._fsseAnchors[0] === "Philadelphia, Philadelphia, Pennsylvania, United States", JSON.stringify(burialLink && burialLink._fsseAnchors));
  fakeWin = null;
  const gBefore = fetched.length;
  burialLink.click();
  check("the click opens the tab blank and shows locating…", fakeWin && fakeWin.url === "" && burialLink.textContent === "📍 locating…");
  await new Promise((r) => setTimeout(r, 80));
  const gi2 = L.inject(L.textUnits(garber), "person");
  const burialLink2 = linkOf(gi2.find((p) => p.fact === "Burial"));
  check("…then the tab is navigated to a pin on Lawnview Memorial Park (not Oklahoma), after the four lookups, and the link's tooltip says where it was found",
    fakeWin && fakeWin.location.href === "https://www.google.com/maps/search/?api=1&query=40.08096,-75.09637" && fetched.slice(gBefore).map(qOf).join(" | ") === "LawnView Cemetery | LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania | LawnView" && burialLink2 === burialLink && burialLink.textContent === "📍 map" && /on OpenStreetMap as "Lawnview Memorial Park"/.test(burialLink.getAttribute("title")) && burialLink._fsseAlt === L.mapsUrl("LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania"),
    (fakeWin && fakeWin.location.href) + " · " + fetched.slice(gBefore).map(qOf).join(" | ") + " · " + burialLink.getAttribute("title"));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
// (the synchronous tail below is superseded by the async block above)
if (false) {
  // (moved into the async block above so the geocoding checks can await the fetch stubs)
}
