// gro.test.js — the GRO Index menu (v0.2.49): E&W + coverage-gap gating (births 1837–1934 &
// 1984–2024, deaths 1837–1957 & 1984–2024), the dual query-string + #fsse payload, and the
// fill script's parser, form filling and Search-button detection. Run: node tests/run.js gro
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const { parseParams, buildQuery, fill, findSearchButton, holdNotice, awaitingYearNotice } = require(path.join(SRC, "gro-fill.js"));
const site = FSSE.SITES.find((s) => s.id === "gro");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);
// Decode an entry's hash payload back into the params the fill script will apply.
const payload = (url) => JSON.parse(decodeURIComponent(url.split("#fsse=")[1]));
// Decode the query string the server pre-fills the form from.
const query = (url) => {
  const q = {};
  for (const kv of url.split("?")[1].split("#")[0].split("&")) {
    const [k, v] = kv.split("=");
    q[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return q;
};

// 1. Registry shape.
check("gro site exists with options()", !!site && typeof site.options === "function");
check("custom icon (our own badge, never GRO's crest)", site.icon === "icons/gro32.png", site.icon);
check("anchors after the FreeBMD row (both caret states)", site.anchorLabel[0] === "FreeBMD ▸" && site.anchorLabel[1] === "FreeBMD ▾" && site.position === "after");

// 2. Doris: E&W woman, b. 1897, d. 1980 → births only (deaths 1958–1983 were never digitised).
const doris = {
  id: "X", given: "Doris Annie", surname: "Hiscocks", sex: "Female", living: false, fullName: "Doris Annie Hiscocks",
  birthYear: "1897", birthPlace: "Fishponds, Gloucestershire, England", deathYear: "1980", deathPlace: "Bristol, England",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1920", marriageYear: "1920", marriagePlace: "Bristol, England" }],
};
let o = opts(doris);
console.log("Doris:", o.map((x) => x.label).join(" | "));
check("births only — her 1980 death falls in the 1958–1983 gap", o.length === 1 && o[0].group === "Births", o.map((x) => x.label).join(" | "));
let pl = payload(o[0].url);
check("births payload", pl.index === "EW_Birth" && pl.Year === 1897 && pl.Range === 2 && pl.Surname === "Hiscocks" && pl.Forename1 === "Doris" && pl.Forename2 === "Annie" && pl.Gender === "F", JSON.stringify(pl));
check("query string mirrors the payload (server pre-fill)", (() => {
  const q = query(o[0].url);
  return q.index === "EW_Birth" && q.Year === "1897" && q.Range === "2" && q.Surname === "Hiscocks" && q.Forename1 === "Doris" && q.Gender === "F";
})(), o[0].url);
check("no MothersSurname when the tree has no mother", pl.MothersSurname == null, JSON.stringify(pl));
check("altUrl = first forename only", payload(o[0].altUrl).Forename2 == null && payload(o[0].altUrl).Forename1 === "Doris" && /Shift\+click/.test(o[0].tooltip), o[0].altUrl);
check("applies true for Doris", site.applies(doris) === true);
check("describe mentions the login + form press", /GRO login/.test(site.describe(doris)) && /presses Search/.test(site.describe(doris)), site.describe(doris));

// 3. Mother's maiden name sent for ANY covered year — GRO records it back to 1837.
o = opts({ ...doris, mother: { name: "Sarah Jones", given: "Sarah", surname: "Jones" } });
check("1897 birth sends the mother's maiden name (unlike FreeBMD's 1911 rule)", payload(o[0].url).MothersSurname === "Jones", JSON.stringify(payload(o[0].url)));

// 4. Doris dying 1950 (covered) → death entry under the married surname with the age filter.
o = opts({ ...doris, deathYear: "1950" });
const death = o.find((x) => x.group === "Deaths");
pl = death && payload(death.url);
check("1950 death under Roberts with Age 53 ±2", !!pl && pl.index === "EW_Death" && pl.Surname === "Roberts" && pl.Year === 1950 && pl.Age === 53 && pl.AgeRange === 2 && pl.Gender === "F", JSON.stringify(pl));

// 5. Charles: b. 1805 (pre-1837 → no births), d. 1879 → deaths only, age 74.
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [],
  spouses: [{ name: "Margaret Stephenson", surname: "Stephenson", id: "M", marriageDate: "15 December 1831", marriageYear: "1831", marriagePlace: "Easingwold, Yorkshire, England" }],
};
o = opts(charles);
console.log("Charles:", o.map((x) => x.label).join(" | "));
check("pre-1837 birth → deaths only", o.length === 1 && o[0].group === "Deaths", o.map((x) => x.label).join(" | "));
pl = payload(o[0].url);
check("deaths payload: Year 1879, Age 74 ±2, Gender M", pl.Year === 1879 && pl.Age === 74 && pl.AgeRange === 2 && pl.Gender === "M", JSON.stringify(pl));

// 6. The age filter is withheld before 1866 (the index has no ages) and without a birth year.
pl = payload(opts({ ...charles, deathYear: "1850" })[0].url);
check("death 1850 → no Age sent (index records ages from 1866)", pl.Age == null && pl.AgeRange == null && pl.Year === 1850, JSON.stringify(pl));
pl = payload(opts({ ...charles, birthYear: null, birthPlace: "" })[0].url);
check("unknown birth year → no Age sent", pl.Age == null, JSON.stringify(pl));

// 7. Coverage-gap clamping: the search lands on the nearest indexed year, or nothing mid-gap.
const bornIn = (y) => ({ ...charles, birthYear: String(y), deathYear: null, deathPlace: "", living: true, spouses: [], spouseSurnames: [] });
pl = payload(opts(bornIn(1836))[0].url);
check("born 1836 → clamped up to Year 1837", pl.Year === 1837 && /nearest indexed year/.test(opts(bornIn(1836))[0].tooltip), JSON.stringify(pl));
pl = payload(opts(bornIn(1936))[0].url);
check("born 1936 → clamped back to Year 1934 (gap starts 1935)", pl.Year === 1934, JSON.stringify(pl));
check("born 1937 → no entry (too deep in the 1935–1983 gap)", opts(bornIn(1937)).length === 0);
check("born 1983 → clamped forward to Year 1984", payload(opts(bornIn(1983))[0].url).Year === 1984);
o = opts({ ...charles, deathYear: "1982" });
check("died 1982 → death clamped forward to Year 1984", payload(o[0].url).Year === 1984, o.map((x) => x.label).join(" | "));
check("died 1970 → no death entry (mid-gap)", opts({ ...charles, deathYear: "1970" }).length === 0);

// 8. Gating: unknown sex (Gender is mandatory), Scotland, living.
check("unknown sex → no entries (the form requires Sex)", opts({ ...doris, sex: "" }).length === 0);
check("Scotland person → no entries, applies false",
  opts({ ...charles, birthPlace: "Hamilton, Lanark, Scotland", deathPlace: "Glasgow, Scotland", spouses: [], spouseSurnames: [] }).length === 0 &&
  site.applies({ ...charles, birthPlace: "Hamilton, Lanark, Scotland", deathPlace: "Glasgow, Scotland", spouses: [], spouseSurnames: [] }) === false);
check("living → no deaths entry", !opts({ ...doris, living: true, deathYear: null, deathPlace: "" }).some((x) => x.group === "Deaths"));

// 9. The fill script: parser, query builder, form filling, Search-button detection.
const params = { index: "EW_Birth", Year: 1897, Range: 2, Surname: "Hiscocks", Forename1: "Doris", Forename2: "Annie", Gender: "F", MothersSurname: "Jones" };
const hash = "#fsse=" + encodeURIComponent(JSON.stringify(params));
check("parseParams round-trip", JSON.stringify(parseParams(hash)) === JSON.stringify(params));
check("parseParams: no marker → null", parseParams("#other=1") === null);
check("parseParams: bad json → null", parseParams("#fsse=%7Bnope") === null);
check("parseParams: missing index → null", parseParams("#fsse=" + encodeURIComponent('{"Surname":"X"}')) === null);
// v0.2.73: an RM deaths template run on a person with no death year leaves `"Year":,` —
// the slot now parses as null (run() then leaves the form filled without pressing Search).
const noYear = parseParams("#fsse=" + encodeURIComponent('{"index":"EW_Death","Year":,"Range":2,"Surname":"Hind","Forename1":"Daniel Stow","Gender":"M"}'));
check("parseParams: empty Year slot (RM, unknown year) parses with Year = null",
  !!noYear && noYear.Year === null && noYear.Surname === "Hind" && noYear.Range === 2, JSON.stringify(noYear));
check("buildQuery skips the null Year", !/Year=/.test(buildQuery(noYear)) && /Surname=Hind/.test(buildQuery(noYear)), buildQuery(noYear));
check("buildQuery encodes and skips empties", buildQuery({ index: "EW_Birth", Surname: "O'Neil", Forename2: null, Age: "" }) === "index=EW_Birth&Surname=O'Neil", buildQuery({ index: "EW_Birth", Surname: "O'Neil", Forename2: null, Age: "" }));

const radios = ["EW_Birth", "EW_Death"].map((v) => ({ value: v, checked: false }));
const fields = {};
for (const n of ["Year", "Range", "Surname", "Forename1", "Forename2", "Gender", "MothersSurname", "Age", "AgeRange"]) fields[n] = { value: "" };
const buttons = [
  { name: "Reset", value: "Reset", type: "submit" },
  { name: "SearchIndexes", value: "Search", type: "submit" },
];
const form = {
  querySelectorAll: (sel) => (/name="index"/i.test(sel) ? radios : /type="submit"/.test(sel) ? buttons : []),
  querySelector: (sel) => {
    const m = /name="([^"]+)"/i.exec(sel);
    if (!m) return null;
    if (/^searchindexes$/i.test(m[1])) return buttons[1];
    return fields[m[1]] || null;
  },
};
check("fill: checks exactly the requested index radio", fill(form, params) === true && radios[0].checked === true && radios[1].checked === false);
check("fill: sets the fields as strings",
  fields.Surname.value === "Hiscocks" && fields.Forename1.value === "Doris" && fields.Forename2.value === "Annie" &&
  fields.Year.value === "1897" && fields.Range.value === "2" && fields.Gender.value === "F" && fields.MothersSurname.value === "Jones" && fields.Age.value === "",
  JSON.stringify(fields));
