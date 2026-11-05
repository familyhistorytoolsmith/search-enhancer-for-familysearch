// sources.test.js — the Sources-tab scrape on a fake DOM (card pass, title rules, DIAG path). Run: node tests/run.js
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

// Minimal element model: tagName, children, textContent (concatenated), parentElement, querySelector("button").
function el(tag, kids) {
  const node = { tagName: tag.toUpperCase(), children: [], parentElement: null, _text: null };
  for (const k of kids) {
    if (typeof k === "string") node._text = (node._text || "") + k;
    else {
      k.parentElement = node;
      node.children.push(k);
    }
  }
  Object.defineProperty(node, "childElementCount", { get: () => node.children.length });
  Object.defineProperty(node, "textContent", {
    get: () => (node.children.length ? node.children.map((c) => c.textContent).join("") : node._text || ""),
  });
  node.querySelector = (sel) => {
    const want = sel.toUpperCase();
    const stack = [...node.children];
    while (stack.length) {
      const n = stack.shift();
      if (n.tagName === want) return n;
      stack.push(...n.children);
    }
    return null;
  };
  return node;
}
function deep(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.shift();
    out.push(n);
    stack.push(...n.children);
  }
  return out;
}
// FSSE_DEBUG=1 exercises the DIAG path too (prints the block instead of swallowing it).
globalThis.FSSE = { log: (...a) => process.env.FSSE_DEBUG && console.log("[FSSE]", ...a), deepElements: deep, DEBUG: !!process.env.FSSE_DEBUG, getFsid: () => "L81M-MJX" };
globalThis.location = { pathname: "/en/tree/person/sources/L81M-MJX", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
const { titleLike, cardTitle, findCardList } = FSSE._sourcesInternals;
const leafTexts2 = (root) => deep(root).filter((n) => !n.children.length).map((n) => String(n.textContent || "").trim()).filter(Boolean);

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};

// A card = <li><div><button><div>1876</div><div><span>TITLE</span></div></button><div>citation…</div></div></li>
// Live structure (Edward's DIAG): the button holds the event year, the title AND the created date.
const card = (year, title, citation) =>
  el("li", [
    el("div", [
      el("button", [el("div", [year]), el("div", [el("span", [title])]), el("div", ["November 15, 2014"])]),
      el("div", [el("p", [citation || `"${title}," database, FamilySearch (https://familysearch.org : accessed 2026), entry for someone.`])]),
    ]),
  ]);
const titles = [
  'Edward Cummins, "Australia, Births and Baptisms, 1792-1981"',
  "Australia, Electoral Rolls, 1903-1980",
  "Obituary for Edward", // no year, no hint word, shorter than the created date — only the card pass finds it
  'Edward Cummings, "Find a Grave Index"',
];
// The list also holds a header row ("Created" sort button) and a duplicate-titled card.
const header = el("li", [el("button", ["Created"]), el("button", ["Title"])]);
const list = el("ul", [header, ...titles.map((t, i) => card(String(1870 + i), t)), card("1880", titles[1])]);
const page = el("body", [
  el("nav", [el("a", ["Family Tree"]), el("a", ["Sources (35)"])]),
  el("main", [el("h1", ["Edward Cummings"]), el("div", ["1842–1922"]), list, el("button", ["Show More"])]),
]);

page.querySelectorAll = () => []; // no record links on the fake page
page.title = "Edward Cummings (1842–1922) • Person • Family Tree";
globalThis.document = page;

check("titleLike rejects a bare lifespan", !titleLike("1842–1922"));
check("titleLike rejects a bare year / date", !titleLike("1876") && !titleLike("12 May 1876"));
check("titleLike accepts a yearless title", titleLike("Obituary for Edward Cummings"));
check("titleLike rejects a created date and a lifespan with day/month", !titleLike("November 15, 2014") && !titleLike("29 May 1842 – 14 April 1922"));
check("titleLike rejects header words / single bare words", !titleLike("Created") && !titleLike("Obituary"));

const anchor = deep(page).find((n) => !n.children.length && n.textContent === titles[0]);
check("anchor leaf found", !!anchor);
const found = findCardList(anchor);
check("findCardList → the <ul> (not the card's own wrapper)", found === list, found && found.tagName);
const got = [...found.children].map((c) => cardTitle(c));
check("cardTitle: header row yields no title", got[0] === null, JSON.stringify(got));
check("cardTitle reads every card, incl. the yearless one, not the created date", JSON.stringify(got.slice(1, 5)) === JSON.stringify(titles), JSON.stringify(got));
check("cardTitle ignores the citation outside the button", !got.some((t) => t && /database/.test(t)));

