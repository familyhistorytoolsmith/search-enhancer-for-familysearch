// sp.test.js — the ScotlandsPeople menu (v0.2.52): Scotland gating, the statutory/OPR 1855
// split, censuses 1841–1921 with Scotland bracketing, the element-id payloads, and the fill
// script. Run: node tests/run.js sp
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/KHJX-Y4T", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const { parseParams, fill, holdNotice } = require(path.join(SRC, "sp-fill.js"));
const site = FSSE.SITES.find((s) => s.id === "scotlandspeople");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);
// Decode an entry's hash payload → { path, fields }.
const payload = (url) => JSON.parse(decodeURIComponent(url.split("#fsse=")[1]));
const SUR = "edit-search-params-nrs-surname";
const FORE = "edit-search-params-nrs-forename";
const YF = "edit-search-params-nrs-search-year-year-from";
const YT = "edit-search-params-nrs-search-year-year-to";
const OYF = "edit-search-params-nrs-year-field-year-from";
const OYT = "edit-search-params-nrs-year-field-year-to";
const MMN = "edit-search-params-nrs-mmsurname";

// 1. Registry shape.
check("scotlandspeople site exists with options()", !!site && typeof site.options === "function");
check("custom icon (our saltire badge, never SP's logo)", site.icon === "icons/sp32.png", site.icon);
check("anchors after the GRO Index row (both caret states)", site.anchorLabel[0] === "GRO Index ▸" && site.anchorLabel[1] === "GRO Index ▾" && site.position === "after");

// 2. James Sidney Owen KHJX-Y4T: b. 1896 Hamilton (Scotland), m. 1919 England (Cummins),
//    m. 1965 no place (Dootson), d. 1976 Canada.
const james = {
  id: "KHJX-Y4T", given: "James Sidney", surname: "Owen", sex: "Male", living: false, fullName: "James Sidney Owen",
  birthYear: "1896", birthPlace: "Hamilton, Lanark, Scotland",
  christeningYear: "1896", christeningPlace: "Barnsley, Yorkshire, England",
  deathYear: "1976", deathPlace: "Kingston, Ontario, Canada", burialYear: "1977", burialPlace: "Alberta, Canada",
  spouseSurnames: ["Cummins", "Dootson"], marriedSurnames: [],
  spouses: [
    { name: "Jane Cummins", surname: "Cummins", id: "A", marriageDate: "1919", marriageYear: "1919", marriagePlace: "Elswick, Northumberland, England" },
    { name: "Mary Dootson", surname: "Dootson", id: "B", marriageDate: "1965", marriageYear: "1965", marriagePlace: "" },
  ],
};
let o = opts(james);
console.log("James:", o.map((x) => x.label).join(" | "));
let pl = payload(o.find((x) => x.group === "Births").url);
check("stat births 1894–1898, sex-m radio, first forename only",
  pl.path === "statutory-records/stat-births" && pl.fields[YF] === 1894 && pl.fields[YT] === 1898 &&
  pl.fields[SUR] === "Owen" && pl.fields[FORE] === "James" && pl.fields["edit-search-params-nrs-sex-m"] === true, JSON.stringify(pl));
check("no OPR births (1894 > 1855)", o.filter((x) => x.group === "Births").length === 1, o.map((x) => x.label).join(" | "));
const marr = o.filter((x) => x.group === "Marriages");
check("English 1919 marriage skipped; placeless 1965 falls back to the Scottish birth", marr.length === 1 && /Dootson/.test(marr[0].label), o.map((x) => x.label).join(" | "));
pl = payload(marr[0].url);
check("stat marriage 1963–1967 with spouse fields and the 1/2 sex radio",
  pl.path === "statutory-records/stat-marriages" && pl.fields[YF] === 1963 && pl.fields[YT] === 1967 &&
  pl.fields["edit-search-params-nrs-spsurname"] === "Dootson" && pl.fields["edit-search-params-nrs-spforename"] === "Mary" &&
  pl.fields["edit-search-params-nrs-sex-1"] === true && pl.fields["edit-search-params-nrs-sex-m"] == null, JSON.stringify(pl));
check("Canadian death → no Deaths group", !o.some((x) => x.group === "Deaths"));
const censusYears = o.filter((x) => x.group === "Census").map((x) => x.label);
check("census = 1901 + 1911 (Scotland-bracketed), no 1921 (England/Canada brackets)",
  censusYears.length === 2 && /1901/.test(censusYears[0]) && /1911/.test(censusYears[1]), censusYears.join(" | "));