check("fill: unknown index value → false, nothing checked", fill(form, { index: "EW_Nope" }) === false && radios.every((r) => !r.checked));
check("fill: no index radios at all → true (trust the server's GET pre-fill)",
  fill({ querySelectorAll: () => [], querySelector: () => null }, params) === true);
// v0.2.71: a multi-word Forename1 with no Forename2 (RootsMagic-style template payloads —
// RM can only substitute the whole given name) is split across GRO's two forename boxes.
fields.Forename1.value = ""; fields.Forename2.value = "";
fill(form, { index: "EW_Birth", Surname: "Hind", Forename1: "Sidney Joseph" });
check("fill: multi-word Forename1 without Forename2 splits across the boxes",
  fields.Forename1.value === "Sidney" && fields.Forename2.value === "Joseph", JSON.stringify(fields));
fields.Forename1.value = ""; fields.Forename2.value = "";
fill(form, { index: "EW_Birth", Surname: "Hind", Forename1: "Sidney Joseph George" });
check("fill: third+ names are dropped (GRO has only two forename fields)",
  fields.Forename1.value === "Sidney" && fields.Forename2.value === "Joseph");
fields.Forename1.value = ""; fields.Forename2.value = "";
fill(form, { index: "EW_Birth", Surname: "Hiscocks", Forename1: "Doris Annie", Forename2: "May" });
check("fill: an explicit Forename2 is never overridden by a split",
  fields.Forename1.value === "Doris Annie" && fields.Forename2.value === "May");
