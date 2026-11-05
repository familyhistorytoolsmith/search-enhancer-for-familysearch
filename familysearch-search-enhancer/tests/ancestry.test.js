// ancestry.test.js — the Ancestry Records menu (v0.2.45): country focus + priority slug,
// maiden/married variants for married women, the Public Member Trees entry, URL grammar.
// Run: node tests/run.js ancestry
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const site = FSSE.SITES.find((s) => s.id === "ancestry-records");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);
// v0.2.103: "All Results" LEADS the menu — the country / PMT checks below look at the rest.
// v0.2.119: the menu gained CENSUS / CIVIL RECORDS / PARISH RECORDS groups between the country
// entries and Public Member Trees; `rest` keeps the pre-v0.2.119 view (country entries + PMT) so
// sections 2–11 read as before, and section 12 covers the new groups.
const rest = (p) => opts(p).filter((x) => x.group === "All records").slice(1).concat(opts(p).filter((x) => x.group === "Family trees"));
const grp = (p, g) => opts(p).filter((x) => x.group === g);
const param = (url, key) => new URL(url).searchParams.get(key);

// 1. Registry shape: the PMT top-level row is gone, the menu row took its place, and the
//    FS Records row anchors on the menu row (caret included) instead of the removed PMT row.
check("ancestry-records site exists with options()", !!site && typeof site.options === "function");
check("ancestry-pmt top-level row removed", !FSSE.SITES.some((s) => s.id === "ancestry-pmt"));
check("native Ancestry row is the anchor", site.anchorLabel === "Ancestry" && site.position === "after");
const fsr = FSSE.SITES.find((s) => s.id === "fs-records");
check("fs-records falls back to the menu row (both carets; plain 'Ancestry ▸/▾' since v0.2.104)",
  fsr.anchorLabel.includes("Ancestry ▸") && fsr.anchorLabel.includes("Ancestry ▾") &&
  !fsr.anchorLabel.includes("Ancestry Collections ▸") && !fsr.anchorLabel.includes("Ancestry Public Member Trees"), JSON.stringify(fsr.anchorLabel));
check("no anchor chain in the registry still names 'Ancestry Collections'", !FSSE.SITES.some((s) => [].concat(s.anchorLabel).some((l) => /Collections/.test(l))), JSON.stringify(FSSE.SITES.map((s) => s.anchorLabel)));

// 2. Married woman, England focus → maiden + married country searches + PMT.
const doris = {
  id: "X", given: "Doris Annie", surname: "Hiscocks", sex: "Female", living: false, fullName: "Doris Annie Hiscocks",
  birthYear: "1897", birthPlace: "Fishponds, Gloucestershire, England", deathYear: "1980", deathPlace: "Bristol, England",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1920", marriageYear: "1920", marriagePlace: "Bristol, England" }],
};
let o = rest(doris);
console.log("Doris:", o.map((x) => x.label).join(" | "));
check("All Collections — <name> (b–d) leads the menu (first since v0.2.103; the label since v0.2.113)", opts(doris)[0].label === "All Collections — Doris Annie Hiscocks (1897–1980)", opts(doris)[0].label);
check("three entries after it (maiden, married, PMT)", o.length === 3, String(o.length));
check("maiden entry labeled (no Ancestry prefix since v0.2.113)", o[0].label === "England — Doris Annie Hiscocks (maiden)", o[0].label);
check("married entry labeled", o[1].label === "England — Doris Annie Roberts (married)", o[1].label);
check("PMT entry last", o[2].label === "Public Member Trees", o[2].label);
check("maiden URL grammar", o[0].url === "https://www.ancestry.com/search/?name=Doris+Annie_Hiscocks&birth=1897&death=1980&gender=f&priority=english", o[0].url);
check("married URL uses the married surname", param(o[1].url, "name") === "Doris Annie_Roberts", o[1].url);
check("PMT URL unchanged (verified grammar)", o[2].url === "https://www.ancestry.com/search/collections/1030/?name=Doris+Annie_Hiscocks&birth=1897&death=1980", o[2].url);
check("describe names the focus + maiden/married", /focused on England/.test(site.describe(doris)) && /maiden \+ married/.test(site.describe(doris)), site.describe(doris));

// 3. Man → single country entry, gender=m, no maiden/married suffix.
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [], spouses: [],
};
o = rest(charles);
check("man → two entries after All Results (country, PMT)", o.length === 2, o.map((x) => x.label).join(" | "));
check("country entry: country — name (a man gets his name, v0.2.113)", o[0].label === "England — Charles Bellwood", o[0].label);
check("gender=m sent", param(o[0].url, "gender") === "m", o[0].url);
check("priority=english sent", param(o[0].url, "priority") === "english", o[0].url);

// 4. Focus country falls through birth-first: Scotland-born, US-died → scottish.
const margaret = { ...charles, given: "Margaret", surname: "Gowans", sex: "Female", marriedSurnames: [],
  birthYear: "1868", birthPlace: "Scotland", deathYear: "1962", deathPlace: "Pittsburgh, Pennsylvania, United States" };
o = rest(margaret);
check("Scotland birth beats US death", param(o[0].url, "priority") === "scottish" && /Scotland/.test(o[0].label), o[0].label);

// 5. The enw region splits: a Welsh place → welsh.
o = rest({ ...charles, birthPlace: "Cardiff, Glamorgan, Wales" });
check("Welsh birthplace → priority=welsh, country Wales", param(o[0].url, "priority") === "welsh" && /Wales/.test(o[0].label), o[0].url);
// …but New South Wales is Australia, never Wales.
o = rest({ ...charles, birthPlace: "Sydney, New South Wales, Australia", deathPlace: "" });
check("New South Wales → australian", param(o[0].url, "priority") === "australian", o[0].label);

