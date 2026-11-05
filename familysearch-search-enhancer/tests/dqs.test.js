// dqs.test.js — the numeric Quality Score tooltip (v0.2.90): the page-world listener
// (src/dqs-listen.js) on a fake window (fetch + XHR + late pings), and the isolated side
// (src/dqs.js): payload summary, grade thresholds, the mean-of-three projection model with
// its self-check, action wording, the option-B tooltip byte-exact for Thomas Gourley Park
// GJJ3-YGN (Kevin's pasted payload, 2026-09-21), and the badge finder / title application
// on a fake person page. Run: node tests/run.js dqs
const path = require("path");
const SRC = path.join(__dirname, "..", "src");

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};
const near = (a, b, eps) => typeof a === "number" && Math.abs(a - b) < (eps || 1e-4);

// ---- Thomas Gourley Park's payload (the parts the feature reads; bulky parts stubbed) -----
const crit = (num, den) => ({ rawNumerator: num, displayNumerator: num, denominator: den, displayScore: num / den, rawScore: num / den });
const THOMAS = {
  personScores: {
    coherenceScore: crit(1, 1),
    completenessScore: crit(16, 24),
    consistencyScore: { rawNumerator: 27, displayNumerator: 28, denominator: 28, displayScore: 1.0, rawScore: 27 / 28 },
    verifiabilityScore: crit(7, 11),
    conclusionScores: [{ conclusionType: "NAME", combinedDisplayScore: 1.0 }, { conclusionType: "DEATH", combinedDisplayScore: 0.8888888888888888 }],
    dismissedIssues: [
      { type: "NameIssue", conclusionName: "Park", conclusionType: "NAME", id: "CONSISTENCY:SURNAME_MISMATCH:1:1:QV8K-ZR5X", issueType: "SURNAME_MISMATCH", penalty: 1.0, scoreType: "CONSISTENCY", sourceName: "Boddey", dismissal: { reason: "This is correct" } },
    ],
    issues: [
      { type: "EventCompletenessIssue", conclusionType: "BURIAL", dismissible: true, id: "COMPLETENESS:MISSING_EVENT:BURIAL", issueType: "MISSING_EVENT", penalty: 0.25, scoreType: "COMPLETENESS" },
      { type: "EventCompletenessIssue", conclusionId: "f04ab1a8", conclusionType: "DEATH", dismissible: true, formalDate: "+1985", id: "COMPLETENESS:MONTH_NOT_SPECIFIED:DEATH:f04ab1a8", issueType: "MONTH_NOT_SPECIFIED", originalDate: "1985", originalPlace: "Stoke Upon Trent, Staffordshire, England, United Kingdom", penalty: 0.08333333333333334, placeId: 3041518, scoreType: "COMPLETENESS" },
      { type: "MultipleTagsInSameCensusIssue", sourceTitle: "\"England and Wales, National Register, 1939\"", sourceUri: "https://www.familysearch.org/platform/records/collections/2836130", numTags: 2, penalty: 0.36363636363636365, dismissible: true, id: "VERIFIABILITY:MULTIPLE_TAGS_IN_SAME_CENSUS:2836130:+1939-09-29", issueType: "MULTIPLE_TAGS_IN_SAME_CENSUS", scoreType: "VERIFIABILITY" },
    ],
    lang: "en",
    overallDisplayScore: 0.7676767676767676,
    overallRawScore: 0.7557720057720058,
    pid: "GJJ3-YGN",
    segment: "United Kingdom 1800 - 1920",
    sourceClusters: { sourceClusters: [{ sources: [{ uri: "x", title: "y", conclusions: [] }] }], conflicts: [] },
    visibility: "PUBLIC",
  },
  visibility: "PUBLIC",
  isValid: true,
};
const SCORES_URL = "https://www.familysearch.org/service/tree/tree-data/quality/person/GJJ3-YGN/scores?treeId=PRIVATE";

// =========================================================================================
// 1. The page-world listener on a fake window
// =========================================================================================
const listen = require(path.join(SRC, "dqs-listen.js"));
check("SCORES_RE matches the scores URL and captures the PID", listen.SCORES_RE.exec(SCORES_URL)[1] === "GJJ3-YGN");
check("SCORES_RE rejects other tree-data reads", !listen.SCORES_RE.test("https://www.familysearch.org/service/tree/tree-data/persons/GJJ3-YGN/details") && !listen.SCORES_RE.test("/service/tree/tree-data/quality/person/GJJ3-YGN/issues"));
const slim = listen.slim(THOMAS);
check("slim keeps isValid + scores + issues, drops conclusionScores/sourceClusters", slim.isValid === true && slim.personScores.overallDisplayScore === THOMAS.personScores.overallDisplayScore && slim.personScores.issues.length === 3 && !("conclusionScores" in slim.personScores) && !("sourceClusters" in slim.personScores));
check("slim of an unscored payload keeps personScores null", listen.slim({ isValid: true, personScores: null }).personScores === null);