check("1911 tooltip notes FamilySearch lacks it", /FamilySearch has no Scottish 1911/.test(o.find((x) => /1911/.test(x.label)).tooltip));

// 3. OPR-era person: b. 1803, m. 1831 (Stephenson), d. 1879, all Edinburgh.
const auld = {
  id: "X", given: "Charles", surname: "Bell", sex: "Male", living: false, fullName: "Charles Bell",
  birthYear: "1803", birthPlace: "Edinburgh, Midlothian, Scotland", deathYear: "1879", deathPlace: "Edinburgh, Scotland",
  spouseSurnames: ["Stephenson"], marriedSurnames: [],
  spouses: [{ name: "Margaret Stephenson", surname: "Stephenson", id: "M", marriageDate: "1831", marriageYear: "1831", marriagePlace: "Edinburgh, Scotland" }],
};
o = opts(auld);
console.log("Auld:", o.map((x) => x.label).join(" | "));
pl = payload(o.find((x) => x.group === "Births").url);
check("pre-1855 birth → OPR only, year-field ids", pl.path.endsWith("opr-births") && pl.fields[OYF] === 1801 && pl.fields[OYT] === 1805 && o.filter((x) => x.group === "Births").length === 1, JSON.stringify(pl));
pl = payload(o.find((x) => x.group === "Marriages").url);
check("1831 marriage → OPR only, spouse in the spouse-name field",
  pl.path.endsWith("opr-marriages") && pl.fields["edit-search-params-nrs-motherspousename"] === "Stephenson" && pl.fields[OYF] === 1829, JSON.stringify(pl));
const deaths = o.filter((x) => x.group === "Deaths");
pl = payload(deaths[0].url);
check("1879 death → statutory only with age 76 ±10", deaths.length === 1 && pl.path.endsWith("stat-deaths") &&
  pl.fields["edit-search-params-hss-age-age-from"] === 66 && pl.fields["edit-search-params-hss-age-age-to"] === 86, JSON.stringify(pl));
check("census 1841–1871 offered (all-Scottish timeline)", o.filter((x) => x.group === "Census").length === 4, o.map((x) => x.label).join(" | "));

// 4. The 1855 straddle: born 1854 → BOTH statutory (1855–1856) and OPR (1852–1855) births.
o = opts({ ...auld, birthYear: "1854", deathYear: null, deathPlace: "", living: true, spouses: [], spouseSurnames: [] });
const births = o.filter((x) => x.group === "Births").map((x) => payload(x.url));
check("1854 birth straddles: stat 1855–1856 + OPR 1852–1855", births.length === 2 &&
  births.some((b) => b.path.endsWith("stat-births") && b.fields[YF] === 1855 && b.fields[YT] === 1856) &&
  births.some((b) => b.path.endsWith("opr-births") && b.fields[OYF] === 1852 && b.fields[OYT] === 1855),
  JSON.stringify(births));

// 5. Woman who left Scotland: b. 1868 Paisley, m. 1888 Young in the US, d. 1962 Pittsburgh.
const margaret = {
  id: "Y", given: "Margaret Russell", surname: "Gowans", sex: "Female", living: false, fullName: "Margaret Russell Gowans",
  birthYear: "1868", birthPlace: "Paisley, Renfrewshire, Scotland", deathYear: "1962", deathPlace: "Pittsburgh, Pennsylvania, United States",
  spouseSurnames: ["Young"], marriedSurnames: ["Young"],
  spouses: [{ name: "John Young", surname: "Young", id: "Z", marriageDate: "1888", marriageYear: "1888", marriagePlace: "Pittsburgh, Pennsylvania, United States" }],
};
o = opts(margaret);
console.log("Margaret:", o.map((x) => x.label).join(" | "));
pl = payload(o.find((x) => x.group === "Births").url);
check("stat births 1866–1870 with sex-f and mother's maiden name absent", pl.fields[YF] === 1866 && pl.fields["edit-search-params-nrs-sex-f"] === true && pl.fields[MMN] == null, JSON.stringify(pl));
check("US marriage and US death → no Marriages/Deaths groups", !o.some((x) => x.group === "Marriages") && !o.some((x) => x.group === "Deaths"));
const mCensus = o.filter((x) => x.group === "Census");
check("census 1871 + 1881 only (post-1888 years bracket to the US)", mCensus.length === 2 && /1871/.test(mCensus[0].label) && /1881/.test(mCensus[1].label), mCensus.map((x) => x.label).join(" | "));
check("census searched under the maiden name (unmarried until 1888)", payload(mCensus[0].url).fields[SUR] === "Gowans" && payload(mCensus[1].url).fields[SUR] === "Gowans");

