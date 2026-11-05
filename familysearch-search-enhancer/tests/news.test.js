// news.test.js — the Newspapers menu (v0.2.55): region gating, maiden+married name entries,
// per-site URL grammar and coverage clamps. Run: node tests/run.js news
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/27XF-DZX", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const site = FSSE.SITES.find((s) => s.id === "newspapers");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);

// 1. Registry shape.
check("newspapers site exists with options()", !!site && typeof site.options === "function");
check("own icon", site.icon === "icons/news32.png", site.icon);
check("anchors after the ScotlandsPeople row", site.anchorLabel[0] === "ScotlandsPeople ▸" && site.position === "after");

// 2. Ellen: US woman, b. 1864 MA, m. 1882 Murphy + 1889 Bunker, d. 1930 NY.
const ellen = {
  id: "27XF-DZX", given: "Ellen E", surname: "Hurley", sex: "Female", living: false, fullName: "Ellen E Hurley",
  birthYear: "1864", birthPlace: "Worcester, Massachusetts, United States", deathYear: "1930", deathPlace: "Brooklyn, Kings, New York, United States",
  spouseSurnames: ["Murphy", "Bunker"], marriedSurnames: ["Murphy", "Bunker"],
  spouses: [
    { name: "John Murphy", surname: "Murphy", id: "A", marriageDate: "17 Mar 1882", marriageYear: "1882", marriagePlace: "Worcester, Massachusetts, United States" },
    { name: "Frank Bunker", surname: "Bunker", id: "B", marriageDate: "22 May 1889", marriageYear: "1889", marriagePlace: "Worcester, Massachusetts, United States" },
  ],
};
let o = opts(ellen);
console.log("Ellen:", o.map((x) => x.label).join(" | "));
check("groups = Worldwide + United States", [...new Set(o.map((x) => x.group))].join("|") === "Worldwide|United States", [...new Set(o.map((x) => x.group))].join("|"));
check("3 names × 4 sites = 12 entries", o.length === 12, String(o.length));
const npMaiden = o.find((x) => /Newspapers\.com — "Ellen Hurley"/.test(x.label));
check("Newspapers.com maiden: quoted phrase + dr_year 1864-1932",
  !!npMaiden && npMaiden.url === `https://www.newspapers.com/search?query=${encodeURIComponent('"Ellen Hurley"')}&dr_year=1864-1932`, npMaiden && npMaiden.url);
const npBunker = o.find((x) => /Newspapers\.com — "Ellen Bunker"/.test(x.label));
check("married entry starts at the 1889 marriage", !!npBunker && /dr_year=1889-1932/.test(npBunker.url), npBunker && npBunker.url);
const gb = o.find((x) => /GenealogyBank — "Ellen Hurley"/.test(x.label));
check("GenealogyBank: fname/lname + rgfromdate/rgtodate",
  !!gb && /fname=Ellen&lname=Hurley/.test(gb.url) && /rgfromdate=1864&rgtodate=1932&dateType=range/.test(gb.url), gb && gb.url);
const ca = o.find((x) => /Chronicling America — "Ellen Hurley"/.test(x.label));
check("Chronicling America: loc.gov PHRASE grammar with full dates",
  !!ca && /loc\.gov\/collections\/chronicling-america\//.test(ca.url) && /ops=PHRASE/.test(ca.url) &&
  /qs=Ellen%20Hurley/.test(ca.url) && /start_date=1864-01-01&end_date=1932-12-31/.test(ca.url), ca && ca.url);
check("first given name only in the phrase (Ellen, not Ellen E)", !/Ellen%20E%20/.test(npMaiden.url), npMaiden.url);

// 3. Charles: E&W → Worldwide + UK & Ireland; FMP single-year+offset math.
const charles = {
  id: "LH18-4BZ", given: "Charles", surname: "Bellwood", sex: "Male", living: false, fullName: "Charles Bellwood",
  birthYear: "1805", birthPlace: "Crayke, Yorkshire, England", deathYear: "1879", deathPlace: "York, Yorkshire, England",
  spouseSurnames: ["Stephenson"], marriedSurnames: [], spouses: [],
};
o = opts(charles);
console.log("Charles:", o.map((x) => x.label).join(" | "));
check("groups = Worldwide + UK & Ireland", [...new Set(o.map((x) => x.group))].join("|") === "Worldwide|UK & Ireland");
const fmp = o.find((x) => /Findmypast newspapers/.test(x.label));
check("FMP: sid=100 dataset with birth/death ±2, name variants, sourcecountry=england",
  !!fmp && /\/search\/results\?sid=100&firstname=Charles&firstname_variants=true&lastname=Bellwood/.test(fmp.url) &&
  /yearofbirth=1805&yearofbirth_offset=2/.test(fmp.url) && /yearofdeath=1879&yearofdeath_offset=2/.test(fmp.url) &&
  /keywordsplace_proximity=5/.test(fmp.url) && /sourcecountry=england/.test(fmp.url), fmp && fmp.url);
