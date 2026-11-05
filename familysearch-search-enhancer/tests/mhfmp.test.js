// mhfmp.test.js — the MyHeritage Records + Findmypast Records menus (v0.2.62): registry
// shape, the Sourcer-derived URL grammars, unique-first FMP gating (1921/1939, parish depth),
// and the MH master/trees forms. Run: node tests/run.js mhfmp
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const mh = FSSE.SITES.find((s) => s.id === "mh-records");
const fmp = FSSE.SITES.find((s) => s.id === "fmp-records");
// v0.2.104: both menus open with the hidden native row's own search — "All Collections — <name> (b–d)"
// since v0.2.112 (MyHeritage) / v0.2.113 (Findmypast), "All Results" before — the
// checks of sections 2–7 look at everything after it, exactly as they did before.
const mhRest = (p) => mh.options(p).slice(1);
const fmpRest = (p) => fmp.options(p).slice(1);

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};

// 1. Registry shape — both menus clone the NATIVE logos (no icon), anchored on the native rows.
check("mh-records exists, no custom icon (cloned native logo)", !!mh && mh.icon == null && mh.anchorLabel === "MyHeritage");
check("fmp-records exists, no custom icon, both Findmypast casings", !!fmp && fmp.icon == null && fmp.anchorLabel[0] === "Findmypast" && fmp.anchorLabel.includes("FindMyPast"));
check("fmp-records listed AFTER freebmd in SITES (lands adjacent to the native row)",
  FSSE.SITES.findIndex((s) => s.id === "fmp-records") > FSSE.SITES.findIndex((s) => s.id === "freebmd"));

// 2. MyHeritage: Charles — master-form grammar + trees, byte-checked.
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [],
  spouses: [{ name: "Margaret Stephenson", surname: "Stephenson", id: "M", marriageDate: "15 December 1831", marriageYear: "1831", marriagePlace: "Easingwold, Yorkshire, England" }],
};
let o = mhRest(charles);
console.log("MH Charles:", o.map((x) => x.label).join(" | "));
check("MH: all-records + 4 censuses (v0.2.121) + trees = 6 entries", o.length === 6 && o.filter((x) => x.group === "Census").length === 4, o.map((x) => x.label).join(" | "));
check("MH master URL (v0.2.111): Kevin's param order, qname with fn/ln/gender, birth event, England as the any-event place, death event, qevents=List",
  o[0].url === "https://www.myheritage.com/research?s=1&formId=master&formMode=1&useTranslation=1&exactSearch=&p=1&action=query&view_mode=card&qname=Name+fn.Charles+fnmo.1+ln.Bellwood+lnmsrs.false+g.M&qevents-event1=Event+et.birth+ey.1805&qevents-any/1event_1=Event+et.any+ep.England+epmo.similar&qevents-any/1event_2=Event+et.death+ey.1879&qevents=List", o[0].url);
check("MH trees URL: collection-1 with formId=trees",
  /\/research\/collection-1\/myheritage-family-trees\?formId=trees&action=query/.test(o.at(-1).url) && /qname=Name\+fn\.Charles/.test(o.at(-1).url), o.at(-1).url);

// 3. MyHeritage: a married woman → maiden + married all-records, trees under the maiden name.
const doris = {
  id: "X", given: "Doris Annie", surname: "Hiscocks", sex: "Female", living: false, fullName: "Doris Annie Hiscocks",
  birthYear: "1897", birthPlace: "Fishponds, Gloucestershire, England", deathYear: "1980", deathPlace: "Bristol, England",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1920", marriageYear: "1920", marriagePlace: "Bristol, England" }],
};
o = mhRest(doris);
check("MH Doris: maiden + married + 3 censuses (1901/1911/1939 — no 1921 on MyHeritage) + trees = 6 entries, g.F", o.length === 6 && o.filter((x) => x.group === "Census").length === 3 && /ln\.Roberts/.test(o[1].url) && /\+g\.F/.test(o[0].url), o.map((x) => x.label).join(" | "));
check("MH trees = maiden only, last", /ln\.Hiscocks/.test(o.at(-1).url) && o.at(-1).group === "Family trees" && o.filter((x) => x.group === "Family trees").length === 1);
check("MH first given only (fn.Doris, not Doris Annie)", /fn\.Doris\+/.test(o[0].url), o[0].url);

// 4. Findmypast: Charles — all + census 1841–1871 + parish trio.
o = fmpRest(charles);
console.log("FMP Charles:", o.map((x) => x.label).join(" | "));
check("FMP Charles: 1 all + 4 censuses + 1 civil death + 3 parish = 9 entries (v0.2.118)", o.length === 9, o.map((x) => x.label).join(" | "));
check("FMP all-records (v0.2.114: scoped to England): name variants + yob/yod ±2 + the country in the Where box + sid=999",
  o[0].label === "England — Charles Bellwood (1805–1879)" && /firstname=Charles&firstname_variants=true&lastname=Bellwood/.test(o[0].url) && /yearofbirth=1805&yearofbirth_offset=2/.test(o[0].url) && /yearofdeath=1879&yearofdeath_offset=2&keywordsplace=england&keywordsplace_proximity=5&sid=999$/.test(o[0].url), o[0].url);
const c1851 = o.find((x) => /^1851 E&W Census/.test(x.label));
check("FMP census: sid=102 category, exact eventyear, sourcecountry=england",
  !!c1851 && /sourcecategory=census%2c\+land\+%26\+surveys&collection=census&sid=102/.test(c1851.url) &&
  /eventyear=1851&eventyear_offset=0/.test(c1851.url) && /sourcecountry=england/.test(c1851.url), c1851 && c1851.url);
check("no 1921/1939 for Charles (d. 1879)", !o.some((x) => /1921|1939/.test(x.label)));
const pb = o.find((x) => /Parish baptisms/.test(x.label));
check("parish baptisms: sid=101 + collection=parish+baptisms + eventyear 1805 ±2",
  !!pb && /sourcecategory=life\+events%28bmds%29&sid=101/.test(pb.url) && /collection=parish\+baptisms/.test(pb.url) && /eventyear=1805&eventyear_offset=2/.test(pb.url), pb && pb.url);
const pm = o.find((x) => /Parish marriages/.test(x.label));
check("parish marriages: 1831 window with the spouse's names",
  !!pm && /collection=parish\+marriages/.test(pm.url) && /eventyear=1831&eventyear_offset=2/.test(pm.url) &&
  /spouselastname=Stephenson/.test(pm.url) && /spousefirstname=Margaret/.test(pm.url), pm && pm.url);
const pbur = o.find((x) => /Parish burials/.test(x.label));
check("parish burials: 1879 ±2", !!pbur && /collection=parish\+burials/.test(pbur.url) && /eventyear=1879&eventyear_offset=2/.test(pbur.url), pbur && pbur.url);

