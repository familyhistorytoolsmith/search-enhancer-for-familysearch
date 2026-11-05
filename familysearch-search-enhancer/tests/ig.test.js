// ig.test.js — the IrishGenealogy.ie menu (v0.2.60): Irish gating, the civil rolling-release
// clamps (births 1864–1926, marriages 1845–1951, deaths 1864–1976 at IG_NOW=2026), church
// companions, and the Sourcer URL grammar. Run: node tests/run.js ig
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/L81M-MJX", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const site = FSSE.SITES.find((s) => s.id === "irishgenealogy");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);

// 1. Registry shape.
check("irishgenealogy site exists with options()", !!site && typeof site.options === "function");
check("own icon", site.icon === "icons/ig32.png", site.icon);
check("anchors after the RootsIreland row", site.anchorLabel[0] === "RootsIreland ▸" && site.position === "after");
check("listed AFTER rootsireland in SITES (renders right after it)",
  FSSE.SITES.findIndex((s) => s.id === "irishgenealogy") > FSSE.SITES.findIndex((s) => s.id === "rootsireland"));

// 2. Edward: b. 1842 Donegal — before civil registration → church baptisms only.
const edward = {
  id: "L81M-MJX", given: "Edward", surname: "Cummings", sex: "Male", living: false, fullName: "Edward Cummings",
  birthYear: "1842", birthPlace: "Clonleigh, Donegal, Ireland", deathYear: "1922", deathPlace: "Perth, Western Australia, Australia",
  spouseSurnames: ["Fuller"], marriedSurnames: [],
  spouses: [{ name: "Jane Fuller", surname: "Fuller", id: "F", marriageDate: "1871", marriageYear: "1871", marriagePlace: "Cobden, Victoria, Australia" }],
};
let o = opts(edward);
console.log("Edward:", o.map((x) => x.label).join(" | "));
check("pre-1864 birth → church baptisms only", o.length === 1 && /Church baptisms/.test(o[0].label), o.map((x) => x.label).join(" | "));
check("church URL grammar", o[0].url === "https://www.irishgenealogy.ie/search/?church-or-civil=church&firstname=Edward&lastname=Cummings&yearStart=1840&yearEnd=1844&event-baptisms=1", o[0].url);
check("church tooltip warns about partial diocese coverage", /absence proves nothing/.test(o[0].tooltip), o[0].tooltip);
check("applies true for Edward", site.applies(edward) === true);

// 3. Bridget: all-Irish life → civil + church pairs where the releases allow.
const bridget = {
  id: "X", given: "Bridget Mary", surname: "Kelly", sex: "Female", living: false, fullName: "Bridget Mary Kelly",
  birthYear: "1850", birthPlace: "Ballina, Mayo, Ireland", deathYear: "1920", deathPlace: "Sligo, Ireland",
  spouseSurnames: ["Walsh"], marriedSurnames: ["Walsh"],
  spouses: [{ name: "John Walsh", surname: "Walsh", id: "W", marriageDate: "1872", marriageYear: "1872", marriagePlace: "Castlebar, Mayo, Ireland" }],
};
o = opts(bridget);
console.log("Bridget:", o.map((x) => x.label).join(" | "));
check("5 entries: church baptism, civil+church marriage, civil+church death", o.length === 5, o.map((x) => x.label).join(" | "));
const cm = o.find((x) => /Civil marriages/.test(x.label));
check("civil marriage 1870–1874 under the maiden name",
  !!cm && /church-or-civil=civil/.test(cm.url) && /lastname=Kelly/.test(cm.url) && /yearStart=1870&yearEnd=1874&event-marriage=1/.test(cm.url), cm && cm.url);
const cd = o.find((x) => /Civil deaths/.test(x.label));
check("civil death 1918–1922 under the married surname",
  !!cd && /lastname=Walsh/.test(cd.url) && /yearStart=1918&yearEnd=1922&event-death=1/.test(cd.url), cd && cd.url);
check("church burial under Walsh too", o.some((x) => /Church burials — Bridget Walsh/.test(x.label)));
check("first given name only", o.every((x) => /firstname=Bridget&/.test(x.url)));

// 4. Mother's maiden surname on civil births when the tree knows her.
o = opts({ ...bridget, birthYear: "1900", mother: { name: "Sarah Jones", given: "Sarah", surname: "Jones" } });
const cb = o.find((x) => /Civil births/.test(x.label));
check("1900 birth → civil entry with mothers-surname=Jones",
  !!cb && /yearStart=1898&yearEnd=1902&event-birth=1&mothers-surname=Jones/.test(cb.url), cb && cb.url);

// 5. Rolling-release clamps.
check("death 1990 → civil death withheld (released 50 years on), church burial offered", (() => {
  const q = opts({ ...bridget, deathYear: "1990" });
  return !q.some((x) => /Civil deaths/.test(x.label)) && q.some((x) => /Church burials/.test(x.label));
})(), opts({ ...bridget, deathYear: "1990" }).map((x) => x.label).join(" | "));
check("undated Irish spouse → church marriage without years, no civil", (() => {
  const q = opts({ ...bridget, spouses: [{ name: "John Walsh", surname: "Walsh", id: "W", marriageDate: "", marriageYear: null, marriagePlace: "Castlebar, Mayo, Ireland" }] });
  const marr = q.filter((x) => x.group === "Marriages");
  return marr.length === 1 && /Church marriages/.test(marr[0].label) && !/yearStart/.test(marr[0].url);
})());

// 6. Gating.
check("no Irish events → no entries, applies false", (() => {
  const p = { ...edward, birthPlace: "Crayke, Yorkshire, England" };
  return opts(p).length === 0 && site.applies(p) === false;
})());
check("living person → no Deaths group", !opts({ ...bridget, living: true }).some((x) => x.group === "Deaths"));
check("describe mentions free images", /FREE images/.test(site.describe(bridget)), site.describe(bridget));

process.exit(fails ? 1 : 0);