check("no US entries for Charles", !o.some((x) => x.group === "United States"));
// Scotland-only footprint → sourcecountry=scotland; a Welsh place → no country filter.
let fmp2 = opts({ ...charles, birthPlace: "Hamilton, Lanark, Scotland", deathPlace: "Glasgow, Scotland" }).find((x) => /Findmypast/.test(x.label));
check("Scotland-only person → sourcecountry=scotland", !!fmp2 && /sourcecountry=scotland/.test(fmp2.url), fmp2 && fmp2.url);
fmp2 = opts({ ...charles, birthPlace: "Cardiff, Glamorgan, Wales", deathPlace: "Cardiff, Wales" }).find((x) => /Findmypast/.test(x.label));
check("Wales-touched person → no sourcecountry (Welsh + English papers both apply)", !!fmp2 && !/sourcecountry/.test(fmp2.url), fmp2 && fmp2.url);

// 4. Edward: Ireland birth + Australia marriage/death → UK & Ireland + Australia.
const edward = {
  id: "L81M-MJX", given: "Edward", surname: "Cummings", sex: "Male", living: false, fullName: "Edward Cummings",
  birthYear: "1842", birthPlace: "Clonleigh, Donegal, Ireland", deathYear: "1922", deathPlace: "Perth, Western Australia, Australia",
  spouseSurnames: ["Fuller"], marriedSurnames: [],
  spouses: [{ name: "Jane Fuller", surname: "Fuller", id: "F", marriageDate: "1871", marriageYear: "1871", marriagePlace: "Cobden, Victoria, Australia" }],
};
o = opts(edward);
console.log("Edward:", o.map((x) => x.label).join(" | "));
const trove = o.find((x) => /Trove/.test(x.label));
check("Trove: advanced grammar, phrase + date.from/to", !!trove &&
  /trove\.nla\.gov\.au\/search\/advanced\/category\/newspapers/.test(trove.url) &&
  /keyword\.phrase=Edward%20Cummings/.test(trove.url) && /date\.from=1842&date\.to=1924/.test(trove.url), trove && trove.url);
check("Edward also gets the UK & Ireland group (Irish birth)", o.some((x) => x.group === "UK & Ireland"));

// 5. NZ person → Papers Past with the 1992 clamp.
o = opts({ ...charles, birthPlace: "Dunedin, Otago, New Zealand", deathYear: "1995", deathPlace: "Auckland, New Zealand" });
const pp = o.find((x) => /Papers Past/.test(x.label));
check("Papers Past: query + dd-mm-yyyy dates, end clamped to 1992",
  !!pp && /paperspast\.natlib\.govt\.nz\/newspapers\?query=/.test(pp.url) && /start_date=01-01-1837&end_date=31-12-1992/.test(pp.url), pp && pp.url);

// 6. Coverage skips + missing-year handling.
o = opts({ ...ellen, birthYear: "1970", deathYear: null, deathPlace: "Boston, Massachusetts, United States", living: true, spouses: [], spouseSurnames: [], marriedSurnames: [] });
check("born 1970 → Chronicling America skipped (run ends 1963), GenealogyBank kept",
  !o.some((x) => /Chronicling America/.test(x.label)) && o.some((x) => /GenealogyBank/.test(x.label)), o.map((x) => x.label).join(" | "));
check("no death → window = birth+82", /dr_year=1970-2052/.test(o.find((x) => /Newspapers\.com/.test(x.label)).url));
const on = opts(ellen).find((x) => /OldNews/.test(x.label));
check("OldNews: qkeyword + qpublication-date range + quoted q (Kevin's live grammar)",
  !!on && on.url === `https://www.oldnews.com/en/search?qkeyword=${encodeURIComponent("Ellen Hurley")}&qpublication-date=${encodeURIComponent("+year=1864+matchExactly=1+yearTo=1932")}&q=${encodeURIComponent('"Ellen Hurley"')}`, on && on.url);
check("OldNews without life bounds → no qpublication-date",
  !/qpublication-date/.test(opts({ ...ellen, birthYear: null, birthPlace: "", deathYear: null, deathPlace: "Boston, Massachusetts, United States", spouses: [], spouseSurnames: [], marriedSurnames: [] }).find((x) => /OldNews/.test(x.label)).url));

// 7. Gating edges.
check("post-death marriage surname dropped", !opts({ ...ellen, deathYear: "1885" }).some((x) => /Bunker/.test(x.label)));
check("no given name → no entries, applies false", opts({ ...ellen, given: "" }).length === 0 && site.applies({ ...ellen, given: "" }) === false);
check("describe names the groups", /Worldwide/.test(site.describe(ellen)) && /United States/.test(site.describe(ellen)), site.describe(ellen));

// 8. v0.2.133 — the Findmypast newspapers entries follow the "Findmypast opens on" setting.
FSSE.settings = { loaded: true, get: (k) => (k === "host.findmypast" ? "findmypast.co.uk" : undefined) };
const fmpNews = opts(charles).filter((x) => /Findmypast newspapers/.test(x.label));
check("settings: host.findmypast = findmypast.co.uk → the Findmypast newspapers entries open on www.findmypast.co.uk, the other sites untouched",
  fmpNews.length > 0 && fmpNews.every((x) => /^https:\/\/www\.findmypast\.co\.uk\/search\/results\?sid=100/.test(x.url)) && opts(charles).filter((x) => !/Findmypast/.test(x.label)).every((x) => !/findmypast/.test(x.url)), fmpNews.map((x) => x.url).join(" | "));
delete FSSE.settings;
check("settings: nothing stored → findmypast.com as before", opts(charles).filter((x) => /Findmypast newspapers/.test(x.label)).every((x) => /^https:\/\/www\.findmypast\.com\//.test(x.url)));

process.exit(fails ? 1 : 0);
