// freebmd.test.js — the FreeBMD menu (v0.2.47): E&W + 1837 gating, hash-payload grammar, the
// fill script's parser and form filling. Run: node tests/run.js freebmd
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const { parseParams, fill, initials, clampWindow, holdNotice } = require(path.join(SRC, "freebmd-fill.js"));
const site = FSSE.SITES.find((s) => s.id === "freebmd");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);
// Decode an entry's hash payload back into the params the fill script will apply.
const payload = (url) => JSON.parse(decodeURIComponent(url.split("#fsse=")[1]));

// 1. Registry shape.
check("freebmd site exists with options()", !!site && typeof site.options === "function");
check("custom icon (never FreeBMD's logo)", site.icon === "icons/freebmd32.png", site.icon);
check("anchors after Findmypast (both casings)", site.anchorLabel[0] === "Findmypast" && site.anchorLabel.includes("FindMyPast"));

// 2. Doris: E&W woman, b. 1897, m. 1920 Roberts (dated), d. 1980 → births + marriages + deaths.
const doris = {
  id: "X", given: "Doris Annie", surname: "Hiscocks", sex: "Female", living: false, fullName: "Doris Annie Hiscocks",
  birthYear: "1897", birthPlace: "Fishponds, Gloucestershire, England", deathYear: "1980", deathPlace: "Bristol, England",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1920", marriageYear: "1920", marriagePlace: "Bristol, England" }],
};
let o = opts(doris);
console.log("Doris:", o.map((x) => x.label).join(" | "));
check("three entries (births, marriages, deaths)", o.length === 3, String(o.length));
let pl = payload(o[0].url);
check("births payload", pl.type === "Births" && pl.surname === "Hiscocks" && pl.given === "Doris Annie" && pl.start === 1895 && pl.end === 1899 && pl.sq === 1 && pl.eq === 4, JSON.stringify(pl));
check("mother NOT sent (window starts 1895 < 1911)", pl.s_surname == null, JSON.stringify(pl));
pl = payload(o[1].url);
check("marriages payload with spouse", pl.type === "Marriages" && pl.s_surname === "Roberts" && pl.start === 1918 && pl.end === 1922, JSON.stringify(pl));
check("deaths under the married surname, Death age/DoB = birth ±1 (v0.2.108)", payload(o[2].url).type === "Deaths" && payload(o[2].url).surname === "Roberts" && payload(o[2].url).start === 1978 && payload(o[2].url).aad === "1896-1898" && /Death age\/DoB box: born 1896–1898/.test(o[2].tooltip), o[2].tooltip);
check("births / marriages never carry Death age/DoB", payload(o[0].url).aad == null && payload(o[1].url).aad == null);
check("altUrl = first given name only", payload(o[0].altUrl).given === "Doris" && /Shift\+click/.test(o[0].tooltip), o[0].altUrl);
check("applies true for Doris", site.applies(doris) === true);
check("describe mentions the form filling", /fills its search form/.test(site.describe(doris)), site.describe(doris));

// 3. Mother's maiden name sent once the window is fully after Sep 1911.
o = opts({ ...doris, birthYear: "1913", mother: { name: "Sarah Jones", given: "Sarah", surname: "Jones" } });
check("1913 birth sends mother's maiden name", payload(o[0].url).s_surname === "Jones", JSON.stringify(payload(o[0].url)));

// 4. Charles: b. 1805, m. 1831 (both pre-1837 → no entries), d. 1879 → deaths only.
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [],
  spouses: [{ name: "Margaret Stephenson", surname: "Stephenson", id: "M", marriageDate: "15 December 1831", marriageYear: "1831", marriagePlace: "Easingwold, Yorkshire, England" }],
};
o = opts(charles);
console.log("Charles:", o.map((x) => x.label).join(" | "));
check("pre-1837 birth and marriage → deaths only", o.length === 1 && payload(o[0].url).type === "Deaths", o.map((x) => x.label).join(" | "));
check("deaths window 1877–1881, Death age/DoB 1804-1806", payload(o[0].url).start === 1877 && payload(o[0].url).end === 1881 && payload(o[0].url).aad === "1804-1806", JSON.stringify(payload(o[0].url)));
check("death window ending before 1866 → no Death age/DoB (no age recorded to match)", payload(opts({ ...charles, deathYear: "1850" })[0].url).aad == null && /age at death from 1866/.test(opts({ ...charles, deathYear: "1850" })[0].tooltip));
check("no birth year → no Death age/DoB", payload(opts({ ...charles, birthYear: null })[0].url).aad == null);

