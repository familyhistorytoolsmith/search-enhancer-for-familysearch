// linker.js — Source Linker place comparison (v0.2.80–81).
//
// On FamilySearch's Source Linker (/search/linker?ark=…&id=<PID>) the record's facts sit on
// the left and the tree person's on the right, and the linker flags a mismatch with a
// "Different" chip — but "Kingswood, Gloucestershire" (the 1901 census) vs "Warmley,
// Gloucestershire" (the tree) leaves the real question open: are they close enough to be the
// same person? (Kevin's ask, 2026-09-15.) This module appends a small "📍 compare" link after
// every place on the page; clicking one opens Google Maps with a pin on EACH place and the
// distance between them, in one reused Maps tab. A place with no counterpart of its kind on
// the other side gets a "📍 map" single-pin link instead.
//
// How places are found — by visible text and geometry, never FS's hashed class names:
//   1. TEXT NODES are read in document order (v0.2.81: Kevin's v0.2.80 screenshot proved the
//      values are bare text nodes beside <br>/label elements, not leaf elements — the leaf
//      scan saw the labels but never "1897" / "Kingswood, Gloucestershire", and took the next
//      text on the page instead: "4 Tags Automatically Added", the sibling cards, the panel
//      headers). Each text node is measured with a Range, so it has its own box.
//   2. A FACT LABEL text ("Birth", "Residence", "Death • 0 Sources" on the tree side, …)
//      starts a fact; the texts that follow it are its values ONLY while they sit directly
//      under the label (left edges aligned) or beside it on the same line — the first text
//      elsewhere ends the fact. Chips ("Different", "• 2 Sources", "ADD") are skipped, a date
//      is noted, and the first text that reads like a place (a comma, or any non-date text
//      right after the date, or the sole value of a place-bearing fact such as Birth) is the
//      fact's place. Hidden text (screen-reader copies, collapsed panels, closed menus —
//      the v0.2.80 phantom labels at 0,0) is ignored on both sides of the rule.
//   3. Side: a label carrying "• N Sources" is the tree's (the record never shows source
//      counts); otherwise the text's x-position against the viewport middle decides.
//   4. Pairing (v0.2.137 — by FACT and YEAR, not by height alone): a record place pairs with
//      a tree place of the SAME KIND of fact (Birth ↔ Birth, Census ↔ Residence, Death ↔
//      Death; birth ↔ christening and death ↔ burial as second choices) whose year agrees —
//      a residence / census is identified by its year, so the 1851 census meets the 1851
//      residence wherever it sits on the page and never the 1861 one; a vital a year or two
//      out still pairs (the record says 1848, the tree 1847). Years further apart pair only
//      when the two sit on ONE ROW (the linker lays a matched fact out as one row — record
//      left, tree right, labels within PAIR_PX — so FS's own matching vouches for them). The
//      v0.2.80–136 rule was the row alone, and two UNMATCHED rows stacked on opposite sides
//      at the same height paired by coincidence (Kevin's Charles Mansfield linker, 2026-10-30:
//      the record's Census 1851 against the tree's Death 1915 in Perth).
// Directions use travelmode=driving (v0.2.84 — Kevin: the walking times of v0.2.80–83 made
// the distances "seem so jarring"; the straight-line figure in the link is unaffected). A
// short place is completed from its
// partner's hierarchy before it is sent ("Kingswood, Gloucestershire" + "…, Gloucestershire,
// England, United Kingdom" → "Kingswood, Gloucestershire, England, United Kingdom").
//
// v0.2.82 — LOCATE, THEN OPEN BY COORDINATES. Even completed, "Kingswood, Gloucestershire"
// is two villages (Kevin's is beside Warmley in South Gloucestershire; Google picked the one
// near Wotton-under-Edge) and no wording settles it. So a compare click first locates BOTH
// places with OpenStreetMap's Nominatim (free, no key, CORS-enabled): every candidate that
// fits the components given is kept ("Gloucestershire" fits "South Gloucestershire"), the
// pair of candidates CLOSEST TO EACH OTHER wins — a genealogist's prior: one person's places
// lie near each other — Google Maps is opened by coordinates so the pins cannot be
// mis-resolved, and the straight-line distance is written into the link ("📍 1.1 mi").
// v0.2.138: a REGION candidate is measured by its bounding box, not its centre — a place
// inside it is 0 away ("London" is both Greater London and the square-mile City of London on
// the map; the City's centre is nearer Shoreditch, yet Shoreditch lies in Greater London) —
// and a boundary is shown under its everyday name (Nominatim's _place_name: "London").
// v1.0.1: THE STATED HIERARCHY BOUNDS THE NAMESAKES — when no namesake of the first
// component fits the rest of the place by address, the rest is located too and a namesake
// counts only inside that area or a few miles from it (Kevin's burial "LawnView Cemetery,
// Fox Chase, Philadelphia, Pennsylvania" had pinned the one "Lawnview Cemetery" the map
// knows in the US — a field in Oklahoma); a venue is then searched by its bare name inside
// the area (the map calls that cemetery "Lawnview Memorial Park"), and failing that the
// rest of the place stands in. See TAIL_NEAR_MI.
// Requests go out only on a click (the sharing posture; GEOCODE_ON_RENDER flips that),
// serialized ≥ 1 s apart (Nominatim's usage policy), cached per place for the session;
// any failure falls back to the name-based URL.
//
// Diagnostics (FSSE.DEBUG): `[FSSE] linker:` logs every place + pair (with x,y) on change,
// lists place-looking texts that no label claimed, dumps the structure around the first fact,
// and — when the linker has rendered but nothing was recognised — dumps every visible text
// with its position. A pasted log is what fixes the rules (the person-page scrapers grew the
// same way).

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  const LINKER_RE = /\/search\/linker\b/i;
  const MAPS_SITE = { id: "maps", tab: "fsse-maps" }; // one reused Google Maps tab (the v0.2.77 named-tab mechanism)
  const PAIR_PX = 40; // a matched row's two labels sit within a couple of px; be generous
  const ALIGN_PX = 24; // a fact's values are left-aligned with its label (or with the first value beside it)
  const BLOCK_PX = 160; // a fact block is a few lines tall; anything further down is another fact
  const FIRST_PX = 70; // a sole no-comma value ("Birth" → "Gloucestershire") must be on the next line or two
  const LINE_PX = 6; // "same line" tolerance
  const SCAN_MAX = 12; // texts examined after a label before giving up on it
  const BESIDE_PX = 400; // person page (v0.2.125): a value BESIDE its label sits within this of it — the Labs Sources column further right is another card

  // Fact labels the linker shows (record side bare, tree side with "• N Sources").
  const LABELS = [
    "Name", "Sex", "Gender", "Birth", "Christening", "Baptism", "Death", "Burial", "Cremation",
    "Marriage", "Residence", "Immigration", "Emigration", "Naturalization", "Naturalisation",
    "Military Service", "Occupation", "Age", "Race", "Relationship to Head", "Relationship",
    "Marital Status", "Event", "Arrival", "Departure", "Census", "Divorce", "Probate", "Title",
    "Religion", "Nationality", "Ethnicity", "Language", "Cause of Death", "Alternate Name",
    "Also Known As", "Physical Description", "Household", "Event Type", "Record Type",
    "Education", "Stillbirth", "Adoption", "Confirmation", "Blessing", "Ordination",
    "Retirement", "Graduation", "Annulment", "Separation", "Engagement", "Birthplace",
    "Death Place", "Burial Place", "Origin", "Description", "Notes", "Note",
    // v0.2.125 — the person page's Other Information types (FS's event + fact vocabulary) and
    // the census record's "Military Induction" (Norman Monnett's linker, 2026-10-28).
    "Apprenticeship", "Bar Mitzvah", "Bat Mitzvah", "Common Law Marriage", "Excommunication",
    "Mission", "Property", "Stillborn", "Caste", "Clan Name", "National ID", "Tribe Name",
    "Title of Nobility", "Affiliation", "Life Sketch", "Religious Affiliation", "Custom Event",
    "Custom Fact", "Other Event", "Other Fact", "Military Induction",
    // v0.2.128 — record-index fields the two INDEX_* shapes below do not cover.
    "Age at Death", "Relationship to Head of Household",
  ];
  // Facts whose value is a place even without a comma or a preceding date ("Birth" →
  // "Gloucestershire" on an 1841 census).
  const PLACE_FACTS = new Set([
    "birth", "christening", "baptism", "death", "burial", "cremation", "marriage", "residence",
    "immigration", "emigration", "naturalization", "naturalisation", "military service",
    "arrival", "departure", "census", "divorce", "probate", "stillbirth", "adoption",
    "confirmation", "blessing", "ordination", "graduation", "annulment", "engagement",
    "birthplace", "death place", "burial place", "origin",
    "apprenticeship", "bar mitzvah", "bat mitzvah", "common law marriage", "excommunication",
    "mission", "property", "stillborn", "custom event", "other event", "military induction",
  ]);
  // Facts whose value is NEVER a place, comma or not — "Marital Status" → "Single, without
  // dependents" (Norman Monnett's 1940 census, 2026-10-28: the comma alone had earned it a pin),
  // "Occupation" → "Farmer, retired", "Name" → "Monnett, Norman L". A generic "Event",
  // "Retirement" or "Separation" may still carry a place and stays on the comma rule.
  const NO_PLACE_FACTS = new Set([
    "name", "sex", "gender", "age", "race", "occupation", "education", "marital status",
    "relationship to head", "relationship", "title", "religion", "nationality", "ethnicity",
    "language", "cause of death", "alternate name", "also known as", "physical description",
    "household", "event type", "record type", "description", "notes", "note",
    "caste", "clan name", "national id", "tribe name", "title of nobility", "affiliation",
    "life sketch", "religious affiliation", "custom fact", "other fact",
    "age at death", "relationship to head of household",
  ]);
  const LABEL_RE = new RegExp("^(" + LABELS.join("|") + "|Other \\([^)]*\\))(?:\\s*•\\s*\\d+\\s*Sources?)?$", "i");
  // v0.2.128 — the Sources tab is a person page too, and an expanded source shows the record's
  // Indexed Information as label / value rows side by side ("Birthplace" · "York, Western
  // Australia, Australia", "Event Place" · …; Kevin's Nathaniel Eli Trew screenshot, 2026-10-28:
  // Birthplace pinned, Event Place did not — only the former was a label). FS's index vocabulary
  // is open-ended, so two SHAPES decide instead of a list: "<Fact> Place" / "<Relative>'s
  // Birthplace" / "Registration District" / "Place of <X>" is a place fact; a Title Case phrase
  // ending in Date / Year / Number / Name / Details / Identifier / Type … is never one — and is a
  // label all the same, so the field above it ends there ("Source Date", "Record Number"). A
  // person surnamed Place ("Francis Place") is not a label: the first word must be a fact word.
  const INDEX_PLACE_RE = /^(?:(?:Event|Birth|Christening|Baptism|Death|Burial|Cremation|Marriage|Residence|Immigration|Emigration|Naturalization|Naturalisation|Arrival|Departure|Military(?: Service)?|Probate|Divorce|Census|Registration|Enumeration|Previous Residence|Last Residence|Father['’]s|Mother['’]s|Spouse['’]s|Groom['’]s|Bride['’]s) (?:Place|Birthplace)|Registration District|Place of (?:Origin|Birth|Death|Burial|Marriage|Residence))(?: \((?:Original|Standardi[sz]ed)\))?$/i;
  const INDEX_NOPLACE_RE = /^[A-Z][\w'’.]*(?: (?:[A-Z][\w'’.]*|of|at|to|the|and|or|\([^)]*\))){0,4} (?:Date|Year|Number|No\.|Name|Details|Identifier|ID|Title|Type|Age|Code|Reference|Status)(?: \((?:Original|Estimated|Calculated|Standardi[sz]ed)\))?$/;
  const SOURCES_CHIP_RE = /^•?\s*\d+\s*Sources?$/i;
  const CHIP_RE = /^(•?\s*\d+\s*Sources?|Different|Same|\+?\s*Add|Edit|Details|Close|Detach|Attach|View|New|Match|Change|Remove|Delete|Info|Information|•)$/i;
  const STATUS_RE = /^(Deceased|Living|Single|Married|Widowed|Widow|Widower|Divorced|Unknown|Yes|No|Male|Female|None|N\/A|Head|Wife|Husband|Son|Daughter|Servant|Boarder|Lodger|Visitor)$/i;
  // Section headers and page chrome that are never places: "Children on Record (0)",
  // "Siblings in Tree (3)", "4 Tags Automatically Added", "SHOW ALL", "Reason to Attach Source".
  const NOT_PLACE_RE = /\(\d+\)$|\b(on Record|in Tree|Tags?|Automatically|Show All|Attach Source|Source Box|Your Family|Last Changed|Created|Modified|Reason)\b|^(Rural|Abroad|At Sea|Not Stated|Not Given|Not Recorded|Illegible|Blank|Same)$/i;
  // v0.2.131 — the 1940 US census asks where the person lived in 1935 and FS indexes the
  // enumerator's shorthand as a Residence Place: "Same Place" (the same town as in 1940),
  // "Same House". It means the record's OWN Event Place, so the pin follows that place; with
  // no Event Place on the card there is nothing to point at (Kevin's Ray Oliver McGahey
  // screenshot, 2026-10-28: the "Same Place" pin had opened Mumbai). SAME_PLACE_PX = how far
  // (CSS px) the record's Event Place may sit from the value, same side.
  const SAME_PLACE_RE = /^same\s+(place|house|home|address|location|city|town|village|county|state)$/i;
  const SAME_PLACE_PX = 800;
  // A place hierarchy — comma-separated parts with no colon or quote. The person page's Detail
  // View puts "Last Changed: June 9, 2024" right under every vital (v0.2.126, Kevin's Norman
  // Monnett screenshot: the death's "United States" had yielded its pin to that line).
  const PLACE_LINE_RE = /^[^,:"“”]+(?:,[^,:"“”]+)+$/;
  const MONTH_TOK = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?$/i;
  const DATE_QUAL = /^(about|abt|before|bef|after|aft|from|to|between|and|circa|ca|c|or|est|estimated|calculated|cal)\.?$/i;
  // "1897 Kingswood, Gloucestershire" rendered as ONE text (a newline inside it): date, then place.
  const DATE_PREFIX_RE = /^((?:\d{1,2}\s+[A-Za-z]{3,9}\.?\s+)?(?:[A-Za-z]{3,9}\.?\s+)?\d{4})\s+([A-Za-z].*)$/;
  // v0.2.125 — a burial / death date can carry FS's age note (Nathaniel Eli Trew 9JWT-KH9):
  // "13 Feb 1965 (aged 93–94)" inside the date's own text (AGE_TAIL_RE, stripped before the
  // date test) or as a text of its own beside the date (AGE_NOTE_RE, skipped like a chip —
  // never a place, never the end of the date line).
  const AGE_TAIL_RE = /\s*\(\s*(?:aged?|about|abt\.?|circa|c\.)\b[^)]*\)$/i;
  const AGE_NOTE_RE = /^\(\s*(?:aged?|about|abt\.?|circa|c\.)\b[^)]*\)$/i;
  const PERSON_RE = /\/tree\/person\//i; // /en/tree/person/details/<PID>, /tree/person/sources/<PID>, /tree/person/<PID>
  const RENDERED_RE = /^(Person of Record|Tree Person|Parents (on Record|in Tree)|Children (on Record|in Tree)|Not your family)/i;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "TITLE", "HEAD"]);

  const isLinkerPage = () => LINKER_RE.test(String((globalThis.location && location.pathname) || ""));
  const isPersonPage = () => PERSON_RE.test(String((globalThis.location && location.pathname) || ""));

  // "1897", "31 Mar 1901", "March 1901", "about 1896", "from 1901 to 1911", "1896–1901".
  function isDateText(t) {
    const s = String(t || "").trim().replace(AGE_TAIL_RE, "");
    if (!s || !/\d{4}/.test(s)) return false;
    const toks = s.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    return toks.every((tok) => /^\d{1,4}$/.test(tok) || /^\d{4}[-–]\d{4}$/.test(tok) || MONTH_TOK.test(tok) || DATE_QUAL.test(tok));
  }

  // "Birth" → {fact: "Birth", tree: false, placeFact: true, noPlace: false}; "Death • 0 Sources"
  // → tree: true; "Other (Marital Status) • 1 Source" → placeFact: false, noPlace: true (the
  // tree side wraps a non-standard fact in "Other (…)" — the fact inside decides). Null for
  // anything else.
  function parseLabel(t) {
    const s = String(t || "").replace(/\s+/g, " ").trim();
    const m = s.match(LABEL_RE);
    if (!m) {
      // v0.2.128 — a record-index field (the Sources tab's Indexed Information) by its shape.
      if (INDEX_PLACE_RE.test(s)) return { fact: s, tree: false, placeFact: true, noPlace: false, titled: false };
      if (INDEX_NOPLACE_RE.test(s)) return { fact: s, tree: false, placeFact: false, noPlace: true, titled: false };
      return null;
    }
    const fact = m[1].trim();
    const inner = (fact.match(/^Other \((.*)\)$/i) || [])[1] || fact;
    const key = inner.trim().toLowerCase();
    // titled (v0.2.127): a Custom / Other Event or Fact names itself on its first value line
    // ("Military Draft Registration") — that line is the title, never a place.
    return { fact, tree: /\d+\s*Sources?$/i.test(s), placeFact: PLACE_FACTS.has(key), noPlace: NO_PLACE_FACTS.has(key), titled: /^(custom|other) (event|fact)$/.test(key) };
  }

  // A value text that reads like a place. ctx: {placeFact, noPlace, afterDate, first} — noPlace
  // (the fact's value is never a place) wins over the comma rule.
  function looksLikePlace(t, ctx) {
    const s = String(t || "").trim();
    if (!/[a-z]{2,}/i.test(s) || s.length > 160) return false;
    if (isDateText(s) || CHIP_RE.test(s) || STATUS_RE.test(s) || parseLabel(s) || NOT_PLACE_RE.test(s)) return false;
    if (/[:"“”]/.test(s)) return false; // "Last Changed: June 9, 2024", an FS-shaped source title — never a place
    if (ctx && ctx.noPlace) return false;
    if (/,/.test(s)) return true;
    return !!(ctx && ctx.placeFact && (ctx.afterDate || ctx.first));
  }

  // Complete a short place from its partner's hierarchy: when the short one's last part
  // appears in the full one, append what follows it there. "Kingswood, Gloucestershire" +
  // "Warmley, Gloucestershire, England, United Kingdom" → "Kingswood, Gloucestershire, England,
  // United Kingdom"; no shared part → unchanged.
  function completePlace(short, full) {
    const parts = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
    const a = parts(short);
    const b = parts(full);
    if (!a.length || !b.length || a.length >= b.length) return a.join(", ");
    const last = a[a.length - 1].toLowerCase();
    const i = b.findIndex((p) => p.toLowerCase() === last);
    if (i < 0 || i === b.length - 1) return a.join(", ");
    return a.concat(b.slice(i + 1)).join(", ");
  }

  // Google Maps URLs (the documented Maps URLs API): directions between two places — both
  // pins, the route and its distance — or a single-pin search.
  function mapsUrl(a, b) {
    const enc = encodeURIComponent;
    if (b) return `https://www.google.com/maps/dir/?api=1&origin=${enc(a)}&destination=${enc(b)}&travelmode=driving`;
    return `https://www.google.com/maps/search/?api=1&query=${enc(a)}`;
  }

  const ours = (n) => !!(n && n.nodeType === 1 && n.getAttribute && n.getAttribute("data-fsse-map") != null);
  const rectOf = (el) => (el && el.getBoundingClientRect ? el.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 });
  const tagOf = (el) => String((el && el.tagName) || "").toUpperCase();

  // Every non-empty text node under root, in document order (into open shadow roots), as
  // {node, host, text}. Our own links, scripts/styles/svg and injected FSSE rows are skipped.
  // Also returns the links already on the page (`links`) for the stale-link sweep.
  function textUnits(root) {
    const units = [];
    const links = [];
    const visit = (node) => {
      if (!node) return;
      if (node.nodeType === 3) {
        const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
        if (text) units.push({ node, host: node.parentElement || node.parentNode, text });
        return;
      }
      if (node.nodeType === 1) {
        if (ours(node)) {
          links.push(node);
          return;
        }
        if (SKIP_TAGS.has(tagOf(node))) return;
        if (node.getAttribute && node.getAttribute("data-fsse-id") != null) return;
        if (node.shadowRoot) visit(node.shadowRoot);
      }
      for (const c of Array.from(node.childNodes || [])) visit(c);
    };
    visit(root);
    return { units, links };
  }

  // The text's own box (a Range around the node), falling back to its host's box. Cached.
  function measure(u) {
    if (u.rect) return u.rect;
    let r = null;
    try {
      if (globalThis.document && document.createRange) {
        const rg = document.createRange();
        rg.selectNodeContents(u.node);
        r = rg.getBoundingClientRect();
      }
    } catch (_) {
      r = null;
    }
    if (!r || (!r.width && !r.height)) r = rectOf(u.host);
    u.rect = { top: r.top || 0, left: r.left || 0, width: r.width || 0, height: r.height || 0 };
    return u.rect;
  }

  // Actually shown: the host has a real box (a screen-reader-only host is 1×1 or 0×0, a
  // display:none one 0×0) and is not hidden by visibility/opacity/content-visibility.
  function visible(u) {
    if (u.vis != null) return u.vis;
    const h = u.host;
    const r = rectOf(h);
    let ok = r.width >= 2 && r.height >= 2;
    if (ok && h && typeof h.checkVisibility === "function") {
      try {
        ok = h.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
      } catch (_) {
        ok = true;
      }
    }
    u.vis = ok;
    return ok;
  }

  // The next shown value text from `from` — chips, age notes and hidden copies skipped; null
  // when the next fact's label comes first.
  function nextValue(units, from) {
    for (let j = from, n = 0; j < units.length && n < SCAN_MAX; j++, n++) {
      const w = units[j];
      if (SOURCES_CHIP_RE.test(w.text) || CHIP_RE.test(w.text) || AGE_NOTE_RE.test(w.text)) continue;
      if (parseLabel(w.text)) return null;
      if (!visible(w)) continue;
      return w;
    }
    return null;
  }

  // Every fact place on the page: {node, host, place, fact, date, side, top, left, labelTop}.
  // mode "person" (v0.2.125 — the person page's Vitals / couple blocks / Other Information):
  // a value beside its label must sit within BESIDE_PX, every place is a single (`solo`).
  function scanPlaces(units, mode) {
    const person = mode === "person";
    const mid = (globalThis.innerWidth || 0) / 2;
    const places = [];
    const seen = new Set();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const lab = parseLabel(u.text);
      if (!lab || !visible(u)) continue;
      const L = measure(u);
      let alignLeft = L.left;
      let tree = lab.tree;
      let afterDate = false;
      let first = true;
      let titleSeen = !lab.titled; // a Custom Event's first line is its title (v0.2.127)
      let date = null;
      for (let j = i + 1, n = 0; j < units.length && n < SCAN_MAX; j++, n++) {
        const v = units[j];
        const t = v.text;
        if (parseLabel(t)) break; // the next fact
        if (SOURCES_CHIP_RE.test(t)) {
          tree = true; // "• 2 Sources" rendered as its own text
          continue;
        }
        if (CHIP_RE.test(t)) continue;
        if (AGE_NOTE_RE.test(t)) continue; // "(aged 93–94)" beside the date — part of the date line, never a value
        if (!visible(v)) continue; // screen-reader / collapsed copies are not part of the shown fact
        const R = measure(v);
        const sameLine = Math.abs(R.top - L.top) <= LINE_PX && R.left > L.left && (!person || R.left - L.left <= BESIDE_PX);
        const below = R.top > L.top + LINE_PX && R.top - L.top <= BLOCK_PX && Math.abs(R.left - alignLeft) <= ALIGN_PX;
        if (!sameLine && !below) break; // left this fact's block
        if (sameLine) alignLeft = R.left; // values beside the label: later lines align with them
        v.under = lab; // the label this value sits under (the diagnostics read it)
        if (!titleSeen) {
          // "Custom Event • 1 Source" → "Military Draft Registration" → "30 June 1942" → the
          // place: the first line names the event (Kevin's Norman Monnett screenshot, 2026-10-28
          // — the titles had taken the pins). Skipped; a place after it still counts, a sole
          // description line ("Social Program Correspondence") does not.
          titleSeen = true;
          first = false;
          continue;
        }
        let text = t;
        if (isDateText(t)) {
          date = t;
          afterDate = true;
          first = false;
          continue;
        }
        const dm = t.match(DATE_PREFIX_RE);
        if (dm && isDateText(dm[1])) {
          date = dm[1];
          text = dm[2];
          afterDate = true;
        }
        if (looksLikePlace(text, { placeFact: lab.placeFact, noPlace: lab.noPlace, afterDate, first: first && R.top - L.top <= FIRST_PX })) {
          let node = v.node;
          let host = v.host;
          let P = R;
          // v0.2.125: FS renders a place as TWO lines — the free text entered ("Karrakatta
          // Cemetery and Crematorium") over the standardised place ("Karrakatta, Nedlands City,
          // Western Australia, Australia"). The comma-hierarchy line is the one that geocodes, so
          // a comma-less place yields to a comma-bearing place directly under it.
          if (!/,/.test(text)) {
            const w = nextValue(units, j + 1);
            if (w) {
              const W = measure(w);
              if (W.top > R.top + LINE_PX && W.top - R.top <= FIRST_PX && Math.abs(W.left - R.left) <= ALIGN_PX && PLACE_LINE_RE.test(w.text) && looksLikePlace(w.text, { placeFact: lab.placeFact, noPlace: lab.noPlace })) {
                w.under = lab;
                text = w.text;
                node = w.node;
                host = w.host;
                P = W;
              }
            }
          }
          if (!seen.has(node)) {
            seen.add(node);
            const side = tree || (mid > 0 && P.left >= mid) ? "tree" : "record";
            places.push({ node, host, place: text, fact: lab.fact, date, side, top: P.top, left: P.left, labelTop: L.top, partner: null, solo: person });
          }
          break;
        }
        afterDate = false;
        first = false;
      }
    }
    return aliasSamePlace(places);
  }
  // v0.2.131: "Same Place" / "Same House" (a 1940 census's 1935 residence) → the record's own
  // Event Place: the nearest one on the same side, the plain field before "(Original)". None
  // within reach → the value is dropped and gets no pin. The link stays after the "Same Place"
  // text; `rawPlace` keeps what the record says for the tooltip and the log.
  const EVENT_PLACE_RE = /^event place( \((original|standardi[sz]ed)\))?$/i;
  function aliasSamePlace(places) {
    const out = [];
    const qualified = (q) => (/\(/.test(q.fact) ? 1 : 0); // "Event Place (Original)" after the plain one
    for (const p of places) {
      if (!SAME_PLACE_RE.test(p.place)) {
        out.push(p);
        continue;
      }
      const cands = places
        .filter((q) => q !== p && q.side === p.side && EVENT_PLACE_RE.test(q.fact) && !SAME_PLACE_RE.test(q.place) && Math.abs(q.top - p.top) <= SAME_PLACE_PX)
        .sort((a, b) => qualified(a) - qualified(b) || Math.abs(a.top - p.top) - Math.abs(b.top - p.top));
      if (!cands.length) continue;
      p.rawPlace = p.place;
      p.place = cands[0].place;
      out.push(p);
    }
    return out;
  }

  function rowDistance(a, b) {
    const byLabel = a.labelTop != null && b.labelTop != null ? Math.abs(a.labelTop - b.labelTop) : Infinity;
    return Math.min(byLabel, Math.abs(a.top - b.top));
  }

  // v0.2.137 — the fact FAMILIES that may be compared. "Census" on the record is the tree's
  // "Residence"; "Other (Emigration)" is the tree's wrapping of a non-standard fact; an
  // index-shaped "Residence Place" (the Sources-tab vocabulary) is a residence too. A fact
  // outside the table ("Event", "Event Place") has no family and pairs by the row alone.
  const FACT_FAMILY = {
    birth: "birth", christening: "christening", baptism: "christening",
    death: "death", burial: "burial", cremation: "burial", probate: "death",
    marriage: "marriage",
    residence: "residence", census: "residence",
    immigration: "migration", emigration: "migration", arrival: "migration", departure: "migration", naturalization: "migration", naturalisation: "migration",
    "military service": "military",
  };
  const RELATED_FAMILY = { birth: "christening", christening: "birth", death: "burial", burial: "death" };
  const YEAR_GAP_MAX = 2; // a vital's record year and tree year may be this far apart and still be one event
  function factFamily(fact) {
    const s = String(fact || "");
    const inner = (s.match(/^Other \((.*)\)$/i) || [])[1] || s;
    const key = inner.replace(/\s+/g, " ").trim().toLowerCase().replace(/ place( \(.*\))?$/, "");
    return FACT_FAMILY[key] || null;
  }
  // "1851" → [1851, 1851]; "from 1849 to 1853" / "1849–1853" → [1849, 1853]; no year → null.
  function yearSpan(date) {
    const ys = (String(date || "").match(/\b(1[5-9]\d\d|20\d\d)\b/g) || []).map(Number);
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  }
  const yearGap = (a, b) => (a[0] <= b[1] && b[0] <= a[1] ? 0 : Math.min(Math.abs(a[0] - b[1]), Math.abs(b[0] - a[1])));

  // May a record place and a tree place pair, and on what evidence? Returns {key, by} — key =
  // [family tier (same 0 / related 1 / no family 3), year tier, row distance], lower wins; by =
  // "year" (same kind, same year), "fact" (same kind, years a little apart), "row" (FS's own
  // row matching) — or null when the two may not pair.
  function pairScore(r, t) {
    const fr = factFamily(r.fact);
    const ft = factFamily(t.fact);
    const d = rowDistance(r, t);
    const aligned = d <= PAIR_PX;
    const yr = yearSpan(r.date);
    const yt = yearSpan(t.date);
    const gap = yr && yt ? yearGap(yr, yt) : null;
    if (!fr || !ft) return aligned && (gap === null || gap === 0) ? { key: [3, 0, d], by: "row" } : null; // a fact of no known kind: the row alone, and the years must not contradict it
    const famTier = fr === ft ? 0 : RELATED_FAMILY[fr] === ft ? 1 : -1;
    if (famTier < 0) return null; // a Census is never a Death, whatever the row
    if (gap === null) return aligned ? { key: [famTier, 1, d], by: "row" } : null; // no year on a side: FS's own row matching decides
    if (gap === 0) return { key: [famTier, 0, d], by: "year" };
    if (fr === "residence" || ft === "residence") return null; // a residence is identified by its year — another year is another event
    if (gap <= YEAR_GAP_MAX) return { key: [famTier, 1 + gap, d], by: "fact" }; // the record says 1848, the tree 1847
    if (aligned) return { key: [famTier, 5 + Math.min(gap, 20), d], by: "row" }; // far apart, but FS laid them out as one row
    return famTier === 1 ? { key: [famTier, 5 + Math.min(gap, 20), d], by: "fact" } : null; // a christening years after the birth still stands in for it
  }

  // Pair record places with tree places — best evidence first, each used once.
  function pairPlaces(places) {
    const rec = places.filter((p) => p.side === "record");
    const tr = places.filter((p) => p.side === "tree");
    const cands = [];
    for (const r of rec) for (const t of tr) {
      const s = pairScore(r, t);
      if (s) cands.push({ r, t, key: s.key, by: s.by });
    }
    cands.sort((x, y) => x.key[0] - y.key[0] || x.key[1] - y.key[1] || x.key[2] - y.key[2]);
    const used = new Set();
    const pairs = [];
    for (const c of cands) {
      if (used.has(c.r) || used.has(c.t)) continue;
      used.add(c.r).add(c.t);
      c.r.partner = c.t;
      c.t.partner = c.r;
      c.r.pairedBy = c.by;
      c.t.pairedBy = c.by;
      pairs.push([c.r, c.t]);
    }
    return pairs;
  }

  // v0.2.137: how a pair was chosen, for the tooltip — silent for the plain case (the same fact
  // on one row: Birth ↔ Birth), spoken when the facts differ or the year did the pairing.
  function pairNote(p) {
    if (!p || !p.partner) return "";
    const r = p.side === "record" ? p : p.partner;
    const t = p.side === "tree" ? p : p.partner;
    if (r.fact === t.fact && p.pairedBy !== "year") return "";
    const name = (q) => `${q.fact}${q.date ? ` ${q.date}` : ""}`;
    const how = p.pairedBy === "year" ? "the same kind of fact in the same year" : p.pairedBy === "fact" ? "the same kind of fact, the years close" : "FamilySearch's own row";
    return `Paired as ${how}: the record's ${name(r)} against the tree's ${name(t)}. `;
  }

  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const wrap = (t) => (FSSE.wrapTip ? FSSE.wrapTip(t) : t);

  // ---- Geocoding (v0.2.82) — see the header ---------------------------------------------
  const GEO_ENDPOINT = "https://nominatim.openstreetmap.org/search";
  const GEO_GAP_MS = 1100; // Nominatim: at most one request per second
  const GEO_TIMEOUT_MS = 8000;
  const GEO_STORE = "fsse.geo.v7"; // sessionStorage: place → candidates (v7: namesakes bounded by the rest of the place, venues rescued / stood in for — v6 entries could hold a namesake a thousand miles off; v6: a boundary carries its everyday name — "London", not "Greater London"; v5: county-level US places resolve to the county; v4: kind / rank / box for the region test; v3: name-form matching; v2 lacked the namedetails, v1 could hold streets)
  const SAME_PLACE_MI = 0.1; // a pair closer than this is one place spelt two ways
  // v0.2.130 — a REGION (a country, a state or province, a county) is FRAMED, not pinned: a pin
  // at its centroid lands on a field (Kevin: "United States" opened a field in Nebraska,
  // "Pennsylvania" a pasture), while Google's name search fits the map to the region and draws
  // its boundary. Nominatim's addresstype names the kind; place_rank ≤ 12 = county and above;
  // a bounding box wider than REGION_SPAN_MI counts too (an odd typing of a large area).
  const REGION_KIND_RE = /^(country|state|province|territory|region|state_district|county)$/;
  const REGION_RANK = 12;
  const REGION_SPAN_MI = 60;
  // v1.0.1 — THE STATED HIERARCHY BOUNDS THE NAMESAKES (Kevin's Frederick William Garber
  // KPHT-ZKX, 2026-11-03: the burial "LawnView Cemetery, Fox Chase, Philadelphia, Pennsylvania"
  // pinned a field in rural Oklahoma — the ONE "Lawnview Cemetery" OpenStreetMap knows in the
  // US, 1,300 mi from Philadelphia; the Rockledge cemetery beside Fox Chase is mapped as
  // "Lawnview Memorial Park", so the exact-name rule never saw it, and with a single candidate
  // the nearest-to-the-page's-other-places tie-break never ran). Now, when no namesake of the
  // first component fits the rest of the place by address, the REST is located too and a
  // namesake counts only inside that area (a region's bounding box) or within TAIL_NEAR_MI of
  // it — modern boundaries drift a few miles from the tree's historic counties, never a
  // thousand. A VENUE (a cemetery, church, hospital…) whose name finds nothing there is searched
  // again by its bare name INSIDE the area (Nominatim's viewbox + bounded), since the map often
  // knows it under another name; failing that, the rest of the place STANDS IN (a pin on Fox
  // Chase) and, for a venue, the click searches Google Maps by the full name instead — Google
  // knows most cemeteries and churches. Only a place that names its country (or a US state) is
  // bounded this way: without one the rest could resolve anywhere ("Shoreditch, Middlesex" —
  // Middlesex County, New Jersey).
  const TAIL_NEAR_MI = 15; // a namesake this far outside the stated area still counts (historic vs modern boundaries: Bristol is 8.5 mi south of today's Gloucestershire)
  const VENUE_NEAR_MI = 10; // a venue namesake / the bare-name search radius around the stated area
  const VENUE_WORDS = "cemetery|cemetary|cemeteries|churchyard|church|chapel|cathedral|abbey|priory|minster|kirk|meeting house|graveyard|grave yard|burial ground|burying ground|burial park|memorial park|memorial gardens?|memorial cemetery|crematorium|crematory|mausoleum|columbarium|necropolis|hospital|infirmary|asylum|workhouse|sanatorium|sanitarium|hospice|almshouse|poorhouse|poor house|rectory|vicarage|parsonage|manse";
  // A venue word ENDS the name ("LawnView Cemetery", "St Mary's Church", "Royal Infirmary") or
  // opens it as "<Church|Chapel|…> of …" — never in the middle, so "Church Stretton" is a town.
  const VENUE_RE = new RegExp(`(?:\\b(?:${VENUE_WORDS})\\s*$)|(?:^(?:church|chapel|cathedral|hospital|cemetery|abbey|priory)\\s+of\\b)`, "i");
  const VENUE_STRIP_RE = new RegExp(`\\b(?:${VENUE_WORDS}|and|of|the)\\b|&`, "gi");
  const isVenue = (first) => VENUE_RE.test(String(first || "").trim());
  // "LawnView Cemetery" → "LawnView"; "Church of St Mary" → "St Mary"; "Karrakatta Cemetery and
  // Crematorium" → "Karrakatta"; a name that is nothing but venue words is searched as it is.
  function bareVenueName(first) {
    const bare = String(first || "").replace(VENUE_STRIP_RE, " ").replace(/\s+/g, " ").trim();
    return bare.length >= 2 ? bare : String(first || "").trim();
  }
  const GEOCODE_ON_RENDER = false; // true = locate every pair as the linker renders (requests without a click)
  const COUNTRY_CODES = {
    "united kingdom": "gb", "great britain": "gb", england: "gb", scotland: "gb", wales: "gb", "northern ireland": "gb",
    "isle of man": "im", ireland: "ie", "united states": "us", usa: "us", "united states of america": "us",
    canada: "ca", australia: "au", "new zealand": "nz", germany: "de", france: "fr", netherlands: "nl", italy: "it",
    "south africa": "za", india: "in", jamaica: "jm", barbados: "bb",
    japan: "jp", china: "cn", "south korea": "kr", korea: "kr", philippines: "ph", "hong kong": "hk",
    singapore: "sg", malaysia: "my", indonesia: "id", "sri lanka": "lk", pakistan: "pk", bangladesh: "bd",
    mexico: "mx", brazil: "br", argentina: "ar", chile: "cl", spain: "es", portugal: "pt", poland: "pl",
    sweden: "se", norway: "no", denmark: "dk", finland: "fi", iceland: "is", switzerland: "ch",
    austria: "at", belgium: "be", luxembourg: "lu", czechia: "cz", "czech republic": "cz", hungary: "hu",
    greece: "gr", russia: "ru", ukraine: "ua", israel: "il", egypt: "eg", kenya: "ke", nigeria: "ng",
    "trinidad and tobago": "tt", bermuda: "bm", gibraltar: "gi", malta: "mt", cyprus: "cy",
    guernsey: "gg", jersey: "je",
  };

  const placeParts = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  // v0.2.132 — a US place written "<X>, <State>[, United States]" is a COUNTY in FamilySearch's
  // hierarchy (town, county, state, country), though a town of that name usually exists too
  // (Huntingdon borough is Huntingdon County's seat, and the map's first answer). Nominatim
  // names the county "<X> County" ("<X> Parish" in Louisiana, "<X> Borough" / "<X> Census
  // Area" in Alaska), so that form counts as the name for a county-kind result, and a
  // county-level place prefers the county when one is found (geocode).
  const US_STATES = new Set(["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia"]);
  const COUNTY_WORD_RE = /\s+(county|parish|borough|census area)$/i;
  function countyLevel(place) {
    const parts = placeParts(place).map(normComp);
    if (parts.length === 2) return US_STATES.has(parts[1]);
    if (parts.length === 3) return US_STATES.has(parts[1]) && COUNTRY_CODES[parts[2]] === "us";
    return false;
  }
  // The name Google frames for such a place: the county word added ("Huntingdon County,
  // Pennsylvania, United States" — a bare "Huntingdon, Pennsylvania" would frame the borough).
  const regionNameOf = (place) => {
    const parts = placeParts(place);
    return countyLevel(place) ? [parts[0] + " County"].concat(parts.slice(1)).join(", ") : place;
  };
  // "Co. Donegal" / "County Donegal" → "donegal"; periods dropped; case folded; v0.2.88:
  // accents stripped and Japanese administrative suffixes dropped ("Kōbe-shi" → "kobe",
  // "Hyōgo-ken" → "hyogo") — the tree's romanised standard names vs the map's plain ones.
  const JP_SUFFIX_RE = /[-\s](shi|ken|gun|ku|machi|mura|cho|fu|to|do)$/;
  const normComp = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/^(co|county)\s+/, "")
      .replace(JP_SUFFIX_RE, "")
      .replace(/\s+/g, " ")
      .trim();
  function countryCodeOf(place) {
    const parts = placeParts(place);
    for (let i = parts.length - 1; i >= 0; i--) {
      const cc = COUNTRY_CODES[normComp(parts[i])];
      if (cc) return cc;
    }
    // v0.2.132: a trailing US state names the country ("Huntingdon, Pennsylvania" — the linker's
    // record side often stops at the state); "Georgia" alone is left open (also a country).
    const last = parts.length ? normComp(parts[parts.length - 1]) : "";
    if (last && last !== "georgia" && US_STATES.has(last)) return "us";
    return null;
  }
  // Great-circle distance in miles.
  function haversine(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
  }
  const fmtMiles = (mi) => (mi < 10 ? mi.toFixed(1) : String(Math.round(mi))) + " mi";
  const fmtKm = (mi) => {
    const km = mi * 1.609344;
    return (km < 10 ? km.toFixed(1) : String(Math.round(km))) + " km";
  };

  // v0.2.83 — what a result IS: settlements and boundaries (rank 0) beat churches, houses and
  // named areas (rank 1); roads, railways and rivers (rank 2) are never a place. Kevin's
  // "Saint Georges, Shropshire" had resolved to "Saint Georges Place", a street in Shrewsbury.
  const PLACE_CATS = new Set(["place", "boundary"]);
  const NEVER_CATS = new Set(["highway", "railway", "waterway", "aeroway", "route"]);
  const candRank = (r) => {
    const cat = String(r.category || r.class || "").toLowerCase();
    if (PLACE_CATS.has(cat)) return 0;
    if (NEVER_CATS.has(cat)) return 2;
    return 1;
  };
  // Name forms worth asking for: Nominatim does not fold "Saint"/"St", and FS's standard
  // names keep a possessive s that OSM often drops ("Saint Georges" → "St Georges" → "St
  // George"). The original first; each later form only if the earlier ones found nothing.
  function nameVariants(first) {
    const out = [first];
    // Dedupe on a light key (case, periods, spacing) — NOT normComp, which folds "Kōbe-shi"
    // and "Kobe" together and would drop the plain form the geocoder needs to see.
    const key = (v) => String(v).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
    const push = (v) => {
      if (v && !out.some((x) => key(x) === key(v))) out.push(v);
    };
    const m = String(first).match(/^(saint|st\.?)\s+(.+)$/i);
    if (m) {
      const rest = m[2];
      const isSaint = /^saint$/i.test(m[1]);
      push(isSaint ? `St ${rest}` : `Saint ${rest}`);
      const stem = rest.replace(/['’]?s$/i, "");
      if (stem !== rest) {
        push(`St ${stem}`);
        push(`Saint ${stem}`);
      }
    }
    // v0.2.88: the plain form of an accented / suffixed name ("Kōbe-shi" → "Kobe").
    const plain = normComp(first);
    if (plain && plain !== String(first).toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim()) push(plain.replace(/\b\w/g, (c) => c.toUpperCase()));
    return out;
  }
  // A short readable label: name, then the town/city it sits in, then the county — each only
  // when it adds something ("St George, Bristol"; "Kingswood, Stroud, Gloucestershire").
  function candLabel(r, name) {
    const a = r.address || {};
    const out = [name];
    for (const v of [a.city || a.town || a.village || a.municipality, a.county || a.state_district || a.province]) {
      if (!v || typeof v !== "string") continue;
      const nv = normComp(v);
      if (out.some((x) => nv.includes(normComp(x)) || normComp(x).includes(nv))) continue;
      out.push(v);
    }
    return out.join(", ");
  }
  // Nominatim results → candidates {lat, lon, name, label, importance, rank, fit}. `names` =
  // the name forms that count as this place (first component + variants); `rest` = the later
  // components, each of which must appear in the result's address for `fit` (substring —
  // "Gloucestershire" fits "South Gloucestershire", "Donegal" fits "County Donegal").
  // Rank-2 results (roads) are dropped; nameless results too. v0.2.130: each candidate also
  // keeps `kind` (addresstype), `prank` (place_rank), `bbox`, `display` (display_name) and
  // `cc` — what the region test and the framed map need.
  const nameOf = (r) => String(r.name || String(r.display_name || "").split(",")[0] || "").trim();
  // v0.2.88: every name form the map knows ("神戸市", name:en "Kobe", …) counts as the name.
  const namesOf = (r) => {
    const out = [nameOf(r)];
    for (const v of Object.values(r.namedetails || {})) if (typeof v === "string") out.push(v);
    return out;
  };
  const addrText = (r) => {
    const vals = [];
    for (const [k, v] of Object.entries(r.address || {})) if (typeof v === "string" && !/^(country_code|postcode|ISO)/i.test(k)) vals.push(v);
    return normComp(vals.join(" | ") + " | " + (r.display_name || ""));
  };
  const usable = (r) => !!r && r.lat != null && r.lon != null && Number.isFinite(+r.lat) && Number.isFinite(+r.lon);
  // A Nominatim row as a candidate (filterCandidates and the v1.0.1 venue rescue share it).
  function candidateOf(r, name, rest, extra) {
    const text = addrText(r);
    const bb = Array.isArray(r.boundingbox) && r.boundingbox.length === 4 ? r.boundingbox.map(Number) : null;
    return Object.assign({
      lat: +r.lat, lon: +r.lon, name, label: candLabel(r, name), importance: +r.importance || 0, rank: candRank(r), fit: rest.every((c) => text.includes(c)), county: r.addresstype === "county",
      kind: typeof r.addresstype === "string" ? r.addresstype : null,
      prank: r.place_rank != null && r.place_rank !== "" && Number.isFinite(+r.place_rank) ? +r.place_rank : null,
      bbox: bb && bb.every(Number.isFinite) ? bb : null,
      display: typeof r.display_name === "string" ? r.display_name : null,
      cc: r.address && typeof r.address.country_code === "string" ? r.address.country_code : null,
    }, extra || {});
  }
  function filterCandidates(results, place, names) {
    const parts = placeParts(place);
    if (!parts.length) return [];
    const wanted = (names && names.length ? names : [parts[0]]).map(normComp);
    const rest = parts.slice(1).map(normComp);
    const out = [];
    for (const r of results || []) {
      if (!usable(r)) continue;
      const rank = candRank(r);
      if (rank > 1) continue;
      const county = r.addresstype === "county";
      const forms = namesOf(r);
      // v0.2.138: a boundary also answers to the everyday name of the place it stands for —
      // Nominatim's `_place_name` ("Greater London" is linked to the place node "London") —
      // and when THAT is the name asked for, it is the name shown ("in London", not "in
      // Greater London"). The square-mile City of London matches "London" only through its
      // short_name and keeps its own name, so the two stay told apart.
      const placeName = r.namedetails && typeof r.namedetails._place_name === "string" ? r.namedetails._place_name.trim() : "";
      const name = placeName && !wanted.includes(normComp(nameOf(r))) && wanted.includes(normComp(placeName)) ? placeName : nameOf(r);
      if (county) for (const n of forms.slice()) {
        const bare = n.replace(COUNTY_WORD_RE, ""); // v0.2.132: "Huntingdon County" answers to "Huntingdon"
        if (bare !== n) forms.push(bare);
      }
      if (!forms.some((n) => wanted.includes(normComp(n)))) continue;
      out.push(candidateOf(r, name, rest));
    }
    return out;
  }
  // The best tier that has anything: fits the county AND is a settlement → fits, any kind →
  // settlement namesake regardless of the county (modern boundaries — "Telford and Wrekin",
  // "City of Bristol" — rarely spell the tree's historic county) → any namesake.
  function bestTier(cands) {
    const tiers = [
      cands.filter((c) => c.fit && c.rank === 0),
      cands.filter((c) => c.fit),
      cands.filter((c) => c.rank === 0),
      cands,
    ];
    return tiers.find((t) => t.length) || [];
  }
  // v0.2.138 — the distance that CHOOSES among candidates. A region (a county, a city-sized
  // boundary) has no point to measure to: a place inside its bounding box is 0 away, one
  // outside is as far as the box's nearest edge; two regions whose boxes overlap are 0 apart.
  // Everything else is the great-circle distance between the points. Kevin's Charles
  // Mansfield linker (2026-10-30): "London" is BOTH Greater London and the square-mile City
  // of London on the map, and the City's CENTRE is nearer Shoreditch than Greater London's,
  // so the centroid rule chose the square mile and then judged Shoreditch "not in" it.
  const boxed = (c) => !!(c && c.bbox && isRegion(c));
  const clampTo = (c, pt) => {
    const [s, n, w, e] = c.bbox;
    const lat = Math.min(Math.max(pt.lat, s), n);
    let lon;
    if (w <= e) lon = Math.min(Math.max(pt.lon, w), e);
    else lon = pt.lon >= w || pt.lon <= e ? pt.lon : Math.abs(pt.lon - w) < Math.abs(pt.lon - e) ? w : e; // a box over the antimeridian
    return { lat, lon };
  };
  function boxDistance(a, b) {
    const ba = boxed(a);
    const bb = boxed(b);
    if (!ba && !bb) return haversine(a, b);
    if (ba && bb) {
      if (bboxContains(a, b) || bboxContains(b, a)) return 0;
      const [as, an, aw, ae] = a.bbox;
      const [bs, bn, bw, be] = b.bbox;
      if (as <= bn && bs <= an && aw <= be && bw <= ae) return 0; // overlapping boxes
      return Math.min(haversine(clampTo(a, b), b), haversine(clampTo(b, a), a));
    }
    const box = ba ? a : b;
    const pt = ba ? b : a;
    return bboxContains(box, pt) ? 0 : haversine(clampTo(box, pt), pt);
  }
  // The pair of candidates nearest each other — a region by its box (boxDistance), a point by
  // its coordinates — ties → the more important ones (a point inside both Londons is "in
  // London", the better-known one). `miles` stays the distance between the two POINTS (what
  // the tips and the same-place rule read); `near` is the distance that chose.
  function choosePair(A, B) {
    let best = null;
    for (const a of A) for (const b of B) {
      const near = boxDistance(a, b);
      const miles = haversine(a, b);
      const score = a.importance + b.importance;
      if (!best || near < best.near - 1e-9 || (Math.abs(near - best.near) <= 1e-9 && score > best.score)) best = { a, b, miles, near, score };
    }
    return best;
  }
  const coordsUrl = (a, b) => `https://www.google.com/maps/dir/?api=1&origin=${a.lat.toFixed(5)},${a.lon.toFixed(5)}&destination=${b.lat.toFixed(5)},${b.lon.toFixed(5)}&travelmode=driving`;
  // The two-pin map page (v0.2.86, src/map.html, web-accessible so the FS page may open it):
  // Google's directions view draws the start as a circle and only the end as a pin (Kevin:
  // "Currently I am only seeing one pin"), so a located pair opens our own map — both places
  // pinned and labelled, the straight-line distance, links to the Google route / either pin.
  // Resolved once at load: chrome.runtime.getURL throws once an extension reload has orphaned
  // this content script (the "context invalidated" case); a pre-resolved URL still works.
  let MAP_PAGE = "src/map.html";
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) MAP_PAGE = chrome.runtime.getURL("src/map.html");
  } catch (_) {
    MAP_PAGE = "src/map.html";
  }
  function mapPageUrl(r, a, b) {
    const q = new URLSearchParams({
      a: `${r.a.lat.toFixed(5)},${r.a.lon.toFixed(5)}`, al: r.a.label, at: a,
      b: `${r.b.lat.toFixed(5)},${r.b.lon.toFixed(5)}`, bl: r.b.label, bt: b,
    });
    return `${MAP_PAGE}#${q.toString()}`;
  }

  // Per-place candidate cache (session-persistent), per-pair resolutions and failures
  // (memory), one request at a time with a gap.
  const geo = { places: new Map(), pairs: new Map(), singles: new Map(), failed: new Set(), pending: new Map(), lastStart: 0, queue: Promise.resolve(), loaded: false, gapMs: GEO_GAP_MS, endpoint: GEO_ENDPOINT };
  function loadGeoStore() {
    if (geo.loaded) return;
    geo.loaded = true;
    try {
      const raw = globalThis.sessionStorage && sessionStorage.getItem(GEO_STORE);
      if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) geo.places.set(k, v);
    } catch (_) {}
  }
  function saveGeoStore() {
    try {
      const obj = {};
      for (const [k, v] of [...geo.places.entries()].slice(-300)) obj[k] = v;
      sessionStorage.setItem(GEO_STORE, JSON.stringify(obj));
    } catch (_) {}
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // One Nominatim request, serialized ≥ geo.gapMs after the previous one started.
  function nominatim(params) {
    const run = async () => {
      const wait = geo.lastStart + geo.gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      geo.lastStart = Date.now();
      const qs = new URLSearchParams(Object.assign({ format: "jsonv2", limit: "20", addressdetails: "1", namedetails: "1", dedupe: "1" }, params)).toString();
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), GEO_TIMEOUT_MS) : null;
      try {
        const res = await fetch(`${geo.endpoint}?${qs}`, { headers: { Accept: "application/json" }, signal: ctl ? ctl.signal : undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    const p = geo.queue.then(run, run);
    geo.queue = p.catch(() => {});
    return p;
  }
  // Candidates for a place. Requests, each ≥ 1 s after the last, until a settlement that fits
  // every component turns up: the bare first component within its country (all the
  // Kingswoods in GB), then its Saint/St name forms, then the whole string. What comes back
  // is the best tier over everything seen (see bestTier); an empty list = no location.
  async function geocode(place) {
    loadGeoStore();
    const key = norm(place);
    if (geo.places.has(key)) return geo.places.get(key);
    if (geo.pending.has(key)) return geo.pending.get(key);
    const job = (async () => {
      const parts = placeParts(place);
      const cc = countryCodeOf(place);
      const withCc = (q) => Object.assign({ q }, cc ? { countrycodes: cc } : {});
      const names = nameVariants(parts[0]);
      const seen = new Set();
      let cands = [];
      const add = (results) => {
        for (const c of filterCandidates(results, place, names)) {
          const k = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          cands.push(c);
        }
      };
      const settled = () => cands.some((c) => c.fit && c.rank === 0);
      for (const v of names.slice(0, 3)) {
        add(await nominatim(withCc(v)));
        if (settled()) break;
      }
      if (!settled() && parts.length > 1) add(await nominatim(withCc(place)));
      cands = bestTier(cands);
      // v0.2.132: "<X>, <State>, United States" is county-level in FS's hierarchy → the county
      // when the map has one; the town of that name (usually the county seat) otherwise.
      if (countyLevel(place)) {
        const counties = cands.filter((c) => c.county);
        if (counties.length) cands = counties;
      }
      // v1.0.1: nothing fits the rest of the place by address → the rest bounds the namesakes
      // (TAIL_NEAR_MI), a venue gets its bare-name search inside that area, and the rest of the
      // place stands in when nothing is left. Only when the place names its country.
      if (parts.length > 1 && cc && !cands.some((c) => c.fit)) cands = await boundByTail(place, parts, cc, cands);
      geo.places.set(key, cands);
      saveGeoStore();
      return cands;
    })();
    geo.pending.set(key, job);
    try {
      return await job;
    } finally {
      geo.pending.delete(key);
    }
  }
  // v1.0.1 — the rest of the place ("Fox Chase, Philadelphia, Pennsylvania"), located like any
  // place (so a rest whose own first component is unknown stands in with ITS rest), bounds the
  // namesakes of the first component: inside its area first (a region by its bounding box),
  // else within `within` miles of it. Nothing left → a venue's bare-name search in the area →
  // the rest's own candidates as stand-ins (flagged, with the words they stand in for).
  async function boundByTail(place, parts, cc, cands) {
    const tail = parts.slice(1).join(", ");
    let T = [];
    try {
      T = await geocode(tail);
    } catch (_) {
      T = [];
    }
    if (!T.length) return cands;
    const first = parts[0];
    const venue = isVenue(first);
    const within = venue ? VENUE_NEAR_MI : TAIL_NEAR_MI;
    for (const c of cands) {
      c.tailMi = Math.min(...T.map((t) => boxDistance(t, c)));
      c.bound = tail;
    }
    const inside = cands.filter((c) => c.tailMi <= 1e-9);
    if (inside.length) return inside;
    const near = cands.filter((c) => c.tailMi <= within);
    if (near.length) return near;
    if (venue) {
      const found = await rescueVenue(parts, cc, T);
      if (found) return [found];
    }
    const nearest = cands.length ? Math.min(...cands.map((c) => c.tailMi)) : null;
    const farNote = nearest == null ? "" : ` (the ${cands.length === 1 ? "one" : cands.length} "${first}" the map knows ${cands.length === 1 ? "is" : "are"} ${fmtMiles(nearest)} away)`;
    return T.map((t) => Object.assign({}, t, {
      standIn: t.standIn ? `${first}, ${t.standIn}` : first, // the words stood in for
      standsFor: t.standsFor || tail, // the place actually located
      query: place, byName: venue, fit: true, farNote,
    }));
  }
  // The venue's second chance: its bare name ("LawnView") searched INSIDE the stated area
  // (Nominatim viewbox + bounded, VENUE_NEAR_MI around it); a result whose name carries that
  // word and is not a road; the one whose address fits the rest of the place first, else a
  // settlement/landuse over a building, else the nearest to the area.
  async function rescueVenue(parts, cc, T) {
    const bare = bareVenueName(parts[0]);
    const box = searchBox(T[0], VENUE_NEAR_MI);
    if (!bare || !box) return null;
    let results = [];
    try {
      results = await nominatim({ q: bare, countrycodes: cc, viewbox: box.join(","), bounded: "1" });
    } catch (_) {
      return null;
    }
    const forms = nameVariants(bare).map(normComp).filter(Boolean);
    const rest = parts.slice(1).map(normComp);
    const tail = parts.slice(1).join(", ");
    const carries = (n) => forms.some((f) => n === f || n.startsWith(f + " ") || n.endsWith(" " + f) || n.includes(" " + f + " "));
    const out = [];
    for (const r of results || []) {
      if (!usable(r) || candRank(r) > 1) continue;
      if (!namesOf(r).map(normComp).some(carries)) continue;
      const c = candidateOf(r, nameOf(r), rest, { bounded: true, venueOf: parts[0], standsFor: tail });
      c.tailMi = Math.min(...T.map((t) => boxDistance(t, c)));
      out.push(c);
    }
    if (!out.length) return null;
    out.sort((x, y) => (y.fit - x.fit) || (y.rank === 0) - (x.rank === 0) || x.tailMi - y.tailMi || y.importance - x.importance);
    return out[0];
  }
  // Nominatim's viewbox around a candidate — its bounding box (a region) or its point — grown
  // by `miles` on every side: [west, north, east, south] as the API takes it (lon, lat pairs).
  function searchBox(c, miles) {
    if (!c) return null;
    let s, n, w, e;
    if (boxed(c)) [s, n, w, e] = c.bbox;
    else if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
      s = n = c.lat;
      w = e = c.lon;
    } else return null;
    const dLat = miles / 69;
    const dLon = miles / (69 * Math.max(0.2, Math.cos((((s + n) / 2) * Math.PI) / 180)));
    const f = (v) => v.toFixed(4);
    return [f(w - dLon), f(n + dLat), f(e + dLon), f(s - dLat)];
  }
  const pairKey = (a, b) => norm(a) + " || " + norm(b);
  // Resolve a pair: both candidate sets → the closest pair → {a, b, miles, nA, nB}. Cached.
  async function resolvePair(a, b) {
    const key = pairKey(a, b);
    if (geo.pairs.has(key)) return geo.pairs.get(key);
    const A = await geocode(a);
    const B = await geocode(b);
    if (!A.length || !B.length) throw new Error(`no location found for "${A.length ? b : a}"`);
    const best = choosePair(A, B);
    const r = { a: best.a, b: best.b, miles: best.miles, nA: A.length, nB: B.length };
    geo.pairs.set(key, r);
    return r;
  }
  // v1.0.1 — how a candidate that does not fit its place by address came to be chosen (a
  // sentence for the tooltips; "" when it simply fits). `ctx` = "pair" | "single".
  function boundNote(c, text, ctx) {
    const first = placeParts(text)[0];
    if (c.standIn) return ` "${c.standIn}" is not on OpenStreetMap near ${c.standsFor}${c.farNote || ""}, so ${c.label} stands in for it.`;
    if (c.bounded) return ` "${first}" is on OpenStreetMap as "${c.name}", found within ${VENUE_NEAR_MI} mi of ${c.standsFor}${c.fit ? "" : " (its address does not spell the rest of the place — check the pin)"}.`;
    if (c.fit === false && c.bound) return ` No "${first}" is listed under "${c.bound}" by address (modern boundaries differ from the tree's), but this one lies ${c.tailMi <= 1e-9 ? "inside it" : `within ${fmtMiles(c.tailMi)} of it`}, so it was taken — if the tree's place is mis-standardised, the pin shows where its words point.`;
    if (c.fit === false) {
      return ctx === "pair"
        ? ` No "${first}" was found under the county written in "${text}" (modern boundaries differ from the tree's), so the namesake nearest the other place was used — if that is the wrong one, the tree's place may be mis-standardised.`
        : ` No "${first}" was found under the county written in "${text}" (modern boundaries differ from the tree's).`;
    }
    return "";
  }
  function geoTip(r, a, b) {
    let s = `${r.a.label} ↔ ${r.b.label}: ${fmtMiles(r.miles)} (${fmtKm(r.miles)}) in a straight line. Pins are placed by coordinates (Google labels each with the nearest address it knows).`;
    const both = [];
    if (r.nA > 1 && !r.a.standIn) both.push(`${r.nA} places match "${a}"`);
    if (r.nB > 1 && !r.b.standIn) both.push(`${r.nB} match "${b}"`);
    if (both.length) s += ` ${both.join(" and ")} — the pair nearest each other was chosen, so check the pins.`;
    for (const [c, text] of [[r.a, a], [r.b, b]]) s += boundNote(c, text, "pair");
    return s + " Located with OpenStreetMap (Nominatim). Click: a map with both places pinned and the distance; Shift+click: the Google Maps driving route.";
  }

  // ---- Single places (v0.2.85 — Kevin: "When it is a single location, is it possible to
  // place a pin at the target location?"). A name search shows an area or a results list; a
  // coordinate search drops a pin. The place is located like a pair's; when the name has
  // several candidates the one nearest this page's OTHER places is taken (lookups already
  // cached are reused; otherwise one anchor is looked up).
  const pinUrl = (c) => `https://www.google.com/maps/search/?api=1&query=${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
  // v0.2.130 — regions are framed, not pinned (the constants sit beside SAME_PLACE_MI).
  // bboxSpan = the diagonal of Nominatim's bounding box [south, north, west, east] in miles.
  function bboxSpan(c) {
    const b = c && c.bbox;
    if (!b || b.length !== 4) return 0;
    return haversine({ lat: b[0], lon: b[2] }, { lat: b[1], lon: b[3] });
  }
  function isRegion(c) {
    if (!c) return false;
    if (c.kind && REGION_KIND_RE.test(c.kind)) return true;
    if (c.prank != null && c.prank <= REGION_RANK) return true;
    return bboxSpan(c) >= REGION_SPAN_MI;
  }
  const isCountry = (c) => !!c && (c.kind === "country" || (c.prank != null && c.prank <= 4));
  // A place that is just a country name ("United States") needs no lookup: it is a region by
  // definition and Google frames it by name. (Never written to geo.places — so never an anchor.)
  function countryOnly(place) {
    const parts = placeParts(place);
    if (parts.length !== 1) return null;
    const cc = COUNTRY_CODES[normComp(parts[0])];
    if (!cc) return null;
    return { lat: null, lon: null, name: parts[0], label: parts[0], display: parts[0], importance: 1, rank: 0, fit: true, kind: "country", prank: 4, bbox: null, cc, own: true };
  }
  // What a single place opens: a region framed by Google's name search (the map fitted to the
  // region, its boundary drawn), anything else a pin dropped by coordinates.
  const regionUrl = (c) => mapsUrl(c.display || c.label || c.name);
  // v1.0.1: a venue the map lacks (its rest standing in) is searched on Google Maps by the full
  // name — Google knows most cemeteries and churches; the stand-in's pin / frame is the alt.
  const singleUrl = (c) => (c.standIn && c.byName ? mapsUrl(c.query) : isRegion(c) ? regionUrl(c) : pinUrl(c));
  const singleAlt = (c, place) => {
    if (!c) return null;
    if (c.standIn) return c.byName ? (isRegion(c) ? regionUrl(c) : pinUrl(c)) : mapsUrl(c.query || place);
    if (c.bounded) return mapsUrl(place);
    return null;
  };
  const regionWord = (c) => {
    const k = c.kind;
    if (k === "country") return "country";
    if (k === "state") return c.cc === "gb" ? "country" : "state";
    if (k === "province" || k === "territory" || k === "county" || k === "city") return k; // v0.2.138: a city-sized boundary (London) is "a city"
    return "region";
  };
  // The other places on the page, nearest row first — the pair-completed form (what a compare
  // click cached) before the raw text.
  function anchorsFor(p, places) {
    const out = [];
    const seen = new Set([norm(p.place)]);
    const push = (s) => {
      if (!s || seen.has(norm(s))) return;
      seen.add(norm(s));
      out.push(s);
    };
    const others = places.filter((q) => q !== p).sort((x, y) => Math.abs(x.top - p.top) - Math.abs(y.top - p.top));
    for (const q of others) {
      if (q.partner) push(completePlace(q.place, q.partner.place));
      push(q.place);
    }
    return out;
  }
  async function resolveSingle(place, anchors) {
    const key = norm(place);
    if (geo.singles.has(key)) return geo.singles.get(key);
    const own = countryOnly(place);
    if (own) {
      const r0 = { c: own, n: 1, anchor: null, near: null, miles: null };
      geo.singles.set(key, r0);
      return r0;
    }
    const C = await geocode(place);
    if (!C.length) throw new Error(`no location found for "${place}"`);
    let pick = C[0];
    let near = null;
    let anchor = null;
    // v0.2.130: a country is no anchor — its centroid says nothing about which namesake is
    // meant (the UK's would pick the northern of two Kingswoods).
    const usable = (anchors || []).filter((a) => !countryOnly(a));
    const located = (cs) => (cs || []).filter((c) => !isCountry(c));
    if (C.length > 1 && usable.length) {
      let cands = null;
      for (const a of usable) {
        const k = norm(a);
        if (geo.places.has(k) && located(geo.places.get(k)).length) {
          cands = located(geo.places.get(k));
          anchor = a;
          break;
        }
      }
      if (!cands) {
        try {
          const cs = located(await geocode(usable[0]));
          if (cs.length) {
            cands = cs;
            anchor = usable[0];
          }
        } catch (_) {
          cands = null; // the anchor is only a tie-breaker; the place itself still resolves
        }
      }
      if (cands) {
        const best = choosePair(C, cands);
        pick = best.a;
        near = best.b;
      }
    }
    const r = { c: pick, n: C.length, anchor, near, miles: near ? haversine(pick, near) : null };
    geo.singles.set(key, r);
    return r;
  }
  function singleTip(r, place) {
    const c = r.c;
    const region = isRegion(c);
    const what = region ? "map" : "pin";
    let s = "";
    if (!c.standIn) {
      s = region
        ? `${c.label} is a ${regionWord(c)}, so the map opens framed on the whole region (Google fits it to the boundary and outlines it) rather than pinned at its centre.`
        : `Pinned at ${c.label}.`;
      if (r.n > 1) {
        s += r.near
          ? ` ${r.n} places match "${place}" — the one nearest ${r.near.label} (another place on this page, ${fmtMiles(r.miles)} away) was chosen; check the ${what}.`
          : ` ${r.n} places match "${place}" — the best-known one was taken; check the ${what}.`;
      }
    }
    s = (s + boundNote(c, place, "single")).trim();
    if (c.own) return s + " Click: Google Maps framed on it.";
    s += " Located with OpenStreetMap (Nominatim).";
    // v1.0.1: a venue standing in → Google by the full name; any stand-in / rename → the other reading on Shift+click
    if (c.standIn && c.byName) return s + ` Google Maps knows most cemeteries and churches, so the click searches it by the full name; Shift+click: ${region ? "the map framed on" : "a pin on"} ${c.label}.`;
    s += ` Click: Google Maps ${region ? "framed on the region" : "with the pin"}`;
    return c.standIn || c.bounded ? s + "; Shift+click: Google Maps searched by the full name instead." : s + ".";
  }

  // ---- v0.2.132: a region as one side of a pair (Kevin: "take care of these two small limits").
  // A region has no point to measure to, so a pair with one is a CONTAINMENT question, not a
  // distance. Two layers: (1) BY NAME, before any lookup — the shorter place's components are
  // the tail of the longer's ("Pennsylvania, United States" ⊂ "Coalmont, Huntingdon,
  // Pennsylvania, United States": a US census names a birthplace by state) → the link reads
  // "📍 in Pennsylvania", opens a pin on the inner place, Shift+click frames the outer one;
  // (2) AFTER the lookup, when a located side turns out a region → "in" / "not in" by the
  // region's bounding box, the click a pin on the point; two regions → framed, the record's first.
  function nestedBy(outer, inner) {
    const o = placeParts(outer).map(normComp);
    const i = placeParts(inner).map(normComp);
    if (!o.length || o.length >= i.length) return false;
    return o.every((c, k) => c === i[i.length - o.length + k]);
  }
  function bboxContains(c, pt) {
    const b = c && c.bbox;
    if (!b || !pt || pt.lat == null) return null;
    const [s, n, w, e] = b;
    const inLat = pt.lat >= s && pt.lat <= n;
    const inLon = w <= e ? pt.lon >= w && pt.lon <= e : pt.lon >= w || pt.lon <= e; // a box over the antimeridian
    return inLat && inLon;
  }
  // What a located pair's click opens (the click job and the rendered link agree through this).
  function pairUrl(r, a, b) {
    if (r.miles < SAME_PLACE_MI) return singleUrl(r.a);
    const ra = isRegion(r.a);
    const rb = isRegion(r.b);
    if (ra && rb) return regionUrl(r.a);
    if (ra) return pinUrl(r.b);
    if (rb) return pinUrl(r.a);
    return mapPageUrl(r, a, b);
  }
  function regionPairSpec(r, a, b) {
    const ra = isRegion(r.a);
    const rb = isRegion(r.b);
    if (ra && rb) {
      return {
        kind: "pair", pair: [a, b], text: "📍 two regions", url: regionUrl(r.a), alt: regionUrl(r.b),
        tip: `Both are regions — ${r.a.label} (a ${regionWord(r.a)}, the record) and ${r.b.label} (a ${regionWord(r.b)}, the tree) — so there is no point-to-point distance; their centres are ${fmtMiles(r.miles)} apart. Located with OpenStreetMap (Nominatim). Click: the map framed on ${r.a.label}; Shift+click: framed on ${r.b.label}.`,
      };
    }
    const outer = ra ? r.a : r.b;
    const inner = ra ? r.b : r.a;
    const innerText = ra ? b : a;
    const inside = bboxContains(outer, inner) !== false;
    return {
      kind: "pair", pair: [a, b], text: `📍 ${inside ? "in" : "not in"} ${outer.label}`, url: pinUrl(inner), alt: regionUrl(outer),
      tip: `${innerText} lies ${inside ? "within" : "OUTSIDE"} ${outer.label} (a ${regionWord(outer)}; judged by the region's bounding box, so a place near its edge may be misjudged — check the pin). A region has no point to measure a distance to, so none is shown. Located with OpenStreetMap (Nominatim). Click: a pin on ${inner.label}; Shift+click: the map framed on ${outer.label}.`,
    };
  }
  function nestedSpec(outer, inner) {
    const name = placeParts(outer)[0];
    const text = `📍 in ${name}`;
    const alt = mapsUrl(regionNameOf(outer));
    const note = `"${inner}" lies within "${outer}" — one names a place inside the other, so there is no distance to measure. `;
    const single = geo.singles.get(norm(inner));
    if (single) return { kind: "within", single: inner, text, url: singleUrl(single.c), alt, tip: note + singleTip(single, inner) + ` Shift+click: the map framed on ${name}.` };
    return { kind: "within", single: inner, text, url: mapsUrl(inner), alt, tip: note + `Click: a pin on ${inner} (located first with OpenStreetMap); Shift+click: the map framed on ${name}. Opens in one reused Maps tab.` };
  }

  // What a place's link opens: a compare (both pins) when it has a partner naming a different
  // place, else a single-pin map.
  function linkSpec(p) {
    let a = null;
    let b = null;
    if (p.partner) {
      const r = p.side === "record" ? p : p.partner;
      const t = p.side === "tree" ? p : p.partner;
      a = completePlace(r.place, t.place);
      b = completePlace(t.place, r.place);
    }
    // Same place once completed ("Kingswood, Gloucestershire" vs "Kingswood, Gloucestershire,
    // England, United Kingdom") → nothing to compare; a single pin.
    if (a && norm(a) !== norm(b)) {
      if (nestedBy(a, b)) return nestedSpec(a, b); // v0.2.132: one inside the other by name
      if (nestedBy(b, a)) return nestedSpec(b, a);
      const r = geo.pairs.get(pairKey(a, b));
      if (r && r.miles < SAME_PLACE_MI) {
        // "Kobe, Japan" vs "Kōbe-shi, Hyōgo-ken, Japan" (v0.2.88): one place, two spellings —
        // a pin, not a route from a place to itself.
        return { kind: "single", pair: [a, b], text: "📍 same place", url: singleUrl(r.a), tip: `Both names resolve to the same place: ${r.a.label}. Record: ${a}. Tree: ${b}. Located with OpenStreetMap (Nominatim). Click: Google Maps ${isRegion(r.a) ? "framed on the region" : "with the pin"}.` };
      }
      if (r && (isRegion(r.a) || isRegion(r.b))) return regionPairSpec(r, a, b); // v0.2.132
      if (r) return { kind: "pair", pair: [a, b], text: "📍 " + fmtMiles(r.miles), url: mapPageUrl(r, a, b), alt: coordsUrl(r.a, r.b), tip: geoTip(r, a, b) };
      return {
        kind: "pair",
        pair: [a, b],
        text: "📍 compare",
        url: mapsUrl(a, b),
        tip: `Compare on Google Maps: a pin on each place and the driving distance between them. Record: ${a}. Tree: ${b}. The click first locates both places (OpenStreetMap), so a name shared by several places — two Kingswoods in Gloucestershire — resolves to the pair nearest each other, and the straight-line distance is written here. Opens in one reused Maps tab.`,
      };
    }
    const single = geo.singles.get(norm(p.place));
    if (single) {
      const spec = { kind: "single", single: p.place, text: "📍 map", url: singleUrl(single.c), tip: singleTip(single, p.place) };
      const alt = singleAlt(single.c, p.place);
      if (alt) spec.alt = alt;
      return spec;
    }
    return {
      kind: "single",
      single: p.place,
      text: "📍 map",
      url: mapsUrl(p.place),
      tip: p.solo
        ? `Show this place on Google Maps: ${p.place}. The click first locates the place (OpenStreetMap) so a pin lands exactly on it. Opens in one reused Maps tab.`
        : `Show this place on Google Maps: ${p.place}. ${p.partner ? "Both sides name the same place." : "No place of the same kind (and, for a residence, the same year) on the other side to compare it with."} The click first locates the place (OpenStreetMap) so a pin lands exactly on it. Opens in one reused Maps tab.`,
    };
  }
  // v0.2.131: a value that stands in for the record's Event Place ("Same Place") says so first.
  function linkFor(p) {
    const spec = linkSpec(p);
    const note = pairNote(p);
    if (note) spec.tip = note + spec.tip;
    if (p.rawPlace) spec.tip = `"${p.rawPlace}" on this record means its own Event Place — ${p.place}. ` + spec.tip;
    return spec;
  }

  // v1.0.1: the located log's note on a bounded / rescued / stood-in candidate.
  const locNote = (c) =>
    c.standIn ? `; "${c.standIn}" not on the map near ${c.standsFor} — ${c.label} stands in${c.byName ? ", Google by name on click" : ""}`
      : c.bounded ? `; on the map as "${c.name}" within ${VENUE_NEAR_MI} mi of ${c.standsFor}`
        : c.bound && c.fit === false ? `; bounded by ${c.bound} (${c.tailMi <= 1e-9 ? "inside" : fmtMiles(c.tailMi) + " outside"})`
          : "";
  function makeLink() {
    const a = document.createElement("a");
    a.setAttribute("data-fsse-map", "single");
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
    a.setAttribute("style", "margin-left:8px;font-size:12px;line-height:1;white-space:nowrap;text-decoration:none;color:#0b6e95;cursor:pointer;vertical-align:baseline;");
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const url = a._fsseUrl;
      if (!url) return;
      if (ev.shiftKey && a._fsseAlt) {
        FSSE.log("linker: opening (alt)", a._fsseAlt);
        if (FSSE.openUrl) FSSE.openUrl(a._fsseAlt, MAPS_SITE);
        else window.open(a._fsseAlt, "_blank", "noopener");
        return;
      }
      const pair = a._fssePair;
      const single = a._fsseSingle;
      if (typeof fetch === "function") {
        if (pair && !geo.pairs.has(pairKey(pair[0], pair[1]))) {
          openLocated(a, pairKey(pair[0], pair[1]), () => resolvePair(pair[0], pair[1]).then((r) => {
            FSSE.log(`linker: located "${pair[0]}" → ${r.a.label} (${r.nA} candidate(s)${locNote(r.a)}) and "${pair[1]}" → ${r.b.label} (${r.nB}${locNote(r.b)}); ${fmtMiles(r.miles)} apart`);
            return pairUrl(r, pair[0], pair[1]);
          }), url);
          return;
        }
        if (single && !geo.singles.has(norm(single))) {
          openLocated(a, "single:" + norm(single), () => resolveSingle(single, a._fsseAnchors || []).then((r) => {
            const nearNote = r.near ? `, the one nearest ${r.near.label}` : "";
            const regionNote = isRegion(r.c) ? `; a ${regionWord(r.c)} — framed, not pinned` : "";
            FSSE.log(`linker: located "${single}" → ${r.c.label} (${r.n} candidate(s)${nearNote}${regionNote}${locNote(r.c)})`);
            return singleUrl(r.c);
          }), url);
          return;
        }
      }
      FSSE.log("linker: opening", url);
      if (FSSE.openUrl) FSSE.openUrl(url, MAPS_SITE);
      else window.open(url, "_blank", "noopener");
    });
    // v0.2.125: the person page's Vitals rows are clickable (they open the fact panel) — keep
    // every pointer gesture on the link from reaching FamilySearch's row handlers.
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend"]) a.addEventListener(t, (ev) => ev.stopPropagation());
    return a;
  }

  // A click on an unresolved pair or single: open (or reuse) the Maps tab NOW — inside the
  // click, so no popup blocker — run `job` (resolves to the coordinate URL), then navigate
  // that tab; on any failure navigate it by name instead. The link reads "📍 locating…"
  // meanwhile; afterwards the tick rewrites every link from the caches ("📍 1.1 mi" for a
  // pair, the pinned tooltip for a single).
  function openLocated(link, key, job, fallbackUrl) {
    if (link._fsseBusy) return;
    link._fsseBusy = true;
    let w = null;
    try {
      w = window.open("", MAPS_SITE.tab);
      if (w) w.focus();
    } catch (_) {
      w = null;
    }
    const go = (url) => {
      FSSE.log("linker: opening", url);
      if (w) {
        try {
          w.location.href = url;
          try {
            w.focus();
          } catch (_) {}
          return;
        } catch (_) {}
      }
      if (FSSE.openUrl) FSSE.openUrl(url, MAPS_SITE);
      else window.open(url, "_blank", "noopener");
    };
    const label = link.textContent;
    link.textContent = "📍 locating…";
    Promise.resolve()
      .then(job)
      .then((url) => {
        go(url);
        link.textContent = label;
        try {
          tick(); // every link of this place now carries the located URL / distance
          tickPerson(); // (each is a no-op off its own page)
        } catch (_) {}
      })
      .catch((err) => {
        FSSE.log("linker: locating failed —", err && err.message ? err.message : String(err), "— opening by name instead");
        geo.failed.add(key);
        link.textContent = label;
        go(fallbackUrl);
      })
      .finally(() => {
        link._fsseBusy = false;
      });
  }

  // The link that follows a place's text node, if it is ours.
  const linkAfter = (node, links) => {
    if (!node) return null;
    if (ours(node.nextSibling)) return node.nextSibling;
    // v0.2.129: a link moved out of a clamped place box (unclip) remembers its text node.
    return (links || []).find((l) => l._fsseFor === node) || null;
  };

  // v0.2.129 — FamilySearch clamps a long place box to two lines (-webkit-line-clamp: the
  // ellipsis after "Pennsylvania, United…" on Adam Jackson Black GS6Q-ZK7's 1900 residence,
  // Kevin's screenshot 2026-10-28), so a link inserted after the text lands on the hidden third
  // line. `clipper` = the nearest ancestor that clips its overflow and does NOT show the link's
  // box; `unclip` moves the link right after that ancestor — on its own line under the place,
  // where a link that merely wrapped (the 1880 row) already sat.
  function clipper(link) {
    if (typeof getComputedStyle !== "function" || !link || !link.getBoundingClientRect) return null;
    const edges = (q) => ({ top: q.top, bottom: q.bottom != null ? q.bottom : q.top + (q.height || 0), right: q.right != null ? q.right : q.left + (q.width || 0) });
    const r = edges(link.getBoundingClientRect());
    for (let el = link.parentElement, n = 0; el && n < 6; el = el.parentElement, n++) {
      let cs = null;
      try { cs = getComputedStyle(el); } catch (e) { return null; }
      if (!cs) return null;
      const clamp = String(cs.webkitLineClamp || (cs.getPropertyValue && cs.getPropertyValue("-webkit-line-clamp")) || "none");
      const clips = clamp !== "none" && clamp !== "" || /hidden|clip/.test(String(cs.overflowY || cs.overflow || ""));
      if (!clips) continue;
      if (!el.getBoundingClientRect) return null;
      const h = edges(el.getBoundingClientRect());
      return r.bottom > h.bottom + 1 || r.top < h.top - 1 || r.right > h.right + 1 ? el : null;
    }
    return null;
  }
  function unclip(link) {
    const el = clipper(link);
    if (!el || !el.parentNode || !el.parentNode.insertBefore) return false;
    el.parentNode.insertBefore(link, el.nextSibling || null);
    return true;
  }

  // Add/refresh a link right after every place's text; drop links no place claims any more.
  function inject(scan, mode) {
    const places = scanPlaces(scan.units, mode);
    if (mode !== "person") pairPlaces(places); // the person page has one side only: every place is a pin of its own
    const keep = new Set();
    for (const p of places) {
      const spec = linkFor(p);
      let link = linkAfter(p.node, scan.links);
      let fresh = false;
      if (!link) {
        link = makeLink();
        const host = p.host || p.node.parentNode;
        if (!host || !host.insertBefore) continue;
        host.insertBefore(link, p.node.nextSibling || null);
        fresh = true;
      }
      link._fsseFor = p.node;
      if (fresh || link === p.node.nextSibling) unclip(link); // still inline: a clamped box may hide it (v0.2.129)
      keep.add(link);
      link._fssePair = spec.pair || null;
      link._fsseSingle = spec.single || null;
      link._fsseAlt = spec.alt || null;
      link._fsseAnchors = spec.single ? anchorsFor(p, places) : [];
      // v0.2.130: keyed on the whole spec, not the URL alone — a region's framed URL is the
      // same name search the link carried before the lookup, yet its tooltip changes.
      const sig = [spec.kind, spec.text, spec.url, spec.tip].join("\n");
      if (link._fsseSig !== sig) {
        link._fsseSig = sig;
        link._fsseUrl = spec.url;
        link.setAttribute("href", spec.url);
        link.setAttribute("title", wrap(spec.tip));
        link.setAttribute("data-fsse-map", spec.kind);
        link.textContent = spec.text;
      }
      p.link = link;
    }
    for (const l of scan.links) if (!keep.has(l) && l.remove) l.remove();
    // Optional: locate every pair as it appears (off by default — requests without a click).
    if (GEOCODE_ON_RENDER && typeof fetch === "function") {
      for (const p of places) {
        if (p.side !== "record" || !p.link || !p.link._fssePair) continue;
        const [a, b] = p.link._fssePair;
        const key = pairKey(a, b);
        if (geo.pairs.has(key) || geo.failed.has(key) || geo.pending.has(key)) continue;
        geo.pending.set(key, true);
        resolvePair(a, b)
          .then(() => tick())
          .catch(() => geo.failed.add(key))
          .finally(() => geo.pending.delete(key));
      }
    }
    return places;
  }

  // One scan/inject cycle per page kind — "linker" (v0.2.80, `[FSSE] linker:` lines) and
  // "person" (v0.2.125, `[FSSE] places:` lines) — each with its own change-logging state.
  const PREFIX = { linker: "linker", person: "places" };
  const states = { linker: { sig: null, diag: null, structure: null, on: null }, person: { sig: null, diag: null, structure: null, on: null } };
  const at = (p) => `@(${Math.round(p.left)},${Math.round(p.labelTop != null ? p.labelTop : p.top)})`;
  const shown = (p) => (p.rawPlace ? `"${p.rawPlace}" → "${p.place}"` : `"${p.place}"`); // v0.2.131: "Same Place" → the Event Place it stands for

  // v0.2.133: the map pins can be switched off in the settings (src/settings.js), per page kind —
  // "pins.linker" on the Source Linker, "pins.sources" on a person's Sources tab, "pins.person" on
  // the other person-page tabs. No settings (the node suites stub FSSE without them) = all on.
  function enabledFor(mode) {
    const S = FSSE.settings;
    if (!S || typeof S.get !== "function") return true;
    const key = mode === "linker" ? "pins.linker" : FSSE.isSourcesTab && FSSE.isSourcesTab() ? "pins.sources" : "pins.person";
    return S.get(key) !== false;
  }
  // Every link of ours on the page, gone — textUnits is the one walker that reaches into open
  // shadow roots and finds a link `unclip` moved out from behind its text (v0.2.129).
  function removeAll() {
    const { links } = textUnits(document);
    for (const l of links) if (l && l.remove) l.remove();
    return links.length;
  }

  function run(mode) {
    const pre = PREFIX[mode];
    const state = states[mode];
    if (FSSE.settings && FSSE.settings.loaded === false) return []; // settings still loading — nothing yet
    if (!enabledFor(mode)) {
      if (state.on !== false) {
        // the on → off transition only: the walk costs the same as a scan, so an off page pays once
        const n = removeAll();
        state.on = false;
        state.sig = null;
        state.structure = null;
        state.diag = null;
        FSSE.log(`${pre}: map pins are switched off in the settings${n ? ` — ${n} link(s) removed` : ""}`);
      }
      return [];
    }
    state.on = true;
    const scan = textUnits(document);
    const places = inject(scan, mode);
    const sig = places.map((p) => `${p.side}:${p.fact}${at(p)}:${p.place}>${p.partner ? p.partner.place : "-"}`).join("|");
    if (sig !== state.sig) {
      state.sig = sig;
      const pairs = places.filter((p) => p.partner && p.side === "record").length;
      if (mode === "person") FSSE.log(`${pre}: ${places.length} place(s) on the person page`);
      else FSSE.log(`${pre}: ${places.length} place(s) — record ${places.filter((p) => p.side === "record").length}, tree ${places.filter((p) => p.side === "tree").length}, ${pairs} pair(s)`);
      for (const p of places) {
        if (mode === "person") FSSE.log(`${pre}: ${p.fact}${at(p)} ${shown(p)}${p.date ? ` (${p.date})` : ""}`);
        else if (p.side === "record") {
          const t = p.partner;
          FSSE.log(`${pre}: record ${p.fact}${at(p)} ${shown(p)}${t ? ` ↔ tree ${t.fact}${at(t)} ${shown(t)} [paired by ${p.pairedBy}]` : " (no partner)"}`);
        } else if (!p.partner) FSSE.log(`${pre}: tree ${p.fact}${at(p)} ${shown(p)} (no partner)`);
      }
      // Comma-bearing visible texts that look like places but no label claimed — a label the
      // rules do not know, or a value the geometry rule refused. A value a no-place fact
      // (Marital Status, Occupation…) examined and declined is not a miss.
      const captured = new Set(places.map((p) => p.node));
      const missed = [];
      for (const u of scan.units) {
        if (captured.has(u.node) || (u.under && u.under.noPlace) || !/,/.test(u.text) || /["“”]/.test(u.text) || u.text.length > 80 || isDateText(u.text) || /Sources?/i.test(u.text) || !looksLikePlace(u.text) || !visible(u)) continue;
        const r = measure(u);
        missed.push(`"${u.text}"@(${Math.round(r.left)},${Math.round(r.top)})`);
      }
      if (missed.length) FSSE.log(`${pre}: ${missed.length} place-looking text(s) NOT under a known label: ${[...new Set(missed)].slice(0, 12).join(" · ")}`);
    }
    // Structure around the first visible fact label — what the value rule actually sees.
    const li = scan.units.findIndex((u) => parseLabel(u.text) && visible(u));
    if (li >= 0) {
      const dump = scan.units.slice(li, li + 8).map((u) => {
        const r = measure(u);
        return `${tagOf(u.host) || "?"} "${u.text.length > 40 ? u.text.slice(0, 37) + "…" : u.text}"@(${Math.round(r.left)},${Math.round(r.top)})${visible(u) ? "" : " hidden"}`;
      }).join(" → ");
      if (dump !== state.structure) {
        state.structure = dump;
        FSSE.log(`${pre} DIAG structure (host tag "text"@(x,y) from the first shown label): ${dump}`);
      }
    }
    // The page has rendered its facts (the linker's section headers; on the person page a shown
    // place-fact label) yet nothing was recognised → dump the shown texts once per change.
    const rendered = mode === "person"
      ? scan.units.some((u) => { const l = parseLabel(u.text); return !!(l && l.placeFact && visible(u)); })
      : scan.units.some((u) => RENDERED_RE.test(u.text));
    if (!places.length && rendered) {
      const seen = new Set();
      const texts = [];
      for (const u of scan.units) {
        if (!visible(u)) continue;
        const t = u.text.length > 60 ? u.text.slice(0, 57) + "…" : u.text;
        if (seen.has(t)) continue;
        seen.add(t);
        const r = measure(u);
        texts.push(`"${t}"@(${Math.round(r.left)},${Math.round(r.top)})`);
      }
      const dump = texts.slice(0, 150).join(" · ");
      if (dump !== state.diag) {
        state.diag = dump;
        FSSE.log(`${pre} DIAG: the ${mode === "person" ? "person page" : "linker"} has rendered but no fact places were recognised — ${texts.length} shown text(s): ${dump}`);
      }
    }
    return places;
  }

  // The Source Linker (v0.2.80): "📍 compare" / "📍 map" after the record's and the tree's places.
  function tick() {
    if (!isLinkerPage()) return;
    return run("linker");
  }
  // The person page (v0.2.125): a "📍 map" after every place the page mentions — the Vitals
  // rows, each couple block's marriage, the Other Information facts once that section is
  // expanded. One side only, so no pairing; the single-pin click flow as on the linker.
  function tickPerson() {
    if (!isPersonPage()) return;
    return run("person");
  }

  FSSE.linker = {
    isLinkerPage, isDateText, parseLabel, looksLikePlace, completePlace, mapsUrl,
    textUnits, scanPlaces, pairPlaces, linkFor, inject, tick, MAPS_SITE, PAIR_PX,
    // v0.2.125 person page (+ v0.2.129 clamped place boxes)
    isPersonPage, tickPerson, run, BESIDE_PX, clipper, unclip,
    // v0.2.133 the settings switches
    enabledFor, removeAll,
    // v0.2.131 "Same Place" → the record's Event Place
    aliasSamePlace, SAME_PLACE_RE,
    // v0.2.137 pairing by fact family + year
    factFamily, yearSpan, pairScore, pairNote, YEAR_GAP_MAX,
    // v0.2.132 regions in pairs + county-level US places
    nestedBy, bboxContains, pairUrl, countyLevel, regionNameOf,
    // v0.2.82–83 geocoding
    haversine, countryCodeOf, filterCandidates, choosePair, boxDistance, coordsUrl, geocode, resolvePair, pairKey, _geo: geo,
    nameVariants, bestTier, candLabel, normComp,
    // v0.2.85 singles (+ v0.2.130 regions framed, not pinned)
    resolveSingle, pinUrl, anchorsFor, isRegion, bboxSpan, countryOnly, regionUrl, singleUrl,
    // v1.0.1 the stated hierarchy bounds the namesakes; venues rescued / stood in for
    isVenue, bareVenueName, searchBox, boundByTail, rescueVenue, singleAlt, boundNote, geoTip, singleTip, candidateOf, TAIL_NEAR_MI, VENUE_NEAR_MI,
    // v0.2.86 two-pin page
    mapPageUrl, MAP_PAGE,
  };
})();
