// map.js — the two-pin map page (v0.2.86–87). Opened by linker.js (src/map.html#a=…&b=…) when
// a Source Linker "📍 compare" link has located both places.
//
// Google Maps' directions WEBSITE draws the start as a small circle and only the end as a pin,
// with no URL option to change that — but Google's EMBEDDED directions map (what Google Maps'
// own "Share → Embed a map" produces, and what Gemini showed Kevin) draws lettered A and B
// pins with the route. v0.2.86 drew OpenStreetMap tiles itself; OSM's volunteer tile servers
// refuse requests from an extension page (no referrer, generic browser agent → 403 "Access
// blocked … tile usage policy"), and Kevin asked to stay in the Google ecosystem, so v0.2.87
// frames Google's embed instead:
//   - keyless (default): https://www.google.com/maps/embed?origin=mfe&pb=!1m9!4m8!4m3!3m2
//     !1d<lat1>!2d<lon1>!4m3!3m2!1d<lat2>!2d<lon2> — byte-for-byte the URL that
//     maps.google.com/maps?saddr=<lat1>,<lon1>&daddr=<lat2>,<lon2>&output=embed 301-redirects
//     to (probed 2026-09-15: the final response is 200, the embed bootstrap, no
//     X-Frame-Options), i.e. Google's own translation of the legacy embed. Driving is the
//     embed's default mode.
//   - with a Maps Embed API key saved on this page (chrome.storage.local "fsse.mapsKey"):
//     https://www.google.com/maps/embed/v1/directions?key=…&origin=…&destination=…
//     &mode=driving&units=imperial — the supported product (free, unlimited use; the key is
//     the user's own), which also shows the driving distance and time on the map.
// Coordinates, never names, go to Google — the linker already resolved the right namesake.
// Header: both places (label + the text as written), the straight-line distance, links to
// the Google route / either pin. Hash parameters (URLSearchParams after "#"):
//   a=lat,lon  al=label  at=text as written    b=lat,lon  bl=label  bt=text as written

(() => {
  const RAD = Math.PI / 180;
  const KEY_STORE = "fsse.mapsKey";

  function haversineMiles(a, b) {
    const dLat = (b.lat - a.lat) * RAD;
    const dLon = (b.lon - a.lon) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
  }
  const fmtMiles = (mi) => (mi < 10 ? mi.toFixed(1) : String(Math.round(mi))) + " mi";
  const fmtKm = (mi) => {
    const km = mi * 1.609344;
    return (km < 10 ? km.toFixed(1) : String(Math.round(km))) + " km";
  };

  // "#a=51.46,-2.50&al=Kingswood…" → {a: {lat, lon, label, text}, b: {…}} or null.
  function parseParams(hash) {
    const q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    const pt = (k) => {
      const m = String(q.get(k) || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (!m) return null;
      const lat = +m[1];
      const lon = +m[2];
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
      return { lat, lon, label: q.get(k + "l") || `${lat}, ${lon}`, text: q.get(k + "t") || "" };
    };
    const a = pt("a");
    const b = pt("b");
    return a && b ? { a, b } : null;
  }

  const ll = (p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  const googleRoute = (a, b) => `https://www.google.com/maps/dir/?api=1&origin=${ll(a)}&destination=${ll(b)}&travelmode=driving`;
  const googlePin = (c) => `https://www.google.com/maps/search/?api=1&query=${ll(c)}`;
  // The framed map: Google's keyless directions embed, or the Maps Embed API with the user's key.
  function embedUrl(a, b, key) {
    if (key) return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${ll(a)}&destination=${ll(b)}&mode=driving&units=imperial`;
    return `https://www.google.com/maps/embed?origin=mfe&pb=!1m9!4m8!4m3!3m2!1d${a.lat.toFixed(5)}!2d${a.lon.toFixed(5)}!4m3!3m2!1d${b.lat.toFixed(5)}!2d${b.lon.toFixed(5)}`;
  }

  const M = { KEY_STORE, haversineMiles, fmtMiles, fmtKm, parseParams, googleRoute, googlePin, embedUrl };
  if (typeof module !== "undefined" && module.exports) module.exports = M;

  // ---- the page -----------------------------------------------------------------------
  if (typeof document === "undefined" || !document.getElementById) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const storage = () => (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null);
  function loadKey() {
    return new Promise((resolve) => {
      const s = storage();
      if (!s) return resolve("");
      try {
        s.get(KEY_STORE, (v) => resolve((v && v[KEY_STORE]) || ""));
      } catch (_) {
        resolve("");
      }
    });
  }
  function saveKey(key) {
    return new Promise((resolve) => {
      const s = storage();
      if (!s) return resolve();
      try {
        if (key) s.set({ [KEY_STORE]: key }, resolve);
        else s.remove(KEY_STORE, resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  function boot() {
    const params = parseParams(location.hash);
    const hdr = $("hdr");
    if (!params) {
      hdr.innerHTML = '<div class="err">No places to show — open this page from a Source Linker "📍 compare" link.</div>';
      return;
    }
    const { a, b } = params;
    const miles = haversineMiles(a, b);
    const short = (p) => p.label.split(",")[0];
    document.title = `${short(a)} ↔ ${short(b)} · ${fmtMiles(miles)}`;
    hdr.innerHTML =
      `<div class="places">` +
      `<span class="pin a">A</span><span class="place"><b>${esc(a.label)}</b><small>${esc(a.text || "")} · record</small></span>` +
      `<span class="dist">${esc(fmtMiles(miles))} <small>(${esc(fmtKm(miles))}) straight line</small></span>` +
      `<span class="pin b">B</span><span class="place"><b>${esc(b.label)}</b><small>${esc(b.text || "")} · tree</small></span>` +
      `</div><div class="links">` +
      `<a href="${googleRoute(a, b)}" target="_blank" rel="noopener">Driving route in Google Maps</a>` +
      `<a href="${googlePin(a)}" target="_blank" rel="noopener">A in Google Maps</a>` +
      `<a href="${googlePin(b)}" target="_blank" rel="noopener">B in Google Maps</a>` +
      `<a href="#" id="keylink" class="muted">Map key…</a>` +
      `</div>`;

    let key = "";
    const render = () => {
      $("gmap").src = embedUrl(a, b, key);
      $("mode").textContent = key ? "Google Maps Embed API (your key) — the route with its driving distance and time." : "Google's embedded directions map (no key needed).";
    };
    loadKey().then((k) => {
      key = k;
      render();
    });
    const setup = $("setup");
    $("keylink").addEventListener("click", (ev) => {
      ev.preventDefault();
      setup.hidden = !setup.hidden;
      $("key").value = key;
      if (!setup.hidden) $("key").focus();
    });
    $("save").addEventListener("click", () => {
      key = $("key").value.trim();
      saveKey(key).then(() => {
        setup.hidden = true;
        render();
      });
    });
    $("clear").addEventListener("click", () => {
      key = "";
      $("key").value = "";
      saveKey("").then(() => {
        setup.hidden = true;
        render();
      });
    });
    window.addEventListener("hashchange", () => location.reload()); // a new pair arrived in this reused tab
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
