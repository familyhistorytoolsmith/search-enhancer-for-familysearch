// dqs.js — the number behind the Data Quality Score badge (v0.2.90).
//
// FamilySearch shows a person's Data Quality Score as a word only (Low / Medium / High). The
// score itself is a 0–1 number in the payload the page fetches to draw the badge (see
// src/dqs-listen.js, which reads the page's OWN response and posts it here — no request of
// ours). Kevin's ask (2026-09-21): show the numeric score on hover over the badge, with the
// Low/Medium thresholds beside it — and (option B of the mockup he picked) the actions that
// would raise it, each with the score that fix alone would give.
//
// What the tooltip reads (Thomas Gourley Park GJJ3-YGN, Medium, from his real payload):
//   Quality score 76.8 · Medium
//   Low <40 · Medium 40–84.9 · High ≥85
//
//   To reach High:
//   • 1939 Register tagged twice — remove
//     one → 88.9
//   • Add a burial → 85.1
//   • Add the month to the 1985 death → 79.5
//
// Scale: 0–100 with one decimal (Kevin: easier to conceptualise than FS's 0.0–1.0; one
// decimal because the Medium→High line is tight — 84.8 is Medium, 85.5 is High).
// Thresholds (from the companion Quality Score Analyzer's 21-person sample, 2026-07-04):
// High ≥ 0.85, Medium ≥ 0.4, else Low; the 0.4 line is provisional — every sampled Low sat
// at exactly 0, because an unresolved conflict zeroes the whole score.
// Projection rule (the Analyzer's model, confirmed to four decimals on Thomas's payload):
//   overall = mean(completeness, verifiability, consistency) when coherence > 0, else 0
// and each criterion = 1 − Σ(its outstanding issues' penalties). So removing one issue lifts
// its criterion by its penalty and the overall by a third of that. The model is SELF-CHECKED
// against the actual overallDisplayScore before any projection is shown — an unseen shape
// lists the actions without numbers rather than promising a wrong one. Issues whose type
// ends in _INFORMATIONAL carry no penalty and are not counted by FS's own panel; skipped.
//
// The badge is found by visible text, never a hashed class: a smallest element reading
// "Low" / "Medium" / "High" (or "Medium Quality") with a "Quality Score" label among its
// nearest ancestors (hint-confidence pills elsewhere on the page use the same words but have
// no such label). The text rides on that element as `data-fsse-tip`; React re-renders drop it
// and the next tick puts it back. "Not Available" people get nothing (no number to show).
//
// v0.2.100 — the label has a SHORT form. Kevin's laptop showed no tooltip at all. On a page
// narrower than FamilySearch's `lg` breakpoint (750 CSS px, measured on its page container — a
// laptop with a side panel docked, or a zoomed-in tab) the Labs details-page header moves the
// badge to a second row, rendered with `short: true`: its label reads "Quality:", not "Quality Score:"
// (read off FS's own bundle: chunk 76939 module 43079 passes `short:!0` below `lg`; module 20287
// picks "person-quality-score.quality.label" = "Quality:" for it). "Quality Score" was never in
// the badge's card, so the finder claimed nothing. Now the label matches either wording, and
// FamilySearch's own marker on the badge's row — data-testid "quality-score-action-chip-loaded" /
// "…-button-loaded" — counts as the label too, whatever the words (a locale or a rewording).
//
// v0.2.97 — the tooltip is DRAWN BY US, not by the browser. A `title` tooltip (v0.2.90–96) is
// rendered by Chrome in the system font at a fixed size that no CSS can reach, and Kevin asked
// (2026-09-24) for slightly larger type "for this one case" so the details are more readily
// consumed. So one shared <div id="fsse-dqs-tip"> (position: fixed, appended to <body>) shows
// the same text in TIP_FONT_PX type (13 px, the score line in bold — v0.2.98, Kevin's two tweaks)
// on hover (after TIP_DELAY_MS) or keyboard focus, placed
// under the badge — above it when there is no room — and kept inside the viewport; it hides on
// leave/blur, on any scroll, pointerdown or Escape, and when its badge leaves the DOM (a
// re-render mid-hover). Any `title` we set in earlier versions is removed: never two tooltips.

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  const HIGH_MIN = 0.85;
  const MEDIUM_MIN = 0.4;
  const MAX_ACTIONS = 6;
  const FROM_PAGE = "fsse-dqs-page";
  const FROM_EXT = "fsse-dqs";
  const SCORE_RE = /^(low|medium|high)(?:\s+quality)?$/i;
  // "Quality Score:" on a wide page, "Quality:" on a narrow one (FS's short label — see the header).
  // The short form needs its colon: bare "quality" in a card's prose must not claim a pill.
  const LABEL_RE = /quality\s*score|\bquality\s*:/i;
  const ROW_TESTID_RE = /^quality-score-action-(?:chip|button)-loaded$/; // FS's marker on the badge's own row
  const MAX_LABEL_TEXT = 400; // an ancestor with more text than this is the page, not the badge's card
  const CRITERION = { COMPLETENESS: "completeness", VERIFIABILITY: "verifiability", CONSISTENCY: "consistency", COHERENCE: "coherence" };
  const EVENT_WORD = {
    BIRTH: "birth", CHRISTENING: "christening", BAPTISM: "baptism", DEATH: "death", BURIAL: "burial",
    MARRIAGE: "marriage", RESIDENCE: "residence", NAME: "name", GENDER: "sex", OCCUPATION: "occupation",
  };

  const scores = new Map(); // pid → summary
  const state = { pid: null, logged: null };

  // ---- pure helpers ---------------------------------------------------------------------
  function gradeOf(score) {
    if (typeof score !== "number" || Number.isNaN(score)) return null;
    return score >= HIGH_MIN ? "High" : score >= MEDIUM_MIN ? "Medium" : "Low";
  }
  // 0–1 → "76.8" / "100" / "85" (one decimal, trailing .0 dropped).
  function pct(x) {
    if (typeof x !== "number" || Number.isNaN(x)) return "?";
    return String(Math.round(x * 1000) / 10);
  }
  // "Low <40 · Medium 40–84.9 · High ≥85" — the Medium band's top is written as the last
  // one-decimal value BELOW the High line (v0.2.91, Kevin: "Medium 40–84.9", not "40–85").
  const justBelow = (x) => Math.round(x * 1000 - 1) / 10;
  const thresholdsLine = () => `Low <${pct(MEDIUM_MIN)} · Medium ${pct(MEDIUM_MIN)}–${justBelow(HIGH_MIN)} · High ≥${pct(HIGH_MIN)}`;
  // v0.2.117 — the birth SEGMENT FamilySearch scored the person under: FS's own string
  // ("United Kingdom 1800 - 1920", `personScores.segment`), its hyphen shown as an en dash.
  const segmentText = (seg) => String(seg).replace(/\s+-\s+/g, " – ").trim();

  // The page's payload → what the tooltip needs. null = still computing (isValid:false — the
  // page retries and we hear the retry); {available:false} = FS has no score for this person.
  function summarize(pid, json) {
    if (!json || typeof json !== "object" || json.isValid === false) return null;
    const ps = json.personScores;
    if (!ps || typeof ps.overallDisplayScore !== "number") return { pid, available: false };
    const crit = (k) => (ps[k] && typeof ps[k].displayScore === "number" ? ps[k].displayScore : null);
    const issues = (Array.isArray(ps.issues) ? ps.issues : [])
      .filter((i) => i && typeof i.issueType === "string" && !/_INFORMATIONAL$/i.test(i.issueType))
      .map((i) => ({
        issueType: i.issueType,
        scoreType: i.scoreType || null,
        conclusionType: i.conclusionType || null,
        penalty: typeof i.penalty === "number" ? i.penalty : null,
        originalDate: i.originalDate || i.formalDate || null,
        originalPlace: i.originalPlace || null,
        sourceTitle: i.sourceTitle || null,
        sourceName: i.sourceName || null,
        conclusionName: i.conclusionName || null,
        numTags: typeof i.numTags === "number" ? i.numTags : null,
      }));
    return {
      pid,
      available: true,
      score: ps.overallDisplayScore,
      grade: gradeOf(ps.overallDisplayScore),
      completeness: crit("completenessScore"),
      verifiability: crit("verifiabilityScore"),
      consistency: crit("consistencyScore"),
      coherence: crit("coherenceScore"),
      issues,
      dismissed: Array.isArray(ps.dismissedIssues) ? ps.dismissedIssues.length : 0,
      segment: ps.segment || null,
    };
  }

  // The Analyzer's overall rule; null when a criterion is missing.
  function model(s) {
    if ([s.completeness, s.verifiability, s.consistency, s.coherence].some((v) => typeof v !== "number")) return null;
    if (s.coherence <= 0) return 0;
    return (s.completeness + s.verifiability + s.consistency) / 3;
  }
  const modelHolds = (s) => {
    const m = model(s);
    return m != null && Math.abs(m - s.score) < 0.005;
  };
  // The overall this person would have with ONE issue resolved (its penalty handed back to
  // its criterion, capped at 1). null when the issue can't be placed.
  function projected(s, issue) {
    const key = CRITERION[issue.scoreType];
    if (!key || typeof issue.penalty !== "number" || typeof s[key] !== "number") return null;
    const t = Object.assign({}, s);
    t[key] = Math.min(1, s[key] + issue.penalty);
    return model(t);
  }

  const eventWord = (i) =>
    EVENT_WORD[i.conclusionType] || (i.conclusionType ? String(i.conclusionType).toLowerCase().replace(/_/g, " ") : "event");
  const yearOf = (i) => {
    const m = /(\d{4})/.exec(i.originalDate || "");
    return m ? m[1] : null;
  };
  // "England and Wales, National Register, 1939" → "1939 Register"; "…Census, 1901" → "1901 Census".
  function censusShort(title) {
    const t = String(title || "").replace(/"/g, "").trim();
    const y = /(\d{4})/.exec(t);
    const kind = /register/i.test(t) ? "Register" : /census/i.test(t) ? "Census" : null;
    if (y && kind) return `${y[1]} ${kind}`;
    return t.length > 28 ? t.slice(0, 27) + "…" : t || "A census";
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // One sentence per issue type (a fixed vocabulary; unknown types are humanised).
  function actionText(i) {
    const ev = eventWord(i);
    const y = yearOf(i);
    const dated = y ? `${y} ${ev}` : ev;
    switch (i.issueType) {
      case "MISSING_EVENT":
        return `Add a ${ev}`;
      case "MISSING_EVENT_PLACE":
        return `Add a place to the ${dated}`;
      case "MISSING_EVENT_DATE":
        return `Add a date to the ${ev}`;
      case "MONTH_NOT_SPECIFIED":
        return `Add the month to the ${dated}`;
      case "DAY_NOT_SPECIFIED":
        return `Add the day to the ${dated}`;
      case "NON_STANDARD_PLACE":
        return `Standardize the ${ev} place`;
      case "MISSING_TAGGED_SOURCE":
        return `Tag a source to the ${dated}`;
      case "MULTIPLE_TAGS_IN_SAME_CENSUS": {
        const n = i.numTags || 2;
        return n === 2 ? `${censusShort(i.sourceTitle)} tagged twice — remove one` : `${censusShort(i.sourceTitle)} tagged ${n} times — keep one`;
      }
      case "SURNAME_MISMATCH":
      case "GIVEN_NAME_MISMATCH":
      case "NAME_MISMATCH":
        return i.sourceName && i.conclusionName ? `Source says ${i.sourceName}, tree says ${i.conclusionName} — check` : "Name differs from a source — check";
      case "DATE_PLACE_MISMATCH_UNKNOWN_TO_YEAR":
        return `${cap(ev)} date and place disagree — check`;
      case "IMPOSSIBLE_EVENT_ORDER":
        return "Events out of order — check the dates";
      default: {
        const words = String(i.issueType).toLowerCase().replace(/_/g, " ");
        return i.conclusionType ? `${cap(words)} (${ev})` : cap(words);
      }
    }
  }

  // The actions list: biggest gain first; projections only when the model fits this person.
  function actions(s) {
    if (!s || !s.available) return [];
    const fits = modelHolds(s);
    const list = s.issues.map((i) => ({ text: actionText(i), projected: fits ? projected(s, i) : null, penalty: i.penalty || 0 }));
    list.sort((a, b) => {
      if (a.projected != null && b.projected != null && a.projected !== b.projected) return b.projected - a.projected;
      return b.penalty - a.penalty;
    });
    return list;
  }

  // Wrap one action line at the tooltip width; continuation lines indented two spaces.
  function wrapLine(line) {
    const wrapped = FSSE.wrapTip ? FSSE.wrapTip(line) : line;
    return wrapped
      .split("\n")
      .map((l, i) => (i ? "  " + l : l))
      .join("\n");
  }

  function tooltip(s, badgeWord) {
    if (!s || !s.available) return "";
    const grade = badgeWord || s.grade || "?";
    const lines = [`Quality score ${pct(s.score)} · ${grade}`, thresholdsLine()];
    // v0.2.117 (Kevin, on LBX7-P34's unexpected High: "I like the addition to the tooltip") —
    // the segment line. The help article caps every birth segment at 1920 (read 2026-10-26);
    // this line is how a widened range shows itself, person by person, without DevTools.
    if (s.segment) lines.push(wrapLine(`Scored as: ${segmentText(s.segment)}`));
    const acts = actions(s);
    if (!acts.length) {
      if (grade === "High") lines.push("", "Nothing outstanding.");
      return lines.join("\n");
    }
    lines.push("", grade === "High" ? "Still outstanding:" : "To reach High:");
    const shown = acts.slice(0, MAX_ACTIONS);
    for (const a of shown) lines.push(wrapLine(`• ${a.text}${a.projected != null ? ` → ${pct(a.projected)}` : ""}`));
    if (acts.length > shown.length) lines.push(`…and ${acts.length - shown.length} more (see the Quality Score panel)`);
    return lines.join("\n");
  }

  // ---- the badge on the page ---------------------------------------------------------------
  const badgeWord = (el) => {
    const m = SCORE_RE.exec((el.textContent || "").trim());
    return m ? cap(m[1].toLowerCase()) : null;
  };
  function findBadges(els) {
    const out = [];
    for (const el of els || FSSE.deepElements(document)) {
      const text = (el.textContent || "").trim();
      if (!SCORE_RE.test(text)) continue;
      if (Array.from(el.children || []).some((c) => (c.textContent || "").trim() === text)) continue; // not the smallest
      // The label must sit in a NEARBY, card-sized ancestor: climbing past ~400 characters of
      // text means we have left the badge's card, and any "Quality Score" found there would
      // wrongly claim a hint-confidence pill (the Analyzer's finder uses the same bound).
      let p = el.parentElement;
      let labelled = false;
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
        const t = p.textContent || "";
        if (t.length > MAX_LABEL_TEXT) break;
        const testid = p.getAttribute ? p.getAttribute("data-testid") : null;
        if (LABEL_RE.test(t) || (testid && ROW_TESTID_RE.test(testid))) {
          labelled = true;
          break;
        }
      }
      if (labelled) out.push(el);
    }
    return out;
  }

  // ---- our own tooltip panel (v0.2.97) ----------------------------------------------------
  const TIP_ATTR = "data-fsse-tip";
  const TIP_ID = "fsse-dqs-tip";
  const TIP_FONT_PX = 13; // Windows draws a native tooltip at ~12 px — "slightly" larger (Kevin's word; 14 in v0.2.97, one point down at his ask in v0.2.98)
  const TIP_DELAY_MS = 250; // a native tooltip waits ~500 ms; quicker, yet a pass-over still shows nothing
  const TIP_GAP_PX = 6; // between the badge and the panel
  const TIP_MARGIN_PX = 8; // kept clear of the viewport edges
  const tip = { el: null, anchor: null, timer: null, wired: false };

  const TIP_STYLE = [
    "position:fixed", "left:0", "top:0", "display:none", "z-index:2147483647", "margin:0",
    "max-width:480px", "padding:8px 11px", "box-sizing:border-box",
    "background:#fff", "color:#1f1f1f", "border:1px solid #9a9a9a", "border-radius:4px",
    "box-shadow:0 2px 8px rgba(0,0,0,.25)",
    `font:${TIP_FONT_PX}px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif`,
    "font-variant-numeric:tabular-nums", "white-space:pre-wrap", "text-align:left",
    "pointer-events:none", // never steals the hover from the badge
  ].join(";");

  const win = () => (typeof window !== "undefined" ? window : null);

  // The one panel, created on first use (and again if the page ever removes it).
  function tipEl() {
    if (tip.el && tip.el.isConnected !== false) return tip.el;
    const d = document.createElement("div");
    d.id = TIP_ID;
    d.setAttribute("role", "tooltip");
    d.setAttribute("style", TIP_STYLE);
    (document.body || document.documentElement).appendChild(d);
    tip.el = d;
    const w = win();
    if (!tip.wired && w && w.addEventListener && document.addEventListener) {
      tip.wired = true;
      w.addEventListener("scroll", tipHide, { capture: true, passive: true });
      document.addEventListener("pointerdown", tipHide, true);
      document.addEventListener("keydown", (e) => { if (e && e.key === "Escape") tipHide(); }, true);
    }
    return d;
  }

  // Under the badge with the left edges aligned; above it when there is no room below; never
  // past the viewport edges. Returns the position for tests.
  function tipPlace(anchor, d) {
    const r = anchor.getBoundingClientRect();
    const w = win();
    const vw = (w && w.innerWidth) || 0;
    const vh = (w && w.innerHeight) || 0;
    const pw = d.offsetWidth || 0;
    const ph = d.offsetHeight || 0;
    const left = Math.max(TIP_MARGIN_PX, Math.min(r.left, vw - pw - TIP_MARGIN_PX));
    let top = r.bottom + TIP_GAP_PX;
    if (top + ph > vh - TIP_MARGIN_PX) top = Math.max(TIP_MARGIN_PX, r.top - TIP_GAP_PX - ph);
    d.style.left = `${Math.round(left)}px`;
    d.style.top = `${Math.round(top)}px`;
    return { left: Math.round(left), top: Math.round(top) };
  }
  // The text into the panel: the first line (score · grade) in bold, the rest as written.
  function tipRender(d, text) {
    const nl = text.indexOf("\n");
    const head = nl < 0 ? text : text.slice(0, nl);
    const rest = nl < 0 ? "" : text.slice(nl);
    d.textContent = ""; // drops the previous children
    const b = document.createElement("strong");
    b.setAttribute("style", "font-weight:700"); // a page CSS reset may un-bold <strong>; ours stays bold
    b.textContent = head;
    d.appendChild(b);
    if (rest) d.appendChild(document.createTextNode(rest));
  }
  function tipShow(anchor) {
    const text = anchor.getAttribute(TIP_ATTR);
    if (!text) return false;
    const d = tipEl();
    tipRender(d, text);
    tip.anchor = anchor;
    d.style.visibility = "hidden"; // measure before placing
    d.style.display = "block";
    tipPlace(anchor, d);
    d.style.visibility = "visible";
    anchor.setAttribute("aria-describedby", TIP_ID);
    return true;
  }
  function tipHide() {
    if (tip.timer) {
      clearTimeout(tip.timer);
      tip.timer = null;
    }
    const a = tip.anchor;
    tip.anchor = null;
    if (a && a.removeAttribute) a.removeAttribute("aria-describedby");
    if (tip.el) tip.el.style.display = "none";
  }
  function tipArm(anchor) {
    if (tip.timer) clearTimeout(tip.timer);
    tip.timer = setTimeout(() => {
      tip.timer = null;
      if (anchor.isConnected !== false) tipShow(anchor);
    }, TIP_DELAY_MS);
  }
  // Put the text on a badge and wire it once (a re-rendered badge is a new element → wired again).
  function tipAttach(b, text) {
    if (b.getAttribute(TIP_ATTR) !== text) b.setAttribute(TIP_ATTR, text);
    const old = b.getAttribute("title");
    if (old && /^Quality score /.test(old) && b.removeAttribute) b.removeAttribute("title"); // the v0.2.90–96 native tooltip
    if (tip.anchor === b && tip.el && tip.el.textContent !== text) tipShow(b); // changed while shown → redraw
    if (b._fsseDqsTip || !b.addEventListener) return;
    b._fsseDqsTip = true;
    b.addEventListener("pointerenter", () => tipArm(b));
    b.addEventListener("pointerleave", tipHide);
    b.addEventListener("focus", () => tipArm(b));
    b.addEventListener("blur", tipHide);
  }

  // ---- wiring -----------------------------------------------------------------------------
  function request(pid) {
    try {
      window.postMessage({ source: FROM_EXT, type: "FSSE_DQS_REQUEST", pid: pid || null }, location.origin);
    } catch (_) {
      /* ignore */
    }
  }
  function receive(pid, payload) {
    const s = summarize(pid, payload);
    if (!s) return false; // still computing — the page retries
    scores.set(pid, s);
    return true;
  }

  // v0.2.133: switched off in the settings → our attribute comes off every badge and the panel
  // hides; the badge listeners stay wired (tipShow does nothing without the attribute), so
  // switching back on only has to re-set the text.
  function clear() {
    let n = 0;
    let all = [];
    if (FSSE.deepElements) all = FSSE.deepElements(document);
    else if (document.querySelectorAll) all = document.querySelectorAll(`[${TIP_ATTR}]`);
    for (const el of all) {
      if (el && el.getAttribute && el.getAttribute(TIP_ATTR) != null && el.removeAttribute) {
        el.removeAttribute(TIP_ATTR);
        n++;
      }
    }
    tipHide();
    if (n) FSSE.log(`dqs: the Quality Score tooltip is switched off in the settings — removed from ${n} badge(s)`);
    state.logged = null;
    return n;
  }

  function tick() {
    if (tip.anchor && tip.anchor.isConnected === false) tipHide(); // the hovered badge was re-rendered away
    // v0.2.133: the settings gate sits here, not in content.js, because the page-world listener
    // below calls tick() directly — and can do so before the settings have loaded (the page's own
    // scores response is often the first thing to arrive), hence the synchronous `loaded` check.
    if (FSSE.settings && FSSE.settings.loaded === false) return;
    if (FSSE.settings && typeof FSSE.settings.get === "function" && FSSE.settings.get("dqs.tooltip") === false) {
      clear();
      return;
    }
    const pid = FSSE.getFsid ? FSSE.getFsid() : null;
    if (!pid) return;
    if (pid !== state.pid) {
      state.pid = pid;
      state.logged = null;
      request(pid); // the page may have fetched before we were listening
    }
    const s = scores.get(pid);
    if (!s || !s.available) return;
    const badges = findBadges();
    if (!badges.length) return;
    let text = null;
    for (const b of badges) {
      text = tooltip(s, badgeWord(b));
      tipAttach(b, text);
    }
    const key = `${pid}|${text}|${badges.length}`;
    if (key !== state.logged) {
      state.logged = key;
      const word = badgeWord(badges[0]);
      const notes = [];
      if (word && word !== s.grade) notes.push(`badge says ${word} — threshold drift?`);
      if (!modelHolds(s)) {
        const m = model(s);
        notes.push(`projection model does not fit (model ${m == null ? "n/a" : pct(m)} vs actual ${pct(s.score)}), numbers withheld`);
      }
      FSSE.log(`dqs: ${pid} score ${pct(s.score)} ${s.grade}, ${actions(s).length} action(s), ${badges.length} badge(s)${s.segment ? `, segment "${s.segment}"` : ""}${notes.length ? " — " + notes.join("; ") : ""}`);
    }
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("message", (e) => {
      // Same window AND same origin: the payload comes from our page-world script, nowhere else.
      if (e.source !== window || e.origin !== location.origin) return;
      if (!e.data || e.data.source !== FROM_PAGE || e.data.type !== "FSSE_DQS") return;
      const pid = String(e.data.pid || "").toUpperCase();
      if (!pid) return;
      if (receive(pid, e.data.payload)) {
        try {
          tick();
        } catch (err) {
          console.warn("[FSSE] dqs tick failed", err);
        }
      }
    });
  }

  FSSE.dqs = {
    gradeOf, pct, thresholdsLine, summarize, model, modelHolds, projected, actionText, actions, tooltip, findBadges, badgeWord, receive, tick, clear,
    HIGH_MIN, MEDIUM_MIN, MAX_ACTIONS, _scores: scores, _state: state,
    _tip: { show: tipShow, hide: tipHide, place: tipPlace, attach: tipAttach, render: tipRender, state: tip, ATTR: TIP_ATTR, ID: TIP_ID, FONT_PX: TIP_FONT_PX, DELAY_MS: TIP_DELAY_MS, GAP_PX: TIP_GAP_PX, MARGIN_PX: TIP_MARGIN_PX },
  };
})();