// 5. The 1837 clamp: born 1836 → window 1837 (Sep quarter) – 1838.
o = opts({ ...charles, birthYear: "1836", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "", living: true, spouses: [], spouseSurnames: [] });
pl = payload(o[0].url);
check("window clamped to Sep 1837", pl.type === "Births" && pl.start === 1837 && pl.sq === 3 && pl.end === 1838, JSON.stringify(pl));

// 6. Gating: Scotland person → nothing; living → no deaths; undated spouse → inferred window.
check("Scotland person → no entries, applies false",
  opts({ ...charles, birthPlace: "Hamilton, Lanark, Scotland", deathPlace: "Glasgow, Scotland", spouses: [], spouseSurnames: [] }).length === 0 &&
  site.applies({ ...charles, birthPlace: "Hamilton, Lanark, Scotland", deathPlace: "Glasgow, Scotland", spouses: [], spouseSurnames: [] }) === false);
o = opts({ ...doris, living: true, deathYear: null, deathPlace: "" });
check("living → no deaths entry", !o.some((x) => x.group === "Deaths"), o.map((x) => x.label).join(" | "));
o = opts({ ...doris, spouses: [], spouseSurnames: ["Smith"], marriedSurnames: [] });
pl = payload(o.find((x) => x.group === "Marriages").url);
check("undated spouse → inferred window with s_surname", pl.s_surname === "Smith" && pl.start === 1915 && pl.end === 1927, JSON.stringify(pl));

// 7. No spouse on the page at all → one unfiltered inferred-window marriage search (v0.2.51,
// Stephen Hind GLWK-P4F: probably married, details not yet discovered).
const stephen = {
  id: "GLWK-P4F", given: "Stephen", surname: "Hind", sex: "Male", living: false, fullName: "Stephen Hind",
  birthYear: "1944", birthPlace: "Cheshire, England, United Kingdom", deathYear: "1992", deathPlace: "Cheshire, England, United Kingdom",
  spouses: [], spouseSurnames: [], marriedSurnames: [],
};
o = opts(stephen);
console.log("Stephen:", o.map((x) => x.label).join(" | "));
const inferred = o.find((x) => x.group === "Marriages");
pl = inferred && payload(inferred.url);
check("spouse-less person still gets a marriages search, unfiltered", !!pl && pl.type === "Marriages" && pl.s_surname == null, JSON.stringify(pl));
check("inferred window = age 18–30 (1962–1974)", !!pl && pl.start === 1962 && pl.end === 1974, JSON.stringify(pl));
check("tooltip says no spouse is on the tree yet", !!inferred && /no spouse/.test(inferred.tooltip), inferred && inferred.tooltip);
check("every spouse dated → still no extra unfiltered entry", opts(doris).filter((x) => x.group === "Marriages").length === 1);
check("died a child → no marriages search", !opts({ ...stephen, deathYear: "1954" }).some((x) => x.group === "Marriages"));

// 8. The fill script: parseParams round-trip + form filling on a fake form.
const params = { type: "Marriages", surname: "Hiscocks", given: "Doris Annie", s_surname: "Roberts", start: 1918, sq: 1, end: 1922, eq: 4 };
const hash = "#fsse=" + encodeURIComponent(JSON.stringify(params));
check("parseParams round-trip", JSON.stringify(parseParams(hash)) === JSON.stringify(params));
check("parseParams: no marker → null", parseParams("#other=1") === null);
check("parseParams: bad json → null", parseParams("#fsse=%7Bnope") === null);
check("parseParams: missing type → null", parseParams("#fsse=" + encodeURIComponent('{"surname":"X"}')) === null);
const boxes = ["All", "Births", "Deaths", "Marriages"].map((v) => ({ value: v, checked: v === "All" }));
const fields = {};
for (const n of ["surname", "given", "s_surname", "s_given", "aad", "sq", "start", "eq", "end"]) fields[n] = { value: "" };
const form = {
  querySelectorAll: (sel) => (/name="type"/.test(sel) ? boxes : []),
  querySelector: (sel) => {
    const m = /name="([^"]+)"/.exec(sel);
    return (m && fields[m[1]]) || null;
  },
};
check("fill: ticks exactly the requested type", fill(form, params) === true && boxes.map((b) => (b.checked ? b.value : "")).join("") === "Marriages");
// v0.2.72: second+ forenames trimmed to initials at fill time — FreeBMD's given matching is
// a prefix match, so "Doris A" finds entries indexed "Doris Annie" AND "Doris A" (Kevin's
// live experiment 2026-09-05); the full second name misses the initial-only entries.
check("fill: sets the text fields as strings, given trimmed to first + initial",
  fields.surname.value === "Hiscocks" && fields.given.value === "Doris A" && fields.s_surname.value === "Roberts" &&
  fields.start.value === "1918" && fields.sq.value === "1" && fields.end.value === "1922" && fields.eq.value === "4",
  JSON.stringify(fields));