function fakeWindow(fetchBody) {
  const win = { posted: [], listeners: {}, location: { origin: "https://www.familysearch.org" } };
  win.postMessage = (msg, origin) => win.posted.push({ msg, origin });
  win.addEventListener = (t, fn) => (win.listeners[t] = win.listeners[t] || []).push(fn);
  win.dispatch = (t, e) => (win.listeners[t] || []).forEach((fn) => fn(e));
  win.fetchCalls = [];
  win.fetch = function (input, init) {
    win.fetchCalls.push({ input, init, self: this });
    const body = typeof fetchBody === "function" ? fetchBody(input) : fetchBody;
    const res = { ok: true, status: 200, cloned: 0, clone() { this.cloned++; return this; }, text: () => Promise.resolve(body) };
    return Promise.resolve(res);
  };
  function XHR() { this._l = {}; }
  XHR.prototype.open = function (m, u) { this.opened = [m, u]; };
  XHR.prototype.send = function () { this.sent = true; };
  XHR.prototype.addEventListener = function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); };
  XHR.prototype.fire = function (t) { (this._l[t] || []).forEach((fn) => fn.call(this)); };
  win.XMLHttpRequest = XHR;
  return win;
}

(async () => {
  const win = fakeWindow(JSON.stringify(THOMAS));
  const inst = listen.install(win);
  check("install wraps fetch once (second install is a no-op)", listen.install(win) === null && typeof win.fetch === "function");
  const r1 = await win.fetch(SCORES_URL, { headers: {} });
  await new Promise((r) => setTimeout(r, 5));
  check("the page's own fetch still returns its response untouched", r1 && r1.ok && win.fetchCalls.length === 1 && win.fetchCalls[0].input === SCORES_URL);
  check("a scores response is read from a CLONE (the page's body is never consumed)", r1.cloned === 1);
  check("one FSSE_DQS message posted to the page origin with the PID + slim payload", win.posted.length === 1 && win.posted[0].origin === "https://www.familysearch.org" && win.posted[0].msg.source === "fsse-dqs-page" && win.posted[0].msg.type === "FSSE_DQS" && win.posted[0].msg.pid === "GJJ3-YGN" && win.posted[0].msg.payload.personScores.issues.length === 3 && !win.posted[0].msg.payload.personScores.sourceClusters);
  await win.fetch("https://www.familysearch.org/service/tree/tree-data/persons/GJJ3-YGN/details");
  await new Promise((r) => setTimeout(r, 5));
  check("a non-scores fetch posts nothing and is not cloned", win.posted.length === 1);
  await win.fetch({ url: SCORES_URL.replace("GJJ3-YGN", "LJRD-PJ2") }); // a Request object
  await new Promise((r) => setTimeout(r, 5));
  check("a Request-object fetch is recognised by its .url", win.posted.length === 2 && win.posted[1].msg.pid === "LJRD-PJ2");
  // late ping from the isolated world: one PID, then all
  win.posted.length = 0;
  win.dispatch("message", { source: win, data: { source: "fsse-dqs", type: "FSSE_DQS_REQUEST", pid: "gjj3-ygn" } });
  check("a ping for a cached PID (any case) re-posts that payload", win.posted.length === 1 && win.posted[0].msg.pid === "GJJ3-YGN");
  win.posted.length = 0;
  win.dispatch("message", { source: win, data: { source: "fsse-dqs", type: "FSSE_DQS_REQUEST", pid: null } });
  check("a ping without a PID re-posts every cached payload", win.posted.length === 2);
  win.posted.length = 0;
  win.dispatch("message", { source: win, data: { source: "fsse-dqs", type: "FSSE_DQS_REQUEST", pid: "K8TH-WMC" } });
  win.dispatch("message", { source: {}, data: { source: "fsse-dqs", type: "FSSE_DQS_REQUEST", pid: null } });
  check("unknown PID / foreign source → nothing posted", win.posted.length === 0);
  // XHR path
  const x = new win.XMLHttpRequest();
  x.open("GET", SCORES_URL);
  x.send();
  x.status = 200;
  x.responseType = "";
  x.responseText = JSON.stringify(Object.assign({}, THOMAS, { personScores: Object.assign({}, THOMAS.personScores, { overallDisplayScore: 0.5 }) }));
  x.fire("load");
  check("an XHR scores response is published too (and replaces the cached one)", x.opened[1] === SCORES_URL && x.sent === true && win.posted.length === 1 && near(win.posted[0].msg.payload.personScores.overallDisplayScore, 0.5) && near(inst.cache.get("GJJ3-YGN").personScores.overallDisplayScore, 0.5));
  const bad = fakeWindow("<html>not json</html>");
  listen.install(bad);
  await bad.fetch(SCORES_URL);
  await new Promise((r) => setTimeout(r, 5));
  check("a non-JSON body is ignored silently", bad.posted.length === 0);

  // =======================================================================================
  // 2. The isolated side
  // =======================================================================================
  globalThis.document = { body: {} };
  globalThis.location = { pathname: "/en/tree/person/details/GJJ3-YGN", origin: "https://www.familysearch.org" };
  require(path.join(SRC, "inject.js")); // the real wrapTip (tooltips wrap at 40 like the rest of the extension)
  FSSE.log = () => {};
  require(path.join(SRC, "dqs.js"));
  const D = FSSE.dqs;

  check("gradeOf: 0.85 High, 0.849 Medium, 0.4 Medium, 0.399 Low, 0 Low, junk null", D.gradeOf(0.85) === "High" && D.gradeOf(0.849) === "Medium" && D.gradeOf(0.4) === "Medium" && D.gradeOf(0.399) === "Low" && D.gradeOf(0) === "Low" && D.gradeOf(null) === null);
  check("pct: one decimal on a 0–100 scale, trailing .0 dropped", D.pct(0.7676767676767676) === "76.8" && D.pct(1) === "100" && D.pct(2 / 3) === "66.7" && D.pct(0.85) === "85" && D.pct(0.8510101) === "85.1" && D.pct("x") === "?");
  check("thresholds line", D.thresholdsLine() === "Low <40 · Medium 40–84.9 · High ≥85");

  const s = D.summarize("GJJ3-YGN", slim);
  check("summarize Thomas: score/grade/criteria/issues/dismissed/segment", s && s.available && near(s.score, 0.76767677) && s.grade === "Medium" && near(s.completeness, 2 / 3) && near(s.verifiability, 7 / 11) && s.consistency === 1 && s.coherence === 1 && s.issues.length === 3 && s.dismissed === 1 && s.segment === "United Kingdom 1800 - 1920");
  check("summarize: isValid:false = still computing → null (wait for the retry)", D.summarize("X", { isValid: false, personScores: null }) === null);
  check("summarize: Not Available (null overall) → available:false", D.summarize("K8TH-WMC", { isValid: true, personScores: { overallDisplayScore: null, segment: null } }).available === false && D.summarize("K8TH-WMC", { isValid: true, personScores: null }).available === false);
  const infoOnly = D.summarize("Y", { isValid: true, personScores: { overallDisplayScore: 1, completenessScore: crit(1, 1), verifiabilityScore: crit(1, 1), consistencyScore: crit(1, 1), coherenceScore: crit(1, 1), issues: [{ issueType: "MISSING_TAGGED_SOURCE_INFORMATIONAL", scoreType: "VERIFIABILITY", conclusionType: "RESIDENCE" }] } });
  check("summarize drops *_INFORMATIONAL issues (no penalty, not counted by FS)", infoOnly.issues.length === 0);

  check("model: mean of completeness/verifiability/consistency reproduces Thomas to 4 dp", near(D.model(s), s.score) && D.modelHolds(s));
  check("model: coherence 0 gates the whole score to 0", D.model(Object.assign({}, s, { coherence: 0 })) === 0);
  check("projected: each issue hands its penalty back to its criterion", near(D.projected(s, s.issues[2]), 0.8889, 1e-3) && near(D.projected(s, s.issues[0]), 0.8510, 1e-3) && near(D.projected(s, s.issues[1]), 0.7955, 1e-3));
  check("projected: an issue on an unknown criterion → null", D.projected(s, { scoreType: "WEIRD", penalty: 0.1 }) === null);

  const acts = D.actions(s);
  check("actions for Thomas: biggest gain first, with projections", acts.length === 3 && acts[0].text === "1939 Register tagged twice — remove one" && near(acts[0].projected, 0.8889, 1e-3) && acts[1].text === "Add a burial" && near(acts[1].projected, 0.851, 1e-3) && acts[2].text === "Add the month to the 1985 death" && near(acts[2].projected, 0.7955, 1e-3), JSON.stringify(acts));

  const EXPECTED = [
    "Quality score 76.8 · Medium",
    "Low <40 · Medium 40–84.9 · High ≥85",
    "Scored as: United Kingdom 1800 – 1920",
    "",
    "To reach High:",
    "• 1939 Register tagged twice — remove",
    "  one → 88.9",
    "• Add a burial → 85.1",
    "• Add the month to the 1985 death → 79.5",
  ].join("\n");
  const tip = D.tooltip(s, "Medium");
  check("tooltip for Thomas = the option-B mockup, byte-exact", tip === EXPECTED, JSON.stringify(tip));
  check("every tooltip line fits the 40-character wrap", tip.split("\n").every((l) => l.length <= 40));
  // v0.2.117 — the segment line (Kevin, on LBX7-P34's unexpected High).
  check("segment line: third line, FS's hyphen shown as an en dash", tip.split("\n")[2] === "Scored as: United Kingdom 1800 – 1920", tip.split("\n")[2]);
  check("segment line: absent when the payload carries no segment", (() => { const t = D.tooltip(Object.assign({}, s, { segment: null }), "Medium"); return !t.includes("Scored as") && t.split("\n")[2] === ""; })());
  check("segment line: a long segment name wraps within 40 characters", (() => { const t = D.tooltip(Object.assign({}, s, { segment: "Continental Europe 1800 - 1920" }), "Medium"); return t.split("\n").every((l) => l.length <= 40) && /Scored as: Continental Europe 1800 –/.test(t) && /1920/.test(t); })(), D.tooltip(Object.assign({}, s, { segment: "Continental Europe 1800 - 1920" }), "Medium"));
  check("segment line: a segment with no hyphen is shown as given", D.tooltip(Object.assign({}, s, { segment: "Ireland pre-1845" }), "Medium").split("\n")[2] === "Scored as: Ireland pre-1845");
  check("tooltip uses the badge's own word when given, else the computed grade", D.tooltip(s, null).startsWith("Quality score 76.8 · Medium") && D.tooltip(s, "High").startsWith("Quality score 76.8 · High"));

  // model mismatch → actions listed without numbers
  const odd = Object.assign({}, s, { score: 0.5 });
  check("self-check: when the model does not reproduce the actual score, projections are withheld", !D.modelHolds(odd) && D.actions(odd).every((a) => a.projected == null) && D.tooltip(odd, "Medium").includes("• 1939 Register tagged twice — remove\n  one\n") && !/→/.test(D.tooltip(odd, "Medium")));
  check("self-check: without numbers the order falls back to penalty size", D.actions(odd).map((a) => a.text)[0] === "1939 Register tagged twice — remove one" && D.actions(odd).map((a) => a.text)[2] === "Add the month to the 1985 death");

  // High with nothing outstanding / High with items
  const clean = D.summarize("Z", { isValid: true, personScores: { overallDisplayScore: 1, completenessScore: crit(1, 1), verifiabilityScore: crit(1, 1), consistencyScore: crit(1, 1), coherenceScore: crit(1, 1), issues: [] } });
  check("High, nothing outstanding (no segment in that payload → no segment line)", D.tooltip(clean, "High") === "Quality score 100 · High\nLow <40 · Medium 40–84.9 · High ≥85\n\nNothing outstanding.");
  check("High, nothing outstanding, with a segment", D.tooltip(Object.assign({}, clean, { segment: "United States 1800 - 1920" }), "High") === "Quality score 100 · High\nLow <40 · Medium 40–84.9 · High ≥85\nScored as: United States 1800 – 1920\n\nNothing outstanding.");
  const highItems = D.summarize("Z2", { isValid: true, personScores: { overallDisplayScore: 0.9166666666666666, completenessScore: crit(3, 4), verifiabilityScore: crit(1, 1), consistencyScore: crit(1, 1), coherenceScore: crit(1, 1), issues: [{ issueType: "MISSING_EVENT", scoreType: "COMPLETENESS", conclusionType: "BURIAL", penalty: 0.25 }] } });
  check("High with an item: 'Still outstanding' + the projection to 100", D.tooltip(highItems, "High").endsWith("Still outstanding:\n• Add a burial → 100"));

  // coherence-gated Low (the Analyzer's LJR6-M9V shape): overall 0, resolving the conflict lifts it to mean3
  const gated = D.summarize("LJR6-M9V", { isValid: true, personScores: { overallDisplayScore: 0, completenessScore: crit(7, 10), verifiabilityScore: crit(7, 10), consistencyScore: crit(8, 10), coherenceScore: crit(0, 1), issues: [{ issueType: "IMPOSSIBLE_EVENT_ORDER", scoreType: "COHERENCE", conclusionType: "DEATH", penalty: 1.0 }, { issueType: "MISSING_EVENT", scoreType: "COMPLETENESS", conclusionType: "BURIAL", penalty: 0.3 }] } });
  check("gated Low: score 0, model fits, the conflict projects to the mean of the other three (a 39-char line wraps its '→ N' whole)", gated.grade === "Low" && D.modelHolds(gated) && D.tooltip(gated, "Low").includes("• Events out of order — check the dates\n  → 73.3") && D.tooltip(gated, "Low").includes("• Add a burial → 0"), JSON.stringify(D.tooltip(gated, "Low")));

  // wording table
  const w = (i) => D.actionText(i);
  check("wording: missing place / date / month / day", w({ issueType: "MISSING_EVENT_PLACE", conclusionType: "BIRTH" }) === "Add a place to the birth" && w({ issueType: "MISSING_EVENT_PLACE", conclusionType: "BIRTH", originalDate: "9 April 1920" }) === "Add a place to the 1920 birth" && w({ issueType: "MISSING_EVENT_DATE", conclusionType: "MARRIAGE" }) === "Add a date to the marriage" && w({ issueType: "DAY_NOT_SPECIFIED", conclusionType: "BIRTH", originalDate: "April 1920" }) === "Add the day to the 1920 birth");
  check("wording: non-standard place / tag a source / census tagged N times", w({ issueType: "NON_STANDARD_PLACE", conclusionType: "MARRIAGE", originalPlace: "Blantyre" }) === "Standardize the marriage place" && w({ issueType: "MISSING_TAGGED_SOURCE", conclusionType: "RESIDENCE", originalDate: "1911" }) === "Tag a source to the 1911 residence" && w({ issueType: "MULTIPLE_TAGS_IN_SAME_CENSUS", sourceTitle: "\"England and Wales Census, 1901\"", numTags: 3 }) === "1901 Census tagged 3 times — keep one");
  check("wording: name mismatch / date-place mismatch / order / unknown type", w({ issueType: "SURNAME_MISMATCH", sourceName: "Boddey", conclusionName: "Park" }) === "Source says Boddey, tree says Park — check" && w({ issueType: "DATE_PLACE_MISMATCH_UNKNOWN_TO_YEAR", conclusionType: "BIRTH" }) === "Birth date and place disagree — check" && w({ issueType: "IMPOSSIBLE_EVENT_ORDER" }) === "Events out of order — check the dates" && w({ issueType: "SOME_NEW_THING", conclusionType: "BURIAL" }) === "Some new thing (burial)" && w({ issueType: "SOME_NEW_THING" }) === "Some new thing");
  check("censusShort falls back to a trimmed title when no year/kind", w({ issueType: "MULTIPLE_TAGS_IN_SAME_CENSUS", sourceTitle: "\"Some Very Long Collection Name Without A Year In It\"", numTags: 2 }) === "Some Very Long Collection N… tagged twice — remove one");

  // cap
  const many = D.summarize("M", { isValid: true, personScores: { overallDisplayScore: 0.5, completenessScore: crit(1, 2), verifiabilityScore: crit(1, 2), consistencyScore: crit(1, 2), coherenceScore: crit(1, 1), issues: Array.from({ length: 9 }, (_, i) => ({ issueType: "MISSING_TAGGED_SOURCE", scoreType: "VERIFIABILITY", conclusionType: "RESIDENCE", originalDate: String(1900 + i), penalty: 0.05 })) } });
  const manyTip = D.tooltip(many, "Medium");
  check("at most 6 actions shown, then '…and N more'", manyTip.split("\n").filter((l) => l.startsWith("• ")).length === 6 && manyTip.endsWith("…and 3 more (see the Quality Score panel)"));

  // =======================================================================================
  // 3. The badge on a fake person page
  // =======================================================================================
  const el = (tag, kids, text) => {
    const n = {
      tagName: tag, children: [], parentElement: null, _attrs: {}, _text: text || "", _l: {}, isConnected: true,
      getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      removeAttribute(k) { delete this._attrs[k]; },
      addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); },
      fire(t, ev) { for (const fn of this._l[t] || []) fn(ev || {}); },
      getBoundingClientRect() { return this._rect || { left: 100, top: 200, right: 160, bottom: 220, width: 60, height: 20 }; },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
    };
    for (const k of kids || []) { k.parentElement = n; n.children.push(k); }
    return n;
  };
  // What the panel code needs from the page: createElement / body.appendChild, a viewport, and
  // the document/window listeners it wires once. Created panels are collected for the checks.
  const created = [];
  document.createElement = (tag) => {
    const n = { tagName: tag.toUpperCase(), _attrs: {}, style: {}, _text: "", children: [], offsetWidth: 300, offsetHeight: 120, isConnected: true, parentElement: null,
      getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }, setAttribute(k, v) { this._attrs[k] = String(v); }, removeAttribute(k) { delete this._attrs[k]; },
      appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); },
      set textContent(v) { this._text = String(v); this.children = []; } }; // a real DOM drops the children on assignment too
    created.push(n);
    return n;
  };
  document.createTextNode = (s) => ({ nodeType: 3, textContent: String(s) });
  const panels = () => created.filter((n) => n.tagName === "DIV").length; // the <strong> line is created per render
  document.body.appendChild = (n) => { n.parentElement = document.body; };
  const docListeners = {};
  document.addEventListener = (t, fn) => (docListeners[t] = docListeners[t] || []).push(fn);
  const winListeners = {};
  globalThis.window = { innerWidth: 1200, innerHeight: 800, addEventListener: (t, fn) => (winListeners[t] = winListeners[t] || []).push(fn), postMessage() {} };
  const T = D._tip;
  const pill = el("SPAN", [], "Medium");
  const headerRow = el("DIV", [el("SPAN", [], "Quality Score:"), pill]);
  const panelBadge = el("DIV", [], "Medium Quality");
  const panel = el("DIV", [el("H3", [], "Quality Score"), panelBadge]);
  const hintPill = el("SPAN", [], "High");
  const hints = el("DIV", [el("SPAN", [], "Record Hint"), hintPill]);
  const innerPill = el("SPAN", [], "Medium");
  const wrapper = el("DIV", [innerPill]); // same text as its child → not the smallest
  const other = el("DIV", [el("SPAN", [], "Quality Score:"), wrapper]);
  // The page body carries far more text than a card: a hint pill must not find the Quality
  // Score label by climbing all the way up to it.
  const chrome = el("DIV", [], "FamilySearch Family Tree Search Memories Get Involved Activities ".repeat(12));
  const root = el("BODY", [chrome, headerRow, panel, hints, other]);
  const all = [];
  (function walk(n) { for (const c of n.children) { all.push(c); walk(c); } })(root);
  FSSE.deepElements = () => all;
  FSSE.getFsid = () => "GJJ3-YGN";

  const found = D.findBadges(all);
  check("findBadges: the labelled pills only (header pill, 'Medium Quality' badge, the innermost of a wrapped pill), not the hint pill", found.length === 3 && found.includes(pill) && found.includes(panelBadge) && found.includes(innerPill) && !found.includes(hintPill) && !found.includes(wrapper));
  check("badgeWord canonicalises 'Medium Quality' → Medium", D.badgeWord(panelBadge) === "Medium" && D.badgeWord(pill) === "Medium");

  // v0.2.100 — the NARROW page (Kevin's laptop: no tooltip at all). Below FamilySearch's `lg`
  // breakpoint the Labs details-page header renders the badge on a second row with the SHORT
  // label "Quality:" (FS's chunk 76939: `short:!0`; string "person-quality-score.quality.label"),
  // beside the Search Records / Tools chips. Built as FS builds it: the row carries FS's own
  // data-testid, the chip nests its word a few levels down.
  {
    const narrowWord = el("SPAN", [], "Medium");
    const narrowChip = el("BUTTON", [el("DIV", [narrowWord])]);
    const narrowRow = el("DIV", [el("P", [], "Quality:"), narrowChip]);
    narrowRow.setAttribute("data-testid", "quality-score-action-chip-loaded");
    const narrowHeader = el("DIV", [narrowRow, el("BUTTON", [], "Search Records"), el("BUTTON", [], "Tools")]);
    // the same short label with NO testid (should FS drop the marker, the words alone must do)
    const bareWord = el("SPAN", [], "Low");
    const bareRow = el("DIV", [el("P", [], "Quality:"), el("BUTTON", [bareWord])]);
    // the marker alone, with a label this extension has never seen (another language, a rewording)
    const foreignWord = el("SPAN", [], "High");
    const foreignRow = el("DIV", [el("P", [], "Calidad:"), el("BUTTON", [foreignWord])]);
    foreignRow.setAttribute("data-testid", "quality-score-action-button-loaded");
    // must stay unclaimed: "quality" in prose (no colon), a marker FS uses for something else,
    // and FS's LOADING placeholder marker
    const proseWord = el("SPAN", [], "High");
    const prose = el("DIV", [el("P", [], "Image quality of this record"), proseWord]);
    const otherWord = el("SPAN", [], "Medium");
    const otherRow = el("DIV", [el("P", [], "Confidence"), otherWord]);
    otherRow.setAttribute("data-testid", "record-hint-confidence");
    const loadingWord = el("SPAN", [], "Low");
    const loadingRow = el("DIV", [loadingWord]);
    loadingRow.setAttribute("data-testid", "loading-quality-score-action-chip");
    const narrowRoot = el("BODY", [el("DIV", [], "FamilySearch Family Tree Search Memories Get Involved Activities ".repeat(12)), narrowHeader, bareRow, foreignRow, prose, otherRow, loadingRow]);
    const narrowAll = [];
    (function walk(n) { for (const c of n.children) { narrowAll.push(c); walk(c); } })(narrowRoot);
    const nf = D.findBadges(narrowAll);
    check("findBadges on a narrow page: the short 'Quality:' label claims the badge", nf.includes(narrowWord), nf.length);
    check("findBadges: the short label alone (no FS marker) is enough", nf.includes(bareWord));
    check("findBadges: FS's own row marker alone is enough, whatever the label says", nf.includes(foreignWord));
    check("findBadges: 'quality' in prose, an unrelated marker and the loading placeholder claim nothing", !nf.includes(proseWord) && !nf.includes(otherWord) && !nf.includes(loadingWord) && nf.length === 3, nf.length);
    check("findBadges: still only the smallest element (not the chip or its row)", !nf.includes(narrowChip) && !nf.includes(narrowRow));
    check("the tooltip text for a narrow-page badge is the same text", D.tooltip(s, D.badgeWord(narrowWord)) === EXPECTED);
  }

  D.tick();
  check("tick before any payload: nothing on the badges", pill.getAttribute(T.ATTR) === null && panelBadge.getAttribute(T.ATTR) === null && created.length === 0);
  check("receive stores the summary (and ignores a still-computing payload)", D.receive("GJJ3-YGN", slim) === true && D.receive("GJJ3-YGN", { isValid: false }) === false && D._scores.get("GJJ3-YGN").score === s.score);
  D.tick();
  check("tick after the payload: the option-B text on every badge as data-fsse-tip, no native title, nothing on the hint pill", pill.getAttribute(T.ATTR) === EXPECTED && panelBadge.getAttribute(T.ATTR) === EXPECTED && innerPill.getAttribute(T.ATTR) === EXPECTED && hintPill.getAttribute(T.ATTR) === null && wrapper.getAttribute(T.ATTR) === null && pill.getAttribute("title") === null && panelBadge.getAttribute("title") === null);
  D.tick();
  check("each badge is wired for hover and keyboard focus exactly once, however many ticks", ["pointerenter", "pointerleave", "focus", "blur"].every((t) => pill._l[t].length === 1 && panelBadge._l[t].length === 1 && innerPill._l[t].length === 1) && !hintPill._l.pointerenter);
  check("no panel exists until a badge is actually hovered", created.length === 0 && T.state.el === null);
  pill.setAttribute(T.ATTR, "clobbered by a re-render");
  pill.setAttribute("title", "Quality score 1 · a native tooltip left by v0.2.96");
  D.tick();
  check("a re-rendered badge gets the text back on the next tick, and a leftover native title of ours is removed", pill.getAttribute(T.ATTR) === EXPECTED && pill.getAttribute("title") === null);
  pill.setAttribute("title", "FamilySearch's own title");
  D.tick();
  check("a title that is not ours is left alone", pill.getAttribute("title") === "FamilySearch's own title");
  pill.removeAttribute("title");

  // Hover: nothing before the delay (a pass-over), then our panel with the text in larger type.
  pill.fire("pointerenter");
  check("nothing shows before the delay", created.length === 0);
  await new Promise((r) => setTimeout(r, T.DELAY_MS + 80));
  const panelEl = T.state.el;
  const style = panelEl ? panelEl.getAttribute("style") : "";
  check("after the delay: ONE panel, appended to <body>, role=tooltip, showing exactly the option-B text", panelEl && panels() === 1 && panelEl.parentElement === document.body && panelEl.getAttribute("role") === "tooltip" && panelEl.textContent === EXPECTED && panelEl.style.display === "block" && panelEl.style.visibility === "visible");
  check("the panel is fixed-position, 13 px type (v0.2.98: one point down from 14), pre-wrap (the line breaks survive), never catches the pointer", /(^|;)position:fixed(;|$)/.test(style) && T.FONT_PX === 13 && new RegExp(`(^|;)font:${T.FONT_PX}px/`).test(style) && /white-space:pre-wrap/.test(style) && /pointer-events:none/.test(style));
  check("the score line is a bold element of its own; the rest follows as plain text; the whole reads unchanged", panelEl.children.length === 2 && panelEl.children[0].tagName === "STRONG" && panelEl.children[0].textContent === "Quality score 76.8 · Medium" && /font-weight:700/.test(panelEl.children[0].getAttribute("style")) && panelEl.children[1].nodeType === 3 && panelEl.children[1].textContent.startsWith("\nLow <40") && panelEl.textContent === EXPECTED);
  check("placed just under the badge with the left edges aligned; the badge is aria-describedby the panel", panelEl.style.left === "100px" && panelEl.style.top === `${220 + T.GAP_PX}px` && pill.getAttribute("aria-describedby") === T.ID);
  check("the panel wires scroll / pointerdown / Escape hiders once", winListeners.scroll.length === 1 && docListeners.pointerdown.length === 1 && docListeners.keydown.length === 1);
  pill.fire("pointerleave");
  check("leaving hides the panel and drops aria-describedby", panelEl.style.display === "none" && pill.getAttribute("aria-describedby") === null && T.state.anchor === null);
  T.show(pill);
  docListeners.keydown[0]({ key: "Escape" });
  check("Escape hides it", panelEl.style.display === "none");
  T.show(pill);
  winListeners.scroll[0]({});
  check("a scroll hides it", panelEl.style.display === "none");
  // Near the bottom-right corner the panel flips above the badge and is pulled inside the viewport.
  panelBadge._rect = { left: 1150, top: 760, right: 1190, bottom: 780, width: 40, height: 20 };
  T.show(panelBadge);
  check("near the bottom-right corner: above the badge, pulled inside the viewport, same panel reused", panelEl.style.left === `${1200 - 300 - T.MARGIN_PX}px` && panelEl.style.top === `${760 - T.GAP_PX - 120}px` && panels() === 1 && panelEl.textContent === EXPECTED);
  T.hide();
  // Keyboard: focus arms the same delay; a blur before it fires cancels the show.
  pill.fire("focus");
  pill.fire("blur");
  await new Promise((r) => setTimeout(r, T.DELAY_MS + 80));
  check("blur before the delay cancels the pending show", panelEl.style.display === "none" && T.state.timer === null);
  pill.fire("focus");
  await new Promise((r) => setTimeout(r, T.DELAY_MS + 80));
  check("keyboard focus shows the panel too", panelEl.style.display === "block" && T.state.anchor === pill);
  // The hovered badge is re-rendered away mid-hover: the next tick hides the panel.
  pill.isConnected = false;
  D.tick();
  check("a badge removed by a re-render while hovered: the next tick hides the panel", panelEl.style.display === "none" && T.state.anchor === null);
  pill.isConnected = true;
  // The text changes while the panel is up (a fresher score): it is redrawn in place.
  T.show(pill);
  T.attach(pill, "Quality score 99 · High\nnew text");
  check("text that changes while shown is redrawn in place, its new first line bold", panelEl.textContent === "Quality score 99 · High\nnew text" && panelEl.children[0].tagName === "STRONG" && panelEl.children[0].textContent === "Quality score 99 · High" && panelEl.style.display === "block");
  T.render(panelEl, "one line only");
  check("a single-line text renders as just the bold line", panelEl.children.length === 1 && panelEl.children[0].textContent === "one line only" && panelEl.textContent === "one line only");
  T.hide();
  D.tick(); // the real text back on the pill
  // ---- v0.2.133: the settings switch (FSSE.settings — absent in this suite until here = on) ----
  T.show(pill);
  FSSE.settings = { loaded: true, get: () => false };
  D.tick();
  check("settings: tooltip off → the tick strips our attribute from every badge and hides the panel", pill.getAttribute(T.ATTR) === null && panelBadge.getAttribute(T.ATTR) === null && innerPill.getAttribute(T.ATTR) === null && panelEl.style.display === "none" && T.state.anchor === null);
  FSSE.settings = { loaded: true, get: () => true };
  D.tick();
  check("settings: back on → the text returns on the next tick, each badge still wired exactly once", pill.getAttribute(T.ATTR) === EXPECTED && panelBadge.getAttribute(T.ATTR) === EXPECTED && innerPill.getAttribute(T.ATTR) === EXPECTED && ["pointerenter", "pointerleave", "focus", "blur"].every((t) => pill._l[t].length === 1));
  FSSE.settings = { loaded: false, get: () => false };
  D.tick();
  check("settings: still loading → the tick does nothing (the page-world payload may arrive before storage does)", pill.getAttribute(T.ATTR) === EXPECTED);
  delete FSSE.settings;
  FSSE.getFsid = () => "LJRD-PJ2";
  const before = pill.getAttribute(T.ATTR);
  D.tick();
  check("another person with no payload yet: the old text is left alone (the page replaces the badge on navigation)", before === EXPECTED && pill.getAttribute(T.ATTR) === before && D._state.pid === "LJRD-PJ2");
  D.receive("LJRD-PJ2", { isValid: true, personScores: { overallDisplayScore: null } });
  D.tick();
  check("a Not Available person gets no tooltip", D._scores.get("LJRD-PJ2").available === false);

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log("FAIL  suite crashed\n      → " + (e && e.stack || e));
  process.exit(1);
});
