// dqs-listen.js — page-world listener for FamilySearch's Quality Score payload (v0.2.90) and,
// since v1.0.2, for the user's FamilySearch Labs preference.
//
// The person page shows the Data Quality Score only as a word (Low / Medium / High). The
// NUMBER behind it — personScores.overallDisplayScore, 0–1 — travels in the JSON the page
// itself fetches to draw the badge:
//   GET /service/tree/tree-data/quality/person/<PID>/scores?treeId=PRIVATE
// (Kevin verified 2026-09-21, with every other extension unloaded, that the page makes this
// request on its own at load.) This script runs in the PAGE's world (manifest: world "MAIN",
// document_start — an isolated content script cannot see the page's responses), wraps fetch
// and XMLHttpRequest, and when the page's own request for that URL completes, reads a CLONE
// of the response and hands the scores to the isolated content script (src/dqs.js) via
// window.postMessage. It makes NO request of its own — the sharing posture: the extension
// causes no requests beyond the searches the user clicks — and never touches the page's
// request or response (the clone is read on the side; every hook is try/catch-guarded so a
// failure here can never break FamilySearch's own call).
//
// The bulky parts of the payload (conclusionScores, sourceClusters — per-fact and per-source
// breakdowns the tooltip does not use) are dropped before posting. The last payloads are kept
// per PID so the isolated script, which loads later (document_idle), can ask for what it
// missed: it posts {source:"fsse-dqs", type:"FSSE_DQS_REQUEST", pid} and gets the cached
// payload(s) back as ordinary FSSE_DQS messages.
//
// v1.0.2 — the same wrapper also watches the page's OWN reads and writes of the user
// preference "fslabs.labs" (the list of FamilySearch Labs experiments the user has turned on —
// see src/labs.js), made by FamilySearch's pages at load through
//   GET /service/cmn/user-preferences/users/<cisId>/preferences?name=fslabs.labs&name=…
//   GET|PUT /service/cmn/user-preferences/users/<cisId>/preferences/fslabs.labs
// The array of experiment ids (from the response, or — for a PUT whose response carries no
// body — from the request body) is posted as {type:"FSSE_LABS", labs:[…]}; the last one is kept
// for the FSSE_LABS_REQUEST ping. Still no request of ours.
//
// v1.0.8 — and the page's OWN reads of the temple reservation list (Temple › My Reservations),
// for src/extend.js (the "extend reservation" aid; nothing is posted while its switch is off):
//   GET /service/tree/tree-data/reservations/list/<user>?sharedWithTemple=false   (the ids)
//   GET /service/tree/tree-data/reservations/person/<pid,pid,…>?…                 (.rows, 30 ids a call)
// (paths and field names read off FamilySearch's public temple bundle, 2026-11-26 — the shape is
// unverified until a live page is seen, so the reading below is tolerant and a compact SHAPE
// description of the first row rides along for the console.) The rows are slimmed and kept in
// page memory only; NOTHING is posted until the isolated script asks (FSSE_RESERVATIONS_REQUEST —
// it asks only while the user's switch is on). Still no request of ours.
//
// No FSSE namespace here (page world). Exported for tests via module.exports when run in
// node: install(win) wires a fake window.
(() => {
  const SCORES_RE = /\/service\/tree\/tree-data\/quality\/person\/([A-Z0-9]{4}-[A-Z0-9]{2,4})\/scores(?:[/?#]|$)/i;
  const PREFS_RE = /\/service\/cmn\/user-preferences\/users\/[^/?#]+\/preferences(?:\/([^/?#]+))?(?:\?([^#]*))?/i;
  const LABS_PREF = "fslabs.labs";
  const FROM_PAGE = "fsse-dqs-page"; // messages we post
  const FROM_EXT = "fsse-dqs"; // messages the isolated script posts
  const MAX_CACHE = 30;
  // "reservations/person/…" — never "reservations/popup/person/…" (the Request dialog's own read).
  const RES_ROWS_RE = /\/service\/tree\/tree-data\/reservations\/person\/[^/?#]+(?:[?#]|$)/i;
  // "reservations/list/<user>" with an optional query — never ".../list/<user>/counts".
  const RES_LIST_RE = /\/service\/tree\/tree-data\/reservations\/list\/[^/?#]+(?:\?([^#]*))?(?:#|$)/i;
  // v1.0.9 — Kevin's first live run heard the list (58 ids) but not one row, so the row request is
  // not what the bundle suggested. Every reservations request of the page is now noted (its
  // method, its address with ids masked, the shape of what came back) for the findings, and the
  // rows are looked for wherever the response keeps them. The Request dialog's own reads stay out.
  const RES_ANY_RE = /\/service\/tree\/tree-data\/reservations\//i;
  const RES_POPUP_RE = /\/reservations\/popup\//i;
  const MAX_TRACE = 15;
  // The six ordinances as a row may name them → the name the aid uses. (The Ordinances tab's own
  // response says "sealingsTo…" — seen in Kevin's findings of 2026-11-26, cut off after
  // "sealingsToP"; both spellings are read.)
  const ORD_ALIAS = {
    baptism: "baptism", confirmation: "confirmation", initiatory: "initiatory", endowment: "endowment",
    sealingToParents: "sealingToParents", sealingsToParents: "sealingToParents",
    sealingToSpouse: "sealingToSpouse", sealingsToSpouse: "sealingToSpouse", sealingToSpouses: "sealingToSpouse", sealingsToSpouses: "sealingToSpouse",
  };
  const ORD_KEYS = Object.keys(ORD_ALIAS);
  // v1.0.11 — why FamilySearch would not let an ordinance be requested: its reasons as short
  // texts, and the flags (true, or named like a problem) found in the people it involves. Kevin's
  // first real run unreserved a Sealing to Parents that FamilySearch then refused to hand back
  // ("Please resolve the possible duplicates…" — the mother's); whether the page's data says so
  // BEFORE the unreserve is what these fields are kept to find out.
  const short = (v, n) => String(v).replace(/\s+/g, " ").trim().slice(0, n);
  function reasonsOf(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 6).map((x) => {
      if (x == null) return "null";
      if (typeof x !== "object") return short(x, 80);
      const parts = Object.keys(x).filter((k) => prim(x[k]) && x[k] != null && x[k] !== "").map((k) => k + "=" + short(x[k], 60));
      return short(parts.join(","), 160);
    });
  }
  const PROBLEM_KEY_RE = /dup|permission|problem|qualif|valid|merge|restrict|living/i;
  function relFlags(v) {
    const out = [];
    const walk = (x, path, depth) => {
      if (!x || typeof x !== "object" || depth > 4 || out.length >= 10) return;
      const keys = Array.isArray(x) ? x.map((_, i) => i).slice(0, 4) : Object.keys(x);
      for (const k of keys) {
        const y = x[k];
        const p = path ? path + "." + k : String(k);
        if (/visible/i.test(String(k))) continue; // "parent1VisibleToAll" says nothing about a request
        if (y && typeof y === "object") walk(y, p, depth + 1);
        else if ((y === true || (PROBLEM_KEY_RE.test(String(k)) && y != null && y !== "" && y !== false)) && typeof y !== "string") out.push(p + "=" + y);
        else if (PROBLEM_KEY_RE.test(String(k)) && typeof y === "string" && y) out.push(p + "=" + short(y, 30));
        if (out.length >= 10) return;
      }
    };
    walk(v, "", 0);
    return out.join(", ");
  }
  const MAX_RES = 400; // FamilySearch caps a reservation list at 300
  const DATE_KEY_RE = /date|expir/i;
  const prim = (v) => v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";

  // One ordinance of a row → what the aid needs: its state flags and every date-like primitive
  // (the exact date field names are not verified, so they are carried by pattern).
  function slimOrd(type, o) {
    if (!o || typeof o !== "object") return null;
    const out = {
      type,
      status: typeof o.status === "string" ? o.status : "",
      canUnreserve: o.canUnreserve === true,
      canReserve: o.canReserve === true,
      printed: o.printed === true,
      assignedToTemple: o.assignedToTemple === true,
    };
    for (const k of Object.keys(o)) if (DATE_KEY_RE.test(k) && prim(o[k]) && o[k] != null) out[k] = o[k];
    // v1.0.13 — an ordinance whose first reservation went to the temple and which the user then
    // reserved (Kevin's console paste of 2026-11-26: primaryReservationAssignedToTemple true, the
    // ordinance's own dates those of 2023, and alternateReservationDetails {reservedDate
    // "26 November 2026", expiryDate "26 March 2027"} — 120 days). The user's reservation is the
    // alternate one: its dates are the ones that count.
    if (o.primaryReservationAssignedToTemple === true) out.templeHeld = true;
    const alt = o.alternateReservationDetails;
    if (alt && typeof alt === "object") {
      out.alternate = true;
      for (const k of Object.keys(alt)) if (DATE_KEY_RE.test(k) && prim(alt[k]) && alt[k] != null && alt[k] !== "") out[k] = alt[k];
    }
    if (typeof o.statusText === "string") out.statusText = short(o.statusText, 40);
    const reasons = reasonsOf(o.whyNotQualifyingReasons);
    if (reasons.length) out.reasons = reasons;
    // (never the name of whoever holds a reservation: "Endowment printed. Reserved by <a patron>.")
    if (typeof o.hoverText === "string" && o.hoverText) out.hover = short(o.hoverText.replace(/\b(Reserved|Shared|Requested|Printed) by [^.]*/gi, "$1 by <someone>"), 200);
    const rel = relFlags(o.relationships);
    if (rel) out.rel = rel;
    // v1.0.12 — Kevin's console paste of 2026-11-26 showed the fields: every ordinance carries
    // relationships.parent1HasPossibleDuplicates / parent2… / spouse… . Who has possible
    // duplicates, by FamilySearch's own data: a list ([] = it says nobody), absent = it does not say.
    const rs = o.relationships;
    if (rs && typeof rs === "object") {
      const keys = { parent1: rs.parent1HasPossibleDuplicates, parent2: rs.parent2HasPossibleDuplicates, spouse: rs.spouseHasPossibleDuplicates };
      if (Object.keys(keys).some((k) => typeof keys[k] === "boolean")) out.dups = Object.keys(keys).filter((k) => keys[k] === true);
    }
    return out;
  }
  // A reservation row → { id, name, lifespan, <row dates>, ords: [...] }. The six ordinances are
  // looked for on the row itself and under `ordinances`; a value may be one object or a list
  // (a person can have several sealings).
  function slimRow(r) {
    if (!r || typeof r !== "object") return null;
    const p = r.person && typeof r.person === "object" ? r.person : {};
    const str = (...c) => c.find((x) => typeof x === "string" && x) || "";
    const id = str(r.id, r.personId, r.pid, p.id, p.personId);
    if (!id) return null;
    const out = { id: id.toUpperCase(), name: str(r.name, r.fullName, p.name, p.fullName), lifespan: str(r.lifespan, p.lifespan), ords: [] };
    for (const k of Object.keys(r)) if (DATE_KEY_RE.test(k) && prim(r[k]) && r[k] != null) out[k] = r[k];
    // The row's own dates are empty for an alternate reservation (see slimOrd); its details hold them.
    const ralt = r.alternateReservationDetails;
    if (ralt && typeof ralt === "object") for (const k of Object.keys(ralt)) if (DATE_KEY_RE.test(k) && prim(ralt[k]) && ralt[k] != null && ralt[k] !== "") out[k] = ralt[k];
    // What FamilySearch says about the person as a whole (v1.0.11): null = it does not say.
    out.dup = typeof r.hasPossibleDuplicates === "boolean" ? r.hasPossibleDuplicates : null;
    out.permission = typeof r.requiresPermission === "boolean" ? r.requiresPermission : null;
    if (typeof r.rollupStatus === "string") out.rollup = short(r.rollupStatus, 40);
    const holders = [r, r.ordinances && typeof r.ordinances === "object" ? r.ordinances : null];
    for (const h of holders) {
      if (!h) continue;
      if (Array.isArray(h)) {
        for (const o of h) {
          const s = o && typeof o.type === "string" ? slimOrd(o.type, o) : null;
          if (s) out.ords.push(s);
        }
        continue;
      }
      for (const key of ORD_KEYS) {
        const v = h[key];
        for (const o of Array.isArray(v) ? v : [v]) {
          const s = slimOrd(ORD_ALIAS[key], o);
          if (s) out.ords.push(s);
        }
      }
    }
    return out;
  }
  // The reservation rows of a response: a list whose entries carry ordinances — under `rows`, as
  // the response itself, under any other key, one level further down, or as the values of a map.
  function rowsOf(json) {
    const isRow = (o) => !!o && typeof o === "object" && !Array.isArray(o) && (ORD_KEYS.some((k) => k in o) || (!!o.ordinances && typeof o.ordinances === "object"));
    const rowList = (a) => (Array.isArray(a) && a.some(isRow) ? a : null);
    if (!json || typeof json !== "object") return null;
    if (rowList(json)) return json;
    if (rowList(json.rows)) return json.rows;
    for (const k of Object.keys(json)) {
      const v = json[k];
      if (rowList(v)) return v;
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      for (const kk of Object.keys(v)) if (rowList(v[kk])) return v[kk];
      if (rowList(Object.values(v))) return Object.values(v);
    }
    return rowList(Object.values(json));
  }
  // A request address for the findings: the path and query with person ids and the user id masked.
  function maskUrl(url) {
    let s = String(url || "");
    const i = s.indexOf("/service/");
    if (i > 0) s = s.slice(i);
    // The user id first (it holds an id-shaped part); person ids are upper-case — "tree-data" is not one.
    return s
      .replace(/cis\.user\.[\w-]+/gi, "<user>")
      .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{2,4}\b(?:(?:,|%2C)[A-Z0-9]{4}-[A-Z0-9]{2,4}\b)*/g, (m) => `<${m.split(/,|%2C/i).length} id>`)
      .slice(0, 220);
  }
  // Every primaryPersonId in a list response, wherever it sits (the nesting is not verified).
  function listIds(json) {
    const ids = [];
    const seen = new Set();
    const walk = (v, depth) => {
      if (!v || typeof v !== "object" || depth > 8) return;
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
      for (const k of Object.keys(v)) {
        const x = v[k];
        if (k === "primaryPersonId" && typeof x === "string") {
          const id = x.toUpperCase();
          if (!seen.has(id)) (seen.add(id), ids.push(id));
        } else walk(x, depth + 1);
      }
    };
    walk(json, 0);
    return ids;
  }
  const sharedList = (query) => /(?:^|&)sharedWithTemple=true(?:&|$)/i.test(query || "");
  // A compact description of one raw row for the console: every key with its type, a sample only
  // for date / status / flag fields (never a name).
  function shapeOf(row, max, levels) {
    const SAFE = /date|expir|status|^can|printed|assigned|^type$|reason|dup|permission|problem|qualif|hover/i;
    const deep = levels || 2;
    const desc = (v, k, depth) => {
      if (v === null) return "null";
      if (Array.isArray(v)) return "[" + v.length + (v.length && depth < deep ? ": " + desc(v[0], k, depth + 1) : "") + "]";
      if (typeof v === "object") {
        if (depth >= deep) return "{…}";
        return "{" + Object.keys(v).slice(0, 30).map((kk) => kk + ":" + desc(v[kk], kk, depth + 1)).join(", ") + "}";
      }
      return SAFE.test(k) ? typeof v + "=" + String(v).slice(0, 40) : typeof v;
    };
    try {
      return desc(row, "", 0).slice(0, max || 3000);
    } catch (_) {
      return "";
    }
  }

  // Keep only what the tooltip needs (drops ~90% of the bytes).
  function slim(json) {
    if (!json || typeof json !== "object") return null;
    const ps = json.personScores;
    const out = { isValid: json.isValid, visibility: json.visibility, personScores: null };
    if (ps && typeof ps === "object") {
      out.personScores = {};
      for (const k of Object.keys(ps)) {
        if (k === "conclusionScores" || k === "sourceClusters") continue;
        out.personScores[k] = ps[k];
      }
    }
    return out;
  }

  const dec = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  };
  // A user-preferences URL that concerns the Labs preference: the single-preference path, or a
  // batch GET whose query asks for it by name.
  function isLabsUrl(url) {
    const m = PREFS_RE.exec(String(url || ""));
    if (!m) return false;
    if (m[1]) return dec(m[1]) === LABS_PREF;
    return (m[2] || "").split("&").some((kv) => {
      const i = kv.indexOf("=");
      return i > 0 && dec(kv.slice(0, i)) === "name" && dec(kv.slice(i + 1)) === LABS_PREF;
    });
  }
  // The experiment-id array in a preference response (batch: { "fslabs.labs": { value: [...] },
  // … }; single: { value: [...] }; FS's own code treats a non-array value as "none"), else in
  // the request body of a PUT. null = the body says nothing about the preference.
  function labsOf(text, reqBody) {
    const pick = (json) => {
      if (!json || typeof json !== "object") return null;
      if (Array.isArray(json)) return json;
      if (Object.prototype.hasOwnProperty.call(json, LABS_PREF)) {
        const v = json[LABS_PREF];
        return v && typeof v === "object" && Array.isArray(v.value) ? v.value : [];
      }
      if ("value" in json) return Array.isArray(json.value) ? json.value : [];
      return null;
    };
    let ids = null;
    try {
      ids = pick(JSON.parse(text));
    } catch (_) {
      ids = null;
    }
    if (!ids && reqBody) {
      try {
        ids = pick(JSON.parse(reqBody));
      } catch (_) {
        ids = null;
      }
    }
    return ids ? ids.filter((x) => typeof x === "string") : null;
  }

  function install(win) {
    if (!win || win.__fsseDqsListening) return null;
    win.__fsseDqsListening = true;
    const cache = new Map(); // pid → slim payload (insertion order = age)
    let labsCache = null; // the last experiment-id array seen
    const origin = () => (win.location && win.location.origin) || "*";

    function post(pid, payload) {
      try {
        win.postMessage({ source: FROM_PAGE, type: "FSSE_DQS", pid, payload }, origin());
      } catch (_) {
        /* never break the page */
      }
    }
    function publish(pid, payload) {
      if (cache.has(pid)) cache.delete(pid);
      cache.set(pid, payload);
      while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      post(pid, payload);
    }
    function postLabs(ids) {
      try {
        win.postMessage({ source: FROM_PAGE, type: "FSSE_LABS", labs: ids }, origin());
      } catch (_) {
        /* never break the page */
      }
    }
    // v1.0.8 — the reservation rows: page memory only, posted once the isolated script asked.
    const resCache = new Map(); // pid → slim row
    let resMine = null; // the ids of the user's own list (sharedWithTemple=false), null = not seen
    let resShape = "";
    let resSubscribed = false;
    const resTrace = new Map(); // "GET <masked address>" → { n, shape }
    function traceRequest(method, url) {
      const key = String(method || "GET").toUpperCase() + " " + maskUrl(url);
      let t = resTrace.get(key);
      if (!t) {
        if (resTrace.size >= MAX_TRACE) return null;
        t = { n: 0, shape: "" };
        resTrace.set(key, t);
      }
      t.n++;
      return t;
    }
    function traceShape(method, url, shape) {
      const t = resTrace.get(String(method || "GET").toUpperCase() + " " + maskUrl(url));
      if (t && !t.shape) t.shape = shape;
    }
    const resState = () => ({
      rows: Array.from(resCache.values()),
      mine: resMine,
      shape: resShape,
      seen: Array.from(resTrace, ([k, v]) => `${k} ×${v.n}${v.shape ? " → " + v.shape : " → (response not read)"}`),
    });
    function postRes() {
      if (!resSubscribed) return;
      try {
        win.postMessage(Object.assign({ source: FROM_PAGE, type: "FSSE_RESERVATIONS" }, resState()), origin());
      } catch (_) {
        /* never break the page */
      }
    }
    // A completed response body for a URL we watch → parse and publish (scores: slimmed per
    // PID; the Labs preference: the id array, read from the request body when the response
    // carries none).
    function handleText(url, text, reqBody, method) {
      try {
        const u = String(url || "");
        if (RES_ANY_RE.test(u)) return handleReservations(u, text, method);
        const m = SCORES_RE.exec(u);
        if (m) {
          const payload = slim(JSON.parse(text));
          if (payload) publish(m[1].toUpperCase(), payload);
          return;
        }
        if (isLabsUrl(u)) {
          const ids = labsOf(text, reqBody);
          if (ids) {
            labsCache = ids;
            postLabs(ids);
          }
        }
      } catch (_) {
        /* not JSON / not ours — ignore */
      }
    }
    // A reservations response of the page's own: the user's list of ids, or rows — wherever the
    // response keeps them. Every one leaves its shape in the trace.
    function handleReservations(u, text, method) {
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (_) {
        json = null;
      }
      traceShape(method, u, json === null ? `not JSON (${String(text || "").length} chars)` : shapeOf(json, 600, 3));
      if (json === null || RES_POPUP_RE.test(u)) return;
      const lm = RES_LIST_RE.exec(u);
      if (lm) {
        if (sharedList(lm[1])) return;
        resMine = listIds(json);
        postRes();
        return;
      }
      const rows = rowsOf(json);
      if (!rows) return;
      let kept = 0;
      for (const r of rows) {
        const s = slimRow(r);
        if (!s) continue;
        // The sealings and what FamilySearch says about the person first (v1.0.11: the plain
        // alphabetical shape was cut off before it reached them).
        if (!resShape) {
          const first = {};
          const FIRST_RE = /^sealing|dup|permission|rollup|pending|reason/i;
          for (const k of Object.keys(r)) if (FIRST_RE.test(k)) first[k] = r[k];
          for (const k of Object.keys(r)) if (!FIRST_RE.test(k)) first[k] = r[k];
          resShape = shapeOf(first, 3500, 3);
        }
        resCache.delete(s.id);
        resCache.set(s.id, s);
        kept++;
      }
      if (!kept) return;
      while (resCache.size > MAX_RES) resCache.delete(resCache.keys().next().value);
      postRes();
    }
    const urlOf = (input) => {
      try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url; // a Request
        return String(input || "");
      } catch (_) {
        return "";
      }
    };
    const watched = (url) => SCORES_RE.test(url) || isLabsUrl(url) || RES_ANY_RE.test(url);
    // A reservations request leaves its address in the trace as it is made, read or not.
    const noteRequest = (method, url) => {
      try {
        if (RES_ANY_RE.test(url)) traceRequest(method, url);
      } catch (_) {
        /* ignore */
      }
    };

    // ---- fetch ----
    const origFetch = win.fetch;
    if (typeof origFetch === "function") {
      win.fetch = function (input, init) {
        const p = origFetch.apply(this, arguments);
        try {
          const url = urlOf(input);
          if (watched(url) && p && typeof p.then === "function") {
            const reqBody = init && typeof init.body === "string" ? init.body : null;
            const method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
            noteRequest(method, url);
            p.then(
              (res) => {
                try {
                  if (res && res.ok && typeof res.clone === "function") {
                    res
                      .clone()
                      .text()
                      .then((t) => handleText(url, t, reqBody, method), () => {});
                  }
                } catch (_) {
                  /* ignore */
                }
              },
              () => {}
            );
          }
        } catch (_) {
          /* ignore */
        }
        return p;
      };
    }

    // ---- XMLHttpRequest ----
    const XHR = win.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      if (typeof origOpen === "function" && typeof origSend === "function") {
        XHR.prototype.open = function (method, url) {
          try {
            this.__fsseDqsUrl = urlOf(url);
            this.__fsseDqsMethod = typeof method === "string" ? method : "GET";
          } catch (_) {
            /* ignore */
          }
          return origOpen.apply(this, arguments);
        };
        XHR.prototype.send = function (body) {
          try {
            const url = this.__fsseDqsUrl || "";
            if (watched(url)) {
              const reqBody = typeof body === "string" ? body : null;
              const method = this.__fsseDqsMethod || "GET";
              noteRequest(method, url);
              this.addEventListener("load", () => {
                try {
                  if (this.status < 200 || this.status >= 300) return;
                  if (this.responseType === "json" && this.response) handleText(url, JSON.stringify(this.response), reqBody, method);
                  else if (!this.responseType || this.responseType === "text") handleText(url, this.responseText, reqBody, method);
                  else if (RES_ANY_RE.test(url)) traceShape(method, url, `XMLHttpRequest responseType "${this.responseType}" — not read`);
                } catch (_) {
                  /* ignore */
                }
              });
            }
          } catch (_) {
            /* ignore */
          }
          return origSend.apply(this, arguments);
        };
      }
    }

    // ---- late pings from the isolated world ----
    win.addEventListener("message", (e) => {
      try {
        if (e.source !== win || !e.data || e.data.source !== FROM_EXT) return;
        if (e.data.type === "FSSE_LABS_REQUEST") {
          if (labsCache) postLabs(labsCache);
          return;
        }
        if (e.data.type === "FSSE_RESERVATIONS_REQUEST") {
          resSubscribed = true; // from here on every new response is passed on as it arrives
          if (resCache.size || resMine) postRes();
          return;
        }
        if (e.data.type !== "FSSE_DQS_REQUEST") return;
        const pid = e.data.pid ? String(e.data.pid).toUpperCase() : null;
        if (pid) {
          if (cache.has(pid)) post(pid, cache.get(pid));
        } else {
          for (const [k, v] of cache) post(k, v);
        }
      } catch (_) {
        /* ignore */
      }
    });

    return { cache, handleText, labs: () => labsCache, reservations: resState };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SCORES_RE, PREFS_RE, LABS_PREF, RES_ROWS_RE, RES_LIST_RE, RES_ANY_RE, isLabsUrl, labsOf, slim, slimRow, rowsOf, maskUrl, listIds, shapeOf, install };
  } else if (typeof window !== "undefined") {
    install(window);
  }
})();