// Whole scrape on the fake page
const res = FSSE.scrapeSources();
check("scrapeSources: count from the tab label", res.count === 35, res.count);
check("scrapeSources: 5 titled cards rendered (header excluded, duplicate counted)", res.rendered === 5, res.rendered);
check("scrapeSources: no 'Created' / 'Title' header titles", !res.titles.some((t) => /^(Created|Title)$/.test(t.title)));
const vias = Object.fromEntries(res.titles.map((t) => [t.title, t.via]));
check("scrapeSources: fs / text / card passes attributed", vias[titles[0]] === "fs" && vias[titles[1]] === "text" && vias[titles[2]] === "card", JSON.stringify(vias));
check("scrapeSources: lifespan header NOT a title", !res.titles.some((t) => t.title === "1842–1922"));
check("scrapeSources: exactly the 4 distinct titles", res.titles.length === 4, res.titles.map((t) => t.title).join(" | "));

// ---- The LABS person page (v0.2.92; Betsy Bellwood KHW2-6TP, 2026-09-21): no Sources tab —
// the sources sit in a column on the DETAILS page under "Sources (14)", one card each:
// "1850 • Baptism • 2 Tags" + the FS-shaped title + a View button. A hidden legacy tab link
// "Sources (14)" is also in the DOM, and a hints panel elsewhere shows an FS-shaped title
// that must NOT count as attached.
const labsCard = (meta, title) => el("li", [el("div", [el("div", [meta]), el("div", [title]), el("button", ["View"])])]);
const labsTitles = [
  'Betsy Bellwood, "England, Yorkshire, Parish Registers, 1538-2016"',
  'Betsy Bellwood, "England and Wales, Birth Registration Index, 1837-2008"',
  'Betsy Bellwood, "England and Wales, Census, 1851"',
  'Betsey, "England and Wales, Marriage Registration Index, 1837-2005"',
];
const labsList = el("ul", [
  labsCard("1850 • Baptism • 2 Tags", labsTitles[0]),
  labsCard("1850 • OTHER • 4 Tags", labsTitles[1]),
  labsCard("1851 • Census • 4 Tags", labsTitles[2]),
  labsCard("1870 • Marriage • 2 Tags", labsTitles[3]),
]);
const labsPage = el("body", [
  el("nav", [el("a", ["Vitals"]), el("a", ["Sources (14)"])]), // hidden legacy tab bar
  el("main", [
    el("div", [el("span", ["Birth • 9 Sources"]), el("span", ["6 September 1850"]), el("span", ["York, Yorkshire, England, United Kingdom"])]),
    el("aside", [el("h2", ["Sources (14)"]), el("button", ["+ ADD SOURCE"]), labsList]),
    el("div", [el("h3", ["Record Hints"]), el("span", ['Betsy Bellwood, "England and Wales Census, 1881"'])]),
  ]),
]);
labsPage.querySelectorAll = () => [];
labsPage.title = "Betsy Bellwood (1850–1915) • Person • Family Tree";
globalThis.document = labsPage;
globalThis.location.pathname = "/en/tree/person/details/KHW2-6TP";
check("labs: not the Sources tab by URL", !FSSE.isSourcesTab());
check("titleLike rejects a card's 'year • type • N Tags' line", !titleLike("1850 • Baptism • 2 Tags") && !titleLike("OTHER • 4 Tags"));
const labsRes = FSSE.scrapeSources();
check("labs: the Details column IS scraped (where = details, count 14, 4 cards)", labsRes && labsRes.where === "details" && labsRes.count === 14 && labsRes.rendered === 4, JSON.stringify(labsRes && { where: labsRes.where, count: labsRes.count, rendered: labsRes.rendered }));
check("labs: exactly the 4 card titles, parsed FS-shaped", labsRes.titles.length === 4 && labsTitles.every((t) => labsRes.titles.some((x) => x.title === t)) && labsRes.titles.every((x) => x.collection), labsRes.titles.map((t) => t.title).join(" | "));
check("labs: the hints-panel title outside the list is dropped, meta lines never titles", !labsRes.titles.some((t) => /1881/.test(t.title)) && !labsRes.titles.some((t) => /Tags$/.test(t.title)));
check("labs: 'Betsey' marriage index card → collection + principal", labsRes.titles.find((t) => /Marriage Registration/.test(t.title)).principal === "Betsey");
// The LEGACY Details page (a "Sources (5)" tab label, no titles anywhere) still yields nothing.
const legacyDetails = el("body", [el("nav", [el("a", ["Sources (5)"])]), el("main", [el("div", [el("span", ["Birth • 3 Sources"]), el("span", ["1897"]), el("span", ["Fishponds, Gloucestershire, England"])])])]);
legacyDetails.querySelectorAll = () => [];
globalThis.document = legacyDetails;
globalThis.location.pathname = "/en/tree/person/details/GJY7-54S";
check("legacy Details page: no source list → null (no scrape, no cache write)", FSSE.scrapeSources() === null);

