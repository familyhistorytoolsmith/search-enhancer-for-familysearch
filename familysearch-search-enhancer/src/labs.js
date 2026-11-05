// labs.js — FamilySearch Labs experiments: which are on for this account, and the Temple
// menu's "Families with Remaining Ordinances" row (v1.0.2, Kevin's ask 2026-11-04).
//
// FamilySearch Labs (familysearch.org/en/labs) lets a signed-in user turn experiments on and
// off. What that toggle writes — read off FamilySearch's own page bundles, 2026-11-04 — is ONE
// user preference, "fslabs.labs", whose value is an ARRAY of experiment ids (content ids such
// as "MX7KPMRHCN1ACK3DZ6AGT"), kept server-side:
//   PUT /service/cmn/user-preferences/users/<cisId>/preferences/fslabs.labs   {value: [...]}
// and read back by the batch GET …/preferences?name=fslabs.labs&name=… that FamilySearch's
// OWN pages make at load — the person page for its quality-indicator and chat flags, the
// temple pages for the experiment's route guard. An experiment page such as
// /en/temple/family-remaining-ordinances is guarded by a feature flag evaluated against that
// array (temple_familyRemainingOrdinances); while it is off the route is simply not registered
// and FamilySearch's own "Page Not Found" renders (Kevin's "error page").
//
// This module learns the state the way dqs.js learns the Quality Score: src/dqs-listen.js
// (the page-world script) sees the page's OWN preference response and posts the array here as
// an FSSE_LABS message; this isolated script asks for what it missed (FSSE_LABS_REQUEST — it
// loads at document_idle, after the page's fetch), keeps the last array in
// chrome.storage.local so a page that fetches no preferences (a campaign page) still knows, and
// adopts a fresher record written by another tab (the Labs page toggled there). No request of
// ours — the sharing posture holds.
//
// Turning an experiment ON is never done by us either. FamilySearch's Labs page has its own
// opt-in route: its "Try It" button is a plain link to /en/labs/on/<labId>, whose code waits for
// the user's list, writes the preference with FamilySearch's own token, then
// window.location.replace()s to a `redirectUrl` query parameter (else the experiment's own
// page; an unknown id or an ended experiment → the Labs home). The Temple row (sites.js) sends
// the user to that URL, after a confirm dialog, when the experiment is known to be OFF; when it
// is on (or not known yet) the click opens the experiment page directly. On the experiment's
// own page, when FamilySearch's not-found page renders under its address, tick() shows a banner
// offering the same opt-in route — so nothing ever happens silently, and nothing without a click.
//
// Public surface:
//   FSSE.labs.isOn(id)          → true | false | null (null = not known yet)
//   FSSE.labs.experiment(key)   → { id, title, path, pageUrl, optInUrl } (null for an unknown key)
//   FSSE.labs.LABS_HOME         → the Labs page
//   FSSE.labs.onChange(fn)      → fn(ids) whenever the known list changes
//   FSSE.labs.tick()            → the experiment-page banner (content.js, every tick)
(() => {
  const FROM_PAGE = "fsse-dqs-page"; // messages the page-world script posts (dqs-listen.js)
  const FROM_EXT = "fsse-dqs"; // messages we post to it
  const STORE_KEY = "fsse.labs"; // chrome.storage.local: { ids: [...], at: <ms> }
  const ORIGIN = "https://www.familysearch.org";
  const LABS_HOME = ORIGIN + "/en/labs/";
  const BANNER_ATTR = "data-fsse-labs-banner";
  const BANNER_PREFIX = "Search Enhancer for FamilySearch: ";

  // The experiments we know. `id` is the Labs card's labId (the Try It link's last path
  // segment — Kevin read it off the card on 2026-11-04); `site` is the FSSE.SITES id of the row
  // that opens it (its settings switch gates the banner too); `pathRe` recognises the
  // experiment's own page under any locale prefix.
  const EXPERIMENTS = {
    familyRemainingOrdinances: {
      id: "MX7KPMRHCN1ACK3DZ6AGT",
      title: "Families with Remaining Ordinances",
      path: "/en/temple/family-remaining-ordinances",
      pathRe: /^\/(?:[a-z]{2,3}(?:-[a-z]+)?\/)?temple\/family-remaining-ordinances(?:[/?#]|$)/i,
      site: "family-remaining-ordinances",
    },
  };
  function experiment(key) {
    const e = EXPERIMENTS[key];
    if (!e) return null;
    return {
      ...e,
      pageUrl: ORIGIN + e.path,
      // FamilySearch's own opt-in route (the Labs app's "/:state(on|off)/:labId"); redirectUrl is
      // read with URLSearchParams and handed to window.location.replace, so a site-root path works.
      optInUrl: `${ORIGIN}/en/labs/on/${e.id}?redirectUrl=${encodeURIComponent(e.path)}`,
    };
  }

  const state = { ids: null, at: 0, from: null, listeners: [], logged: null };

  function normalize(ids) {
    if (!Array.isArray(ids)) return null;
    return ids.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  }
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

  function isOn(id) {
    if (!state.ids) return null;
    return state.ids.includes(id);
  }

  // Adopt a list. `from` = "page" (the page's own response — always the freshest, and saved) or
  // "cache" (storage: the load at start, or another tab's write — adopted only when newer than
  // what this tab holds). Returns true when the known list changed.
  function receive(ids, from, at) {
    const list = normalize(ids);
    if (!list) return false;
    const when = from === "page" ? Date.now() : Number(at) || 1;
    if (from !== "page" && state.ids && when <= state.at) return false;
    const changed = !same(list, state.ids);
    state.ids = list;
    state.at = when;
    state.from = from;
    if (from === "page") save(list, when);
    if (changed) {
      const key = list.join(",");
      if (key !== state.logged) {
        state.logged = key;
        FSSE.log(`labs: ${list.length} experiment(s) on for this account (${from}): ${list.join(", ") || "none"}`);
      }
      for (const fn of state.listeners) {
        try {
          fn(list);
        } catch (err) {
          console.warn("[FSSE] labs listener failed", err);
        }
      }
    }
    return changed;
  }
  function onChange(fn) {
    if (typeof fn === "function") state.listeners.push(fn);
  }

  // ---- storage (best effort; chrome.storage.local → localStorage) --------------------------
  function area() {
    try {
      return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
    } catch (_) {
      return null;
    }
  }
  function save(ids, at) {
    const rec = { ids, at };
    const a = area();
    if (a) {
      try {
        a.set({ [STORE_KEY]: rec }, () => {
          try {
            void chrome.runtime.lastError; // read so Chrome does not log it
          } catch (_) {
            /* ignore */
          }
        });
        return;
      } catch (_) {
        /* fall through */
      }
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    } catch (_) {
      /* ignore */
    }
  }
  function load() {
    const adopt = (rec) => rec && Array.isArray(rec.ids) && receive(rec.ids, "cache", rec.at);
    const a = area();
    if (a) {
      try {
        a.get(STORE_KEY, (r) => {
          try {
            void chrome.runtime.lastError;
            adopt(r && r[STORE_KEY]);
          } catch (_) {
            /* ignore */
          }
        });
        return;
      } catch (_) {
        /* fall through */
      }
    }
    try {
      adopt(JSON.parse(localStorage.getItem(STORE_KEY) || "null"));
    } catch (_) {
      /* ignore */
    }
  }
  function watchStorage() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.onChanged) return;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes || !changes[STORE_KEY]) return;
        const rec = changes[STORE_KEY].newValue;
        if (rec && Array.isArray(rec.ids) && receive(rec.ids, "cache", rec.at)) {
          try {
            tick();
          } catch (_) {
            /* ignore */
          }
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  // ---- the page-world listener ---------------------------------------------------------
  function request(win) {
    try {
      win.postMessage({ source: FROM_EXT, type: "FSSE_LABS_REQUEST" }, win.location.origin);
    } catch (_) {
      /* ignore */
    }
  }
  function wire(win) {
    if (!win || !win.addEventListener) return;
    win.addEventListener("message", (e) => {
      // Same window AND same origin: the array comes from our page-world script, nowhere else.
      if (e.source !== win || e.origin !== win.location.origin) return;
      if (!e.data || e.data.source !== FROM_PAGE || e.data.type !== "FSSE_LABS") return;
      if (receive(e.data.labs, "page")) {
        try {
          tick();
        } catch (err) {
          console.warn("[FSSE] labs tick failed", err);
        }
      }
    });
    load();
    watchStorage();
    request(win); // the page may have fetched its preferences before we were listening
  }

  // ---- the experiment page's not-found banner -------------------------------------------
  function experimentOnPage() {
    const p = (typeof location !== "undefined" && location.pathname) || "";
    for (const key of Object.keys(EXPERIMENTS)) if (EXPERIMENTS[key].pathRe.test(p)) return key;
    return null;
  }
  function elements() {
    try {
      return FSSE.deepElements ? FSSE.deepElements(document) : Array.from(document.querySelectorAll("*"));
    } catch (_) {
      return [];
    }
  }
  const NOT_FOUND_TEXTS = ["Well, this is unexpected...", "Page Not Found"]; // FS's not-found page (its i18n strings)
  function notFoundShown(els) {
    try {
      if (document.querySelector && document.querySelector('[data-testid="notfound"]')) return true;
    } catch (_) {
      /* ignore */
    }
    return NOT_FOUND_TEXTS.some((t) => !!FSSE.findSmallestWithText(els, t));
  }
  function removeBanner() {
    try {
      for (const el of document.querySelectorAll(`[${BANNER_ATTR}]`)) el.remove();
    } catch (_) {
      /* ignore */
    }
  }
  function bannerText(exp, on) {
    if (on === true) {
      return `${BANNER_PREFIX}"${exp.title}" is on for your account, but FamilySearch did not find this page — the experiment may have ended. `;
    }
    return `${BANNER_PREFIX}this page is the FamilySearch Labs experiment "${exp.title}", which is ${on === false ? "off for your account" : "not turned on for your account"}. `;
  }
  function showBanner(exp, on) {
    const marker = `${exp.id}:${on === true ? "on" : on === false ? "off" : "unknown"}`;
    try {
      const existing = document.querySelector(`[${BANNER_ATTR}]`);
      if (existing && existing.getAttribute(BANNER_ATTR) === marker) return existing;
      if (existing) existing.remove();
      const d = document.createElement("div");
      d.setAttribute(BANNER_ATTR, marker);
      d.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff4ce;color:#222;" +
        "border-bottom:2px solid #d4a72c;font:15px/1.4 system-ui,Arial,sans-serif;padding:10px 44px 10px 16px;" +
        "box-shadow:0 2px 6px rgba(0,0,0,.2)";
      d.appendChild(document.createTextNode(bannerText(exp, on)));
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "font:inherit;font-weight:600;padding:3px 10px;border:1px solid #8a6d1f;border-radius:4px;background:#fff;cursor:pointer;color:#222";
      if (on === true) {
        b.textContent = "Open FamilySearch Labs";
        b.addEventListener("click", () => location.assign(LABS_HOME));
      } else {
        b.textContent = "Turn it on and open it";
        b.title = "Through FamilySearch's own Labs page — the same as pressing Try It there.";
        b.addEventListener("click", () => {
          FSSE.log("labs: banner click → FamilySearch's opt-in page", exp.optInUrl);
          location.assign(exp.optInUrl);
        });
      }
      d.appendChild(b);
      const x = document.createElement("button");
      x.type = "button";
      x.textContent = "×";
      x.title = "Dismiss";
      x.style.cssText = "position:absolute;top:4px;right:10px;border:0;background:none;font-size:22px;cursor:pointer;color:#444";
      x.addEventListener("click", () => d.remove());
      d.appendChild(x);
      (document.body || document.documentElement).appendChild(d);
      FSSE.log(`labs: not-found page under ${exp.path} — banner shown (experiment ${on === true ? "on" : on === false ? "off" : "state unknown"})`);
      return d;
    } catch (_) {
      return null;
    }
  }
  function tick() {
    const key = experimentOnPage();
    if (!key) return removeBanner();
    if (FSSE.settings && FSSE.settings.loaded === false) return;
    const exp = experiment(key);
    if (FSSE.settings && typeof FSSE.settings.siteEnabled === "function" && !FSSE.settings.siteEnabled(exp.site)) return removeBanner();
    const els = elements();
    if (FSSE.findSmallestWithText(els, exp.title)) return removeBanner(); // the real page rendered
    if (!notFoundShown(els)) return removeBanner(); // still loading
    showBanner(exp, isOn(exp.id));
  }

  if (typeof window !== "undefined" && window.addEventListener && typeof module === "undefined") wire(window);

  FSSE.labs = {
    EXPERIMENTS, LABS_HOME, STORE_KEY, BANNER_ATTR, experiment, isOn, receive, onChange, tick, wire, load, save,
    ids: () => state.ids, _state: state, _normalize: normalize, _bannerText: bannerText,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FSSE.labs;
})();