check("findSearchButton prefers name=SearchIndexes", findSearchButton(form) === buttons[1]);
const noNameForm = {
  querySelectorAll: (sel) => (/type="submit"/.test(sel) ? [{ name: "", value: "Search", type: "submit" }] : []),
  querySelector: () => null,
};
check("findSearchButton falls back to a submit whose value says Search", (findSearchButton(noNameForm) || {}).value === "Search");

// v0.2.75 — the on-page notice for a year-less RM payload (Kevin's Alice Jane Brain, chr. 1864,
// no birth date in RM: the GRO births template arrived with no Year and the form sat there
// with only a console line to explain it).
const alice = parseParams("#fsse=" + encodeURIComponent('{"index":"EW_Birth","Year":,"Range":2,"Surname":"Brain","Forename1":"Alice","Forename2":"Jane","Gender":"F"}'));
check("holdNotice: births payload without a Year → notice names the BIRTH year and the christening stand-in",
  alice !== null && /no birth year/.test(holdNotice(alice)) && /christening year/.test(holdNotice(alice)) && /press Search/.test(holdNotice(alice)), holdNotice(alice || {}));
check("holdNotice: deaths payload without a Year → names the DEATH year and the burial stand-in",
  /no death year/.test(holdNotice({ index: "EW_Death", Year: null, Surname: "Hind" })) && /burial year/.test(holdNotice({ index: "EW_Death", Year: null })));
