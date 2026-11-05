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
// No FSSE namespace here (page world). Exported for tests via module.exports when run in
// node: install(win) wires a fake window.
(() => {
  const SCORES_RE = /\/service\/tree\/tree-data\/quality\/person\/([A-Z0-9]{4}-[A-Z0-9]{2,4})\/scores(?:[/?#]|$)/i;
  const PREFS_RE = /\/service\/cmn\/user-preferences\/users\/[^/?#]+\/preferences(?:\/([^/?#]+))?(?:\?([^#]*))?/i;
  const LABS_PREF = "fslabs.labs";
  const FROM_PAGE = "fsse-dqs-page"; // messages we post
  const FROM_EXT = "fsse-dqs"; // messages the isolated script posts
  const MAX_CACHE = 30;

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
    // A completed response body for a URL we watch → parse and publish (scores: slimmed per
    // PID; the Labs preference: the id array, read from the request body when the response
    // carries none).
    function handleText(url, text, reqBody) {
      try {
        const u = String(url || "");
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
    const urlOf = (input) => {
      try {
        if (typeof input === "string") return input;
        if (input && typeof input.url === "string") return input.url; // a Request
        return String(input || "");
      } catch (_) {
        return "";
      }
    };
    const watched = (url) => SCORES_RE.test(url) || isLabsUrl(url);

    // ---- fetch ----
    const origFetch = win.fetch;
    if (typeof origFetch === "function") {
      win.fetch = function (input, init) {
        const p = origFetch.apply(this, arguments);
        try {
          const url = urlOf(input);
          if (watched(url) && p && typeof p.then === "function") {
            const reqBody = init && typeof init.body === "string" ? init.body : null;
            p.then(
              (res) => {
                try {
                  if (res && res.ok && typeof res.clone === "function") {
                    res
                      .clone()
                      .text()
                      .then((t) => handleText(url, t, reqBody), () => {});
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
              this.addEventListener("load", () => {
                try {
                  if (this.status < 200 || this.status >= 300) return;
                  if (this.responseType === "json" && this.response) handleText(url, JSON.stringify(this.response), reqBody);
                  else if (!this.responseType || this.responseType === "text") handleText(url, this.responseText, reqBody);
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

    return { cache, handleText, labs: () => labsCache };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SCORES_RE, PREFS_RE, LABS_PREF, isLabsUrl, labsOf, slim, install };
  } else if (typeof window !== "undefined") {
    install(window);
  }
})();
