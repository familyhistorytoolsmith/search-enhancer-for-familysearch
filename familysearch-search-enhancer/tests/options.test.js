// options.test.js — the FamilySearch Records menu: content-aware gating, URL grammar, attached-source marks. Run: node tests/run.js
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const site = FSSE.SITES.find((s) => s.id === "fs-records");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);
const attachedLabels = (o) => o.filter((x) => x.attached).map((x) => `${x.group}: ${x.label}`);
const find = (o, re) => o.find((x) => re.test(x.label));

// 1. Charles Bellwood-like man, FS-titled sources
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  christeningYear: "1805", christeningPlace: "Crayke, Yorkshire, England", burialYear: "1879", burialPlace: "York, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [],
  spouses: [{ name: "Margaret Stephenson", surname: "Stephenson", id: "LH18-HMW", marriageDate: "15 December 1831", marriageYear: "1831", marriagePlace: "Easingwold, Yorkshire, England" }],
  attachedSources: [
    { title: "England and Wales Census, 1851", via: "link" },
    { title: "England and Wales Census, 1871", via: "link" },
    { title: "England Marriages, 1538-1973", via: "link" },
    { title: "Find a Grave Index", via: "link" },
    { title: "England and Wales Death Registration Index, 1837-2007", via: "link" },
  ],
  attachedMeta: { count: 5, scrapedAt: Date.UTC(2026, 8, 3) },
  sourcesCount: 5,
};
let o = opts(charles);
console.log("Charles attached:", attachedLabels(o));
check("1851 census attached", find(o, /^1851/).attached === "England and Wales Census, 1851");
check("1871 census attached", !!find(o, /^1871/).attached);
check("1841 census NOT attached", !find(o, /^1841/).attached);
check("1861 census NOT attached", !find(o, /^1861/).attached);
check("parish marriage attached", !!find(o, /England parish marriages/).attached, find(o, /England parish marriages/).label);
check("parish christening NOT attached", !find(o, /England parish births/).attached);
check("GRO death attached", !!find(o, /GRO Death/).attached);
check("parish burial NOT attached", !find(o, /parish deaths & burials/).attached);
check("Find A Grave attached", !!find(o, /Find A Grave/).attached);
check("no full-text / everything entry attached", !o.some((x) => x.attached && /Full text|Everything/i.test(x.group)));
check("tooltip prefixed", /^✓ Already attached: "England and Wales Census, 1851"\./.test(find(o, /^1851/).tooltip));
check("describe counts attached", /5 already attached\./.test(site.describe(charles)), site.describe(charles));
let f = site.footer(charles);
check("footer = read state", /^✓ = already attached \(5 distinct titles read from 5 sources on/.test(f.text) && !/changed/.test(f.text), f.text);
check("footer without a count", /\(5 source titles read from the Sources tab/.test(site.footer({ ...charles, attachedMeta: { scrapedAt: 1 } }).text), site.footer({ ...charles, attachedMeta: { scrapedAt: 1 } }).text);
check("footer url = sources tab", f.url === "https://www.familysearch.org/en/tree/person/sources/LH18-4BZ", f.url);
f = site.footer({ ...charles, sourcesCount: 7 });
check("footer stale when counts differ", /sources changed since/.test(f.text), f.text);
f = site.footer({ ...charles, sourcesCount: null });
check("footer not stale when page count unknown", !/changed/.test(f.text), f.text);

// 2. No cache yet → nothing attached, footer invites
o = opts({ ...charles, attachedSources: null, attachedMeta: null });
check("null cache → no attached flags", !o.some((x) => x.attached));
check("null cache → footer invites", /^Open the Sources tab once/.test(site.footer({ ...charles, attachedSources: null }).text));
check("null cache → describe has no attached count", !/already attached/.test(site.describe({ ...charles, attachedSources: null })));
check("empty cache → footer says 0 titles", /\(0 distinct titles read from 5 sources/.test(site.footer({ ...charles, attachedSources: [] }).text), site.footer({ ...charles, attachedSources: [] }).text);

// 3. Ancestry-style titles + civil vs parish discrimination
const doris = {
  id: "X", given: "Doris Annie", surname: "Hiscocks", sex: "Female", living: false, fullName: "Doris Annie Hiscocks",
  birthYear: "1897", birthPlace: "Fishponds, Gloucestershire, England", deathYear: "1980", deathPlace: "Bristol, England",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1920", marriageYear: "1920", marriagePlace: "Bristol, England" }],
  attachedSources: ["1901 England Census", "England & Wales, FreeBMD Birth Index, 1837-1915", "England & Wales, Civil Registration Marriage Index, 1916-2005", "England and Wales National Register, 1939"],
};
o = opts(doris);
console.log("Doris attached:", attachedLabels(o));
check("Ancestry '1901 England Census' → 1901 E&W attached", !!find(o, /^1901/).attached);
check("1911 not attached", !find(o, /^1911/).attached);
check("FreeBMD birth → GRO birth attached", !!find(o, /GRO Birth/).attached);
check("FreeBMD birth does NOT mark the parish christening", !find(o, /parish births/).attached);
check("civil marriage index → GRO marriage attached", !!find(o, /GRO Marriage/).attached);
check("civil marriage does NOT mark parish marriage", !find(o, /parish marriages/).attached);
check("1939 National Register attached", !!find(o, /^1939/).attached);
check("GRO death NOT attached", !find(o, /GRO Death/).attached);

// 4. Irish civil index: tags disambiguate; no tags → title-only (both dimmed)
const pat = {
  id: "P", given: "Patrick", surname: "Cummins", sex: "Male", living: false, fullName: "Patrick Cummins",
  birthYear: "1870", birthPlace: "Donegal, Ireland", deathYear: "1940", deathPlace: "Donegal, Ireland",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  attachedSources: [{ title: "Ireland, Civil Registration Indexes, 1845-1958", tags: ["Name", "Birth"] }, { title: "Ireland Census, 1911" }],
};
o = opts(pat);
console.log("Patrick attached:", attachedLabels(o));
check("Irish civil birth attached (tag Birth)", !!find(o, /Ireland civil birth/).attached);
check("Irish civil death NOT attached (tag Birth only)", !find(o, /Ireland civil death/).attached);
check("Irish civil marriage NOT attached (tag Birth only)", !o.some((x) => /Ireland civil marriage/.test(x.label) && x.attached));
check("Ireland births & baptisms (parish) NOT attached", !find(o, /Ireland births & baptisms/).attached);
check("1911 Ireland census attached; 1901 not", !!find(o, /^1911/).attached && !find(o, /^1901/).attached);
o = opts({ ...pat, attachedSources: ["Ireland, Civil Registration Indexes, 1845-1958"] });
check("no tags → civil birth AND death dimmed (title-only)", !!find(o, /Ireland civil birth/).attached && !!find(o, /Ireland civil death/).attached);

// 5. US federal vs NY state vs SSDI
const ellen = {
  id: "E", given: "Ellen E", surname: "Hurley", sex: "Female", living: false, fullName: "Ellen E Hurley",
  birthYear: "1864", birthPlace: "Worcester, Massachusetts, United States", deathYear: "1930", deathPlace: "Brooklyn, Kings, New York, United States",
  spouseSurnames: ["Bunker"], marriedSurnames: ["Bunker"],
  spouses: [{ name: "George Bunker", surname: "Bunker", id: "G", marriageDate: "22 May 1889", marriageYear: "1889", marriagePlace: "Worcester, Massachusetts, United States" }],
  attachedSources: ["United States Census, 1900", "New York State Census, 1905", "United States Social Security Death Index", "Find a Grave Index"],
};
o = opts(ellen);
console.log("Ellen attached:", attachedLabels(o));
check("1900 US Federal attached", !!find(o, /^1900 US Federal/).attached);
check("1905 NY State attached", !!find(o, /^1905 New York/).attached);
check("1910 US Federal NOT attached", !find(o, /^1910/).attached);
check("1915 NY State NOT attached", !find(o, /^1915/).attached);
check("FAG attached (Bunker death entry)", !!find(o, /Find A Grave/).attached);
check("SSDI not offered (d.1930 < 1935) — sanity", !find(o, /Social Security/));

// 6. findAttached unit checks
check("findAttached: year must appear", FSSE.findAttached(["England and Wales Census, 1861"], FSSE.censusMatch({ year: 1851, region: FSSE.COLLECTIONS.regions.find((r) => r.key === "enw"), sub: null })) === null);
check("findAttached: plain strings accepted", FSSE.findAttached(["Find a Grave Index"], FSSE.specMatch(FSSE.COLLECTIONS.findAGrave)) === "Find a Grave Index");
check("findAttached: null sources → null", FSSE.findAttached(null, { re: /x/ }) === null);
check("Prairie 1916 title matches sub not Canada region", FSSE.findAttached(["Canada, Census of the Prairie Provinces, 1916"], FSSE.censusMatch({ year: 1916, region: FSSE.COLLECTIONS.regions.find((r) => r.key === "canada"), sub: FSSE.COLLECTIONS.regions.find((r) => r.key === "canada").subRegions[0] })) !== null);

// 7. LIVE titles from John Stephen Hind GJY7-54S (Sources tab DIAG, 2026-09-03) + title parsing
const T = FSSE.parseSourceTitle;
let t = T('John Stephen Hind in entry for Stephen Hind, "England, Births and Christenings, 1538-1975"');
check("parse: in-entry-for → mentioned, collection, principal", t.mentioned && t.collection === "England, Births and Christenings, 1538-1975" && t.principal === "Stephen Hind", JSON.stringify(t));
t = T('John Stephen Hind, "England and Wales, Census, 1921"');
check("parse: plain FS title → own record", !t.mentioned && t.collection === "England and Wales, Census, 1921" && t.principal === "John Stephen Hind", JSON.stringify(t));
t = T('John Hind in household of Stephen Hind, "England and Wales Census, 1911"');
check("parse: in-household-of → own record", !t.mentioned && t.principal === "John Hind" && t.collection === "England and Wales Census, 1911", JSON.stringify(t));
t = T("Birth Registration for John Stephen Hind who was born on 8 Oct 1913 at Birkenhead, Cheshire, England");
check("parse: user-typed title → no collection", !t.mentioned && t.collection === null && t.title.startsWith("Birth Registration"), JSON.stringify(t));
t = T("John Stephen Hind, “England Marriages, 1538–1973”");
check("parse: curly quotes accepted", t.collection === "England Marriages, 1538–1973", JSON.stringify(t));
const john = {
  id: "GJY7-54S", given: "John Stephen", surname: "Hind", sex: "Male", living: false, fullName: "John Stephen Hind",
  birthYear: "1913", birthPlace: "Birkenhead, Cheshire, England, United Kingdom", deathYear: "1967", deathPlace: "New Ferry, Cheshire, England, United Kingdom",
  christeningYear: null, christeningPlace: "", burialYear: null, burialPlace: "",
  spouseSurnames: ["Wood"], marriedSurnames: [],
  spouses: [{ name: "Mary Wood", surname: "Wood", id: "GVM8-96S", marriageDate: "29 Mar 1943", marriageYear: "1943", marriagePlace: "New Ferry, Cheshire, England, United Kingdom" }],
  attachedSources: [
    "Birth Registration for John Stephen Hind who was born on 8 Oct 1913 at Birkenhead, Cheshire, England",
    'John Stephen Hind, "England and Wales, Census, 1921"',
    'John S Hind, "England and Wales, Marriage Registration Index, 1837-2005"',
    'John Stephen Hind, "England Marriages, 1538–1973"',
    'John Stephen Hind in entry for Stephen Hind, "England, Births and Christenings, 1538-1975"',
  ].map((x) => ({ ...T(x), via: "fs" })),
  attachedMeta: { count: 5, scrapedAt: Date.now() }, sourcesCount: 5,
};
o = opts(john);
console.log("John attached:", attachedLabels(o), "| mentioned:", o.filter((x) => x.mentioned).map((x) => x.label));
check("John: 1921 census attached", !!find(o, /^1921/).attached);
check("John: 1939 register NOT attached", !find(o, /^1939/).attached);
check("John: GRO birth attached via user-typed title", !!find(o, /GRO Birth/).attached);
check("John: parish christening NOT attached (son's record) but mentioned", !find(o, /parish births/).attached && !!find(o, /parish births/).mentioned, JSON.stringify(find(o, /parish births/)));
check("John: mention noted in tooltip", /Attached so far: only a record that mentions this person/.test(find(o, /parish births/).tooltip));
check("John: GRO marriage 1943 attached", !!find(o, /GRO Marriage.*1943/).attached);
check("John: parish marriage 1943 attached", !!find(o, /parish marriages.*1943/).attached);
check("John: GRO death NOT attached", !find(o, /GRO Death/).attached);
check("John: Find A Grave NOT attached", !find(o, /Find A Grave/).attached);
check("John: describe says 4 already attached", /4 already attached\./.test(site.describe(john)), site.describe(john));
check("John: footer not stale (5 = 5)", !/changed/.test(site.footer(john).text));
check("old-shape cache entry ({title, via}) still matches as own record", !!FSSE.findAttached([{ title: "England and Wales Census, 1851", via: "text" }], FSSE.censusMatch({ year: 1851, region: FSSE.COLLECTIONS.regions.find((r) => r.key === "enw"), sub: null })));

// 8. LIVE titles from Edward Cummings L81M-MJX (b. 1842 Donegal, m. 1871 Victoria, d. 1922 Perth)
const edward = {
  id: "L81M-MJX", given: "Edward", surname: "Cummings", sex: "Male", living: false, fullName: "Edward Cummings",
  birthYear: "1842", birthPlace: "Liffey on Foyle, Lifford, Donegal, Ulster, North Ireland", deathYear: "1922", deathPlace: "Perth, Western Australia, Australia",
  christeningYear: "1842", christeningPlace: "Clonleigh Parish, Donegal, Ireland", burialYear: "1922", burialPlace: "Karrakatta Cemetery, Karrakatta, Western Australia, Australia",
  spouseSurnames: ["Fuller"], marriedSurnames: [],
  spouses: [{ name: "Mary Anne Fuller", surname: "Fuller", id: "L5FG-GNF", marriageDate: "15 March 1871", marriageYear: "1871", marriagePlace: "Cobden, Victoria, Australia" }],
  attachedSources: [
    "Australia, Birth Index, 1788-1922",
    "Australia, Births and Baptisms, 1792-1981",
    "Victoria, Australia, Birth Index, 1837-1917",
    "Parish Christening Record for Edward Cumming on 29 May 1842 at Clonleigh, Donegal, Ireland",
    "Victoria, Australia, Marriage Index, 1837-1950",
    "Australia, Marriage Index, 1788-1950",
    'Edward Cummins, "Australia, Births and Baptisms, 1792-1981"',
    'Edward Cummins in entry for Edward Irving Cummins, "Australia, Births and Baptisms, 1792-1981"',
    'Edward Cummings, "Find a Grave Index"',
    "Australia, Death Index, 1787-1985",
    "Newspaper Death Notice for Edward Cummings who died on 14 Apr 1922 at North Perth, Western Australia, Australia",
  ].map((x) => ({ ...T(x), via: "fs" })),
  attachedMeta: { count: 35, scrapedAt: Date.now() }, sourcesCount: 35,
};
o = opts(edward);
console.log("Edward attached:", attachedLabels(o), "| mentioned:", o.filter((x) => x.mentioned).map((x) => x.label));
check("Edward: no census group (Australia)", !o.some((x) => x.group === "Census"));
check("Edward: Ireland christening attached via user-typed parish title", !!find(o, /Ireland births & baptisms/).attached, JSON.stringify(find(o, /Ireland births & baptisms/)));
check("Edward: 1871 marriage entry (Australia marriages since v0.2.40) attached via Victoria marriage index", find(o, /— 1871, spouse Fuller/).attached === "Victoria, Australia, Marriage Index, 1837-1950", JSON.stringify(find(o, /— 1871, spouse Fuller/)));
check("Edward: Find A Grave attached", !!find(o, /Find A Grave/).attached);
check("Edward: nothing mentioned-only (no Australian birth entry offered)", !o.some((x) => x.mentioned));
check("Edward: describe says 4 already attached (christening, marriage, deaths & burials, FAG)", /4 already attached\./.test(site.describe(edward)), site.describe(edward));
check("Edward-style footer: 17 titles read from 35 sources", /\(17 distinct titles read from 35 sources/.test(site.footer({ ...edward, attachedSources: new Array(17).fill("x") }).text));
check("regionMatch: null region → null", FSSE.regionMatch(null, "marriages?") === null);
check("regionMatch: Australia + 'Marriages' title", !!FSSE.findAttached(["Australia, Marriages, 1810-1980"], FSSE.regionMatch(FSSE.COLLECTIONS.regions.find((r) => r.key === "au"), "marriages?")));
check("regionMatch: Australia death index does not match marriages", !FSSE.findAttached(["Australia, Death Index, 1787-1985"], FSSE.regionMatch(FSSE.COLLECTIONS.regions.find((r) => r.key === "au"), "marriages?")));

// 9. NUMIDENT (v0.2.39) — US death 1936–2007 → DEATH entry with both windows; SSDI unaffected
const alice = {
  id: "L7X2-3JN", given: "Alice Grace", surname: "Morgart", sex: "Female", living: false, fullName: "Alice Grace Morgart",
  birthYear: "1902", birthPlace: "Pennsylvania, United States", deathYear: "1989", deathPlace: "Pennsylvania, United States",
  spouseSurnames: ["Heeter"], marriedSurnames: ["Heeter"],
  spouses: [{ name: "John Heeter", surname: "Heeter", id: "H", marriageDate: "26 Dec 1925", marriageYear: "1925", marriagePlace: "Pennsylvania, United States" }],
  attachedSources: [],
};
o = opts(alice);
let nm = find(o, /NUMIDENT/);
console.log("Alice death entries:", o.filter((x) => x.group === "Death").map((x) => x.label));
check("Alice: NUMIDENT offered (d. 1989)", !!nm, JSON.stringify(o.map((x) => x.label)));
check("Alice: NUMIDENT under married surname", /q\.surname=Heeter/.test(nm.url), nm.url);
check("Alice: NUMIDENT sends birth AND death windows", /q\.birthLikeDate\.from=1900&q\.birthLikeDate\.to=1904/.test(nm.url) && /q\.deathLikeDate\.from=1987&q\.deathLikeDate\.to=1991/.test(nm.url), nm.url);
check("Alice: NUMIDENT collection id + treeref, no place", /f\.collectionId=5000016/.test(nm.url) && /treeref=L7X2-3JN/.test(nm.url) && !/Place/.test(nm.url), nm.url);
check("Alice: SSDI still offered", !!find(o, /Social Security Death Index/));
check("Alice: DEATH order = SSDI, NUMIDENT, Find A Grave", JSON.stringify(o.filter((x) => x.group === "Death").map((x) => x.label.replace(/ —.*$/, ""))) === JSON.stringify(["US Social Security Death Index 1935–2014", "US NUMIDENT (Social Security files) 1936–2007", "Find A Grave"]), JSON.stringify(o.filter((x) => x.group === "Death").map((x) => x.label)));
check("Alice: tooltip mentions born + died", /born 1902 ±2, died 1989 ±2/.test(nm.tooltip), nm.tooltip);
check("Ellen (d. 1930): no NUMIDENT", !find(opts(ellen), /NUMIDENT/));
check("Doris (E&W): no NUMIDENT", !find(opts(doris), /NUMIDENT/));
check("living US person: no NUMIDENT", !find(opts({ ...alice, living: true, deathYear: null }), /NUMIDENT/));
o = opts({ ...alice, deathYear: null, deathPlace: "" });
check("unknown death year, born 1902 US: NUMIDENT offered (coverage overlaps)", !!find(o, /NUMIDENT/));
o = opts({ ...alice, attachedSources: ['Alice Grace Heeter, "United States, Social Security Numerical Identification Files (NUMIDENT), 1936-2007"'].map((x) => ({ ...T(x), via: "fs" })) });
check("attached NUMIDENT dims NUMIDENT only", !!find(o, /NUMIDENT/).attached && !find(o, /Social Security Death Index/).attached, JSON.stringify(attachedLabels(o)));
o = opts({ ...alice, attachedSources: ['Alice Heeter, "United States Social Security Death Index"'].map((x) => ({ ...T(x), via: "fs" })) });
check("attached SSDI dims SSDI only", !!find(o, /Social Security Death Index/).attached && !find(o, /NUMIDENT/).attached, JSON.stringify(attachedLabels(o)));
check("describe counts the extra death entry", /3 death/.test(site.describe(alice)), site.describe(alice));

// 10. v0.2.40 — Australia aggregates, MIGRATION, MILITARY, E&W probate, Scotland death tier
const groupsOf = (o) => [...new Set(o.map((x) => x.group))];
const labelsIn = (o, g) => o.filter((x) => x.group === g).map((x) => x.label);

// Edward again: Australian marriage + burial aggregates now replace the all-collections fallback
o = opts(edward);
console.log("Edward v0.2.40:", groupsOf(o), labelsIn(o, "Marriage"), labelsIn(o, "Death"));
check("Edward: Australia marriages entry replaces all-collections", !!find(o, /^Australia marriages 1810–1980 — 1871, spouse Fuller/) && !find(o, /all collections — 1871/), JSON.stringify(labelsIn(o, "Marriage")));
check("Edward: Australia marriage entry sends place + spouse", /q\.marriageLikePlace=Cobden/.test(find(o, /Australia marriages/).url) && /q\.spouseSurname=Fuller/.test(find(o, /Australia marriages/).url) && /f\.collectionId=1770858/.test(find(o, /Australia marriages/).url));
check("Edward: Australia marriage dimmed by the attached Victoria marriage index", !!find(o, /Australia marriages/).attached, JSON.stringify(find(o, /Australia marriages/)));
check("Edward: Australia deaths & burials entry with burial place", /f\.collectionId=1770857/.test(find(o, /Australia deaths & burials/).url) && /q\.deathLikePlace=Karrakatta/.test(find(o, /Australia deaths & burials/).url), find(o, /Australia deaths & burials/).url);
check("Edward: deaths & burials dimmed by the attached Australia Death Index", !!find(o, /Australia deaths & burials/).attached);
check("Edward: no Migration group (no FS arrival list for Australia; UK lists start 1890)", !groupsOf(o).includes("Migration"));
check("Edward: no Military group (b. 1842)", !groupsOf(o).includes("Military"));
check("Edward: describe now 4 already attached", /4 already attached\./.test(site.describe(edward)), site.describe(edward));
// An Australian-born person gets the births & baptisms aggregate
o = opts({ ...edward, birthPlace: "Cobden, Victoria, Australia", christeningPlace: "", birthYear: "1875", deathYear: "1950", spouses: [], spouseSurnames: [] });
check("Australian birth → Australia births & baptisms entry", /f\.collectionId=1770729/.test(find(o, /Australia births & baptisms/).url), JSON.stringify(labelsIn(o, "Birth")));

// James Emmanuel Owen KP4S-LGG: England → British Columbia
const jamesE = {
  id: "KP4S-LGG", given: "James Emmanuel", surname: "Owen", sex: "Male", living: false, fullName: "James Emmanuel Owen",
  birthYear: "1866", birthPlace: "Newcastle upon Tyne, Northumberland, England", deathYear: "1927", deathPlace: "New Westminster, British Columbia, Canada",
  spouseSurnames: ["Hind"], marriedSurnames: [],
  spouses: [{ name: "Mary Hind", surname: "Hind", id: "H", marriageDate: "31 Dec 1892", marriageYear: "1892", marriagePlace: "Benwell, Northumberland, England" }],
  attachedSources: ["UK and Ireland, Outward Passenger Lists, 1890-1960"],
};
o = opts(jamesE);
console.log("James E groups:", groupsOf(o), labelsIn(o, "Migration"), labelsIn(o, "Military"));
check("James E: group order Census, Birth, Marriage, Migration, Military, Death, Full text, Everything", JSON.stringify(groupsOf(o)) === JSON.stringify(["Census", "Birth", "Marriage", "Migration", "Military", "Death", "Full text Search (AI-indexed records)", "Everything"]), JSON.stringify(groupsOf(o)));
check("James E: UK outgoing lists 1892–1927", !!find(o, /^UK outgoing passenger lists 1890–1960 — 1892–1927$/), JSON.stringify(labelsIn(o, "Migration")));
check("James E: Canada passenger lists 1892–1922 (clamped to coverage)", !!find(o, /^Canada passenger lists 1881–1922 — 1892–1922$/));
check("James E: migration URL = name + birth window + anyDate window + id", /q\.surname=Owen/.test(find(o, /UK outgoing/).url) && /q\.birthLikeDate\.from=1864/.test(find(o, /UK outgoing/).url) && /q\.anyDate\.from=1892&q\.anyDate\.to=1927/.test(find(o, /UK outgoing/).url) && /f\.collectionId=4229516/.test(find(o, /UK outgoing/).url), find(o, /UK outgoing/).url);
check("James E: migration tooltip names the move", /England & Wales → Canada between the 1892 marriage and the 1927 death/.test(find(o, /UK outgoing/).tooltip), find(o, /UK outgoing/).tooltip);
check("James E: UK outgoing dimmed by the attached Ancestry outward lists", !!find(o, /UK outgoing/).attached && !find(o, /Canada passenger/).attached);
check("James E: no New York / border entries (destination Canada)", !find(o, /New York|border/));
check("James E: UK WWI service records (b. 1866, in England at 1914 per bracketing)", !!find(o, /UK WWI service records/), JSON.stringify(labelsIn(o, "Military")));
check("James E: no US draft cards", !find(o, /US WWI|US WWII/));
check("James E: military URL = name + birth window + id, no place", /q\.birthLikeDate\.from=1864&q\.birthLikeDate\.to=1868&f\.collectionId=2125045$/.test(find(o, /UK WWI/).url), find(o, /UK WWI/).url);
check("James E: military tooltip gives the age", /aged 48 in 1914/.test(find(o, /UK WWI/).tooltip));

// Norman Owen KW8B-KPY: England 1908 → Calgary 1929; too young for WWI, no US
const norman = { ...jamesE, id: "KW8B-KPY", given: "Norman", birthYear: "1908", birthPlace: "Stanley, Durham, England", deathYear: "1978", deathPlace: "Red Deer, Alberta, Canada",
  spouses: [{ name: "Jean Smith", surname: "Smith", id: "S", marriageDate: "13 Sep 1929", marriageYear: "1929", marriagePlace: "Calgary, Alberta, Canada" }], spouseSurnames: ["Smith"], attachedSources: null };
o = opts(norman);
check("Norman: UK outgoing 1908–1929 + Canada lists 1908–1922", !!find(o, /UK outgoing.*1908–1929/) && !!find(o, /Canada passenger.*1908–1922/), JSON.stringify(labelsIn(o, "Migration")));
check("Norman: move named birth → marriage", /between the 1908 birth and the 1929 marriage/.test(find(o, /UK outgoing/).tooltip));
check("Norman: no Military group (b. 1908)", !groupsOf(o).includes("Military"));

// Margaret Gowans LWL5-M32: Scotland 1868 → US by her 1888 marriage; maiden surname on the list search
const margaret = {
  id: "LWL5-M32", given: "Margaret Russell", surname: "Gowans", sex: "Female", living: false, fullName: "Margaret Russell Gowans",
  birthYear: "1868", birthPlace: "Scotland", deathYear: "1962", deathPlace: "Pittsburgh, Allegheny, Pennsylvania, United States",
  spouseSurnames: ["Young"], marriedSurnames: ["Young"],
  spouses: [{ name: "John Young", surname: "Young", id: "Y", marriageDate: "1888", marriageYear: "1888", marriagePlace: "Pittsburgh, Pennsylvania, United States" }],
  attachedSources: null,
};
o = opts(margaret);
console.log("Margaret migration:", labelsIn(o, "Migration"));
check("Margaret: New York lists 1868–1888 only (Ellis Island and UK outgoing start later)", JSON.stringify(labelsIn(o, "Migration")) === JSON.stringify(["New York passenger lists 1820–1891 — 1868–1888"]), JSON.stringify(labelsIn(o, "Migration")));
check("Margaret: list search uses the maiden surname", /q\.surname=Gowans/.test(find(o, /New York passenger/).url));
check("Margaret: no Military (female)", !groupsOf(o).includes("Military"));
check("Margaret: no Scotland Death Records (d. 1962 < 1998)", !find(o, /Scotland Death Records/));
o = opts({ ...margaret, deathYear: "2005", deathPlace: "Glasgow, Scotland", spouses: [], spouseSurnames: [], marriedSurnames: [] });
check("Scottish death 2005 → Scotland Death Records 1998–2015 tier", /f\.collectionId=4441753/.test(find(o, /Scotland Death Records/).url), JSON.stringify(labelsIn(o, "Death")));

// US man born 1895: both US draft registrations; attached titles dim each separately
const gi = { ...alice, given: "Frank", surname: "Morgart", sex: "Male", fullName: "Frank Morgart", birthYear: "1895", deathYear: "1960", marriedSurnames: [], spouses: [], spouseSurnames: [],
  attachedSources: ["U.S., World War I Draft Registration Cards, 1917-1918"] };
o = opts(gi);
console.log("Frank military:", labelsIn(o, "Military"));
check("Frank: WWI + WWII (1942) draft cards", !!find(o, /US WWI draft/) && !!find(o, /US WWII draft registration cards 1942/), JSON.stringify(labelsIn(o, "Military")));
check("Frank: WWI dimmed by the attached Ancestry title, WWII not", !!find(o, /US WWI draft/).attached && !find(o, /US WWII/).attached);
check("Frank: WWI URL id 1968530 with birth window", /q\.birthLikeDate\.from=1893&q\.birthLikeDate\.to=1897&f\.collectionId=1968530$/.test(find(o, /US WWI draft/).url), find(o, /US WWI draft/).url);
check("Frank: no UK service records", !find(o, /UK WWI/));
check("Frank died 1930 → WWI only (dead before 1942)", !!find(opts({ ...gi, deathYear: "1930" }), /US WWI/) && !find(opts({ ...gi, deathYear: "1930" }), /US WWII/));
check("born 1870 US man → WWII 1942 only? no: 1870 < 1877 → none", !groupsOf(opts({ ...gi, birthYear: "1870", deathYear: "1950" })).includes("Military"));
check("unknown sex passes the military gate", !!find(opts({ ...gi, sex: "" }), /US WWI/));

// Canada → US: border crossings + New York lists
const border = { ...gi, birthYear: "1880", birthPlace: "Toronto, Ontario, Canada", deathYear: "1950", deathPlace: "Buffalo, New York, United States", attachedSources: null };
o = opts(border);
console.log("Border migration:", labelsIn(o, "Migration"));
check("Canada → US: border crossings 1895–1950", !!find(o, /US border crossings from Canada 1895–1956 — 1895–1950/), JSON.stringify(labelsIn(o, "Migration")));
check("Canada → US: no UK outgoing lists", !find(o, /UK outgoing/));
check("England → US: no border-crossing entry (fromRegions)", !find(opts({ ...border, birthPlace: "Leeds, Yorkshire, England" }), /border crossings/));

// E&W probate (DEATH group) for a 1950 English death; dims on the Ancestry probate calendar title
const dorisP = { ...doris, deathYear: "1950", attachedSources: ["England & Wales, National Probate Calendar (Index of Wills and Administrations), 1858-1995"] };
o = opts(dorisP);
console.log("Doris 1950 death:", labelsIn(o, "Death"));
check("Doris d. 1950: probate calendar entry after the GRO death index", labelsIn(o, "Death")[0].startsWith("E&W GRO Death Index") && labelsIn(o, "Death")[1].startsWith("E&W probate calendar"), JSON.stringify(labelsIn(o, "Death")));
check("Doris: probate URL = married surname + death window + id, no place", /q\.surname=Roberts/.test(find(o, /probate/).url) && /q\.deathLikeDate\.from=1948&q\.deathLikeDate\.to=1952&f\.collectionId=2451051$/.test(find(o, /probate/).url), find(o, /probate/).url);
check("Doris: probate dimmed by the Ancestry probate calendar title", !!find(o, /probate/).attached);
check("Doris: GRO death NOT dimmed by the probate title", !find(o, /GRO Death/).attached);
check("Doris d. 1980 → no probate (calendar ends 1957)", !find(opts(doris), /probate/));
check("Charles d. 1879 → probate 1858–1957 offered", !!find(opts(charles), /probate/), JSON.stringify(labelsIn(opts(charles), "Death")));

// 11. v0.2.41 — parents' names on the collections that index them
const edwardP = { ...edward, father: { name: "William Cummins", id: "L81M-9HW", given: "William", surname: "Cummins" }, mother: { name: "Sarah Jane Irvine", id: "L5FG-P3T", given: "Sarah Jane", surname: "Irvine" }, parents: [], attachedSources: null };
o = opts(edwardP);
const chr = find(o, /Ireland births & baptisms/);
check("parents: christening URL carries father + mother", /q\.fatherGivenName=William&q\.fatherSurname=Cummins&q\.motherGivenName=Sarah%20Jane&q\.motherSurname=Irvine/.test(chr.url), chr.url);
check("parents: christening tooltip names them", /Parents sent: William Cummins & Sarah Jane Irvine\./.test(chr.tooltip), chr.tooltip);
check("parents: All collections carries them", /q\.fatherSurname=Cummins/.test(find(o, /^All collections$/).url));
check("parents: Australia births entry carries them", /q\.motherSurname=Irvine/.test(find(opts({ ...edwardP, birthPlace: "Cobden, Victoria, Australia", christeningPlace: "", birthYear: "1875", deathYear: "1950", spouses: [], spouseSurnames: [] }), /Australia births/).url));
check("parents: marriage / death / migration entries do NOT carry them", !o.some((x) => /father|mother/.test(x.url) && !/Birth|Everything/.test(x.group)), JSON.stringify(o.filter((x) => /father|mother/.test(x.url)).map((x) => x.label)));
const dorisPP = { ...doris, father: { name: "Frank Hiscocks", id: "F", given: "Frank", surname: "Hiscocks" }, mother: null, parents: [] };
o = opts(dorisPP);
check("parents: GRO birth index gets NO parents (civil)", !/father/.test(find(o, /GRO Birth/).url), find(o, /GRO Birth/).url);
check("parents: parish christening gets the father only", /q\.fatherGivenName=Frank&q\.fatherSurname=Hiscocks(&|$)/.test(find(o, /parish births/).url) && !/mother/.test(find(o, /parish births/).url), find(o, /parish births/).url);
o = opts({ ...alice, father: { name: "John Morgart", id: "J", given: "John", surname: "Morgart" }, mother: { name: "Mary Smith", id: "M", given: "Mary", surname: "Smith" }, parents: [] });
check("parents: NUMIDENT carries them", /q\.fatherSurname=Morgart/.test(find(o, /NUMIDENT/).url) && /q\.motherSurname=Smith/.test(find(o, /NUMIDENT/).url));
check("parents: SSDI does not", !/father/.test(find(o, /Social Security Death Index/).url));
check("no parents → no parent params anywhere", !opts(edward).some((x) => /father|mother/.test(x.url)));

// 12. v0.2.42 — sub-region vital indexes (state / province before country), state WWII cards
// Ellen Hurley 27XF-DZX: b. 1864 Worcester MA, m. 1889 Worcester MA, d. 1930 Brooklyn NY
o = opts(ellen);
console.log("Ellen v0.2.42:", labelsIn(o, "Census"), labelsIn(o, "Birth"), labelsIn(o, "Marriage"), labelsIn(o, "Death"));
check("Ellen: Massachusetts births 1841–1915 with the birth place", /f\.collectionId=1536925/.test(find(o, /Massachusetts births/).url) && /q\.birthLikePlace=Worcester/.test(find(o, /Massachusetts births/).url), JSON.stringify(labelsIn(o, "Birth")));
check("Ellen: US births & christenings NOT also offered (state tier wins)", !find(o, /US births & christenings/));
check("Ellen: Massachusetts marriages 1889 with place + spouse", /f\.collectionId=1469062/.test(find(o, /Massachusetts marriages/).url) && /q\.marriageLikePlace=Worcester/.test(find(o, /Massachusetts marriages/).url) && /q\.spouseSurname=Bunker/.test(find(o, /Massachusetts marriages/).url), JSON.stringify(labelsIn(o, "Marriage")));
check("Ellen: marriage tooltip does not say 'no place sent'", !/No place sent/.test(find(o, /Massachusetts marriages/).tooltip), find(o, /Massachusetts marriages/).tooltip);
check("Ellen: NYC municipal deaths 1930 with the death place, under Bunker", /f\.collectionId=2240477/.test(find(o, /New York City municipal deaths/).url) && /q\.deathLikePlace=Brooklyn/.test(find(o, /New York City municipal deaths/).url) && /q\.surname=Bunker/.test(find(o, /New York City municipal deaths/).url), JSON.stringify(labelsIn(o, "Death")));
check("Ellen: 1865 Massachusetts State Census offered (bracketed by MA birth + MA marriage), 1855 not", !!find(o, /^1865 Massachusetts State Census/) && !find(o, /^1855/), JSON.stringify(labelsIn(o, "Census")));
check("Ellen: NY state censuses still 1892/1905/1915/1925 (v0.2.21 bracketing)", JSON.stringify(labelsIn(o, "Census").filter((l) => /New York/.test(l))) === JSON.stringify(["1892 New York State Census — Ellen E Bunker", "1905 New York State Census — Ellen E Bunker", "1915 New York State Census — Ellen E Bunker", "1925 New York State Census — Ellen E Bunker"]), JSON.stringify(labelsIn(o, "Census")));
check("Ellen: attached 'Massachusetts, U.S., Birth Records' dims the MA births entry", !!find(opts({ ...ellen, attachedSources: ["Massachusetts, U.S., Birth Records, 1841-1915"] }), /Massachusetts births/).attached);

// Alice Morgart L7X2-3JN: PA marriage 1925 → Pennsylvania marriages 1709–1940; death 1989 → SSDI (no PA death index)
o = opts(alice);
check("Alice: Pennsylvania marriages 1925 with place + spouse", /f\.collectionId=1681011/.test(find(o, /Pennsylvania marriages/).url) && /q\.marriageLikePlace=Pennsylvania/.test(find(o, /Pennsylvania marriages/).url), JSON.stringify(labelsIn(o, "Marriage")));
check("Alice: death 1989 → SSDI, NUMIDENT, Find A Grave unchanged", JSON.stringify(labelsIn(o, "Death").map((l) => l.replace(/ —.*$/, ""))) === JSON.stringify(["US Social Security Death Index 1935–2014", "US NUMIDENT (Social Security files) 1936–2007", "Find A Grave"]), JSON.stringify(labelsIn(o, "Death")));
check("Alice: birth 1902 PA → US births & christenings (PA has no birth index)", !!find(o, /US births & christenings/));

// James Emmanuel Owen: d. 1927 New Westminster → British Columbia deaths 1872–1986 with place
o = opts(jamesE);
check("James E: British Columbia deaths 1927 with the death place", /f\.collectionId=1538285/.test(find(o, /British Columbia deaths/).url) && /q\.deathLikePlace=New%20Westminster/.test(find(o, /British Columbia deaths/).url), JSON.stringify(labelsIn(o, "Death")));
check("James E: Find A Grave still follows", !!find(o, /Find A Grave/));

// Ontario: a person born Kingston 1880, married Kingston 1905, died Kingston 1930
const ont = { ...jamesE, id: "ONT", birthYear: "1880", birthPlace: "Kingston, Frontenac, Ontario, Canada", deathYear: "1930", deathPlace: "Kingston, Ontario, Canada", attachedSources: null,
  spouses: [{ name: "Ann Lee", surname: "Lee", id: "L", marriageDate: "1905", marriageYear: "1905", marriagePlace: "Kingston, Ontario, Canada" }], spouseSurnames: ["Lee"] };
o = opts(ont);
console.log("Ontario:", labelsIn(o, "Birth"), labelsIn(o, "Marriage"), labelsIn(o, "Death"));
check("Ontario: births 1880 / marriages 1905 / deaths 1930", /1784212/.test(find(o, /Ontario births/).url) && /1784216/.test(find(o, /Ontario marriages/).url) && /1307826/.test(find(o, /Ontario deaths/).url));
check("Ontario: no Migration / Military (all Canada, b. 1880)", !groupsOf(o).includes("Migration") && !groupsOf(o).includes("Military"));
// Norman Owen: Alberta (prairie sub has no vitals) → Find A Grave only, as before
check("Norman: prairie death → Find A Grave only", JSON.stringify(labelsIn(opts(norman), "Death")) === JSON.stringify(["Find A Grave"]), JSON.stringify(labelsIn(opts(norman), "Death")));

// State WWII cards: a PA man born 1910
const paMan = { ...gi, birthYear: "1910", deathYear: "1980", attachedSources: null };
o = opts(paMan);
console.log("PA man military:", labelsIn(o, "Military"));
check("PA man b. 1910: Pennsylvania WWII cards 1940–1947 only (too young for WWI / 1942 old-man)", JSON.stringify(labelsIn(o, "Military")) === JSON.stringify(["Pennsylvania WWII draft registration cards 1940–1947"]), JSON.stringify(labelsIn(o, "Military")));
check("PA man: card URL id 2603579 with birth window", /q\.birthLikeDate\.from=1908&q\.birthLikeDate\.to=1912&f\.collectionId=2603579$/.test(find(o, /Pennsylvania WWII/).url));
check("Frank b. 1895 PA: US WWI + 1942 + no PA young-men cards (born before 1896)", !find(opts(gi), /Pennsylvania WWII/));
check("NY-born 1910 man → New York City WWII cards; MA-born → no state cards", !!find(opts({ ...paMan, birthPlace: "Brooklyn, New York, United States", deathPlace: "Brooklyn, New York, United States" }), /New York City WWII/) && !find(opts({ ...paMan, birthPlace: "Boston, Massachusetts, United States", deathPlace: "Boston, Massachusetts, United States" }), /WWII draft registration cards 1940/));

// 13. v0.2.43 — surname variants from attached records, facts in the timeline, first-name Shift+click
// (2) variants: Edward's own records are indexed as CUMMINS
o = opts(edward);
console.log("Edward variants:", FSSE.surnameVariants(edward), labelsIn(o, "Everything"), labelsIn(o, "Full text Search (AI-indexed records)"));
check("variants: Cummins detected from the own-record principal (Cummings tree surname)", JSON.stringify(FSSE.surnameVariants(edward)) === JSON.stringify(["Cummins"]), JSON.stringify(FSSE.surnameVariants(edward)));
check("variants: All collections — as Cummins entry", /q\.surname=Cummins/.test(find(o, /^All collections — as Cummins$/).url), JSON.stringify(labelsIn(o, "Everything")));
check("variants: full-text \"Edward Cummins\" entry with the life window", /q\.text=%22Edward%20Cummins%22/.test(find(o, /^"Edward Cummins" 1842–1924$/).url), JSON.stringify(labelsIn(o, "Full text Search (AI-indexed records)")));
check("variants: describe mentions it", /Surname also seen as Cummins in the attached records\./.test(site.describe(edward)), site.describe(edward));
check("variants: mentioned-in principals (the children) are NOT variants", !FSSE.surnameVariants({ ...edward, attachedSources: edward.attachedSources.filter((s) => s.mentioned) }).length);
check("variants: a married / spouse surname is never a variant", !FSSE.surnameVariants({ ...ellen, attachedSources: [{ ...T('Ellen Bunker, "New York State Census, 1905"'), via: "fs" }] }).length);
check("variants: a far spelling is ignored (Smith vs Cummings)", !FSSE.surnameVariants({ ...edward, attachedSources: [{ ...T('Edward Smith, "Find a Grave Index"'), via: "fs" }] }).length);
check("variants: no cache → none, no extra entries (Indexed Historical Records + All collections only)", !FSSE.surnameVariants({ ...edward, attachedSources: null }).length && labelsIn(opts({ ...edward, attachedSources: null }), "Everything").length === 2, JSON.stringify(labelsIn(opts({ ...edward, attachedSources: null }), "Everything")));

// (3) facts: a 1880 Pittsburgh residence tightens Margaret's migration window (Scotland 1868 → US)
const margaretF = { ...margaret, facts: [{ kind: "Residence", year: "1880", place: "Pittsburgh, Allegheny, Pennsylvania, United States", text: "1880Pittsburgh…" }] };
o = opts(margaretF);
console.log("Margaret with residence:", labelsIn(o, "Migration"), labelsIn(o, "Census"));
check("facts: migration window ends at the 1880 residence, not the 1888 marriage", !!find(o, /New York passenger lists 1820–1891 — 1868–1880$/), JSON.stringify(labelsIn(o, "Migration")));
check("facts: tooltip names the residence as the later event", /between the 1868 birth and the 1880 residence/.test(find(o, /New York passenger/).tooltip), find(o, /New York passenger/).tooltip);
check("facts: undated or unclassified facts are ignored", JSON.stringify(labelsIn(opts({ ...margaret, facts: [{ kind: "Residence", year: null, place: "Pittsburgh, Pennsylvania, United States" }, { kind: "Residence", year: "1875", place: "Somewhere on the Moon" }] }), "Migration")) === JSON.stringify(labelsIn(opts(margaret), "Migration")));
// A 1901 Alberta residence puts Norman's father-type person on the Prairie census earlier
const normanF = { ...norman, facts: [{ kind: "Immigration", year: "1912", place: "Calgary, Alberta, Canada" }] };
check("facts: 1912 Calgary immigration → 1921 E&W census dropped (bracketed by two Canadian events), 1921 Canada kept", !find(opts(normanF), /^1921 E&W/) && !!find(opts(norman), /^1921 E&W/) && !!find(opts(normanF), /^1921 Canada/), JSON.stringify(labelsIn(opts(normanF), "Census")));
check("facts: migration window shortened to 1908–1912", !!find(opts(normanF), /UK outgoing.*1908–1912$/), JSON.stringify(labelsIn(opts(normanF), "Migration")));

// (4) first-given-name Shift+click
o = opts(doris);
const c1901 = find(o, /^1901/);
check("altUrl: 'Doris Annie' → first name only in the alternate", /q\.givenName=Doris&/.test(c1901.altUrl) && /q\.givenName=Doris%20Annie&/.test(c1901.url), c1901.altUrl);
check("altUrl: tooltip advertises Shift+click", /Shift\+click: first name only \("Doris"\)\./.test(c1901.tooltip));
check("altUrl: full-text phrase becomes \"Doris Hiscocks\"", /q\.text=%22Doris%20Hiscocks%22/.test(find(o, /^"Doris Annie Hiscocks"/).altUrl), find(o, /^"Doris Annie Hiscocks"/).altUrl);
check("altUrl: the PID simple search has none", !find(o, /^Simple search/).altUrl);
check("altUrl: single given name (Edward) → no alternates at all", !opts(edward).some((x) => x.altUrl));

// Regression: census output unchanged after the timeline refactor
const jamesCensus = labelsIn(opts(jamesE), "Census");
check("James E censuses: E&W only 1871–1891, both countries 1901–1921 (v0.2.21 rule intact)", JSON.stringify(jamesCensus) === JSON.stringify(["1871 E&W Census — James Emmanuel Owen", "1881 E&W Census — James Emmanuel Owen", "1891 E&W Census — James Emmanuel Owen", "1901 Canada Census — James Emmanuel Owen", "1901 E&W Census — James Emmanuel Owen", "1911 Canada Census — James Emmanuel Owen", "1911 E&W Census — James Emmanuel Owen", "1921 Canada Census — James Emmanuel Owen", "1921 E&W Census — James Emmanuel Owen"]), JSON.stringify(jamesCensus));

// v0.2.95 — the simple search is the native "FamilySearch Full Text" query: name + tree ID,
// spaces as "+", no count/offset (Kevin's Betsy Bellwood URL, 2026-09-21).
const betsy = {
  id: "KHW2-6TP", given: "Betsy", surname: "Bellwood", sex: "Female", living: false, fullName: "Betsy Bellwood",
  birthYear: "1850", birthPlace: "York, Yorkshire, England, United Kingdom", deathYear: "1915", deathPlace: "Newcastle, Northumberland, England, United Kingdom",
  marriedSurnames: ["Hind"], marriedSurname: "Hind", spouseSurnames: ["Hind"],
  spouses: [{ name: "Sydney Joseph Hind", surname: "Hind", id: "27SL-LQB", marriageDate: "8 October 1870", marriageYear: "1870", marriagePlace: "York, Yorkshire, England, United Kingdom" }],
};
const betsySimple = find(opts(betsy), /^Simple search/);
check("simple search: label carries the name and the ID", betsySimple && betsySimple.label === "Simple search — Betsy Bellwood KHW2-6TP", betsySimple && betsySimple.label);
check("simple search: URL byte-identical to the native Full Text entry", betsySimple.url === "https://www.familysearch.org/en/search/full-text/results?nlQuery=Betsy+Bellwood+KHW2-6TP", betsySimple.url);
check("simple search: still LAST in the full-text group", labelsIn(opts(betsy), "Full text Search (AI-indexed records)").at(-1) === "Simple search — Betsy Bellwood KHW2-6TP");
const dorisSimple = find(opts(doris), /^Simple search/);
check("simple search: a two-word given name joins with + too", dorisSimple.url.endsWith("?nlQuery=Doris+Annie+Hiscocks+X"), dorisSimple.url);
const idOnly = find(opts({ id: "KHW2-6TP", spouses: [], marriedSurnames: [], spouseSurnames: [] }), /^Simple search/);
check("simple search: before the name has scraped, the ID alone", idOnly && idOnly.label === "Simple search — KHW2-6TP" && idOnly.url.endsWith("?nlQuery=KHW2-6TP"), idOnly && idOnly.url);

// v0.2.101 — ONE FamilySearch entry point (Kevin): the native FamilySearch row is hidden by
// content.js and its search lives in EVERYTHING as "Indexed Historical Records" —
// p.nativeUrls["fs-records"] (v0.2.102 keying; p.nativeSearchUrl in v0.2.101) = the native row's
// own link when it has one, else a record search of our own; the menu row itself is labelled
// plain "FamilySearch" and takes the native entry's slot.
check("registry: the menu row reads 'FamilySearch' and replaces the native entry of either layout", site.label === "FamilySearch" && JSON.stringify(site.replaces) === JSON.stringify(["FamilySearch", "FamilySearch Records"]), JSON.stringify([site.label, site.replaces]));
check("registry: anchored first on the native entries it replaces (classic row, then the Labs entry), FamilySearch Trees as the fallback", site.anchorLabel.slice(0, 3).join("|") === "FamilySearch|FamilySearch Records|FamilySearch Trees", JSON.stringify(site.anchorLabel));
check("registry: native logo kept when anchored on either native entry, own icon on the Ancestry fallbacks", site.icon("FamilySearch Records") === null && site.icon("FamilySearch") === null && site.icon("Ancestry ▸") === "icons/icon32.png");
check("describe opens with the row's new name", /^FamilySearch — click to list the \d+ pre-filled searches/.test(site.describe(doris)), site.describe(doris));
const nativeUrl = "https://www.familysearch.org/search/record/results?q.givenName=Doris%20Annie&q.surname=Hiscocks&q.birthLikeDate.from=1897&q.birthLikeDate.to=1897&treeref=X";
o = opts({ ...doris, nativeUrls: { "fs-records": nativeUrl } });
const ihr = find(o, /^Indexed Historical Records$/);
check("native link: 'Indexed Historical Records' heads EVERYTHING, All collections next", labelsIn(o, "Everything")[0] === "Indexed Historical Records" && labelsIn(o, "Everything")[1] === "All collections", JSON.stringify(labelsIn(o, "Everything")));
check("native link: the URL passes through byte-for-byte", ihr && ihr.url === nativeUrl, ihr && ihr.url);
check("native link: the click is still handed to the row (FS builds the URL); the read link is the reserve; tooltip says so", ihr.nativeClick === true && /FamilySearch's own entry/.test(ihr.tooltip) && /your click is handed to it/.test(ihr.tooltip), ihr.tooltip);
check("native link: Shift+click alternate = first given name (FS encodes the name as we do)", /q\.givenName=Doris&/.test(ihr.altUrl), ihr.altUrl);
check("native link: EVERYTHING still the last group, nothing attached", groupsOf(o).at(-1) === "Everything" && !ihr.attached && !ihr.mentioned);
o = opts(doris);
const ihrF = find(o, /^Indexed Historical Records$/);
check("no native link: a record search of our own stands in — treeref + name + birth ±2 + birthplace + death ±2 + death place", ihrF && ihrF.url === "https://www.familysearch.org/search/record/results?treeref=X&q.givenName=Doris%20Annie&q.surname=Hiscocks&q.birthLikeDate.from=1895&q.birthLikeDate.to=1899&q.birthLikePlace=Fishponds%2C%20Gloucestershire%2C%20England&q.deathLikeDate.from=1978&q.deathLikeDate.to=1982&q.deathLikePlace=Bristol%2C%20England", ihrF && ihrF.url);
check("no native link: tooltip says the link was not found and names the vitals used", /born 1897 ±2, died 1980 ±2, born in Fishponds, Gloucestershire, England, died in Bristol, England\. \(The native FamilySearch search link was not found on this page/.test(ihrF.tooltip), ihrF.tooltip);
check("no native link: still first in EVERYTHING", labelsIn(o, "Everything")[0] === "Indexed Historical Records", JSON.stringify(labelsIn(o, "Everything")));
const ihrLiving = find(opts({ ...doris, living: true, deathYear: null, deathPlace: "" }), /^Indexed Historical Records$/);
check("no native link, living person: no death window or place in the stand-in", ihrLiving && !/deathLike/.test(ihrLiving.url) && !/died/.test(ihrLiving.tooltip), ihrLiving && ihrLiving.url);
const ihrChr = find(opts({ ...charles, nativeUrls: { "fs-records": null }, birthYear: null, deathYear: null }), /^Indexed Historical Records$/);
check("no native link, christening/burial proxies: windows from the proxies, tooltip says christened / buried", /q\.birthLikeDate\.from=1803&q\.birthLikeDate\.to=1807/.test(ihrChr.url) && /q\.deathLikeDate\.from=1877&q\.deathLikeDate\.to=1881/.test(ihrChr.url) && /christened 1805 ±2, buried 1879 ±2/.test(ihrChr.tooltip), ihrChr.tooltip);
const ihrId = find(opts({ id: "KHW2-6TP", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeUrls: { "fs-records": "https://www.familysearch.org/search/record/results?treeref=KHW2-6TP" } }), /^Indexed Historical Records$/);
check("native link before the name has scraped: still offered (FS fills the name itself)", ihrId && ihrId.url.endsWith("treeref=KHW2-6TP") && /this person/.test(ihrId.tooltip), ihrId && ihrId.tooltip);
check("no link and no name yet: no entry", !find(opts({ id: "KHW2-6TP", spouses: [], marriedSurnames: [], spouseSurnames: [] }), /^Indexed Historical Records$/));
// v0.2.102 — the native URLs are keyed per site: another menu's native link never leaks in.
const ihrOther = find(opts({ ...doris, nativeUrls: { "ancestry-records": "https://www.ancestry.com/search/?name=Doris_Hiscocks" } }), /^Indexed Historical Records$/);
check("nativeUrls keyed per site: the Ancestry row's link does not become the FamilySearch entry", ihrOther && ihrOther.url === ihrF.url, ihrOther && ihrOther.url);
// v0.2.105 — the native row is on the page but carries no link (FS builds the link at click
// time): the entry carries nativeClick (injectMenu hands the click to the row) and keeps the
// stand-in URL only as a reserve; the tooltip says what happens.
const ihrRow = find(opts({ ...doris, nativeRows: { "fs-records": true } }), /^Indexed Historical Records$/);
check("native row, no link: nativeClick, reserve URL = the stand-in, tooltip says the click is handed over", ihrRow && ihrRow.nativeClick === true && ihrRow.url === ihrF.url && /your click is handed to it/.test(ihrRow.tooltip) && !/not found/.test(ihrRow.tooltip), ihrRow && ihrRow.tooltip);
const ihrRowId = find(opts({ id: "KHW2-6TP", spouses: [], marriedSurnames: [], spouseSurnames: [], nativeRows: { "fs-records": true } }), /^Indexed Historical Records$/);
check("native row, no link, no name yet: still offered, treeref-only reserve", ihrRowId && ihrRowId.nativeClick === true && ihrRowId.url === "https://www.familysearch.org/search/record/results?treeref=KHW2-6TP", ihrRowId && ihrRowId.url);
check("no row → no nativeClick (our own search); a row WITH a link → nativeClick and the link as the reserve", !ihrF.nativeClick && (() => { const e = find(opts({ ...doris, nativeUrls: { "fs-records": nativeUrl }, nativeRows: { "fs-records": true } }), /^Indexed Historical Records$/); return e.nativeClick === true && e.url === nativeUrl; })());
check("nativeRows keyed per site: the Ancestry row's presence does not mark the FamilySearch entry", !find(opts({ ...doris, nativeRows: { "ancestry-records": true } }), /^Indexed Historical Records$/).nativeClick);

// 16. v0.2.107 — DEATH YEAR UNKNOWN: the inferred window [last seen, birth + 100] on every death
// tier the window reaches (window ∩ coverage), labelled "(death year unknown)"; the civil tier
// also gets the birth ±2. Last seen = birth / dated marriages / dated facts / attached census or
// 1939 Register years. A known death and "nothing dates the person" are unchanged.
const thomasU = {
  id: "T1", given: "Thomas Gourley", surname: "Park", sex: "Male", living: false, fullName: "Thomas Gourley Park",
  birthYear: "1880", birthPlace: "Bristol, Gloucestershire, England", deathYear: null, deathPlace: "", burialYear: null, burialPlace: "",
  spouseSurnames: [], marriedSurnames: [], spouses: [],
  facts: [{ kind: "Residence", year: "1921", place: "Bristol, Gloucestershire, England", text: "" }],
  attachedSources: [
    { title: 'Thomas Park, "England and Wales National Register, 1939"', collection: "England and Wales National Register, 1939", mentioned: false, principal: "Thomas Park", via: "fs" },
    "1901 England Census", "England & Wales, FreeBMD Birth Index, 1837-1915",
  ],
};
const dwT = FSSE.deathWindow(thomasU);
check("deathWindow: last seen = the attached 1939 Register, to = birth + 100", dwT && dwT.from === 1939 && dwT.to === 1980 && dwT.seen.what === "1939 Register" && dwT.ageFrom === 59 && dwT.ageTo === 100, JSON.stringify(dwT));
check("attachedAliveYears: single-year census / 1939 Register titles only (object + string forms), ranges skipped", JSON.stringify(FSSE.attachedAliveYears(thomasU).map((x) => x.what)) === '["1901 census","1939 Register"]', JSON.stringify(FSSE.attachedAliveYears(thomasU)));
check("attachedAliveYears: a year before the birth is ignored; a plain 'Register' without 1939 is not evidence", FSSE.attachedAliveYears({ ...thomasU, attachedSources: ["1871 England Census", "England, Death Register, 1950"] }).length === 0);
check("deathWindow: without the attached sources the 1921 residence fact is the last-seen", (() => { const d = FSSE.deathWindow({ ...thomasU, attachedSources: null }); return d.from === 1921 && d.seen.what === "1921 residence"; })());
check("deathWindow: null for a known death, a living person, a burial-year proxy", FSSE.deathWindow(doris) === null && FSSE.deathWindow({ ...thomasU, living: true }) === null && FSSE.deathWindow({ ...thomasU, burialYear: "1950" }) === null);
check("deathWindow: capped at the current year", FSSE.deathWindow({ ...thomasU, birthYear: "1950", facts: [], attachedSources: [] }).to === new Date().getFullYear());
o = opts(thomasU);
const dT = labelsIn(o, "Death");
console.log("Thomas (death unknown) DEATH:", dT);
check("unknown death: GRO index, probate, parish burials, Find A Grave — each over window ∩ coverage, no England Death Records (1998 > 1980)",
  JSON.stringify(dT) === JSON.stringify(["E&W GRO Death Index 1837–2007 — 1939–1980 (death year unknown)", "E&W probate calendar (wills & administrations) 1858–1957 — 1939–1957 (death year unknown)", "England parish deaths & burials 1538–1991 — 1939–1980 (death year unknown)", "Find A Grave — 1939–1980 (death year unknown)"]), JSON.stringify(dT));
const groU = find(o, /^E&W GRO Death Index/);
check("unknown death: the civil tier sends the window AND the birth ±2", /q\.birthLikeDate\.from=1878&q\.birthLikeDate\.to=1882&q\.deathLikeDate\.from=1939&q\.deathLikeDate\.to=1980&f\.collectionId=2285341$/.test(groU.url), groU.url);
check("unknown death: tooltip explains the window", /death year unknown — last seen 1939 \(1939 Register\), searched 1939–1980 \(to age 100\)/.test(groU.tooltip) && /Birth ±2 also sent/.test(groU.tooltip), groU.tooltip);
check("unknown death: probate gets only its own coverage, no birth window", /q\.deathLikeDate\.from=1939&q\.deathLikeDate\.to=1957/.test(find(o, /probate/).url) && !/birthLikeDate/.test(find(o, /probate/).url));
check("unknown death: Find A Grave gets the whole window", /q\.deathLikeDate\.from=1939&q\.deathLikeDate\.to=1980&f\.collectionId=2221801$/.test(find(o, /^Find A Grave/).url));
// A woman b. 1917, m. 1939 Roberts, no later evidence → 1939–2017 reaches BOTH E&W civil tiers.
const ethelU = {
  id: "E1", given: "Ethel May", surname: "Hiscocks", sex: "Female", living: false, fullName: "Ethel May Hiscocks",
  birthYear: "1917", birthPlace: "Fishponds, Gloucestershire, England", deathYear: null, deathPlace: "",
  spouseSurnames: ["Roberts"], marriedSurnames: ["Roberts"],
  spouses: [{ name: "John Roberts", surname: "Roberts", id: "Y", marriageDate: "1939", marriageYear: "1939", marriagePlace: "Bristol, England" }],
};
o = opts(ethelU);
check("unknown death, woman: both E&W civil tiers (GRO 1939–2007 + Death Records 1998–2015) under the married surname", labelsIn(o, "Death")[0] === "E&W GRO Death Index 1837–2007 — 1939–2007 (death year unknown)" && labelsIn(o, "Death")[1] === "England Death Records 1998–2015 — 1998–2015 (death year unknown)" && o.filter((x) => x.group === "Death").every((x) => /q\.surname=Roberts/.test(x.url)), JSON.stringify(labelsIn(o, "Death")));
check("unknown death, woman: last seen = the 1939 marriage", /last seen 1939 \(1939 marriage\)/.test(find(o, /^E&W GRO Death/).tooltip));
// No birth year at all: window = last seen + 70, no ages, no birth filter.
const noBirthU = { ...thomasU, id: "N1", given: "William", surname: "Brain", birthYear: null, birthPlace: "Leeds, Yorkshire, England", facts: [], attachedSources: null,
  spouseSurnames: ["Smith"], spouses: [{ name: "Ann Smith", surname: "Smith", id: "Z", marriageDate: "1850", marriageYear: "1850", marriagePlace: "Leeds, Yorkshire, England" }] };
o = opts(noBirthU);
check("unknown death, no birth year: window 1850–1920 (last seen + 70), no age wording, no birth filter", find(o, /^E&W GRO Death/).label === "E&W GRO Death Index 1837–2007 — 1850–1920 (death year unknown)" && !/to age/.test(find(o, /^E&W GRO Death/).tooltip) && !/birthLikeDate/.test(find(o, /^E&W GRO Death/).url), find(o, /^E&W GRO Death/).tooltip);
check("unknown death, nothing dates the person: the old behaviour (one tier, no dates)", (() => { const q = opts({ ...noBirthU, spouses: [], spouseSurnames: [] }); const g = find(q, /^E&W GRO Death/); return g.label === "E&W GRO Death Index 1837–2007" && !/deathLikeDate/.test(g.url) && labelsIn(q, "Death").length === 4; })());
check("known death unchanged: Doris's GRO death entry carries no window suffix", find(opts(doris), /GRO Death/).label === "E&W GRO Death Index 1837–2007");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASS");
// v0.2.123 — uniform census titles: the FamilySearch label is "<year> <Where> Census — <full name>"
// (the shared wording of every menu), the 1939 Register "<year> E&W Register — <name>", a woman
// under her surname of the year; the tooltip opens with the same title.
{
  const o = opts(doris);
  const cen = labelsIn(o, "Census");
  check("v0.2.123 Doris census labels: title + full name, surname of the year, 1939 Register", JSON.stringify(cen) === JSON.stringify(["1901 E&W Census — Doris Annie Hiscocks", "1911 E&W Census — Doris Annie Hiscocks", "1921 E&W Census — Doris Annie Roberts", "1939 E&W Register — Doris Annie Roberts"]), JSON.stringify(cen));
  check("v0.2.123 census tooltip carries the same title (after any ✓ attached prefix)", o.filter((x) => x.group === "Census").every((x) => x.tooltip.includes("\n" + x.label.split(" — ")[0] + ": ") || x.tooltip.startsWith(x.label.split(" — ")[0] + ": ")), JSON.stringify(o.filter((x) => x.group === "Census").map((x) => x.tooltip)));
  check("v0.2.123 FSSE.censusTitle reads the shared table (E&W / US Federal / New York State / Register)", (() => {
    const enw = FSSE.COLLECTIONS.regions.find((r) => r.key === "enw");
    const us = FSSE.COLLECTIONS.regions.find((r) => r.key === "us");
    const ny = us.subRegions.find((s) => s.key === "ny");
    return FSSE.censusTitle({ year: 1841, region: enw, sub: null }) === "1841 E&W Census" && FSSE.censusTitle({ year: 1939, region: enw, sub: null }) === "1939 E&W Register" &&
      FSSE.censusTitle({ year: 1900, region: us, sub: null }) === "1900 US Federal Census" && FSSE.censusTitle({ year: 1905, region: us, sub: ny }) === "1905 New York State Census" &&
      FSSE.censusTitleOf(1851, "Wales") === "1851 Wales Census" && FSSE.censusTitleOf(1939, "E&W") === "1939 E&W Register";
  })());
}

process.exit(fails ? 1 : 0);
