// options.js — the settings page (v0.2.133): the toolbar popup AND the Chrome "Extension options"
// page are this one file (manifest `action.default_popup` + `options_ui.page`; the FamilySearch
// menu's footer opens it in a tab too). It renders FSSE.settings.SCHEMA group by group, saves on
// every change, offers "Restore defaults" and shows the manifest version. (v0.2.134: the Google
// Maps key field was dropped at Kevin's ask — the map page's own "Map key…" form remains the one
// place that key is set.)
//
// Extension-page CSP: no inline script, no inline handlers — everything is wired here.

(() => {
  const S = globalThis.FSSE && FSSE.settings;
  if (!S || typeof document === "undefined" || !document.getElementById) return;
  const $ = (id) => document.getElementById(id);

  const el = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (v != null) n.setAttribute(k, v);
    }
    for (const k of kids || []) n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    return n;
  };

  // ---- version -----------------------------------------------------------------------------
  try {
    $("ver").textContent = "v" + chrome.runtime.getManifest().version;
  } catch (_) {
    $("ver").textContent = "";
  }

  // ---- render ----------------------------------------------------------------------------
  const inputs = {}; // key → the checkbox / select
  let statusTimer = null;
  const flash = () => {
    const st = $("status");
    st.classList.remove("off");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => st.classList.add("off"), 1500);
  };
  function optionRow(s) {
    if (s.type === "select") {
      const sel = el("select", { id: "opt-" + s.key, title: s.hint || "" });
      const groups = new Map();
      for (const c of s.choices) {
        const g = c.group || "";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(c);
      }
      for (const [g, list] of groups) {
        const parent = g ? el("optgroup", { label: g }) : sel;
        for (const c of list) parent.appendChild(el("option", { value: c.value, text: c.label }));
        if (g) sel.appendChild(parent);
      }
      sel.addEventListener("change", () => {
        S.save({ [s.key]: sel.value }).then(flash);
      });
      inputs[s.key] = sel;
      return el("div", { class: "sel" }, [el("label", { for: sel.id, text: s.label }), sel, el("small", { text: s.hint || "" })]);
    }
    const box = el("input", { type: "checkbox", id: "opt-" + s.key });
    box.addEventListener("change", () => {
      S.save({ [s.key]: box.checked }).then(flash);
    });
    inputs[s.key] = box;
    const text = el("span", { class: "text" }, [s.label]);
    if (s.hint) text.appendChild(el("small", { text: s.hint }));
    return el("label", { class: "opt", for: box.id, title: s.hint || "" }, [box, text]);
  }

  function render() {
    const main = $("groups");
    main.textContent = "";
    for (const g of S.GROUPS) {
      const entries = S.SCHEMA.filter((s) => s.group === g.id);
      if (!entries.length) continue;
      const sec = el("section", {}, [el("h2", { text: g.title })]);
      if (g.intro) sec.appendChild(el("p", { class: "intro", text: g.intro }));
      const grid = el("div", { class: "grid" + (g.columns === 2 ? " cols2" : "") });
      for (const s of entries) grid.appendChild(optionRow(s));
      sec.appendChild(grid);
      main.appendChild(sec);
    }
    sync();
  }
  // Put the current values on the inputs (never rebuilds, so focus is never lost).
  function sync() {
    for (const s of S.SCHEMA) {
      const i = inputs[s.key];
      if (!i) continue;
      if (s.type === "select") i.value = S.get(s.key);
      else i.checked = S.get(s.key) !== false;
    }
  }

  $("reset").addEventListener("click", () => {
    S.resetDefaults().then(() => {
      sync();
      flash();
    });
  });

  S.ready.then(() => {
    render();
    S.onChange(sync); // our own writes echo back through storage.onChanged; a second open copy follows too
    let hasStore = false;
    try {
      hasStore = !!(chrome.storage && (chrome.storage.sync || chrome.storage.local));
    } catch (_) {}
    if (!hasStore) $("nostore").hidden = false;
  });
})();
