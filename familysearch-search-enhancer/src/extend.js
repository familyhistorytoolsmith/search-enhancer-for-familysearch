// extend.js — "Extend reservation" on Temple › My Reservations.
//   v1.0.8–1.0.9 = STEP 1, read-only: the days-left lines, the link, the button, a REHEARSAL.
//   v1.0.10      = STEP 2, the REAL RUN FOR ONE RELATIVE (a row's "↻ Extend" link), built from
//                  Kevin's findings of 2026-11-26 (Alfred Robert Darley G7W9-WCV): on the Ordinances
//                  tab the opener is `unreserve-button`; both dialogs list one tick box per
//                  ordinance, named `<PID>_<TYPE>[_<relative ids>]`
//                  (G7W9-WCV_SEALING_TO_PARENTS_MP6B-4DC_KCMD-LW4); the Unreserve dialog arrives
//                  with its box ticked; the REQUEST dialog arrives with EVERY requestable ordinance
//                  ticked — also ones that were never reserved (his Sealing to Spouse) — so the run
//                  ticks exactly what it unreserved and unticks the rest; and it says "You may
//                  reserve these ordinances, and then you have 120 days to complete them."
//                  The Advanced settings group's "rehearse only" switch turns it into a rehearsal.
//   v1.0.11–17   = the checks before the unreserve (the page's own duplicates flags, a look at
//                  the Request dialog), the window outside which nothing is offered, what holds a
//                  relative back and what is only a note, the hold at the 110-year form.
//   v1.0.18      = STEP 3, the button for ALL expiring reservations is real too (the whole run was
//                  proven live on David Cowan Dickie GGGJ-7MT the same day).
//   v1.0.22      = THE BUTTON FOR ALL EXPIRING RESERVATIONS IS GONE (Kevin, 2026-11-26: "it will be
//                  sufficient to offer one name at a time. This will also simplify the feature").
//                  A run is for ONE relative, started by that row's "↻ Extend" link; the job keeps
//                  its one-entry `queue` so that the engine proven live stays as it was.
//   v1.0.28      = A DEMO (Kevin, 2026-11-27: "an advanced option that will add a fake temple
//                  ordinance reservation that is about to expire … to demo the feature for someone
//                  who does not currently have a soon to expire reservation. Clicking on Extend …
//                  will effectively walk through the steps but will not actually unreserve and
//                  reserve the target person"). With the Advanced switch `temple.extendDemo` on, the
//                  reservation on the page with the soonest expiry date that is NOT inside the window
//                  is shown as if it expired in DEMO_DAYS days (our own line only — FamilySearch's
//                  "Expires:" text is never touched). Its Extend link starts a job that is ALWAYS a
//                  rehearsal (`job.demo`), whatever "rehearse only" says: FamilySearch's two dialogs
//                  are opened, left up for DEMO_PAUSE_MS so that they can be seen, and cancelled. A
//                  made-up person was not an option: only a real relative has an Ordinances tab.
//
// The text below this line is the step-1 header, kept for the reasoning (its "Extend expiring"
// button no longer exists — see v1.0.22 above).
//
// Kevin, 2026-11-26: a temple reservation that is about to expire can only be kept by unreserving
// it and reserving it again (FamilySearch's own advice — help article "What do I do when
// reservations are about to expire?"), a dozen clicks over two pages per relative. The plan
// (approved the same day): one "Extend" link per relative and one "Extend expiring" button, the
// work done by pressing FamilySearch's OWN buttons on the relative's Ordinances tab — no request
// of ours, the posture of FSSE.clickNative and the GRO / FreeBMD / ScotlandsPeople fillers.
//
// THIS BUILD CHANGES NOTHING ON FAMILYSEARCH (REAL_RUN = false). It
//   - shows the days left after each row's "Expires:" line and an "↻ Extend" link;
//   - puts "EXTEND EXPIRING (n)" beside FamilySearch's Unreserve button (the window is a setting);
//   - REHEARSES a run: for each chosen relative it opens the Ordinances tab, opens FamilySearch's
//     Unreserve dialog (and Request, when the page offers it), writes what it finds to the console
//     and presses Cancel. That console output is what the real run (step 2) is built from — the
//     page markup is login-walled, so the marker names below are read off FamilySearch's public
//     bundle (2026-11-26) and unverified until Kevin's first rehearsal.
//
// Off by default: the Temple settings group's "Extend reservations" switch (settings.js).
//
// DATA: two sources, merged per relative —
//   the page (rows found by their `table-row-<PID>` marker, else by the visible "Expires:" text):
//     name, life span, the "Reserved:" / "Expires:" dates, the ordinance letters with their status;
//   the page's own list response, heard by dqs-listen.js (FSSE_RESERVATIONS): every reservation
//     on every page of the list, with what FamilySearch says can be unreserved and what was printed.
// The job of a run (queue, step) lives in THIS TAB's sessionStorage only — never chrome.storage
// (nothing that implies church membership is kept on a shared computer).
//
// Node-testable: module.exports = FSSE.extend (tests/extend.test.js).
(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});
  const log = (...a) => {
    if (typeof FSSE.log === "function") FSSE.log("extend:", ...a);
  };

  const SETTLE_MS = 700; // after a click of ours, before the page is read again
  const AFTER_UNRESERVE_MS = 2500; // the page takes the unreserve in before Request is opened
  const BOX_WAIT_MS = 6000; // a dialog's tick boxes may arrive after the dialog
  const MAX_TOGGLES = 16;
  const NEW_TERM_DAYS = 120; // what FamilySearch's Request dialog offered on 2026-11-26
  const FROM_PAGE = "fsse-dqs-page";
  const FROM_EXT = "fsse-dqs";
  const ATTR = "data-fsse-extend"; // every node of ours: row | dialog | banner
  const JOB_KEY = "fsse.extend.job";
  const JOB_TTL_MS = 15 * 60 * 1000;
  const STEP_TIMEOUT_MS = 15000;
  const PUMP_MS = 400;
  const SHORT_SPAN_DAYS = 200; // Reserved → Expires under this = a 120-day reservation
  const PERMISSION_YEARS = 110;
  const DEFAULT_WINDOW_DAYS = 14;
  const DEMO_DAYS = 5; // the demo's pretended days left (inside every window the settings offer)
  const DEMO_PAUSE_MS = 3000; // a demo leaves each of FamilySearch's dialogs up this long before Cancel
  const ORIGIN = "https://www.familysearch.org";
  const LIST_URL = ORIGIN + "/en/temple/reservations/";
  const RES_PATH_RE = /\/temple\/reservations\/?$/i;
  const ORD_PATH_RE = /\/tree\/person\/ordinances\/([A-Z0-9]{4}-[A-Z0-9]{2,4})(?:[/?#]|$)/i;
  const PID_ONLY_RE = /^[A-Z0-9]{4}-[A-Z0-9]{2,4}$/;
  const LETTERS = { B: "baptism", C: "confirmation", I: "initiatory", E: "endowment", SP: "sealingToParents", SS: "sealingToSpouse" };
  const LETTER_OF = {};
  for (const k of Object.keys(LETTERS)) LETTER_OF[LETTERS[k]] = k;
  // FamilySearch's own markers (data-testid), read off its bundles.
  const T = {
    rowPrefix: "table-row-",
    listUnreserve: "unreserve-button",
    unreserveForm: "unreserve-form",
    unreserveCancel: "unreserve-cancel-button",
    unreserveSubmit: "unreserve-submit-button",
    request: "ordinance-request-button",
    reserveForm: "reserve-form",
    reserveCancel: "reserve-cancel-button",
    reserveSubmit: "reserve-dialog-request-button",
    form110: "110-year-form",
  };
  // A dialog's tick box for one ordinance: <PID>_<TYPE>[_<relative ids>]. (The person's own
  // "select all" box is <PID>_checkbox and is left alone.)
  const BOX_TYPES = { BAPTISM: "baptism", CONFIRMATION: "confirmation", INITIATORY: "initiatory", ENDOWMENT: "endowment", SEALING_TO_PARENTS: "sealingToParents", SEALING_TO_SPOUSE: "sealingToSpouse" };
  // v1.0.19 — ONE BOX MAY STAND FOR SEVERAL ORDINANCES. Kevin's run on Samuel Roberts L7M5-WLQ
  // (2026-11-26): the Unreserve dialog had a single box `L7M5-WLQ_INITIATORY_ENDOWMENT` for his
  // Initiatory AND Endowment (FamilySearch handles the two as a pair there), while the Request
  // dialog had `L7M5-WLQ_INITIATORY` and `L7M5-WLQ_ENDOWMENT` apart. v1.0.18 read the pair as
  // "Initiatory", so both were unreserved and only the Initiatory was requested again — the
  // Endowment was left unreserved. A box name is now read for EVERY ordinance it names.
  const BOX_KEYS = Object.keys(BOX_TYPES).sort((a, b) => b.length - a.length);
  function parseBoxId(id) {
    const m = /^([A-Z0-9]{4}-[A-Z0-9]{2,4})_(.+)$/i.exec(String(id || ""));
    if (!m) return null;
    let rest = m[2].toUpperCase();
    const types = [];
    for (let guard = 0; rest && guard < 8; guard++) {
      const key = BOX_KEYS.find((k) => rest === k || rest.startsWith(k + "_"));
      if (!key) break;
      types.push(BOX_TYPES[key]);
      rest = rest.slice(key.length + 1);
    }
    return types.length ? { pid: m[1].toUpperCase(), types } : null;
  }
  // The ordinance letters a box stands for.
  const boxLetters = (b) => (b && Array.isArray(b.letters) ? b.letters : b && b.type ? [LETTER_OF[b.type]] : []);
  // What FamilySearch says on the page (its own spelling of "succesfully" included).
  const SAYS_UNRESERVED_RE = /succe\w*ly unreserved/i;
  const SAYS_REQUESTED_RE = /succe\w*ly requested/i;
  const SAYS_BLOCKED_RE = /Please resolve[^.]{0,80}before (?:requesting|reserving)[^.]{0,40}\.?/i;
  // A sentence in FamilySearch's Request dialog that says an ordinance cannot be requested — as
  // seen on 2026-11-26: "Sealing to Parents. Please resolve the possible duplicates before
  // reserving this ordinance." It opens with the ordinance's name.
  const WARN_RE = /Please resolve|duplicates before|data problems/i;
  const ORD_NAMES = [["Sealing to Parents", "SP"], ["Sealing to Spouse", "SS"], ["Baptism", "B"], ["Confirmation", "C"], ["Initiatory", "I"], ["Endowment", "E"]];
  // The first of those sentences that concerns one of the given ordinances — or one whose ordinance
  // cannot be told, which is taken to concern them.
  function warnFor(warns, letters) {
    for (const w of warns || []) {
      const hit = ORD_NAMES.find(([name]) => w.toLowerCase().startsWith(name.toLowerCase()));
      if (!hit || (letters || []).includes(hit[1])) return w;
    }
    return "";
  }
  const SAYS_MAXED_RE = /Max\w* Reservations Exceeded/i;
  const TERM_RE = /\b\d+\s+(?:day|month|year)s?\b/i;

  // ---- dates -----------------------------------------------------------------------------
  const MONTHS = "janfebmaraprmayjunjulaugsepoctnovdec";
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function ymd(y, m, d) {
    y = +y;
    m = +m;
    d = +d;
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return new Date(y, m - 1, d);
  }
  const monthOf = (word) => {
    const i = MONTHS.indexOf(String(word).slice(0, 3).toLowerCase());
    return i >= 0 && i % 3 === 0 ? i / 3 + 1 : 0;
  };
  // A date as FamilySearch shows it ("25 November 2026") or as its data may carry it (ISO,
  // "+2026-11-25", 20261125, epoch milliseconds) → a local-midnight Date, or null.
  function parseDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === "number") {
      if (!isFinite(v)) return null;
      if (v > 1e11) return parseDate(new Date(v));
      if (v >= 19000101 && v <= 22001231) return ymd(Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100);
      return null;
    }
    const s = String(v).trim();
    let m;
    if (/^\d{12,14}$/.test(s)) return parseDate(Number(s));
    // A full timestamp ("2027-05-21T05:29:41.415") is a moment in UTC; the page shows the day it
    // falls on HERE. (v1.0.12: read as a bare date it came out a day later than the page's
    // "Expires:" line for 33 of Kevin's 50 rows — every reservation made in his evening.)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      const t = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s + "Z");
      if (!isNaN(t)) return new Date(t.getFullYear(), t.getMonth(), t.getDate());
    }
    if ((m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(s))) return ymd(m[1], m[2], m[3]);
    if ((m = /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(s))) return ymd(m[1], m[2], m[3]);
    if ((m = /(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/.exec(s)) && monthOf(m[2])) return ymd(m[3], monthOf(m[2]), m[1]);
    if ((m = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && monthOf(m[1])) return ymd(m[3], monthOf(m[1]), m[2]);
    return null;
  }
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / 864e5);
  const fmtDate = (d) => (d ? `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : "?");
  function daysText(days) {
    if (days == null) return "";
    if (days < -1) return `expired ${-days} days ago`;
    if (days === -1) return "expired yesterday";
    if (days === 0) return "expires today";
    if (days === 1) return "expires tomorrow";
    return `expires in ${days} days`;
  }

  const NOT_A_NAME_RE = /^(male|female|unknown|unknown sex|person|portrait|select|select row)$/i;

  // ---- one relative, from the page and from the page's data -------------------------------
  // The leaf texts of one list row, in order → what the row says.
  function parseRowTexts(texts) {
    const out = { pid: null, name: "", lifespan: "", birthYear: null, reserved: null, expires: null, expiresText: "", ords: [] };
    const life = (t) => {
      out.lifespan = t.trim();
      const y = /^(\d{4})/.exec(out.lifespan);
      if (y) out.birthYear = +y[1];
    };
    // The name is the text before the life span — past the portrait's label (v1.0.9: Kevin's first
    // run read every name as "Male", the gender label FamilySearch puts on the portrait icon).
    const nameBefore = (i) => {
      for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
        const t = String(texts[j] || "").trim();
        if (!t || t === "•" || NOT_A_NAME_RE.test(t)) continue;
        return t;
      }
      return "";
    };
    for (let i = 0; i < texts.length; i++) {
      const t = String(texts[i] || "").trim();
      let m;
      if ((m = /^Expires:\s*(.+)$/i.exec(t))) {
        out.expiresText = m[1];
        out.expires = parseDate(m[1]);
      } else if ((m = /^Reserved:\s*(.+)$/i.exec(t))) out.reserved = parseDate(m[1]);
      else if (!out.pid && (m = /^(.*?)\s*•\s*([A-Z0-9]{4}-[A-Z0-9]{2,4})$/.exec(t))) {
        out.pid = m[2];
        life(m[1]);
        if (!out.name) out.name = nameBefore(i);
      } else if (!out.pid && PID_ONLY_RE.test(t)) out.pid = t;
      else if (!out.lifespan && /^(\d{4}|Deceased|Living)?\s*[–-]\s*(\d{4}|Deceased|Living)?$/.test(t) && t.length > 1) {
        life(t);
        if (!out.name) out.name = nameBefore(i);
      } else if (LETTERS[t] && i + 1 < texts.length && !LETTERS[String(texts[i + 1]).trim()]) {
        out.ords.push({ type: LETTERS[t], letter: t, status: String(texts[i + 1]).trim() });
        i++;
      }
    }
    return out;
  }
  // What the row itself shows as still reserved: a card status, not "Completed".
  const PAGE_RESERVED_RE = /^(not printed|printed)$/i;
  function fromPage(parsed, pid) {
    if (!parsed) return null;
    const id = pid || parsed.pid;
    if (!id) return null;
    return {
      pid: id,
      name: parsed.name,
      lifespan: parsed.lifespan,
      birthYear: parsed.birthYear,
      expires: parsed.expires,
      reserved: parsed.reserved,
      ords: parsed.ords.filter((o) => PAGE_RESERVED_RE.test(o.status)).map((o) => ({ type: o.type, letter: o.letter, printed: /^printed$/i.test(o.status), status: o.status })),
      source: "page",
    };
  }
  const EXP_KEYS = ["comparableExpiryDate", "expiryDate", "comparableDateExpiry", "dateExpiry"];
  const RES_KEYS = ["comparableReservedDate", "reservedDate"];
  const firstDate = (obj, keys) => {
    for (const k of keys) {
      const d = obj ? parseDate(obj[k]) : null;
      if (d) return d;
    }
    return null;
  };
  // A slim row from dqs-listen.js: the ordinances FamilySearch says this user can unreserve.
  function fromData(row) {
    if (!row || !row.id) return null;
    // What this user can unreserve — never an ordinance now with the temple (unreserving would pull
    // it back, and FamilySearch does not let it be shared a second time).
    const ords = (row.ords || []).filter((o) => o && o.canUnreserve === true && o.assignedToTemple !== true);
    let expires = null;
    let reserved = null;
    for (const o of ords) {
      const e = firstDate(o, EXP_KEYS);
      if (e && (!expires || e < expires)) expires = e;
      const r = firstDate(o, RES_KEYS);
      if (r && (!reserved || r > reserved)) reserved = r;
    }
    if (!expires) expires = firstDate(row, ["comparableDateExpiry", "dateExpiry"]);
    const y = /^\s*(\d{4})/.exec(row.lifespan || "");
    return {
      pid: row.id,
      name: row.name || "",
      lifespan: row.lifespan || "",
      birthYear: y ? +y[1] : null,
      expires,
      reserved,
      ords: ords.map((o) => ({ type: o.type, letter: LETTER_OF[o.type] || o.type, printed: o.printed === true, status: o.status || "", reasons: o.reasons || [], rel: o.rel || "", dups: Array.isArray(o.dups) ? o.dups : null, templeHeld: o.templeHeld === true || o.alternate === true })),
      // What FamilySearch's data says about the person as a whole (null = it does not say).
      dup: row.dup === true,
      permission: row.permission === true,
      source: "data",
    };
  }
  // The page wins for what it shows (it is what the user reads); the data wins for the
  // ordinances (it knows what can be unreserved and what was printed).
  function merge(page, data) {
    if (!page) return data || null;
    if (!data) return page;
    return {
      pid: page.pid,
      name: page.name || data.name,
      lifespan: page.lifespan || data.lifespan,
      birthYear: page.birthYear != null ? page.birthYear : data.birthYear,
      expires: page.expires || data.expires,
      reserved: page.reserved || data.reserved,
      ords: data.ords.length ? data.ords : page.ords,
      dup: data.dup,
      permission: data.permission,
      source: "page+data",
    };
  }
  // Whose possible duplicates stand in the way of requesting ONE ordinance again, by FamilySearch's
  // own data: a sealing to parents needs both parents clear, a sealing to spouse the spouse. (The
  // same flags sit on every ordinance of a row, so they are read by the kind of ordinance.)
  function blockersOf(o) {
    const d = (o && o.dups) || [];
    if (o.type === "sealingToParents") return d.some((x) => x === "parent1" || x === "parent2") ? ["a parent"] : [];
    if (o.type === "sealingToSpouse") return d.includes("spouse") ? ["the spouse"] : [];
    return [];
  }
  // For a relative: "" or e.g. "a parent has possible duplicates (SP)".
  function blockText(c, letters) {
    const parts = [];
    if (c.dup === true) parts.push("this relative has possible duplicates");
    for (const o of c.ords || []) {
      if (letters && !letters.includes(o.letter)) continue;
      for (const who of blockersOf(o)) parts.push(`${who} has possible duplicates (${o.letter})`);
    }
    return parts.filter((p, i, a) => a.indexOf(p) === i).join("; ");
  }
  function flagsOf(c, now) {
    return {
      // FamilySearch's data says the request would be refused: never unreserve.
      blocked: !!blockText(c),
      printed: c.ords.some((o) => o.printed),
      // A 120-day reservation: by its span, or because the data says the temple holds the ordinance
      // and the user's reservation is the alternate one.
      short: (!!(c.reserved && c.expires) && daysBetween(c.reserved, c.expires) < SHORT_SPAN_DAYS) || c.ords.some((o) => o.templeHeld === true),
      young: c.permission === true || (c.birthYear != null && c.birthYear > (now || new Date()).getFullYear() - PERMISSION_YEARS),
      // FamilySearch's own data names something that may stand in the way of requesting again:
      // possible duplicates of the person, or a reason on a still-reserved ordinance (v1.0.11 —
      // whether the data says so before an unreserve is not yet known; when it does, this catches it).
      doubt: c.ords.some((o) => o.reasons && o.reasons.length > 0),
      // More time left than a fresh reservation may get: extending now could SHORTEN it.
      long: !!c.expires && daysBetween(now || new Date(), c.expires) > NEW_TERM_DAYS,
    };
  }
  function decorate(c, now, windowDays) {
    if (!c) return null;
    c.days = c.expires ? daysBetween(now, c.expires) : null;
    c.flags = flagsOf(c, now);
    c.inWindow = c.days != null && c.days <= windowDays;
    c.extendable = c.ords.length > 0 && !!c.expires;
    // v1.0.16 — what makes a relative start unticked. NOT a printed card and NOT a 120-day
    // reservation: Kevin, 2026-11-26, from his own practice — "it is only necessary to destroy a
    // card if a person no longer holds the reservation and is not going to extend … if an
    // extension is requested then the same printed card can be used without a problem. Also, it
    // should be possible to unreserve and then reserve ordinances as often as is needed.
    // FamilySearch does not seem to penalize or frown on multiple successive extensions." Those
    // two are shown as plain notes (noteTexts).
    //
    // v1.0.17 — and NOT a birth within the last 110 years either (Kevin, the same day: such a
    // reservation "can only have been reserved with close relative permission … it should be
    // allowed to move forward with an extension just like any other expiring reservation").
    // FamilySearch may show its permission form again at the request; the run WAITS there for the
    // user to answer it (a "hold") — the form is the user's own declaration, never pressed for him.
    c.flagged = c.flags.long || c.flags.doubt || c.flags.blocked;
    return c;
  }
  const NOTE_TEXT = {
    young: "Born within the last 110 years: if FamilySearch asks for its permission again, the run waits for your answer.",
    printed: "A card is printed; the same card can still be used afterwards.",
    short: "A 120-day reservation (the temple holds the first one); the new one runs 120 days again.",
  };
  const noteTexts = (c) => Object.keys(NOTE_TEXT).filter((k) => c.flags && c.flags[k]).map((k) => NOTE_TEXT[k]);
  const FLAG_TEXT = {
    long: `More than ${NEW_TERM_DAYS} days are left; extending now could shorten this reservation.`,
  };
  function flagTexts(c) {
    const out = Object.keys(FLAG_TEXT).filter((k) => c.flags && c.flags[k]).map((k) => FLAG_TEXT[k]);
    if (c.flags && c.flags.blocked) {
      out.push(`FamilySearch's data says ${blockText(c)}. It would refuse the request — resolve the duplicates first.`);
    }
    if (c.flags && c.flags.doubt) {
      const why = (c.ords || []).map((o) => (o.reasons && o.reasons.length ? `${o.letter}: ${o.reasons.join("; ")}` : "")).filter(Boolean);
      out.push(`FamilySearch's data names something that may block the request (${why.join(" · ").slice(0, 160)}).`);
    }
    return out;
  }

  // ---- state -----------------------------------------------------------------------------
  const state = {
    wasOn: false,
    pinged: false,
    rows: new Map(), // pid → slim row (the page's own data)
    mine: null, // Set of the user's own list ids, null = not seen
    shapeLogged: false,
    shape: "",
    seen: [], // the page's own reservations requests, as dqs-listen.js noted them
    seenLogged: "",
    lastLine: "",
    reported: typeof WeakSet === "function" ? new WeakSet() : null,
    rowCache: typeof WeakMap === "function" ? new WeakMap() : null,
    ordLine: "",
    censusLine: "",
    phaseKey: "", // the step the pump is on, and how many times it has looked at it
    phaseSteps: 0,
    boxTries: {},
    missed: "",
    notes: [], // findings waiting to be written into the job (see note / saveJob)
    lastJob: null, // the job of the run that just ended — for "Copy the findings"
    pump: null,
    banner: "",
  };
  // A finding of the run: to the console now, and into the job at its next save, so that it
  // survives the page loads of a run (v1.0.9 — Kevin's first rehearsal lost every line logged on
  // the Ordinances tab when the tab went back to the list).
  // v1.0.21 — the findings are made to be pasted to someone else: whoever FamilySearch names as
  // holding a reservation ("Reserved by <contact name>." in a row, a dialog, a tick-box label) is
  // left out of them, as the capture already leaves it out of the data.
  const HOLDER_RE = /\b(Reserved|Shared|Requested|Printed) by [^.|"]*/gi;
  const unnamed = (s) => String(s).replace(HOLDER_RE, "$1 by <someone>");
  function note(line) {
    line = unnamed(line);
    log(line);
    state.notes.push(line);
    if (state.notes.length > 80) state.notes.shift();
  }
  const settingsOf = () => FSSE.settings || null;
  function enabled() {
    const s = settingsOf();
    if (!s) return true; // no settings store (the tests): on, like every other module
    return s.loaded !== false && s.get("temple.extend") === true;
  }
  // The real run is on only when the settings say so in as many words: "Rehearse only" switched
  // OFF. Unknown (no settings store, a value not there) = a rehearsal, which changes nothing.
  function isReal() {
    const s = settingsOf();
    return !!s && s.get("temple.extendRehearsal") === false;
  }
  function windowDays() {
    const s = settingsOf();
    const n = s ? parseInt(s.get("temple.extendDays"), 10) : NaN;
    return n > 0 ? n : DEFAULT_WINDOW_DAYS;
  }
  // v1.0.28 — the demo: on only when the settings say so in as many words.
  function demoOn() {
    const s = settingsOf();
    return !!s && s.get("temple.extendDemo") === true;
  }
  // A decorated relative as the demo shows it: the same person and ordinances, a pretended expiry
  // date DEMO_DAYS away. What is true of the relative stays (a printed card, a note of
  // FamilySearch's data); "more than 120 days left" is about the date and goes.
  function demoOf(c, now) {
    const t = midnight(now || new Date());
    const d = Object.assign({}, c, { demo: true, realExpires: c.expires, expires: new Date(t.getFullYear(), t.getMonth(), t.getDate() + DEMO_DAYS), days: DEMO_DAYS, inWindow: true });
    d.flags = Object.assign({}, c.flags, { long: false });
    d.flagged = !!(d.flags.doubt || d.flags.blocked);
    return d;
  }
  const pathNow = () => (typeof location !== "undefined" && location.pathname) || "";
  const isReservationsPage = () => RES_PATH_RE.test(pathNow());
  const ordinancesPid = () => {
    const m = ORD_PATH_RE.exec(pathNow());
    return m ? m[1].toUpperCase() : null;
  };
  const ordUrl = (pid) => `${ORIGIN}/en/tree/person/ordinances/${pid}`;

  // The page's data (dqs-listen.js posts its whole cache each time).
  function receive(rows, mine, shape, seen) {
    if (Array.isArray(rows)) {
      state.rows = new Map();
      for (const r of rows) if (r && typeof r.id === "string") state.rows.set(r.id, r);
    }
    if (Array.isArray(mine)) state.mine = new Set(mine);
    if (shape && !state.shapeLogged) {
      state.shapeLogged = true;
      state.shape = shape;
      log("the page's own reservation data, first row as received (keys and types; samples only for dates and flags):", shape);
    }
    if (Array.isArray(seen)) {
      state.seen = seen.map(String);
      const sig = state.seen.join("\n");
      if (sig !== state.seenLogged) {
        state.seenLogged = sig;
        log(`the page's own reservations requests so far (${state.seen.length}):\n  ` + state.seen.join("\n  "));
      }
    }
    return true;
  }
  // What the page's own data says about one relative's open ordinances — for the findings and the
  // console (v1.0.11: the data that may tell, before an unreserve, that a request would be refused).
  function dataNote(pid) {
    const r = state.rows.get(pid);
    if (!r) return `${pid}: the page's data has no row for this relative`;
    const open = (r.ords || []).filter((o) => !/^completed$/i.test(o.status || ""));
    const one = (o) =>
      `${LETTER_OF[o.type] || o.type} ${o.status || "?"}${o.statusText ? ` "${o.statusText}"` : ""}${o.canUnreserve ? " canUnreserve" : ""}${o.canReserve ? " canReserve" : ""}${o.assignedToTemple ? " withTemple" : ""}${o.templeHeld ? " templeHoldsTheFirstReservation" : ""}${o.alternate ? " alternate(yours)" : ""}` +
      `${o.reasons && o.reasons.length ? ` reasons[${o.reasons.join(" / ")}]` : " reasons[]"} duplicates[${Array.isArray(o.dups) ? o.dups.join(",") || "none" : "not stated"}]${o.hover ? ` hover"${o.hover}"` : ""}${o.rel ? ` people{${o.rel}}` : ""}`;
    return `${pid}: possibleDuplicates=${r.dup}, requiresPermission=${r.permission}, rollup=${r.rollup || "?"}; ${open.length ? open.map(one).join(" ;; ") : "no ordinance that is not completed"}`;
  }
  // The same over the whole list: how often the data names a reason or a flag at all.
  function census() {
    let people = 0;
    let reserved = 0;
    let withReason = 0;
    let dup = 0;
    let dupUnknown = 0;
    let permission = 0;
    let refused = 0; // reserved ordinances whose request FamilySearch's data says it would refuse
    let stated = 0; // reserved ordinances for which the data states the duplicates flags at all
    let anyDup = 0; // relatives with a parent or the spouse flagged, whatever the ordinance
    const reasons = new Map();
    const flagged = [];
    for (const r of state.rows.values()) {
      people++;
      if (r.dup === true) dup++;
      else if (r.dup == null) dupUnknown++;
      if (r.permission === true) permission++;
      let mark = r.dup === true;
      if ((r.ords || []).some((o) => Array.isArray(o.dups) && o.dups.length)) anyDup++;
      for (const o of r.ords || []) {
        if (!o.canUnreserve) continue;
        reserved++;
        if (Array.isArray(o.dups)) stated++;
        if (blockersOf(o).length) {
          refused++;
          mark = true;
        }
        if (o.reasons && o.reasons.length) {
          withReason++;
          mark = true;
          for (const x of o.reasons) reasons.set(x, (reasons.get(x) || 0) + 1);
        }
      }
      if (mark && flagged.length < 8) flagged.push(r.id);
    }
    const top = Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ×${n}`);
    return (
      `the page's data over ${people} relative(s): ${reserved} ordinance(s) you can unreserve — duplicates flags stated for ${stated}, a request would be refused over possible duplicates for ${refused}; ` +
      `${withReason} with a reason listed${top.length ? " (" + top.join(" · ") + ")" : ""}; a parent or the spouse flagged for ${anyDup} relative(s); the relative's own possible duplicates true for ${dup}, not stated for ${dupUnknown}; permission required for ${permission}` +
      (flagged.length ? `; flagged: ${flagged.join(", ")}` : "")
    );
  }
  function ping() {
    if (state.pinged || typeof window === "undefined" || !window.postMessage) return;
    state.pinged = true;
    try {
      window.postMessage({ source: FROM_EXT, type: "FSSE_RESERVATIONS_REQUEST" }, location.origin);
    } catch (_) {
      /* ignore */
    }
  }

  // ---- DOM helpers -----------------------------------------------------------------------
  const all = (sel, root) => {
    try {
      return Array.from((root || document).querySelectorAll(sel));
    } catch (_) {
      return [];
    }
  };
  const byTestId = (id, root) => all(`[data-testid="${id}"]`, root)[0] || null;
  const ours = (el) => {
    for (let n = el; n; n = n.parentElement) if (n.hasAttribute && n.hasAttribute(ATTR)) return true;
    return false;
  };
  function shown(el) {
    try {
      if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return !r || (r.width >= 2 && r.height >= 2);
    } catch (_) {
      return true;
    }
  }
  const isDisabled = (el) => !!el && (el.disabled === true || (el.getAttribute && (el.getAttribute("aria-disabled") === "true" || el.getAttribute("disabled") != null)));
  const textOf = (el) => String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  // The row's leaf elements with their text, in document order, ours left out.
  function leaves(root) {
    const out = [];
    for (const el of all("*", root)) {
      if (el.children && el.children.length) continue;
      if (ours(el)) continue;
      const t = textOf(el);
      if (t) out.push({ el, text: t });
    }
    return out;
  }
  // The smallest elements under `root` whose whole text matches `re` — a label and its value may be
  // one text ("Expires: 25 November 2026") or a text plus a child element; either way the element
  // that holds both, and no child that does.
  function smallest(root, re) {
    return all("*", root).filter((n) => !ours(n) && re.test(textOf(n)) && !Array.from(n.children || []).some((c) => re.test(textOf(c))));
  }
  const EXPIRES_RE = /^Expires:\s*\S/i;
  const RESERVED_RE = /^Reserved:\s*\S/i;
  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---- the list page ---------------------------------------------------------------------
  // The reservation rows now rendered: by FamilySearch's row marker, else by the visible text.
  function findRows() {
    const out = [];
    const seen = new Set();
    for (const rowEl of all(`[data-testid^="${T.rowPrefix}"]`)) {
      const pid = String(rowEl.getAttribute("data-testid")).slice(T.rowPrefix.length).toUpperCase();
      if (!PID_ONLY_RE.test(pid) || seen.has(pid)) continue;
      seen.add(pid);
      out.push({ el: rowEl, pid, via: "marker" });
    }
    if (out.length) return out;
    // No marker: climb from each "Expires:" leaf to the smallest ancestor whose own leaf texts
    // also name the person's ID. (Read leaf by leaf — an element's textContent runs its texts
    // together with no separator, so an ID cannot be picked out of it.) An ancestor holding a
    // second "Expires:" line is already the list, not a row.
    for (const leaf of smallest(null, EXPIRES_RE)) {
      let n = leaf.parentElement;
      for (let up = 0; n && up < 10; up++, n = n.parentElement) {
        if (smallest(n, EXPIRES_RE).length > 1) break;
        const pid = parseRowTexts(leaves(n).map((l) => l.text)).pid;
        if (!pid) continue;
        if (!seen.has(pid)) {
          seen.add(pid);
          out.push({ el: n, pid, via: "text" });
        }
        break;
      }
    }
    return out;
  }
  // What one row says. Kept per row element while its text stays the same — the list holds 50
  // rows and this runs at every page tick.
  function readRow(rowEl) {
    const key = String(rowEl.textContent || "");
    const hit = state.rowCache ? state.rowCache.get(rowEl) : null;
    if (hit && hit.key === key && (!hit.expEl || hit.expEl.parentElement)) return hit;
    const parsed = parseRowTexts(leaves(rowEl).map((l) => l.text));
    // The two date lines are read from the element that holds label and date together.
    const expEl = smallest(rowEl, EXPIRES_RE)[0] || null;
    const resEl = smallest(rowEl, RESERVED_RE)[0] || null;
    if (expEl && !parsed.expires) {
      parsed.expiresText = textOf(expEl).replace(/^Expires:\s*/i, "");
      parsed.expires = parseDate(parsed.expiresText);
    }
    if (resEl && !parsed.reserved) parsed.reserved = parseDate(textOf(resEl).replace(/^Reserved:\s*/i, ""));
    const rec = { key, parsed, expEl };
    if (state.rowCache) state.rowCache.set(rowEl, rec);
    return rec;
  }
  // Everything known now: the rendered rows (with their elements) and every relative of the list.
  // `plain` = without the demo's pretended date (what a real run reads the list with).
  function model(now, plain) {
    const today = now || new Date();
    const win = windowDays();
    const rendered = [];
    const byPid = new Map();
    for (const row of findRows()) {
      const { parsed, expEl } = readRow(row.el);
      const c = decorate(merge(fromPage(parsed, row.pid), fromData(state.rows.get(row.pid))), today, win);
      if (!c) continue;
      rendered.push({ rowEl: row.el, expiresEl: expEl, via: row.via, c });
      byPid.set(c.pid, c);
    }
    for (const [pid, r] of state.rows) {
      if (byPid.has(pid)) continue;
      if (state.mine && !state.mine.has(pid)) continue; // another list (shared with the temple, a group)
      const c = decorate(fromData(r), today, win);
      if (c && c.extendable) byPid.set(pid, c);
    }
    // The demo's relative: of the rows on the page, the reservation that expires soonest but not
    // inside the window (one FamilySearch's data would refuse is passed over).
    const pick = !plain && demoOn() ? rendered.filter((r) => r.c.extendable && !r.c.inWindow && !r.c.flags.blocked).sort((a, b) => a.c.days - b.c.days)[0] : null;
    if (pick) {
      pick.c = demoOf(pick.c, today);
      byPid.set(pick.c.pid, pick.c);
    }
    const demoPid = pick ? pick.c.pid : null;
    const expiring = Array.from(byPid.values())
      .filter((c) => c.extendable && c.inWindow)
      .sort((a, b) => a.days - b.days);
    return { rendered, byPid, expiring, windowDays: win, demoPid };
  }

  const CHIP_CSS = "display:inline-block;padding:1px 8px;border-radius:10px;font:600 12px/1.5 system-ui,Arial,sans-serif;margin-right:8px;";
  function chipLook(c) {
    if (c.days == null) return { text: "", css: "" };
    if (!c.inWindow) return { text: `${c.days} days left`, css: "font:12px/1.5 system-ui,Arial,sans-serif;color:#667;margin-right:8px;" };
    const red = c.days <= 3;
    return { text: daysText(c.days) + (c.demo ? " (demo)" : ""), css: CHIP_CSS + (red ? "background:#fde7e9;color:#b3261e;" : "background:#fff4ce;color:#8a5a00;") };
  }
  const LINK_CSS = "font:600 12px/1.5 system-ui,Arial,sans-serif;color:#066f90;cursor:pointer;text-decoration:none;white-space:nowrap;";
  function syncRow(r) {
    if (!r.expiresEl || !r.expiresEl.insertAdjacentElement) return false;
    const c = r.c;
    let wrap = all(`[${ATTR}="row"]`, r.rowEl)[0] || null;
    const look = chipLook(c);
    // v1.0.14 (Kevin, 2026-11-26: "little value in extending a reservation that is already months
    // in the future … a time threshold, perhaps 2 weeks out, beyond which no extension is
    // offered"): the Extend link only inside the window of the settings. Outside it the row shows
    // the days left and nothing to press.
    const offered = c.extendable && c.inWindow;
    const win = windowDays();
    const sig = [c.pid, look.text, look.css, offered ? 1 : 0, win].join("|");
    if (wrap && wrap._fsseSig === sig) return true;
    if (wrap) wrap.remove();
    wrap = el("div", "margin:4px 0 2px;");
    wrap.setAttribute(ATTR, "row");
    wrap.setAttribute("data-pid", c.pid);
    wrap._fsseSig = sig;
    if (look.text) {
      const chip = el("span", look.css, look.text);
      if (!offered && c.extendable) chip.title = `Extend is offered within ${win} days of the expiry date (a setting).`;
      if (c.demo) chip.title = `Demo (an Advanced setting): the real expiry date is ${fmtDate(c.realExpires)}.`;
      wrap.appendChild(chip);
    }
    if (offered) {
      const a = el("a", LINK_CSS, "↻ Extend");
      a.setAttribute("href", "#");
      a.setAttribute("role", "button");
      a.title = FSSE.wrapTip ? FSSE.wrapTip(linkTip(c)) : linkTip(c);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const m = model();
        openDialog(m.byPid.get(c.pid) || c);
      });
      wrap.appendChild(a);
    }
    r.expiresEl.insertAdjacentElement("afterend", wrap);
    return true;
  }
  const ordsText = (c) => c.ords.map((o) => o.letter).join(", ");
  function linkTip(c) {
    if (c.demo) return `Demo: opens FamilySearch's dialogs and cancels them. Nothing is changed. ${c.name || c.pid}: ${ordsText(c)} — really expires ${fmtDate(c.realExpires)}.`;
    const what = `${c.name || c.pid}: ${ordsText(c)} — expires ${fmtDate(c.expires)}.`;
    return isReal()
      ? `Unreserve and request again with FamilySearch's own buttons. You confirm first. ${what}`
      : `Rehearsal: opens FamilySearch's dialogs and cancels them. Nothing is changed. ${what}`;
  }
  function syncList() {
    const m = model();
    let chips = 0;
    for (const r of m.rendered) if (syncRow(r)) chips++;
    const mismatched = m.rendered.filter((r) => {
      if (r.c.demo) return false; // its date is pretended
      const d = fromData(state.rows.get(r.c.pid));
      return d && d.expires && r.c.expires && daysBetween(d.expires, r.c.expires) !== 0;
    }).length;
    const line =
      `${m.rendered.length} row(s) on the page (${m.rendered.length ? m.rendered[0].via : "none found"}), ${chips} with a days-left line; ` +
      `the page's data: ${state.rows.size} reservation(s)${state.mine ? `, ${state.mine.size} on this list` : ""}; ` +
      `${m.expiring.length} inside the ${m.windowDays}-day window${m.expiring.length ? ": " + m.expiring.map((c) => `${c.pid} ${c.days}d [${ordsText(c)}]${c.demo ? " (demo — a pretended date)" : ""}`).join(", ") : ""}` +
      (mismatched ? `; ${mismatched} row(s) where the data's expiry date differs from the page's` : "");
    if (line !== state.lastLine) {
      state.lastLine = line;
      log(line);
    }
    if (state.rows.size) {
      const c = census();
      if (c !== state.censusLine) {
        state.censusLine = c;
        log(c);
      }
    }
    return m;
  }
  function removeAll() {
    for (const n of all(`[${ATTR}]`)) n.remove();
    state.banner = "";
  }

  // ---- our confirmation ------------------------------------------------------------------
  function closeDialog() {
    for (const n of all(`[${ATTR}="dialog"]`)) n.remove();
  }
  // One relative at a time (v1.0.22) — the relative of the row whose link was pressed.
  function openDialog(c) {
    closeDialog();
    // Only a relative whose reservation expires inside the window — whatever asked for the dialog.
    if (!c || !c.extendable || !c.inWindow) return null;
    // The demo's relative is always walked through as a rehearsal, whatever the settings say.
    const demo = c.demo === true;
    const real = !demo && isReal();
    const veil = el("div", "position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;");
    veil.setAttribute(ATTR, "dialog");
    const box = el("div", "background:#fff;color:#222;max-width:640px;width:calc(100% - 48px);max-height:86vh;overflow:auto;border-radius:8px;padding:20px 24px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:14px/1.45 system-ui,Arial,sans-serif;");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.appendChild(el("h2", "margin:0 0 8px;font:600 18px/1.3 system-ui,Arial,sans-serif;", real ? "Extend this reservation" : demo ? "Extend this reservation — demo" : "Extend this reservation — rehearsal"));
    const para = (text) => box.appendChild(el("p", "margin:0 0 12px;", text));
    // v1.0.24 (Kevin, 2026-11-26: "too verbose … simplified to just a few lines, perhaps 4 or so"):
    // one short paragraph — what is pressed, what to do meanwhile, the one risk.
    if (real) {
      para(
        "This presses FamilySearch's own Unreserve and Request buttons on this relative's Ordinances tab, for the ordinances below only. " +
          "Keep this tab in front until it returns here with the new expiry date. " +
          "If FamilySearch refuses the request (possible duplicates, for example), the ordinances stay unreserved until you press Request yourself."
      );
    } else if (demo) {
      para(
        `Demo: this reservation really expires on ${fmtDate(c.realExpires)}. ` +
          "The demo opens FamilySearch's Unreserve and Request dialogs on this relative's Ordinances tab, shows each for a moment and cancels it. Nothing is changed."
      );
    } else {
      para("Rehearsal: opens FamilySearch's Unreserve and Request dialogs on this relative's Ordinances tab, then cancels them. Nothing is changed.");
    }
    const row = el("label", "display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #e3e6e8;cursor:pointer;");
    const cb = el("input", "margin-top:3px;");
    cb.type = "checkbox";
    // A rehearsal changes nothing, so the relative starts ticked. For the real run a flagged
    // relative starts unticked — the tick is the user's own decision — and one for whom
    // FamilySearch's data says the request would be refused cannot be ticked at all.
    cb.checked = real ? !c.flagged : true;
    if (real && c.flags && c.flags.blocked) {
      cb.disabled = true;
      cb.checked = false;
    }
    cb._fssePid = c.pid;
    const txt = el("span", "flex:1;");
    txt.appendChild(el("strong", "", c.name || c.pid));
    txt.appendChild(document.createTextNode(` (${[c.lifespan, c.pid].filter(Boolean).join(" • ")}) — ${ordsText(c)} — expires ${fmtDate(c.expires)}, ${daysText(c.days) || "date unknown"}`));
    for (const f of flagTexts(c)) txt.appendChild(el("small", "display:block;color:#8a5a00;margin-top:2px;", "⚠ " + f));
    for (const n of noteTexts(c)) txt.appendChild(el("small", "display:block;color:#667;margin-top:2px;", n));
    // v1.0.15 — say why a box is not ticked and what to do about it (Kevin's David Cowan Dickie:
    // the box started unticked, the button then closed the dialog and "nothing happened").
    if (cb.disabled) txt.appendChild(el("small", "display:block;color:#b3261e;font-weight:600;margin-top:4px;", "Cannot be extended until that is resolved."));
    else if (!cb.checked) txt.appendChild(el("small", "display:block;color:#222;font-weight:600;margin-top:4px;", "Not ticked because of the note above. Tick the box to go ahead anyway."));
    row.appendChild(cb);
    row.appendChild(txt);
    box.appendChild(row);
    const foot = el("div", "display:flex;gap:10px;justify-content:flex-end;margin-top:16px;");
    const cancel = el("button", "padding:7px 14px;border:1px solid #9aa3ab;border-radius:4px;background:#fff;color:#222;font:inherit;cursor:pointer;", "Cancel");
    cancel.type = "button";
    const go = el("button", "padding:7px 14px;border:1px solid #066f90;border-radius:4px;background:#066f90;color:#fff;font:inherit;font-weight:600;cursor:pointer;", real ? "Unreserve and request again" : demo ? "Start the demo" : "Rehearse");
    go.type = "button";
    go.setAttribute(ATTR + "-go", "1");
    cancel.addEventListener("click", closeDialog);
    veil.addEventListener("click", (e) => {
      if (e.target === veil) closeDialog();
    });
    // Nothing ticked: the dialog stays and says so — it never closes as if something had started.
    const hint = el("p", "margin:12px 0 0;color:#b3261e;font-weight:600;display:none;", "");
    hint.setAttribute(ATTR + "-hint", "1");
    go.addEventListener("click", () => {
      if (!cb.checked || cb.disabled) {
        hint.textContent = cb.disabled
          ? "Nothing can be started — see the note above."
          : "Nothing is ticked. Tick the box, or press Cancel.";
        hint.style.display = "block";
        log("dialog: the button was pressed with nothing ticked — the dialog stays open");
        return;
      }
      closeDialog();
      startJob(c, real);
    });
    box.appendChild(hint);
    foot.appendChild(cancel);
    foot.appendChild(go);
    box.appendChild(foot);
    veil.appendChild(box);
    (document.body || document.documentElement).appendChild(veil);
    log(`dialog (${real ? "the real run" : demo ? "the demo" : "a rehearsal"}) for ${c.pid} [${ordsText(c)}]${c.flagged ? " flagged" : ""}`);
    return veil;
  }

  // ---- the job (this tab's sessionStorage) -------------------------------------------------
  const store = () => {
    try {
      return typeof sessionStorage !== "undefined" ? sessionStorage : null;
    } catch (_) {
      return null;
    }
  };
  function loadJob(now) {
    const s = store();
    if (!s) return null;
    try {
      const j = JSON.parse(s.getItem(JOB_KEY));
      if (!j || j.v !== 1 || !Array.isArray(j.queue)) return null;
      if ((now || Date.now()) - (j.at || 0) > JOB_TTL_MS) {
        s.removeItem(JOB_KEY);
        return null;
      }
      return j;
    } catch (_) {
      return null;
    }
  }
  function saveJob(j, now) {
    const s = store();
    if (!s) return;
    try {
      j.at = now || Date.now();
      if (state.notes.length) {
        j.diag = (j.diag || []).concat(state.notes).slice(-200);
        state.notes = [];
      }
      s.setItem(JOB_KEY, JSON.stringify(j));
    } catch (_) {
      /* a full or disabled store: the run cannot survive a page load — it stops at the next one */
    }
  }
  function clearJob() {
    const s = store();
    try {
      if (s) s.removeItem(JOB_KEY);
    } catch (_) {
      /* ignore */
    }
  }
  // A job is for one relative. `queue` holds that one entry (and `i` goes 0 → 1 when it is done):
  // the shape the engine was proven with, kept as it was.
  function newJob(c, now, real) {
    const t = now || Date.now();
    // The demo's relative: never the real run, and the job says so (`demo`).
    if (c.demo) {
      const j = newJob(Object.assign({}, c, { demo: false }), t, false);
      j.demo = true;
      j.queue[0].realExpires = fmtDate(c.realExpires);
      return j;
    }
    return {
      v: 1,
      rehearsal: real !== true,
      at: t,
      i: 0,
      phase: "open",
      phaseAt: t,
      clicked: null,
      navAt: null,
      navs: 0,
      queue: [{ pid: c.pid, name: c.name || c.pid, ords: c.ords.map((o) => o.letter), expires: fmtDate(c.expires) }],
      results: [],
    };
  }
  function startJob(c, real) {
    const j = newJob(c, null, real);
    state.lastJob = null;
    note(`${j.demo ? "demo" : j.rehearsal ? "rehearsal" : "run"} started for ${j.queue.map((q) => `${q.pid} "${q.name}" [${q.ords.join(", ")}]`).join(", ")}`);
    // How the list page renders the relative — the texts of the row, in order.
    try {
      const row = findRows().find((r) => r.pid === j.queue[0].pid);
      if (row) note(`list row of ${row.pid} (found by ${row.via}), its texts in order: ${leaves(row.el).map((l) => l.text).slice(0, 40).join(" | ")}`);
    } catch (_) {
      /* a finding only */
    }
    note(`the page's own data at the start: ${state.rows.size} row(s), ${state.mine ? state.mine.size : "no"} id(s) on the list`);
    note(census());
    for (const q of j.queue.slice(0, 5)) note("list data — " + dataNote(q.pid));
    saveJob(j);
    pump();
  }
  // Everything a run found, as one text to hand over.
  function findingsText(job) {
    const version = typeof FSSE.version === "function" ? FSSE.version() : "?";
    const lines = [
      `Search Enhancer for FamilySearch v${version} — extend-reservation ${job.demo ? "demo" : job.rehearsal ? "rehearsal" : "run"} findings`,
      job.failed ? `STOPPED: ${job.failed}` : summaryText(job),
      `the page's own data now: ${state.rows.size} row(s), ${state.mine ? state.mine.size : "no"} id(s) on the list`,
      `first data row: ${state.shape || "(none received)"}`,
    ];
    for (const s of state.seen) lines.push("request seen: " + s);
    for (const d of job.diag || []) lines.push(d);
    return lines.join("\n");
  }
  function copyText(text, done) {
    const fallback = () => {
      try {
        const ta = el("textarea", "position:fixed;top:0;left:0;opacity:0;");
        ta.value = text;
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        done(!!ok);
      } catch (_) {
        done(false);
      }
    };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => done(true), fallback);
        return;
      }
    } catch (_) {
      /* fall through */
    }
    fallback();
  }
  function copyFindings(e) {
    if (!state.lastJob) return;
    const text = findingsText(state.lastJob);
    log("findings:\n" + text);
    const btn = e && e.target;
    copyText(text, (ok) => {
      if (btn) btn.textContent = ok ? "Copied ✓" : "Could not copy — see the console (F12)";
    });
  }

  // ---- the engine: what to do next, from the job and what the page shows (pure) -------------
  // snap = { now, ordPid, onList, pageReady, unreserveOpener, requestButton: {found, disabled},
  //          unreserveForm, reserveForm }
  // → { type: "wait" | "click" | "navigate" | "goto" | "fail" | "finish", … }
  //
  // THE REAL RUN (job.rehearsal false) — the steps between "open" and "next":
  //   unreserve-open   press FamilySearch's Unreserve button, wait for its dialog
  //   unreserve-set    tick exactly the ordinances of this relative that the list showed as
  //                    reserved, untick any other, then press FamilySearch's Unreserve
  //   unreserve-wait   until the dialog has closed
  //   request-open     give the page a moment, press FamilySearch's Request button
  //   request-set      tick exactly the ordinances just unreserved, UNTICK EVERY OTHER (the dialog
  //                    arrives with everything requestable ticked), then press Request
  //   request-wait     until the dialog has closed
  //   request-check    FamilySearch's confirmation, or four quiet seconds
  // A "fail" carries where things stand: before (nothing changed) | unsure-unreserve |
  // unreserved | unsure-request.
  const REAL_AFTER_SUBMIT_RE = /^(unreserve-wait|request-open|request-set|request-wait|request-check)$/;
  const STAGE_OF = { "unreserve-wait": "unsure-unreserve", "request-open": "unreserved", "request-set": "unreserved", "request-wait": "unsure-request", "request-check": "unsure-request" };
  const lettersOf = (list) => (list || []).map((r) => r.letter).join(", ");
  function nextReal(job, snap) {
    const cur = job.queue[job.i];
    const waited = snap.now - job.phaseAt;
    // Late = the time is up AND the page was looked at often enough in this step (a tab in the
    // background runs its timers a few times a minute; the clock alone would time out unfairly).
    const late = (ms) => waited > ms && (snap.steps == null || snap.steps >= 6);
    const settling = job.clicked != null && snap.now - job.clicked < SETTLE_MS;
    const wait = { type: "wait" };
    // Once the user has answered FamilySearch's permission form after the unreserve, what happens
    // next is not known (the form may complete the request by itself): a stop from there on says
    // "check whether it is reserved again", not "it is not reserved".
    const stageNow = () => (job.heldAfter && STAGE_OF[job.phase] === "unreserved" ? "unsure-request" : STAGE_OF[job.phase] || "before");
    const fail = (reason, stage) => ({ type: "fail", reason, stage: stage || stageNow() });
    if (snap.hidden) return wait; // nothing is pressed in a tab nobody is looking at
    if (snap.ordPid !== cur.pid) return fail(`the tab left the Ordinances tab of ${cur.name}`);
    // FamilySearch's 110-year permission form: the run holds — no press, no clock — until the user
    // has answered it.
    if (snap.form110) return { type: "hold", after: REAL_AFTER_SUBMIT_RE.test(job.phase) };
    const boxesIn = (list) => (list || []).filter((b) => boxLetters(b).length && b.pid === cur.pid);
    switch (job.phase) {
      case "request-peek": {
        // v1.0.11 — BEFORE anything is unreserved: when FamilySearch offers Request, its dialog is
        // opened and read. A sentence there that an ordinance of this run cannot be requested
        // stops the run with nothing changed. (Kevin's first real run, Francis Lambert: the
        // Sealing to Parents was unreserved and FamilySearch then refused it over possible
        // duplicates of the mother. Whether the dialog says so while the ordinance is still
        // reserved is not known — this is the look that finds out, and it proves the dialog opens.)
        //
        // v1.0.12 — and first of all the page's own data, which names possible duplicates of the
        // parents and the spouse on every ordinance (relationships.parent1HasPossibleDuplicates …):
        // flagged → stop, nothing changed. The data is waited for, four seconds at most.
        if (snap.dataBlock && !snap.reserveForm) return fail(`FamilySearch's data says ${snap.dataBlock}; it would refuse the request until that is resolved`, "before");
        if (!snap.dataSeen && !snap.reserveForm && !job.clicked && waited < 4000) return wait;
        if (snap.reserveForm) {
          if (settling) return wait;
          const hit = warnFor(snap.reserveWarns, cur.ords);
          if (hit) return fail(`FamilySearch's Request dialog (left open) says: "${hit}"`, "before");
          const marked = cur.ords.filter((l) => (snap.reserveDupLetters || []).includes(l));
          if (marked.length) return fail(`FamilySearch's Request dialog (left open) shows possible duplicates for ${marked.join(", ")}; resolve them first (View Duplicates)`, "before");
          const others = (snap.reserveWarns || []).join(" / ");
          return { type: "click", target: "reserveCancel", then: "unreserve-open", result: { peek: others ? `nothing about ${cur.ords.join(", ")}; about other ordinances: ${others}` : "nothing in the way shown" } };
        }
        const rb = snap.requestButton;
        if (rb.found && !rb.disabled) {
          if (!job.clicked) return { type: "click", target: "requestButton" };
          return late(STEP_TIMEOUT_MS) ? fail("FamilySearch's Request dialog did not open", "before") : wait;
        }
        if (waited > 3000) return { type: "goto", phase: "unreserve-open", result: { peek: "Request is not offered before the unreserve" } };
        return wait;
      }
      case "unreserve-open":
        if (snap.reserveForm) return late(STEP_TIMEOUT_MS) ? fail("FamilySearch's Request dialog did not close after Cancel — close it yourself") : wait;
        if (snap.unreserveForm) return { type: "goto", phase: "unreserve-set" };
        if (settling) return wait;
        if (snap.unreserveOpener && !(job.opens > 0)) return { type: "click", target: "unreserveOpener", count: "opens" };
        if (late(STEP_TIMEOUT_MS)) return fail(snap.unreserveOpener ? "FamilySearch's Unreserve dialog did not open" : "no Unreserve button was found on this relative's Ordinances tab");
        return wait;
      case "unreserve-set": {
        if (!snap.unreserveForm) return late(3000) ? fail("FamilySearch's Unreserve dialog closed before Unreserve was pressed") : wait;
        if (settling) return wait;
        const boxes = boxesIn(snap.unreserveBoxes);
        // A box is wanted when it stands for one of the run's ordinances — and everything it stands
        // for is then what gets unreserved (a pair box releases both of its ordinances).
        const want = boxes.filter((b) => !b.disabled && boxLetters(b).some((l) => cur.ords.includes(l)));
        if (!want.length) return late(BOX_WAIT_MS) ? fail(`FamilySearch's Unreserve dialog has no tick box for ${cur.ords.join(", ")}`) : wait;
        // Every ordinance the dialog LISTS must be accounted for by a box that was understood —
        // else the run does not know what a press would unreserve, and presses nothing.
        const covered = new Set();
        for (const b of boxes) for (const l of boxLetters(b)) covered.add(l);
        const unknown = (snap.unreserveLetters || []).filter((l) => !covered.has(l));
        if (unknown.length) return fail(`FamilySearch's Unreserve dialog lists ${unknown.join(", ")} but no tick box was recognised for ${unknown.length > 1 ? "them" : "it"}`);
        const ids = new Set(want.map((b) => b.id));
        const stuck = boxes.find((b) => b.disabled && b.on && !ids.has(b.id));
        if (stuck) return fail(`FamilySearch's Unreserve dialog would also unreserve ${boxLetters(stuck).join(", ")}, which cannot be unticked`);
        const wrong = boxes.find((b) => !b.disabled && b.on !== ids.has(b.id));
        if (wrong) return (job.toggles || 0) >= MAX_TOGGLES ? fail(`a tick box in FamilySearch's Unreserve dialog did not change (${wrong.id})`) : { type: "click", target: "box", form: "unreserve", id: wrong.id, toggle: true };
        if (snap.unreserveSubmit && snap.unreserveSubmit.found && !snap.unreserveSubmit.disabled) {
          // One entry per ORDINANCE released (a pair box gives two), each with the box it came from.
          const released = [];
          for (const b of want) for (const letter of boxLetters(b)) released.push({ id: b.id, letter });
          return { type: "click", target: "unreserveSubmit", then: "unreserve-wait", released };
        }
        return late(STEP_TIMEOUT_MS) ? fail("the Unreserve button in FamilySearch's dialog stayed disabled") : wait;
      }
      case "unreserve-wait":
        if (!snap.unreserveForm) return { type: "goto", phase: "request-open", result: { unreserve: snap.saysUnreserved ? "done, FamilySearch confirmed" : "done" } };
        if (late(STEP_TIMEOUT_MS)) return fail("FamilySearch's Unreserve dialog did not close after Unreserve was pressed");
        return wait;
      case "request-open": {
        if (snap.reserveForm) return settling ? wait : { type: "goto", phase: "request-set" };
        // The permission form was answered and FamilySearch says the request went through.
        if (job.heldAfter && snap.saysRequested) return { type: "goto", phase: "next", result: { request: "done, FamilySearch confirmed (after its permission form)", ok: true } };
        if (waited < AFTER_UNRESERVE_MS) return wait;
        const rb = snap.requestButton;
        if (rb.found && !rb.disabled && (job.opens || 0) < 3 && (job.clicked == null || snap.now - job.clicked > 5000)) return { type: "click", target: "requestButton", count: "opens" };
        if (late(STEP_TIMEOUT_MS)) {
          if (snap.blocked) return fail(`FamilySearch says: "${snap.blocked}"`);
          return fail(!rb.found ? "FamilySearch offers no Request button" : rb.disabled ? "FamilySearch's Request button is disabled" : "FamilySearch's Request dialog did not open");
        }
        return wait;
      }
      case "request-set": {
        if (!snap.reserveForm) return late(3000) ? fail("FamilySearch's Request dialog closed before Request was pressed") : wait;
        if (settling) return wait;
        const boxes = boxesIn(snap.reserveBoxes);
        const released = cur.released || [];
        // The same box by its name; else the one box of that ordinance, should the name differ.
        const boxFor = (r) => {
          const exact = boxes.find((b) => b.id === r.id);
          if (exact) return exact;
          // (also when the name differs: here the ordinances of an Unreserve pair box stand apart)
          const same = boxes.filter((b) => boxLetters(b).includes(r.letter));
          return same.length === 1 ? same[0] : null;
        };
        const want = released.map(boxFor);
        if (!released.length || want.some((b) => !b)) {
          // FamilySearch says in the dialog why: stop at once, with its sentence, and leave the
          // dialog open — its "View Duplicates" link is the way forward.
          const hit = warnFor(snap.reserveWarns, released.map((r) => r.letter));
          if (hit) return fail(`FamilySearch's Request dialog (left open) says: "${hit}" Resolve that first (View Duplicates)`);
          if (waited < BOX_WAIT_MS) return wait;
          // The dialog may have been drawn from what the page knew before the unreserve: close it
          // and open it again, twice at most.
          if ((job.retries || 0) < 2) return { type: "click", target: "reserveCancel", then: "request-open", count: "retries" };
          return fail(`FamilySearch's Request dialog does not offer ${lettersOf(released.filter((r, i) => !want[i])) || "the ordinances"}`);
        }
        if (want.some((b) => b.disabled)) return fail(`FamilySearch's Request dialog lists ${lettersOf(released)} but does not let it be ticked`);
        const ids = new Set(want.map((b) => b.id));
        const stuck = boxes.find((b) => b.disabled && b.on && !ids.has(b.id));
        if (stuck) return fail(`FamilySearch's Request dialog would also request ${boxLetters(stuck).join(", ")}, which cannot be unticked`);
        const wrong = boxes.find((b) => !b.disabled && b.on !== ids.has(b.id));
        if (wrong) return (job.toggles || 0) >= MAX_TOGGLES ? fail(`a tick box in FamilySearch's Request dialog did not change (${wrong.id})`) : { type: "click", target: "box", form: "reserve", id: wrong.id, toggle: true };
        if (snap.reserveSubmit && snap.reserveSubmit.found && !snap.reserveSubmit.disabled) return { type: "click", target: "reserveSubmit", then: "request-wait", term: snap.reserveTerm || "" };
        if (late(STEP_TIMEOUT_MS)) return fail(snap.blocked ? `FamilySearch says: "${snap.blocked}"` : "the Request button in FamilySearch's dialog stayed disabled");
        return wait;
      }
      case "request-wait":
      case "request-check":
        if (snap.maxed) return fail(`FamilySearch says: "${snap.maxed}"`, "unreserved");
        if (job.phase === "request-wait") {
          if (!snap.reserveForm) return { type: "goto", phase: "request-check" };
          return late(STEP_TIMEOUT_MS) ? fail("FamilySearch's Request dialog did not close after Request was pressed") : wait;
        }
        if (snap.saysRequested) return { type: "goto", phase: "next", result: { request: "done, FamilySearch confirmed", ok: true } };
        if (waited > 4000) return { type: "goto", phase: "next", result: { request: "done", ok: true } };
        return wait;
      default:
        return fail(`unknown step "${job.phase}"`);
    }
  }
  function nextAction(job, snap) {
    const cur = job.queue[job.i];
    const waited = snap.now - job.phaseAt;
    const navigating = job.navAt != null && snap.now - job.navAt < STEP_TIMEOUT_MS;
    if (!job.rehearsal && cur && job.phase !== "open" && job.phase !== "next" && job.phase !== "return") return nextReal(job, snap);
    switch (job.phase) {
      case "open":
        if (!cur) return { type: "goto", phase: "return" };
        if (snap.ordPid !== cur.pid) {
          if (navigating) return { type: "wait" };
          if (job.navs >= 2) return { type: "fail", reason: `the Ordinances tab of ${cur.name} did not open` };
          return { type: "navigate", url: ordUrl(cur.pid) };
        }
        // The real run first looks at the Request dialog (request-peek); a rehearsal goes on as before.
        if (snap.pageReady || waited > 2 * STEP_TIMEOUT_MS) return { type: "goto", phase: job.rehearsal ? "unreserve-open" : "request-peek", report: "page" };
        return { type: "wait" };
      case "unreserve-open":
        if (snap.unreserveForm) return { type: "goto", phase: "unreserve-look" };
        if (snap.unreserveOpener && !job.clicked) return { type: "click", target: "unreserveOpener" };
        if (waited > STEP_TIMEOUT_MS) {
          return { type: "goto", phase: "request-open", result: { unreserve: snap.unreserveOpener ? "the dialog did not open" : "no Unreserve control found" } };
        }
        return { type: "wait" };
      case "unreserve-look":
        if (!snap.unreserveForm) return { type: "goto", phase: "request-open", result: { unreserve: "dialog found" } };
        if (job.demo && !job.clicked && waited < DEMO_PAUSE_MS) return { type: "wait" }; // let it be seen
        if (!job.clicked) return { type: "click", target: "unreserveCancel" };
        if (waited > STEP_TIMEOUT_MS) return { type: "fail", reason: "FamilySearch's Unreserve dialog did not close after Cancel — close it yourself; nothing was unreserved" };
        return { type: "wait" };
      case "request-open":
        if (snap.reserveForm) return { type: "goto", phase: "request-look" };
        if (snap.requestButton.found && !snap.requestButton.disabled && !job.clicked) return { type: "click", target: "requestButton" };
        if (waited > (snap.requestButton.found && !snap.requestButton.disabled ? STEP_TIMEOUT_MS : 3000)) {
          const why = !snap.requestButton.found
            ? "no Request button (expected while everything is still reserved)"
            : snap.requestButton.disabled
              ? "the Request button is disabled (expected while everything is still reserved)"
              : "the dialog did not open";
          return { type: "goto", phase: "next", result: { request: why } };
        }
        return { type: "wait" };
      case "request-look":
        if (!snap.reserveForm) return { type: "goto", phase: "next", result: { request: "dialog found" } };
        if (job.demo && !job.clicked && waited < DEMO_PAUSE_MS) return { type: "wait" };
        if (!job.clicked) return { type: "click", target: "reserveCancel" };
        if (waited > STEP_TIMEOUT_MS) return { type: "fail", reason: "FamilySearch's Request dialog did not close after Cancel — close it yourself; nothing was requested" };
        return { type: "wait" };
      case "next":
        return { type: "goto", phase: "return", advance: true }; // one relative per run (v1.0.22)
      case "return":
        if (snap.onList && !job.rehearsal) {
          // The real run ends when the list shows a new expiry date for everyone it extended —
          // or after 20 seconds, saying that the date has not appeared.
          const exp = snap.expiry || {};
          const now = snap.reservedNow || {};
          // …and (v1.0.19) shows every ordinance that was reserved before as reserved again.
          const short = (q) => (now[q.pid] ? q.ords.filter((l) => !now[q.pid].includes(l)) : q.ords);
          const pending = job.queue.filter((q, i) => (job.results[i] || {}).ok && (!(exp[q.pid] && exp[q.pid] !== q.expires) || short(q).length));
          if (!pending.length || waited > 20000) return { type: "finish", expiry: exp, reserved: now };
          return { type: "wait" };
        }
        if (snap.onList) return { type: "finish" };
        if (navigating) return { type: "wait" };
        if (job.navs >= 2) return { type: "finish" };
        return { type: "navigate", url: LIST_URL };
      default:
        return { type: "fail", reason: `unknown step "${job.phase}"` };
    }
  }
  // Apply a "goto" to the job (pure — the driver saves it).
  function advance(job, act, now) {
    if (act.result) job.results[job.i] = Object.assign({}, job.results[job.i] || {}, act.result);
    if (act.advance) {
      job.i++;
      job.retries = 0;
    }
    job.phase = act.phase;
    job.phaseAt = now;
    job.clicked = null;
    job.navAt = null;
    job.navs = 0;
    job.toggles = 0;
    job.opens = 0;
    return job;
  }

  // ---- the driver: FamilySearch's controls ----------------------------------------------
  // The control on the Ordinances tab that opens FamilySearch's Unreserve dialog: a marker that
  // says "unreserve" outside the dialog itself, else a button reading "Unreserve".
  function findUnreserveOpener() {
    const inForm = (n) => {
      for (let p = n; p; p = p.parentElement) if (p.getAttribute && p.getAttribute("data-testid") === T.unreserveForm) return true;
      return false;
    };
    const clickable = (n) => /^(BUTTON|A)$/.test(n.tagName || "") || (n.getAttribute && n.getAttribute("role") === "button");
    const marked = all('[data-testid*="unreserve" i]').filter((n) => !ours(n) && !inForm(n) && shown(n) && !isDisabled(n));
    // Kevin's findings, 2026-11-26: on the Ordinances tab it is <button data-testid="unreserve-button">.
    if (marked.length) return marked.find((n) => n.getAttribute("data-testid") === T.listUnreserve) || marked.find(clickable) || marked[0];
    const byText = all('button, a, [role="button"]').filter((n) => !ours(n) && !inForm(n) && shown(n) && !isDisabled(n) && /^unreserve( all)?$/i.test(textOf(n)));
    return byText[0] || null;
  }
  const cancelIn = (formId, cancelId) => {
    const form = byTestId(formId);
    return byTestId(cancelId) || (form ? all("button", form).find((b) => /^cancel$/i.test(textOf(b))) || null : null);
  };
  // A dialog's tick boxes: the name each goes by, whether it is ticked, and — for an ordinance's
  // box — whose and which ordinance.
  const BOX_SEL = 'input[type="checkbox"], [role="checkbox"]';
  const boxIdOf = (b) => b.getAttribute("data-testid") || b.getAttribute("name") || b.getAttribute("id") || "";
  const boxOn = (b) => b.checked === true || b.getAttribute("aria-checked") === "true";
  function boxesOf(form) {
    const out = [];
    const seen = new Set();
    for (const b of form ? all(BOX_SEL, form) : []) {
      const id = boxIdOf(b);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const p = parseBoxId(id);
      out.push({ id, on: boxOn(b), disabled: isDisabled(b), pid: p ? p.pid : null, type: p ? p.types[0] : null, letters: p ? p.types.map((t) => LETTER_OF[t]) : [] });
    }
    return out;
  }
  function resolve(act) {
    const target = typeof act === "string" ? act : act.target;
    if (target === "unreserveOpener") return findUnreserveOpener();
    if (target === "unreserveCancel") return cancelIn(T.unreserveForm, T.unreserveCancel);
    if (target === "requestButton") return byTestId(T.request);
    if (target === "reserveCancel") return cancelIn(T.reserveForm, T.reserveCancel);
    // The two buttons that change something: by FamilySearch's own marker only, never by a guess.
    if (target === "unreserveSubmit" || target === "reserveSubmit") {
      const form = byTestId(target === "reserveSubmit" ? T.reserveForm : T.unreserveForm);
      return form ? byTestId(target === "reserveSubmit" ? T.reserveSubmit : T.unreserveSubmit, form) : null;
    }
    if (target === "box") {
      const form = byTestId(act.form === "reserve" ? T.reserveForm : T.unreserveForm);
      const b = form ? all(BOX_SEL, form).find((x) => boxIdOf(x) === act.id) || null : null;
      if (!b) return null;
      // A box that did not answer to two presses is pressed through its label.
      const tries = (state.boxTries[act.id] = (state.boxTries[act.id] || 0) + 1);
      if (tries >= 3) for (let p = b.parentElement; p && p !== form; p = p.parentElement) if (p.tagName === "LABEL") return p;
      return b;
    }
    return null;
  }
  function snapshot(now, job) {
    const req = byTestId(T.request);
    const opener = findUnreserveOpener();
    const uForm = byTestId(T.unreserveForm);
    const rForm = byTestId(T.reserveForm);
    const uSubmit = uForm ? byTestId(T.unreserveSubmit, uForm) : null;
    const rSubmit = rForm ? byTestId(T.reserveSubmit, rForm) : null;
    const snap = {
      now: now || Date.now(),
      ordPid: ordinancesPid(),
      onList: isReservationsPage(),
      // Ready = one of FamilySearch's two buttons is there (the page first draws placeholders
      // whose markers also say "ordinance").
      pageReady: !!req || !!opener,
      unreserveOpener: !!opener,
      requestButton: { found: !!req, disabled: isDisabled(req) },
      unreserveForm: !!uForm,
      reserveForm: !!rForm,
    };
    if (!job || job.rehearsal) return snap;
    // The real run also reads the dialogs' tick boxes and what FamilySearch says on the page.
    const said = textOf(document.body);
    const says = (re) => {
      const m = re.exec(said);
      return m ? m[0] : "";
    };
    snap.hidden = typeof document !== "undefined" && document.hidden === true;
    snap.unreserveBoxes = boxesOf(uForm);
    // The ordinance letters the Unreserve dialog shows (B, C, I, E, SP, SS as texts of their own).
    snap.unreserveLetters = uForm ? leaves(uForm).map((l) => l.text).filter((t, i, a) => LETTERS[t] && a.indexOf(t) === i) : [];
    snap.unreserveSubmit = { found: !!uSubmit, disabled: isDisabled(uSubmit) };
    snap.reserveBoxes = boxesOf(rForm);
    snap.reserveSubmit = { found: !!rSubmit, disabled: isDisabled(rSubmit) };
    const rTexts = rForm ? leaves(rForm).map((l) => l.text) : [];
    snap.reserveTerm = (rTexts.find((t) => TERM_RE.test(t)) || "").slice(0, 160);
    snap.reserveWarns = rTexts.filter((t) => WARN_RE.test(t)).map((t) => t.slice(0, 200)).filter((t, i, a) => a.indexOf(t) === i).slice(0, 6);
    // v1.0.19 — the ordinances under which the dialog shows its "Possible Duplicates · View
    // Duplicates" mark beside a person: each mark belongs to the ordinance whose line came last
    // before it. (The page's DATA cannot be relied on for this: for Samuel Roberts it said nobody
    // had possible duplicates while this dialog refused both sealings over them.)
    snap.reserveDupLetters = [];
    let section = "";
    for (const t of rTexts) {
      const hit = ORD_NAMES.find(([name]) => t.toLowerCase().startsWith(name.toLowerCase()));
      if (hit) section = hit[1];
      else if (/^(possible duplicates|view duplicates)$/i.test(t) && section && !snap.reserveDupLetters.includes(section)) snap.reserveDupLetters.push(section);
    }
    snap.form110 = !!byTestId(T.form110);
    // What this page's own data says about the relative of the moment (the Ordinances tab loads it
    // afresh): seen at all, and whether it says the request would be refused.
    const cur = job.queue[job.i];
    const row = cur ? state.rows.get(cur.pid) : null;
    snap.dataSeen = !!row;
    snap.dataBlock = row ? blockText(fromData(row), cur.ords) : "";
    snap.saysUnreserved = !!says(SAYS_UNRESERVED_RE);
    snap.saysRequested = !!says(SAYS_REQUESTED_RE);
    snap.blocked = says(SAYS_BLOCKED_RE);
    snap.maxed = says(SAYS_MAXED_RE);
    if (snap.onList) {
      snap.expiry = {};
      snap.reservedNow = {}; // per relative: the ordinances the list shows as reserved now
      const m = model(null, true); // the true dates — never the demo's pretended one
      for (const q of job.queue) {
        const c = m.byPid.get(q.pid);
        if (c && c.expires) snap.expiry[q.pid] = fmtDate(c.expires);
        if (c) snap.reservedNow[q.pid] = c.ords.map((o) => o.letter);
      }
    }
    // How often this step has been looked at (see "late" in nextReal).
    const key = `${job.i}/${job.phase}/${job.phaseAt}`;
    if (key !== state.phaseKey) {
      state.phaseKey = key;
      state.phaseSteps = 0;
      state.boxTries = {};
    }
    snap.steps = ++state.phaseSteps;
    return snap;
  }
  // What a dialog of FamilySearch's holds — for the console.
  function describeForm(form) {
    const texts = leaves(form)
      .map((l) => l.text)
      .filter((t, i, a) => a.indexOf(t) === i)
      .slice(0, 40);
    // What a tick box is for: its own label, else the nearest short text around it.
    const labelOf = (b) => {
      const own = b.getAttribute("aria-label");
      if (own) return own;
      let n = b.parentElement;
      for (let up = 0; n && n !== form && up < 3; up++, n = n.parentElement) {
        const t = textOf(n);
        if (t && t.length <= 60) return t;
      }
      return "";
    };
    const boxes = all('input[type="checkbox"], [role="checkbox"]', form).map((b) => {
      const id = b.getAttribute("data-testid") || b.getAttribute("name") || b.getAttribute("id") || "?";
      const on = b.checked === true || b.getAttribute("aria-checked") === "true";
      const label = labelOf(b);
      return `${id}${label ? ` "${label}"` : ""}${on ? " ✓" : ""}${isDisabled(b) ? " (disabled)" : ""}`;
    });
    const buttons = all('button, [role="button"]', form).map((b) => `"${textOf(b).slice(0, 30)}"${b.getAttribute("data-testid") ? " #" + b.getAttribute("data-testid") : ""}${isDisabled(b) ? " (disabled)" : ""}`);
    return `texts: ${texts.join(" | ")} ;; checkboxes (${boxes.length}): ${boxes.join(", ")} ;; buttons: ${buttons.join(", ")}`;
  }
  // Every dialog of FamilySearch's that this feature cares about is described once per appearance —
  // during a rehearsal, and when the user opens one by hand (the Request dialog can only be seen on
  // a relative with something to request).
  function observeForms() {
    if (!state.reported) return;
    for (const id of [T.unreserveForm, T.reserveForm, T.form110]) {
      const form = byTestId(id);
      if (!form || state.reported.has(form)) continue;
      state.reported.add(form);
      note(`FamilySearch's dialog "${id}" on ${pathNow().replace(/[A-Z0-9]{4}-[A-Z0-9]{2,4}/, "<id>")} — ${describeForm(form)}`);
    }
  }
  // The markers and buttons of the page — the Ordinances tab is login-walled, so this line is how
  // its markup is learned.
  // v1.0.23: only the buttons this feature is about are listed, by text and marker. The page's other
  // buttons include the account menu and a contributor chip per reservation — the signed-in user's
  // name and, on a shared ordinance, ANOTHER patron's — which have no place in findings that get
  // pasted or shown (Kevin's rehearsal of 2026-11-26 listed one).
  const FEATURE_BTN_RE = /unreserve|reserve|request|ordinance|in progress/i;
  function inventory() {
    const ids = Array.from(new Set(all("[data-testid]").filter((n) => !ours(n)).map((n) => n.getAttribute("data-testid")))).sort();
    const kept = [];
    let other = 0;
    for (const n of all('button, [role="button"]').filter((b) => !ours(b) && shown(b))) {
      const text = textOf(n).slice(0, 30);
      const id = n.getAttribute("data-testid") || "";
      if (!FEATURE_BTN_RE.test(text) && !FEATURE_BTN_RE.test(id)) {
        other++;
        continue;
      }
      const s = `"${text}"${id ? " #" + id : ""}${isDisabled(n) ? " (disabled)" : ""}`;
      if (!kept.includes(s)) kept.push(s);
    }
    return `markers (${ids.length}): ${ids.slice(0, 150).join(", ")} ;; buttons of this feature (${kept.length}): ${kept.join(" | ")} ;; ${other} other button(s) on the page, not listed (they can carry people's names)`;
  }

  // ---- banners ---------------------------------------------------------------------------
  function showBanner(text, opts) {
    const o = opts || {};
    const sig = [text, o.kind || "", o.button || ""].join("|");
    if (state.banner === sig && all(`[${ATTR}="banner"]`).length) return;
    for (const n of all(`[${ATTR}="banner"]`)) n.remove();
    state.banner = sig;
    const red = o.kind === "error";
    const d = el(
      "div",
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;font:15px/1.4 system-ui,Arial,sans-serif;padding:10px 44px 10px 16px;box-shadow:0 2px 6px rgba(0,0,0,.2);" +
        (red ? "background:#fde7e9;color:#5c0f0b;border-bottom:2px solid #b3261e;" : "background:#fff4ce;color:#222;border-bottom:2px solid #d4a72c;")
    );
    d.setAttribute(ATTR, "banner");
    d.appendChild(document.createTextNode("Search Enhancer: " + text + " "));
    if (o.button) {
      const b = el("button", "font:inherit;font-weight:600;padding:3px 10px;border:1px solid #8a6d1f;border-radius:4px;background:#fff;cursor:pointer;color:#222", o.button);
      b.type = "button";
      b.addEventListener("click", o.onClick);
      d.appendChild(b);
    }
    const x = el("button", "position:absolute;top:4px;right:10px;border:0;background:none;font-size:22px;cursor:pointer;color:#444", "×");
    x.type = "button";
    x.title = "Dismiss";
    x.addEventListener("click", () => d.remove());
    d.appendChild(x);
    (document.body || document.documentElement).appendChild(d);
  }
  const PHASE_TEXT = {
    open: "opening the Ordinances tab",
    "unreserve-open": "opening the Unreserve dialog",
    "unreserve-look": "reading the Unreserve dialog",
    "request-open": "opening the Request dialog",
    "request-look": "reading the Request dialog",
    next: "done",
    return: "back to My Reservations",
  };
  const REAL_PHASE_TEXT = {
    "request-peek": "checking the Request dialog first",
    "unreserve-open": "opening the Unreserve dialog",
    "unreserve-set": "ticking the ordinances to unreserve",
    "unreserve-wait": "Unreserve pressed",
    "request-open": "unreserved — opening the Request dialog",
    "request-set": "ticking the same ordinances to request",
    "request-wait": "Request pressed",
    "request-check": "waiting for FamilySearch's confirmation",
    return: "back to My Reservations for the new expiry date",
  };
  // What the demo says while one of FamilySearch's dialogs is up: where a real run would press.
  const DEMO_PHASE_TEXT = {
    "unreserve-look": "the Unreserve dialog — a real run presses Unreserve here; the demo cancels",
    "request-look": "the Request dialog — a real run requests the same ordinances here; the demo cancels",
  };
  function progressText(job) {
    const cur = job.queue[Math.min(job.i, job.queue.length - 1)];
    const what = (!job.rehearsal && REAL_PHASE_TEXT[job.phase]) || (job.demo && DEMO_PHASE_TEXT[job.phase]) || PHASE_TEXT[job.phase] || job.phase;
    const tail = job.rehearsal ? " Nothing is changed." : job.stopAsked ? " Stopping once this is reserved again." : " Keep this tab in front.";
    return `${job.demo ? "demo" : job.rehearsal ? "rehearsal" : "extending"} — ${cur ? cur.name : ""}: ${what}.${tail}`;
  }
  function summaryText(job) {
    if (job.demo) {
      const q = job.queue[0];
      return `demo finished, nothing was changed — ${q ? q.name : ""}: a real run ends here with the new expiry date.`;
    }
    if (!job.rehearsal) {
      const q = job.queue[0];
      const r = job.results[0] || {};
      if (!q) return "nothing was run.";
      if (!r.ok) return `${q.name}: not extended.`;
      const what = lettersOf(q.released) || q.ords.join(", ");
      // v1.0.24: the new date is the whole message. FamilySearch's "120 days" sentence is no longer
      // quoted here — it is about its dialog as a whole (v1.0.23) and stays in the findings.
      const date = r.now && r.now !== q.expires ? `${what}, new expiry date ${r.now} (was ${q.expires})` :`${what} requested again; reload this page to see the new expiry date`;
      const gone = r.missing && r.missing.length ? ` CHECK: ${r.missing.join(", ")} ${r.missing.length > 1 ? "are" : "is"} NOT shown as reserved now — open this relative's Ordinances tab and press Request if needed.` : "";
      return `extended — ${q.name}: ${date}.${gone}`;
    }
    const parts = job.queue.map((q, i) => {
      const r = job.results[i] || {};
      return `${q.name}: Unreserve — ${r.unreserve || "not reached"}; Request — ${r.request || "not reached"}`;
    });
    return `rehearsal finished, nothing changed — ${parts.join(". ")}.`;
  }
  // Where things stand when the real run stops — the one message that must be exact.
  function failText(job, act) {
    const cur = job.queue[job.i];
    if (job.rehearsal || !cur) return act.reason;
    const who = cur.name;
    const list = cur.released && cur.released.length ? cur.released : cur.ords.map((letter) => ({ letter }));
    const what = lettersOf(list);
    const be = list.length > 1 ? "are" : "is";
    if (act.stage === "unreserved") return `${who}: ${what} ${be} NOT RESERVED. ${act.reason}. Press Request on this page to reserve again`;
    if (act.stage === "unsure-unreserve") return `${who}: ${act.reason}. Check here whether ${what} ${be} still reserved; if not, press Request`;
    if (act.stage === "unsure-request") return `${who}: ${act.reason}. Check here whether ${what} ${be} reserved again; if not, press Request`;
    return `${who}: ${act.reason}. Nothing was changed`;
  }
  function stopJob(why) {
    const job = loadJob();
    if (job) {
      job.failed = why;
      state.lastJob = job;
    }
    clearJob();
    stopPump();
    log("stopped:", why);
    showBanner(`stopped — ${why}.`, job ? { kind: "error", button: "Copy the findings", onClick: copyFindings } : { kind: "error" });
  }
  // The banner's Stop. A rehearsal, and a real run that has not yet pressed Unreserve, stop at
  // once. After that press the relative is finished first — a stop there would leave the
  // ordinances unreserved.
  function askStop() {
    const job = loadJob();
    if (!job) return;
    if (!job.rehearsal && REAL_AFTER_SUBMIT_RE.test(job.phase)) {
      job.stopAsked = true;
      saveJob(job);
      showBanner(progressText(job), {});
      return;
    }
    stopJob(job.rehearsal ? "Stop pressed; nothing was changed" : "Stop pressed before anything was unreserved; nothing was changed (close any FamilySearch dialog still open)");
  }

  // ---- the pump --------------------------------------------------------------------------
  function stopPump() {
    if (state.pump != null) {
      clearInterval(state.pump);
      state.pump = null;
    }
  }
  function step(nowMs) {
    const now = nowMs || Date.now();
    const job = loadJob(now);
    if (!job) return stopPump(), null;
    const snap = snapshot(now, job);
    const act = nextAction(job, snap);
    const stopBtn = { button: "Stop", onClick: askStop };
    // v1.0.20 — the Ordinances tab's data often arrives after the first note about it was taken
    // (Kevin's run on GNDD-SNP: "no row for this relative", though the look then waited for it).
    // The moment the look before the unreserve stops waiting, say what the data held by then.
    const lookAt = job.queue[job.i];
    if (!job.rehearsal && job.phase === "request-peek" && lookAt && lookAt.dataNoted === false && act.type !== "wait" && act.type !== "hold") {
      lookAt.dataNoted = true;
      note(
        state.rows.get(lookAt.pid)
          ? "Ordinances tab data, arrived before the look at the Request dialog — " + dataNote(lookAt.pid)
          : `Ordinances tab data: none for ${lookAt.pid} by the time the look at the Request dialog began (waited 4 s) — that check was skipped; the dialog itself is still read`
      );
    }
    if (act.type === "wait") {
      if (state.notes.length) saveJob(job, now); // a finding made meanwhile goes into the job
      showBanner(progressText(job), stopBtn);
      return act;
    }
    if (act.type === "hold") {
      // FamilySearch's permission form is up: wait for the user, with the step's clock stopped.
      observeForms();
      if (!job.held) note(`step "${job.phase}": FamilySearch shows its 110-year permission form — waiting for the user to answer it`);
      job.held = true;
      if (act.after) job.heldAfter = true;
      job.phaseAt = now;
      saveJob(job, now);
      const cur = job.queue[job.i];
      const what = cur ? lettersOf(cur.released) || cur.ords.join(", ") : "";
      showBanner(
        `waiting for you — answer FamilySearch's 110-year permission form for ${cur ? cur.name : "this relative"}; the run then carries on.` +
          (act.after ? ` Until then ${what} is not reserved.` : " Nothing is unreserved yet."),
        stopBtn
      );
      return act;
    }
    if (act.type === "goto") {
      if (act.report === "page") {
        note(`Ordinances tab of ${job.queue[job.i].pid} — ${inventory()}`);
        note("Ordinances tab data, before anything is pressed — " + dataNote(job.queue[job.i].pid));
        job.queue[job.i].dataNoted = !!state.rows.get(job.queue[job.i].pid);
      }
      if (act.result) note(`${job.queue[job.i].pid}: ${Object.keys(act.result).map((k) => `${k} — ${act.result[k]}`).join("; ")}`);
      advance(job, act, now);
      saveJob(job, now);
      showBanner(progressText(job), stopBtn);
      return act;
    }
    if (act.type === "click") {
      const target = resolve(act);
      observeForms(); // describe a dialog before anything in it is pressed
      const was = job.phase;
      const name = act.target === "box" ? `tick box ${act.id}` : act.target;
      if (!target) {
        // A rehearsal notes it and moves on by its timeout; the real run looks again at the next
        // step (its own timeout stops it) and never counts a press that did not happen.
        if (job.rehearsal) job.clicked = now;
        const miss = `${was}/${name}`;
        if (job.rehearsal || state.missed !== miss) note(`step "${was}": ${name} was not found at the moment of the click`);
        state.missed = miss;
        saveJob(job, now);
        return act;
      }
      state.missed = "";
      if (act.count) job[act.count] = (job[act.count] || 0) + 1;
      if (act.toggle) job.toggles = (job.toggles || 0) + 1;
      const cur = job.queue[job.i];
      if (act.released && cur) cur.released = act.released;
      if (act.term && cur) cur.term = act.term;
      // A press that changes something moves the job to its next step BEFORE the press, so that
      // whatever happens afterwards — a page load, a closed tab — the job knows the press was made.
      if (act.result) note(`${cur ? cur.pid : ""}: ${Object.keys(act.result).map((k) => `${k} — ${act.result[k]}`).join("; ")}`);
      if (act.then) advance(job, { phase: act.then, result: act.result }, now);
      job.clicked = now;
      note(`step "${was}": pressing ${name} <${String(target.tagName || "").toLowerCase()}>${target.getAttribute && target.getAttribute("data-testid") ? " #" + target.getAttribute("data-testid") : ""} "${textOf(target).slice(0, 30)}"${act.released ? ` — for ${lettersOf(act.released)}` : ""}${act.term ? ` — the dialog says: "${act.term}"` : ""}`);
      saveJob(job, now); // before the click — a click may take the page elsewhere
      try {
        target.click();
      } catch (err) {
        note("the click failed: " + String(err));
      }
      if (act.then) showBanner(progressText(job), stopBtn);
      return act;
    }
    if (act.type === "navigate") {
      job.navAt = now;
      job.navs = (job.navs || 0) + 1;
      saveJob(job, now);
      log("opening", act.url);
      try {
        location.assign(act.url);
      } catch (_) {
        /* ignore */
      }
      return act;
    }
    if (act.type === "fail") {
      const text = failText(job, act);
      note(`STOPPED at step "${job.phase}" (${act.stage || "rehearsal"}): ${text}`);
      if (job.queue[job.i]) note("the page's data at the stop — " + dataNote(job.queue[job.i].pid));
      observeForms();
      saveJob(job, now);
      stopJob(text);
      return act;
    }
    if (act.type === "finish") {
      if (act.expiry) job.queue.forEach((q, i) => job.results[i] && (job.results[i].now = act.expiry[q.pid] || null));
      // What was reserved before and is not shown as reserved on the list now (null = the list did
      // not show the relative, so nothing can be said).
      if (act.reserved) job.queue.forEach((q, i) => job.results[i] && (job.results[i].missing = act.reserved[q.pid] ? q.ords.filter((l) => !act.reserved[q.pid].includes(l)) : null));
      const lost = !job.rehearsal && job.queue.some((q, i) => (job.results[i] || {}).ok && ((job.results[i].missing || []).length > 0));
      const text = summaryText(job);
      note(text);
      saveJob(job, now);
      state.lastJob = job;
      clearJob();
      stopPump();
      showBanner(text, { button: "Copy the findings", onClick: copyFindings, kind: lost ? "error" : "" });
      return act;
    }
    return act;
  }
  function pump() {
    if (!loadJob()) return stopPump();
    if (state.pump == null && typeof setInterval === "function") {
      state.pump = setInterval(() => {
        try {
          if (!enabled()) return stopPump();
          step();
        } catch (err) {
          console.warn("[FSSE] extend step failed", err);
        }
      }, PUMP_MS);
      if (state.pump && typeof state.pump.unref === "function") state.pump.unref();
    }
    step();
  }

  // ---- the tick (content.js, every page tick) --------------------------------------------
  function tick() {
    const s = settingsOf();
    if (s && s.loaded === false) return;
    if (!enabled()) {
      if (state.wasOn) {
        state.wasOn = false;
        stopPump();
        clearJob();
        removeAll();
        log("switched off — everything of the feature removed from the page");
      }
      return;
    }
    state.wasOn = true;
    ping();
    observeForms();
    if (isReservationsPage()) syncList();
    else for (const n of all(`[${ATTR}="row"]`)) n.remove();
    // On any relative's Ordinances tab: what the page's own data says about the open ordinances,
    // once per change — the console line to paste when a request was refused.
    const here = ordinancesPid();
    if (here && state.rows.has(here)) {
      const line = "this relative's ordinances in the page's own data — " + dataNote(here);
      if (line !== state.ordLine) {
        state.ordLine = line;
        log(line);
      }
    }
    pump();
  }

  if (typeof window !== "undefined" && window.addEventListener && typeof module === "undefined") {
    window.addEventListener("message", (e) => {
      // Same window AND same origin: the rows come from our page-world script, nowhere else.
      if (e.source !== window || e.origin !== location.origin) return;
      if (!e.data || e.data.source !== FROM_PAGE || e.data.type !== "FSSE_RESERVATIONS") return;
      receive(e.data.rows, e.data.mine, e.data.shape, e.data.seen);
      try {
        if (enabled() && isReservationsPage()) syncList();
      } catch (err) {
        console.warn("[FSSE] extend sync failed", err);
      }
    });
  }

  FSSE.extend = {
    ATTR, JOB_KEY, STEP_TIMEOUT_MS, NEW_TERM_DAYS, T, isReal, nextReal, boxesOf, failText, askStop, dataNote, census, warnFor, blockersOf, blockText, noteTexts,
    parseDate, daysBetween, fmtDate, daysText, parseRowTexts, fromPage, fromData, merge, flagsOf, decorate, flagTexts,
    isReservationsPage, ordinancesPid, ordUrl, receive, findRows, model, syncList, openDialog, closeDialog, removeAll,
    newJob, loadJob, saveJob, clearJob, startJob, nextAction, advance, snapshot, step, findUnreserveOpener, describeForm, inventory,
    progressText, summaryText, findingsText, copyFindings, readRow, tick, enabled, windowDays, demoOn, demoOf, DEMO_DAYS, DEMO_PAUSE_MS, _state: state, _unnamed: unnamed, _note: note,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FSSE.extend;
})();