// 5. FMP: 1921 + 1939 for a person alive then and E&W-bracketed; not after leaving.
const norman = {
  id: "KW8B-KPY", given: "Norman", surname: "Owen", sex: "Male", living: false, fullName: "Norman Owen",
  birthYear: "1908", birthPlace: "Stanley, Durham, England", deathYear: "1978", deathPlace: "Red Deer, Alberta, Canada",
  spouseSurnames: ["Smith"], marriedSurnames: [],
  spouses: [{ name: "Jane Smith", surname: "Smith", id: "S", marriageDate: "13 Sep 1929", marriageYear: "1929", marriagePlace: "Calgary, Alberta, Canada" }],
};
o = fmpRest(norman);
const nYears = o.filter((x) => x.group === "Census").map((x) => x.label);
check("Norman: 1911 + 1921 E&W offered, 1939 not (Canada-bracketed)",
  nYears.some((l) => /1911/.test(l)) && nYears.some((l) => /1921/.test(l)) && !nYears.some((l) => /1939/.test(l)), nYears.join(" | "));
check("1921 tooltip notes FMP holds the images", /1921 census IMAGES/.test(o.find((x) => /1921/.test(x.label)).tooltip));

// 6. FMP: Wales place → no sourcecountry; Irish censuses; parents on baptisms; US-only person.
o = fmpRest({ ...charles, birthPlace: "Cardiff, Glamorgan, Wales", deathPlace: "Cardiff, Wales" });
check("Wales-touched → no sourcecountry on census/parish (the civil deaths entry keeps great+britain, v0.2.118)", !o.some((x) => /^(Census|Parish records)$/.test(x.group) && /sourcecountry/.test(x.url)) && /sourcecountry=great\+britain$/.test(o.find((x) => x.group === "Civil records").url), o.find((x) => x.group === "Census") && o.find((x) => x.group === "Census").url);
o = fmpRest({ ...charles, birthYear: "1880", birthPlace: "Ballina, Mayo, Ireland", deathYear: "1950", deathPlace: "Dublin, Ireland", spouses: [], spouseSurnames: [] });
check("Irish person → 1901 + 1911 Ireland censuses with sourcecountry=ireland",
  o.filter((x) => /Ireland Census/.test(x.label)).length === 2 && o.filter((x) => /Ireland Census/.test(x.label)).every((x) => /sourcecountry=ireland/.test(x.url)), o.map((x) => x.label).join(" | "));
o = fmpRest({ ...charles, father: { name: "William Bellwood", given: "William", surname: "Bellwood" }, mother: { name: "Sarah Jones", given: "Sarah", surname: "Jones" } });
const pb2 = o.find((x) => /Parish baptisms/.test(x.label));
check("baptism carries the parents", !!pb2 && /fatherfirstname=William/.test(pb2.url) && /fatherlastname=Bellwood/.test(pb2.url) && /motherfirstname=Sarah/.test(pb2.url), pb2 && pb2.url);
o = fmpRest({ ...charles, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [] });
check("US-only person → the US all-records entry + the US federal censuses only (v0.2.120), no parish / civil", o[0].group === "All records" && o.length === 4 && o.slice(1).every((x) => x.group === "Census" && x.label.includes("US Federal Census")), o.map((x) => x.label).join(" | "));

// 7. FMP: spouse-less inferred parish marriage (v0.2.51 parity).
o = fmpRest({ ...charles, spouses: [], spouseSurnames: [] });
const inf = o.find((x) => /Parish marriages/.test(x.label));
check("no spouse → one unfiltered inferred parish-marriage search",
  !!inf && !/spouselastname/.test(inf.url) && /eventyear=/.test(inf.url), inf && inf.url);

check("describes mention the unique strengths / Smart Matches",
  /1921/.test(fmp.describe(norman)) && /Smart Matches/.test(mh.describe(charles)));

// 8. v0.2.104 — ONE entry point per site (Kevin: "please give this same treatment for
//    MyHeritage and FindMyPast"): plain row labels, the native rows hidden via `replaces`
//    (Findmypast in both casings — the narrow layout spells it "FindMyPast"), and each menu
//    opening with "All Results" = the native row's own link, else the maiden all-records search.
check("registry: plain labels, replaces the native rows (Findmypast in both casings)",
  mh.label === "MyHeritage" && JSON.stringify(mh.replaces) === JSON.stringify(["MyHeritage"]) &&
  fmp.label === "Findmypast" && JSON.stringify(fmp.replaces) === JSON.stringify(["Findmypast", "FindMyPast"]), JSON.stringify([mh.label, mh.replaces, fmp.label, fmp.replaces]));
const mhNative = "https://www.myheritage.com/research?s=1&formId=master&qname=Name+fn.Charles+ln.Bellwood&utm_source=familysearch";
let m = mh.options({ ...charles, nativeUrls: { "mh-records": mhNative } });
check("MH native link: All Collections — <name> FIRST (in the All records group, byte-for-byte), then the England entry (no MyHeritage prefix), Family Trees last",
  m[0].label === "All Collections — Charles Bellwood (1805–1879)" && m[0].group === "All records" && m[0].url === mhNative && m[1].label === "England — Charles Bellwood (1805–1879)" && m.at(-1).label === "Family Trees — Charles Bellwood (1805–1879)" && m.at(-1).group === "Family trees", m.map((x) => x.label).join(" | "));