check("initials: single forename untouched", initials("Doris") === "Doris");
check("initials: three forenames → first + two initials", initials("Sidney Joseph George") === "Sidney J G");
check("initials: already-initial second name unchanged", initials("Sidney J") === "Sidney J");
check("initials: empty/missing passes through", initials("") === "" && initials(null) === null);
check("fill: unknown type → false, nothing ticked", fill(form, { type: "Nope" }) === false && boxes.every((b) => !b.checked));
check("fill: Death age/DoB box filled from aad (v0.2.108), Deaths ticked",
  fill(form, { type: "Deaths", surname: "Park", given: "Thomas", aad: "1879-1881", sq: 1, start: 1939, eq: 4, end: 1945 }) === true && fields.aad.value === "1879-1881" && boxes.map((b) => (b.checked ? b.value : "")).join("") === "Deaths",
  JSON.stringify(fields));

// 9. v0.2.73 — empty year slots from RootsMagic templates. Kevin's Daniel Stow Hind (b. 1825,
// no death year) marriage search arrived as `…"eq":4,"end":}` — RM substituted nothing for
// [EndYear] — and the fill silently aborted on the invalid JSON. Now the slot parses as null
// and the end date (year + quarter) is left blank so FreeBMD searches from 1825 onwards.
const danielHash = "#fsse=%7B%22type%22%3A%22Marriages%22%2C%22surname%22%3A%22Hind%22%2C%22given%22%3A%22Daniel%20Stow%22%2C%22sq%22%3A1%2C%22start%22%3A1825%2C%22eq%22%3A4%2C%22end%22%3A%7D";
const daniel = parseParams(danielHash);
check("parseParams: empty end slot (RM, no death year) parses with end = null",
  !!daniel && daniel.type === "Marriages" && daniel.start === 1825 && daniel.sq === 1 && daniel.end === null && daniel.eq === 4, JSON.stringify(daniel));
check("parseParams: empty start slot (no birth year) parses too",
  (() => { const p = parseParams("#fsse=" + encodeURIComponent('{"type":"Deaths","surname":"Hind","given":"X","sq":1,"start":,"eq":4,"end":1900}')); return !!p && p.start === null && p.end === 1900; })());
for (const n of Object.keys(fields)) fields[n].value = "";
check("fill: missing end → start (clamped to Sep 1837, v0.2.74) + sq set, end AND eq left blank",
  fill(form, daniel) === true && fields.start.value === "1837" && fields.sq.value === "3" && fields.end.value === "" && fields.eq.value === "" && fields.given.value === "Daniel S",
  JSON.stringify(fields));