// 6. Mother's maiden name on statutory births AND deaths when the tree knows the mother.
const glasgow = {
  id: "S", given: "Stephen", surname: "Hind", sex: "Male", living: false, fullName: "Stephen Hind",
  birthYear: "1944", birthPlace: "Glasgow, Scotland", deathYear: "1992", deathPlace: "Glasgow, Scotland",
  spouses: [], spouseSurnames: [], marriedSurnames: [], mother: { name: "Sarah Jones", given: "Sarah", surname: "Jones" },
};
o = opts(glasgow);
console.log("Glasgow:", o.map((x) => x.label).join(" | "));
check("stat births send the mother's maiden surname", payload(o.find((x) => x.group === "Births").url).fields[MMN] === "Jones");
pl = payload(o.find((x) => x.group === "Deaths").url);
check("stat deaths send age 48 ±10 AND the mother's maiden surname", pl.fields[MMN] === "Jones" && pl.fields["edit-search-params-hss-age-age-from"] === 38 && pl.fields["edit-search-params-hss-age-age-to"] === 58, JSON.stringify(pl));
const inferred = o.find((x) => x.group === "Marriages");
pl = payload(inferred.url);
check("spouse-less person → one unfiltered inferred marriage search 1962–1974 (v0.2.51 rule)",
  pl.path.endsWith("stat-marriages") && pl.fields[YF] === 1962 && pl.fields[YT] === 1974 &&
  pl.fields["edit-search-params-nrs-spsurname"] == null && /no spouse/.test(inferred.tooltip), JSON.stringify(pl));
check("no census entries after 1921 (b. 1944 → none)", !o.some((x) => x.group === "Census"));

// 7. Gating.
check("E&W-only person → no entries, applies false",
  opts({ ...glasgow, birthPlace: "Bristol, England", deathPlace: "Bristol, England", mother: null }).length === 0 &&
  site.applies({ ...glasgow, birthPlace: "Bristol, England", deathPlace: "Bristol, England", mother: null }) === false);
check("living → no Deaths group", !opts({ ...glasgow, living: true, deathYear: null, deathPlace: "" }).some((x) => x.group === "Deaths"));
o = opts({ ...glasgow, sex: "" });
check("unknown sex → entries still offered, just no sex radio", o.length > 0 && Object.keys(payload(o[0].url).fields).every((k) => !/-sex-/.test(k)));
check("describe mentions the login + submit", /ScotlandsPeople login/.test(site.describe(glasgow)) && /submits it/.test(site.describe(glasgow)), site.describe(glasgow));

// 8. The fill script: parser + element-id filling on a fake document.
const params = { path: "statutory-records/stat-births", fields: { [SUR]: "Hind", [FORE]: "Stephen", "edit-search-params-nrs-sex-m": true, [YF]: 1942, [YT]: 1946 } };
const hash = "#fsse=" + encodeURIComponent(JSON.stringify(params));
check("parseParams round-trip", JSON.stringify(parseParams(hash)) === JSON.stringify(params));
check("parseParams: no marker → null", parseParams("#other=1") === null);
check("parseParams: bad json → null", parseParams("#fsse=%7Bnope") === null);
check("parseParams: missing path/fields → null",
  parseParams("#fsse=" + encodeURIComponent('{"path":"x"}')) === null && parseParams("#fsse=" + encodeURIComponent('{"fields":{}}')) === null);
const els = {
  [SUR]: { type: "text", value: "" },
  [FORE]: { type: "text", value: "" },
  "edit-search-params-nrs-sex-m": { type: "radio", checked: false },
  [YF]: { type: "text", value: "" },
};
const doc = { getElementById: (id) => els[id] || null };
const r = fill(doc, params.fields);
check("fill: sets text values and checks the radio; reports the missing id",
  r.set === 4 && r.missing.length === 1 && r.missing[0] === YT &&
  els[SUR].value === "Hind" && els[FORE].value === "Stephen" && els["edit-search-params-nrs-sex-m"].checked === true && els[YF].value === "1942",
  JSON.stringify(r));
check("fill: nothing matches → set 0", fill({ getElementById: () => null }, params.fields).set === 0);
// v0.2.73: an RM marriages template (birth→death span) run on a person with no death year
// leaves `"…year-to":}` — the slot now parses as null and fill() leaves that box alone.
const openEnd = parseParams("#fsse=" + encodeURIComponent(`{"path":"statutory-records/stat-marriages","fields":{"${SUR}":"Hind","${FORE}":"Daniel","${YF}":1825,"${YT}":}}`));
check("parseParams: empty year-to slot (RM, no death year) parses with null",
  !!openEnd && openEnd.fields[YF] === 1825 && openEnd.fields[YT] === null, JSON.stringify(openEnd));