check("MH native link: the click is still handed to the row (FS builds the URL), the read link is the reserve; tooltip says so", m[0].nativeClick === true && /FamilySearch's own MyHeritage entry/.test(m[0].tooltip) && /your click is handed to it/.test(m[0].tooltip), m[0].tooltip);
m = mh.options(charles);
// v0.2.111: the stand-in is the WORLDWIDE search (what FS's own partner link is), not the
// country-scoped entry that now follows it; the death is numbered 1event_1 (contiguous).
const mhWorld = "https://www.myheritage.com/research?s=1&formId=master&formMode=1&useTranslation=1&exactSearch=&p=1&action=query&view_mode=card&qname=Name+fn.Charles+fnmo.1+ln.Bellwood+lnmsrs.false+g.M&qevents-event1=Event+et.birth+ey.1805&qevents-any/1event_1=Event+et.death+ey.1879&qevents=List";
check("MH no native link: the worldwide maiden all-records search stands in (not the England-scoped next entry), tooltip says so",
  m[0].label === "All Collections — Charles Bellwood (1805–1879)" && m[0].url === mhWorld && m[0].url !== m[1].url && /native MyHeritage search link was not found/.test(m[0].tooltip), m[0].url);
check("MH: exactly one All Collections; Doris = All Collections + maiden + married + 3 censuses + trees", mh.options(doris).filter((x) => x.label === "All Collections — Doris Hiscocks (1897–1980)").length === 1 && mh.options(doris).length === 7, mh.options(doris).map((x) => x.label).join(" | "));
check("MH native link before the name has scraped: the bare All Collections alone, 'this person'",
  JSON.stringify(mh.options({ id: "X", spouses: [], marriedSurnames: [], nativeUrls: { "mh-records": mhNative } }).map((x) => x.label)) === JSON.stringify(["All Collections"]) && /this person/.test(mh.options({ id: "X", spouses: [], marriedSurnames: [], nativeUrls: { "mh-records": mhNative } })[0].tooltip));
check("MH no link and no name: nothing", mh.options({ id: "X", spouses: [], marriedSurnames: [] }).length === 0);
check("MH nativeUrls keyed per site: a Findmypast link never becomes MyHeritage's All Collections entry", mh.options({ ...charles, nativeUrls: { "fmp-records": "https://www.findmypast.com/x" } })[0].url === mh.options(charles)[0].url);
const fmpNative = "https://www.findmypast.com/search/results?firstname=charles&lastname=bellwood&yearofbirth=1805&sourcecountry=england&utm_source=familysearch";
let f = fmp.options({ ...charles, nativeUrls: { "fmp-records": fmpNative } });
check("FMP native link: All Results FIRST in the All records group, byte-for-byte; the 8 entries of before follow",
  f[0].label === "All Collections — Charles Bellwood (1805–1879)" && f[0].group === "All records" && f[0].url === fmpNative && f[1].label.startsWith("England — Charles Bellwood") && f.length === 10, f.map((x) => x.label).join(" | "));
check("FMP native link: the click is still handed to the row, the read link is the reserve; tooltip says so and keeps the login note", f[0].nativeClick === true && /FamilySearch's own Findmypast entry/.test(f[0].tooltip) && /your click is handed to it/.test(f[0].tooltip) && /login works here/.test(f[0].tooltip), f[0].tooltip);
f = fmp.options(charles);
// v0.2.114: the stand-in is the WORLDWIDE all-records search (what FS's own partner link is), not
// the England-scoped entry that now follows it.
const fmpWorld = "https://www.findmypast.com/search/results?firstname=Charles&firstname_variants=true&lastname=Bellwood&yearofbirth=1805&yearofbirth_offset=2&yearofdeath=1879&yearofdeath_offset=2";
check("FMP no native link: the worldwide maiden all-records search stands in (not the England-scoped next entry), tooltip says so",
  f[0].label === "All Collections — Charles Bellwood (1805–1879)" && f[0].url === fmpWorld && f[0].url !== f[1].url && /native Findmypast search link was not found/.test(f[0].tooltip), f[0].url);
check("FMP native link before the name has scraped: All Results alone",
  JSON.stringify(fmp.options({ id: "X", spouses: [], marriedSurnames: [], nativeUrls: { "fmp-records": fmpNative } }).map((x) => x.label)) === JSON.stringify(["All Collections"]));
check("FMP no link and no name: nothing", fmp.options({ id: "X", spouses: [], marriedSurnames: [] }).length === 0);
check("FMP US-only person: All Collections + the US all-records entry + the US federal censuses 1850–1870 (v0.2.120), nothing else",
  fmp.options({ ...charles, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [] }).map((x) => x.label).join(" | ") === "All Collections — Charles Bellwood (1805–1879) | United States — Charles Bellwood (1805–1879) | 1850 US Federal Census — Charles Bellwood | 1860 US Federal Census — Charles Bellwood | 1870 US Federal Census — Charles Bellwood", fmp.options({ ...charles, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [] }).map((x) => x.label).join(" | "));
check("FMP nativeUrls keyed per site: a MyHeritage link never becomes Findmypast's All Results", fmp.options({ ...charles, nativeUrls: { "mh-records": mhNative } })[0].url === fmp.options(charles)[0].url);
check("describes open with the plain names and mention the native entry (All Collections for both since v0.2.113)",
  /^MyHeritage — click/.test(mh.describe(charles)) && /All Collections/.test(mh.describe(charles)) && !/All Results/.test(mh.describe(charles)) && /^Findmypast — click/.test(fmp.describe(charles)) && /All Collections/.test(fmp.describe(charles)) && !/All Results/.test(fmp.describe(charles)), fmp.describe(charles));

// 9. v0.2.105 — Kevin's finding (George Leonard Pearson GCBF-WX6): the native MyHeritage link is
//    built AT CLICK TIME (csrf_token + fspid + utm partner tags), so the row has no href and our
//    All Results fell back to the all-records search. With the row present but link-less the entry
//    now carries nativeClick (injectMenu hands the click to the hidden row); the URL is a reserve.
const mRow = mh.options({ ...charles, nativeRows: { "mh-records": true } });
check("MH native row, no link: All Collections — <name> first with nativeClick, the maiden all-records URL in reserve, tooltip says the click is handed over",
  mRow[0].label === "All Collections — Charles Bellwood (1805–1879)" && mRow[0].nativeClick === true && mRow[0].url === mhWorld && /FamilySearch's own MyHeritage entry/.test(mRow[0].tooltip) && /your click is handed to it/.test(mRow[0].tooltip) && mRow.length === 7, mRow[0].tooltip);
const mRowId = mh.options({ id: "X", spouses: [], marriedSurnames: [], nativeRows: { "mh-records": true } });
check("MH native row, no name yet: the bare All Collections alone, the bare research page in reserve", mRowId.length === 1 && mRowId[0].label === "All Collections" && mRowId[0].nativeClick === true && mRowId[0].url === "https://www.myheritage.com/research", JSON.stringify(mRowId));
check("MH: a row WITH a link → nativeClick too, the link as the reserve; no row → no nativeClick", (() => { const e = mh.options({ ...charles, nativeUrls: { "mh-records": mhNative }, nativeRows: { "mh-records": true } })[0]; return e.nativeClick === true && e.url === mhNative; })() && !mh.options(charles)[0].nativeClick);
const fRow = fmp.options({ ...charles, nativeRows: { "fmp-records": true } });
check("FMP native row, no link: All Results first with nativeClick, the all-records URL in reserve, tooltip says the click is handed over",
  fRow[0].label === "All Collections — Charles Bellwood (1805–1879)" && fRow[0].nativeClick === true && fRow[0].url === fmpWorld && /FamilySearch's own Findmypast entry/.test(fRow[0].tooltip) && /your click is handed to it/.test(fRow[0].tooltip) && fRow.length === 10, fRow[0].tooltip);
const fRowId = fmp.options({ id: "X", spouses: [], marriedSurnames: [], nativeRows: { "fmp-records": true } });
check("FMP native row, no name yet: All Results alone, the bare results page in reserve", fRowId.length === 1 && fRowId[0].label === "All Collections" && fRowId[0].nativeClick === true && fRowId[0].url === "https://www.findmypast.com/search/results", JSON.stringify(fRowId));
check("FMP: a row WITH a link → nativeClick too, the link as the reserve; no row → no nativeClick", (() => { const e = fmp.options({ ...charles, nativeUrls: { "fmp-records": fmpNative }, nativeRows: { "fmp-records": true } })[0]; return e.nativeClick === true && e.url === fmpNative; })() && !fmp.options(charles)[0].nativeClick);
check("only the All Results entry ever carries nativeClick", !mRow.slice(1).some((x) => x.nativeClick) && !fRow.slice(1).some((x) => x.nativeClick));

// 9. v0.2.107 — DEATH YEAR UNKNOWN: the parish burials search spans the inferred window as
// eventyear = centre ± the smallest FMP offset covering it. (The civil "Deaths & burials" entry
// waits for one pasted Findmypast deaths-search URL — its collection= value is unknown.)
const thomasU = {
  id: "T1", given: "Thomas Gourley", surname: "Park", sex: "Male", living: false, fullName: "Thomas Gourley Park",
  birthYear: "1880", birthPlace: "Bristol, Gloucestershire, England", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  facts: [{ kind: "Residence", year: "1921", place: "Bristol, Gloucestershire, England", text: "" }],
  attachedSources: [{ title: 'Thomas Park, "England and Wales National Register, 1939"', collection: "England and Wales National Register, 1939", mentioned: false, principal: "Thomas Park", via: "fs" }],
};
const fU = fmpRest(thomasU).filter((x) => /^Parish burials/.test(x.label));
check("FMP unknown death: burials entry labelled with the window", fU.length === 1 && fU[0].label === "Parish burials — Thomas Park, 1939–1980 (death year unknown)", JSON.stringify(fU.map((x) => x.label)));
check("FMP unknown death: eventyear = centre 1960 ± 40 (the smallest offset covering 41 years), England", /collection=parish\+burials&firstname=Thomas&firstname_variants=true&lastname=Park&eventyear=1960&eventyear_offset=40&sourcecountry=england$/.test(fU[0].url), fU[0].url);
check("FMP unknown death: tooltip names the evidence and what was sent", /last seen 1939 \(1939 Register\), searched 1939–1980 \(to age 100\) — sent as year 1960 ±40/.test(fU[0].tooltip), fU[0].tooltip);
const fN = fmpRest({ ...thomasU, birthYear: "1900", facts: [{ kind: "Residence", year: "1950", place: "Bristol, England", text: "" }], attachedSources: null }).filter((x) => /^Parish burials/.test(x.label));
check("FMP unknown death: a 50-year window (1950–2000) → centre 1975, offset 40 (the smallest ≥ 25)", /eventyear=1975&eventyear_offset=40/.test(fN[0].url), fN[0].url);
const fS = fmpRest({ ...thomasU, birthYear: "1900", facts: [{ kind: "Residence", year: "1990", place: "Bristol, England", text: "" }], attachedSources: null }).filter((x) => /^Parish burials/.test(x.label));
check("FMP unknown death: a 10-year window (1990–2000) → centre 1995 ± 5", /eventyear=1995&eventyear_offset=5/.test(fS[0].url), fS[0].url);
check("FMP unknown death: no window at all → the year-less burials entry as before", (() => { const e = fmpRest({ ...thomasU, birthYear: null, facts: [], attachedSources: null }).find((x) => /^Parish burials/.test(x.label)); return e && e.label === "Parish burials — Thomas Park" && !/eventyear/.test(e.url); })());
check("FMP known death unchanged: Charles's burials entry still ±2", /eventyear=1879&eventyear_offset=2/.test(fmpRest(charles).find((x) => /^Parish burials/.test(x.label)).url));

// 10. v0.2.111 — COUNTRY SCOPE (Kevin's verified URL, Mary Cullum b. 1891 d. 1956 Australia): one
//     all-records entry per country the person's events touch, the country sent as an "any" event
//     place between the birth and death events; worldwide only when no place classifies.
const mary = {
  id: "M1", given: "Mary", surname: "Cullum", sex: "Female", living: false, fullName: "Mary Cullum",
  birthYear: "1891", birthPlace: "Sydney, New South Wales, Australia", deathYear: "1956", deathPlace: "Melbourne, Victoria, Australia",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
};
const kevinUrl = "https://www.myheritage.com/research?s=1&formId=master&formMode=1&useTranslation=1&exactSearch=&p=1&action=query&view_mode=card&qname=Name+fn.Mary+fnmo.1+ln.Cullum+lnmsrs.false+g.F&qevents-event1=Event+et.birth+ey.1891&qevents-any/1event_1=Event+et.any+ep.Australia+epmo.similar&qevents-any/1event_2=Event+et.death+ey.1956&qevents=List";
let c = mhRest(mary);
check("MH country scope: Mary Cullum's Australia entry = Kevin's URL byte for byte", c[0].label === "Australia — Mary Cullum (1891–1956)" && c[0].url === kevinUrl, c[0].url);
check("MH country scope: Australia entry + trees only (no worldwide entry once a country classifies)", c.length === 2 && c[1].group === "Family trees", c.map((x) => x.label).join(" | "));
check("MH country scope: the trees search never carries the country", !/et\.any/.test(c[1].url) && /formId=trees&action=query/.test(c[1].url), c[1].url);
check("MH country scope: tooltip names the country and the mechanism", /within Australia/.test(c[0].tooltip) && /similar-place/.test(c[0].tooltip), c[0].tooltip);
check("MH country scope: describe says within Australia", /within Australia/.test(mh.describe(mary)), mh.describe(mary));
check("FSSE.mhCountries: birth first, facts counted, deduped, Wales re-tested, United States → USA",
  JSON.stringify(FSSE.mhCountries({ ...mary, birthPlace: "Cardiff, Glamorgan, Wales", deathPlace: "Brooklyn, Kings, New York, United States", facts: [{ kind: "Residence", year: "1920", place: "Perth, Western Australia, Australia" }, { kind: "Residence", year: "1930", place: "Sydney, New South Wales, Australia" }] })) === JSON.stringify(["Wales", "Australia", "USA"]),
  JSON.stringify(FSSE.mhCountries({ ...mary, birthPlace: "Cardiff, Glamorgan, Wales", deathPlace: "Brooklyn, Kings, New York, United States", facts: [{ kind: "Residence", year: "1920", place: "Perth, Western Australia, Australia" }] })));
c = mhRest({ ...mary, birthPlace: "Bristol, Gloucestershire, England", marriedSurnames: ["Smith"], spouseSurnames: ["Smith"], spouses: [{ name: "John Smith", surname: "Smith", id: "S", marriageDate: "1915", marriageYear: "1915", marriagePlace: "Sydney, New South Wales, Australia" }] });
check("MH two countries × two names: England block (maiden, married) then Australia block, trees last (the E&W censuses sit between, v0.2.121)",
  c.filter((x) => x.group !== "Census").map((x) => x.label).join(" | ") === "England — Mary Cullum (1891–1956) | England — Mary Smith (1891–1956) | Australia — Mary Cullum (1891–1956) | Australia — Mary Smith (1891–1956) | Family Trees — Mary Cullum (1891–1956)", c.map((x) => x.label).join(" | "));
check("MH two countries: the married Australia entry carries ln.Smith + ep.Australia", /ln\.Smith\+/.test(c[3].url) && /1event_1=Event\+et\.any\+ep\.Australia\+epmo\.similar/.test(c[3].url), c[3].url);
c = mhRest({ ...mary, birthPlace: "Berlin, Germany", deathPlace: "Hamburg, Germany" });
check("MH no classifiable country: ONE worldwide entry, death numbered 1event_1 (contiguous), no any-event, tooltip says worldwide",
  c.length === 2 && c[0].label === "Worldwide — Mary Cullum (1891–1956)" && /qevents-event1=Event\+et\.birth\+ey\.1891&qevents-any\/1event_1=Event\+et\.death\+ey\.1956&qevents=List$/.test(c[0].url) && !/et\.any/.test(c[0].url) && /worldwide/.test(c[0].tooltip), c[0].url);
c = mhRest({ ...mary, birthYear: null, christeningYear: null });
check("MH no birth year: the country becomes qevents-event1, the death 1event_1",
  /qname=[^&]+&qevents-event1=Event\+et\.any\+ep\.Australia\+epmo\.similar&qevents-any\/1event_1=Event\+et\.death\+ey\.1956&qevents=List$/.test(c[0].url), c[0].url);
c = mhRest({ ...mary, birthYear: null, christeningYear: null, deathYear: null, burialYear: null });
check("MH no years at all: the country alone as qevents-event1", /qevents-event1=Event\+et\.any\+ep\.Australia\+epmo\.similar&qevents=List$/.test(c[0].url), c[0].url);
check("MH New Zealand encodes its space as %2F3", /ep\.New%2F3Zealand\+epmo\.similar/.test(mhRest({ ...mary, birthPlace: "Dunedin, Otago, New Zealand", deathPlace: "Dunedin, Otago, New Zealand" })[0].url));
check("MH All Collections stand-in (no native row) stays worldwide while the first listed entry is country-scoped",
  (() => { const a = mh.options(mary); return a[0].label === "All Collections — Mary Cullum (1891–1956)" && !/et\.any/.test(a[0].url) && /et\.any\+ep\.Australia/.test(a[1].url); })(), mh.options(mary).map((x) => x.label).join(" | "));
check("MH Family Trees URL unchanged in shape (formId=trees first, then action=query)", /\/research\/collection-1\/myheritage-family-trees\?formId=trees&action=query&formMode=1&useTranslation=1&view_mode=card&qname=Name\+fn\.Mary/.test(mhRest(mary)[1].url), mhRest(mary)[1].url);

// 11. v0.2.112 — LABELS (Kevin: "Replace 'All Results' with 'All Collections - Mary Cullum (1891-1956)'
//     … Remove the word 'MyHeritage' in front of each menu selection"): the native entry carries the
//     name + life span like every other entry, and no entry of the MyHeritage menu says "MyHeritage".
for (const [who, px] of [["Charles", charles], ["Doris", doris], ["Mary", mary]]) {
  for (const extra of [{}, { nativeRows: { "mh-records": true } }, { nativeUrls: { "mh-records": mhNative } }]) {
    const labels = mh.options({ ...px, ...extra }).map((x) => x.label);
    check(`MH labels (${who}${Object.keys(extra).length ? ", " + Object.keys(extra)[0] : ""}): none starts with "MyHeritage", the first reads All Collections — <name> (b–d)`,
      !labels.some((l) => /^MyHeritage/.test(l)) && /^All Collections — \S+ \S+ \(\d{4}–\d{4}\)$/.test(labels[0]), labels.join(" | "));
  }
}
check("MH All Collections without years: no empty parentheses", mh.options({ ...mary, birthYear: null, christeningYear: null, deathYear: null, burialYear: null, nativeRows: { "mh-records": true } })[0].label === "All Collections — Mary Cullum");
check("Findmypast (v0.2.113): its menu opens with All Collections — <name> (b–d) too, and no entry says Findmypast", (() => { const l = fmp.options({ ...charles, nativeRows: { "fmp-records": true } }).map((x) => x.label); return l[0] === "All Collections — Charles Bellwood (1805–1879)" && !l.some((x) => /^Findmypast/.test(x)); })(), fmp.options({ ...charles, nativeRows: { "fmp-records": true } }).map((x) => x.label).join(" | "));
check("Findmypast All Collections without years: no empty parentheses", fmp.options({ ...charles, birthYear: null, christeningYear: null, deathYear: null, burialYear: null, nativeRows: { "fmp-records": true } })[0].label === "All Collections — Charles Bellwood");

// 12. v0.2.114 — FINDMYPAST COUNTRY SCOPE (Kevin's verified URL, Mary Cullum): the country in the
//     Where box (keywordsplace + proximity 5) with sid=999, one all-records entry per touched
//     country; "Worldwide — …" only when no place classifies; census/parish entries untouched.
const kevinFmp = "https://www.findmypast.com/search/results?firstname=mary&firstname_variants=true&lastname=cullum&yearofbirth=1891&yearofbirth_offset=2&yearofdeath=1956&yearofdeath_offset=2&keywordsplace=australia&keywordsplace_proximity=5&sid=999";
let fc = fmpRest(mary);
check("FMP country scope: Mary Cullum's Australia entry = Kevin's URL (only the two name tokens keep the tree's capitals)",
  fc.length === 1 && fc[0].label === "Australia — Mary Cullum (1891–1956)" && fc[0].url.toLowerCase() === kevinFmp && fc[0].url === kevinFmp.replace("firstname=mary", "firstname=Mary").replace("lastname=cullum", "lastname=Cullum"), fc[0].url);
check("FMP country scope: tooltip names the country and the Where box", /within Australia/.test(fc[0].tooltip) && /Where box/.test(fc[0].tooltip), fc[0].tooltip);
fc = fmpRest({ ...mary, birthPlace: "Bristol, Gloucestershire, England", marriedSurnames: ["Smith"], spouseSurnames: ["Smith"], spouses: [{ name: "John Smith", surname: "Smith", id: "S", marriageDate: "1915", marriageYear: "1915", marriagePlace: "Sydney, New South Wales, Australia" }] }).filter((x) => x.group === "All records");
check("FMP two countries × two names: England block then Australia block", fc.map((x) => x.label).join(" | ") === "England — Mary Cullum (1891–1956) | England — Mary Smith (1891–1956) | Australia — Mary Cullum (1891–1956) | Australia — Mary Smith (1891–1956)", fc.map((x) => x.label).join(" | "));
check("FMP two countries: the married England entry carries lastname=Smith + keywordsplace=england", /lastname=Smith&.*keywordsplace=england&keywordsplace_proximity=5&sid=999$/.test(fc[1].url), fc[1].url);
fc = fmpRest({ ...mary, birthPlace: "Berlin, Germany", deathPlace: "Hamburg, Germany" });
check("FMP no classifiable country: ONE Worldwide entry with the v0.2.62 URL (no keywordsplace, no sid)",
  fc.length === 1 && fc[0].label === "Worldwide — Mary Cullum (1891–1956)" && fc[0].url === "https://www.findmypast.com/search/results?firstname=Mary&firstname_variants=true&lastname=Cullum&yearofbirth=1891&yearofbirth_offset=2&yearofdeath=1956&yearofdeath_offset=2" && /worldwide/.test(fc[0].tooltip), fc[0].url);
check("FMP New Zealand → keywordsplace=new%20zealand", /keywordsplace=new%20zealand&keywordsplace_proximity=5&sid=999$/.test(fmpRest({ ...mary, birthPlace: "Dunedin, Otago, New Zealand", deathPlace: "Dunedin, Otago, New Zealand" })[0].url));
check("FMP United States → keywordsplace=united%20states", /keywordsplace=united%20states&keywordsplace_proximity=5&sid=999$/.test(fmpRest({ ...charles, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [] })[0].url));
check("FMP All Collections stand-in (no native row) stays worldwide while the first listed entry is country-scoped",
  (() => { const a = fmp.options(mary); return a[0].label === "All Collections — Mary Cullum (1891–1956)" && !/keywordsplace/.test(a[0].url) && /keywordsplace=australia/.test(a[1].url); })(), fmp.options(mary).map((x) => x.label).join(" | "));
check("FMP describe says all records within Australia", /all records within Australia/.test(fmp.describe(mary)), fmp.describe(mary));
check("FMP census / parish entries untouched by the scope (no keywordsplace, their sourcecountry as before)", !fmpRest(charles).some((x) => /^(Census|Parish records)$/.test(x.group) && /keywordsplace/.test(x.url)) && fmpRest(charles).filter((x) => /^(Census|Parish records)$/.test(x.group)).every((x) => /sourcecountry=england/.test(x.url)));

// 13. v0.2.118 — CIVIL DEATHS & BURIALS (Kevin's findmypast.com URL, 2026-10-26, Thomas Gourley Park
//     d. 1985 Stoke-on-Trent) + the host moved to findmypast.com (his account lives there).
const kevinCivil = "https://www.findmypast.com/search/results?sourcecategory=life+events+%28bmds%29&collection=civil+deaths+%26+burials&sid=102&firstname=thomas+gourley&firstname_variants=true&lastname=park&yearofdeath=1985&yearofdeath_offset=2&keywordsplace=stoke-on-trent%2c+staffordshire%2c+england&keywordsplace_proximity=5&sourcecountry=great+britain";
const decoded = (u) => decodeURIComponent(u.replace(/\+/g, " ")).toLowerCase();
const thomasK = { ...thomasU, deathYear: "1985", deathPlace: "Stoke-on-Trent, Staffordshire, England", facts: [], attachedSources: null };
let cv = fmpRest(thomasK).filter((x) => x.group === "Civil records");
check("FMP civil deaths (known death) = Kevin's URL once decoded — ours adds the birth year ±2 and sends the first given name only",
  cv.length === 1 && cv[0].label === "Civil deaths & burials — Thomas Park, 1985 ±2" && decoded(cv[0].url) === decoded(kevinCivil).replace("thomas gourley", "thomas").replace("yearofdeath_offset=2&", "yearofdeath_offset=2&yearofbirth=1880&yearofbirth_offset=2&"), cv[0] && cv[0].url);
check("FMP civil deaths: the raw URL keeps FMP's own category / collection / sid bytes and the host is findmypast.com", /^https:\/\/www\.findmypast\.com\/search\/results\?sourcecategory=life\+events\+%28bmds%29&collection=civil\+deaths\+%26\+burials&sid=102&firstname=Thomas&/.test(cv[0].url) && /&sourcecountry=great\+britain$/.test(cv[0].url), cv[0].url);
check("FMP civil deaths: tooltip names the index, the discriminator and the Where box", /England & Wales death index/.test(cv[0].tooltip) && /born 1880 ±2 \(the discriminator\)/.test(cv[0].tooltip) && /Where box/.test(cv[0].tooltip), cv[0].tooltip);
check("FMP groups: Civil records sits between Census and Parish records", JSON.stringify([...new Set(fmpRest(thomasK).map((x) => x.group))]) === JSON.stringify(["All records", "Census", "Civil records", "Parish records"]), JSON.stringify([...new Set(fmpRest(thomasK).map((x) => x.group))]));
cv = fmpRest(thomasU).filter((x) => x.group === "Civil records");
check("FMP civil deaths (death year unknown): the window as yearofdeath = centre 1960 ± 40, birth ±2, NO Where box",
  cv.length === 1 && cv[0].label === "Civil deaths & burials — Thomas Park, 1939–1980 (death year unknown)" && /&yearofdeath=1960&yearofdeath_offset=40&yearofbirth=1880&yearofbirth_offset=2&sourcecountry=great\+britain$/.test(cv[0].url) && !/keywordsplace/.test(cv[0].url), cv[0] && cv[0].url);
check("FMP civil deaths (death year unknown): tooltip says what was sent", /last seen 1939 \(1939 Register\), searched 1939–1980 \(to age 100\) — sent as year of death 1960 ±40/.test(cv[0].tooltip), cv[0].tooltip);
check("FMP civil deaths: a married woman gets it under her married surname", (() => { const d = fmpRest(doris).filter((x) => x.group === "Civil records"); return d.length === 1 && d[0].label === "Civil deaths & burials — Doris Roberts, 1980 ±2" && /lastname=Roberts&yearofdeath=1980/.test(d[0].url) && /keywordsplace=bristol%2C%20england&keywordsplace_proximity=5/.test(d[0].url); })(), JSON.stringify(fmpRest(doris).filter((x) => x.group === "Civil records").map((x) => x.label)));
check("FMP civil deaths: a Welsh death still sends sourcecountry=great+britain", /sourcecountry=great\+britain$/.test(fmpRest({ ...thomasK, deathPlace: "Cardiff, Glamorgan, Wales" }).find((x) => x.group === "Civil records").url));
check("FMP civil deaths: none for a living person, a US death, or a person nothing dates", !fmp.options({ ...thomasK, living: true, deathYear: null, deathPlace: "" }).some((x) => x.group === "Civil records") && !fmp.options({ ...thomasK, deathPlace: "Boston, Massachusetts, United States", birthPlace: "Boston, Massachusetts, United States" }).some((x) => x.group === "Civil records") && !fmp.options({ ...thomasU, birthYear: null, facts: [], attachedSources: null }).some((x) => x.group === "Civil records"));
check("FMP civil deaths: no birth year → no yearofbirth pair, entry still offered", (() => { const u = fmpRest({ ...thomasK, birthYear: null }).find((x) => x.group === "Civil records").url; return !/yearofbirth/.test(u) && /yearofdeath=1985/.test(u); })());
check("FMP host: every Findmypast entry (incl. newspapers) opens findmypast.com, none .co.uk", (() => { const all = [...fmp.options(thomasK), ...FSSE.SITES.find((s) => s.id === "newspapers").options(thomasK)].map((x) => x.url); return all.filter((u) => /findmypast/.test(u)).every((u) => /^https:\/\/www\.findmypast\.com\//.test(u)) && all.some((u) => /findmypast\.com\/search\/results\?sid=100/.test(u)); })());

// 14. v0.2.120 — US and Canadian censuses on the Findmypast menu (Kevin: "ensure that the ancestry and
//     FindMyPast menus include us and canada census records"): the FamilySearch menu's bracketed years,
//     Findmypast's country filter in its own form.
const usCharles = { ...charles, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [] };
let uc = fmpRest(usCharles).filter((x) => x.group === "Census");
check("FMP US census: 1850 entry = census category + name + exact eventyear + birth ±2 + sourcecountry=united+states", uc[0].url === "https://www.findmypast.com/search/results?sourcecategory=census%2c+land+%26+surveys&collection=census&sid=102&firstname=Charles&firstname_variants=true&lastname=Bellwood&eventyear=1850&eventyear_offset=0&yearofbirth=1805&yearofbirth_offset=2&sourcecountry=united+states", uc[0] && uc[0].url);
const jamesO = { ...charles, given: "James", surname: "Owen", birthYear: "1866", birthPlace: "Benwell, Northumberland, England", deathYear: "1927", deathPlace: "Toronto, Ontario, Canada", spouseSurnames: ["Hind"], spouses: [{ name: "Mary Hind", surname: "Hind", id: "H", marriageDate: "1892", marriageYear: "1892", marriagePlace: "Benwell, Northumberland, England" }] }; // the 1892 English marriage keeps 1871–1891 English (James Emmanuel Owen KP4S-LGG)
uc = fmpRest(jamesO).filter((x) => x.group === "Census");
check("FMP Canada census: England-born, Ontario-died → E&W 1871–1921 and Canada 1901–1921 (bracketing), Canada with sourcecountry=canada", ["1901", "1911", "1921"].every((y) => uc.some((x) => x.label === `${y} Canada Census — James Owen` && /sourcecountry=canada$/.test(x.url))) && uc.some((x) => x.label === "1871 E&W Census — James Owen") && !uc.some((x) => /^1891 Canada Census/.test(x.label)), uc.map((x) => x.label).join(" | "));
const normanO = { ...charles, given: "Norman", surname: "Owen", birthYear: "1908", birthPlace: "Stanley, Durham, England", deathYear: "1978", deathPlace: "Red Deer, Alberta, Canada", spouseSurnames: ["Smith"], spouses: [{ name: "Jane Smith", surname: "Smith", id: "S", marriageDate: "1929", marriageYear: "1929", marriagePlace: "Calgary, Alberta, Canada" }] };
uc = fmpRest(normanO).filter((x) => x.group === "Census");
check("FMP Canada census: Norman (m. 1929 Calgary) → 1911/1921 E&W + Canada, 1931 Canada only, the 1926 prairie (a provincial set) skipped", uc.some((x) => x.label === "1931 Canada Census — Norman Owen") && uc.some((x) => x.label === "1921 E&W Census — Norman Owen") && uc.some((x) => x.label === "1921 Canada Census — Norman Owen") && !uc.some((x) => /1926/.test(x.label)) && !uc.some((x) => /1939/.test(x.label)), uc.map((x) => x.label).join(" | "));
check("FMP census list stays in year order with E&W / Ireland entries unchanged", (() => { const l = fmpRest(charles).filter((x) => x.group === "Census").map((x) => x.label); return l.join(" | ") === "1841 E&W Census — Charles Bellwood | 1851 E&W Census — Charles Bellwood | 1861 E&W Census — Charles Bellwood | 1871 E&W Census — Charles Bellwood"; })());
check("Ancestry and Findmypast agree on the US census years for a US person (both menus, v0.2.119/120)", (() => { const a = FSSE.SITES.find((s) => s.id === "ancestry-records").options(usCharles).filter((x) => x.group === "Census").map((x) => x.label.match(/^(\d{4})/)[1]); const f = fmpRest(usCharles).filter((x) => x.group === "Census").map((x) => x.label.match(/^(\d{4})/)[1]); return JSON.stringify(a) === JSON.stringify(f) && a.length === 3; })());

// 15. v0.2.121 — MYHERITAGE CENSUS GROUP (Kevin: the US census returns, "Canada as well please if they
//     are present on MyHeritage.com"): Sourcer's collection paths, the master query, the shared
//     bracketing; E&W + Scotland ride along since the table has them.
let mc = mhRest(usCharles).filter((x) => x.group === "Census");
check("MH US census: 1850 entry = collection-10126 path + the master query + name/birth/death events", mc.map((x) => x.label).join(" | ") === "1850 US Federal Census — Charles Bellwood | 1860 US Federal Census — Charles Bellwood | 1870 US Federal Census — Charles Bellwood" && mc[0].url === "https://www.myheritage.com/research/collection-10126/1850-united-states-federal-census?s=1&formId=master&formMode=1&useTranslation=1&exactSearch=&p=1&action=query&view_mode=card&qname=Name+fn.Charles+fnmo.1+ln.Bellwood+lnmsrs.false+g.M&qevents-event1=Event+et.birth+ey.1805&qevents-any/1event_1=Event+et.death+ey.1879&qevents=List", mc.map((x) => x.label).join(" | ") + " || " + (mc[0] && mc[0].url));
mc = mhRest(jamesO).filter((x) => x.group === "Census");
check("MH Canada census: England-born (m. 1892 England), Ontario-died → E&W 1871–1891, both 1901–1911, Canada 1921 (MyHeritage has no 1921 E&W)", mc.map((x) => x.label).join(" | ") === "1871 E&W Census — James Owen | 1881 E&W Census — James Owen | 1891 E&W Census — James Owen | 1901 Canada Census — James Owen | 1901 E&W Census — James Owen | 1911 Canada Census — James Owen | 1911 E&W Census — James Owen | 1921 Canada Census — James Owen" && /collection-10690\/1921-canada-census\?s=1/.test(mc.at(-1).url), mc.map((x) => x.label).join(" | "));
mc = mhRest(doris).filter((x) => x.group === "Census");
check("MH E&W census: Doris 1901/1911 under Hiscocks, 1939 Register under Roberts (collection-10678), 1921 absent", mc.map((x) => x.label).join(" | ") === "1901 E&W Census — Doris Hiscocks | 1911 E&W Census — Doris Hiscocks | 1939 E&W Register — Doris Roberts" && /collection-10678\/1939-register-of-england-wales\?s=1.*ln\.Roberts/.test(mc[2].url), mc.map((x) => x.label).join(" | "));
const margaretM = { ...charles, given: "Margaret", surname: "Gowans", sex: "Female", marriedSurnames: [], spouseSurnames: [], spouses: [], birthYear: "1868", birthPlace: "Scotland", deathYear: "1962", deathPlace: "Pittsburgh, Pennsylvania, United States" };
mc = mhRest(margaretM).filter((x) => x.group === "Census");
check("MH Scotland + US: Scotland 1871–1901 (collection-10975 for 1901) and US 1870–1950, no Scotland 1911, no 1890", mc.some((x) => x.label === "1901 Scotland Census — Margaret Gowans" && /collection-10975\//.test(x.url)) && mc.some((x) => x.label === "1950 US Federal Census — Margaret Gowans" && /collection-11006\//.test(x.url)) && !mc.some((x) => /1911|1890/.test(x.label)), mc.map((x) => x.label).join(" | "));
check("MH groups: All records · Census · Family trees for a person with censuses; All records · Family trees without", JSON.stringify([...new Set(mh.options(doris).map((x) => x.group))]) === JSON.stringify(["All records", "Census", "Family trees"]) && JSON.stringify([...new Set(mh.options(mary).map((x) => x.group))]) === JSON.stringify(["All records", "Family trees"]));
check("MH describe counts the censuses", /the all-records search within England, 3 censuses/.test(mh.describe(doris)), mh.describe(doris));
check("MH census: the ID-only person and a Germany-only person get none", !mh.options({ id: "X", spouses: [], marriedSurnames: [], nativeRows: { "mh-records": true } }).some((x) => x.group === "Census") && !mh.options({ ...mary, birthPlace: "Berlin, Germany", deathPlace: "Hamburg, Germany" }).some((x) => x.group === "Census"));
check("the three partner menus agree on the US census years for Adam-like US person", (() => { const yrs = (id) => FSSE.SITES.find((s) => s.id === id).options(usCharles).filter((x) => x.group === "Census").map((x) => x.label.match(/^(\d{4})/)[1]).filter((y, i, a) => a.indexOf(y) === i); return JSON.stringify(yrs("mh-records")) === JSON.stringify(yrs("fmp-records")) && JSON.stringify(yrs("fmp-records")) === JSON.stringify(yrs("ancestry-records")); })());

// 16. v0.2.122 — Findmypast has NO index to the 1950 US census (browsable images only — Kevin): the
//     year is skipped on the Findmypast menu alone; Ancestry and MyHeritage index it and keep it.
const late = { ...usCharles, birthYear: "1900", deathYear: "1980", spouseSurnames: [], spouses: [] };
check("FMP: no 1950 US census entry (image-only set); 1940 still there", (() => { const l = fmpRest(late).filter((x) => x.group === "Census").map((x) => x.label); return l.includes("1940 US Federal Census — Charles Bellwood") && !l.some((x) => /1950/.test(x)); })(), fmpRest(late).filter((x) => x.group === "Census").map((x) => x.label).join(" | "));
check("Ancestry and MyHeritage keep the indexed 1950 US census", FSSE.SITES.find((s) => s.id === "ancestry-records").options(late).some((x) => x.label === "1950 US Federal Census — Charles Bellwood") && mhRest(late).some((x) => x.label === "1950 US Federal Census — Charles Bellwood"));

// 17. v0.2.123 — UNIFORM CENSUS TITLES (Kevin: "add uniformity to the Census menus provided for each
// website including FamilySearch"): every menu labels a census "<year> <Where> Census — <name>"
// (1939: "<year> E&W Register — <name>") from one shared table; only the name form differs by
// menu convention (full given names on FamilySearch / Ancestry, the first given on MyHeritage /
// Findmypast), and Ancestry's split E&W sets say "England" / "Wales" — each set covers one country.
{
  const fsSite = FSSE.SITES.find((s) => s.id === "fs-records");
  const anc = FSSE.SITES.find((s) => s.id === "ancestry-records");
  const cen = (list) => list.filter((x) => x.group === "Census").map((x) => x.label);
  const fsL = cen(fsSite.options(charles));
  const ancL = cen(anc.options(charles));
  const mhL = cen(mhRest(charles));
  const fmpL = cen(fmpRest(charles));
  check("uniform: FamilySearch, MyHeritage and Findmypast read identically for Charles (1841–1871 E&W Census — Charles Bellwood)", fsL.join(" | ") === "1841 E&W Census — Charles Bellwood | 1851 E&W Census — Charles Bellwood | 1861 E&W Census — Charles Bellwood | 1871 E&W Census — Charles Bellwood" && mhL.join(" | ") === fsL.join(" | ") && fmpL.join(" | ") === fsL.join(" | "), [fsL, mhL, fmpL].map((l) => l.join(" | ")).join("\n"));
  check("uniform: Ancestry differs only in the England word (its set is England-only)", ancL.join(" | ") === fsL.join(" | ").replace(/E&W Census/g, "England Census"), ancL.join(" | "));
  const title = (l) => l.split(" — ")[0];
  const dorisT = { fs: cen(fsSite.options(doris)).map(title), anc: cen(anc.options(doris)).map(title), mh: cen(mhRest(doris)).map(title), fmp: cen(fmpRest(doris)).map(title) };
  check("uniform: the 1939 Register reads \"1939 E&W Register\" on every menu that offers it", ["fs", "anc", "mh", "fmp"].every((k) => dorisT[k].includes("1939 E&W Register")), JSON.stringify(dorisT));
  check("uniform: no menu says \"census (\" or \"England & Wales Census\" any more", ![...fsL, ...ancL, ...mhL, ...fmpL, ...Object.values(dorisT).flat()].some((l) => /census \(|England & Wales Census|\bcensus\b/.test(l)));
  const usT = { anc: cen(anc.options(usCharles)).map(title), mh: cen(mhRest(usCharles)).map(title), fmp: cen(fmpRest(usCharles)).map(title), fs: cen(fsSite.options(usCharles)).map(title) };
  // (the FamilySearch menu also offers Boston's Massachusetts state censuses — a sub-region title, not a federal one)
  const fed = (t) => t.filter((x) => !/State Census$/.test(x));
  check("uniform: the US census reads \"<year> US Federal Census\" on all four menus, the same years", Object.values(usT).every((t) => fed(t).length === 3 && fed(t).every((x) => /^\d{4} US Federal Census$/.test(x))) && usT.fs.includes("1855 Massachusetts State Census"), JSON.stringify(usT));
  check("uniform: the name form stays by menu convention (Ancestry full given names, MyHeritage / Findmypast the first)", cen(anc.options(doris))[0].endsWith("— Doris Annie Hiscocks") && cen(mhRest(doris))[0].endsWith("— Doris Hiscocks") && cen(fmpRest(doris))[0].endsWith("— Doris Hiscocks"));
}

// 18. v0.2.133 — the regional host setting ("Findmypast opens on"): every Findmypast URL we build
// moves with it (all records, censuses, civil deaths, parish records); MyHeritage is untouched.
{
  FSSE.settings = { loaded: true, get: (k) => (k === "host.findmypast" ? "findmypast.ie" : undefined) };
  const ieOpts = fmp.options(doris);
  check("settings: host.findmypast = findmypast.ie → every Findmypast URL opens on www.findmypast.ie", ieOpts.length > 5 && ieOpts.every((x) => /^https:\/\/www\.findmypast\.ie\/search\/results/.test(x.url)) && FSSE.findmypastHost() === "https://www.findmypast.ie", ieOpts.filter((x) => !/findmypast\.ie/.test(x.url)).map((x) => x.url).join(" | "));
  check("settings: MyHeritage URLs are untouched by it", mh.options(doris).every((x) => /^https:\/\/www\.myheritage\.com\//.test(x.url)));
  delete FSSE.settings;
  check("settings: nothing stored → every Findmypast URL on findmypast.com as before", fmp.options(doris).every((x) => /^https:\/\/www\.findmypast\.com\//.test(x.url)) && FSSE.findmypastHost() === "https://www.findmypast.com");
}

process.exit(fails ? 1 : 0);