// 10. v0.2.74 — the fill-time coverage clamp. Daniel's RM run reached FreeBMD as "Mar 1825"
// and its validate() alerted "Start of search must be September 1837 or later" (screenshot
// 2026-09-06). clampWindow mirrors FreeBMD's own rules: start ≥ Sep 1837, end ≤ Dec 1999;
// a window wholly outside coverage is flagged unsearchable (form filled, Find not pressed).
let cw = clampWindow(daniel);
check("clamp: Mar 1825 start → Sep 1837, open end, searchable", cw.start === 1837 && cw.sq === 3 && cw.end === null && cw.searchable === true, JSON.stringify(cw));
cw = clampWindow({ start: 1837, sq: 1, end: 1837, eq: 4 });
check("clamp: Mar 1837 → Sep 1837 (Jun 1837 is still too early)", cw.start === 1837 && cw.sq === 3 && cw.searchable === true, JSON.stringify(cw));
cw = clampWindow({ start: 1918, sq: 1, end: 1922, eq: 4 });
check("clamp: in-range window untouched", cw.start === 1918 && cw.sq === 1 && cw.end === 1922 && cw.eq === 4 && cw.searchable === true, JSON.stringify(cw));
cw = clampWindow({ start: 1990, sq: 1, end: 2005, eq: 4 });
check("clamp: end after 1999 → Dec 1999", cw.end === 1999 && cw.eq === 4 && cw.searchable === true, JSON.stringify(cw));
cw = clampWindow({ start: 1805, sq: 1, end: 1831, eq: 4 });
check("clamp: whole window pre-1837 → unsearchable", cw.searchable === false, JSON.stringify(cw));
cw = clampWindow({ start: 2003, sq: 1, end: 2003, eq: 4 });
check("clamp: whole window post-1999 → unsearchable", cw.searchable === false, JSON.stringify(cw));
cw = clampWindow({ start: null, sq: null, end: null, eq: null });
check("clamp: no years at all → nothing set, searchable", cw.start === null && cw.end === null && cw.searchable === true, JSON.stringify(cw));
for (const n of Object.keys(fields)) fields[n].value = "";
fill(form, { type: "Deaths", surname: "Hind", given: "X", sq: 1, start: 1990, eq: 4, end: 2005 });
check("fill: writes the CLAMPED end (1999 / Dec) into the form", fields.end.value === "1999" && fields.eq.value === "4" && fields.start.value === "1990", JSON.stringify(fields));

