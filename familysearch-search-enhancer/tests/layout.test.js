// layout.test.js — the Search Records panel finder across FamilySearch's page layouts (v0.2.92):
// the classic wide card, the narrow-viewport third-party cluster, and the LABS person page
// (2026-09-21, Betsy Bellwood KHW2-6TP) where "Search Records" is a header button whose
// dropdown — FamilySearch Records · Full Text · Trees | Ancestry · MyHeritage · Findmypast ·
// Geneanet · Storied · Filae · Google — exists only while open, beside a HIDDEN copy of the
// narrow-layout panel. Run: node tests/run.js layout
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};

// ---- fake DOM: children/parent, concatenated text, querySelectorAll("*" | "a[href]"), contains,
// visibility, inline style, attributes, href, deep clone (v0.2.101 — the hidden-anchor clone) --
function el(tag, kids, opts) {
  const n = {
    tagName: tag.toUpperCase(), children: [], parentElement: null, _text: "", _hidden: !!(opts && opts.hidden), _attrs: {},
    style: {}, href: opts && typeof opts.href === "string" ? opts.href : "", isConnected: true,
    click() { this._clicks = (this._clicks || 0) + 1; },
    get childElementCount() { return this.children.length; },
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
    set textContent(v) { this._text = String(v); this.children = []; },
    querySelectorAll(sel) {
      const out = [];
      (function walk(x) { for (const c of x.children) { out.push(c); walk(c); } })(this);
      if (sel === "*") return out;
      if (sel === "a[href]") return out.filter((x) => x.tagName === "A" && x.href);
      return [];
    },
    contains(other) { for (let x = other; x; x = x.parentElement) if (x === this) return true; return false; },
    isShown() { for (let x = this; x; x = x.parentElement) if (x._hidden) return false; return true; },
    getBoundingClientRect() { return this.isShown() ? { width: 200, height: 24 } : { width: 0, height: 0 }; },
    checkVisibility() { return this.isShown(); },
    getClientRects() { return this.isShown() ? [{}] : []; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    removeAttribute(k) { delete this._attrs[k]; if (k === "href") this.href = ""; },
    cloneNode(deep) {
      const c = el(tag, [], { hidden: this._hidden, href: this.href });
      c._text = this._text;
      c._attrs = { ...this._attrs };
      c.style = { ...this.style };
      if (deep) for (const k of this.children) { const kc = k.cloneNode(true); kc.parentElement = c; c.children.push(kc); }
      return c;
    },
  };
  for (const k of kids || []) {
    if (typeof k === "string") n._text += k;
    else { k.parentElement = n; n.children.push(k); }
  }
  return n;
}
// A native entry row; `href` only when given as a string (".map(li)" passes the index).
const li = (label, href) => el("li", [el("a", [el("img", []), el("span", [label])], { href: typeof href === "string" ? href : "" })]);
// The native FamilySearch search link as the classic card's "FamilySearch" row / the Labs
// dropdown's "FamilySearch Records" entry carry it (v0.2.101: both are replaced by our menu).
const NATIVE_URL = "https://www.familysearch.org/search/record/results?q.givenName=Betsy&q.surname=Bellwood&q.birthLikeDate.from=1850&treeref=KHW2-6TP";

globalThis.document = el("body", []);
globalThis.location = { pathname: "/en/tree/person/details/KHW2-6TP", origin: "https://www.familysearch.org" };
require(path.join(SRC, "inject.js"));
FSSE.DEBUG = false;

// The hidden narrow-layout third-party panel (in the DOM on every layout).
const narrowPanel = () => el("div", [el("ul", ["Ancestry", "MyHeritage", "FindMyPast", "American Ancestors", "Filae", "Geneanet", "Storied", "All Third-Parties"].map(li))], { hidden: true });
// The Labs dropdown (a portal at the end of the body while open).
const dropdown = () => el("div", [
  el("ul", [li("FamilySearch Records", NATIVE_URL), li("FamilySearch Full Text"), li("FamilySearch Trees")]),
  el("hr", []),
  el("ul", ["Ancestry", "MyHeritage", "Findmypast", "Geneanet", "Storied", "Filae", "Google"].map(li)),
]);
const labsHeader = () => el("div", [el("span", ["Quality Score:"]), el("button", ["High"]), el("button", [el("svg", []), el("span", ["Search Records"])]), el("button", ["Tools"]), el("button", ["Opt-Out of Experiment"])]);
const bigPageText = () => el("p", ["Vitals Name Betsy Bellwood Birth 6 September 1850 York Death 31 March 1915 Newcastle Family Members Spouses and Children Parents and Siblings Other Information Residence ".repeat(6)]);

// ---- Labs page, dropdown CLOSED: only the hidden panel exists → nothing to inject into ------
globalThis.document = el("body", [labsHeader(), bigPageText(), narrowPanel()]);
check("labs, dropdown closed: no section (the hidden panel is ignored)", FSSE.findSection() === null);
check("layout detected as labs", FSSE._layout === "labs");

// ---- Labs page, dropdown OPEN: the whole dropdown (FS group + third parties) is the section --
const dd = dropdown();
globalThis.document = el("body", [labsHeader(), bigPageText(), narrowPanel(), dd]);
const section = FSSE.findSection();
check("labs, dropdown open: the dropdown is picked, expanded from its third-party list to the whole menu", section === dd, section && section.textContent.slice(0, 60));
const trees = FSSE.findEntryByLabel(section, "FamilySearch Trees");
check("findEntryByLabel: 'FamilySearch Trees' → its <li> (the FS group counts as an entry list)", trees && trees.tagName === "LI" && trees.textContent === "FamilySearch Trees", trees && trees.tagName + " " + trees.textContent);
const anc = FSSE.findEntryByLabel(section, "Ancestry");
check("findEntryByLabel: 'Ancestry' → its <li> in the third-party list", anc && anc.tagName === "LI" && anc.textContent === "Ancestry");
check("findEntryByLabel: 'Findmypast' present (labs spelling), 'FindMyPast' only in the hidden panel", !!FSSE.findEntryByLabel(section, "Findmypast") && !FSSE.findEntryByLabel(section, "FindMyPast"));
check("no bare 'FamilySearch' entry in the labs dropdown (fs-records falls to 'FamilySearch Trees')", !FSSE.findEntryByLabel(section, "FamilySearch"));

// ---- Legacy wide layout: the classic "Search Records" card beats the hidden panel ---------
const card = el("div", [el("h3", ["Search Records"]), el("ul", [li("FamilySearch", NATIVE_URL), ...["Ancestry", "MyHeritage", "Findmypast", "Geneanet", "Storied", "Google"].map((l) => li(l))]), el("a", ["Search Trees"])]);
globalThis.document = el("body", [el("div", [el("span", ["Quality Score:"]), el("span", ["Medium"])]), bigPageText(), card, narrowPanel()]);
const legacy = FSSE.findSection();
check("legacy: the classic card is picked via its heading", legacy === card);
check("layout detected as legacy", FSSE._layout === "legacy");
check("legacy: 'FamilySearch' anchor → its <li>", FSSE.findEntryByLabel(legacy, "FamilySearch").tagName === "LI");

// ---- Narrow legacy layout: only the third-party cluster, SHOWN → picked --------------------
const narrowShown = el("div", [el("ul", ["Ancestry", "MyHeritage", "FindMyPast", "American Ancestors", "Filae", "Geneanet", "Storied", "All Third-Parties"].map(li))]);
globalThis.document = el("body", [bigPageText(), narrowShown, el("div", [card], { hidden: true })]);
const narrow = FSSE.findSection();
check("narrow layout: the shown third-party cluster wins over the hidden classic card", narrow === narrowShown.children[0] || narrow === narrowShown, narrow && narrow.tagName);

// ---- The FS-only names count for the entry-list rule but never make a page a panel --------
const fsOnly = el("div", [el("ul", ["FamilySearch Records", "FamilySearch Full Text", "FamilySearch Trees"].map(li))]);
globalThis.document = el("body", [bigPageText(), fsOnly]);
check("an FS-only list alone (3 known names) is not a panel", FSSE.findSection() === null);

// ---- v0.2.93: a clone finds its label by the anchor's label PATH, so an OPEN menu row
// ("FreeBMD ▾") still relabels entries anchored on its closed text ("FreeBMD ▸") -----------
const mkRow = (text) => {
  const span = el("span", [text]);
  const row = el("li", [el("a", [el("img", []), span])]);
  return { row, span };
};
const anchorOpen = mkRow("FreeBMD ▾");
anchorOpen.row._fsseLabelLeaf = anchorOpen.span;
const cloneOfOpen = mkRow("FreeBMD ▾");
check("labelLeafIn: by the anchor's label path (menu open, anchored on the closed caret)", FSSE._labelLeafIn(cloneOfOpen.row, anchorOpen.row, "FreeBMD ▸") === cloneOfOpen.span);
const noPath = mkRow("FreeBMD ▾");
check("labelLeafIn: by text with the other caret when no path is known", FSSE._labelLeafIn(noPath.row, {}, "FreeBMD ▸") === noPath.span);
const native = mkRow("Findmypast");
check("labelLeafIn: a native anchor by exact text", FSSE._labelLeafIn(native.row, native.row, "Findmypast") === native.span);
check("labelLeafIn: unknown label → null (the caller appends the text)", FSSE._labelLeafIn(native.row, {}, "Nope") === null);
const rowIsLabel = el("li", ["Google"]);
rowIsLabel._fsseLabelLeaf = rowIsLabel;
check("labelLeafIn: a row that is its own label → the clone itself", FSSE._labelLeafIn(native.row, rowIsLabel, "Google") === native.row);

// ---- v0.2.101: the native entry the FamilySearch menu REPLACES — located on either layout
// with the URL its link carries (→ the menu's "Indexed Historical Records" entry), hidden
// while our row is present, and cloned WITHOUT the hiding -----------------------------------
const REPL = FSSE.SITES ? FSSE.SITES.find((s) => s.id === "fs-records").replaces : ["FamilySearch", "FamilySearch Records"];
const nLabs = FSSE.findNativeEntry(section, REPL);
check("findNativeEntry labs: the 'FamilySearch Records' <li> + the URL of its link", nLabs && nLabs.label === "FamilySearch Records" && nLabs.row.tagName === "LI" && nLabs.url === NATIVE_URL, JSON.stringify(nLabs && [nLabs.label, nLabs.url]));
const nLegacy = FSSE.findNativeEntry(legacy, REPL);
check("findNativeEntry legacy: the bare 'FamilySearch' row + its link", nLegacy && nLegacy.label === "FamilySearch" && nLegacy.row.tagName === "LI" && nLegacy.url === NATIVE_URL, JSON.stringify(nLegacy && [nLegacy.label, nLegacy.url]));
check("findNativeEntry narrow: null (the third-party cluster has no FamilySearch row)", FSSE.findNativeEntry(narrow, REPL) === null);
const noLink = el("div", [el("ul", [li("FamilySearch"), li("Ancestry"), li("MyHeritage")])]);
const nNoLink = FSSE.findNativeEntry(noLink, REPL);
check("findNativeEntry: a row with no link → url null (options() then uses a URL of its own)", nNoLink && nNoLink.label === "FamilySearch" && nNoLink.url === null, JSON.stringify(nNoLink && [nNoLink.label, nNoLink.url]));
const rowIsLink = el("div", [el("ul", [el("a", [el("span", ["FamilySearch"])], { href: NATIVE_URL }), el("a", [el("span", ["Ancestry"])]), el("a", [el("span", ["MyHeritage"])])])]);
check("findNativeEntry: the row itself an <a href> → its URL", FSSE.findNativeEntry(rowIsLink, REPL).url === NATIVE_URL);
check("findEntryByLabel quiet: an absent label → null, silently", FSSE.findEntryByLabel(narrow, "FamilySearch", true) === null);
check("setNativeHidden: hides with inline display:none + marker, reports the change", FSSE.setNativeHidden(nLegacy.row, true) === true && nLegacy.row.style.display === "none" && nLegacy.row.getAttribute("data-fsse-hidden") === "1");
check("setNativeHidden: idempotent", FSSE.setNativeHidden(nLegacy.row, true) === false);
nLegacy.row.style.display = ""; // a React re-render reset the style
check("setNativeHidden: re-applies display:none after a style reset", FSSE.setNativeHidden(nLegacy.row, true) === true && nLegacy.row.style.display === "none");
check("findEntryByLabel still finds the hidden row (text-based) — it stays the anchor", FSSE.findEntryByLabel(legacy, "FamilySearch") === nLegacy.row);
const { clone } = FSSE._cloneRow(nLegacy.row, null, "FamilySearch", "FamilySearch ▸");
check("cloneRow: the clone of the hidden native row is shown, unmarked and relabelled", clone.style.display === "" && clone.getAttribute("data-fsse-hidden") === null && clone.textContent === "FamilySearch ▸", JSON.stringify([clone.style.display, clone.getAttribute("data-fsse-hidden"), clone.textContent]));
check("cloneRow: the native link is stripped from the clone, the original keeps it", !clone.children[0].href && nLegacy.row.children[0].href === NATIVE_URL, clone.children[0].href);
check("setNativeHidden: restores (marker gone, display cleared)", FSSE.setNativeHidden(nLegacy.row, false) === true && nLegacy.row.style.display === "" && nLegacy.row.getAttribute("data-fsse-hidden") === null);
check("setNativeHidden: nothing to restore / null row → false", FSSE.setNativeHidden(nLegacy.row, false) === false && FSSE.setNativeHidden(null, true) === false);
// v0.2.133: the marker names the site that hid the row, so a menu switched off in the settings
// can restore its native entry by marker alone ([data-fsse-hidden="fs-records"]), panel or no panel.
check("setNativeHidden with a site id stamps it on the marker", FSSE.setNativeHidden(nLegacy.row, true, "fs-records") === true && nLegacy.row.getAttribute("data-fsse-hidden") === "fs-records" && nLegacy.row.style.display === "none");
check("…cloneRow still strips the stamped marker from a clone", FSSE._cloneRow(nLegacy.row, null, "FamilySearch", "FamilySearch ▸").clone.getAttribute("data-fsse-hidden") === null);
check("…and restoring clears it", FSSE.setNativeHidden(nLegacy.row, false) === true && nLegacy.row.getAttribute("data-fsse-hidden") === null && nLegacy.row.style.display === "");
check("FSSE.SETTINGS_PAGE is gone (v0.2.135 removed the in-page settings line; the toolbar popup and the options page are the doors)", FSSE.SETTINGS_PAGE === undefined);
// v0.2.102: the Ancestry menu replaces the native "Ancestry" row the same way — present on
// every layout, including the narrow third-party cluster.
const aLabs = FSSE.findNativeEntry(section, ["Ancestry"]);
check("findNativeEntry labs: the 'Ancestry' <li> in the third-party list (no link in this fixture → url null)", aLabs && aLabs.label === "Ancestry" && aLabs.row.tagName === "LI" && aLabs.row.textContent === "Ancestry" && aLabs.url === null, JSON.stringify(aLabs && [aLabs.label, aLabs.url]));
const aNarrow = FSSE.findNativeEntry(narrow, ["Ancestry"]);
check("findNativeEntry narrow: the cluster's 'Ancestry' row (the Ancestry menu hides it there too)", aNarrow && aNarrow.row.tagName === "LI" && aNarrow.row.textContent === "Ancestry");
check("findNativeEntry: hiding the Ancestry row leaves 'FamilySearch' / the other rows alone", FSSE.setNativeHidden(aLabs.row, true) && FSSE.findNativeEntry(section, REPL).row.style.display !== "none" && FSSE.findEntryByLabel(section, "MyHeritage").style.display !== "none");
// v0.2.104: the MyHeritage and Findmypast menus replace their native rows too — Findmypast
// is spelled "FindMyPast" on the narrow cluster, so that menu lists both casings.
const mhLabs = FSSE.findNativeEntry(section, ["MyHeritage"]);
check("findNativeEntry labs: the 'MyHeritage' row", mhLabs && mhLabs.row.tagName === "LI" && mhLabs.row.textContent === "MyHeritage");
const fmpLabs = FSSE.findNativeEntry(section, ["Findmypast", "FindMyPast"]);
check("findNativeEntry labs: 'Findmypast' (the labs/classic spelling) matches first", fmpLabs && fmpLabs.label === "Findmypast" && fmpLabs.row.textContent === "Findmypast");
const fmpNarrow = FSSE.findNativeEntry(narrow, ["Findmypast", "FindMyPast"]);
check("findNativeEntry narrow: falls to the cluster's 'FindMyPast' casing", fmpNarrow && fmpNarrow.label === "FindMyPast" && fmpNarrow.row.textContent === "FindMyPast");
check("findNativeEntry narrow: 'MyHeritage' present there too", !!FSSE.findNativeEntry(narrow, ["MyHeritage"]));
// v0.2.105: a native entry with no READABLE link — FamilySearch builds partner links at click
// time (Kevin's MyHeritage URL carries a csrf_token + fspid) — gets the user's click handed to
// its label leaf instead; "#" / "javascript:" / same-page hrefs do not count as links.
check("findNativeEntry: returns the label leaf (the click target)", nLabs.leaf && nLabs.leaf.tagName === "SPAN" && nLabs.leaf.textContent === "FamilySearch Records", nLabs.leaf && nLabs.leaf.tagName);
const hashRow = el("div", [el("ul", [li("Ancestry", "#"), li("MyHeritage", "javascript:void(0)"), li("Findmypast")])]);
check("findNativeEntry: href '#' / 'javascript:' are not links → url null", FSSE.findNativeEntry(hashRow, ["Ancestry"]).url === null && FSSE.findNativeEntry(hashRow, ["MyHeritage"]).url === null);
globalThis.location.href = "https://www.familysearch.org/en/tree/person/details/KHW2-6TP";
const selfRow = el("div", [el("ul", [li("Ancestry", "https://www.familysearch.org/en/tree/person/details/KHW2-6TP#"), li("MyHeritage"), li("Findmypast")])]);
check("findNativeEntry: a same-page '#' href (absolute, as the browser resolves it) is not a link either", FSSE.findNativeEntry(selfRow, ["Ancestry"]).url === null);
check("findNativeEntry: a real link on this site still counts", FSSE.findNativeEntry(legacy, REPL).url === NATIVE_URL);
delete globalThis.location.href;
const target = FSSE.findNativeEntry(hashRow, ["Ancestry"]);
check("clickNative: clicks the label leaf once (bubbles to the row's control), returns true", FSSE.clickNative(target) === true && target.leaf._clicks === 1 && !target.row._clicks);
target.leaf.isConnected = false;
check("clickNative: a detached entry / no entry is refused (the caller opens its reserve URL)", FSSE.clickNative(target) === false && FSSE.clickNative(null) === false);

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
process.exit(fails ? 1 : 0);