const openEls = { [SUR]: { type: "text", value: "" }, [FORE]: { type: "text", value: "" }, [YF]: { type: "text", value: "" }, [YT]: { type: "text", value: "" } };
const openR = fill({ getElementById: (id) => openEls[id] || null }, openEnd.fields);
check("fill: null year-to skipped — box stays blank, not 'null'; 3 fields set, none missing",
  openR.set === 3 && openR.missing.length === 0 && openEls[YF].value === "1825" && openEls[YT].value === "", JSON.stringify(openR) + JSON.stringify(openEls));

// 9. Name-matching radios stay at SP's default (v0.2.54 — Kevin reverted v0.2.53's phonetic
// surname after the 1881 census flooded with soundex matches; he flips the radio manually).
// The fill script's so:-key mechanism stays supported for any future per-entry variant.
o = opts(glasgow);
check("no search-option keys sent — SP's default (exact) applies", o.every((x) => Object.keys(payload(x.url).fields).every((k) => !k.startsWith("so:"))), JSON.stringify(payload(o[0].url).fields));
check("tooltip points at SP's refine options for stubborn searches", /fuzzy\/phonetic/.test(o[0].tooltip), o[0].tooltip);
const soRadios = [
  { type: "radio", value: "exact", checked: false },
  { type: "radio", value: "fuzzy", checked: false },
  { type: "radio", value: "soundex", checked: false },
];
const soWrapper = { querySelectorAll: () => soRadios };
const surInput = { type: "text", value: "", closest: (sel) => (sel === "div.so-wrapper" ? soWrapper : null) };
const soDoc = { getElementById: (id) => (id === SUR ? surInput : null) };
let sr = fill(soDoc, { [SUR]: "Gourley", ["so:" + SUR]: "soundex" });
check("fill: checks the soundex radio in the so-wrapper", sr.set === 2 && soRadios[2].checked === true && soRadios[0].checked === false && surInput.value === "Gourley", JSON.stringify(sr));
sr = fill({ getElementById: (id) => (id === SUR ? { type: "text", value: "" } : null) }, { ["so:" + SUR]: "soundex" });
check("fill: missing so-wrapper → reported missing, nothing set", sr.set === 0 && sr.missing[0] === "so:" + SUR, JSON.stringify(sr));

// v0.2.75 — holdNotice: held only when the payload carries year fields and ALL are empty.
const Y_FROM = "edit-search-params-nrs-search-year-year-from", Y_TO = "edit-search-params-nrs-search-year-year-to";
const noYearsSp = parseParams("#fsse=" + encodeURIComponent('{"path":"statutory-records/stat-births","fields":{"' + SUR + '":"Brain","' + Y_FROM + '":,"' + Y_TO + '":}}'));
check("holdNotice: stat-births with both year boxes empty → held, names the birth year", noYearsSp !== null && /no birth year/.test(holdNotice(noYearsSp)) && /press Search/.test(holdNotice(noYearsSp)), holdNotice(noYearsSp || {}));
check("holdNotice: stat-deaths → names the death year", /no death year/.test(holdNotice({ path: "statutory-records/stat-deaths", fields: { [Y_FROM]: null, [Y_TO]: "" } })));
check("holdNotice: stat-marriages → 'birth or death year'", /no birth or death year/.test(holdNotice({ path: "statutory-records/stat-marriages", fields: { [Y_FROM]: null, [Y_TO]: null } })));
check("holdNotice: church form year-field ids are recognised", typeof holdNotice({ path: "church-registers/church-births-baptisms/opr-births", fields: { "edit-search-params-nrs-year-field-year-from": null, "edit-search-params-nrs-year-field-year-to": null } }) === "string");
check("holdNotice: one known bound (open-ended marriage span) → null, submits", holdNotice(openEnd) === null);
check("holdNotice: census payload (no year fields) → never held", holdNotice({ path: "census-returns/census", fields: { [SUR]: "Gourley", "edit-search-params-nrs-census-year-1881": true } }) === null);

