// parsers.test.js — the pure parsers in familysearch.js and sources.js (no DOM). Run: node tests/run.js
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
globalThis.document = { title: "Charles Bellwood (1805–1879) • Person • Family Tree", querySelectorAll: () => [] };
require(path.join(SRC, "familysearch.js"));
require(path.join(SRC, "sources.js"));

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// getFsid — any tab segment, or none (the page first loads as /tree/person/<PID>)
const fsid = (p) => {
  globalThis.location.pathname = p;
  return FSSE.getFsid();
};
check("getFsid details", fsid("/en/tree/person/details/GJY7-54S") === "GJY7-54S");
check("getFsid sources tab", fsid("/en/tree/person/sources/L81M-MJX") === "L81M-MJX");
check("getFsid no tab segment", fsid("/en/tree/person/GJY7-54S") === "GJY7-54S");
check("getFsid all-letter PID, no tab", fsid("/en/tree/person/LZDB-KXV") === "LZDB-KXV");
check("getFsid lower-cased in URL → upper", fsid("/en/tree/person/details/gjy7-54s") === "GJY7-54S");
check("getFsid non-person page → null", fsid("/en/search/record/results") === null);
globalThis.location.pathname = "/en/tree/person/details/LH18-4BZ";

// parseMarriageText — the couple block's concatenated marriage line
const M = FSSE.parseMarriageText;
check("marriage: date + place flush", same(M("Marriage15 December 1831Easingwold, Yorkshire, England, United Kingdom"), { date: "15 December 1831", year: "1831", place: "Easingwold, Yorkshire, England, United Kingdom" }));
check("marriage: children list cut off", M("Marriage22 MAY 1889Worcester,Worcester,MassachusettsChildren (4)").place === "Worcester,Worcester,Massachusetts");
check("marriage: year only", same(M("Marriage1831"), { date: "1831", year: "1831", place: "" }));
check("marriage: about year", M("Marriageabout 1831").year === "1831");
check("marriage: 'No Marriage Events' rejected", M("No Marriage Events") === null);
check("marriage: 'Marriage Events' header rejected", M("Marriage Events") === null);
check("marriage: bare label → null", M("Marriage") === null);
check("marriage: place without year kept", same(M("MarriageEasingwold, Yorkshire"), { date: "", year: null, place: "Easingwold, Yorkshire" }));
// v0.2.109 — a "1 Source" count followed flush by a value starting with S: the plural "s" of the
// prefix regex must not eat that S (Kevin's Sarah Jane Thackeray KJWW-DQV read as "arah Jane").
check("marriage: '1 Source' prefix keeps a value's capital S", same(M("Marriage • 1 SourceSeptember 1933Manjimup, Western Australia, Australia"), { date: "September 1933", year: "1933", place: "Manjimup, Western Australia, Australia" }));
check("marriage: 'Sources' prefix still stripped whole", same(M("Marriage • 2 Sources15 December 1831Easingwold, Yorkshire"), { date: "15 December 1831", year: "1831", place: "Easingwold, Yorkshire" }));
check("marriage: 'Sources' flush against an S-place", same(M("Marriage • 3 SourcesSouthampton, Hampshire"), { date: "", year: null, place: "Southampton, Hampshire" }));

// nameTokens — generational suffixes are not surnames
const N = FSSE.nameTokens;
check("nameTokens strips Jr.", same(N("James Llewellyn Smith Jr."), ["James", "Llewellyn", "Smith"]));
check("nameTokens strips II", same(N("Henry Ford II"), ["Henry", "Ford"]));
check("nameTokens keeps a bare V initial", same(N("Mary V"), ["Mary", "V"]));
check("nameTokens never empties", same(N("Jr."), ["Jr."]));
check("nameTokens drops commas", same(N("Smith, John"), ["Smith", "John"]));

// yearPlace — the Vitals value split
const Y = FSSE.yearPlace;
check("yearPlace year flush against place", same(Y("1897Fishponds, Gloucestershire, England"), { year: "1897", place: "Fishponds, Gloucestershire, England" }));
check("yearPlace single-word place", same(Y("1868Scotland"), { year: "1868", place: "Scotland" }));
check("yearPlace 'Deceased' → nothing", same(Y("Deceased"), { year: null, place: "" }));
check("yearPlace place only (comma required)", same(Y("Bristol, England"), { year: null, place: "Bristol, England" }));
check("yearPlace empty", same(Y(""), { year: null, place: "" }));
// v0.2.116 — the age note FS prints after a burial date (Kevin's Nathaniel Eli Trew 9JWT-KH9).
check("yearPlace drops the '(aged 93–94)' note flush before the place", same(Y("13 Feb 1965 (aged 93–94)Karrakatta Cemetery and Crematorium Karrakatta, Nedlands City, Western Australia, Australia"), { year: "1965", place: "Karrakatta Cemetery and Crematorium Karrakatta, Nedlands City, Western Australia, Australia" }), JSON.stringify(Y("13 Feb 1965 (aged 93–94)Karrakatta Cemetery and Crematorium Karrakatta, Nedlands City, Western Australia, Australia")));
check("yearPlace: a single age / an 'about' note likewise", same(Y("1965 (aged 93)Nedlands, Western Australia, Australia"), { year: "1965", place: "Nedlands, Western Australia, Australia" }) && same(Y("1850 (about 40)Bristol, England"), { year: "1850", place: "Bristol, England" }));
check("yearPlace: an age note with nothing after it → no place", same(Y("13 Feb 1965 (aged 93–94)"), { year: "1965", place: "" }));
check("yearPlace: parentheses INSIDE a place are kept", same(Y("1900Saint Paul (Minneapolis), Minnesota, United States"), { year: "1900", place: "Saint Paul (Minneapolis), Minnesota, United States" }));

// parseSourceTitle — FS's `<Principal>, "<Collection>"` convention
const T = FSSE.parseSourceTitle;
check("source: plain FS title", same(T('John Stephen Hind, "England and Wales, Census, 1921"'), { title: 'John Stephen Hind, "England and Wales, Census, 1921"', collection: "England and Wales, Census, 1921", mentioned: false, principal: "John Stephen Hind" }));
check("source: in entry for → mentioned", T('John Stephen Hind in entry for Stephen Hind, "England, Births and Christenings, 1538-1975"').mentioned === true);
check("source: in household of → own record", T('John Hind in household of Stephen Hind, "England and Wales Census, 1911"').mentioned === false);
check("source: user-typed → no collection", T("Birth Registration for John Stephen Hind who was born on 8 Oct 1913 at Birkenhead").collection === null);
check("source: curly quotes", T("Edward Cummings, “Find a Grave Index”").collection === "Find a Grave Index");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
process.exit(fails ? 1 : 0);