check("holdNotice: a Year present → null (search runs)", holdNotice({ index: "EW_Birth", Year: 1897 }) === null && holdNotice({ index: "EW_Death", Year: "1950" }) === null);
check("holdNotice: empty-string Year → held like null", typeof holdNotice({ index: "EW_Birth", Year: "" }) === "string");
// v0.2.76 — a year the user chose in GRO's own Year box counts; and the year-only page banner.
check("holdNotice: no payload Year but the form's Year box holds 1864 → null (search runs)", holdNotice({ index: "EW_Birth", Year: null }, "1864") === null);
check("holdNotice: form Year box empty/whitespace → still held", typeof holdNotice({ index: "EW_Birth", Year: null }, "  ") === "string" && typeof holdNotice({ index: "EW_Birth", Year: null }, "") === "string");
const aw = awaitingYearNotice(alice);
check("awaitingYearNotice: names the birth year, the christening stand-in and the search details",
  /no birth year/.test(aw) && /christening year/.test(aw) && /fills itself/.test(aw) && /surname Brain, forenames Alice Jane, female/.test(aw), aw);
check("awaitingYearNotice: deaths wording + mother's surname listed",
  /no death year/.test(awaitingYearNotice({ index: "EW_Death", Surname: "Hind", Gender: "M", MothersSurname: "Stow" })) &&
  /surname Hind, male, mother Stow/.test(awaitingYearNotice({ index: "EW_Death", Surname: "Hind", Gender: "M", MothersSurname: "Stow" })));

// 12. v0.2.77 — one reused GRO tab. The site names its tab; a payload that arrives as a
// fragment-only navigation (same query string as the tab's current URL) is stashed and the
// search form loaded for real, Year dropped from the query when the payload has none.
check("site.tab names the reused GRO tab", site.tab === "fsse-gro", site.tab);
check("only GRO and FreeBMD reuse a tab", FSSE.SITES.filter((s) => s.tab).map((s) => s.id).sort().join(",") === "freebmd,gro");
const store = {};
globalThis.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { retarget } = require(path.join(SRC, "gro-fill.js"));
const rt = retarget("#fsse=" + encodeURIComponent(JSON.stringify({ index: "EW_Birth", Year: 1845, Range: 2, Surname: "Owen", Forename1: "James", Gender: "M" })));
check("retarget: returns the search URL with the payload in the query string",
  rt === "https://www.gro.gov.uk/gro/content/certificates/indexes_search.asp?index=EW_Birth&Year=1845&Range=2&Surname=Owen&Forename1=James&Gender=M", rt);