// ---- v0.2.115 — Kevin's Nathaniel Eli Trew 9JWT-KH9 Sources tab (DIAG 2026-10-26): the LIST VIEW
// nests each card's row button deep inside a [row, action links] wrapper, one card is EXPANDED
// (tags, field labels, a citation split across leaves, indexed information with a long burial
// place), and the list itself sits beyond the old 12-level climb. The scrape had taken one card's
// wrapper for the list, "Review Attachments" for a second card, and pruned the real FS-shaped
// titles — the Find a Grave one among them, so its menu entry never dimmed.
const nat = [
  'Nathanael Eli Trew, "Australia, Births and Baptisms, 1792-1981"',
  'Nathanael Eli Trew, "Australia, Marriages, 1810-1980"',
  'Nathaniel Eli Trew, "Australia, Births and Baptisms, 1792-1981"',
  'Nathanael Trew, "Australia, Births and Baptisms, 1792-1981"',
  'Nat. Eli Trew, "Australia, Births and Baptisms, 1792-1981"',
  'Nathaniel Eli Trew, "Australia, Electoral Rolls, 1903-1980"',
  'Nathaniel Trew, "Australia, Death Index, 1787-1985"',
  'Nathaniel Eli Trew, "Find a Grave Index"',
];
const wrapN = (node, n) => { let x = node; for (let i = 0; i < n; i++) x = el("div", [x]); return x; };
const rowChain = (year, title, initial) =>
  wrapN(el("button", [el("div", [wrapN(el("div", [el("div", [year]), el("div", [el("span", [title])]), el("div", ["May 21, 2020"]), el("div", [initial])]), 2), el("div", [])])]), 5);
