// family.test.js — scrapeParents / scrapeSpouses on a fake Family Members card (DOM shape as seen
// live on Edward Cummings L81M-MJX and Stephen Hind GLWK-P4F). Run: node tests/run.js
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

// Minimal element model (same as sources.test.js).
function el(tag, kids, attrs) {
  const node = { tagName: tag.toUpperCase(), children: [], parentElement: null, _text: null, _attrs: attrs || {} };
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
  node.getAttribute = (n) => (n in node._attrs ? node._attrs[n] : null);
  const all = () => {
    const out = [];
    const stack = [...node.children];
    while (stack.length) {
      const n = stack.shift();
      out.push(n);
      stack.push(...n.children);
    }
    return out;
  };
  const matches = (n, sel) => sel === 'a[href*="/tree/person/"]' && n.tagName === "A" && /\/tree\/person\//.test(n._attrs.href || "");
  node.querySelector = (sel) => all().find((n) => matches(n, sel)) || null;
  node.querySelectorAll = (sel) => all().filter((n) => matches(n, sel));
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
globalThis.FSSE = { log() {}, deepElements: deep };
globalThis.location = { pathname: "/en/tree/person/details/L81M-MJX", origin: "https://www.familysearch.org" };
require(path.join(SRC, "familysearch.js"));

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const link = (name, id) => el("a", [name], { href: `/en/tree/person/details/${id}` });
const person = (name, id, span) => el("div", [link(name, id), el("div", [span])]);

// Family Members: Spouses and Children column + Parents and Siblings column.
const spousesCol = el("div", [
  el("h4", ["Spouses and Children"]),
  el("div", [
    person("Edward Cummings", "L81M-MJX", "1842–1922 • L81M-MJX"),
    person("Mary Anne Fuller", "L5FG-GNF", "1848–1930 • L5FG-GNF"),
    el("div", [el("span", ["Marriage"]), el("span", ["15 March 1871"]), el("span", ["Cobden, Victoria, Australia"])]),
    el("div", [el("div", ["Children (10)"]), person("John Cummings", "K4N7-S65", "1872–1956"), person("Eliza Clace Cummings", "KGSW-S8Z", "1874–1956")]),
  ]),
]);
const parentsCol = el("div", [
  el("h4", ["Parents and Siblings"]),
  el("div", [
    person("William Cummins", "L81M-9HW", "1788–1871 • L81M-9HW"),
    person("Sarah Jane Irvine", "L5FG-P3T", "1805–1891 • L5FG-P3T"),
    el("div", [el("span", ["Marriage"]), el("span", ["1833"]), el("span", ["County Donegal, Ireland"])]),
    el("div", [el("div", ["Children (5)"]), person("William Cummins", "L81M-9XX", "1830–1900"), person("Edward Cummings", "L81M-MJX", "1842–1922")]),
    link("Show All", "L81M-MJX"),
  ]),
  el("div", [el("h5", ["Other Relationships"]), person("Hugh Irvine", "H1", "1800–1870"), el("div", ["Children (1)"])]),
]);
globalThis.document = el("body", [el("h2", ["Family Members"]), el("div", [spousesCol, parentsCol])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);

const parents = FSSE.scrapeParents();
console.log("parents:", parents.parents.map((x) => `${x.name} (${x.id})`));
check("father = first parent link", parents.father && parents.father.name === "William Cummins" && parents.father.given === "William" && parents.father.surname === "Cummins", JSON.stringify(parents.father));
check("mother = second parent link", parents.mother && parents.mother.name === "Sarah Jane Irvine" && parents.mother.given === "Sarah Jane" && parents.mother.surname === "Irvine", JSON.stringify(parents.mother));
check("siblings inside Children (5) excluded", !parents.parents.some((x) => x.id === "L81M-9XX"));
check("the person themself excluded (also listed as a child)", !parents.parents.some((x) => x.id === "L81M-MJX"));
check("spouse column not read as parents", !parents.parents.some((x) => x.id === "L5FG-GNF"));
check("'Show All' link ignored (self href)", !parents.parents.some((x) => /Show All/.test(x.name)));
check("Other Relationships person kept as a further parent but not father/mother", parents.parents.length === 3 && parents.parents[2].name === "Hugh Irvine", JSON.stringify(parents.parents));

// scrapeVitals wiring: father/mother reach the person object even with a Vitals card present.
const vitals = el("div", [
  el("div", [el("span", ["Name • 5 Sources"]), el("span", ["Edward Cummings"])]),
  el("div", [el("span", ["Sex • 4 Sources"]), el("span", ["Male"])]),
  el("div", [el("span", ["Birth • 8 Sources"]), el("span", ["29 May 1842"]), el("span", ["Liffey on Foyle, Lifford, Donegal, Ireland"])]),
  el("div", [el("span", ["Death • 7 Sources"]), el("span", ["14 April 1922"]), el("span", ["Perth, Western Australia, Australia"])]),
]);
globalThis.document = el("body", [vitals, el("h2", ["Family Members"]), el("div", [spousesCol, parentsCol])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);
globalThis.document.title = "Edward Cummings (1842–1922) • Person • Family Tree";
const p = FSSE.scrapeVitals();
check("scrapeVitals: name/sex/years", p && p.given === "Edward" && p.surname === "Cummings" && p.sex === "Male" && p.birthYear === "1842" && p.deathYear === "1922", JSON.stringify(p && { given: p.given, surname: p.surname, sex: p.sex, birthYear: p.birthYear, deathYear: p.deathYear }));
check("scrapeVitals: spouse + marriage from the couple block", p.spouses.length === 1 && p.spouses[0].surname === "Fuller" && p.spouses[0].marriageYear === "1871" && /Cobden/.test(p.spouses[0].marriagePlace), JSON.stringify(p.spouses));
check("scrapeVitals: children skipped as spouses", p.spouseSurnames.length === 1);
check("scrapeVitals: father/mother attached to the person", p.father.surname === "Cummins" && p.mother.surname === "Irvine", JSON.stringify([p.father, p.mother]));

// scrapeFacts: Other Information rows (same concatenated shape as the Vitals rows; several of a kind)
const other = el("div", [
  el("h3", ["Other Information"]),
  el("div", [el("span", ["Residence • 2 Sources"]), el("span", ["1871"]), el("span", ["Cobden, Victoria, Australia"])]),
  el("div", [el("span", ["Residence • 1 Source"]), el("span", ["1903"]), el("span", ["Perth, Western Australia, Australia"])]),
  el("div", [el("span", ["Residence"]), el("span", ["Fremantle, Western Australia, Australia"])]), // undated, no count
  el("div", [el("span", ["Immigration • 0 Sources"]), el("span", ["1865"]), el("span", ["Melbourne, Victoria, Australia"])]),
  el("div", [el("span", ["Occupation • 1 Source"]), el("span", ["Farmer"])]),
  el("div", [el("span", ["Residence • 0 Sources"])]), // empty row
]);
globalThis.document = el("body", [vitals, other, el("h2", ["Family Members"]), el("div", [spousesCol, parentsCol])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);
const facts = FSSE.scrapeFacts();
console.log("facts:", facts.map((f) => `${f.kind} ${f.year} ${f.place}`));
check("facts: two dated residences + an undated one + the immigration", facts.length === 4, JSON.stringify(facts));
check("facts: first residence parsed", facts[0].kind === "Residence" && facts[0].year === "1871" && facts[0].place === "Cobden, Victoria, Australia", JSON.stringify(facts[0]));
check("facts: undated residence keeps its place", facts.some((f) => f.year === null && /Fremantle/.test(f.place)));
check("facts: immigration 1865 Melbourne", facts.some((f) => f.kind === "Immigration" && f.year === "1865" && /Melbourne/.test(f.place)));
check("facts: occupation ignored, empty row ignored", !facts.some((f) => /Farmer/.test(f.text)) && !facts.some((f) => !f.year && !f.place));
check("scrapeVitals carries the facts", FSSE.scrapeVitals().facts.length === 4);

// ---- The LABS person page (v0.2.92; Betsy Bellwood KHW2-6TP, Kevin's screenshots + log,
// 2026-09-21): bare "Spouse" labels render before the column heading with no person link
// anywhere near them (the old shortest-text rule picked one of those and found nothing); the
// couple card holds the spouse link, the person's own link and the marriage block; the
// children sit in a collapsible "Children (N)" block below the card.
const deepWrap = (node, n) => (n ? deepWrap(el("div", [node]), n - 1) : node);
const bareSpouseLabels = deepWrap(el("div", [el("span", ["Spouse"]), el("span", ["Spouse"]), el("span", ["Spouse"]), el("span", ["Spouse"])]), 8);
const labsSpouses = el("div", [
  el("h4", ["Spouses and Children"]),
  el("div", [
    el("div", [
      person("Sydney Joseph Hind", "27SL-LQB", "1850–1928 • 27SL-LQB"),
      person("Betsy Bellwood", "KHW2-6TP", "1850–1915 • KHW2-6TP"),
      el("div", [el("span", ["Marriage"]), el("span", ["8 October 1870"]), el("span", ["York, Yorkshire, England, United Kingdom"])]),
    ]),
    el("div", [el("div", ["Children (10)"]), person("Margaretta Mary Hind", "KGSW-9BX", "1871–1937"), person("Charles Austin Hind", "KHVQ-VS4", "1874–1941")]),
  ]),
]);
const labsParents = el("div", [
  el("h4", ["Parents and Siblings"]),
  el("div", [
    el("div", [
      person("Charles Bellwood", "LH18-4BZ", "1805–1879 • LH18-4BZ"),
      person("Margaret Stephenson", "LH18-HMW", "1805–1874 • LH18-HMW"),
      el("div", [el("span", ["Marriage"]), el("span", ["15 December 1831"]), el("span", ["Easingwold, Yorkshire, England, United Kingdom"])]),
    ]),
    el("div", [el("div", ["Children (9)"]), person("Mary Ann Bellwood", "MPRH-2W3", "1833–1907"), person("Louisa Cuningham", "PW81-DJW", "1837–1881")]),
  ]),
]);
const labsVitals = el("div", [
  el("div", [el("span", ["Name • 14 Sources"]), el("span", ["Betsy Bellwood"])]),
  el("div", [el("span", ["Sex • 13 Sources"]), el("span", ["Female"])]),
  el("div", [el("span", ["Birth • 9 Sources"]), el("span", ["6 September 1850"]), el("span", ["York, Yorkshire, England, United Kingdom"])]),
  el("div", [el("span", ["Death • 1 Source"]), el("span", ["31 March 1915"]), el("span", ["Newcastle, Northumberland, England, United Kingdom"])]),
]);
globalThis.location.pathname = "/en/tree/person/details/KHW2-6TP";
globalThis.document = el("body", [bareSpouseLabels, labsVitals, el("h2", ["Family Members"]), el("div", [labsSpouses, labsParents])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);
globalThis.document.title = "Betsy Bellwood (1850–1915) • Person • Family Tree";
const labs = FSSE.scrapeVitals();
check("labs: vitals scraped (Betsy, Female, 1850 York, 1915 Newcastle)", labs && labs.given === "Betsy" && labs.surname === "Bellwood" && labs.sex === "Female" && labs.birthYear === "1850" && labs.deathYear === "1915", JSON.stringify(labs && { given: labs.given, surname: labs.surname, sex: labs.sex, birthYear: labs.birthYear, deathYear: labs.deathYear }));
check("labs: the spouse is found past the bare 'Spouse' labels", labs.spouses.length === 1 && labs.spouses[0].name === "Sydney Joseph Hind" && labs.spouses[0].id === "27SL-LQB" && labs.spouses[0].surname === "Hind", JSON.stringify(labs.spouses));
check("labs: the couple card's marriage line", labs.spouses[0].marriageYear === "1870" && labs.spouses[0].marriageDate === "8 October 1870" && labs.spouses[0].marriagePlace === "York, Yorkshire, England, United Kingdom", JSON.stringify(labs.spouses[0]));
check("labs: children skipped; married surname = Hind", JSON.stringify(labs.spouseSurnames) === JSON.stringify(["Hind"]) && JSON.stringify(labs.marriedSurnames) === JSON.stringify(["Hind"]), JSON.stringify([labs.spouseSurnames, labs.marriedSurnames]));
const labsP = FSSE.scrapeParents();
check("labs: parents still father/mother, siblings excluded", labsP.father && labsP.father.name === "Charles Bellwood" && labsP.mother.name === "Margaret Stephenson" && labsP.parents.length === 2, JSON.stringify(labsP));
globalThis.location.pathname = "/en/tree/person/details/L81M-MJX";

// ---- v0.2.109 — ONE source and values that start with S (Kevin's Sarah Jane Thackeray KJWW-DQV,
// 2026-10-12: every menu read "arah Jane Thackeray"). FS renders "Name • 1 SourceSarah Jane
// Thackeray" — singular "Source" flush against the value — and the case-insensitive prefix regex
// let its optional plural "s" eat the capital S. Vitals, an undated residence and a "Marriage • 1
// Source" couple line all carry the same shape.
const sarahVitals = el("div", [
  el("div", [el("span", ["Name • 1 Source"]), el("span", ["Sarah Jane Thackeray"])]),
  el("div", [el("span", ["Sex • 1 Source"]), el("span", ["Female"])]),
  el("div", [el("span", ["Birth • 1 Source"]), el("span", ["1915"]), el("span", ["Subiaco, Western Australia, Australia"])]),
  el("div", [el("span", ["Death • 0 Sources"]), el("span", ["1998"]), el("span", ["Perth, Western Australia, Australia"])]),
  el("div", [el("span", ["Burial • 1 Source"]), el("span", ["Southern Cross, Western Australia, Australia"])]),
]);
const sarahFacts = el("div", [
  el("h4", ["Other Information"]),
  el("div", [el("span", ["Residence • 1 Source"]), el("span", ["Sydney, New South Wales, Australia"])]),
  el("div", [el("span", ["Residence • 1 Source"]), el("span", ["1947"]), el("span", ["Manjimup, Western Australia, Australia"])]),
]);
const sarahSpouses = el("div", [
  el("h4", ["Spouses and Children"]),
  el("div", [
    el("div", [
      person("Murray William Collett", "KJWW-2G4", "1909–1968 • KJWW-2G4"),
      person("Sarah Jane Thackeray", "KJWW-DQV", "1915–1998 • KJWW-DQV"),
      el("div", [el("span", ["Marriage • 1 Source"]), el("span", ["September 1933"]), el("span", ["Manjimup, Western Australia, Australia"])]),
    ]),
    el("div", [el("div", ["Children (1)"]), person("Raymond William Collett", "KJCP-WWC", "1935–2001")]),
  ]),
]);
globalThis.location.pathname = "/en/tree/person/details/KJWW-DQV";
globalThis.document = el("body", [sarahVitals, sarahFacts, el("h2", ["Family Members"]), el("div", [sarahSpouses, el("div", [el("h4", ["Parents and Siblings"])])])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);
globalThis.document.title = "Sarah Jane Thackeray (1915–1998) • Person • Family Tree";
const sarah = FSSE.scrapeVitals();
check("one source: the name keeps its S", sarah && sarah.given === "Sarah Jane" && sarah.surname === "Thackeray" && sarah.fullName === "Sarah Jane Thackeray", JSON.stringify(sarah && { given: sarah.given, surname: sarah.surname, fullName: sarah.fullName }));
check("one source: sex / birth year + S-place / death", sarah.sex === "Female" && sarah.birthYear === "1915" && sarah.birthPlace === "Subiaco, Western Australia, Australia" && sarah.deathYear === "1998", JSON.stringify({ sex: sarah.sex, birthYear: sarah.birthYear, birthPlace: sarah.birthPlace, deathYear: sarah.deathYear }));
check("one source: a place-only burial keeps its S", sarah.burialPlace === "Southern Cross, Western Australia, Australia", JSON.stringify({ burialYear: sarah.burialYear, burialPlace: sarah.burialPlace }));
check("one source: an undated residence keeps its S", sarah.facts.some((f) => f.kind === "Residence" && f.year === null && f.place === "Sydney, New South Wales, Australia"), JSON.stringify(sarah.facts));
check("one source: the dated residence still parses", sarah.facts.some((f) => f.year === "1947" && f.place === "Manjimup, Western Australia, Australia"), JSON.stringify(sarah.facts));
check("one source: the couple line's month-name date keeps its S", sarah.spouses.length === 1 && sarah.spouses[0].surname === "Collett" && sarah.spouses[0].marriageDate === "September 1933" && sarah.spouses[0].marriageYear === "1933" && sarah.spouses[0].marriagePlace === "Manjimup, Western Australia, Australia", JSON.stringify(sarah.spouses));
check("one source: married surname = Collett, child skipped", JSON.stringify(sarah.marriedSurnames) === JSON.stringify(["Collett"]) && sarah.spouseSurnames.length === 1, JSON.stringify([sarah.spouseSurnames, sarah.marriedSurnames]));
globalThis.location.pathname = "/en/tree/person/details/L81M-MJX";

// ---- v0.2.116 — the Burial row's age note (Kevin's Nathaniel Eli Trew 9JWT-KH9, 2026-10-26): FS
// prints "13 Feb 1965 (aged 93–94)" and the place follows flush, so the burial place scraped as
// "(aged 93–94)Karrakatta…" and went into the deaths & burials search that way. The place itself
// is FS's two lines — the free text entered and the standardised place — joined by a space.
const natVitals = el("div", [
  el("div", [el("span", ["Name • 3 Sources"]), el("span", ["Nathaniel Eli Trew"])]),
  el("div", [el("span", ["Sex • 1 Source"]), el("span", ["Male"])]),
  el("div", [el("span", ["Birth • 3 Sources"]), el("span", ["1871"]), el("span", ["Cut Hill, York, Western Australia"])]),
  el("div", [el("span", ["Death • 1 Source"]), el("span", ["13 February 1965"]), el("span", ["Nedlands, Western Australia, Australia"])]),
  el("div", [el("span", ["Burial • 1 Source"]), el("span", ["13 Feb 1965 (aged 93–94)"]), el("span", ["Karrakatta Cemetery and Crematorium "]), el("span", ["Karrakatta, Nedlands City, Western Australia, Australia"])]),
]);
globalThis.location.pathname = "/en/tree/person/details/9JWT-KH9";
globalThis.document = el("body", [natVitals, el("h2", ["Family Members"]), el("div", [el("div", [el("h4", ["Spouses and Children"])]), el("div", [el("h4", ["Parents and Siblings"])])])]);
globalThis.document.querySelectorAll = (sel) => el("x", []).querySelectorAll.call(globalThis.document, sel);
globalThis.document.title = "Nathaniel Eli Trew (1871–1965) • Person • Family Tree";
const natV = FSSE.scrapeVitals();
check("burial age note: the year is kept and '(aged 93–94)' is dropped from the place", !!natV && natV.burialYear === "1965" && natV.burialPlace === "Karrakatta Cemetery and Crematorium Karrakatta, Nedlands City, Western Australia, Australia", JSON.stringify(natV && { burialYear: natV.burialYear, burialPlace: natV.burialPlace }));
check("burial age note: the death and birth rows are untouched", natV.deathYear === "1965" && natV.deathPlace === "Nedlands, Western Australia, Australia" && natV.birthYear === "1871" && natV.birthPlace === "Cut Hill, York, Western Australia", JSON.stringify({ deathYear: natV.deathYear, deathPlace: natV.deathPlace, birthPlace: natV.birthPlace }));

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
process.exit(fails ? 1 : 0);