// 6. No recognisable country → all-countries entry, no priority param.
o = rest({ ...charles, birthPlace: "Bavaria, Germany", deathPlace: "", christeningPlace: "", burialPlace: "" });
check("unknown country → Worldwide — name", o[0].label === "Worldwide — Charles Bellwood", o[0].label);
check("no priority param sent", param(o[0].url, "priority") === null, o[0].url);

// 7. Living person / missing years: no death param; christening/burial years stand in.
o = rest({ ...charles, deathYear: null, deathPlace: "", burialYear: null, burialPlace: "", living: true });
check("living → no death param", param(o[0].url, "death") === null, o[0].url);
o = rest({ ...charles, birthYear: null, deathYear: null, christeningYear: "1805", burialYear: "1879" });
check("christening/burial years stand in", param(o[0].url, "birth") === "1805" && param(o[0].url, "death") === "1879", o[0].url);

// 8. US person → priority=usa (Kevin's example).
o = rest({ ...charles, birthPlace: "Worcester, Massachusetts, United States", deathPlace: "" });
check("US person → priority=usa", param(o[0].url, "priority") === "usa", o[0].url);

// 9. Every country the events touch gets a block (v0.2.46 — Elizabeth Swanson 9CVR-1Y1:
//    born Scotland 1868, residence facts in England, married name Holmes).
const elizabeth = {
  id: "9CVR-1Y1", given: "Elizabeth", surname: "Swanson", sex: "Female", living: false, fullName: "Elizabeth Swanson",
  birthYear: "1868", birthPlace: "Scotland", deathYear: "1920", deathPlace: "",
  spouseSurnames: ["Holmes"], marriedSurnames: ["Holmes"],
  spouses: [{ name: "John Holmes", surname: "Holmes", id: "H", marriageDate: "", marriageYear: "", marriagePlace: "" }],
  facts: [
    { kind: "Residence", year: "1891", place: "Elswick, Northumberland, England, United Kingdom", text: "" },
    { kind: "Residence", year: "1901", place: "Elswick, Northumberland, England, United Kingdom", text: "" },
    { kind: "Residence", year: "1911", place: "Elswick, Northumberland, England", text: "" },
  ],
};
o = rest(elizabeth);
console.log("Elizabeth:", o.map((x) => x.label).join(" | "));
check("five entries after All Results (2 countries × maiden/married + PMT)", o.length === 5, String(o.length));
check("Scotland block first (birth country)", /^Scotland — Elizabeth Swanson \(maiden\)$/.test(o[0].label) && /Holmes \(married\)/.test(o[1].label), o.map((x) => x.label).join(" | "));
check("England block from the residence facts", o[2].label === "England — Elizabeth Swanson (maiden)" && o[3].label === "England — Elizabeth Holmes (married)", o.map((x) => x.label).join(" | "));
check("England URLs carry priority=english", param(o[2].url, "priority") === "english" && param(o[3].url, "priority") === "english", o[2].url);
check("England married URL uses Holmes", param(o[3].url, "name") === "Elizabeth_Holmes", o[3].url);
check("duplicate-country facts dedupe (no third block)", !o.some((x, i) => i > 3 && x.group === "All records"));
check("describe names both countries", /focused on Scotland \+ England/.test(site.describe(elizabeth)), site.describe(elizabeth));
// A dated + placed marriage in a third country adds its block too.
o = rest({ ...elizabeth, spouses: [{ name: "John Holmes", surname: "Holmes", id: "H", marriageDate: "1889", marriageYear: "1889", marriagePlace: "Toronto, Ontario, Canada" }] });
check("marriage place adds Canada", o.some((x) => x.label.startsWith("Canada — ")), o.map((x) => x.label).join(" | "));

