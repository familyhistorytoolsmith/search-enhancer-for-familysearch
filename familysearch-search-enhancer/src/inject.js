// inject.js — DOM helpers that locate FamilySearch's native "Search Records" list and
// insert new rows by *cloning* an existing entry (so injected rows inherit FamilySearch's
// exact styling instead of relying on its hashed/obfuscated class names).
//
// Detection is resilient: it pierces open shadow roots, tolerates heading icons/carets,
// and anchors on the visible entry labels rather than hashed CSS classes.
//
// Two kinds of injected entry:
//   - injectRow:  a plain row that opens one URL (Shift+click cycling supported)
//   - injectMenu: an expandable row; clicking it toggles an inline list of options built
//                 from the current person (site.options(p)), each a cloned, indented row.

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  FSSE.DEBUG = false; // release build — set true while developing (all [FSSE] console diagnostics hang off this)
  FSSE.log = (...a) => {
    if (FSSE.DEBUG) console.log("[FSSE]", ...a);
  };
  // Extension version from the manifest (bumped on every revision) — logged on load so the
  // console shows whether the reload after an edit actually took.
  FSSE.version = () => {
    try {
      return chrome.runtime.getManifest().version;
    } catch (_) {
      return "?";
    }
  };

  // v1.0.0: extension asset URLs (the menu icons) are resolved ONCE at load and cached.
  // chrome.runtime.getURL throws "Extension context invalidated" in a tab whose content script
  // an extension reload — or, from the Chrome Web Store, an AUTO-UPDATE — has orphaned; resolved
  // at call time (v0.2.47–v0.2.138) every custom-icon row then failed to re-inject after a React
  // re-render until the page was refreshed (the mixed-missing-rows look noted in v0.2.69). With
  // the URLs cached the rows keep working in an orphaned tab, and the first failure logs ONE
  // "refresh this page" line instead of an error per tick.
  const ASSET_PATHS = [
    "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
    "icons/freebmd32.png", "icons/gro32.png", "icons/sp32.png", "icons/news32.png", "icons/ri32.png", "icons/ig32.png",
  ];
  const assetUrls = new Map();
  const hasRuntime = () => {
    try {
      return typeof chrome !== "undefined" && !!chrome.runtime && typeof chrome.runtime.getURL === "function";
    } catch (_) {
      return false;
    }
  };
  // true while this content script still belongs to a live extension; false once a reload or
  // an update has orphaned it (chrome.runtime.id goes undefined). No runtime at all (node, the
  // tests) counts as alive — nothing was lost there.
  FSSE.contextAlive = function contextAlive() {
    if (!hasRuntime()) return true;
    try {
      return !!chrome.runtime.id;
    } catch (_) {
      return false;
    }
  };
  // The one-line notice, logged once (console.warn, so a release build shows it too).
  FSSE.orphaned = function orphaned(where) {
    if (!FSSE._orphaned) {
      FSSE._orphaned = true;
      console.warn("[FSSE] the extension was updated or reloaded while this tab was open" + (where ? " (" + where + ")" : "") + " — refresh the page to restore it fully.");
    }
    return true;
  };
  FSSE.assetUrl = function assetUrl(assetPath) {
    if (assetUrls.has(assetPath)) return assetUrls.get(assetPath);
    if (!hasRuntime()) return null;
    try {
      const url = chrome.runtime.getURL(assetPath);
      assetUrls.set(assetPath, url);
      return url;
    } catch (_) {
      FSSE.orphaned("asset " + assetPath);
      return null;
    }
  };
  FSSE._assetUrls = assetUrls; // tests/release.test.js
  if (hasRuntime()) for (const p of ASSET_PATHS) FSSE.assetUrl(p);

  // Native entries in the Search Records panel — used to confirm we found the right card.
  // FS's NARROW-VIEWPORT (responsive) layout — triggered by e.g. DevTools docked to the side,
  // a small window, or browser zoom — renders a third-party-only panel (no FamilySearch row):
  // Ancestry, MyHeritage, FindMyPast, American Ancestors, Filae, Geneanet, Storied, All
  // Third-Parties. Matched case-insensitively (that layout recases "Findmypast" → "FindMyPast").
  // v0.2.92: the LABS person page (FS's 2026-09 experiment, "Opt-Out of Experiment" button)
  // turns the card into a header BUTTON whose dropdown lists "FamilySearch Records ·
  // FamilySearch Full Text · FamilySearch Trees" (a group of its own) then Ancestry ·
  // MyHeritage · Findmypast · Geneanet · Storied · Filae · Google. The two FS-only names are
  // listed so that group counts as an entry LIST for findEntryByLabel (≥ 2 known names).
  // v1.0.4: on a FamilySearch CENTER's network the list gains "Ancestry Institution" (after
  // Ancestry) and "MyHeritage Library Edition" (after MyHeritage) — Kevin's Boise FSC screenshot,
  // 2026-11-04. Listed as names of their own (the longer name is stripped before "Ancestry" /
  // "MyHeritage" is counted), so that should FamilySearch ever wrap a partner's two rows in one
  // element, that wrapper counts as a two-entry list and each row is still found — and hidden —
  // on its own, never as a pair.
  const KNOWN = [
    "FamilySearch",
    "FamilySearch Full Text",
    "FamilySearch Trees",
    "Ancestry",
    "Ancestry Institution",
    "MyHeritage",
    "MyHeritage Library Edition",
    "Findmypast",
    "American Ancestors",
    "Geneanet",
    "Storied",
    "Filae",
    "Third-Parties",
    "Google",
  ];

  // Tooltips: a browser shows `title` text as one very long line whose box can run to the screen
  // edge. Pre-wrap at ~TIP_WIDTH characters with newlines — Chrome honours line breaks in title
  // text and always keeps the box on screen. Breaks at word boundaries, prefers a break after a
  // sentence end once a line is >60% full, keeps explicit newlines, never splits a word.
  FSSE.TIP_WIDTH = 40;
  FSSE.wrapTip = function wrapTip(text, width) {
    const w = width || FSSE.TIP_WIDTH;
    if (!text) return "";
    const out = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        if (!line) line = word;
        else if (line.length + 1 + word.length <= w) line += " " + word;
        else {
          out.push(line);
          line = word;
        }
        if (/[.!?]$/.test(word) && line.length >= w * 0.6) {
          out.push(line);
          line = "";
        }
      }
      if (line) out.push(line);
    }
    return out.join("\n");
  };

  // Collect every element from a root, descending into open shadow roots.
  function deepElements(root) {
    const out = [];
    const stack = [root || document];
    while (stack.length) {
      const r = stack.pop();
      const els = r.querySelectorAll ? r.querySelectorAll("*") : [];
      for (const el of els) {
        out.push(el);
        if (el.shadowRoot) stack.push(el.shadowRoot);
      }
    }
    return out;
  }
  FSSE.deepElements = deepElements;

  // Smallest element whose trimmed text == `text` (i.e., no child element holds the same
  // text). Tolerates sibling icons/carets that contribute no text of their own.
  function findSmallestWithText(els, text) {
    for (const el of els) {
      if (el.textContent.trim() !== text) continue;
      const childHasSame = Array.from(el.children).some((c) => c.textContent.trim() === text);
      if (!childHasSame) return el;
    }
    return null;
  }
  FSSE.findSmallestWithText = findSmallestWithText;

  // Distinct known entries in a text. Longest names first, each match STRIPPED before the
  // shorter names are tried — "FamilySearch Trees" alone must count as ONE entry, not as
  // "FamilySearch Trees" + "FamilySearch" (v0.2.92; that double count made a single Labs
  // dropdown row look like a two-entry list to findEntryByLabel). Boundaries: textContent
  // concatenates React-rendered entries with NO separator ("…TreesAncestryMyHeritage…"), so a
  // name may start right after a lowercase letter and end right before an uppercase one (a
  // camel-case seam); it may not sit inside a word ("Googled", "XAncestry"). Names match
  // case-insensitively ("FindMyPast" in the narrow layout) — spelled out per letter, since the
  // /i flag would also blind the lookarounds.
  const KNOWN_RES = [...KNOWN]
    .sort((a, b) => b.length - a.length)
    .map((k) => {
      const letters = k.replace(/[a-z]/gi, (ch) => `[${ch.toUpperCase()}${ch.toLowerCase()}]`);
      const src = `(?<![A-Z0-9])${letters}(?![a-z0-9])`;
      return { test: new RegExp(src), strip: new RegExp(src, "g") };
    });
  function countKnown(text) {
    let t = String(text || "");
    let n = 0;
    for (const k of KNOWN_RES) {
      if (!k.test.test(t)) continue;
      n++;
      t = t.replace(k.strip, " ");
    }
    return n;
  }

  // Locate the search panel to inject into. FS renders DIFFERENT page layouts by viewport
  // width (narrow = e.g. DevTools docked to the side, a small window, browser zoom), and both
  // the classic "Search Records" card AND the narrow layout's third-party-only cluster
  // (Ancestry · MyHeritage · FindMyPast · American Ancestors · …) can be in the DOM at once —
  // one visible, one hidden/detached, flapping between re-renders. So collect every candidate
  // and pick ONE deterministically, or the injected rows scatter across panels as ticks
  // alternate. Preference order: a visible panel, then one holding a native "FamilySearch" row
  // (the classic card — our best anchor), then heading-derived over cluster-derived.
  // v0.2.92 — the LABS person page. Kevin's 2026-09-21 log on Betsy Bellwood KHW2-6TP: the
  // page holds the HIDDEN narrow-layout third-party panel too, and "Search Records" is a header
  // BUTTON whose dropdown (FamilySearch Records · Full Text · Trees | Ancestry · MyHeritage ·
  // Findmypast · Geneanet · Storied · Filae · Google) exists only while open. The old cluster
  // path took ONE cluster — the smallest by text — which was always the hidden panel, so every
  // row was injected where nobody could see it. Now: (1) EVERY minimal cluster is a candidate,
  // each expanded outward while the parent adds known entries without much other text (the
  // dropdown's third-party list → the whole dropdown incl. the FS group; never the page);
  // (2) a candidate must be SHOWN (checkVisibility + a box) to win — a page whose only panels
  // are hidden gets no rows at all (the dropdown's rows inject on the gesture tick that opens it,
  // exactly like the Temple dropdown). The layout is logged on change.
  const HEADING_PANEL_MAX = 600;
  function expandCluster(el) {
    let node = el;
    for (let i = 0; i < 6 && node.parentElement; i++) {
      const p = node.parentElement;
      if (countKnown(p.textContent) <= countKnown(node.textContent)) break; // adds no entry — the panel ends here
      if (p.textContent.length > node.textContent.length * 3) break; // adds mostly OTHER text — that's the page
      node = p;
    }
    return node;
  }
  FSSE.findSection = function findSection() {
    const els = deepElements(document);
    const candidates = [];
    let labs = false;
    // Heading path: climb from EVERY "Search Records" heading to its entry-bearing ancestor.
    for (const el of els) {
      const t = el.textContent.trim();
      if (t === "Opt-Out of Experiment" && !el.childElementCount) labs = true;
      if (t !== "Search Records") continue;
      let node = el;
      for (let i = 0; i < 12 && node.parentElement; i++) {
        node = node.parentElement;
        // A panel of entries never carries this much text: past it we are climbing the page
        // itself (the Labs header BUTTON's ancestors reach the whole page, whose hidden panel
        // would otherwise qualify).
        if (node.textContent.length > HEADING_PANEL_MAX) break;
        if (countKnown(node.textContent) >= 3) {
          if (!candidates.some((c) => c.node === node)) candidates.push({ node, via: "heading" });
          break;
        }
      }
    }
    // Cluster path: every MINIMAL element containing >=4 known entries, expanded to its panel.
    const clusters = els.filter((el) => countKnown(el.textContent) >= 4);
    for (const c of clusters) {
      if (clusters.some((o) => o !== c && c.contains(o))) continue; // an ancestor of a smaller cluster
      const panel = expandCluster(c);
      if (candidates.some((k) => k.node.contains(panel) || panel.contains(k.node))) continue;
      candidates.push({ node: panel, via: "entry-cluster" });
    }
    const layout = labs ? "labs" : "legacy";
    if (FSSE._layout !== layout) {
      FSSE._layout = layout;
      FSSE.log(`layout: ${layout}${labs ? " — the Labs person page (Search Records is a header button: rows inject into its dropdown when opened; sources are read from the Details page's Sources column)" : ""}`);
    }
    if (!candidates.length) {
      if (findSection._last !== "none") FSSE.log("section: NOT FOUND");
      findSection._last = "none";
      return null;
    }
    const score = (c) =>
      (shown(c.node) ? 4 : 0) + // shown beats hidden (a hidden panel never wins — see below)
      (findSmallestWithText(deepElements(c.node), "FamilySearch") ? 2 : 0) + // classic card beats third-party cluster
      (c.via === "heading" ? 1 : 0);
    candidates.sort((a, b) => score(b) - score(a));
    const win = candidates[0];
    if (!shown(win.node)) {
      const desc = `NOT FOUND (${candidates.length} hidden candidate panel${candidates.length > 1 ? "s" : ""} ignored)`;
      if (findSection._last !== desc) {
        findSection._last = desc;
        FSSE.log("section:", desc);
      }
      return null;
    }
    const desc = `via ${win.via} (score ${score(win)}, ${candidates.length} candidate panel${candidates.length > 1 ? "s" : ""})`;
    if (findSection._last !== desc) {
      findSection._last = desc;
      FSSE.log("section: picked", desc);
    }
    return win.node;
  };

  // Locate the "Temple" dropdown (v0.2.63; rebuilt v0.2.64) — the members-only top-nav menu
  // (My Reservations · Family Groups · … · Ordinances Ready · … · Schedule Temple
  // Appointment). Kevin's v0.2.63 log proved the page can hold a HIDDEN in-place copy of the
  // menu at load while the dropdown the user actually opens is a SEPARATE React-rendered
  // copy — the old heading climb found only the hidden one, so the rows were injected where
  // nobody could see them (the search panel had the same dual-copy disease in v0.2.8). So:
  // collect EVERY rendered copy by climbing from every "Ordinances Ready" leaf to the
  // smallest ancestor holding >=3 known temple labels, and pick a genuinely SHOWN copy ONLY.
  // WHY (v0.2.66–67, Kevin's live evidence 2026-09-05): injecting into the header while
  // React is still HYDRATING it makes React remount the whole header WITHOUT removing the
  // old one on the server-rendered campaign pages — /en/campaign/temple-tools stacked FOUR
  // identical banners (3 injected rows → 3 extra remounts), clean with the extension off.
  // v0.2.66 tried "visible copies only" via getClientRects(), but Kevin's v0.2.66 log showed
  // the campaign page's CLOSED menu copies still count as visible at load (`picked VISIBLE
  // copy (3 candidates)` fired immediately) — FS hides them in a way that keeps client
  // rects. v0.2.67 therefore has TWO guards:
  //   (1) shown() — checkVisibility() (visibility/opacity aware) + a non-zero box;
  //   (2) the USER-GESTURE ARM (FSSE._userGestureSeen, set by content.js on the first
  //       pointerdown/keydown/touchstart): nothing is injected before the user has
  //       interacted at all. The dropdown can only be OPENED by a click React handles, and
  //       React handles clicks only after hydration — so gesture-gated injection can never
  //       land in a hydrating header, no matter how FS hides the closed copies.
  // Cost: the rows inject on the tick the dropdown opens (~300ms pop-in — the path Kevin
  // verified in v0.2.64). Don't re-add load-time/hidden-copy injection: it is what
  // duplicates hydrating headers.
  const KNOWN_TEMPLE = [
    "My Reservations",
    "Family Groups",
    "Shared with Temple",
    "Completed",
    "Ordinances Ready",
    "Family Name Assist",
    "Schedule Temple Appointment",
  ];
  // "Actually shown to the user" — stricter than getClientRects(): a closed menu hidden via
  // visibility/opacity/a collapsed box still HAS client rects (the v0.2.66 miss).
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    // Both option spellings: Chrome accepts the newer opacityProperty/visibilityProperty
    // names; older builds only the checkOpacity/checkVisibilityCSS ones. Extras are ignored.
    if (el.checkVisibility) return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
    return el.getClientRects().length > 0;
  };
  // Every rendered copy of the Temple dropdown, shown or hidden: climb from each "Ordinances
  // Ready" leaf to the smallest ancestor holding three of the menu's known labels.
  function templeCopies(els) {
    const candidates = [];
    for (const el of els) {
      if (el.textContent.trim() !== "Ordinances Ready") continue;
      let node = el;
      for (let i = 0; i < 12 && node.parentElement; i++) {
        node = node.parentElement;
        if (KNOWN_TEMPLE.filter((k) => node.textContent.includes(k)).length >= 3) {
          if (!candidates.some((c) => c.node === node)) candidates.push({ node });
          break;
        }
      }
    }
    return candidates;
  }

  // v1.0.5 — does THIS page, right now, show its signed-in user a Temple menu? (Kevin, 2026-11-12:
  // FamilySearch draws the Temple menu in the masthead for church members only, so the settings
  // page can leave its Temple group out for everyone else — a community patron at a FamilySearch
  // Center, say.) Read LIVE from the page on every question and NEVER stored: a computer shared by
  // members and patrons must not remember who used it last, and the privacy policy stays as it is.
  //   true  — a Temple menu is in the page: a copy of its dropdown (shown or hidden), or a
  //           "Temple" item beside the masthead's other items;
  //   false — the signed-in masthead is SHOWN (three of its items) and nothing of a Temple menu
  //           is in the page, shown or hidden;
  //   null  — cannot tell: signed out, still loading, the masthead collapsed (a narrow window),
  //           another language. The settings page then shows the Temple group, as before v1.0.5.
  // Every doubt resolves to "show": a wrong `false` would hide a member's own switches.
  const MASTHEAD = ["Family Tree", "Search", "Memories", "Get Involved", "Activities"];
  const SIGNED_OUT_RE = /^(sign in|create (a )?(free )?account)$/i;
  FSSE.templeMenuState = function templeMenuState() {
    const els = deepElements(document);
    const done = (temple, why) => {
      if (templeMenuState._last !== why) {
        templeMenuState._last = why;
        FSSE.log("temple menu check:", temple === null ? "unknown" : temple ? "Temple menu present" : "no Temple menu", "—", why);
      }
      return { temple, why };
    };
    if (templeCopies(els).length) return done(true, "a copy of the Temple dropdown is in the page");
    // The smallest elements reading exactly one of the texts we care about.
    const nav = []; // { el, label, shown }
    const temple = [];
    let signedOut = false;
    for (const el of els) {
      const t = el.textContent.trim();
      if (!t || t.length > 24) continue;
      const isNav = MASTHEAD.includes(t);
      const isTemple = t === "Temple";
      const isOut = SIGNED_OUT_RE.test(t);
      if (!isNav && !isTemple && !isOut) continue;
      if (Array.from(el.children).some((c) => c.textContent.trim() === t)) continue; // a wrapper of the leaf
      if (isNav) nav.push({ el, label: t, shown: shown(el) });
      else if (isTemple) temple.push(el);
      else if (shown(el)) signedOut = true;
    }
    const labelsIn = (node, list) => new Set(list.filter((n) => node.contains(n.el)).map((n) => n.label)).size;
    // A "Temple" item counts when it sits with the masthead's other items (a place or a surname
    // "Temple" elsewhere on the page does not).
    for (const t of temple) {
      let node = t;
      for (let i = 0; i < 8 && node.parentElement; i++) {
        node = node.parentElement;
        if (labelsIn(node, nav) >= 2) return done(true, '"Temple" sits among the masthead items');
      }
    }
    if (signedOut) return done(null, "signed out");
    const visible = nav.filter((n) => n.shown);
    let masthead = false;
    for (const n of visible) {
      let node = n.el;
      for (let i = 0; i < 8 && node.parentElement && !masthead; i++) {
        node = node.parentElement;
        if (labelsIn(node, visible) >= 3) masthead = true;
      }
      if (masthead) break;
    }
    if (!masthead) return done(null, "the signed-in masthead is not shown (loading, collapsed, or another language)");
    return done(false, "the signed-in masthead is shown without a Temple item");
  };
  // The settings page's question, answered from the page as it is this instant (content.js wires
  // it to chrome.runtime.onMessage). Returns undefined for any other message.
  FSSE.TEMPLE_QUERY = "FSSE_TEMPLE_QUERY";
  FSSE.answerTempleQuery = function answerTempleQuery(msg) {
    if (!msg || msg.type !== FSSE.TEMPLE_QUERY) return undefined;
    let temple = null;
    try {
      temple = FSSE.templeMenuState().temple;
    } catch (_) {}
    return { temple };
  };

  FSSE.findTempleSection = function findTempleSection() {
    if (!FSSE._userGestureSeen) {
      if (findTempleSection._last !== "unarmed") {
        findTempleSection._last = "unarmed";
        FSSE.log("temple section: deferred until the first user interaction (header hydration guard)");
      }
      return null;
    }
    const candidates = templeCopies(deepElements(document));
    if (!candidates.length) {
      if (findTempleSection._last !== "none") FSSE.log("temple section: not found (non-member account, or the menu is not rendered while closed)");
      findTempleSection._last = "none";
      return null;
    }
    const win = candidates.find((c) => shown(c.node));
    if (!win) {
      const desc = `all hidden (${candidates.length} cop${candidates.length > 1 ? "ies" : "y"})`;
      if (findTempleSection._last !== desc) {
        findTempleSection._last = desc;
        FSSE.log("temple section: " + desc + " — rows will inject when the dropdown opens");
      }
      return null;
    }
    const desc = `SHOWN copy (${candidates.length} candidate${candidates.length > 1 ? "s" : ""})`;
    if (findTempleSection._last !== desc) {
      findTempleSection._last = desc;
      FSSE.log("temple section: picked", desc);
    }
    return win.node;
  };

  // Find the full clickable row for a native entry identified by its visible label.
  // Returns the entry at the *list level* — i.e. a direct child of the container that
  // holds multiple entries — so every injected row sits at the same level as native rows
  // (avoids landing inline beside an entry when nesting differs between entries).
  // `quiet` (v0.2.101): the label's absence is expected (a layout-specific native entry is
  // probed every tick) — return null without the miss log and the leaf dump.
  FSSE.findEntryByLabel = function findEntryByLabel(section, label, quiet) {
    const els = deepElements(section);
    const leaf = findSmallestWithText(els, label);
    if (!leaf) {
      if (quiet) return null;
      FSSE.log(`entry "${label}": label text not found in section`);
      // One-shot dump of what the section DOES contain, so a renamed native row (e.g. the
      // "FamilySearch" entry getting a new label in a FS redesign) can be read off a pasted log.
      const seen = new Set();
      for (const el of els) {
        if (el.childElementCount) continue;
        if (el.tagName === "STYLE" || el.tagName === "SCRIPT") continue; // no inline-CSS noise
        const t = el.textContent.trim().replace(/\s+/g, " ");
        if (t && t.length <= 60) seen.add(t);
      }
      const dump = [...seen].join(" · ");
      if (dump !== findEntryByLabel._lastDump) {
        findEntryByLabel._lastDump = dump;
        FSSE.log("section leaf texts:", dump || "(none)");
      }
      return null;
    }
    // The entry list = nearest ancestor that holds 2+ known entries.
    let list = leaf.parentElement;
    while (list && list !== section && countKnown(list.textContent) < 2) {
      list = list.parentElement;
    }
    if (!list) list = section;
    // Row = the direct child of that list which contains the label leaf.
    let row = leaf;
    while (row.parentElement && row.parentElement !== list) {
      row = row.parentElement;
    }
    return row;
  };

  // v0.2.101 — the NATIVE entry one of our menus takes the place of (site.replaces: the
  // classic card's "FamilySearch" row / the Labs dropdown's "FamilySearch Records" entry;
  // Kevin: "instead of two FamilySearch search entry points"). Tries the labels in order
  // (quietly — each layout has only one of them) and returns { row, label, url }: the
  // list-level row, the label that matched, and the search URL its link carries — the row
  // itself when it is an <a href>, else the first linked descendant (href = the resolved
  // absolute URL); null when the entry is a button with no link, in which case the menu's
  // options() falls back to a URL of its own.
  // v0.2.105: `leaf` = the label's own element (the click target for clickNative), and only a
  // REAL link counts as `url` — an absolute http(s) URL that is not this page itself ("#",
  // "javascript:" and same-page "#frag" hrefs resolve to nothing useful).
  const realLink = (h) => {
    const s = String(h || "");
    if (!/^https?:\/\//i.test(s)) return null;
    const here = String((globalThis.location && location.href) || "").replace(/#.*$/, "");
    return here && s.replace(/#.*$/, "") === here ? null : s;
  };
  FSSE.findNativeEntry = function findNativeEntry(section, labels) {
    for (const label of [].concat(labels || [])) {
      const row = FSSE.findEntryByLabel(section, label, true);
      if (!row) continue;
      const els = deepElements(row);
      const isLink = (e) => e && e.tagName === "A" && !!realLink(e.href);
      const link = isLink(row) ? row : els.find(isLink) || null;
      const leaf = findSmallestWithText(els.concat(row), label) || row;
      return { row, label, leaf, url: link ? realLink(link.href) : null };
    }
    return null;
  };

  // v0.2.105 — hand the user's click to a hidden native entry that carries NO link. Kevin's
  // finding (2026-10-09, George Leonard Pearson GCBF-WX6): the native MyHeritage search URL
  // carries a csrf_token (timestamped) + fspid + utm partner tags — FamilySearch builds the
  // partner link AT CLICK TIME, so the row is a control, not an <a href>, and nothing can be
  // read off it. A synthetic click on the LABEL LEAF bubbles through every ancestor — the
  // <a>/<button> React listens on (and an <a href>'s activation) — so FS runs its own handler
  // with its own URL, inside the user's click (transient activation keeps window.open
  // allowed; display:none does not stop a dispatched click). Returns false when the entry is
  // gone — the caller then opens its reserve URL.
  FSSE.clickNative = function clickNative(entry) {
    const target = entry && (entry.leaf || entry.row);
    if (!target || !target.isConnected || typeof target.click !== "function") return false;
    target.click();
    return true;
  };

  // Hide (hide = true) or restore a native entry our menu replaces. Hidden with an INLINE
  // display:none (no FS CSS can override it) plus a marker that cloneRow strips: the hidden
  // row stays the anchor our menu row AND every menu entry are cloned from, and the clones
  // must not inherit the hiding. React may re-render the entry as a fresh element — or reset
  // its style — at any time, so content.js re-applies this every tick (idempotent; returns
  // true when something changed, for the log). v0.2.133: the marker carries `by` — the id of
  // the site hiding the row — so a site switched off in the settings can restore its native
  // entry by marker alone, without finding the panel first (`[data-fsse-hidden="mh-records"]`).
  FSSE.setNativeHidden = function setNativeHidden(row, hide, by) {
    if (!row || !row.style) return false;
    const marked = row.getAttribute("data-fsse-hidden") != null;
    let changed = false;
    if (hide) {
      if (!marked) (row.setAttribute("data-fsse-hidden", by || "1"), (changed = true));
      if (row.style.display !== "none") ((row.style.display = "none"), (changed = true));
    } else if (marked) {
      row.removeAttribute("data-fsse-hidden");
      row.style.display = "";
      changed = true;
    }
    return changed;
  };

  // Clone an anchor row (native or previously injected) into a fresh row showing `text`,
  // with FamilySearch's navigation stripped, our markers cleared, and an optional custom
  // icon. Returns { clone, labelLeaf }. Not inserted and no click handler yet.
  // The label leaf of a clone. When the anchor is one of OUR rows, the leaf is taken by the
  // anchor's own label PATH (v0.2.93 — an injected menu row reads "FreeBMD ▾" while open, so a
  // text match on the "FreeBMD ▸" it was anchored on failed, and every GRO entry rebuilt while
  // FreeBMD was open got the fallback: the old label kept AND the entry text appended, flush
  // left — Kevin's Labs screenshot 2026-09-21); otherwise the smallest element whose text is
  // the label, either caret accepted.
  const CARET_RE = /\s[▸▾]$/;
  function labelLeafIn(clone, anchorRow, label) {
    const known = anchorRow && anchorRow._fsseLabelLeaf;
    if (known === anchorRow) return clone;
    if (known) {
      const path = [];
      for (let n = known; n && n !== anchorRow; n = n.parentElement) {
        const i = n.parentElement ? Array.prototype.indexOf.call(n.parentElement.children, n) : -1;
        if (i < 0) {
          path.length = 0;
          break;
        }
        path.unshift(i);
      }
      let node = path.length ? clone : null;
      for (const i of path) node = node && node.children ? node.children[i] || null : null;
      if (node) return node;
    }
    const els = deepElements(clone).concat(clone);
    const variants = [label];
    if (CARET_RE.test(label)) variants.push(label.replace(CARET_RE, (m) => (m.endsWith("▸") ? " ▾" : " ▸")));
    for (const v of variants) {
      const leaf = findSmallestWithText(els, v);
      if (leaf) return leaf;
    }
    return null;
  }
  FSSE._labelLeafIn = labelLeafIn; // tests/layout.test.js

  function cloneRow(anchorRow, site, label, text) {
    const clone = anchorRow.cloneNode(true);
    clone.removeAttribute("data-fsse-id"); // the anchor may itself be an injected row
    clone.removeAttribute("data-fsse-item");
    // v0.2.101: the anchor may be the native entry our menu replaces and therefore HIDES
    // (inline display:none + marker, see FSSE.setNativeHidden) — the clone must show.
    if (clone.getAttribute("data-fsse-hidden") != null) {
      clone.removeAttribute("data-fsse-hidden");
      clone.style.display = "";
    }
    // Located BEFORE the icon swap below (a prepended icon would shift the label's path).
    const labelLeaf = labelLeafIn(clone, anchorRow, label);

    // Strip native navigation: the row (or a descendant) may be an <a href>.
    if (clone.tagName === "A") clone.removeAttribute("href");
    clone.querySelectorAll("a[href]").forEach((a) => a.removeAttribute("href"));

    // Icon: by default keep the cloned native logo of the anchor entry. Only swap in a custom
    // icon if the site provides one. `icon` may be a FUNCTION of the matched anchor label, so a
    // site can keep the native logo when cloning a FamilySearch row but bring its own when the
    // anchor fell back to an Ancestry row (whose logo would be wrong on a FamilySearch entry).
    const iconPath = site && (typeof site.icon === "function" ? site.icon(label) : site.icon);
    // v1.0.0: the URL comes from the load-time cache (FSSE.assetUrl above) — chrome.runtime.getURL
    // throws in a tab whose content script an update has orphaned; with no URL to hand, the clone
    // keeps the anchor's native logo rather than failing the whole row.
    const iconSrc = iconPath ? FSSE.assetUrl(iconPath) : null;
    if (iconSrc) {
      const oldIcon = clone.querySelector("img, svg");
      const img = document.createElement("img");
      img.src = iconSrc;
      img.alt = "";
      // Match the RENDERED size of the anchor's own icon — the clone isn't laid out yet, so
      // measure the original in the DOM; fall back to the clone's attributes, then 24.
      const ref = anchorRow.querySelector("img, svg");
      const rect = ref ? ref.getBoundingClientRect() : null;
      img.width = Math.round(rect ? rect.width : 0) || parseInt(oldIcon?.getAttribute("width"), 10) || 24;
      img.height = Math.round(rect ? rect.height : 0) || parseInt(oldIcon?.getAttribute("height"), 10) || 24;
      if (oldIcon) {
        if (oldIcon.getAttribute("class")) img.setAttribute("class", oldIcon.getAttribute("class"));
        oldIcon.replaceWith(img);
      } else {
        clone.prepend(img);
      }
    }

    // Replace the label text.
    if (labelLeaf) labelLeaf.textContent = text;
    else clone.appendChild(document.createTextNode(" " + text));

    clone.style.cursor = "pointer";
    clone.setAttribute("role", "link");
    clone._fsseLabelLeaf = labelLeaf; // lets a row cloned FROM this one find the label by path
    return { clone, labelLeaf };
  }
  FSSE._cloneRow = cloneRow; // tests/layout.test.js (the hidden-anchor case)

  // Open a search in a new tab — or, for a site with a `tab` name (v0.2.77: GRO and FreeBMD,
  // Kevin's ask after a worklist session piled up search tabs), in ONE named tab that every
  // later search of that site reuses: window.open with a target name navigates the existing
  // tab of that name instead of adding another. Such opens carry no `noopener` — the tab keeps
  // its window name across cross-origin navigations only while it still has an opener (HTML
  // spec: an auxiliary browsing context with a non-null opener keeps its target name). When
  // the new URL differs from the tab's current one only by its #fsse fragment, the browser
  // does a fragment navigation (no load); the fill scripts listen for hashchange and reload
  // the form themselves.
  function openUrl(url, site) {
    const name = site && site.tab;
    if (!name) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const w = window.open(url, name);
    try {
      if (w) w.focus(); // bring the reused tab forward (Chrome honours this on a user click)
    } catch (_) {}
  }
  FSSE.openUrl = openUrl; // v0.2.80: linker.js reuses it for the one Google Maps tab

  function place(anchorRow, site, row) {
    if (site.position === "before") {
      anchorRow.before(row);
      return;
    }
    // "After" an injected MENU row means after its panel div too — the panel must stay the
    // row's immediate next sibling (content.js removes any `-menu` panel that isn't; v0.2.50
    // fix: the GRO row anchored after "FreeBMD ▸" landed between the FreeBMD row and its
    // panel, and the stray-panel cleanup then deleted the panel on every tick).
    let at = anchorRow;
    const id = anchorRow.getAttribute && anchorRow.getAttribute("data-fsse-id");
    const next = anchorRow.nextElementSibling;
    if (id && next && next.getAttribute && next.getAttribute("data-fsse-id") === id + "-menu") at = next;
    at.after(row);
  }

  // Clone an anchor row into a new entry for `site`, wired to open its search URL.
  // Reads the person data lazily (FSSE.currentPerson) at click time, so the row can be
  // injected before the page's vitals have been scraped.
  FSSE.injectRow = function injectRow(anchorRow, site, label) {
    const { clone } = cloneRow(anchorRow, site, label, site.label);
    clone.setAttribute("data-fsse-id", site.id);
    clone.setAttribute("title", FSSE.wrapTip(site.tooltip || site.label));
    clone.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const person = FSSE.currentPerson || {};
        const opts = { shift: e.shiftKey };
        if (e.shiftKey) {
          // Advance the cycle so repeated Shift+clicks rotate through multiple married names.
          FSSE._cycle = FSSE._cycle || {};
          opts.cycle = FSSE._cycle[site.id] || 0;
          FSSE._cycle[site.id] = opts.cycle + 1;
        }
        // v1.0.2: a site may ask before opening — confirmText(person, opts) returns the question
        // or null (the Labs-experiment Temple row asks when the experiment is off, because the
        // click then goes through FamilySearch's own opt-in page). A declined dialog opens
        // nothing, and so does a buildUrl that returns nothing.
        if (typeof site.confirmText === "function") {
          const q = site.confirmText(person, opts);
          if (q && !(typeof window !== "undefined" && typeof window.confirm === "function" && window.confirm(q))) {
            FSSE.log("not opening", site.id, "— declined at the confirm dialog");
            return;
          }
        }
        const url = site.buildUrl(person, opts);
        if (!url) return;
        FSSE.log("opening", site.id, "shift:", opts.shift, "cycle:", opts.cycle, "url:", url);
        // sameTab (v0.2.65): imitate a native link — navigate this tab (the Temple links,
        // like the native "Ordinances Ready", stay in the tab; navigation also dismisses
        // the dropdown). Everything else opens a new tab as before.
        if (site.sameTab) location.assign(url);
        else openUrl(url, site);
      },
      true
    );

    place(anchorRow, site, clone);
    FSSE.log("injected row:", site.id, "after/before", label);
    return clone;
  };

  // Clone an anchor row into an expandable menu entry. Clicking the row toggles a panel
  // right below it listing `site.options(person)` → [{ group, label, url, tooltip }] as
  // cloned rows (logo hidden so they read as indented sub-items), grouped under small
  // headers. The list is (re)built from FSSE.currentPerson on each open — and while open,
  // whenever content.js reports fresher person data — so it's always content-aware.
  FSSE.injectMenu = function injectMenu(anchorRow, site, label) {
    const CLOSED = " ▸";
    const OPEN = " ▾";
    const { clone: row, labelLeaf } = cloneRow(anchorRow, site, label, site.label + CLOSED);
    row.setAttribute("data-fsse-id", site.id);
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", "false");
    row.setAttribute("title", FSSE.wrapTip(site.tooltip || site.label));

    const panel = document.createElement("div");
    panel.setAttribute("data-fsse-id", site.id + "-menu"); // removed with the rows on navigation
    panel.style.display = "none";

    let open = false;
    let lastKey = null;

    const setCaret = () => {
      if (labelLeaf) labelLeaf.textContent = site.label + (open ? OPEN : CLOSED);
      row.setAttribute("aria-expanded", String(open));
    };

    // Indent group headers so they line up with the entry text. First guess: the row label's
    // x-offset (usable before the panel is shown); once the panel is visible, alignHeaders()
    // re-measures against the FIRST ENTRY's label — the cloned rows lay out inside the panel
    // with a different left edge than the parent row, so the guess sat ~30px too far right
    // (v0.2.28, Kevin's ask).
    const textIndent = () => {
      if (!labelLeaf || !labelLeaf.getBoundingClientRect) return 0;
      const d = labelLeaf.getBoundingClientRect().left - row.getBoundingClientRect().left;
      return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
    };
    let headers = [];
    let firstEntryLeaf = null;
    const header = (text) => {
      const h = document.createElement("div");
      h.textContent = text;
      h.style.cssText =
        "font-size:0.72em;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.65;padding:0.7em 0 0.1em 0;";
      h.style.paddingLeft = textIndent() + "px";
      headers.push(h);
      return h;
    };
    // Footer (site.footer(person) → { text, url?, tooltip?, onClick? }): the attached-source
    // status line (v0.2.33), styled like a header but sentence-cased; clickable when it carries
    // a url (→ the person's Sources tab, same tab) or an onClick callback (no site sends one since v0.2.135 dropped the in-page settings line).
    // Aligned with the headers.
    const footerDiv = (f) => {
      const div = header(f.text);
      div.style.textTransform = "none";
      div.style.letterSpacing = "normal";
      div.style.fontWeight = "400";
      div.style.paddingBottom = "0.6em";
      div.setAttribute("title", FSSE.wrapTip(f.tooltip || f.text));
      if (f.url || f.onClick) {
        div.style.cursor = "pointer";
        div.style.textDecoration = "underline";
        div.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (f.onClick) {
              FSSE.log("footer →", f.text);
              f.onClick();
            } else {
              FSSE.log("footer →", f.url);
              location.assign(f.url);
            }
          },
          true
        );
      }
      if (f.marker) div.setAttribute("data-fsse-footer", f.marker);
      return div;
    };
    const alignHeaders = () => {
      if (!open || !firstEntryLeaf || !headers.length) return;
      const d = firstEntryLeaf.getBoundingClientRect().left - panel.getBoundingClientRect().left;
      if (!Number.isFinite(d) || d <= 0) return; // not laid out (hidden) → keep the guess
      const px = Math.round(d) + "px";
      for (const h of headers) h.style.paddingLeft = px;
    };

    function rebuild() {
      const person = FSSE.currentPerson;
      let options = [];
      try {
        options = person ? site.options(person) || [] : [];
      } catch (err) {
        console.warn("[FSSE] options failed for", site.id, err);
      }
      let footer = null;
      try {
        footer = person && site.footer ? site.footer(person) : null;
      } catch (err) {
        console.warn("[FSSE] footer failed for", site.id, err);
      }
      const key = JSON.stringify([options, footer]);
      if (key === lastKey) return;
      lastKey = key;
      panel.textContent = "";
      headers = [];
      firstEntryLeaf = null;
      if (!options.length) {
        panel.appendChild(header(person ? "No searches apply to this person" : "Waiting for the person's details…"));
        return;
      }
      let group = null;
      for (const o of options) {
        if (o.group && o.group !== group) {
          group = o.group;
          panel.appendChild(header(group));
        }
        // Already-attached searches (o.attached = the matching source title, see sites.js /
        // sources.js) stay clickable but are dimmed and ticked — matching is by title, so a
        // "mentioned-in" record can look attached; hiding would cost real searches.
        const { clone: item, labelLeaf: itemLeaf } = cloneRow(anchorRow, null, label, (o.attached ? "✓ " : "") + o.label);
        if (!firstEntryLeaf && itemLeaf) firstEntryLeaf = itemLeaf;
        const icon = item.querySelector("img, svg");
        if (icon) icon.style.visibility = "hidden"; // keeps its width → acts as the indent
        item.setAttribute("data-fsse-item", site.id);
        if (o.attached) item.style.opacity = "0.45";
        item.setAttribute("title", FSSE.wrapTip(o.tooltip || o.label));
        item.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Shift+click opens the entry's alternate URL when it has one (v0.2.43: the same
            // search with the first given name only).
            const alt = e.shiftKey && o.altUrl;
            // v0.2.105: an entry standing in for a native row (o.nativeClick) hands the click
            // to that row — content.js keeps the live native entry on this menu row as
            // `_fsseNative` — so FamilySearch runs its own handler and builds its own URL
            // (Kevin: "let FamilySearch build the needed URL rather than assume"). Row gone
            // meanwhile → the entry's reserve URL opens instead.
            if (!alt && o.nativeClick && row._fsseNative && FSSE.clickNative(row._fsseNative)) {
              FSSE.log("opening", site.id, "→", o.label, `via the native "${row._fsseNative.label}" entry's own click`);
              return;
            }
            const target = alt ? o.altUrl : o.url;
            FSSE.log("opening", site.id, "→", o.label, alt ? "(alt)" : "", target);
            openUrl(target, site);
          },
          true
        );
        panel.appendChild(item);
      }
      if (footer && footer.text) panel.appendChild(footerDiv(footer));
      alignHeaders(); // no-op while the panel is hidden; the open handler re-runs it
      FSSE.log("menu built:", site.id, options.length, "options", options.filter((o) => o.attached).length, "attached");
    }

    row.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        open = !open;
        // Self-heal: if the page churn (or an older cleanup pass) detached the panel, put it
        // back in its required spot — immediately after this row — before showing it.
        if (open && !panel.isConnected) row.after(panel);
        if (open) rebuild();
        panel.style.display = open ? "" : "none";
        alignHeaders(); // panel is laid out now → measure the real entry-label offset
        setCaret();
      },
      true
    );
    // content.js calls this every tick; refreshes an OPEN panel when the person data changed.
    row._fsseRefresh = () => {
      if (open) rebuild();
    };

    place(anchorRow, site, row);
    row.after(panel);
    FSSE.log("injected menu:", site.id, "after/before", label);
    return row;
  };
})();