// v0.2.75 — holdNotice: only a payload with NO year at all (christening-only / burial-only
// person through an RM template) or an out-of-coverage window is held; one known bound still
// searches (the verified v0.2.73 Daniel Stow Hind behaviour).
const noYears = parseParams("#fsse=" + encodeURIComponent('{"type":"Births","surname":"Brain","given":"Alice Jane","sq":1,"start":,"eq":4,"end":}'));
check("holdNotice: births payload with both years empty → held, names the birth year", noYears !== null && /no birth year/.test(holdNotice(noYears)) && /press Find/.test(holdNotice(noYears)), holdNotice(noYears || {}));
check("holdNotice: deaths → names the death year", /no death year/.test(holdNotice({ type: "Deaths", start: null, end: null })));
check("holdNotice: marriages → 'birth or death year'", /no birth or death year/.test(holdNotice({ type: "Marriages", start: null, end: null })));
check("holdNotice: one known bound (Daniel: start 1837, no end) → null, Find is pressed", holdNotice(daniel) === null);
check("holdNotice: full window inside coverage → null", holdNotice({ type: "Births", sq: 1, start: 1895, eq: 4, end: 1899 }) === null);
check("holdNotice: window wholly pre-1837 → held with the coverage wording", /outside FreeBMD's coverage/.test(holdNotice({ type: "Deaths", sq: 1, start: 1805, eq: 4, end: 1831 })));

// 13. v0.2.77 — one reused FreeBMD tab. Every entry URL is search.pl + fragment, the same URL
// the results page sits on, so a second search reaches the tab as a fragment-only navigation:
// retarget() stashes the payload and names the plain form page to load for real.
check("site.tab names the reused FreeBMD tab", site.tab === "fsse-freebmd", site.tab);
const store = {};
globalThis.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { retarget } = require(path.join(SRC, "freebmd-fill.js"));
check("retarget: returns the plain form URL", retarget(hash) === "https://www.freebmd.org.uk/cgi/search.pl");
check("retarget: stashes the payload for run() on the reloaded form",
  (() => { const s = JSON.parse(store["fsse.freebmd.pending"]); return s.params.type === "Marriages" && s.params.s_surname === "Roberts" && typeof s.ts === "number"; })(), store["fsse.freebmd.pending"]);
check("retarget: no payload in the hash → null, nothing stashed", (delete store["fsse.freebmd.pending"], retarget("#nothing") === null && !("fsse.freebmd.pending" in store)));
check("retarget: the Daniel byte-exact RM hash (empty end slot) still stashes", retarget(danielHash) !== null && JSON.parse(store["fsse.freebmd.pending"]).params.end === null);

// 14. v0.2.107 — DEATH YEAR UNKNOWN: one Deaths entry over the inferred window [last seen,
// birth + 100], clamped to FreeBMD's Sep 1837 – Dec 1999; the tooltip names the ages to look for.
const thomasU = {
  id: "T1", given: "Thomas Gourley", surname: "Park", sex: "Male", living: false, fullName: "Thomas Gourley Park",
  birthYear: "1880", birthPlace: "Bristol, Gloucestershire, England", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  facts: [{ kind: "Residence", year: "1921", place: "Bristol, Gloucestershire, England", text: "" }],
  attachedSources: [{ title: 'Thomas Park, "England and Wales National Register, 1939"', collection: "England and Wales National Register, 1939", mentioned: false, principal: "Thomas Park", via: "fs" }],
};
o = opts(thomasU);
const dU = o.filter((x) => x.group === "Deaths");
check("unknown death: ONE deaths entry over the window", dU.length === 1 && dU[0].label === "FreeBMD deaths — 1939–1980 (death year unknown)", JSON.stringify(dU.map((x) => x.label)));
pl = payload(dU[0].url);
check("unknown death: payload = the whole window, Mar quarter → Dec quarter, Death age/DoB = birth ±1", pl.type === "Deaths" && pl.surname === "Park" && pl.given === "Thomas Gourley" && pl.start === 1939 && pl.sq === 1 && pl.end === 1980 && pl.eq === 4 && pl.aad === "1879-1881", JSON.stringify(pl));
check("unknown death: tooltip names the evidence and says the Death age/DoB box does the narrowing", /last seen 1939 \(1939 Register\), searched 1939–1980 \(to age 100\)/.test(dU[0].tooltip) && /Death age\/DoB box \(born 1879–1881\) does the narrowing/.test(dU[0].tooltip) && /clear that box/.test(dU[0].tooltip), dU[0].tooltip);
check("unknown death: Shift+click alt keeps the window", payload(dU[0].altUrl).given === "Thomas" && payload(dU[0].altUrl).end === 1980);
// A woman b. 1917, m. 1939 → to 2017, clamped to 1999; married surname; ages from the clamped window.
const ethelU = { ...doris, id: "E1", given: "Ethel May", birthYear: "1917", deathYear: null, deathPlace: "", spouses: [{ ...doris.spouses[0], marriageDate: "1939", marriageYear: "1939" }] };
o = opts(ethelU).filter((x) => x.group === "Deaths");
pl = payload(o[0].url);
check("unknown death, woman: married surname, end clamped to Dec 1999, Death age/DoB 1916-1918", o.length === 1 && o[0].label === "FreeBMD deaths — 1939–1999 (death year unknown)" && pl.surname === "Roberts" && pl.start === 1939 && pl.end === 1999 && pl.eq === 4 && pl.aad === "1916-1918", JSON.stringify(pl));
const noBirthF = opts({ ...thomasU, birthYear: null, facts: [], attachedSources: null, spouseSurnames: ["Smith"], spouses: [{ name: "Ann Smith", surname: "Smith", id: "Z", marriageDate: "1850", marriageYear: "1850", marriagePlace: "Leeds, Yorkshire, England" }] }).filter((x) => x.group === "Deaths");
check("unknown death, no birth year: window 1850–1920, no Death age/DoB, tooltip says why", noBirthF.length === 1 && payload(noBirthF[0].url).start === 1850 && payload(noBirthF[0].url).end === 1920 && payload(noBirthF[0].url).aad == null && /No birth year in the tree/.test(noBirthF[0].tooltip), noBirthF[0] && noBirthF[0].tooltip);
check("unknown death: no window at all (nothing dates the person) → no deaths entry", opts({ ...thomasU, birthYear: null, facts: [], attachedSources: null }).filter((x) => x.group === "Deaths").length === 0);
check("unknown death: a window entirely after 1999 → no entry", opts({ ...thomasU, birthYear: "1990", facts: [{ kind: "Residence", year: "2005", place: "Bristol, England", text: "" }], attachedSources: null }).filter((x) => x.group === "Deaths").length === 0);
check("known death unchanged: Doris still gets the ±2 entry", payload(opts(doris).find((x) => x.group === "Deaths").url).start === 1978);

process.exit(fails ? 1 : 0);
