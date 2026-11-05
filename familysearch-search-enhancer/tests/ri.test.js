// ri.test.js — the RootsIreland menu (v0.2.59): Irish-event gating, county detection, the
// county + all-Ireland entry pairs, and the anonymous GET quick-search grammar (probed live
// 2026-09-04). Run: node tests/run.js ri
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/L81M-MJX", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));
const site = FSSE.SITES.find((s) => s.id === "rootsireland");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const opts = (p) => site.options(p);

// 1. Registry shape.
check("rootsireland site exists with options()", !!site && typeof site.options === "function");
check("own shamrock icon", site.icon === "icons/ri32.png", site.icon);
check("anchors after the ScotlandsPeople row", site.anchorLabel[0] === "ScotlandsPeople ▸" && site.position === "after");
check("listed AFTER newspapers in SITES (renders between SP and Newspapers)",
  FSSE.SITES.findIndex((s) => s.id === "rootsireland") > FSSE.SITES.findIndex((s) => s.id === "newspapers"));

// 2. Edward: b. 1842 Clonleigh, Donegal — Irish birth only (marriage + death in Australia).
const edward = {
  id: "L81M-MJX", given: "Edward", surname: "Cummings", sex: "Male", living: false, fullName: "Edward Cummings",
  birthYear: "1842", birthPlace: "Clonleigh, Donegal, Ireland", deathYear: "1922", deathPlace: "Perth, Western Australia, Australia",
  spouseSurnames: ["Fuller"], marriedSurnames: [],
  spouses: [{ name: "Jane Fuller", surname: "Fuller", id: "F", marriageDate: "1871", marriageYear: "1871", marriagePlace: "Cobden, Victoria, Australia" }],
};
let o = opts(edward);
console.log("Edward:", o.map((x) => x.label).join(" | "));
check("births only — county + all-Ireland pair", o.length === 2 && o.every((x) => x.group === "Births"), o.map((x) => x.label).join(" | "));
check("Donegal centre URL", o[0].label === "Donegal — Edward Cummings, 1842 ±5" &&
  o[0].url === "https://rootsireland.ie/donegal/search.php?surname=Cummings&firstname=Edward&year=1842", o[0].url);
check("all-Ireland URL", /All Ireland/.test(o[1].label) &&
  o[1].url === "https://www.rootsireland.ie/ifhf/search.php?surname=Cummings&firstname=Edward&year=1842", o[1].url);
check("no Marriage/Death groups (Australian events)", !o.some((x) => x.group !== "Births"));
check("tooltip says searching is free, records need a subscription", /free/.test(o[0].tooltip) && /subscription/.test(o[0].tooltip), o[0].tooltip);
check("applies true for Edward", site.applies(edward) === true);

// 3. A fully Irish person: birth + marriage + death, married woman under her married surname.
const bridget = {
  id: "X", given: "Bridget Mary", surname: "Kelly", sex: "Female", living: false, fullName: "Bridget Mary Kelly",
  birthYear: "1850", birthPlace: "Ballina, Mayo, Ireland", deathYear: "1920", deathPlace: "Sligo, Ireland",
  spouseSurnames: ["Walsh"], marriedSurnames: ["Walsh"],
  spouses: [{ name: "John Walsh", surname: "Walsh", id: "W", marriageDate: "1872", marriageYear: "1872", marriagePlace: "Castlebar, Mayo, Ireland" }],
};
o = opts(bridget);
console.log("Bridget:", o.map((x) => x.label).join(" | "));
check("births + marriage + death pairs = 6 entries", o.length === 6, String(o.length));
check("marriage searched under the maiden name at 1872",
  o.some((x) => x.group === "Marriages" && /Mayo — Bridget Kelly, 1872/.test(x.label) && /mayo\/search\.php\?surname=Kelly/.test(x.url)), o.filter((x) => x.group === "Marriages").map((x) => x.label).join(" | "));
check("death under the married surname in Sligo",
  o.some((x) => x.group === "Deaths" && /Sligo — Bridget Walsh, 1920/.test(x.label) && /sligo\/search\.php\?surname=Walsh/.test(x.url)), o.filter((x) => x.group === "Deaths").map((x) => x.label).join(" | "));
check("first given name only (Bridget, not Bridget Mary)", o.every((x) => /firstname=Bridget(&|$)/.test(x.url)));

// 4. County mapping edges.
const countyOf = (pl) => {
  const q = opts({ ...edward, birthPlace: pl });
  return q.length && !/All Ireland/.test(q[0].label) ? q[0].label.split(" — ")[0] : "(none)";
};
check("Londonderry → Derry centre", countyOf("Coleraine, Londonderry, Ireland") === "Derry", countyOf("Coleraine, Londonderry, Ireland"));
check("Cork → the Mallow centre", countyOf("Mallow, Cork, Ireland") === "Cork (Mallow centre)" &&
  /corknortheast\/search\.php/.test(opts({ ...edward, birthPlace: "Mallow, Cork, Ireland" })[0].url));
check("Dublin defaults to the North centre", countyOf("Dublin, Ireland") === "Dublin (North)");
check("bare 'Ireland' → all-Ireland entry only", (() => {
  const q = opts({ ...edward, birthPlace: "Ireland" });
  return q.length === 1 && /All Ireland/.test(q[0].label);
})(), opts({ ...edward, birthPlace: "Ireland" }).map((x) => x.label).join(" | "));

// 5. Gating.
check("unknown birth year → entry without the year param", (() => {
  const q = opts({ ...edward, birthYear: null });
  return q.length === 2 && !/year=/.test(q[0].url) && /Edward Cummings$/.test(q[0].label.replace(/^Donegal — /, ""));
})(), opts({ ...edward, birthYear: null }).map((x) => x.url).join(" | "));
check("no Irish events → no entries, applies false", (() => {
  const p = { ...edward, birthPlace: "Crayke, Yorkshire, England", deathPlace: "York, England" };
  return opts(p).length === 0 && site.applies(p) === false;
})());
check("living person with an Irish death place → no Deaths group", !opts({ ...bridget, living: true }).some((x) => x.group === "Deaths"));
check("describe mentions free counts + subscription", /free/.test(site.describe(edward)) && /subscription/.test(site.describe(edward)), site.describe(edward));

process.exit(fails ? 1 : 0);