// v0.2.107 — DEATH YEAR UNKNOWN: the inferred window goes into each death tier's year boxes
// (OPR to 1855, statutory from 1855); the statutory age range = the window's ages.
const AGE_FROM = "edit-search-params-hss-age-age-from", AGE_TO = "edit-search-params-hss-age-age-to";
const angusU = {
  id: "A1", given: "Angus", surname: "Gourley", sex: "Male", living: false, fullName: "Angus Gourley",
  birthYear: "1880", birthPlace: "Glasgow, Lanarkshire, Scotland", deathYear: null, deathPlace: "",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  facts: [{ kind: "Residence", year: "1921", place: "Glasgow, Scotland", text: "" }],
  mother: { name: "Jane Gowans", given: "Jane", surname: "Gowans" },
};
const sU = opts(angusU).filter((x) => x.group === "Deaths");
check("unknown death: one statutory deaths entry over the window, no OPR (window after 1855)", sU.length === 1 && sU[0].label === "SP statutory deaths — 1921–1980 (death year unknown)", JSON.stringify(sU.map((x) => x.label)));
let sfU = payload(sU[0].url).fields;
check("unknown death: year boxes = the window, age boxes = the window's ages, MMN + sex sent", payload(sU[0].url).path === "statutory-records/stat-deaths" && sfU[YF] === 1921 && sfU[YT] === 1980 && sfU[AGE_FROM] === 41 && sfU[AGE_TO] === 100 && sfU[MMN] === "Gowans" && sfU[SUR] === "Gourley" && sfU[FORE] === "Angus" && sfU["edit-search-params-nrs-sex-m"] === true, JSON.stringify(sfU));
check("unknown death: tooltip names the evidence and the ages", /death year unknown — last seen 1921 \(1921 residence\), searched 1921–1980 \(to age 100\)/.test(sU[0].tooltip) && /Age at death 41–100 sent/.test(sU[0].tooltip), sU[0].tooltip);
// Donald b. 1790, m. 1815 → window 1815–1890 straddles 1855: statutory 1855–1890 + OPR 1815–1855.
const donaldU = { ...angusU, id: "D1", given: "Donald", birthYear: "1790", facts: [], spouseSurnames: ["Reid"],
  spouses: [{ name: "Mary Reid", surname: "Reid", id: "R", marriageDate: "1815", marriageYear: "1815", marriagePlace: "Glasgow, Scotland" }] };
const sD = opts(donaldU).filter((x) => x.group === "Deaths");
check("unknown death, OPR era: statutory 1855–1890 + OPR 1815–1855", sD.length === 2 && sD[0].label === "SP statutory deaths — 1855–1890 (death year unknown)" && sD[1].label === "SP old parish burials — 1815–1855 (death year unknown)", JSON.stringify(sD.map((x) => x.label)));
sfU = payload(sD[0].url).fields;
check("unknown death, OPR era: statutory ages from the clamped window (65–100)", sfU[YF] === 1855 && sfU[YT] === 1890 && sfU[AGE_FROM] === 65 && sfU[AGE_TO] === 100, JSON.stringify(sfU));
sfU = payload(sD[1].url).fields;
check("unknown death, OPR era: OPR year-field ids, no age fields, no MMN", sfU[OYF] === 1815 && sfU[OYT] === 1855 && !(AGE_FROM in sfU) && !(MMN in sfU), JSON.stringify(sfU));
check("unknown death: no window at all → no deaths entries; living → none", opts({ ...angusU, birthYear: null, facts: [] }).filter((x) => x.group === "Deaths").length === 0 && opts({ ...angusU, living: true }).filter((x) => x.group === "Deaths").length === 0);
check("known death: James (died in Canada) still gets no SP deaths", opts(james).filter((x) => x.group === "Deaths").length === 0);

// v0.2.123 — uniform census titles: the SP census entry reads "<year> Scotland Census — <full name>"
// (the shared wording of every menu; "SP census — <year>" before), the tooltip opens with the title.
{
  const c = opts(james).filter((x) => x.group === "Census");
  check("v0.2.123 SP census labels: \"<year> Scotland Census — <name>\"", c.length > 0 && c.every((x) => /^\d{4} Scotland Census — \S/.test(x.label)) && c.some((x) => x.label.startsWith("1901 Scotland Census — ")), c.map((x) => x.label).join(" | "));
  check("v0.2.123 SP census tooltip opens with the same title", c.every((x) => x.tooltip.startsWith("ScotlandsPeople " + x.label.split(" — ")[0] + ": ")), c.map((x) => x.tooltip).join(" | "));
  check("v0.2.123 SP census under the surname of the year (Margaret: Gowans in 1871/1881)", opts(margaret).filter((x) => x.group === "Census").every((x) => / Gowans$/.test(x.label)), opts(margaret).filter((x) => x.group === "Census").map((x) => x.label).join(" | "));
}

process.exit(fails ? 1 : 0);