// 10. v0.2.102 — ONE Ancestry entry point (Kevin: "combine the Ancestry menu in a similar
//     fashion"): the native Ancestry row is hidden by content.js and its search lives here as
//     "All Results" — the row's own link when it has one, else our global all-countries
//     search. v0.2.103: "All Results" is the FIRST entry (Kevin: "move … to be the first
//     entry"). v0.2.104: the row is labelled plain "Ancestry" (Kevin: "rename the 'Ancestry
//     Collections' menu item to 'Ancestry'").
check("registry: replaces the native Ancestry row, label plain 'Ancestry'", JSON.stringify(site.replaces) === JSON.stringify(["Ancestry"]) && site.label === "Ancestry", JSON.stringify([site.replaces, site.label]));
check("describe opens with the plain name", new RegExp("^Ancestry — click to list " + opts(doris).length + " pre-filled Ancestry searches").test(site.describe(doris)), site.describe(doris));
check("registry: still anchored after the (now hidden) native Ancestry row, native logo kept", site.anchorLabel === "Ancestry" && site.position === "after" && !site.icon);
const nativeUrl = "https://www.ancestry.com/search/?name=Doris+Annie_Hiscocks&birth=1897_fishponds-gloucestershire-england&death=1980&gender=f&fsid=X";
o = site.options({ ...doris, nativeUrls: { "ancestry-records": nativeUrl } });
const all = o[0];
check("native link: All Collections — <name> is the FIRST entry; the country entries then PMT follow", all.label === "All Collections — Doris Annie Hiscocks (1897–1980)" && o[1].label === "England — Doris Annie Hiscocks (maiden)" && o.at(-1).label === "Public Member Trees", o.map((x) => x.label).join(" | "));
check("native link: the URL passes through byte-for-byte", all.url === nativeUrl, all.url);
check("native link: the click is still handed to the row (FS builds the URL), the read link is the reserve; tooltip says so", all.nativeClick === true && /FamilySearch's own Ancestry entry/.test(all.tooltip) && /your click is handed to it/.test(all.tooltip), all.tooltip);
check("native link: the country entries are untouched", o[1].url === "https://www.ancestry.com/search/?name=Doris+Annie_Hiscocks&birth=1897&death=1980&gender=f&priority=english");
o = site.options(doris);
const allF = o[0];
check("no native link: our global all-countries search stands in (no priority, maiden name, gender)", allF.label === "All Collections — Doris Annie Hiscocks (1897–1980)" && allF.url === "https://www.ancestry.com/search/?name=Doris+Annie_Hiscocks&birth=1897&death=1980&gender=f", allF.url);
check("no native link: tooltip says the link was not found", /all countries and collections: Doris Annie Hiscocks, born 1897, died 1980\. \(The native Ancestry search link was not found on this page/.test(allF.tooltip), allF.tooltip);
check("exactly one All Collections entry", o.filter((x) => x.label.startsWith("All Collections")).length === 1);
check("nativeUrls keyed per site: the FamilySearch row's link does not become All Results", opts({ ...doris, nativeUrls: { "fs-records": "https://www.familysearch.org/search/record/results?treeref=X" } })[0].url === allF.url);
const allLiving = site.options({ ...charles, deathYear: null, deathPlace: "", burialYear: null, burialPlace: "", living: true })[0];
check("no native link, living man: no death param, gender=m, span 1805–?", allLiving.label === "All Collections — Charles Bellwood (1805–?)" && param(allLiving.url, "death") === null && param(allLiving.url, "gender") === "m", allLiving.url);
const allId = site.options({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeUrls: { "ancestry-records": nativeUrl } });
check("native link before the name has scraped: the bare All Collections still first, PMT after it", allId[0].label === "All Collections" && /this person/.test(allId[0].tooltip) && allId.at(-1).label === "Public Member Trees", allId.map((x) => x.label).join(" | "));
check("no link and no name yet: PMT only, no All Results", !opts({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [] }).some((x) => x.label.startsWith("All Collections")));
check("describe counts every entry", new RegExp("list " + opts(doris).length + " pre-filled Ancestry searches").test(site.describe(doris)) && opts(doris).length > 4, site.describe(doris));
// v0.2.105 — present-but-link-less native row → the click is handed to it (nativeClick), the
// stand-in URL kept only as a reserve.
const allRow = site.options({ ...doris, nativeRows: { "ancestry-records": true } })[0];
check("native row, no link: All Results first with nativeClick, reserve URL = the stand-in, tooltip says the click is handed over", allRow.label === "All Collections — Doris Annie Hiscocks (1897–1980)" && allRow.nativeClick === true && allRow.url === allF.url && /FamilySearch's own Ancestry entry/.test(allRow.tooltip) && /your click is handed to it/.test(allRow.tooltip), allRow.tooltip);
const allRowId = site.options({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "ancestry-records": true } })[0];
check("native row, no link, no name: All Results still first, the bare Ancestry search as the reserve", allRowId.label === "All Collections" && allRowId.nativeClick === true && allRowId.url === "https://www.ancestry.com/search/", allRowId.url);
check("a row WITH a link: nativeClick too, the link as the reserve; no row → no nativeClick", (() => { const e = site.options({ ...doris, nativeUrls: { "ancestry-records": nativeUrl }, nativeRows: { "ancestry-records": true } })[0]; return e.nativeClick === true && e.url === nativeUrl; })() && !allF.nativeClick);
check("country entries never carry nativeClick", !site.options({ ...doris, nativeRows: { "ancestry-records": true } }).slice(1).some((x) => x.nativeClick));

// 11. v0.2.106 — group headers like the MyHeritage menu (Kevin's screenshot): ALL RECORDS over
//     All Results + the country entries, FAMILY TREES over Public Member Trees.
o = site.options(doris);
check("groups: All Results + country entries under 'All records' first, PMT under 'Family trees' last", o[0].group === "All records" && o[1].group === "All records" && o[2].group === "All records" && o.at(-1).group === "Family trees" && o.at(-1).label === "Public Member Trees", JSON.stringify(o.map((x) => `${x.group}: ${x.label}`)));
check("groups (v0.2.119): the five headers in Findmypast's order; the MyHeritage menu has All records · Census · Family trees (v0.2.121)", JSON.stringify([...new Set(o.map((x) => x.group))]) === JSON.stringify(["All records", "Census", "Civil records", "Parish records", "Family trees"]) && JSON.stringify([...new Set(FSSE.SITES.find((s) => s.id === "mh-records").options(doris).map((x) => x.group))]) === JSON.stringify(["All records", "Census", "Family trees"]), JSON.stringify([...new Set(o.map((x) => x.group))]));
check("groups: the native-row and ID-only All Results entries are grouped too", site.options({ ...doris, nativeRows: { "ancestry-records": true } })[0].group === "All records" && site.options({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "ancestry-records": true } })[0].group === "All records");

// 11. v0.2.113 — LABELS (Kevin: "please give this same treatment to the Ancestry and FindMyPast
//     menu selections" — v0.2.112's MyHeritage treatment): the native entry reads
//     "All Collections — <Full name> (b–d)" and no entry of this menu says "Ancestry".
for (const [who, px] of [["Doris", doris], ["Charles", charles], ["Elizabeth", elizabeth]]) {
  for (const extra of [{}, { nativeRows: { "ancestry-records": true } }, { nativeUrls: { "ancestry-records": nativeUrl } }]) {
    const labels = site.options({ ...px, ...extra }).map((x) => x.label);
    check(`Ancestry labels (${who}${Object.keys(extra).length ? ", " + Object.keys(extra)[0] : ""}): none starts with "Ancestry", the first reads All Collections — <name> (b–d), the last Public Member Trees`,
      !labels.some((l) => /^Ancestry/.test(l)) && /^All Collections — [A-Z][^(]+ \((\d{4}|\?)–(\d{4}|\?)\)$/.test(labels[0]) && labels.at(-1) === "Public Member Trees", labels.join(" | "));
  }
}
check("Ancestry All Collections without years: no empty parentheses", site.options({ ...charles, birthYear: null, christeningYear: null, deathYear: null, burialYear: null, nativeRows: { "ancestry-records": true } })[0].label === "All Collections — Charles Bellwood");

// 12. v0.2.119 — CENSUS / CIVIL RECORDS / PARISH RECORDS (Kevin: "expand the Ancestry menus to include
//     Census, Civil Records and Parish Records - just as we have for FindMyPast"). Ids read off the
//     collection pages' titles 2026-10-26; grammar = Sourcer's Ancestry URI builder.
const A = "https://www.ancestry.com/search/collections/";
const U = FSSE.ancestryCollectionUrl;
check("ancUrl: the full grammar — name, birth year+place, death, marriage, spouse, parents, gender", U("9841", { name: ["Doris Annie", "Hiscocks"], birth: [1897, "Fishponds, Gloucestershire, England"], death: [1980, "Bristol, England"], marriage: [1920, "Bristol, England"], spouse: ["John", "Roberts"], father: ["William", "Hiscocks"], mother: ["Sarah Jane", "Irvine"], gender: "f" }) === A + "9841/?name=Doris+Annie_Hiscocks&birth=1897_Fishponds-Gloucestershire-England&death=1980_Bristol-England&marriage=1920_Bristol-England&spouse=John_Roberts&father=William_Hiscocks&mother=Sarah+Jane_Irvine&gender=f", U("9841", { name: ["Doris Annie", "Hiscocks"], birth: [1897, "Fishponds, Gloucestershire, England"] }));
check("ancUrl: a year alone, a place alone (residence), an empty spouse, no gender", U("7619", { name: ["Charles", "Bellwood"], birth: [1805, null], residence: "York, Yorkshire, England", spouse: ["", ""] }) === A + "7619/?name=Charles_Bellwood&birth=1805&residence=_York-Yorkshire-England");
check("ancUrl: a spouse with surname only → _Surname", /&spouse=_Stephenson/.test(U("9852", { name: ["Charles", "Bellwood"], spouse: ["", "Stephenson"] })));
// Doris (b. 1897 Fishponds, m. 1920 Roberts, d. 1980 Bristol)
let cen = grp(doris, "Census");
check("Doris census: 1901 / 1911 England, 1921 England, 1939 Register — Hiscocks until 1920, Roberts after", cen.map((x) => x.label).join(" | ") === "1901 England Census — Doris Annie Hiscocks | 1911 England Census — Doris Annie Hiscocks | 1921 England Census — Doris Annie Roberts | 1939 E&W Register — Doris Annie Roberts", cen.map((x) => x.label).join(" | "));
check("Doris census: the 1911 URL = collection 2352 with name, birth year + place, gender", cen[1].url === A + "2352/?name=Doris+Annie_Hiscocks&birth=1897_Fishponds-Gloucestershire-England&gender=f", cen[1].url);
check("Doris census: 1921 → 63150, 1939 → 61596, under Roberts", /^https:\/\/www\.ancestry\.com\/search\/collections\/63150\/\?name=Doris\+Annie_Roberts&/.test(cen[2].url) && /collections\/61596\/\?name=Doris\+Annie_Roberts&/.test(cen[3].url));
let civ = grp(doris, "Civil records");
check("Doris civil: births 1837–1915, marriages 1916–2005 (spouse Roberts, 1920), deaths 1916–2007 + probate under Roberts", civ.map((x) => x.label).join(" | ") === "E&W civil births 1837–1915 — Doris Annie Hiscocks, 1897 | E&W civil marriages 1916–2005 — Doris Annie Hiscocks, spouse Roberts, 1920 | E&W civil deaths 1916–2007 — Doris Annie Roberts, 1980 | E&W probate calendar 1858–1995 — Doris Annie Roberts, 1980", civ.map((x) => x.label).join(" | "));
check("Doris civil births: 8912, year only (no place), gender", civ[0].url === A + "8912/?name=Doris+Annie_Hiscocks&birth=1897&gender=f", civ[0].url);
check("Doris civil marriages: 8753, marriage year (no place) + spouse John_Roberts", civ[1].url === A + "8753/?name=Doris+Annie_Hiscocks&marriage=1920&spouse=John_Roberts&gender=f", civ[1].url);
check("Doris civil deaths: 7579 with death + birth years, no place; probate 1904", civ[2].url === A + "7579/?name=Doris+Annie_Roberts&birth=1897&death=1980&gender=f" && civ[3].url === A + "1904/?name=Doris+Annie_Roberts&birth=1897&death=1980&gender=f", civ[2].url + " | " + civ[3].url);
let par = grp(doris, "Parish records");
check("Doris parish: baptisms (1897, Fishponds), marriages (1920 Bristol, spouse), burials under Roberts (1980 Bristol)", par.map((x) => x.label).join(" | ") === "England parish baptisms 1538–1975 — Doris Annie Hiscocks, 1897 | England parish marriages 1538–1973 — Doris Annie Hiscocks, spouse Roberts, 1920 | England parish burials 1538–1991 — Doris Annie Roberts, 1980", par.map((x) => x.label).join(" | "));
check("Doris parish URLs: 9841 birth+place, 9852 marriage+place+spouse, 9840 death+place+birth year", par[0].url === A + "9841/?name=Doris+Annie_Hiscocks&birth=1897_Fishponds-Gloucestershire-England&gender=f" && par[1].url === A + "9852/?name=Doris+Annie_Hiscocks&marriage=1920_Bristol-England&spouse=John_Roberts&gender=f" && par[2].url === A + "9840/?name=Doris+Annie_Roberts&birth=1897&death=1980_Bristol-England&gender=f", [par[0].url, par[1].url, par[2].url].join(" | "));
check("Doris: the new groups sit between the country entries and Public Member Trees", (() => { const g = opts(doris).map((x) => x.group); return g.indexOf("Census") > g.lastIndexOf("All records") && g.lastIndexOf("Parish records") < g.indexOf("Family trees"); })());
// Charles (b. 1805 Crayke, d. 1879 York, spouse surname Stephenson undated): no civil birth/marriage
// (pre-1837), civil deaths 1837–1915 + probate, censuses 1841–1871, parish trio with the inferred
// marriage window and no year.
cen = grp(charles, "Census");
check("Charles census: 1841–1871 England", cen.map((x) => x.label).join(" | ") === "1841 England Census — Charles Bellwood | 1851 England Census — Charles Bellwood | 1861 England Census — Charles Bellwood | 1871 England Census — Charles Bellwood" && /collections\/8978\//.test(cen[0].url) && /collections\/7619\//.test(cen[3].url), cen.map((x) => x.label).join(" | "));
civ = grp(charles, "Civil records");
check("Charles civil: no pre-1837 birth/marriage index; deaths 1837–1915 (8914) + probate", civ.map((x) => x.label).join(" | ") === "E&W civil deaths 1837–1915 — Charles Bellwood, 1879 | E&W probate calendar 1858–1995 — Charles Bellwood, 1879" && civ[0].url === A + "8914/?name=Charles_Bellwood&birth=1805&death=1879&gender=m", civ.map((x) => x.label).join(" | ") + " || " + (civ[0] && civ[0].url));
par = grp(charles, "Parish records");
check("Charles parish: baptism 1805 Crayke, inferred marriage with spouse _Stephenson and no year, burial 1879 York", par.map((x) => x.label).join(" | ") === "England parish baptisms 1538–1975 — Charles Bellwood, 1805 | England parish marriages 1538–1973 — Charles Bellwood, spouse Stephenson (1823–1835, inferred) | England parish burials 1538–1991 — Charles Bellwood, 1879" && par[1].url === A + "9852/?name=Charles_Bellwood&birth=1805_Crayke-Yorkshire-England&spouse=_Stephenson&gender=m" && par[2].url === A + "9840/?name=Charles_Bellwood&birth=1805&death=1879_York-Yorkshire-England&gender=m", par.map((x) => x.label).join(" | ") + " || " + (par[1] && par[1].url));
// Parents on the baptism entry (v0.2.41 parents); mother on the civil births entry.
const withParents = { ...doris, father: { name: "William Hiscocks", id: "F", given: "William", surname: "Hiscocks" }, mother: { name: "Sarah Jane Irvine", id: "M", given: "Sarah Jane", surname: "Irvine" } };
check("parents: baptism sends father + mother; civil births sends the mother (maiden name indexed)", /&father=William_Hiscocks&mother=Sarah\+Jane_Irvine&gender=f$/.test(grp(withParents, "Parish records")[0].url) && /&mother=Sarah\+Jane_Irvine&gender=f$/.test(grp(withParents, "Civil records")[0].url) && !/father=/.test(grp(withParents, "Civil records")[0].url), grp(withParents, "Parish records")[0].url);
// Scotland-born, US-died (Margaret): Scotland + US censuses, SSDI, Scotland parish baptisms, no burials set.
cen = grp(margaret, "Census");
check("Margaret census: Scotland 1871–1901 then US federal 1870–1950, interleaved by year", cen.some((x) => /1871 Scotland Census/.test(x.label) && /collections\/1104\//.test(x.url)) && cen.some((x) => /1900 US Federal Census/.test(x.label) && /collections\/7602\//.test(x.url)) && cen.some((x) => /1950 US Federal Census/.test(x.label)) && !cen.some((x) => /1890/.test(x.label)), cen.map((x) => x.label).join(" | "));
civ = grp(margaret, "Civil records");
check("Margaret civil: the SSDI for a 1962 US death (3693, birth + death years), nothing else", civ.length === 1 && civ[0].label === "US Social Security Death Index 1935–2014 — Margaret Gowans, 1962" && civ[0].url === A + "3693/?name=Margaret_Gowans&birth=1868&death=1962&gender=f", civ.map((x) => x.label).join(" | "));
par = grp(margaret, "Parish records");
check("Margaret parish: Scotland baptisms 60143 (born 1868 Scotland) + the inferred Scotland parish marriage (undated Stephenson), no Scottish burials set", par.length === 2 && /^Scotland parish baptisms 1564–1950 — Margaret Gowans, 1868$/.test(par[0].label) && /collections\/60143\/\?name=Margaret_Gowans&birth=1868_Scotland&gender=f$/.test(par[0].url) && /^Scotland parish marriages 1561–1910 — Margaret Gowans, spouse Stephenson \(1886–1898, inferred\)$/.test(par[1].label) && !par.some((x) => /burials/.test(x.label)), par.map((x) => x.label).join(" | "));
// Wales: the Welsh census set beside the English one; no England parish sets for a Welsh place.
const welsh = { ...charles, birthPlace: "Cardiff, Glamorgan, Wales", deathPlace: "Cardiff, Glamorgan, Wales" };
cen = grp(welsh, "Census");
check("Welsh person: each census year offers England AND Wales sets (1841 → 8978 + 8979)", cen.filter((x) => /^1841 /.test(x.label)).map((x) => x.label).join(" | ") === "1841 England Census — Charles Bellwood | 1841 Wales Census — Charles Bellwood" && cen.some((x) => /collections\/8979\//.test(x.url)), cen.map((x) => x.label).join(" | "));
check("Welsh person: no England parish entries, civil deaths still offered (E&W index)", grp(welsh, "Parish records").length === 0 && grp(welsh, "Civil records").some((x) => /^E&W civil deaths/.test(x.label)));
// US with a New York state census + Ireland civil + Australia / Victoria + Ontario.
const ellen = { id: "E", given: "Ellen", surname: "Hurley", sex: "Female", living: false, fullName: "Ellen Hurley", birthYear: "1864", birthPlace: "Worcester, Massachusetts, United States", deathYear: "1930", deathPlace: "Brooklyn, Kings, New York, United States", spouseSurnames: ["Bunker"], marriedSurnames: ["Bunker"], spouses: [{ name: "Charles Bunker", surname: "Bunker", id: "B", marriageDate: "1889", marriageYear: "1889", marriagePlace: "Worcester, Massachusetts, United States" }] };
cen = grp(ellen, "Census");
check("Ellen: New York state censuses 1905/1915/1925 (7364 / 2703 / 2704) beside the federal ones, under Bunker", ["1905", "1915", "1925"].every((y) => cen.some((x) => x.label === `${y} New York State Census — Ellen Bunker`)) && cen.some((x) => /collections\/7364\//.test(x.url)) && cen.some((x) => x.label === "1870 US Federal Census — Ellen Hurley"), cen.map((x) => x.label).join(" | "));
check("Ellen civil: no US civil index before the SSDI era (died 1930) → none", grp(ellen, "Civil records").length === 0, grp(ellen, "Civil records").map((x) => x.label).join(" | "));
const irish = { ...charles, given: "Bridget", surname: "Cummins", sex: "Female", birthYear: "1870", birthPlace: "Lifford, Donegal, Ireland", deathYear: "1950", deathPlace: "Lifford, Donegal, Ireland", spouseSurnames: [], spouses: [] };
civ = grp(irish, "Civil records");
check("Irish person: civil births 2573, an inferred-window marriage search (no spouse in the tree), deaths 2534; census 1901 (70667) only", civ.map((x) => x.label).join(" | ") === "Ireland civil births 1864–1958 — Bridget Cummins, 1870 | Ireland civil marriages 1845–1958 — Bridget Cummins (1888–1900, inferred) | Ireland civil deaths 1864–1958 — Bridget Cummins, 1950" && grp(irish, "Census").map((x) => x.label).join(" | ") === "1901 Ireland Census — Bridget Cummins", civ.map((x) => x.label).join(" | ") + " || " + grp(irish, "Census").map((x) => x.label).join(" | "));
const edward = { ...charles, given: "Edward", surname: "Cummings", birthYear: "1842", birthPlace: "Lifford, Donegal, Ireland", deathYear: "1922", deathPlace: "Perth, Western Australia, Australia", spouseSurnames: ["Fuller"], spouses: [{ name: "Mary Fuller", surname: "Fuller", id: "F", marriageDate: "1871", marriageYear: "1871", marriagePlace: "Cobden, Victoria, Australia" }] };
civ = grp(edward, "Civil records");
check("Edward: Australia marriages 1780 AND Victoria marriages 61649 for the 1871 Cobden marriage; Australia deaths 1779 for 1922 Perth (no Victoria)", civ.map((x) => x.label).join(" | ") === "Australia marriages 1788–1950 — Edward Cummings, spouse Fuller, 1871 | Victoria marriages 1837–1962 — Edward Cummings, spouse Fuller, 1871 | Australia deaths 1787–1985 — Edward Cummings, 1922" && /collections\/61649\/\?name=Edward_Cummings&marriage=1871&spouse=Mary_Fuller&gender=m$/.test(civ[1].url), civ.map((x) => x.label).join(" | "));
check("Edward: no census (Australia has none here), no parish (Ireland / Australia have no sets)", grp(edward, "Census").length === 0 && grp(edward, "Parish records").length === 0);
const ontario = { ...charles, given: "James", surname: "Owen", birthYear: "1866", birthPlace: "Benwell, Northumberland, England", deathYear: "1927", deathPlace: "Toronto, Ontario, Canada", spouseSurnames: [], spouses: [] };
civ = grp(ontario, "Civil records");
check("Ontario death: Ontario deaths 8946 beside nothing else Canadian; Canada censuses 1901–1921 + England ones", civ.some((x) => x.label === "Ontario deaths 1869–1953 — James Owen, 1927" && /collections\/8946\//.test(x.url)) && grp(ontario, "Census").some((x) => x.label === "1921 Canada Census — James Owen" && /collections\/8991\//.test(x.url)) && grp(ontario, "Census").some((x) => x.label === "1871 England Census — James Owen"), civ.map((x) => x.label).join(" | ") + " || " + grp(ontario, "Census").map((x) => x.label).join(" | "));
// Unknown death year (v0.2.107 window): deaths sets overlapping the window, no death year sent.
const thomasU = { id: "T", given: "Thomas Gourley", surname: "Park", sex: "Male", living: false, fullName: "Thomas Gourley Park", birthYear: "1880", birthPlace: "Bristol, Gloucestershire, England", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "", spouseSurnames: [], marriedSurnames: [], spouses: [], facts: [{ kind: "Residence", year: "1921", place: "Bristol, Gloucestershire, England", text: "" }], attachedSources: [{ title: 'Thomas Park, "England and Wales National Register, 1939"', collection: "England and Wales National Register, 1939", mentioned: false, principal: "Thomas Park", via: "fs" }] };
civ = grp(thomasU, "Civil records").filter((x) => /deaths|probate/.test(x.label));
check("unknown death: E&W civil deaths 1916–2007 + probate over the 1939–1980 window, no death year sent, birth year is", civ.map((x) => x.label).join(" | ") === "E&W civil deaths 1916–2007 — Thomas Gourley Park — 1939–1980 (death year unknown) | E&W probate calendar 1858–1995 — Thomas Gourley Park — 1939–1980 (death year unknown)" && civ[0].url === A + "7579/?name=Thomas+Gourley_Park&birth=1880&gender=m" && /last seen 1939 \(1939 Register\)/.test(civ[0].tooltip), civ.map((x) => x.label).join(" | ") + " || " + (civ[0] && civ[0].url));
check("unknown death: parish burials over the window too, no year", /^England parish burials 1538–1991 — Thomas Gourley Park — 1939–1980 \(death year unknown\)$/.test(grp(thomasU, "Parish records").find((x) => /burials/.test(x.label)).label));
// Gates: living → no death sets; no name → nothing; a child who died at 10 → no marriage entries.
check("living person: no civil deaths / probate / burials", !opts({ ...doris, living: true, deathYear: null, deathPlace: "" }).some((x) => /deaths|probate|burials/.test(x.label)));
check("ID-only person: none of the new groups", !opts({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "ancestry-records": true } }).some((x) => /^(Census|Civil records|Parish records)$/.test(x.group)));
check("died a child: no marriage entries, baptism + burial still", (() => { const o2 = opts({ ...charles, deathYear: "1815", spouseSurnames: [] }); return !o2.some((x) => /marriages/.test(x.label)) && o2.some((x) => /baptisms/.test(x.label)) && o2.some((x) => /burials/.test(x.label)); })());

// 13. v0.2.133 — the regional host setting ("Ancestry opens on"): every URL we build moves with
// it; the defaults (no FSSE.settings, or nothing stored) stay byte-identical to the checks above.
FSSE.settings = { loaded: true, get: (k) => (k === "host.ancestry" ? "ancestry.co.uk" : undefined) };
const ukOpts = opts(doris);
check("settings: host.ancestry = ancestry.co.uk → every Ancestry URL (country, census, civil, parish, PMT) opens on www.ancestry.co.uk", ukOpts.length > 10 && ukOpts.every((x) => /^https:\/\/www\.ancestry\.co\.uk\//.test(x.url)), ukOpts.filter((x) => !/ancestry\.co\.uk/.test(x.url)).map((x) => x.url).join(" | "));
check("settings: the stand-in All Collections entry of an ID-only person follows the host too", /^https:\/\/www\.ancestry\.co\.uk\/search\//.test(opts({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "ancestry-records": true } })[0].url) && FSSE.ancestryHost() === "https://www.ancestry.co.uk");
FSSE.settings = { loaded: true, get: () => undefined };
check("settings: nothing stored → ancestry.com as before", opts(doris).every((x) => /^https:\/\/www\.ancestry\.com\//.test(x.url)));
delete FSSE.settings;
check("no settings object at all → ancestry.com", FSSE.ancestryHost() === "https://www.ancestry.com" && opts(doris).every((x) => /^https:\/\/www\.ancestry\.com\//.test(x.url)));

// 14. v1.0.4 — the FamilySearch CENTER menu "Ancestry Institution" (Kevin's find at the Boise FSC,
//     2026-11-04: on a center's network FamilySearch lists a second Ancestry row whose link is its
//     Ancestry link verbatim on www.ancestryinstitution.com). The same list as the Ancestry menu on
//     that host, the native row's own link first, shown only while FamilySearch shows the row.
const inst = FSSE.SITES.find((s) => s.id === "ancestry-institution");
const FSC_URL = "https://www.ancestryinstitution.com/search?name=Charles+Richard_Hardie&birth=1906_Midland+Junction-Western+Australia-Australia&death=1988_Scarborough-Western+Australia-Australia&father=Thomas+Charles_Hardie&gender=m&marriage=1932_Western+Australia-Australia&mother=Hilda_Delaporte&spouse=Gladys+May_Cummings";
check("registry: ancestry-institution replaces and anchors on the native 'Ancestry Institution' row, native logo, listed right after ancestry-records",
  !!inst && inst.label === "Ancestry Institution" && JSON.stringify(inst.replaces) === JSON.stringify(["Ancestry Institution"]) && inst.anchorLabel === "Ancestry Institution" && inst.position === "after" && !inst.icon && FSSE.SITES.indexOf(inst) === FSSE.SITES.indexOf(site) + 1);
check("applies: only while FamilySearch lists the native row — never on an ordinary network", inst.applies(doris) === false && inst.applies({ ...doris, nativeRows: { "ancestry-records": true } }) === false && inst.applies({ ...doris, nativeRows: { "ancestry-institution": false } }) === false && inst.applies({ ...doris, nativeRows: { "ancestry-institution": true } }) === true);
const fsc = { ...doris, nativeRows: { "ancestry-records": true, "ancestry-institution": true }, nativeUrls: { "ancestry-records": nativeUrl, "ancestry-institution": FSC_URL } };
const io = inst.options(fsc);
const ao = site.options(fsc);
console.log("Institution:", io.map((x) => x.label).join(" | "));
check("the same list as the Ancestry menu: groups and labels identical, entry for entry", io.length > 10 && JSON.stringify(io.map((x) => [x.group, x.label])) === JSON.stringify(ao.map((x) => [x.group, x.label])), io.map((x) => x.label).join(" | "));
check("first entry: the Ancestry Institution row's OWN link, the click handed to it — keyed by its own site id, not the Ancestry row's",
  io[0].label === "All Collections — Doris Annie Hiscocks (1897–1980)" && io[0].nativeClick === true && io[0].url === FSC_URL && ao[0].url === nativeUrl && /FamilySearch's own Ancestry Institution entry \(hidden behind this menu\)/.test(io[0].tooltip) && /so Ancestry Institution receives exactly what FamilySearch sends/.test(io[0].tooltip), io[0].url + " || " + io[0].tooltip);
check("every other entry = the Ancestry menu's URL moved to www.ancestryinstitution.com (country, census, civil, parish, trees)",
  io.slice(1).every((x, i) => x.url === ao[i + 1].url.replace("https://www.ancestry.com/", "https://www.ancestryinstitution.com/")) && io.slice(1).every((x) => x.url.startsWith("https://www.ancestryinstitution.com/search/")),
  io.slice(1).filter((x) => !x.url.startsWith("https://www.ancestryinstitution.com/search/")).map((x) => x.url).join(" | "));
check("byte-exact on the institution host: the England maiden search, the 1911 census set, Public Member Trees",
  io[1].url === "https://www.ancestryinstitution.com/search/?name=Doris+Annie_Hiscocks&birth=1897&death=1980&gender=f&priority=english" &&
  io.find((x) => /^1911 England Census/.test(x.label)).url === "https://www.ancestryinstitution.com/search/collections/2352/?name=Doris+Annie_Hiscocks&birth=1897_Fishponds-Gloucestershire-England&gender=f" &&
  io.at(-1).label === "Public Member Trees" && io.at(-1).url === "https://www.ancestryinstitution.com/search/collections/1030/?name=Doris+Annie_Hiscocks&birth=1897&death=1980",
  [io[1].url, io.at(-1).url].join(" | "));
check("only the hand-over entry carries nativeClick", io.filter((x) => x.nativeClick).length === 1);
const instRow = inst.options({ ...doris, nativeRows: { "ancestry-institution": true } })[0];
check("row present but no readable link: the click is still handed over; the reserve is our global search on the institution host",
  instRow.nativeClick === true && instRow.url === "https://www.ancestryinstitution.com/search/?name=Doris+Annie_Hiscocks&birth=1897&death=1980&gender=f", instRow.url);
check("row present, name not scraped yet: the bare institution search as the reserve",
  (() => { const e = inst.options({ id: "X", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "ancestry-institution": true } })[0]; return e.label === "All Collections" && e.nativeClick === true && e.url === "https://www.ancestryinstitution.com/search/"; })());
check("the Ancestry menu is untouched by its neighbour: still every URL on www.ancestry.com", ao.slice(1).every((x) => x.url.startsWith("https://www.ancestry.com/")) && JSON.stringify(ao.slice(1).map((x) => x.url)) === JSON.stringify(site.options({ ...doris, nativeRows: { "ancestry-records": true }, nativeUrls: { "ancestry-records": nativeUrl } }).slice(1).map((x) => x.url)));
check("describe: names the host, counts the entries, says why it is there", new RegExp("^Ancestry Institution — click to list " + io.length + " pre-filled searches on ancestryinstitution\\.com for Doris Annie Hiscocks, focused on England \\(maiden \\+ married name searches\\)\\. The institution edition opens on a FamilySearch Center's network without an Ancestry account of your own\\.$").test(inst.describe(fsc)), inst.describe(fsc));
FSSE.settings = { loaded: true, get: (k) => (k === "host.ancestry" ? "ancestry.co.uk" : undefined) };
check("the regional setting moves the Ancestry menu only — the institution menu stays on ancestryinstitution.com",
  site.options(fsc).slice(1).every((x) => x.url.startsWith("https://www.ancestry.co.uk/")) && inst.options(fsc).slice(1).every((x) => x.url.startsWith("https://www.ancestryinstitution.com/")));
delete FSSE.settings;
check("FSSE.ancestryInstitutionOptions is the menu's builder", JSON.stringify(FSSE.ancestryInstitutionOptions(fsc)) === JSON.stringify(io));

process.exit(fails ? 1 : 0);
