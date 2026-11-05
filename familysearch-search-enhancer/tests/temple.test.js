// temple.test.js — the Temple-dropdown links (v0.2.63; the Labs-experiment row v1.0.2): registry
// shape, anchor chains, the static campaign URLs and the fourth row's labs.js-free fallbacks (its
// stateful URL / confirm question / tooltip are in labs.test.js). (The dropdown itself is
// members-only DOM — Kevin verifies live.) Run: node tests/run.js temple
const path = require("path");
const SRC = path.join(__dirname, "..", "src");
globalThis.FSSE = { log() {}, deepElements: () => [] };
globalThis.location = { pathname: "/en/tree/person/details/LH18-4BZ", origin: "https://www.familysearch.org" };
require(path.join(SRC, "sources.js"));
require(path.join(SRC, "fs-collections.js"));
require(path.join(SRC, "sites.js"));

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const byId = (id) => FSSE.SITES.find((s) => s.id === id);
const to = byId("temple-opportunities");
const foo = byId("family-ordinance-opportunities");
const ro = byId("remaining-ordinances");
const fro = byId("family-remaining-ordinances");
const all = [to, foo, ro, fro];

check("four temple sites exist, all section: temple", all.every((s) => !!s && s.section === "temple"));
check("every other site has NO section (search panel default)", FSSE.SITES.every((s) => s.section === "temple" || s.section == null));
check("no person dependence: no applies, buildUrl on all four", all.every((s) => !s.applies && typeof s.buildUrl === "function"));
check("sameTab on all four (native-link behavior, v0.2.65)", all.every((s) => s.sameTab === true));
check("no other site uses sameTab (searches keep opening new tabs)", FSSE.SITES.every((s) => s.sameTab !== true || s.section === "temple"));
check("Temple Opportunities anchors on Ordinances Ready", to.anchorLabel === "Ordinances Ready" && to.position === "after");
check("chain: Family Ordinance Opportunities after Temple Opportunities", foo.anchorLabel[0] === "Temple Opportunities" && foo.anchorLabel.includes("Ordinances Ready"));
check("chain: Remaining after Family Ordinance Opportunities", ro.anchorLabel[0] === "Family Ordinance Opportunities" && ro.anchorLabel.includes("Ordinances Ready"));
check("chain: Families with Remaining Ordinances after Remaining Temple Ordinances (v1.0.2)", fro.anchorLabel[0] === "Remaining Temple Ordinances" && fro.anchorLabel.includes("Ordinances Ready") && fro.position === "after");
check("SITES order matches the chain (each anchor injected before its dependant)",
  FSSE.SITES.indexOf(to) < FSSE.SITES.indexOf(foo) && FSSE.SITES.indexOf(foo) < FSSE.SITES.indexOf(ro) && FSSE.SITES.indexOf(ro) < FSSE.SITES.indexOf(fro));
check("Temple Opportunities URL", to.buildUrl({}) === "https://www.familysearch.org/en/campaign/temple-opportunity");
check("Family Ordinance Opportunities URL", foo.buildUrl({}) === "https://www.familysearch.org/en/campaign/family-ordinance-opportunities");
check("Remaining Temple Ordinances URL", ro.buildUrl({}) === "https://www.familysearch.org/en/campaign/remaining-ordinances");
check("Families with Remaining Ordinances: without labs.js loaded the page itself, no question asked, Shift+click → Labs",
  fro.buildUrl({}, {}) === "https://www.familysearch.org/en/temple/family-remaining-ordinances" && fro.confirmText({}, {}) === null && fro.buildUrl({}, { shift: true }) === "https://www.familysearch.org/en/labs/");
check("labels as Kevin specified",
  to.label === "Temple Opportunities" && foo.label === "Family Ordinance Opportunities" && ro.label === "Remaining Temple Ordinances" && fro.label === "Families with Remaining Ordinances");
// v0.2.68 (Kevin's ask): tooltips DESCRIBE the tool — no URL echo, no bare label repeat.
// (injectRow word-wraps them at 40 chars via FSSE.wrapTip, so the strings stay one line here.)
check("tooltips describe, not URL/label echoes",
  all.every((s) => s.tooltip && !s.tooltip.includes("familysearch.org") && s.tooltip.toLowerCase() !== s.label.toLowerCase() && s.tooltip.length > 40));
check("only the Labs-experiment row carries describe + confirmText (the campaign rows are static)",
  [to, foo, ro].every((s) => !s.describe && !s.confirmText) && typeof fro.describe === "function" && typeof fro.confirmText === "function" && fro.describe({}) === fro.tooltip);

process.exit(fails ? 1 : 0);
