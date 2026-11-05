// sources.js — attached-source awareness, DOM route (v0.2.33).
//
// The Details page only shows per-fact COUNTS ("Birth • 3 Sources"), never which sources are
// attached. The full list is rendered on the person's Sources tab
// (/tree/person/sources/<PID>), which our content-script pattern already covers. So: when the
// user visits that tab we scrape the rendered source titles (FS-attached records carry their
// collection title, e.g. "England and Wales Census, 1851"), cache them per PID, and the Records
// menu dims the searches whose collection is already attached (sites.js `recordOptions`,
// fs-collections.js `findAttached`). No API calls, no cookies — the only permission is
// `storage` (silent in Chrome). See CLAUDE.md "Sharing posture" for why the API route is out.
//
// Limits (by design): awareness exists only for people whose Sources tab has been opened at
// least once; matching is by title, so a "mentioned-in" record (a child's christening naming the
// parents) can look like the parent's own — entries are therefore DIMMED, never hidden.

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  FSSE.isSourcesTab = function isSourcesTab() {
    return /\/tree\/person\/sources\//i.test(location.pathname);
  };

  FSSE.sourcesTabUrl = function sourcesTabUrl(pid) {
    const lang = (location.pathname.match(/^\/([a-z]{2})\//) || [])[1] || "en";
    return `${location.origin}/${lang}/tree/person/sources/${pid}`;
  };

  // Words that make a leaf text look like a record-collection title (used by the loose pass
  // below; the tight pass keys on record links). A 4-digit year is required as well.
  const TITLE_HINT_RE =
    /\b(census|register|index|indexes|births?|baptisms?|christenings?|marriages?|deaths?|burials?|grave|probate|records?|registration)\b/i;
  const YEAR_RE = /\b(1[5-9]\d\d|20[0-2]\d)\b/;
  // A collection title very often ends in a year RANGE ("Australia, Electoral Rolls, 1903-1980")
  // even when it has no hint word — Edward Cummings L81M-MJX (35 sources, 14 captured) showed
  // how many Ancestry-style titles the hint rule alone leaves behind.
  const YEAR_RANGE_END_RE = /\b(1[5-9]\d\d|20[0-2]\d)\s*[-–]\s*(1[5-9]\d\d|20[0-2]\d)\s*$/;

  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

  // FamilySearch titles an attached record `<Principal>, "<Collection>"` — and, when the person
  // is NOT the record's principal, `<Person> in entry for <Principal>, "<Collection>"` (seen live
  // 2026-09-03 on John Stephen Hind GJY7-54S: his SON's christening, "John Stephen Hind in entry
  // for Stephen Hind, "England, Births and Christenings, 1538-1975""). A census reads `<Person> in
  // household of <Head>, "…"` — that IS the person's own record. Returns { title, collection,
  // mentioned, principal }: `collection` = the quoted part (null for user-typed titles such as
  // "Birth Registration for John … born on 8 Oct 1913 at Birkenhead"), `mentioned` = true for the
  // "in entry for" form — such a source must not dim the person's OWN search for that collection.
  FSSE.parseSourceTitle = function parseSourceTitle(text) {
    const title = clean(text);
    const m = title.match(/^(.*?),?\s*[“"]([^“”"]+)[”"]\s*$/);
    const collection = m ? clean(m[2]) : null;
    const head = m ? clean(m[1]) : title;
    const entry = head.match(/^(.*?)\s+in entry for\s+(.+)$/i);
    const household = head.match(/^(.*?)\s+in household of\s+(.+)$/i);
    let principal = head;
    let mentioned = false;
    if (entry) {
      principal = clean(entry[2]);
      mentioned = true;
    } else if (household) {
      principal = clean(household[1]);
    }
    return { title, collection, mentioned, principal: principal || null };
  };

  // "Sources (12)" / "Sources 12" → 12. Only the Sources-first form: the Vitals rows render
  // "3 Sources" leaves per fact, which are NOT the total.
  function sourcesCount() {
    let count = null;
    for (const el of FSSE.deepElements(document)) {
      if (el.childElementCount) continue;
      const t = clean(el.textContent);
      const m = t.match(/^Sources\s*[(:]?\s*(\d+)\)?$/i);
      if (m) {
        count = Number(m[1]);
        break;
      }
    }
    return count;
  }
  FSSE.sourcesCount = sourcesCount;

  // Scrape the rendered Sources tab → { titles: [{title, collection, mentioned, principal, via}],
  // count } or null off that tab. Live finding (2026-09-03): the titles are plain TEXT leaves, not
  // links — pass (1), the text of any record link (ark:/61903/…), is kept as a cheap extra; pass
  // (2) takes every short leaf that is FS-shaped (`…, "Collection"` → via "fs") or that reads
  // like a collection title — a hint word plus a year (user-typed titles, via "text"). The DIAG
  // log (once per distinct result) shows what was found so the heuristics can be tuned.
  // v0.2.92 — the LABS person page has no Sources tab: the sources are listed on the DETAILS
  // page itself, in a right-hand column under a "Sources (N)" heading, one card per source
  // ("1850 • Baptism • 2 Tags" + the FS-shaped title + a View button — Betsy Bellwood
  // KHW2-6TP, Kevin's screenshots 2026-09-21). So the scrape also runs off the Sources tab
  // whenever the page shows that heading AND at least one FS-shaped title; awareness then needs
  // no separate visit. A card's "year • type • N Tags" line is never a title (CARD_META_RE).
  FSSE.scrapeSources = function scrapeSources() {
    const onTab = FSSE.isSourcesTab();
    const found = new Map(); // title → via
    for (const a of document.querySelectorAll('a[href*="ark:/61903/"]')) {
      const t = clean(a.textContent);
      if (t.length >= 6 && t.length <= 160) found.set(t, "link");
    }
    const leaves = [];
    const anchors = []; // elements holding a known-good title → each may locate the source list
    let heading = false; // a "Sources (N)" leaf — the Labs column's heading (also the legacy tab label)
    for (const el of FSSE.deepElements(document)) {
      if (el.childElementCount) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      const t = clean(el.textContent);
      if (SOURCES_HEADING_RE.test(t)) heading = true;
      if (!titleLike(t)) continue;
      leaves.push(t);
      if (found.has(t)) continue;
      if (FS_SHAPED_RE.test(t)) {
        found.set(t, "fs");
        anchors.push({ el, via: "fs" });
      } else if ((TITLE_HINT_RE.test(t) && YEAR_RE.test(t)) || YEAR_RANGE_END_RE.test(t)) {
        found.set(t, "text");
        anchors.push({ el, via: "text" });
      }
    }
    anchors.sort((a, b) => Number(b.via === "fs") - Number(a.via === "fs")); // FS-shaped titles first
    // Off the Sources tab, only the Labs Details page (heading + an FS-shaped title) qualifies.
    if (!onTab && !(heading && [...found.values()].includes("fs"))) return null;
    // Pass 3 — structural: each source renders as a <button> holding the event year + the title
    // (Edward Cummings DIAG, 2026-09-03: "<button> 1876Edward Cummins, "Australia, Births and
    // Baptisms…""). From a known-good title climb to the list that holds the most such cards and
    // read EVERY card's title — including titles with no year at all ("Obituary").
    // v0.2.92: the list is sought from EVERY known-good title (the first dozen), and the one
    // holding the MOST titled cards wins — a hints panel's single FS-shaped title elsewhere on
    // the Labs Details page must not steer the search to the page's top-level layout.
    let list = null;
    let cardTitlesList = [];
    const seenLists = new Set();
    for (const a of anchors.slice(0, 12)) {
      const cand = findCardList(a.el);
      if (!cand || seenLists.has(cand)) continue;
      seenLists.add(cand);
      const ts = [...cand.children].map((c) => cardTitle(c)).filter(Boolean);
      if (ts.length > cardTitlesList.length) {
        list = cand;
        cardTitlesList = ts;
      }
    }
    const anchorLeaf = anchors.find((a) => list && list.contains && list.contains(a.el)) || anchors[0] || null;
    // Titled cards only (the list also holds header rows). Several sources can share one title
    // (five electoral-roll entries) — the title map de-duplicates them, which is right for
    // collection matching: 35 cards → 19 distinct titles on Edward Cummings.
    // v0.2.115 — the list is authoritative ONLY when it accounts for the FS-shaped titles pass 2
    // saw: on Nathaniel Eli Trew 9JWT-KH9 (Kevin's DIAG, 2026-10-26) the climb had stopped at one
    // card's own wrapper, read "Review Attachments" as a second card and then pruned the six
    // real FS-shaped titles — the Find a Grave one among them. A list holding fewer than half of
    // them is not the list; pass 2's titles then stand as they are.
    const fsLeaves = [...found.values()].filter((v) => v === "fs").length;
    const credible = cardTitlesList.length >= 2 && cardTitlesList.length * 2 >= fsLeaves;
    if (credible) {
      // The list is authoritative: anything passes 1–2 picked up OUTSIDE it (an expanded card's
      // citation, a hints panel, a note) is not a source title — drop it; add every card's title.
      const cardTitles = new Set(cardTitlesList);
      for (const t of [...found.keys()]) if (!cardTitles.has(t)) found.delete(t);
      for (const t of cardTitles) if (!found.has(t)) found.set(t, "card");
    }
    const titles = [...found].map(([title, via]) => ({ ...FSSE.parseSourceTitle(title), via }));
    const count = sourcesCount();
    diag(titles, count, leaves, anchorLeaf && anchorLeaf.el, cardTitlesList.length, list, onTab);
    return { titles, count, rendered: credible ? cardTitlesList.length : null, where: onTab ? "tab" : "details" };
  };
  const SOURCES_HEADING_RE = /^Sources\s*\(\d+\)$/i;
  // The Labs source card's first line: "1850 • Baptism • 2 Tags" / "OTHER • 4 Tags".
  const CARD_META_RE = /^(?:\d{4}\s*•\s*)?[A-Za-z][A-Za-z ]*\s*•\s*\d+\s*Tags?$/i;
  // A citation / note leaf inside a card — never its title ("2026), Nathaniel Eli Trew." is the
  // tail of a citation an italic site name split across leaves — Kevin's 9JWT-KH9 DIAG).
  const CITATION_RE = /\bdatabase\b|https?:\/\/|\baccessed\b|\b(UTC|GMT)\b|^\d{4}\)/i;
  // v0.2.115 — page chrome inside a card, never its title: an EXPANDED card's action links,
  // field labels and section headings, and the Detail View's "Attached To:" / "Death • <coll>"
  // lines (Kevin's Nathaniel Eli Trew 9JWT-KH9 DIAG, 2026-10-26: "Review Attachments" and
  // "Attached To:" had been read as card titles).
  const UI_LEAF_RE =
    /^(view|edit|detach|review attachments?|\+?\s*add (a )?(tag|source|note)s?|attached to\b.*|tags?:?|source date:?|web page\b.*|where the record is found\b.*|indexed information:?|reason:?|notes?:?|citation:?|(detail|list|table) view|show (more|all)|load more|(birth|death|burial|marriage|christening|baptism|event|source) (date|place):?|(name|sex|gender|birth|christening|baptism|death|burial|marriage|residence|other)\s*•.*)$/i;
  // How much a leaf looks like a SOURCE TITLE: FS-shaped (`…, "Collection"`) beats a collection
  // name carrying a hint word / year range, which beats any other title-like text; ties → the
  // longer. (Detail View splits a title into "Nathaniel Eli Trew" + "Find a Grave Index" — the
  // collection must win, not the name; before v0.2.115 the longest leaf won outright.)
  const titleScore = (t) => (FS_SHAPED_RE.test(t) ? 3 : TITLE_HINT_RE.test(t) || YEAR_RANGE_END_RE.test(t) ? 2 : 1);
  const bestTitle = (ts) => ts.reduce((a, b) => (titleScore(b) > titleScore(a) || (titleScore(b) === titleScore(a) && b.length > a.length) ? b : a));
  const titleCandidate = (t) => titleLike(t) && !UI_LEAF_RE.test(t) && !CITATION_RE.test(t) && !/[,:;]$/.test(t);

  // Source TAGS (which facts a source supports: Name, Birth, Death…) are not in the collapsed
  // row. v0.2.38 DIAG probes whether the expanded / "Detail View" card shows them: the words
  // FamilySearch uses for taggable facts, matched against whole leaves.
  const TAG_WORD_RE =
    /^(name|sex|gender|birth|christening|baptism|death|burial|cremation|marriage|divorce|residence|occupation|military|military service|immigration|naturalization|religion|education|other|stillbirth|tagged|tags|tagged events?|attached to)\b[:]?\s*(.{0,80})?$/i;

  // A leaf that could be a source title: some letters, sane length, and not a bare date/lifespan
  // ("1876", "12 May 1876", "1842–1922" — the page header's lifespan was captured as a title once).
  const FS_SHAPED_RE = /[“"][^“”"]{6,}[”"]\s*$/;
  // "1876" · "12 May 1876" · "November 15, 2014" (a card's created date) · "1842–1922" ·
  // "29 May 1842 – 14 April 1922" · "about 1876"
  const DATE = "(?:\\d{1,2}\\s+[A-Za-z]+\\s+\\d{4}|[A-Za-z]+\\s+\\d{1,2},\\s*\\d{4}|(?:about|abt\\.?|circa|c\\.)\\s*\\d{4}|\\d{4})";
  const BARE_DATE_RE = new RegExp(`^${DATE}(?:\\s*[-–]\\s*${DATE})?$`, "i");
  // Column headers of the source list render as list children too ("Created" — Edward's DIAG).
  const HEADER_WORD_RE = /^(created|modified|title|date|type|events?|sort(\s+by)?|actions?|reason|notes?|tags?)$/i;
  function titleLike(t) {
    return (
      t.length >= 6 && t.length <= 160 && /[A-Za-z]{3}/.test(t) && !BARE_DATE_RE.test(t) && !HEADER_WORD_RE.test(t) &&
      !CARD_META_RE.test(t) &&
      (/\s/.test(t) || /[,"“\d]/.test(t)) // a real title has ≥2 words or a comma / quote / digit
    );
  }

  function leafTexts(el) {
    const out = [];
    for (const d of FSSE.deepElements(el)) {
      if (d.childElementCount) continue;
      const t = clean(d.textContent);
      if (t) out.push(t);
    }
    return out;
  }

  // The title of one card: the longest title-like leaf inside its button (the button holds the
  // year + title; an expanded card's citation/notes live OUTSIDE it).
  function cardTitle(card) {
    // v0.2.115: EVERY button's leaves (the row button holds year + title; an icon button may
    // precede it), scored FS-shaped first and never page chrome; then — a Labs card has only a
    // "View" button — the card's own leaves. Citations / notes never qualify, so an expanded
    // legacy card can't promote its citation, its field labels or its indexed burial place.
    const buttons = card.tagName === "BUTTON" ? [card] : FSSE.deepElements(card).filter((d) => d !== card && d.tagName === "BUTTON");
    let ts = [];
    for (const b of buttons) ts.push(...leafTexts(b).filter(titleCandidate));
    if (!ts.length) ts = leafTexts(card).filter(titleCandidate);
    return ts.length ? bestTitle(ts) : null;
  }

  // Climb from a title leaf; the list is the ancestor whose direct children yield the MOST card
  // titles (≥ 2). Deeper wins ties, so a card's own [button, details] wrapper never beats the list.
  function findCardList(leaf) {
    let best = null;
    let bestN = 1;
    // 30 levels (12 until v0.2.115): the list view nests a card's row button eleven levels deep
    // and the list itself sat beyond the old limit on Nathaniel Eli Trew 9JWT-KH9 — the climb
    // then stopped at the card's own [row, action links] wrapper and took it for a 2-card list.
    for (let el = leaf.parentElement, i = 0; el && i < 30; el = el.parentElement, i++) {
      const kids = [...el.children];
      if (kids.length < 2) continue;
      const n = kids.filter((k) => cardTitle(k)).length;
      if (n > bestN) {
        best = el;
        bestN = n;
      }
    }
    return best;
  }

  FSSE._sourcesInternals = { titleLike, cardTitle, findCardList }; // node smoke tests (fake DOM)

  function diag(titles, count, leaves, cardLeaf, rendered, list, onTab) {
    if (!FSSE.DEBUG) return;
    // One card's FULL leaf list (the anchor's card, every leaf incl. anything outside the button)
    // and a tag-word census over all cards — re-logged whenever the card's text changes (e.g.
    // after switching the tab to Detail View or expanding the card).
    let cardDump = "";
    if (cardLeaf && list) {
      let card = cardLeaf;
      while (card.parentElement && card.parentElement !== list) card = card.parentElement;
      const cardLeaves = leafTexts(card).map((t) => t.slice(0, 120));
      const tagged = [...list.children].map((c) => leafTexts(c).filter((t) => TAG_WORD_RE.test(t)));
      const withTags = tagged.filter((x) => x.length).length;
      const sample = tagged.find((x) => x.length) || [];
      const views = [...new Set(leaves)].filter((t) => /^(detail|list|table)\s+view$/i.test(t));
      cardDump =
        `\nOne card's leaves (${cardLeaves.length}): ${cardLeaves.map((t) => JSON.stringify(t)).join(" · ")}` +
        `\nCards with tag-like leaves: ${withTags} of ${list.children.length}${sample.length ? ` — e.g. ${sample.map((t) => JSON.stringify(t)).join(", ")}` : ""}` +
        `\nView toggles on the page: ${views.join(" | ") || "(none found)"}`;
    }
    const sig = JSON.stringify([titles, count, rendered, cardDump]);
    if (sig === diag._lastSig) return;
    diag._lastSig = sig;
    const lines = titles.map((t) => `  [${t.via}${t.mentioned ? ", mentioned-in" : ""}] ${t.title}`);
    let msg = `DIAG sources ${onTab ? "tab" : "column (Labs Details page)"} (${FSSE.getFsid()}): count=${count == null ? "?" : count}, cards rendered=${rendered || "?"}, ${titles.length} title(s)\n${lines.join("\n") || "  (none)"}`;
    if (!titles.length) {
      // Nothing matched any pass → show the page's leaf texts so the patterns can be fixed.
      const uniq = [...new Set(leaves)].filter((t) => t.length >= 10).slice(0, 60);
      msg += `\nLeaf texts on the page (first ${uniq.length}):\n  ${uniq.join("\n  ")}`;
    } else if (count != null && titles.length < count) {
      // Fewer titles than sources: list the year-bearing leaves we did NOT take (candidate titles
      // the rules miss) and any "show more" control (pagination) so the gap can be explained.
      const taken = new Set(titles.map((t) => t.title));
      const docTitle = clean(document.title);
      const missed = [...new Set(leaves)].filter((t) => !taken.has(t) && t !== docTitle && (YEAR_RE.test(t) || FS_SHAPED_RE.test(t))).slice(0, 40);
      msg += `\nUncaptured title-like leaves (year-bearing or FS-shaped) (${missed.length}${missed.length === 40 ? "+" : ""}):\n  ${missed.join("\n  ") || "(none)"}`;
      const more = [...new Set(leaves)].filter((t) => /^(show|load|view|see)\s+(more|all)\b|more sources/i.test(t));
      msg += `\n"Show more" controls: ${more.join(" | ") || "(none found)"}`;
    }
    if (cardLeaf && !diag._chainLogged) {
      // Structure of one source card (once per page): the ancestor texts above a known title.
      diag._chainLogged = true;
      const chain = [];
      for (let el = cardLeaf.parentElement; el && chain.length < 16; el = el.parentElement) {
        chain.push(`<${el.tagName.toLowerCase()}> [${el.children.length} children] ${clean(el.textContent).slice(0, 160)}`);
      }
      msg += `\nCard ancestor chain above "${clean(cardLeaf.textContent).slice(0, 60)}":\n  ${chain.join("\n  ")}`;
    }
    msg += cardDump;
    FSSE.log(msg);
  }

  // ---------------------------------------------------------------------------------------------
  // Per-PID cache: { pid, titles: [{title, via}], count, scrapedAt } under "fsse.sources.<PID>".
  // chrome.storage.local (survives FS clearing its own site data); localStorage as a fallback.
  // ---------------------------------------------------------------------------------------------
  const KEY = (pid) => `fsse.sources.${pid}`;
  const hasChromeStorage = () => {
    try {
      return !!(globalThis.chrome && chrome.storage && chrome.storage.local);
    } catch (_) {
      return false;
    }
  };

  // v1.0.0: the cache is one key per person ever visited with a source list — keep it bounded.
  // After a save, the entries beyond CACHE_MAX are removed, oldest first (by scrapedAt; the person
  // just saved is never touched). Best effort: any failure leaves the cache as it was.
  const CACHE_MAX = 200;
  const CACHE_PREFIX = "fsse.sources.";
  function pruneCache(keepPid) {
    try {
      chrome.storage.local.get(null, (all) => {
        try {
          if (!all) return;
          const others = Object.keys(all)
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== KEY(keepPid))
            .map((k) => ({ k, at: (all[k] && all[k].scrapedAt) || 0 }));
          const excess = others.length + 1 - CACHE_MAX;
          if (excess <= 0) return;
          others.sort((a, b) => a.at - b.at);
          const drop = others.slice(0, excess).map((e) => e.k);
          chrome.storage.local.remove(drop, () => FSSE.log(`sources cache pruned: ${drop.length} oldest of ${others.length + 1}`));
        } catch (_) {
          /* best effort */
        }
      });
    } catch (_) {
      /* no storage / orphaned context — best effort */
    }
  }
  FSSE._pruneSourcesCache = pruneCache; // tests/release.test.js
  FSSE._SOURCES_CACHE_MAX = CACHE_MAX;

  FSSE.loadSources = function loadSources(pid) {
    if (!pid) return Promise.resolve(null);
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.get(KEY(pid), (res) => resolve((res && res[KEY(pid)]) || null));
        } catch (err) {
          console.warn("[FSSE] sources load failed", err);
          resolve(null);
        }
      });
    }
    try {
      const raw = localStorage.getItem(KEY(pid));
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (_) {
      return Promise.resolve(null);
    }
  };

  FSSE.saveSources = function saveSources(pid, rec) {
    if (!pid || !rec) return Promise.resolve();
    const value = { pid, titles: rec.titles || [], count: rec.count == null ? null : rec.count, scrapedAt: Date.now() };
    if (hasChromeStorage()) {
      return new Promise((resolve) => {
        try {
          chrome.storage.local.set({ [KEY(pid)]: value }, () => {
            resolve(value);
            pruneCache(pid);
          });
        } catch (err) {
          console.warn("[FSSE] sources save failed", err);
          resolve(value);
        }
      });
    }
    try {
      localStorage.setItem(KEY(pid), JSON.stringify(value));
    } catch (_) {
      /* quota / disabled storage — awareness simply stays off */
    }
    return Promise.resolve(value);
  };
})();