check("retarget: stashes the payload for run() on the reloaded form",
  (() => { const s = JSON.parse(store["fsse.gro.pending"]); return s.params.Surname === "Owen" && s.params.Year === 1845 && typeof s.ts === "number" && !s.awaitingYear && !s.navigated; })(), store["fsse.gro.pending"]);
check("retarget: no payload in the hash → null, nothing stashed", (delete store["fsse.gro.pending"], retarget("#nothing") === null && !("fsse.gro.pending" in store)));
check("retarget: a payload with no Year drops Year from the query (GRO's year-only page, v0.2.76)",
  /indexes_search\.asp\?index=EW_Birth&Surname=Brain/.test(retarget("#fsse=" + encodeURIComponent('{"index":"EW_Birth","Year":,"Surname":"Brain","Gender":"F"}'))));

// v0.2.107 — DEATH YEAR UNKNOWN: a ladder of 5-year blocks (Year = centre, Range 2) over the
// inferred window ∩ coverage, each with Age = Year − birth ±2; capped at 8 blocks; the 1958–1983
// gap is FreeBMD's and the tooltips beside it say so.
check("groDeathBlocks: 1939–1980 → four blocks to 1957, nothing in the gap", JSON.stringify(FSSE._groDeathBlocks(1939, 1980)) === JSON.stringify([{ from: 1939, to: 1943, Year: 1941 }, { from: 1944, to: 1948, Year: 1946 }, { from: 1949, to: 1953, Year: 1951 }, { from: 1954, to: 1957, Year: 1956 }]), JSON.stringify(FSSE._groDeathBlocks(1939, 1980)));
check("groDeathBlocks: a window across the gap resumes at 1984; a short tail block centres on itself", (() => { const b = FSSE._groDeathBlocks(1955, 1990); return b.length === 3 && b[0].from === 1955 && b[0].to === 1957 && b[0].Year === 1956 && b[1].from === 1984 && b[1].to === 1988 && b[1].Year === 1986 && b[2].from === 1989 && b[2].to === 1990 && b[2].Year === 1990; })(), JSON.stringify(FSSE._groDeathBlocks(1955, 1990)));
const thomasU = {
  id: "T1", given: "Thomas Gourley", surname: "Park", sex: "Male", living: false, fullName: "Thomas Gourley Park",
  birthYear: "1880", birthPlace: "Bristol, Gloucestershire, England", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  facts: [{ kind: "Residence", year: "1921", place: "Bristol, Gloucestershire, England", text: "" }],
  attachedSources: [{ title: 'Thomas Park, "England and Wales National Register, 1939"', collection: "England and Wales National Register, 1939", mentioned: false, principal: "Thomas Park", via: "fs" }],
};
const gU = opts(thomasU).filter((x) => x.group === "Deaths");
console.log("Thomas (death unknown) GRO:", gU.map((x) => x.label).join(" | "));
check("unknown death: four ladder blocks, age ±2 in each label", JSON.stringify(gU.map((x) => x.label)) === JSON.stringify(["GRO deaths — 1939–1943, age 59–63", "GRO deaths — 1944–1948, age 64–68", "GRO deaths — 1949–1953, age 69–73", "GRO deaths — 1954–1957, age 74–78"]), JSON.stringify(gU.map((x) => x.label)));
const gp = payload(gU[0].url);
check("unknown death: block payload = Year centre, Range 2, Age = Year − birth, AgeRange 2, both forenames, gender", gp.index === "EW_Death" && gp.Year === 1941 && gp.Range === 2 && gp.Age === 61 && gp.AgeRange === 2 && gp.Surname === "Park" && gp.Forename1 === "Thomas" && gp.Forename2 === "Gourley" && gp.Gender === "M", JSON.stringify(gp));
check("unknown death: the query string carries the same (server pre-fill)", query(gU[0].url).Year === "1941" && query(gU[0].url).Age === "61", JSON.stringify(query(gU[0].url)));
check("unknown death: tooltip explains the ladder and the evidence", /death year unknown: last seen 1939 \(1939 Register\), searched in 5-year blocks to 1980 \(age 100\)/.test(gU[0].tooltip) && /Age at death 61 ±2 sent/.test(gU[0].tooltip), gU[0].tooltip);
check("unknown death: the last block before the gap says FreeBMD covers 1958–1983; earlier blocks do not; nothing 'not listed'", /skips 1958–1983/.test(gU[3].tooltip) && !/skips 1958–1983/.test(gU[0].tooltip) && !/not listed/.test(gU[3].tooltip));
check("unknown death: Shift+click alt drops the second forename, keeps the block", payload(gU[1].altUrl).Forename2 == null && payload(gU[1].altUrl).Year === 1946);
// Ethel b. 1917 m. 1939 → 1939–2017 = 11 blocks → capped at 8, the last says 3 more exist; the
// last pre-gap block and the first post-gap block both carry the gap note.
const ethelU = { ...doris, id: "E1", given: "Ethel May", birthYear: "1917", deathYear: null, deathPlace: "", spouses: [{ ...doris.spouses[0], marriageDate: "1939", marriageYear: "1939" }] };
const gE = opts(ethelU).filter((x) => x.group === "Deaths");
check("unknown death, woman: 8 blocks (capped), married surname, F", gE.length === 8 && gE.every((x) => payload(x.url).Surname === "Roberts" && payload(x.url).Gender === "F"), String(gE.length));
check("unknown death, woman: blocks 1939–43 … 1954–57 then 1984–88 … 1999–2003", gE[0].label === "GRO deaths — 1939–1943, age 22–26" && gE[3].label === "GRO deaths — 1954–1957, age 37–41" && gE[4].label === "GRO deaths — 1984–1988, age 67–71" && gE[7].label === "GRO deaths — 1999–2003, age 82–86", JSON.stringify(gE.map((x) => x.label)));
check("unknown death, woman: gap note on blocks 4 and 5 only; '3 more … up to 2017' on the last", /skips 1958–1983/.test(gE[3].tooltip) && /skips 1958–1983/.test(gE[4].tooltip) && !/skips/.test(gE[5].tooltip) && /3 more 5-year blocks up to 2017 are not listed/.test(gE[7].tooltip) && !/not listed/.test(gE[6].tooltip), gE[7].tooltip);
// No birth year: no Age, labels without ages, 15 blocks → 8 shown + "7 more".
const noBirthU = { ...thomasU, id: "N1", given: "William", surname: "Brain", birthYear: null, birthPlace: "Leeds, Yorkshire, England", facts: [], attachedSources: null,
  spouseSurnames: ["Smith"], spouses: [{ name: "Ann Smith", surname: "Smith", id: "Z", marriageDate: "1850", marriageYear: "1850", marriagePlace: "Leeds, Yorkshire, England" }] };
const gN = opts(noBirthU).filter((x) => x.group === "Deaths");
check("unknown death, no birth year: no Age sent, label without ages, 8 of 15 blocks with '7 more'", gN.length === 8 && gN[0].label === "GRO deaths — 1850–1854" && !("Age" in payload(gN[0].url)) && !("AgeRange" in payload(gN[0].url)) && /7 more 5-year blocks up to 1920/.test(gN[7].tooltip), JSON.stringify(gN.map((x) => x.label)));
check("unknown death: no window at all → no deaths entries", opts({ ...noBirthU, spouses: [], spouseSurnames: [] }).filter((x) => x.group === "Deaths").length === 0);
check("known death unchanged: Charles still gets the single 1879 ±2 entry", (() => { const d = opts(charles).filter((x) => x.group === "Deaths"); return d.length === 1 && d[0].label === "GRO deaths — 1879 ±2"; })(), JSON.stringify(opts(charles).filter((x) => x.group === "Deaths").map((x) => x.label)));

process.exit(fails ? 1 : 0);