const actions = () => el("div", [el("a", ["View"]), el("a", ["Edit"]), el("a", ["Review Attachments"]), el("a", ["Detach"])]);
const expanded = () => el("div", [
  el("span", ["Tags"]), el("span", ["Birth"]), el("span", ["Burial"]), el("span", ["Death"]), el("span", ["Name"]), el("button", ["+ ADD TAG"]),
  el("span", ["Source Date"]), el("span", ["13 February 1965"]),
  el("span", ["Web Page (Link to the Record)"]), el("a", ["https://familysearch.org/ark:/61903/1:1:DMFH-GCN2"]),
  el("span", ["Where The Record Is Found (Citation)"]), el("span", ['"Find a Grave Index",']), el("i", ["FamilySearch"]),
  el("span", ["(https://www.familysearch.org/ark:/61903/1:1:DMFH-GCN2 : Thu Oct 01 23:21:58 UTC"]), el("span", ["2026), Nathaniel Eli Trew."]),
  el("span", ["Indexed Information"]), el("span", ["Nathaniel Eli Trew"]), el("span", ["Death • Find a Grave Index"]), el("button", ["EDIT"]),
  el("span", ["Name"]), el("span", ["Nathaniel Eli Trew"]), el("span", ["Birth Date"]), el("span", ["1871"]),
  el("span", ["Burial Place"]), el("span", ["Karrakatta Cemetery and Crematorium, Karrakatta, Nedlands City, Western Australia, Australia"]),
]);
const natCard = (i, t, open) => el("li", [el("div", [rowChain(String(1883 + i), t, "s"), actions(), ...(open ? [expanded()] : [])])]);
const natList = el("ul", nat.map((t, i) => natCard(i, t, i === 7)));
const natPage = el("body", [
  el("nav", [el("a", ["Details"]), el("a", ["Sources (8)"])]),
  el("main", [el("h1", ["Nathaniel Eli Trew"]), el("div", ["1871–1965"]), el("button", ["Detail View"]), natList]),
]);
natPage.querySelectorAll = () => [];
natPage.title = "Nathaniel Eli Trew (1871–1965) • Person • Family Tree";
globalThis.document = natPage;
globalThis.location.pathname = "/en/tree/person/sources/9JWT-KH9";
const natAnchor = deep(natPage).find((n) => !n.children.length && n.textContent === nat[0]);
let depth = 0;
for (let x = natAnchor; x && x !== natList; x = x.parentElement) depth++;
check("fixture: the list sits beyond the old 12-level climb", depth > 12, String(depth));
check("findCardList climbs to the real <ul> (not the card's [row, actions] wrapper)", findCardList(natAnchor) === natList, (findCardList(natAnchor) || {}).tagName);
check("cardTitle: the expanded card still yields its FS-shaped title, never the burial place / citation / labels", cardTitle(natList.children[7]) === nat[7], cardTitle(natList.children[7]));
check("cardTitle: the action-links block yields no title (\"Review Attachments\" is chrome)", cardTitle(actions()) === null, cardTitle(actions()));
const natRes = FSSE.scrapeSources();
check("scrapeSources: all 8 titles, the Find a Grave one included, nothing else", natRes.titles.length === 8 && nat.every((t) => natRes.titles.some((x) => x.title === t)), natRes.titles.map((t) => `[${t.via}] ${t.title}`).join(" | "));
check("scrapeSources: 8 cards rendered, count 8", natRes.rendered === 8 && natRes.count === 8, JSON.stringify({ rendered: natRes.rendered, count: natRes.count }));
check("scrapeSources: Find a Grave parsed with its collection, own record, via fs", (() => { const f = natRes.titles.find((x) => /Find a Grave/.test(x.title)); return !!f && f.collection === "Find a Grave Index" && f.mentioned === false && f.via === "fs"; })());
check("the Find a Grave title satisfies the menu's match (the v0.2.33 FAG titleRe)", /find\s*a\s*grave/i.test(natRes.titles.find((x) => /Find a Grave/.test(x.title)).collection));
// Detail View splits a title into two leaves and adds an "Attached To:" line: the collection
// name must win over the person's name (equal length: "Nathaniel Eli Trew" / "Find a Grave Index").
const dvCard = el("li", [el("div", [el("span", ["Nathaniel Eli Trew"]), el("span", ["Find a Grave Index"]), el("span", ["Attached To: Birth, Burial, Death, Name"])])]);
check("cardTitle (Detail View): the collection name beats the person's name and the Attached To line", cardTitle(dvCard) === "Find a Grave Index", cardTitle(dvCard));
check("cardTitle (Detail View): a collection with a year range likewise", cardTitle(el("li", [el("div", [el("span", ["Nathanael Eli Trew"]), el("span", ["Australia, Marriages, 1810-1980"])])])) === "Australia, Marriages, 1810-1980");
check("titleCandidate shapes: labels, actions, bullet lines, citation tails and trailing commas never qualify",
  [actions(), expanded()].every((n) => !leafTexts2(n).some((t) => /^(Review Attachments|Where The Record Is Found \(Citation\)|Death • Find a Grave Index|Birth Date|Source Date)$/.test(cardTitle(el("li", [el("span", [t])])) || "")) ), "a label was accepted as a title");
// Backstop: when the list cannot be found at all (here: every card sits 30 levels below the list) and a card's wrapper passes
// for a 2-card list, the FS-shaped titles pass 2 found are NOT pruned.
const farCard = (i, t) => el("li", [el("div", [rowChain(String(1883 + i), t, "s"), el("div", [el("span", [`Citation: ${t}`])])])]);
const farList = el("ul", nat.map((t, i) => wrapN(farCard(i, t), 30))); // every card 30 levels below the list → the list is out of the climb's reach
const farPage = el("body", [el("nav", [el("a", ["Sources (8)"])]), farList]);
farPage.querySelectorAll = () => [];
farPage.title = natPage.title;
globalThis.document = farPage;
const farRes = FSSE.scrapeSources();
check("backstop: an unreachable list never prunes the FS-shaped titles (all 8 kept, rendered unknown)", nat.every((t) => farRes.titles.some((x) => x.title === t)) && farRes.rendered === null, JSON.stringify({ n: farRes.titles.length, rendered: farRes.rendered }));

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
process.exit(fails ? 1 : 0);
