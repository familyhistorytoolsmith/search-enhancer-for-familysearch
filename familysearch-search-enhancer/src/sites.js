// sites.js — extensible registry of extra search options.
//
// To add a new search option later, append one object to FSSE.SITES:
//   - id:          unique slug (also used as the dedupe marker on the injected row)
//   - label:       text shown in the list
//   - icon:        OPTIONAL path under icons/ for a custom icon; omit to reuse the native
//                  logo of the anchor row (the row is cloned, so its icon comes along)
//   - anchorLabel: the visible label of the row to insert next to ("Ancestry", "Google", ...).
//                  May be an ARRAY of labels tried in order — list an earlier injected row's
//                  label first and a native row last, so extra rows keep a stable order.
//   - position:    "after" | "before" the anchor row
//   - section:     OPTIONAL — "temple" routes the row into the members-only Temple dropdown
//                  (FSSE.findTempleSection); default is the Search Records panel
//   - sameTab:     OPTIONAL — navigate in the SAME tab like a native link (also dismisses a
//                  dropdown); default opens a new tab
//   - tab:         OPTIONAL — a window name ("fsse-gro"); every search from this site then
//                  reuses ONE tab of that name instead of opening another (v0.2.77 — GRO and
//                  FreeBMD, whose fill scripts reload the form when the URL only changed its
//                  fragment). Default: a fresh tab per click.
//   - replaces:    OPTIONAL — label(s) of a NATIVE entry this menu takes the place of
//                  (v0.2.101: fs-records replaces the classic card's "FamilySearch" row /
//                  the Labs dropdown's "FamilySearch Records" entry; v0.2.102: ancestry-
//                  records replaces the native "Ancestry" row). content.js hides that entry
//                  while our row is present and hands the link it carries to options() as
//                  p.nativeUrls[<site id>]. A menu for a row FamilySearch shows only in some
//                  places gates itself on that row: `applies: (p) => nativeRowOf(p, id)` (v1.0.4:
//                  "Ancestry Institution" / "MyHeritage Library Edition", the two rows a
//                  FamilySearch Center's network adds).
//   - tooltip:     OPTIONAL static hover text (defaults to label)
//   - describe(p): OPTIONAL dynamic hover text, refreshed as the person's vitals load (a
//                  `section: "temple"` row is described without a person — its text may follow
//                  something other than the tree, v1.0.2)
//   - confirmText(p, opts): OPTIONAL (plain rows, v1.0.2) — a question to put to the user
//                  before opening, or null; a declined dialog opens nothing (the Labs-experiment
//                  Temple row, when the experiment is off)
//   - footer(p):   OPTIONAL (menu rows) → { text, url?, tooltip? } — a sentence-cased line under
//                  the entries (the FamilySearch menu's attached-source status, v0.2.33)
// Every site is also a SETTING: `site.<id>` in src/settings.js's SCHEMA (a test cross-checks the
// two lists) — switched off there, the row is never injected and a `replaces` menu gives the
// native entry back. Add the SCHEMA entry when adding a site.
//   - applies(p):  OPTIONAL predicate; when present the row waits for the scraped person and
//                  is only shown (kept) while it returns true
//   - ONE of:
//       buildUrl(p, opts): plain row — person vitals (+ click opts) -> target search URL.
//            opts = { shift, cycle } — shift is true if Shift was held; cycle counts the
//            Shift+clicks on this row for this person (0 on the first), for rotating choices
//       options(p): expandable menu row — returns [{ group, label, url, tooltip }], rebuilt
//            from the person each time the menu opens (so the list is content-aware)
//
// `p` shape (see familysearch.js):
//   { id, given, surname, marriedSurname, marriedSurnames, spouseSurnames, spouses, sex, living,
//     fullName, birthYear, birthPlace, deathYear, deathPlace, christeningYear, christeningPlace,
//     burialYear, burialPlace }
//   id = the tree PID from the page URL ("LJRD-PJ2"); record searches send it as treeref= so
//   the results page shows the "Person From FamilySearch Tree" banner.
//   Years are strings as scraped ("1897") — use num() below before doing arithmetic.
//   marriedSurnames = a woman's husbands' surnames; spouseSurnames = the spouses' surnames
//   for either sex (a man's wives' maiden names). living = the Death vital reads "Living".
//   spouses = [{ name, surname, id, marriageDate, marriageYear, marriagePlace }] — one per
//   couple block in page order; the marriage fields are "" / null when the tree has no event.
//   nativeUrls (v0.2.102; a single nativeSearchUrl in v0.2.101) = { <site id>: url | null }
//   — the URL of the native entry each `replaces` menu takes the place of, set per tick by
//   content.js; null when that row carries no link or the layout has no such row (the
//   narrow third-party-only panel has no FamilySearch row). Read via nativeUrlOf(p, id).
//   nativeRows (v0.2.105) = { <site id>: true | false } — whether that native row is on the
//   page; present + no link → the menu entry hands the click to it (nativeClick).

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  // ---- helpers for the FamilySearch record-search menu (collection data: fs-collections.js) ----
  const num = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const classify = (place) => (FSSE.classifyPlace ? FSSE.classifyPlace(place) : null);
  // Region for an event: its own place first, then the other vital's place.
  const regionOf = (...places) => {
    for (const pl of places) {
      const c = classify(pl);
      if (c) return c.region;
    }
    return null;
  };
  // Same fall-through, but the whole { region, sub } classification — FSSE.indexTier consults a
  // state/province's own indexes before the country's (v0.2.42).
  const classOf = (...places) => {
    for (const pl of places) {
      const c = classify(pl);
      if (c) return c;
    }
    return null;
  };
  const around = (key, year) => (year != null ? { [`${key}.from`]: year - 2, [`${key}.to`]: year + 2 } : {});
  const fullName = (p, surname) => [p.given, surname].filter(Boolean).join(" ");
  // The link of the native entry a `replaces` menu took the place of (content.js, per tick) —
  // and whether that entry is on the page at all. v0.2.105: whenever the row is present the
  // menu's native entry carries `nativeClick: true` and injectMenu hands the click to the row —
  // FamilySearch builds the URL itself (some partner links only exist at click time:
  // MyHeritage's carries a csrf_token + fspid, Kevin's find 2026-10-09; Kevin: "let FamilySearch
  // build the needed URL rather than assume"). The entry's `url` (a read link, else our own
  // grammar) is only the reserve for a row that vanished between ticks.
  const nativeUrlOf = (p, siteId) => (p.nativeUrls && p.nativeUrls[siteId]) || null;
  const nativeRowOf = (p, siteId) => !!(p.nativeRows && p.nativeRows[siteId]);

  // Spouses with their scraped marriage year as a number (null when the tree has no date).
  const spousesOf = (p) => (p.spouses || []).map((s) => ({ ...s, year: num(s.marriageYear) }));
  const datedMarriages = (p) => spousesOf(p).filter((s) => s.year != null).sort((a, b) => a.year - b.year);

  // Birth/death years with the christening/burial vitals as proxies — a christening follows
  // the birth by weeks and a burial the death by days, so the year matches almost always, and
  // every search built from these uses a ±2 window anyway.
  const birthYearOf = (p) => (num(p.birthYear) != null ? num(p.birthYear) : num(p.christeningYear));
  const deathYearOf = (p) => (num(p.deathYear) != null ? num(p.deathYear) : num(p.burialYear));

  // Age-based fallback when no marriage date is on the page: married from age 20 at `year`;
  // unknown ages lean "yes".
  const oldEnough = (p, year) => {
    const by = birthYearOf(p);
    return !(year != null && by != null && year - by < 20);
  };
  // Has the person married by `year`? Exact when a marriage year was scraped (the earliest one),
  // otherwise the age-20 guess.
  function marriedBy(p, year) {
    if (year == null) return true;
    const dated = datedMarriages(p);
    return dated.length ? year >= dated[0].year : oldEnough(p, year);
  }
  // A woman's surname at a given year: the surname of her latest marriage dated on or before
  // that year; with no dated marriage yet, an undated one counts once she is 20; else maiden.
  // Men (and women with no spouse) always use the Vitals surname.
  function surnameAt(p, year) {
    const married = p.marriedSurnames || [];
    if (!married.length) return p.surname;
    const dated = datedMarriages(p);
    if (!dated.length || year == null) return marriedBy(p, year) ? married[0] : p.surname;
    const past = dated.filter((s) => s.year <= year);
    if (past.length) return past.at(-1).surname;
    const undated = spousesOf(p).find((s) => s.year == null);
    return undated && oldEnough(p, year) ? undated.surname : p.surname;
  }

  // Censuses the person was plausibly alive for, from the birth/death year + place pairs plus
  // any dated, placed marriages. Each entry: { year, region, sub, id }. Mirrors the companion
  // app's timeline rule, tightened with bracketing (see `bracket` below): a country's census for
  // year Y is offered when one of the events bracketing Y is in that country (so a stretch
  // between two same-country events yields only that country); an inter-decennial state /
  // province census when a bracketing event is in that state. Life span = birth → death, or 100
  // years past birth when no death is known.
  // The person's placed timeline: { events: [{ year, region, sub, kind, label }] sorted by year,
  // lower, upper } — birth (or christening), every dated + placed marriage, death (or burial).
  // Shared by the census bracketing, the MIGRATION pairs and the MILITARY test (v0.2.40).
  // A placed but undated birth/death still names a country; it is anchored on the nearer life
  // bound. Life span = birth → death, or 100 years past birth / 90 before death when one end is
  // unknown. Returns null when no bound at all is known.
  function timeline(p) {
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const lower = by != null ? by : dy != null ? dy - 90 : null;
    const upper = dy != null ? dy : by != null ? by + 100 : null;
    if (lower == null || upper == null) return null;
    const events = [];
    const cb = classify(p.birthPlace) || classify(p.christeningPlace);
    const cd = classify(p.deathPlace) || classify(p.burialPlace);
    if (cb) events.push({ year: by != null ? by : lower, kind: "birth", label: num(p.birthYear) != null ? `${by} birth` : `${by} christening`, ...cb });
    // Dated + placed marriages are further fixes on where the person was. They add their
    // country's censuses AND decide the "nearest event" test for state/provincial censuses:
    // Norman Owen KW8B-KPY (b. 1908 England, m. 1929 Calgary, d. 1978 Alberta) is on the 1926
    // Prairie Provinces census, but with birth/death alone the English birth was the nearer
    // event to 1926 and the entry was withheld.
    for (const s of p.spouses || []) {
      const my = num(s.marriageYear);
      const cm = classify(s.marriagePlace);
      if (my != null && cm) events.push({ year: my, kind: "marriage", label: `${my} marriage`, ...cm });
    }
    // Dated + placed facts from Other Information (v0.2.43): residences, immigration/emigration,
    // naturalization, military service — each pins a country (and state) at a year.
    for (const f of p.facts || []) {
      const fy = num(f.year);
      const cf = classify(f.place);
      const kind = String(f.kind || "fact").toLowerCase();
      if (fy != null && cf) events.push({ year: fy, kind, label: `${fy} ${kind}`, ...cf });
    }
    if (cd) events.push({ year: dy != null ? dy : upper, kind: "death", label: num(p.deathYear) != null ? `${dy} death` : `${dy} burial`, ...cd });
    events.sort((a, b) => a.year - b.year);
    return { events, lower, upper };
  }

  // The events that BRACKET year Y: all events at the latest year ≤ Y and at the earliest year
  // ≥ Y. Same country on both sides → as far as the page knows the person was there the whole
  // time; different countries → a move happened somewhere in between.
  function bracketAt(events, Y) {
    let beforeYear = null;
    let afterYear = null;
    for (const e of events) {
      if (e.year <= Y && (beforeYear == null || e.year > beforeYear)) beforeYear = e.year;
      if (e.year >= Y && (afterYear == null || e.year < afterYear)) afterYear = e.year;
    }
    return events.filter((e) => e.year === beforeYear || e.year === afterYear);
  }

  function censusYears(p) {
    const tl = timeline(p);
    if (!tl || !tl.events.length) return [];
    const { events, lower, upper } = tl;
    const regions = new Map();
    for (const e of events) regions.set(e.region.key, e.region);
    // Bracketing (v0.2.21): a country's census for year Y is offered when one of the events
    // bracketing Y is in that country (only that country between two same-country events; both
    // when they differ); a state/provincial census when either bracketing event is in that state.
    // James Emmanuel Owen KP4S-LGG (b. 1866 England, m. 1892 England, d. 1927 BC): no Canadian
    // censuses before 1892, both countries 1901–1921. Before v0.2.21 every touched country got
    // every year.
    const bracket = (Y) => bracketAt(events, Y);
    const out = [];
    for (const region of regions.values()) {
      const candidates = [];
      for (const [y, id] of Object.entries(region.census)) candidates.push({ year: Number(y), id, sub: null });
      for (const s of region.subRegions || []) {
        if (!events.some((e) => e.sub === s)) continue;
        for (const [y, id] of Object.entries(s.years)) {
          if (!(y in region.census)) candidates.push({ year: Number(y), id, sub: s });
        }
      }
      for (const c of candidates) {
        const Y = c.year;
        if (Y < lower || Y > upper) continue;
        if ((region.attachedOnlyYears || []).includes(Y)) continue; // e.g. the destroyed 1890 US census
        const br = bracket(Y);
        if (br.length && !br.some((e) => e.region.key === region.key)) continue; // country not plausible in Y
        if (c.sub && !br.some((e) => e.sub === c.sub)) continue; // state census only when a bracketing event is in that state
        out.push({ year: Y, region, sub: c.sub, id: c.id || null });
      }
    }
    out.sort((a, b) => a.year - b.year || a.region.name.localeCompare(b.region.name));
    return out;
  }

  // Census titles — ONE wording for every menu (v0.2.123; Kevin: "add uniformity to the Census
  // menus provided for each website including FamilySearch"): "<year> <Where> Census", the 1939
  // Register as "<year> <Where> Register", the Where word from fs-collections.js's censusLabel /
  // censusLabels table (sub-region first — "1905 New York State Census" is never mistaken for the
  // federal one), so a wording change there follows into all five census groups: FamilySearch,
  // Ancestry, MyHeritage, Findmypast, ScotlandsPeople. Each menu appends " — <name>" in its own
  // name convention (full given names on FamilySearch / Ancestry / ScotlandsPeople, the first
  // given name on MyHeritage / Findmypast — what each site's URL sends). `censusTitle(c)` takes a
  // censusYears entry ({year, region, sub}); `censusTitleOf(year, where)` an explicit Where word
  // (Ancestry's separate England / Wales sets).
  const censusTitleOf = (year, where) => `${year} ${where} ${Number(year) === 1939 ? "Register" : "Census"}`;
  function censusTitle(c) {
    for (const src of [c.sub, c.region]) {
      if (!src) continue;
      const perYear = src.censusLabels && src.censusLabels[c.year];
      if (perYear) return `${c.year} ${perYear}`;
      if (src.censusLabel) return `${c.year} ${src.censusLabel}`;
      if (src.name) return censusTitleOf(c.year, src.name);
    }
    return `${c.year} Census`;
  }
  const regionByKey = (key) => ((FSSE.COLLECTIONS && FSSE.COLLECTIONS.regions) || []).find((r) => r.key === key) || null;
  FSSE.censusTitle = censusTitle; // exposed for tests
  FSSE.censusTitleOf = censusTitleOf;

  // Surname VARIANTS seen in the person's own attached records (v0.2.43): the principal name of
  // every FS-shaped, non-mentioned source title whose surname differs from the tree's — Edward
  // CUMMINGS's records are all indexed as CUMMINS. Only near spellings count (same initial, edit
  // distance ≤ 3), and a woman's married / a spouse's surname is never a variant. Feeds a
  // full-text entry and an all-collections entry per variant (exact-phrase full text gets no
  // fuzzy matching at all; the record search's is partial).
  const lastTokenOf = (nm) => {
    const bits = FSSE.nameTokens ? FSSE.nameTokens(nm) : String(nm || "").trim().split(/\s+/);
    return bits.length > 1 ? bits.at(-1) : "";
  };
  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[m][n];
  }
  function surnameVariants(p) {
    if (!p.surname || !Array.isArray(p.attachedSources)) return [];
    const known = new Set([p.surname, ...(p.marriedSurnames || []), ...(p.spouseSurnames || [])].filter(Boolean).map((s) => s.toLowerCase()));
    const base = p.surname.toLowerCase();
    const out = [];
    for (const s of p.attachedSources) {
      if (!s || typeof s !== "object" || s.mentioned || !s.collection || !s.principal) continue;
      const sn = lastTokenOf(s.principal);
      if (!sn) continue;
      const low = sn.toLowerCase();
      if (known.has(low) || out.some((x) => x.toLowerCase() === low)) continue;
      if (low[0] !== base[0] || editDistance(low, base) > 3) continue;
      out.push(sn);
    }
    return out;
  }
  FSSE.surnameVariants = surnameVariants; // exposed for tests

  // Inferred marriage window: age 18–30, capped by the death year and by the index's coverage.
  function marriageWindow(p, spec) {
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    if (by == null) return null;
    let from = by + 18;
    let to = by + 30;
    if (dy != null) to = Math.min(to, dy);
    if (spec) {
      from = Math.max(from, spec.from);
      to = Math.min(to, spec.to);
    }
    return from <= to ? { from, to } : null;
  }

  // ---- Unknown death window (v0.2.107; Kevin, 2026-10-09: "When a death date is not known for a
  // target relative, help me conceive an appropriate FreeBMD and GRO death search that could help
  // discover this unknown death date. Consider also the FamilySearch and FindMyPast menus") -----
  // The Death vital reads "Deceased" with no date: `deathYearOf` is null, `living` false. The
  // searchable window is [last seen, upper]. `last seen` = the latest year the page proves the
  // person alive — birth/christening, every dated marriage, every dated Other-Information fact
  // (residences…) and the census / 1939 Register years among the ATTACHED sources (an attached
  // "England and Wales Census, 1921" says alive in 1921 — decision 3, Kevin 2026-10-10: yes).
  // `upper` = birth + 100 (the life span `timeline()` already assumes — decision 1), or last seen
  // + 70 with no birth year at all, never past the current year. Each menu then searches the
  // window its own way: FreeBMD one entry, GRO a ladder of 5-year blocks, FamilySearch the date
  // range on every death tier, Findmypast's parish burials, ScotlandsPeople's year-from/to boxes.
  // Children's birth years would be the next alive-evidence, but they are not scraped (yet).
  const NOW_YEAR = new Date().getFullYear();
  const UNKNOWN_DEATH = "death year unknown";
  const YEAR_RANGE_RE = /\b(1[5-9]\d\d|20\d\d)\s*[-–—]\s*(1[5-9]\d\d|20\d\d|current|present)\b/i;
  const YEARS_RE = /\b(1[5-9]\d\d|20[0-2]\d)\b/g;
  // The years the attached sources prove the person alive: a single-year census or 1939 Register
  // title ("England and Wales Census, 1921" → 1921; Ancestry-style "1901 England Census" → 1901;
  // "England and Wales National Register, 1939" → 1939). A title with a year RANGE ("Birth Index,
  // 1837-1915") names a collection, not a year. Cached entries are objects {title, collection, …}
  // (v0.2.34+) or bare strings (older caches, tests) — both are read.
  function attachedAliveYears(p) {
    const out = [];
    if (!Array.isArray(p.attachedSources)) return out;
    const by = birthYearOf(p);
    for (const s of p.attachedSources) {
      const text = typeof s === "string" ? s : s && (s.collection || s.title);
      if (!text || YEAR_RANGE_RE.test(text)) continue;
      const census = /census/i.test(text);
      const register = !census && /\bregister\b/i.test(text) && /\b1939\b/.test(text);
      if (!census && !register) continue;
      const years = [...new Set((String(text).match(YEARS_RE) || []).map(Number))];
      if (years.length !== 1) continue;
      const year = years[0];
      if (year > NOW_YEAR || (by != null && year < by)) continue;
      const what = register ? `${year} Register` : `${year} census`;
      if (!out.some((x) => x.year === year && x.what === what)) out.push({ year, what, title: String(text) });
    }
    return out.sort((a, b) => a.year - b.year);
  }
  // → { from, to, by, seen: { year, what }, ageFrom, ageTo } or null (known death / living /
  // nothing on the page dates the person at all).
  function deathWindow(p) {
    if (p.living || deathYearOf(p) != null) return null;
    const by = birthYearOf(p);
    const seen = [];
    const push = (year, what) => {
      if (year == null || year > NOW_YEAR || (by != null && year < by)) return;
      seen.push({ year, what });
    };
    if (by != null) push(by, num(p.birthYear) != null ? `${by} birth` : `${by} christening`);
    for (const s of datedMarriages(p)) push(s.year, `${s.year} marriage`);
    for (const f of p.facts || []) push(num(f.year), `${num(f.year)} ${String(f.kind || "fact").toLowerCase()}`);
    for (const a of attachedAliveYears(p)) push(a.year, a.what);
    if (!seen.length) return null;
    let last = seen[0];
    for (const s of seen) if (s.year >= last.year) last = s; // later evidence wins a tie (a 1939 Register over a 1939 marriage)
    const from = last.year;
    let to = Math.min(by != null ? by + 100 : from + 70, NOW_YEAR);
    if (to < from) to = from;
    return { from, to, by, seen: last, ageFrom: by != null ? from - by : null, ageTo: by != null ? to - by : null };
  }
  FSSE.attachedAliveYears = attachedAliveYears; // exposed for tests
  FSSE.deathWindow = deathWindow; // exposed for tests
  // The tooltip phrase every unknown-death entry carries, for the window (or the part) it searches.
  const unknownDeathText = (dw, from, to) =>
    `${UNKNOWN_DEATH} — last seen ${dw.seen.year} (${dw.seen.what}), searched ${from === to ? from : `${from}–${to}`}${dw.by != null ? ` (to age ${to - dw.by})` : ""}`;
  // The surname(s) a death is searched under: a woman's married surname(s), minus any from a
  // marriage dated after the death year (inert when that year is unknown), maiden when she died
  // unmarried. The rule the older death blocks spell out inline.
  function deathSurnames(p, dy) {
    const married = p.marriedSurnames || [];
    const afterDeath = (sn) =>
      dy != null && spousesOf(p).some((s) => s.year != null && s.year > dy && s.surname.toLowerCase() === sn.toLowerCase());
    if (married.length && marriedBy(p, dy)) {
      const ok = married.filter((sn) => !afterDeath(sn));
      if (ok.length) return ok;
    }
    return [p.surname];
  }

  // ---- The content-aware option list for the "FamilySearch Records" menu ----------------------
  // Every entry is a search that can plausibly hit for THIS person; anything whose coverage
  // misses the known years (a GRO index for a pre-1837 birth, death indexes for a living person,
  // marriage searches for someone who died a child, censuses outside the life span) is left out.
  // Rules (from the companion app): civil-registration indexes get NO place (district-filed;
  // FS ranks by place, so a wrong one buries the record); censuses, christenings and the generic
  // fallback DO send the birthplace. Birth/marriage use the maiden surname; censuses and deaths
  // use a woman's married surname once married.
  // ---- Full-Text Search entries (v0.2.29) ----
  // FamilySearch Full-Text Search covers a fast-growing set of AI-indexed, text-rich
  // collections (probate, deeds, court and police records, …). Verified URL grammar:
  //   name search:   /en/search/full-text/results?count=20&q.text=%22Given%20Surname%22
  //                  [&q.anyDate.from=Y&q.anyDate.to=Y]   — the quotes make it an exact phrase,
  //                  so both names must sit close together in the record text
  //   simple search: /en/search/full-text/results?nlQuery=Given+Surname+<PID>   (v0.2.95 —
  //                  the native entry's own form; v0.2.29–94 sent count=20&nlQuery=<PID>&offset=0)
  //                  — FamilySearch expands the tree ID into the person's details and searches
  //                  on those (Kevin: "surprisingly helpful"; exact mechanics unknown)
  // Kevin's rules (2026-09-01): PID search LAST (it led the group until v0.2.32); the quoted
  // name with a date window (birth →
  // death + 2, probate and deeds post-date the death); for a woman one entry per married
  // surname, bounded from the marriage year when known; the un-dated variant only when a year
  // is missing; one spouse-pair entry per spouse (person's name + spouse's given name — a woman
  // is searched under that husband's surname). No place variant yet (unknown whether the
  // extra term narrows or widens results). `treeref` does nothing here, so it is not sent.
  const FULL_TEXT_GROUP = "Full text Search (AI-indexed records)";
  const FULL_TEXT_BASE = "https://www.familysearch.org/en/search/full-text/results";
  const fullTextUrl = (params) => {
    const parts = ["count=20"];
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
    }
    return `${FULL_TEXT_BASE}?${parts.join("&")}`;
  };
  const quoted = (s) => `"${s}"`;
  const spanOf = (from, to) => ({ "q.anyDate.from": from, "q.anyDate.to": to });
  const spanText = (from, to) => {
    if (from != null && to != null) return `${from}–${to}`;
    if (from != null) return `from ${from}`;
    if (to != null) return `to ${to}`;
    return "any date";
  };
  const AI_NOTE = "Full-text collections are AI-indexed, text-rich records (probate, deeds, court, police…).";

  function fullTextOptions(p) {
    const out = [];
    const add = (label, urlStr, tooltip) => out.push({ group: FULL_TEXT_GROUP, label, url: urlStr, tooltip });
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const to = dy != null ? dy + 2 : null; // +2: probate, deeds and obituaries follow the death
    const window = (from) => `${spanText(from, to)}` + (to != null ? " (death + 2)" : "");

    // The PID "simple search" goes LAST in the group (Kevin, 2026-09-01; it led until v0.2.32).
    // v0.2.95: the query is the NAME + the ID, exactly as the native "FamilySearch Full Text"
    // entry sends it (Kevin's find on Betsy Bellwood: `?nlQuery=Betsy+Bellwood+KHW2-6TP`;
    // the ID alone gave the same results but the name reads better on the results page).
    // Spaces are sent as `+` to match the native URL byte for byte; no count/offset.
    const own = fullName(p, p.surname);
    const addSimpleSearch = () => {
      if (!p.id) return;
      const terms = own ? `${own} ${p.id}` : p.id; // no scraped name yet → the ID alone
      const url = `${FULL_TEXT_BASE}?nlQuery=${terms.split(/\s+/).map(encodeURIComponent).join("+")}`;
      add(`Simple search — ${terms}`, url,
        `Full-text "simple search" on ${own ? `${own}, tree ID ${p.id}` : `tree ID ${p.id}`} — the same query as the native FamilySearch Full Text entry: FamilySearch expands the ID into the person's name, places and relatives and searches on those. ${AI_NOTE}`);
    };
    if (!own) {
      addSimpleSearch(); // no scraped name yet → the ID search is still offered
      return out;
    }
    const q = quoted(own);

    // 1. Own (maiden / Vitals) name inside the life span.
    add(`${q} ${spanText(by, to)}`, fullTextUrl({ ...spanOf(by, to), "q.text": q }),
      `Full text, exact phrase ${q}, ${window(by)}. ${AI_NOTE}`);
    // 1b. Surname variants seen in the person's attached records (v0.2.43) — an exact phrase
    //     never matches a different spelling, so "Edward Cummins" needs its own entry.
    for (const v of surnameVariants(p)) {
      const vq = quoted(fullName(p, v));
      add(`${vq} ${spanText(by, to)}`, fullTextUrl({ ...spanOf(by, to), "q.text": vq }),
        `Full text, exact phrase ${vq} — the surname spelling used by this person's own attached records, ${window(by)}. ${AI_NOTE}`);
    }

    // 2. A woman's married name(s), each from its marriage year when the tree dates it —
    //    minus any surname from a marriage dated after the death (mirrors the death entries).
    const spouses = spousesOf(p);
    const married = (p.marriedSurnames || []).filter(
      (sn) => !(dy != null && spouses.some((s) => s.year != null && s.year > dy && s.surname.toLowerCase() === sn.toLowerCase()))
    );
    for (const sn of married) {
      const m = spouses.find((s) => s.year != null && s.surname.toLowerCase() === sn.toLowerCase());
      const from = m ? m.year : by;
      const mq = quoted(fullName(p, sn));
      add(`${mq} ${spanText(from, to)}`, fullTextUrl({ ...spanOf(from, to), "q.text": mq }),
        `Full text, exact phrase ${mq} (married name${m ? `, from the ${m.year} marriage` : ""}), ${window(from)}. ${AI_NOTE}`);
    }

    // 3. No date window — only when a life bound is unknown (otherwise entry 1 covers it).
    if (by == null || to == null) {
      add(`${q} — any date`, fullTextUrl({ "q.text": q }),
        `Full text, exact phrase ${q}, no date limit (a life bound is unknown). ${AI_NOTE}`);
    }

    // 4. Spouse pairs: the person's quoted name + the spouse's given name as a REQUIRED term
    //    ("Charles Bellwood" +Margaret — Kevin's syntax, 2026-09-01: the quotes keep the
    //    person's names in close proximity, the + requires the spouse's name somewhere on the
    //    same page), so records naming the couple (deeds, probate, settlements) rank first.
    //    A woman is searched under that husband's surname — the pair with her maiden name is
    //    the marriage record itself, which the MARRIAGE entries already target.
    const female = (p.marriedSurnames || []).length > 0;
    for (const s of spouses) {
      const spouseGiven = (s.name || "").trim().split(/\s+/)[0];
      if (!spouseGiven || /^\W*$/.test(spouseGiven)) continue;
      const mine = female && s.surname ? fullName(p, s.surname) : own;
      const from = s.year != null ? s.year : by;
      const text = `${quoted(mine)} +${spouseGiven}`;
      add(`${text} ${spanText(from, to)}`, fullTextUrl({ ...spanOf(from, to), "q.text": text }),
        `Full text: the exact phrase ${quoted(mine)} with "${spouseGiven}" required on the same page — records naming the couple, ${window(from)}${s.year != null ? ` (from the ${s.year} marriage)` : ""}. ${AI_NOTE}`);
    }

    // 5. Simple search on the tree ID — last.
    addSimpleSearch();
    return out;
  }

  function recordOptions(p) {
    const out = [];
    // `match` (optional) = an attached-source descriptor (FSSE.specMatch / FSSE.censusMatch). When
    // the person's Sources tab has been scraped (p.attachedSources, see content.js) and a title
    // matches, the option carries `attached: <title>` — the menu dims it (v0.2.33).
    const add = (group, label, urlStr, tooltip, match) => {
      const o = { group, label, url: urlStr, tooltip: tooltip || label };
      const hit = match && p.attachedSources ? FSSE.findAttached(p.attachedSources, match) : null;
      if (hit) {
        o.attached = hit;
        o.tooltip = `✓ Already attached: "${hit}".\n${o.tooltip}`;
      } else if (match && p.attachedSources) {
        // Only a record naming the person in someone ELSE's entry (a child's christening…) is
        // attached from this collection — the person's own record may still be out there, so the
        // entry stays normal and the tooltip just says so.
        const mention = FSSE.findAttached(p.attachedSources, match, true);
        if (mention) {
          o.mentioned = mention;
          o.tooltip = `${o.tooltip}\nAttached so far: only a record that mentions this person — "${mention}".`;
        }
      }
      out.push(o);
    };
    const specMatch = (spec) => (FSSE.specMatch ? FSSE.specMatch(spec) : null);
    // Parents' names (v0.2.41) for the collections that index them — parish/church christenings,
    // the Australian aggregates, NUMIDENT and the all-collections search. Civil (GRO) indexes do
    // NOT get them: FS ranks rather than filters, so an un-indexed field only buries the record.
    const parentParams = {};
    if (p.father && (p.father.given || p.father.surname)) {
      parentParams["q.fatherGivenName"] = p.father.given;
      parentParams["q.fatherSurname"] = p.father.surname;
    }
    if (p.mother && (p.mother.given || p.mother.surname)) {
      parentParams["q.motherGivenName"] = p.mother.given;
      parentParams["q.motherSurname"] = p.mother.surname;
    }
    const parentsText = [p.father && p.father.name, p.mother && p.mother.name].filter(Boolean).join(" & ");
    const withParents = parentsText ? ` Parents sent: ${parentsText}.` : "";
    // Every record-search URL in this menu carries the person's PID (treeref= → "Person From
    // FamilySearch Tree" banner on the results page); recordSearchUrl drops it for other bases.
    const url = (params, id, base) => FSSE.recordSearchUrl(params, id, base, p.id);
    const by = birthYearOf(p); // christening year stands in for a missing birth year
    const dy = deathYearOf(p); // burial year stands in for a missing death year
    const name = (surname) => ({ "q.givenName": p.given, "q.surname": surname });
    const birthPlace = FSSE.placeForSearch(p.birthPlace) || FSSE.placeForSearch(p.christeningPlace);
    const birthDates = around("q.birthLikeDate", by);
    let born = "birth year unknown";
    if (num(p.birthYear) != null) born = `born ${by} ±2`;
    else if (by != null) born = `christened ${by} ±2`;

    // Census — one entry per census year (and country) inside the life span. The label is the
    // shared census title (v0.2.123 — "1841 E&W Census", "1900 US Federal Census", "1905 New York
    // State Census", "1939 E&W Register"; the same wording on every menu) + the person's name
    // under the surname of that year (a married woman's surname flips at her marriage).
    for (const c of censusYears(p)) {
      const surname = surnameAt(p, c.year);
      const params = { ...name(surname), ...birthDates, "q.birthLikePlace": birthPlace };
      if (!c.id) params["q.residencePlace"] = c.region.searchPlace; // no single collection → keep it in-country
      const title = censusTitle(c);
      add(
        "Census",
        `${title} — ${fullName(p, surname)}`,
        url(params, c.id),
        `${title}: ${fullName(p, surname)}, ${born}${birthPlace ? `, born in ${birthPlace}` : ""}` +
          (c.id ? "" : " (no single FS collection — searches all records in-country)"),
        FSSE.censusMatch ? FSSE.censusMatch(c) : null
      );
    }

    // Birth — the civil index when it covers the birth year, the parish/church aggregate when
    // it does (both may apply, e.g. an 1860 English birth), else nothing here (the "All
    // collections" entry at the bottom still searches by birth).
    const bRegion = regionOf(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
    const bClass = classOf(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
    const civilB = FSSE.indexTier(bClass, "birth", by, null, dy);
    if (civilB) {
      // `place: true` = a state/provincial register indexed by town → the place helps; a national
      // civil index (GRO) files by registration district → no place.
      add("Birth", civilB.short, url({ ...name(p.surname), ...birthDates, ...(civilB.place ? { "q.birthLikePlace": birthPlace } : {}) }, civilB.collectionId),
        `${civilB.name}: ${fullName(p, p.surname)}, ${born}${civilB.place && birthPlace ? `, ${birthPlace}.` : ". No place sent (the index files by registration district)."}`,
        specMatch(civilB));
    }
    // Parish / church aggregates: the christening's own year and place beat the birth's — the
    // christening happened AT the parish church, so its place is exactly what the register says.
    // One entry per DISTINCT region among the christening place and the birth place, each sending
    // its own event's place: James Sidney Owen KHJX-Y4T was born in Hamilton, Scotland but
    // christened in Barnsley, England — his christening record is in an ENGLISH register, so he
    // gets both the England parish entry (Barnsley) and the Scotland one (Hamilton). Same-country
    // birth + christening (the usual case) collapses to a single entry.
    const chrYear = num(p.christeningYear) != null ? num(p.christeningYear) : by;
    const chrText = num(p.christeningYear) != null ? `christened ${p.christeningYear} ±2` : born;
    const parishEvents = [
      { region: regionOf(p.christeningPlace), cls: classOf(p.christeningPlace), place: FSSE.placeForSearch(p.christeningPlace), text: chrText },
      { region: bRegion, cls: bClass, place: birthPlace, text: p.christeningPlace ? born : chrText },
    ];
    const parishSeen = new Set();
    for (const ev of parishEvents) {
      if (!ev.region || parishSeen.has(ev.region.key)) continue;
      parishSeen.add(ev.region.key);
      const spec = FSSE.indexTier(ev.cls, "christening", chrYear, null, dy);
      if (!spec) continue;
      const place = ev.place || FSSE.placeForSearch(p.christeningPlace) || birthPlace;
      add("Birth", spec.short,
        url({ ...name(p.surname), ...around("q.birthLikeDate", chrYear), "q.birthLikePlace": place, ...parentParams }, spec.collectionId),
        `${spec.name}: ${fullName(p, p.surname)}, ${ev.text}${place ? `, ${place}` : ""}.${withParents}`,
        specMatch(spec));
    }

    // Marriage — only for people who plausibly reached marrying age (unknown years pass).
    const adult = (p.spouses || []).length > 0 || (p.spouseSurnames || []).length > 0 || by == null || dy == null || dy - by >= 16;
    if (adult) {
      const allSpouses = spousesOf(p);
      const dated = allSpouses.filter((s) => s.year != null);
      const undated = allSpouses.filter((s) => s.year == null);

      // (a) Marriages dated on the page: searched ±2 around the real year. Up to TWO entries per
      // marriage — the CIVIL index (spouse filter only when it names spouses in that year, e.g. E&W
      // GRO from 1912; no place: district-filed) and the CHURCH/parish aggregate (names the spouse
      // and is indexed by place, so both go in). Only when NEITHER covers the year does the
      // all-collections fallback (with the marriage place) appear.
      const noSpouseWhy = (spec) =>
        spec.spouseFrom >= 9000 ? "this index does not name spouses" : `this index names spouses only from ${spec.spouseFrom}`;
      for (const s of dated) {
        const region = regionOf(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        const mCls = classOf(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        const civil = FSSE.indexTier(mCls, "marriage", s.year, null, null);
        const church = FSSE.indexTier(mCls, "churchMarriage", s.year, null, null);
        const mPlace = FSSE.placeForSearch(s.marriagePlace);
        const dates = around("q.marriageLikeDate", s.year);
        const when = `married ${s.marriageDate || s.year} (searched ${s.year - 2}–${s.year + 2})${s.marriagePlace ? `, ${s.marriagePlace}` : ""}`;
        if (civil) {
          const useSpouse = civil.spouseFrom == null || s.year >= civil.spouseFrom;
          const params = { ...name(p.surname), ...dates };
          if (useSpouse) params["q.spouseSurname"] = s.surname;
          if (civil.place) params["q.marriageLikePlace"] = mPlace; // state/provincial register → town-indexed
          add("Marriage", `${civil.short} — ${s.year}${useSpouse ? `, spouse ${s.surname}` : ` (${s.surname})`}`,
            url(params, civil.collectionId),
            `${civil.name}: ${fullName(p, p.surname)}${useSpouse ? ` + spouse surname ${s.surname}` : ""}, ${when}.` +
              (useSpouse ? "" : ` Spouse filter omitted — ${noSpouseWhy(civil)}.`) +
              (s.marriagePlace && !civil.place ? " No place sent (the index files by registration district)." : ""),
            specMatch(civil));
        }
        if (church) {
          add("Marriage", `${church.short} — ${s.year}, spouse ${s.surname}`,
            url({ ...name(p.surname), ...dates, "q.marriageLikePlace": mPlace, "q.spouseSurname": s.surname }, church.collectionId),
            `${church.name}: ${fullName(p, p.surname)} + spouse surname ${s.surname}, ${when}.`,
            specMatch(church));
        }
        if (!civil && !church) {
          const long = region
            ? "all record collections (no regional marriage index covers this year)"
            : "all record collections (no known country to pick an index for)";
          add("Marriage", `Marriage — all collections — ${s.year}, spouse ${s.surname}`,
            url({ ...name(p.surname), ...dates, "q.marriageLikePlace": mPlace, "q.spouseSurname": s.surname }, null),
            `${long}: ${fullName(p, p.surname)} + spouse surname ${s.surname}, ${when}.`,
            FSSE.regionMatch ? FSSE.regionMatch(region, "marriages?") : null);
        }
      }

      // (b) Spouses without a marriage date (or no spouse at all): the inferred window (age 18–30,
      // capped by death and by the index coverage). One entry per such spouse when the index names
      // spouses for the whole window; otherwise a single entry without the spouse filter (a filter
      // on an unnamed-spouse index returns zero).
      if (undated.length || !allSpouses.length) {
        const mRegion = regionOf(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        const mCls = classOf(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        const raw = marriageWindow(p, null);
        const lo = raw ? raw.from : by;
        const hi = raw ? raw.to : dy;
        const civil = FSSE.indexTier(mCls, "marriage", null, lo, hi);
        const church = FSSE.indexTier(mCls, "churchMarriage", null, lo, hi);
        // Surnames of the undated spouses (or, with no couple blocks scraped, any surname list we have).
        const spouses = allSpouses.length ? [...new Set(undated.map((s) => s.surname))] : p.spouseSurnames || [];
        // Entries for one index (`spec` null = the all-collections fallback): one per spouse when the
        // index names spouses for the whole window, otherwise a single entry without the filter.
        const addInferred = (spec, longNoSpec) => {
          const win = marriageWindow(p, spec);
          const base = { ...name(p.surname) };
          if (win) {
            base["q.marriageLikeDate.from"] = win.from;
            base["q.marriageLikeDate.to"] = win.to;
          }
          const short = spec ? spec.short : "Marriage — all collections";
          const long = spec ? spec.name : longNoSpec;
          const winText = win ? `married ${win.from}–${win.to} (inferred: age 18–30)` : "no date window (birth year unknown)";
          const spouseOk = !spec || spec.spouseFrom == null || (win && win.from >= spec.spouseFrom);
          const match = spec ? specMatch(spec) : FSSE.regionMatch ? FSSE.regionMatch(mRegion, "marriages?") : null;
          if (spouses.length && spouseOk) {
            for (const s of spouses) {
              add("Marriage", `${short} — spouse ${s}`, url({ ...base, "q.spouseSurname": s }, spec ? spec.collectionId : null),
                `${long}: ${fullName(p, p.surname)} + spouse surname ${s}, ${winText} — no marriage date on the page.`,
                match);
            }
          } else {
            add("Marriage", short, url(base, spec ? spec.collectionId : null),
              `${long}: ${fullName(p, p.surname)}, ${winText}.` +
                (spouses.length && spec ? ` Spouse filter omitted — ${noSpouseWhy(spec)}.` : ""),
              match);
          }
        };
        if (civil) addInferred(civil);
        if (church) addInferred(church);
        if (!civil && !church) {
          addInferred(null, mRegion
            ? "all record collections (no regional marriage index covers these years)"
            : "all record collections (no known country to pick an index for)");
        }
      }
    }

    // Migration (v0.2.40) — every pair of CONSECUTIVE timeline events in different countries is
    // a move; the window runs from the earlier event to the later one. Origin-side collections
    // (departure lists) match the country left, destination-side ones the country entered. A
    // collection hit by several moves gets one entry spanning them. Sends the name (surname as
    // of the window start), the birth window (lists carry ages) and the window as q.anyDate.
    {
      const tl = timeline(p);
      const moves = [];
      if (tl) {
        for (let i = 1; i < tl.events.length; i++) {
          const a = tl.events[i - 1];
          const b = tl.events[i];
          if (a.region.key !== b.region.key) moves.push({ a, b });
        }
      }
      const hits = new Map(); // spec.key → { spec, from, to, moves: [] }
      for (const mv of moves) {
        for (const spec of FSSE.COLLECTIONS.migration || []) {
          const side = spec.side === "origin" ? mv.a : mv.b;
          if (!spec.regions.includes(side.region.key)) continue;
          if (spec.fromRegions && !spec.fromRegions.includes(mv.a.region.key)) continue;
          const from = Math.max(mv.a.year, spec.from);
          const to = Math.min(mv.b.year, spec.to);
          if (from > to) continue;
          const h = hits.get(spec.key) || { spec, from, to, moves: [] };
          h.from = Math.min(h.from, from);
          h.to = Math.max(h.to, to);
          h.moves.push(mv);
          hits.set(spec.key, h);
        }
      }
      for (const h of hits.values()) {
        const surname = surnameAt(p, h.from);
        const why = h.moves.map((mv) => `${mv.a.region.name} → ${mv.b.region.name} between the ${mv.a.label} and the ${mv.b.label}`).join("; ");
        add("Migration", `${h.spec.short} — ${h.from}–${h.to}`,
          url({ ...name(surname), ...birthDates, "q.anyDate.from": h.from, "q.anyDate.to": h.to }, h.spec.collectionId),
          `${h.spec.name}: ${fullName(p, surname)}, ${born}, any event ${h.from}–${h.to}. ${why}.`,
          specMatch(h.spec));
      }
    }

    // Military (v0.2.40) — men (unknown sex passes) born inside the spec's birth-year band, alive
    // at the registration/service year, and in one of the spec's countries at that year per the
    // timeline bracketing. Sends the name + birth window (the cards carry the date of birth).
    if (!/female/i.test(p.sex || "")) {
      const tl = timeline(p);
      for (const spec of FSSE.COLLECTIONS.military || []) {
        if (by == null || by < spec.bornFrom || by > spec.bornTo) continue;
        if (dy != null && dy < spec.year) continue;
        const br = tl ? bracketAt(tl.events, spec.year) : [];
        if (!br.some((e) => spec.regions.includes(e.region.key))) continue;
        if (spec.sub && !br.some((e) => e.sub && e.sub.key === spec.sub)) continue; // per-state collection
        add("Military", spec.short, url({ ...name(p.surname), ...birthDates }, spec.collectionId),
          `${spec.name}: ${fullName(p, p.surname)}, ${born} (aged ${spec.year - by} in ${spec.year}). No place sent.`,
          specMatch(spec));
      }
    }

    // Death — skipped for a living person. Civil index tier covering the death year, then
    // Find A Grave (worldwide, era-open). A woman gets one entry per married surname.
    // v0.2.107 — DEATH YEAR UNKNOWN: with a `deathWindow` (see above) EVERY death tier whose
    // coverage overlaps the window is offered, each over window ∩ coverage as its date range
    // (FS ranks rather than filters, so a wide window only orders the results), labelled
    // "… — 1939–1980 (death year unknown)"; the civil tier also gets the birth ±2 (the index
    // records the age at death, from which FS estimates a birth year — believed, not verified:
    // drop it if a click shows it hurts). With no window at all (nothing on the page dates the
    // person) the old behaviour stands: the tier overlapping the birth, no dates.
    if (!p.living) {
      const deathDates = around("q.deathLikeDate", dy);
      let died = "death year unknown";
      if (num(p.deathYear) != null) died = `died ${dy} ±2`;
      else if (dy != null) died = `buried ${dy} ±2`;
      const dw = dy == null ? deathWindow(p) : null;
      // A woman's married surname(s) — minus any from a marriage dated AFTER the death year
      // (a tree error, but cheap to respect); maiden name when she died unmarried.
      const surnames = deathSurnames(p, dy);
      const many = surnames.length > 1;
      const dCls = classOf(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace);
      // The tiers of `key` to offer, each with its own dates + wording: ONE (the first covering
      // the death year / overlapping the birth) as before — or, death year unknown with a
      // window, every tier the window reaches, over window ∩ coverage.
      const tiersFor = (key) => {
        if (!dw) {
          const s = FSSE.indexTier(dCls, key, dy, by, null);
          return s ? [{ spec: s, dates: deathDates, died, suffix: "" }] : [];
        }
        return FSSE.indexTiers(dCls, key)
          .filter((s) => s.from <= dw.to && s.to >= dw.from)
          .map((s) => {
            const f = Math.max(dw.from, s.from);
            const t = Math.min(dw.to, s.to);
            return { spec: s, dates: { "q.deathLikeDate.from": f, "q.deathLikeDate.to": t }, died: unknownDeathText(dw, f, t), suffix: ` — ${f}–${t} (${UNKNOWN_DEATH})` };
          });
      };
      const civilTiers = tiersFor("death");
      // US NUMIDENT (v0.2.39): Social Security files of deceased people, indexed by birth AND death
      // date (plus parents' names and birth place) — both windows go in, no place.
      const numidentTiers = tiersFor("numident");
      // E&W probate calendar (v0.2.40): indexed by the death date; wills and administrations.
      const probateTiers = tiersFor("probate");
      // Parish/church burial aggregate: indexed by place, so it gets the burial (else death) place.
      const churchTiers = tiersFor("churchBurial");
      const burialPlace = FSSE.placeForSearch(p.burialPlace) || FSSE.placeForSearch(p.deathPlace);
      const fag = FSSE.COLLECTIONS.findAGrave;
      const fagTiers = dw
        ? [{ spec: fag, dates: { "q.deathLikeDate.from": dw.from, "q.deathLikeDate.to": dw.to }, died: unknownDeathText(dw, dw.from, dw.to), suffix: ` — ${dw.from}–${dw.to} (${UNKNOWN_DEATH})` }]
        : FSSE.specApplies(fag, dy, by, null) ? [{ spec: fag, dates: deathDates, died, suffix: "" }] : [];
      const birthNote = dw && by != null ? " Birth ±2 also sent — the index records the age at death, from which FamilySearch estimates a birth year." : "";
      for (const sn of surnames) {
        const who = fullName(p, sn);
        const label = (t) => t.spec.short + (many ? ` — ${who}` : "") + t.suffix;
        for (const t of civilTiers) {
          add("Death", label(t),
            url({ ...name(sn), ...(dw ? birthDates : {}), ...t.dates, ...(t.spec.place ? { "q.deathLikePlace": burialPlace } : {}) }, t.spec.collectionId),
            `${t.spec.name}: ${who}, ${t.died}${t.spec.place && burialPlace ? `, ${burialPlace}.` : ". No place sent (the index files by registration district)."}${birthNote}`,
            specMatch(t.spec));
        }
        for (const t of numidentTiers) {
          add("Death", label(t), url({ ...name(sn), ...birthDates, ...t.dates, ...parentParams }, t.spec.collectionId),
            `${t.spec.name}: ${who}, ${born}, ${t.died}. Social Security application, claim and death files of deceased people — each record carries the birth date and place, parents' names and death date. Searched on both the birth and death windows; no place sent.${withParents}`,
            specMatch(t.spec));
        }
        for (const t of probateTiers) {
          add("Death", label(t), url({ ...name(sn), ...t.dates }, t.spec.collectionId),
            `${t.spec.name}: ${who}, ${t.died}. The National Probate Calendar — date of death, date of probate, executors / administrators and estate value. No place sent.`,
            specMatch(t.spec));
        }
        for (const t of churchTiers) {
          add("Death", label(t),
            url({ ...name(sn), ...t.dates, "q.deathLikePlace": burialPlace }, t.spec.collectionId),
            `${t.spec.name}: ${who}, ${t.died}${burialPlace ? `, ${burialPlace}` : ""}.`,
            specMatch(t.spec));
        }
        for (const t of fagTiers) {
          add("Death", label(t), url({ ...name(sn), ...t.dates }, t.spec.collectionId),
            `${t.spec.name} (worldwide): ${who}, ${t.died}.`,
            specMatch(t.spec));
        }
      }
    }

    // Full text — the two broad searches sit together at the bottom (v0.2.29).
    out.push(...fullTextOptions(p));

    // Everything — v0.2.101 (Kevin: ONE FamilySearch entry point): FamilySearch's OWN
    // historical-records search leads the group as "Indexed Historical Records". content.js
    // hides the native FamilySearch row / Labs "FamilySearch Records" entry while our row is
    // present and hands over the link it carried (p.nativeUrls["fs-records"]) — FamilySearch's
    // own pre-fill (name, dates, places, relatives), opened byte-for-byte. When that row carries
    // no link, or the layout has no such row (the narrow third-party-only panel), a record
    // search of our own stands in: name + birth ±2 + birthplace + death ±2 + death place on
    // the unfiltered /search/record/results (FS ranks by place rather than filtering).
    // v0.2.105 (Kevin: "let FamilySearch build the needed URL rather than assume"): whenever
    // the native row is on the page the click is HANDED TO IT (nativeClick) — FamilySearch
    // builds the search itself; a link read off the row is kept only as the reserve URL for a
    // row that vanished between ticks, else our own grammar is the reserve. No row at all (the
    // narrow third-party-only panel) → our own search, and the tooltip says so.
    const fsName = fullName(p, p.surname);
    const fsNative = nativeUrlOf(p, "fs-records");
    const fsRow = nativeRowOf(p, "fs-records") || !!fsNative;
    if (fsRow || p.given || p.surname) {
      const dPlace = p.living ? "" : FSSE.placeForSearch(p.deathPlace) || FSSE.placeForSearch(p.burialPlace);
      const dWindow = p.living ? {} : around("q.deathLikeDate", dy);
      let lived = born;
      if (!p.living && dy != null) lived += num(p.deathYear) != null ? `, died ${dy} ±2` : `, buried ${dy} ±2`;
      add("Everything", "Indexed Historical Records",
        fsNative || url({ ...name(p.surname), ...birthDates, "q.birthLikePlace": birthPlace, ...dWindow, "q.deathLikePlace": dPlace }, null),
        fsRow
          ? `FamilySearch's indexed historical records for ${fsName || "this person"} — FamilySearch's own entry (hidden behind this menu) runs it: your click is handed to it, so FamilySearch builds the search itself, with the name, dates, places and relatives from the tree.`
          : `FamilySearch's indexed historical records: ${fsName}, ${lived}${birthPlace ? `, born in ${birthPlace}` : ""}${dPlace ? `, died in ${dPlace}` : ""}. (The native FamilySearch search link was not found on this page, so this search is built from the tree's vitals.)`);
      if (fsRow) out[out.length - 1].nativeClick = true;
    }
    // Then the unfiltered All-Collections search, anchored on the birth (maiden name +
    // birth year ±2 + birthplace). Needs only a name, so every person gets it. One more per
    // surname variant seen in the attached records (v0.2.43).
    if (p.given || p.surname) {
      add("Everything", "All collections", url({ ...name(p.surname), ...birthDates, "q.birthLikePlace": birthPlace, ...parentParams }, null, FSSE.COLLECTIONS.allCollectionsBase),
        `All FamilySearch collections: ${fullName(p, p.surname)}, ${born}${birthPlace ? `, ${birthPlace}` : ""}.${withParents}`);
      for (const v of surnameVariants(p)) {
        add("Everything", `All collections — as ${v}`, url({ ...name(v), ...birthDates, "q.birthLikePlace": birthPlace, ...parentParams }, null, FSSE.COLLECTIONS.allCollectionsBase),
          `All FamilySearch collections under the surname ${v} — the spelling used by this person's own attached records: ${fullName(p, v)}, ${born}${birthPlace ? `, ${birthPlace}` : ""}.${withParents}`);
      }
    }

    // First-given-name variant (v0.2.43): "Doris Annie" is often indexed as just "Doris". Every
    // entry whose URL carries the full given name gets an `altUrl` with the FIRST given name only,
    // opened by Shift+click (see injectMenu) — no extra rows.
    const firstGiven = String(p.given || "").trim().split(/\s+/)[0] || "";
    const fullEnc = p.given ? encodeURIComponent(p.given) : "";
    if (firstGiven && fullEnc && firstGiven !== p.given.trim()) {
      const firstEnc = encodeURIComponent(firstGiven);
      for (const o of out) {
        if (!o.url || !o.url.includes(fullEnc)) continue;
        o.altUrl = o.url.split(fullEnc).join(firstEnc);
        o.tooltip = `${o.tooltip}\nShift+click: first name only ("${firstGiven}").`;
      }
    }
    return out;
  }

  // Footer line under the Records menu: the attached-source status (v0.2.33). Clickable → the
  // person's Sources tab (the scrape happens there). p.attachedSources = null until that tab has
  // been visited once; p.attachedMeta = { count, scrapedAt } from the cache; p.sourcesCount = the
  // total shown on the current page (null when FS does not render one) — a mismatch means the
  // sources changed since the last look.
  function recordsFooter(p) {
    if (!p.id || !FSSE.sourcesTabUrl) return null;
    const url = FSSE.sourcesTabUrl(p.id);
    if (!p.attachedSources) {
      return {
        text: "Open the Sources tab once to mark searches already attached",
        url,
        tooltip: "The Records menu can dim searches whose collection is already attached to this person. FamilySearch lists the attached sources only on the Sources tab, so it has to be viewed once (per person) for the marks to appear.",
      };
    }
    const meta = p.attachedMeta || {};
    const when = meta.scrapedAt ? new Date(meta.scrapedAt).toLocaleDateString() : "";
    const n = p.attachedSources.length;
    const stale = meta.count != null && p.sourcesCount != null && meta.count !== p.sourcesCount;
    // "17 titles read from 35 sources" when the tab lists more than were read (paged list).
    const read = meta.count != null ? `${n} distinct title${n === 1 ? "" : "s"} read from ${meta.count} source${meta.count === 1 ? "" : "s"}` : `${n} source title${n === 1 ? "" : "s"} read from the Sources tab`;
    return {
      text: `✓ = already attached (${read}${when ? ` on ${when}` : ""})` +
        (stale ? " — sources changed since; click to refresh" : ""),
      url,
      tooltip: stale
        ? `The Sources tab showed ${meta.count} sources when last read; this page shows ${p.sourcesCount}. Click to open the Sources tab and refresh the marks.`
        : "Click to open the Sources tab and refresh the marks. Matching is by collection title, so a record that merely MENTIONS this person (e.g. a child's christening) can show as attached — entries are dimmed, never hidden.",
    };
  }

  // ---- Ancestry searches (the "Ancestry Records" menu, v0.2.45) --------------------------------
  // Verified URL grammar: name=Given_Surname (underscore before the surname), birth=YEAR,
  // death=YEAR — the same params work on the global search (/search/) and on a collection
  // (/search/collections/1030/ = Public Member Trees, click-verified). The global search also
  // takes priority=<slug>, Ancestry's restrict-to-country filter (Kevin, 2026-09-03: e.g.
  // priority=usa), and gender=m|f. The priority slugs below are the ones WikiTree Sourcer
  // ships in production for the same purpose. ⏳ priority/gender not yet click-verified here.
  const ANCESTRY_PRIORITY = {
    enw: { country: "England", priority: "english" }, // a Welsh place → welsh (see ancestryFocus)
    scotland: { country: "Scotland", priority: "scottish" },
    ireland: { country: "Ireland", priority: "irish" },
    us: { country: "United States", priority: "usa" },
    canada: { country: "Canada", priority: "canada" },
    au: { country: "Australia", priority: "australian" },
    nz: { country: "New Zealand", priority: "new-zealand" },
  };
  // Every country the person's placed events touch, birth-first (v0.2.46, Kevin's ask on
  // Elizabeth Swanson 9CVR-1Y1: born Scotland, residence facts all in England → offer BOTH).
  // Order: birth, christening, marriages, Other-Information facts (residences, migration,
  // military service), death, burial — so the first entry is the old "focus" country. The enw
  // region covers England AND Wales but Ancestry restricts them separately, so each classifying
  // place is re-tested for Wales. (New South Wales classifies as au before enw.)
  function ancestryCountries(p) {
    const places = [p.birthPlace, p.christeningPlace];
    for (const s of p.spouses || []) places.push(s.marriagePlace);
    for (const f of p.facts || []) places.push(f.place);
    places.push(p.deathPlace, p.burialPlace);
    const out = [];
    for (const pl of places) {
      const c = classify(pl);
      if (!c) continue;
      const entry = c.region.key === "enw" && /\bwales\b/i.test(pl || "")
        ? { country: "Wales", priority: "welsh" }
        : ANCESTRY_PRIORITY[c.region.key];
      if (entry && !out.some((x) => x.priority === entry.priority)) out.push(entry);
    }
    return out;
  }
  // v0.2.133: the regional Ancestry site every URL we build opens on (the settings page's "Ancestry"
  // dropdown, "Ancestry opens on" until v0.2.136 — ancestry.com by default; ancestry.co.uk, .ca, .com.au, …; the search
  // grammar and the collection ids are the same on every regional host). FamilySearch's own
  // "All Collections" hand-over is untouched — FS sends that click where it will.
  // v1.0.4: `host` overrides the setting — the "Ancestry Institution" menu (a FamilySearch Center's
  // row) builds every URL on ancestryinstitution.com whatever the dropdown says.
  const ancHost = (host) => `https://www.${host || (FSSE.settings && FSSE.settings.get("host.ancestry")) || "ancestry.com"}`;
  FSSE.ancestryHost = ancHost;
  function ancestrySearchUrl(p, surname, priority, host) {
    const u = new URL(`${ancHost(host)}/search/`);
    if (p.given || surname) u.searchParams.set("name", `${p.given || ""}_${surname || ""}`.trim());
    const by = birthYearOf(p); // christening/burial years stand in, as everywhere else
    const dy = deathYearOf(p);
    if (by != null) u.searchParams.set("birth", String(by));
    if (dy != null) u.searchParams.set("death", String(dy));
    if (/^f/i.test(p.sex || "")) u.searchParams.set("gender", "f");
    else if (/^m/i.test(p.sex || "")) u.searchParams.set("gender", "m");
    if (priority) u.searchParams.set("priority", priority);
    return u.toString();
  }
  function ancestryPmtUrl(p, host) {
    // Collection 1030 = Ancestry Public Member Trees (the pre-v0.2.45 top-level row, verbatim).
    const u = new URL(`${ancHost(host)}/search/collections/1030/`);
    if (p.given || p.surname) u.searchParams.set("name", `${p.given || ""}_${p.surname || ""}`.trim());
    if (p.birthYear) u.searchParams.set("birth", p.birthYear);
    if (p.deathYear) u.searchParams.set("death", p.deathYear);
    return u.toString();
  }
  // ---- Ancestry collection searches (v0.2.119; Kevin: "please expand the Ancestry menus to include
  // Census, Civil Records and Parish Records - just as we have for FindMyPast") ----------------------
  // Every id below was read off its collection page's <title> on 2026-10-26 (ancestry.com answers a
  // plain curl) or comes from WikiTree Sourcer's production table (record_collections.mjs), whose
  // spot-checks all matched. Grammar = Sourcer's ancestry_uri_builder, proven on the 1030 PMT entry
  // since v0.1: /search/collections/<id>/?name=First+Middle_Last&birth=<y>_<Place-With-Dashes>
  // &death=…&marriage=…&residence=_<place>&spouse=F_L&father=F_L&mother=F_L&gender=m|f — commas in
  // a place become "-", spaces "+", encodeURI on the rest; years carry no ± (Ancestry ranks, it does
  // not filter). The civil indexes get NO place (district-filed, the rule everywhere in this file);
  // censuses and parish sets do. Not found on Ancestry (left out): the 1911 Irish census, Irish
  // "Select" parish sets, the 1865/1875/1892 New York state censuses, the 1926 Prairie census.
  const ANC_CENSUS = {
    // England & Wales: [England id, Wales id] — Ancestry splits them; the Wales set is offered for a
    // Wales-touched person beside the English one. 1921: England only. 1939 = the Register (E&W).
    enw: { 1841: ["8978", "8979"], 1851: ["8860", "8861"], 1861: ["8767", "8768"], 1871: ["7619", "7618"], 1881: ["7572", "8059"], 1891: ["6598", "6897"], 1901: ["7814", "7815"], 1911: ["2352", "2353"], 1921: ["63150", null], 1939: ["61596", "61596"] },
    scotland: { 1841: "1004", 1851: "1076", 1861: "1080", 1871: "1104", 1881: "1119", 1891: "1108", 1901: "1101" },
    ireland: { 1901: "70667" },
    us: { 1790: "5058", 1800: "7590", 1810: "7613", 1820: "7734", 1830: "8058", 1840: "8057", 1850: "8054", 1860: "7667", 1870: "7163", 1880: "6742", 1900: "7602", 1910: "7884", 1920: "6061", 1930: "6224", 1940: "2442", 1950: "62308" },
    canada: { 1851: "1061", 1861: "1570", 1871: "1578", 1881: "1577", 1891: "1274", 1901: "8826", 1911: "8947", 1921: "8991", 1931: "62640" },
  };
  const ANC_SUB_CENSUS = { ny: { 1855: "7181", 1905: "7364", 1915: "2703", 1925: "2704" }, prairie: { 1906: "8827", 1916: "1556" } };
  // Civil registration / vital indexes per region (coverage from the collection titles).
  const ANC_CIVIL = {
    enw: {
      birth: [{ id: "8912", from: 1837, to: 1915, name: "E&W civil births 1837–1915" }, { id: "8782", from: 1916, to: 2007, name: "E&W civil births 1916–2007" }],
      marriage: [{ id: "8913", from: 1837, to: 1915, name: "E&W civil marriages 1837–1915" }, { id: "8753", from: 1916, to: 2005, name: "E&W civil marriages 1916–2005" }],
      death: [{ id: "8914", from: 1837, to: 1915, name: "E&W civil deaths 1837–1915" }, { id: "7579", from: 1916, to: 2007, name: "E&W civil deaths 1916–2007" }],
      probate: [{ id: "1904", from: 1858, to: 1995, name: "E&W probate calendar 1858–1995" }],
    },
    ireland: {
      birth: [{ id: "2573", from: 1864, to: 1958, name: "Ireland civil births 1864–1958" }],
      marriage: [{ id: "2572", from: 1845, to: 1958, name: "Ireland civil marriages 1845–1958" }],
      death: [{ id: "2534", from: 1864, to: 1958, name: "Ireland civil deaths 1864–1958" }],
    },
    us: { death: [{ id: "3693", from: 1935, to: 2014, name: "US Social Security Death Index 1935–2014" }] },
    au: {
      birth: [{ id: "1778", from: 1788, to: 1922, name: "Australia births 1788–1922" }],
      marriage: [{ id: "1780", from: 1788, to: 1950, name: "Australia marriages 1788–1950" }],
      death: [{ id: "1779", from: 1787, to: 1985, name: "Australia deaths 1787–1985" }],
    },
  };
  // State / provincial vital indexes, chosen by a word in the EVENT's place (these have no FS
  // sub-region of their own). Each needs the region too: "Victoria, British Columbia" is Canada.
  const ANC_CIVIL_SUB = [
    { re: /\bvictoria\b/i, region: "au", name: "Victoria", birth: { id: "61648", from: 1837, to: 1921 }, marriage: { id: "61649", from: 1837, to: 1962 }, death: { id: "61650", from: 1840, to: 1992 } },
    { re: /\bontario\b/i, region: "canada", name: "Ontario", birth: { id: "8838", from: 1856, to: 1919 }, marriage: { id: "7921", from: 1826, to: 1943 }, death: { id: "8946", from: 1869, to: 1953 } },
    { re: /\bbritish\s+columbia\b/i, region: "canada", name: "British Columbia", marriage: { id: "6095", from: 1872, to: 1935 }, death: { id: "6093", from: 1872, to: 1990 } },
    { re: /\bnova\s+scotia\b/i, region: "canada", name: "Nova Scotia", birth: { id: "1643", from: 1840, to: 1921 }, marriage: { id: "1644", from: 1763, to: 1945 }, death: { id: "1645", from: 1864, to: 1970 } },
  ];
  // Parish / church aggregates (the FamilySearch-derived "Select" sets). England's are England only —
  // a Welsh place gets none; Scotland has no burials set.
  const ANC_PARISH = {
    enw: { baptism: { id: "9841", from: 1538, to: 1975, name: "England parish baptisms 1538–1975" }, marriage: { id: "9852", from: 1538, to: 1973, name: "England parish marriages 1538–1973" }, burial: { id: "9840", from: 1538, to: 1991, name: "England parish burials 1538–1991" } },
    scotland: { baptism: { id: "60143", from: 1564, to: 1950, name: "Scotland parish baptisms 1564–1950" }, marriage: { id: "60144", from: 1561, to: 1910, name: "Scotland parish marriages 1561–1910" } },
  };
  const aEnc = (s) => encodeURI(String(s == null ? "" : s).trim().replace(/\s+/g, "+"));
  const aPlace = (s) => aEnc(String(s == null ? "" : s).trim().replace(/,\s*/g, "-"));
  const aName = (given, surname) => `${aEnc(given)}_${aEnc(surname)}`;
  // Build one Ancestry collection search. q = { name: [given, surname], birth/death/marriage:
  // [year, place], residence: place, spouse/father/mother: [given, surname], gender }. `host`
  // (v1.0.4) = another Ancestry host than the settings' one (the Ancestry Institution menu).
  function ancCollectionUrl(id, q, host) {
    const parts = [];
    const ev = (key, year, place) => {
      const v = `${year != null ? year : ""}${place ? "_" + aPlace(place) : ""}`;
      if (v) parts.push(`${key}=${v}`);
    };
    const person = (key, pair) => {
      if (pair && (pair[0] || pair[1])) parts.push(`${key}=${aName(pair[0], pair[1])}`);
    };
    if (q.name) parts.push(`name=${aName(q.name[0], q.name[1])}`);
    if (q.birth) ev("birth", q.birth[0], q.birth[1]);
    if (q.death) ev("death", q.death[0], q.death[1]);
    if (q.marriage) ev("marriage", q.marriage[0], q.marriage[1]);
    if (q.residence) ev("residence", null, q.residence);
    person("spouse", q.spouse);
    person("father", q.father);
    person("mother", q.mother);
    if (q.gender) parts.push(`gender=${q.gender}`);
    return `${ancHost(host)}/search/collections/${id}/?${parts.join("&")}`;
  }
  FSSE.ancestryCollectionUrl = ancCollectionUrl; // exposed for tests
  // The record-set groups of the Ancestry menu (v0.2.119): CENSUS (every bracketed census year that
  // Ancestry holds, via the same `censusYears` the FamilySearch menu uses — country / state /
  // Wales variants), CIVIL RECORDS (the vital indexes per event region + state/provincial sets,
  // probate, the SSDI) and PARISH RECORDS (baptisms with the parents, marriages with the spouse,
  // burials per married surname). Same gates as the Findmypast menu: a woman's surname of the
  // year, death entries never for a living person, the inferred marriage window for undated
  // spouses, the unknown-death window (v0.2.107) on every death set it reaches.
  function ancestryRecordOptions(p, add, host) {
    if (!p.given && !p.surname) return;
    const ancUrl = (id, q) => ancCollectionUrl(id, q, host); // every set of one menu on one host
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const gender = /^f/i.test(p.sex || "") ? "f" : /^m/i.test(p.sex || "") ? "m" : null;
    const birthPlace = FSSE.placeForSearch(p.birthPlace) || FSSE.placeForSearch(p.christeningPlace);
    const deathPlace = FSSE.placeForSearch(p.burialPlace) || FSSE.placeForSearch(p.deathPlace);
    const isWales = (pl) => /\bwales\b/i.test(pl || "") && !/\bnew\s+south\s+wales\b/i.test(pl || "");
    const walesTouched = [p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace, ...(p.spouses || []).map((s) => s.marriagePlace), ...(p.facts || []).map((f) => f.place)].some(isWales);
    const spouseGiven = (s) => {
      const bits = String(s.name || "").trim().split(/\s+/).filter(Boolean);
      return bits.length > 1 && bits.at(-1).toLowerCase() === String(s.surname || "").toLowerCase() ? bits.slice(0, -1).join(" ") : "";
    };
    const father = p.father ? [p.father.given, p.father.surname] : null;
    const mother = p.mother ? [p.mother.given, p.mother.surname] : null;
    const covers = (set, y) => y == null || (y >= set.from && y <= set.to);
    const overlaps = (set, from, to) => set.from <= to && set.to >= from;

    // CENSUS — the shared census title (v0.2.123: "1841 England Census" / "1841 Wales Census" for
    // Ancestry's split E&W sets — the one honest exception, each set covers its own country —,
    // "1939 E&W Register", "1900 US Federal Census", "1905 New York State Census", …) + the name.
    for (const c of censusYears(p)) {
      const key = c.region.key;
      const sets = [];
      if (c.sub) {
        const t = ANC_SUB_CENSUS[c.sub.key];
        if (t && t[c.year]) sets.push({ id: t[c.year], title: censusTitle(c) });
      } else if (key === "enw") {
        const pair = ANC_CENSUS.enw[c.year];
        if (pair) {
          if (pair[0]) sets.push({ id: pair[0], title: c.year === 1939 ? censusTitle(c) : censusTitleOf(c.year, "England") });
          if (walesTouched && pair[1] && pair[1] !== pair[0]) sets.push({ id: pair[1], title: censusTitleOf(c.year, "Wales") });
        }
      } else {
        const t = ANC_CENSUS[key];
        if (t && t[c.year]) sets.push({ id: t[c.year], title: censusTitle(c) });
      }
      const sn = surnameAt(p, c.year);
      for (const s of sets) {
        add("Census", `${s.title} — ${fullName(p, sn)}`,
          ancUrl(s.id, { name: [p.given, sn], birth: [by, birthPlace], gender }),
          `Ancestry ${s.title}: ${fullName(p, sn)}${by != null ? `, born ${by}` : ""}${birthPlace ? ` ${birthPlace}` : ""}.${sn !== p.surname ? " (married surname of that year)" : ""}`);
      }
    }

    // CIVIL RECORDS
    const civilSets = (regionKey, kind, place, y) => {
      const out = (ANC_CIVIL[regionKey] && ANC_CIVIL[regionKey][kind] ? ANC_CIVIL[regionKey][kind] : []).filter((s) => covers(s, y));
      for (const c of ANC_CIVIL_SUB) {
        if (c.region === regionKey && c[kind] && c.re.test(place || "") && covers(c[kind], y)) {
          out.push({ ...c[kind], name: `${c.name} ${kind === "birth" ? "births" : kind === "marriage" ? "marriages" : "deaths"} ${c[kind].from}–${c[kind].to}` });
        }
      }
      return out;
    };
    const rBirth = regionOf(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
    if (by != null && rBirth) {
      for (const s of civilSets(rBirth.key, "birth", p.birthPlace || p.christeningPlace, by)) {
        add("Civil records", `${s.name} — ${fullName(p, p.surname)}, ${by}`,
          ancUrl(s.id, { name: [p.given, p.surname], birth: [by, null], mother, gender }),
          `Ancestry ${s.name}: ${fullName(p, p.surname)}, born ${by}. No place sent (the index files by district).${mother ? ` Mother sent: ${p.mother.name}.` : ""}`);
      }
    }
    const adult = (p.spouses || []).length > 0 || (p.spouseSurnames || []).length > 0 || by == null || dy == null || dy - by >= 16;
    if (adult) {
      const all = spousesOf(p);
      for (const s of all.filter((x) => x.year != null)) {
        const r = regionOf(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        if (!r) continue;
        for (const set of civilSets(r.key, "marriage", s.marriagePlace, s.year)) {
          add("Civil records", `${set.name} — ${fullName(p, p.surname)}, spouse ${s.surname}, ${s.year}`,
            ancUrl(set.id, { name: [p.given, p.surname], marriage: [s.year, null], spouse: [spouseGiven(s), s.surname], gender }),
            `Ancestry ${set.name}: ${fullName(p, p.surname)} + spouse ${s.name || s.surname}, ${s.year}. No place sent (the index files by district).`);
        }
      }
      const undated = all.length ? all.filter((x) => x.year == null) : (p.spouseSurnames || []).map((sn) => ({ name: "", surname: sn, year: null }));
      const raw = marriageWindow(p, null);
      if (raw && rBirth) {
        const mid = Math.round((raw.from + raw.to) / 2);
        const seen = new Set();
        const targets = undated.length ? undated : all.length ? [] : [null];
        for (const s of targets) {
          if (s && seen.has(s.surname)) continue;
          if (s) seen.add(s.surname);
          for (const set of civilSets(rBirth.key, "marriage", p.birthPlace || p.christeningPlace, mid)) {
            add("Civil records", `${set.name} — ${fullName(p, p.surname)}${s ? `, spouse ${s.surname}` : ""} (${raw.from}–${raw.to}, inferred)`,
              ancUrl(set.id, { name: [p.given, p.surname], spouse: s ? [spouseGiven(s), s.surname] : null, birth: [by, null], gender }),
              `Ancestry ${set.name}: ${fullName(p, p.surname)}${s ? ` + spouse ${s.name || s.surname}` : ""}, marriage undated in the tree — inferred window ${raw.from}–${raw.to} (age 18–30); no year sent, the birth year ${by} is.${s ? "" : " The tree records no spouse yet — a hit may be the missing marriage."}`);
          }
        }
      }
    }
    if (!p.living) {
      const rDeath = regionOf(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace);
      const dw = dy == null ? deathWindow(p) : null;
      if (rDeath && (dy != null || dw)) {
        const pick = (kind) => (dy != null ? civilSets(rDeath.key, kind, p.deathPlace || p.burialPlace, dy) : civilSets(rDeath.key, kind, p.deathPlace || p.burialPlace, null).filter((s) => overlaps(s, dw.from, dw.to)));
        const suffix = dy != null ? `, ${dy}` : ` — ${dw.from}–${dw.to} (${UNKNOWN_DEATH})`;
        const note = dy != null ? `died ${dy}` : unknownDeathText(dw, dw.from, dw.to);
        for (const sn of deathSurnames(p, dy)) {
          for (const set of [...pick("death"), ...pick("probate")]) {
            add("Civil records", `${set.name} — ${fullName(p, sn)}${suffix}`,
              ancUrl(set.id, { name: [p.given, sn], death: [dy, null], birth: [by, null], gender }),
              `Ancestry ${set.name}: ${fullName(p, sn)}, ${note}${by != null ? `, born ${by}` : ""}. No place sent (the index files by district).${dy == null ? " No death year sent — the birth year does the narrowing (the index carries the age / date of birth)." : ""}`);
          }
        }
      }
    }

    // PARISH RECORDS
    const parishFor = (place, ...fallbacks) => {
      const r = regionOf(place, ...fallbacks);
      if (!r || !ANC_PARISH[r.key]) return null;
      if (r.key === "enw" && isWales(place || fallbacks.find(Boolean))) return null; // England's sets hold no Welsh parishes
      return ANC_PARISH[r.key];
    };
    const pb = parishFor(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
    if (pb && pb.baptism && covers(pb.baptism, by)) {
      add("Parish records", `${pb.baptism.name} — ${fullName(p, p.surname)}${by != null ? `, ${by}` : ""}`,
        ancUrl(pb.baptism.id, { name: [p.given, p.surname], birth: [by, birthPlace], father, mother, gender }),
        `Ancestry ${pb.baptism.name}: ${fullName(p, p.surname)}${by != null ? `, ${by}` : ""}${birthPlace ? `, ${birthPlace}` : ""}.${father || mother ? ` Parents sent: ${[p.father && p.father.name, p.mother && p.mother.name].filter(Boolean).join(" & ")}.` : ""}`);
    }
    if (adult) {
      const all = spousesOf(p);
      for (const s of all.filter((x) => x.year != null)) {
        const pm = parishFor(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace);
        if (!pm || !pm.marriage || !covers(pm.marriage, s.year)) continue;
        add("Parish records", `${pm.marriage.name} — ${fullName(p, p.surname)}, spouse ${s.surname}, ${s.year}`,
          ancUrl(pm.marriage.id, { name: [p.given, p.surname], marriage: [s.year, FSSE.placeForSearch(s.marriagePlace)], spouse: [spouseGiven(s), s.surname], gender }),
          `Ancestry ${pm.marriage.name}: ${fullName(p, p.surname)} + spouse ${s.name || s.surname}, ${s.year}${s.marriagePlace ? `, ${FSSE.placeForSearch(s.marriagePlace)}` : ""}.`);
      }
      const undated = all.length ? all.filter((x) => x.year == null) : (p.spouseSurnames || []).map((sn) => ({ name: "", surname: sn, year: null }));
      const raw = marriageWindow(p, null);
      if (raw && pb && pb.marriage && overlaps(pb.marriage, raw.from, raw.to)) {
        const seen = new Set();
        const targets = undated.length ? undated : all.length ? [] : [null];
        for (const s of targets) {
          if (s && seen.has(s.surname)) continue;
          if (s) seen.add(s.surname);
          add("Parish records", `${pb.marriage.name} — ${fullName(p, p.surname)}${s ? `, spouse ${s.surname}` : ""} (${raw.from}–${raw.to}, inferred)`,
            ancUrl(pb.marriage.id, { name: [p.given, p.surname], spouse: s ? [spouseGiven(s), s.surname] : null, birth: [by, birthPlace], gender }),
            `Ancestry ${pb.marriage.name}: ${fullName(p, p.surname)}${s ? ` + spouse ${s.name || s.surname}` : ""}, marriage undated in the tree — inferred window ${raw.from}–${raw.to} (age 18–30); no year sent.${s ? "" : " The tree records no spouse yet."}`);
        }
      }
    }
    if (!p.living) {
      const pd = parishFor(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace);
      const dw = dy == null ? deathWindow(p) : null;
      if (pd && pd.burial && (dy != null ? covers(pd.burial, dy) : dw ? overlaps(pd.burial, dw.from, dw.to) : covers(pd.burial, by))) {
        for (const sn of deathSurnames(p, dy)) {
          add("Parish records", `${pd.burial.name} — ${fullName(p, sn)}${dy != null ? `, ${dy}` : dw ? ` — ${dw.from}–${dw.to} (${UNKNOWN_DEATH})` : ""}`,
            ancUrl(pd.burial.id, { name: [p.given, sn], death: [dy, deathPlace], birth: [by, null], gender }),
            `Ancestry ${pd.burial.name}: ${fullName(p, sn)}, ${dy != null ? `died ${dy}` : dw ? unknownDeathText(dw, dw.from, dw.to) : "death year unknown"}${deathPlace ? `, ${deathPlace}` : ""}.`);
        }
      }
    }
  }
  FSSE.ancestryRecordOptions = ancestryRecordOptions; // exposed for tests

  // v1.0.4 — `opts` = { site, host, brand } builds the SAME menu for another Ancestry host: the
  // "Ancestry Institution" row FamilySearch lists on a FamilySearch Center's network (Kevin's find
  // at the Boise FSC, 2026-11-04 — its link is FS's Ancestry link verbatim on
  // www.ancestryinstitution.com, open there without an Ancestry account). `site` keys the native
  // row (p.nativeUrls / p.nativeRows), `host` every URL we build, `brand` the wording.
  function ancestryOptions(p, opts) {
    const cfg = opts || {};
    const siteId = cfg.site || "ancestry-records";
    const host = cfg.host || null;
    const brand = cfg.brand || "Ancestry";
    const out = [];
    const countries = ancestryCountries(p);
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const lived = by != null || dy != null ? `${by != null ? `born ${by}` : ""}${by != null && dy != null ? ", " : ""}${dy != null ? `died ${dy}` : ""}` : "no dated vitals";
    // One country block per country the person's events touch (birth country first); inside a
    // block a married woman gets one entry per name (maiden + each married surname), everyone
    // else the single Vitals-name entry. No classifiable place at all → one all-countries entry.
    const married = p.marriedSurnames || [];
    // v0.2.113 (Kevin: "please give this same treatment to the Ancestry and FindMyPast menu
    // selections" — the MyHeritage treatment of v0.2.112): the native entry reads "All
    // Collections — <Full name> (b–d)" ("All Results" v0.2.102–112) and no entry of this menu
    // says "Ancestry" any more — "England — Doris Annie Hiscocks (maiden)", "England — Charles
    // Bellwood", "Worldwide — …" when no country classifies, "Public Member Trees".
    const span = by != null || dy != null ? ` (${by != null ? by : "?"}–${dy != null ? dy : "?"})` : "";
    const allLabel = p.given || p.surname ? `All Collections — ${fullName(p, p.surname)}${span}` : "All Collections";
    // All Collections — v0.2.102 (Kevin: "combine the Ancestry menu in a similar fashion" to the
    // FamilySearch one, v0.2.101): the native Ancestry row is hidden by content.js (site
    // `replaces`) and its search lives here. FIRST since v0.2.103 (Kevin: "move the Ancestry
    // 'All Results' menu item to be the first entry in this list"; last in v0.2.102). The URL
    // is the native row's own link (the person's details as FamilySearch hands them to
    // Ancestry), opened byte-for-byte; when the row has no link, or the layout has no
    // Ancestry row, our global all-countries search stands in (name + birth/death years +
    // gender, no priority).
    const nativeUrl = nativeUrlOf(p, siteId);
    const nativeRow = nativeRowOf(p, siteId) || !!nativeUrl;
    if (nativeRow) {
      // v0.2.105 (Kevin: "let FamilySearch build the needed URL rather than assume"): the row is
      // on the page → the click is handed to it; a link read off it is only the reserve URL.
      out.push({
        group: "All records", // v0.2.106 — group headers like the MyHeritage menu (Kevin's screenshot)
        label: allLabel,
        nativeClick: true,
        url: nativeUrl || (p.given || p.surname ? ancestrySearchUrl(p, p.surname, null, host) : `${ancHost(host)}/search/`),
        tooltip: `${brand}'s own search for ${fullName(p, p.surname) || "this person"} across all its collections — FamilySearch's own ${brand} entry (hidden behind this menu) runs it: your click is handed to it, so ${brand} receives exactly what FamilySearch sends.`,
      });
    } else if (p.given || p.surname) {
      out.push({
        group: "All records",
        label: allLabel,
        url: ancestrySearchUrl(p, p.surname, null, host),
        tooltip: `${brand}'s global search, all countries and collections: ${fullName(p, p.surname)}, ${lived}. (The native ${brand} search link was not found on this page, so this search is built from the tree's vitals.)`,
      });
    }
    if (p.given || p.surname) {
      const blocks = countries.length ? countries : [null];
      for (const focus of blocks) {
        const where = focus ? `restricted to ${focus.country} (priority=${focus.priority})` : "all countries (no country recognised from the person's places)";
        const countryLabel = focus ? focus.country : "Worldwide";
        const priority = focus && focus.priority;
        if (married.length) {
          out.push({
            group: "All records",
            label: `${countryLabel} — ${fullName(p, p.surname)} (maiden)`,
            url: ancestrySearchUrl(p, p.surname, priority, host),
            tooltip: `${brand} search ${where}: ${fullName(p, p.surname)} (maiden name), ${lived}.`,
          });
          for (const sn of married) {
            out.push({
              group: "All records",
              label: `${countryLabel} — ${fullName(p, sn)} (married)`,
              url: ancestrySearchUrl(p, sn, priority, host),
              tooltip: `${brand} search ${where}: ${fullName(p, sn)} (married name), ${lived}.`,
            });
          }
        } else {
          out.push({
            group: "All records",
            label: `${countryLabel} — ${fullName(p, p.surname)}`,
            url: ancestrySearchUrl(p, p.surname, priority, host),
            tooltip: `${brand} search ${where}: ${fullName(p, p.surname)}, ${lived}.`,
          });
        }
      }
    }
    // v0.2.119 — CENSUS / CIVIL RECORDS / PARISH RECORDS, the Findmypast treatment (Kevin's ask).
    ancestryRecordOptions(p, (group, label, url, tooltip) => out.push({ group, label, url, tooltip }), host);
    // Public Member Trees — the former top-level row, unchanged URL grammar; its own FAMILY
    // TREES group (v0.2.106), mirroring the MyHeritage menu. (The institution edition carries the
    // member trees too, read-only.)
    out.push({
      group: "Family trees",
      label: "Public Member Trees", // "Ancestry Public Member Trees" until v0.2.113
      url: ancestryPmtUrl(p, host),
      tooltip: `Ancestry Public Member Trees (collection 1030): ${fullName(p, p.surname) || "this person"}${lived !== "no dated vitals" ? `, ${lived}` : ""}.`,
    });
    return out;
  }
  FSSE.ancestryOptions = ancestryOptions; // exposed for tests
  // v1.0.4 — the FamilySearch Center menu: the same list on Ancestry's institution host.
  const ANC_INSTITUTION = { site: "ancestry-institution", host: "ancestryinstitution.com", brand: "Ancestry Institution" };
  const ancestryInstitutionOptions = (p) => ancestryOptions(p, ANC_INSTITUTION);
  FSSE.ancestryInstitutionOptions = ancestryInstitutionOptions; // exposed for tests

  // ---- FreeBMD (the "FreeBMD" menu, v0.2.47) ---------------------------------------------------
  // FreeBMD transcribes the E&W GRO civil-registration indexes (births/marriages/deaths from
  // Sep 1837). Its search (/cgi/search.pl) is a POST form with per-page hidden tokens and
  // IGNORES GET parameters (probed 2026-09-03), so entries put the parameters in the URL
  // FRAGMENT (#fsse=<json> — never sent to FreeBMD's server); src/freebmd-fill.js, a content
  // script on freebmd.org.uk, fills the page's own form and clicks Find. Field names probed
  // from the live form: type (checkbox Births/Deaths/Marriages), surname, given, s_surname
  // (spouse — FreeBMD can pair spouses by volume/page even pre-1912 — or mother's maiden name
  // on births, recorded from Sep 1911), start/sq, end/eq (quarters 1=Mar…4=Dec).
  const FREEBMD_BASE = "https://www.freebmd.org.uk/cgi/search.pl";
  function freebmdUrl(params) {
    const clean = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") clean[k] = v;
    }
    return `${FREEBMD_BASE}#fsse=${encodeURIComponent(JSON.stringify(clean))}`;
  }
  // Clamp a year window to civil registration's start (1 July 1837 → the Sep quarter).
  // Returns null when the whole window predates it (a pre-1837 event has no GRO entry).
  const freebmdClamp = (from, to) => {
    if (from == null || to == null || to < 1837) return null;
    let sq = 1;
    if (from <= 1837) {
      from = 1837;
      sq = 3;
    }
    return { start: from, sq, end: to, eq: 4 };
  };
  const freebmdWindow = (y) => (y != null ? freebmdClamp(y - 2, y + 2) : null);
  const isEnw = (...places) => {
    const r = regionOf(...places);
    return !!r && r.key === "enw";
  };
  function freebmdOptions(p) {
    const out = [];
    if (!p.given && !p.surname) return out;
    const firstGiven = String(p.given || "").trim().split(/\s+/)[0] || "";
    const altGiven = firstGiven && firstGiven !== String(p.given || "").trim() ? firstGiven : null;
    const add = (group, label, params, tooltip) => {
      const o = { group, label, url: freebmdUrl(params), tooltip };
      if (altGiven && params.given) {
        o.altUrl = freebmdUrl({ ...params, given: altGiven });
        o.tooltip += `\nShift+click: first name only ("${firstGiven}").`;
      }
      out.push(o);
    };
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const winText = (w) => (w.start === w.end ? `${w.start}` : `${w.start}–${w.end}`);
    const noPlace = "No district sent (FreeBMD files by registration district).";

    // Births — E&W birth, window overlapping Sep 1837+. Mother's maiden name (s_surname) only
    // when the whole window is after Sep 1911, when the index starts recording it.
    if (isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
      const w = freebmdWindow(by);
      if (w) {
        const mother = w.start >= 1911 && p.mother && p.mother.surname ? p.mother.surname : null;
        add("Births", `FreeBMD births — ${winText(w)}`,
          { type: "Births", surname: p.surname, given: p.given, s_surname: mother, ...w },
          `FreeBMD GRO birth index: ${fullName(p, p.surname)}, ${winText(w)}.` +
            (mother ? ` Mother's maiden name ${mother} sent (recorded from Sep 1911).` : "") + ` ${noPlace}`);
      }
    }

    // Marriages — one entry per spouse. Dated E&W marriages get their real window; undated
    // spouses (person adult) fall back to the inferred age-18–30 window. FreeBMD pairs spouses
    // by volume/page for ALL years, so the spouse surname always goes in.
    const adult = (p.spouses || []).length > 0 || (p.spouseSurnames || []).length > 0 || by == null || dy == null || dy - by >= 16;
    if (adult) {
      const all = spousesOf(p);
      for (const s of all.filter((x) => x.year != null)) {
        if (!isEnw(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) continue;
        const w = freebmdWindow(s.year);
        if (!w) continue;
        add("Marriages", `FreeBMD marriages — ${s.year}, spouse ${s.surname}`,
          { type: "Marriages", surname: p.surname, given: p.given, s_surname: s.surname, ...w },
          `FreeBMD GRO marriage index: ${fullName(p, p.surname)} + spouse surname ${s.surname}, married ${s.marriageDate || s.year} (searched ${winText(w)}). FreeBMD pairs the spouses by volume/page, so the filter works for every year. ${noPlace}`);
      }
      const undated = all.length ? all.filter((x) => x.year == null) : (p.spouseSurnames || []).map((sn) => ({ surname: sn }));
      // No spouse on the page at all → still offer ONE unfiltered search of the inferred
      // age-18–30 window (v0.2.51, Kevin's ask — "Stephen Hind was probably married but I
      // have not yet discovered the details"; recordOptions' inferred path already worked this
      // way). Skipped when every known spouse is dated — those marriages are covered above.
      if ((undated.length || !all.length) && isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
        const raw = marriageWindow(p, null);
        const w = raw ? freebmdClamp(raw.from, raw.to) : null;
        if (w && undated.length) {
          for (const s of [...new Set(undated.map((x) => x.surname))]) {
            add("Marriages", `FreeBMD marriages — spouse ${s}`,
              { type: "Marriages", surname: p.surname, given: p.given, s_surname: s, ...w },
              `FreeBMD GRO marriage index: ${fullName(p, p.surname)} + spouse surname ${s}, married ${winText(w)} (inferred: age 18–30 — no marriage date on the page). ${noPlace}`);
          }
        } else if (w) {
          add("Marriages", `FreeBMD marriages — ${winText(w)}`,
            { type: "Marriages", surname: p.surname, given: p.given, ...w },
            `FreeBMD GRO marriage index: ${fullName(p, p.surname)}, married ${winText(w)} (inferred: age 18–30 — the tree records no spouse yet, so no spouse filter is applied). A hit here may be the marriage the tree is missing. ${noPlace}`);
        }
      }
    }

    // Deaths — E&W death, one entry per death surname (a woman under each married surname,
    // minus any from a marriage dated after the death; maiden when she died unmarried).
    // v0.2.107 — DEATH YEAR UNKNOWN: ONE entry over the inferred window (deathWindow: last seen
    // → age 100), clamped to FreeBMD's Sep 1837 – Dec 1999; the tooltip says which ages (shown
    // in the results from 1866) and which date of birth (from 1969) to look for.
    // v0.2.108 (Kevin: "FreeBMD has the ability to enter a year of birth when searching for a
    // death index … populate this value") — FreeBMD's "Death age/DoB" box (field `aad`) takes an
    // age, an age range, a date of birth or a RANGE OF BIRTH YEARS ("1879-1881") and matches it
    // per entry: the index records the age at death from 1866 and the date of birth from 1969,
    // and a birth-year range is checked against each entry's age IN ITS OWN QUARTER (probed live
    // 2026-10-10 — Thomas Park deaths 1939–45: 26 rows unfiltered, ONE with "1879-1881" — the age
    // 63 in Jun 1943 — while ages 62/64/65 in quarters that put the birth in 1875–78 dropped
    // out). So one value narrows a death search of ANY width — the discriminator the unknown
    // window needs. Sent as birth ±1 (tree years and christening proxies are often a year off)
    // whenever the window reaches 1866. Caveat from the same probe: an entry whose age was never
    // transcribed survives an AGE-range search but not a birth-year one, so the tooltip says to
    // clear the box if the person is missing. "Match only recorded ages/DoB" (`agepresent`) is
    // never sent.
    const dobRange = (b, endYear) => (b != null && endYear != null && endYear >= 1866 ? `${b - 1}-${b + 1}` : null);
    const dobText = (dob) => dob.replace("-", "–");
    const dobNote = (dob) =>
      dob
        ? ` Death age/DoB box: born ${dobText(dob)} — FreeBMD keeps only the entries whose recorded age (from 1866) or date of birth (from 1969) fits that birth year; if the right person is missing, clear that box on FreeBMD's form (an age that was never transcribed cannot match).`
        : "";
    if (!p.living && isEnw(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace)) {
      const w = freebmdWindow(dy);
      const dw = dy == null ? deathWindow(p) : null;
      if (w) {
        const surnames = deathSurnames(p, dy);
        const dob = dobRange(by, w.end);
        for (const sn of surnames) {
          add("Deaths", `FreeBMD deaths — ${winText(w)}${surnames.length > 1 ? ` — ${fullName(p, sn)}` : ""}`,
            { type: "Deaths", surname: sn, given: p.given, aad: dob, ...w },
            `FreeBMD GRO death index: ${fullName(p, sn)}, ${winText(w)}.${dobNote(dob)}${dob ? "" : " The index records the age at death from 1866 and the date of birth from 1969."} ${noPlace}`);
        }
      } else if (dw) {
        const cw = freebmdClamp(dw.from, Math.min(dw.to, 1999)); // FreeBMD's index ends at Dec 1999
        if (cw && cw.start <= cw.end) {
          const surnames = deathSurnames(p, null);
          const dob = dobRange(dw.by, cw.end);
          let look;
          if (dob) {
            look = ` The Death age/DoB box (born ${dobText(dob)}) does the narrowing: across the whole window FreeBMD keeps only the entries whose recorded age (from 1866) or date of birth (from 1969) fits — clear that box on FreeBMD's form if the right person is missing (an age that was never transcribed cannot match).`;
          } else if (dw.by != null) {
            look = " The index records no age at death before 1866, so the birth year cannot narrow this window. A long window on a common surname lists many rows — narrow the dates on FreeBMD's form if the list is unwieldy.";
          } else {
            look = " No birth year in the tree, so the Death age/DoB box is left empty (the results show the age at death from 1866). A long window on a common surname lists many rows — narrow the dates on FreeBMD's form if the list is unwieldy.";
          }
          for (const sn of surnames) {
            add("Deaths", `FreeBMD deaths — ${winText(cw)} (${UNKNOWN_DEATH})${surnames.length > 1 ? ` — ${fullName(p, sn)}` : ""}`,
              { type: "Deaths", surname: sn, given: p.given, aad: dob, ...cw },
              `FreeBMD GRO death index: ${fullName(p, sn)}, ${unknownDeathText(dw, cw.start, cw.end)}.${look} ${noPlace}`);
          }
        }
      }
    }
    return out;
  }
  FSSE.freebmdOptions = freebmdOptions; // exposed for tests

  // ---- GRO online index (the "GRO Index" menu, v0.2.49) ----------------------------------------
  // GRO's OWN digitised E&W birth/death indexes at gro.gov.uk — free to search but behind a
  // login, and richer than FreeBMD where they cover: the birth index shows the MOTHER'S MAIDEN
  // NAME back to 1837 (FreeBMD only from Sep 1911) and the death index the age at death from
  // 1866. No marriages online — GRO never digitised them (FreeBMD covers those). Coverage as
  // read off the live form (Kevin, 2026-09-04): births 1837–1934 & 1984–2024, deaths 1837–1957
  // & 1984–2024 — the gap years were never digitised. The search page honours GET parameters
  // (the server pre-fills the form; verified live 2026-09-04) but still needs the Search click
  // and a login, so entries carry the parameters BOTH in the query string and in the #fsse
  // fragment; src/gro-fill.js clicks Search (and survives the login detour via the fragment —
  // GRO's redirect to Login.asp drops the query string but the browser keeps the fragment).
  // Parameter names from WikiTree Sourcer's production GRO module, confirmed by the live GET
  // pre-fill: index=EW_Birth|EW_Death, Year, Range (max ±2 — the form offers 0/1/2), Surname,
  // Forename1/Forename2, Gender=M|F (MANDATORY — no entries for a person of unknown sex),
  // MothersSurname, Age/AgeRange.
  const GRO_BASE = "https://www.gro.gov.uk/gro/content/certificates/indexes_search.asp";
  const GRO_TOP = 2024; // last year in the form's Year dropdown — GRO extends it periodically
  const GRO_COVERAGE = {
    EW_Birth: [[1837, 1934], [1984, GRO_TOP]],
    EW_Death: [[1837, 1957], [1984, GRO_TOP]],
  };
  const GRO_SPAN = {
    EW_Birth: "1837–1934 & 1984–" + GRO_TOP,
    EW_Death: "1837–1957 & 1984–" + GRO_TOP,
  };
  // GRO expresses a search as one Year ± Range with Range capped at 2. Pick the nearest covered
  // year whose ±2 still overlaps the event's own ±2 window; null when the event sits deeper
  // inside a coverage gap (or before 1835 / after GRO_TOP + 2) — no useful search exists then.
  function groYear(index, y) {
    if (y == null) return null;
    for (const [s, e] of GRO_COVERAGE[index]) {
      if (y + 2 >= s && y - 2 <= e) {
        const year = Math.min(Math.max(y, s), e);
        return { Year: year, Range: 2, clamped: year !== y };
      }
    }
    return null;
  }
  // v0.2.107 — DEATH YEAR UNKNOWN: GRO's form takes one Year ±2, so an open window becomes a
  // LADDER of 5-year blocks (Year = the block's centre, Range 2) over window ∩ coverage — the
  // 1958–1983 gap is skipped (those are FreeBMD's years). Each block's age filter is Year − birth
  // ±2, so block and age line up exactly (the age is indexed from 1866 — GRO's advantage over
  // FreeBMD). At most GRO_LADDER_MAX blocks from the last-seen year (decision 2, Kevin
  // 2026-10-10: capped at 8); the last listed block's tooltip says how many more exist.
  const GRO_BLOCK = 5;
  const GRO_LADDER_MAX = 8;
  function groDeathBlocks(from, to) {
    const out = [];
    for (const [s, e] of GRO_COVERAGE.EW_Death) {
      const lo = Math.max(from, s);
      const hi = Math.min(to, e);
      for (let b = lo; b <= hi; b += GRO_BLOCK) {
        const bt = Math.min(b + GRO_BLOCK - 1, hi);
        out.push({ from: b, to: bt, Year: Math.min(Math.max(Math.round((b + bt) / 2), s), e) });
      }
    }
    return out;
  }
  FSSE._groDeathBlocks = groDeathBlocks; // exposed for tests
  function groUrl(params) {
    const q = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${GRO_BASE}?${q}#fsse=${encodeURIComponent(JSON.stringify(params))}`;
  }
  function groOptions(p) {
    const out = [];
    const gender = /^m/i.test(p.sex || "") ? "M" : /^f/i.test(p.sex || "") ? "F" : null;
    if ((!p.given && !p.surname) || !gender) return out; // Sex is a mandatory GRO search field
    const given = String(p.given || "").trim().split(/\s+/).filter(Boolean);
    const forename1 = given[0] || null;
    const forename2 = given[1] || null; // the form has exactly two forename fields
    const add = (group, label, params, tooltip) => {
      const clean = {};
      for (const [k, v] of Object.entries(params)) if (v != null && v !== "") clean[k] = v;
      const o = { group, label, url: groUrl(clean), tooltip };
      if (clean.Forename2) {
        const { Forename2, ...alt } = clean;
        o.altUrl = groUrl(alt);
        o.tooltip += `\nShift+click: first forename only ("${forename1}").`;
      }
      out.push(o);
    };
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const noPlace = "No district sent (the index files by registration district).";
    const login = "Free, but needs your GRO login — if the login page appears, sign in and the search finishes itself.";
    const gapNote = (index, y) =>
      ` (${y} is outside the online index — coverage ${GRO_SPAN[index]} — so the nearest indexed year is searched.)`;

    // Births — E&W birth with a usable year. Mother's maiden name goes in whenever the tree
    // knows the mother: GRO's index records it back to 1837 (its big advantage over FreeBMD).
    if (isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
      const w = groYear("EW_Birth", by);
      if (w) {
        const mother = p.mother && p.mother.surname ? p.mother.surname : null;
        add("Births", `GRO births — ${w.Year} ±2`,
          { index: "EW_Birth", Year: w.Year, Range: w.Range, Surname: p.surname, Forename1: forename1, Forename2: forename2, Gender: gender, MothersSurname: mother },
          `GRO online birth index: ${fullName(p, p.surname)}, ${w.Year} ±2.` +
            (mother ? ` Mother's maiden name ${mother} sent — GRO's index records it back to 1837.` : "") +
            (w.clamped ? gapNote("EW_Birth", by) : "") + ` ${noPlace} ${login}`);
      }
    }

    // Deaths — one entry per death surname (a woman under each married surname, minus any from
    // a marriage dated after the death; maiden when she died unmarried). The age-at-death
    // filter (recorded in the index from 1866) goes in when the birth year is known — capped
    // at the form's maximum ±2. Death year unknown → the 5-year ladder (groDeathBlocks).
    if (!p.living && isEnw(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace)) {
      const w = groYear("EW_Death", dy);
      const dw = dy == null ? deathWindow(p) : null;
      if (w) {
        const surnames = deathSurnames(p, dy);
        const age = by != null && dy != null && dy >= 1866 ? dy - by : null;
        for (const sn of surnames) {
          add("Deaths", `GRO deaths — ${w.Year} ±2${surnames.length > 1 ? ` — ${fullName(p, sn)}` : ""}`,
            { index: "EW_Death", Year: w.Year, Range: w.Range, Surname: sn, Forename1: forename1, Forename2: forename2, Gender: gender, Age: age, AgeRange: age != null ? 2 : null },
            `GRO online death index: ${fullName(p, sn)}, ${w.Year} ±2.` +
              (age != null ? ` Age at death ${age} ±2 sent (recorded in the index from 1866).` : "") +
              (w.clamped ? gapNote("EW_Death", dy) : "") + ` ${noPlace} ${login}`);
        }
      } else if (dw) {
        const blocks = groDeathBlocks(dw.from, dw.to);
        const shown = blocks.slice(0, GRO_LADDER_MAX);
        const more = blocks.length - shown.length;
        const lastPre = shown.findLastIndex((b) => b.to <= 1957); // the last block before the 1958–1983 gap
        const firstPost = shown.findIndex((b) => b.from >= 1984); // the first block after it
        const gap = " GRO's online death index skips 1958–1983 — the FreeBMD menu covers those years.";
        const surnames = deathSurnames(p, null);
        for (const sn of surnames) {
          shown.forEach((b, i) => {
            const age = dw.by != null && b.Year >= 1866 ? b.Year - dw.by : null;
            const span = b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`;
            let note = "";
            if (i === lastPre && dw.to >= 1958) note += gap;
            if (i === firstPost && dw.from <= 1983) note += gap;
            if (i === shown.length - 1 && more) note += ` ${more} more 5-year block${more > 1 ? "s" : ""} up to ${dw.to} ${more > 1 ? "are" : "is"} not listed — change the Year on GRO's form to continue.`;
            add("Deaths", `GRO deaths — ${span}${age != null ? `, age ${age - 2}–${age + 2}` : ""}${surnames.length > 1 ? ` — ${fullName(p, sn)}` : ""}`,
              { index: "EW_Death", Year: b.Year, Range: 2, Surname: sn, Forename1: forename1, Forename2: forename2, Gender: gender, Age: age, AgeRange: age != null ? 2 : null },
              `GRO online death index: ${fullName(p, sn)}, ${span} (Year ${b.Year} ±2) — ${UNKNOWN_DEATH}: last seen ${dw.seen.year} (${dw.seen.what}), searched in 5-year blocks to ${dw.to}${dw.by != null ? ` (age ${dw.ageTo})` : ""}.` +
                (age != null ? ` Age at death ${age} ±2 sent (recorded in the index from 1866) — block and age line up.` : "") +
                note + ` ${noPlace} ${login}`);
          });
        }
      }
    }
    return out;
  }
  FSSE.groOptions = groOptions; // exposed for tests

  // ---- ScotlandsPeople (the "ScotlandsPeople" menu, v0.2.52) -----------------------------------
  // Scotland's national records site — statutory registers (1855+), Old Parish Registers
  // (1553–1854) and the censuses 1841–1921 (incl. 1911 and 1921, which FamilySearch lacks).
  // Searching the indexes is free with a free SP login; viewing images costs credits. SP has
  // NO GET deep links (Drupal POST forms with per-page tokens; probed 2026-08-31), but its
  // search pages load anonymously and render the form when logged in — so entries open
  // `search-records/<path>#fsse=<json>` and src/sp-fill.js fills the form BY ELEMENT ID and
  // submits it (WikiTree Sourcer's production route; ids below are from Sourcer's scotp
  // module, 2026-09-04 — not yet click-verified). The payload's `fields` map element ids to
  // values, so all per-record-type knowledge lives HERE: `true` checks a radio/checkbox,
  // strings fill text fields. Name-matching radios are left at SP's own defaults (Kevin,
  // 2026-09-04). Sex radios are `edit-search-params-nrs-sex-m|f` — except stat_marriages,
  // whose form uses `-sex-1|2` (Sourcer's addGender). OPR parent fields exist only on the
  // post-search Refine panel, so OPR birth searches can't send parents (tooltip says so);
  // statutory births AND deaths index the mother's maiden surname (`-mmsurname`).
  const SP_BASE = "https://www.scotlandspeople.gov.uk/search-records/";
  const SP_SUR = "edit-search-params-nrs-surname";
  const SP_FORE = "edit-search-params-nrs-forename";
  const SP_YF = "edit-search-params-nrs-search-year-year-from"; // statutory forms
  const SP_YT = "edit-search-params-nrs-search-year-year-to";
  const SP_OYF = "edit-search-params-nrs-year-field-year-from"; // church-register forms
  const SP_OYT = "edit-search-params-nrs-year-field-year-to";
  const SP_MMN = "edit-search-params-nrs-mmsurname";
  const SP_FORMS = {
    stat_births: { path: "statutory-records/stat-births", label: "SP statutory births", from: 1855, to: 9999, yf: SP_YF, yt: SP_YT, mmn: true },
    stat_marriages: { path: "statutory-records/stat-marriages", label: "SP statutory marriages", from: 1855, to: 9999, yf: SP_YF, yt: SP_YT, sexNum: true, sps: "edit-search-params-nrs-spsurname", spf: "edit-search-params-nrs-spforename" },
    stat_deaths: { path: "statutory-records/stat-deaths", label: "SP statutory deaths", from: 1855, to: 9999, yf: SP_YF, yt: SP_YT, mmn: true, ageFrom: "edit-search-params-hss-age-age-from", ageTo: "edit-search-params-hss-age-age-to" },
    opr_births: { path: "church-registers/church-births-baptisms/opr-births", label: "SP old parish births", from: 1553, to: 1855, yf: SP_OYF, yt: SP_OYT },
    opr_marriages: { path: "church-registers/church-banns-marriages/opr-marriages", label: "SP old parish marriages", from: 1553, to: 1855, yf: SP_OYF, yt: SP_OYT, spName: "edit-search-params-nrs-motherspousename" },
    opr_deaths: { path: "church-registers/church-deaths-burials/opr-deaths", label: "SP old parish burials", from: 1553, to: 1855, yf: SP_OYF, yt: SP_OYT },
    census: { path: "census-returns/census" }, // label = the shared census title (v0.2.123)
  };
  const isScot = (...places) => {
    const r = regionOf(...places);
    return !!r && r.key === "scotland";
  };
  function spUrl(path, fields) {
    return `${SP_BASE}${path}#fsse=${encodeURIComponent(JSON.stringify({ path, fields }))}`;
  }
  // SP truncates name fields at 15 characters (Sourcer's searchNameLimits).
  const spName = (s) => String(s || "").substring(0, 15);
  // Common fields: surname + FIRST forename (SP matches per-field, so the full given string
  // would over-restrict — Sourcer sends the first name too) + the sex radio when known.
  // ALL name-matching radios stay at SP's own default (exact): v0.2.53 sent the surname with
  // "Phonetic matching" (`f["so:" + SP_SUR] = "soundex"` — sp-fill.js still supports so:
  // keys), but Kevin reverted it in v0.2.54 — soundex made the 1881 census return
  // AIRLIE/EARLY/ARLY for Gourley ("too many entries to look through"); he flips the radio
  // manually on the rare search that needs it. Don't re-add without his ask.
  function spBaseFields(t, p, surname) {
    const f = {};
    if (surname) f[SP_SUR] = spName(surname);
    const first = String(p.given || "").trim().split(/\s+/)[0];
    if (first) f[SP_FORE] = spName(first);
    const sex = /^m/i.test(p.sex || "") ? (t.sexNum ? "1" : "m") : /^f/i.test(p.sex || "") ? (t.sexNum ? "2" : "f") : null;
    if (sex) f[`edit-search-params-nrs-sex-${sex}`] = true;
    return f;
  }
  // Clamp [y-2, y+2] (or a raw window) to the record type's coverage; null when disjoint.
  const spWindow = (t, from, to) => {
    if (from == null || to == null) return null;
    from = Math.max(from, t.from);
    to = Math.min(to, t.to);
    return from <= to ? { from, to } : null;
  };
  // The census years SP holds, bracketed to Scotland exactly like the Records menu's censuses:
  // offer year Y when the latest event at/before or the earliest at/after Y is Scottish.
  function spCensusYears(p) {
    const tl = timeline(p);
    if (!tl) return [];
    const out = [];
    for (const y of [1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921]) {
      if (y < tl.lower || y > tl.upper) continue;
      let latest = null;
      let earliest = null;
      for (const e of tl.events) {
        if (e.year <= y && (!latest || e.year >= latest.year)) latest = e;
        if (e.year >= y && (!earliest || e.year < earliest.year)) earliest = e;
      }
      const scot = (e) => !!e && !!e.region && e.region.key === "scotland";
      if (scot(latest) || scot(earliest)) out.push(y);
    }
    return out;
  }
  function spOptions(p) {
    const out = [];
    if (!p.given && !p.surname) return out;
    const add = (group, label, type, fields, tooltip) => {
      const t = SP_FORMS[type];
      out.push({ group, label, url: spUrl(t.path, fields), tooltip });
    };
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const winText = (w) => (w.from === w.to ? `${w.from}` : `${w.from}–${w.to}`);
    const login = "Free with your ScotlandsPeople login (images cost credits) — the extension fills SP's search form and submits it; if you're signed out, log in and the search finishes itself. Too few results? Refine the search with fuzzy/phonetic surname matching on SP's form.";
    const mother = p.mother && p.mother.surname ? spName(p.mother.surname) : null;

    // Births — Scottish birth with a usable year. Statutory (1855+) and/or OPR (to 1855),
    // both when the ±2 window straddles the 1855 line.
    if (isScot(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace) && by != null) {
      let t = SP_FORMS.stat_births;
      let w = spWindow(t, by - 2, by + 2);
      if (w) {
        const f = spBaseFields(t, p, p.surname);
        f[t.yf] = w.from;
        f[t.yt] = w.to;
        if (mother) f[SP_MMN] = mother;
        add("Births", `${t.label} — ${winText(w)}`, "stat_births", f,
          `ScotlandsPeople statutory birth index: ${fullName(p, p.surname)}, ${winText(w)}.` +
            (mother ? ` Mother's maiden surname ${mother} sent.` : "") + ` ${login}`);
      }
      t = SP_FORMS.opr_births;
      w = spWindow(t, by - 2, by + 2);
      if (w) {
        const f = spBaseFields(t, p, p.surname);
        f[t.yf] = w.from;
        f[t.yt] = w.to;
        add("Births", `${t.label} — ${winText(w)}`, "opr_births", f,
          `ScotlandsPeople Old Parish Registers births & baptisms: ${fullName(p, p.surname)}, ${winText(w)}. Parents can be added on SP's Refine panel after the results (the search form itself has no parent fields). ${login}`);
      }
    }

    // Marriages — one entry per spouse per applicable tier (statutory from 1855, OPR to 1855;
    // a window straddling 1855 yields both). Dated Scottish marriages use their real year ±2;
    // undated spouses the inferred age-18–30 window; no spouse at all → one unfiltered search
    // (the v0.2.51 FreeBMD rule).
    const adult = (p.spouses || []).length > 0 || (p.spouseSurnames || []).length > 0 || by == null || dy == null || dy - by >= 16;
    if (adult) {
      const all = spousesOf(p);
      const addMarriage = (w, spouse, dated) => {
        const spouseGiven = spouse ? String(spouse.name || "").trim().split(/\s+/)[0] : null;
        for (const [type, t] of [["stat_marriages", SP_FORMS.stat_marriages], ["opr_marriages", SP_FORMS.opr_marriages]]) {
          const cw = spWindow(t, w.from, w.to);
          if (!cw) continue;
          const f = spBaseFields(t, p, p.surname);
          f[t.yf] = cw.from;
          f[t.yt] = cw.to;
          if (spouse && t.sps) {
            f[t.sps] = spName(spouse.surname);
            if (spouseGiven && spouseGiven !== spouse.surname) f[t.spf] = spName(spouseGiven);
          } else if (spouse && t.spName) {
            f[t.spName] = spName(spouse.surname);
          }
          add("Marriages", `${t.label} — ${dated ? `${dated}, spouse ${spouse.surname}` : spouse ? `spouse ${spouse.surname}` : winText(cw)}`, type, f,
            `ScotlandsPeople ${type === "stat_marriages" ? "statutory marriage index" : "Old Parish Registers banns & marriages"}: ${fullName(p, p.surname)}` +
              (spouse ? ` + spouse ${spouse.surname}` : "") +
              (dated ? `, married ${dated} (searched ${winText(cw)})` : `, searched ${winText(cw)}${spouse ? " (inferred: age 18–30 — no marriage date on the page)" : " (inferred: age 18–30 — the tree records no spouse yet, so no spouse filter is applied)"}`) +
              `. ${login}`);
        }
      };
      for (const s of all.filter((x) => x.year != null)) {
        if (!isScot(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) continue;
        addMarriage({ from: s.year - 2, to: s.year + 2 }, s, s.year);
      }
      const undated = all.length ? all.filter((x) => x.year == null) : (p.spouseSurnames || []).map((sn) => ({ name: "", surname: sn }));
      if ((undated.length || !all.length) && isScot(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
        const raw = marriageWindow(p, null);
        if (raw) {
          if (undated.length) {
            const seen = new Set();
            for (const s of undated) {
              if (seen.has(s.surname)) continue;
              seen.add(s.surname);
              addMarriage(raw, s, null);
            }
          } else {
            addMarriage(raw, null, null);
          }
        }
      }
    }

    // Deaths — one entry per death surname (married-surname logic as everywhere). Statutory
    // deaths carry the age-at-death filter ±10 (SP's fields are free text — Kevin's preferred
    // width, unlike GRO's ±2 cap) and the mother's maiden surname, both indexed from 1855.
    // v0.2.107 — DEATH YEAR UNKNOWN: the inferred window (deathWindow) goes straight into the
    // year-from / year-to boxes of each tier it reaches (OPR to 1855, statutory from 1855); the
    // statutory age range = the window's ages (decision 4b, Kevin 2026-10-10: SP too).
    const dw = !p.living && dy == null ? deathWindow(p) : null;
    if (!p.living && isScot(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace) && (dy != null || dw)) {
      const surnames = deathSurnames(p, dy);
      for (const [type, t] of [["stat_deaths", SP_FORMS.stat_deaths], ["opr_deaths", SP_FORMS.opr_deaths]]) {
        const w = dy != null ? spWindow(t, dy - 2, dy + 2) : spWindow(t, dw.from, dw.to);
        if (!w) continue;
        for (const sn of surnames) {
          const f = spBaseFields(t, p, sn);
          f[t.yf] = w.from;
          f[t.yt] = w.to;
          let extra = "";
          if (type === "stat_deaths") {
            if (dy != null && by != null) {
              const age = dy - by;
              f[t.ageFrom] = Math.max(age - 10, 0);
              f[t.ageTo] = age + 10;
              extra += ` Age at death ${age} ±10 sent.`;
            } else if (dw && dw.by != null) {
              f[t.ageFrom] = Math.max(w.from - dw.by, 0);
              f[t.ageTo] = w.to - dw.by;
              extra += ` Age at death ${f[t.ageFrom]}–${f[t.ageTo]} sent (the window's ages).`;
            }
            if (mother) {
              f[SP_MMN] = mother;
              extra += ` Mother's maiden surname ${mother} sent.`;
            }
          }
          const span = dy != null ? winText(w) : `${winText(w)} (${UNKNOWN_DEATH})`;
          add("Deaths", `${t.label} — ${span}${surnames.length > 1 ? ` — ${fullName(p, sn)}` : ""}`, type, f,
            `ScotlandsPeople ${type === "stat_deaths" ? "statutory death index" : "Old Parish Registers deaths & burials"}: ${fullName(p, sn)}, ${dy != null ? winText(w) : unknownDeathText(dw, w.from, w.to)}.${extra} ${login}`);
        }
      }
    }

    // Census — 1841–1921 (SP has 1911 AND 1921, which FamilySearch lacks), one entry per
    // Scotland-bracketed year; a woman is searched under her surname AT that year. Label = the
    // shared census title (v0.2.123: "1881 Scotland Census — <name>", as on every other menu).
    for (const y of spCensusYears(p)) {
      const t = SP_FORMS.census;
      const sn = surnameAt(p, y);
      const f = spBaseFields(t, p, sn);
      f[`edit-search-params-nrs-census-year-${y}`] = true;
      const title = censusTitle({ year: y, region: regionByKey("scotland"), sub: null });
      add("Census", `${title} — ${fullName(p, sn)}`, "census", f,
        `ScotlandsPeople ${title}: ${fullName(p, sn)}.${y >= 1911 ? " FamilySearch has no Scottish " + y + " census — SP is the place to look." : ""} ${login}`);
    }
    return out;
  }
  FSSE.spOptions = spOptions; // exposed for tests

  // ---- Newspapers (the "Newspapers" menu, v0.2.55) ---------------------------------------------
  // Pure GET-URL searches — no logins walls to automate, no content scripts. Site list is
  // Kevin's (2026-09-04) + additions; grammars: Newspapers.com / Trove / Papers Past from
  // WikiTree Sourcer's production builders, Chronicling America from the LOC's own API docs
  // (the loc.gov migration — legacy chroniclingamerica.loc.gov URLs redirect and LOSE their
  // date filter, so we link the new grammar directly), GenealogyBank and Findmypast from
  // their well-known form parameter names (⏳ click-verify), OldNews best-guess (the site is
  // a client-side app — ⏳; a pasted real results URL from Kevin upgrades it). Kevin's subs:
  // Newspapers.com + GenealogyBank (+ MyHeritage → OldNews, Findmypast); Trove, Chronicling
  // America and Papers Past are free. Deferred pending a real URL: Welsh Newspapers Online
  // (newspapers.library.wales — bot-walled to probes; FMP's British & Irish papers cover
  // Wales meanwhile).
  // Names: FIRST given + surname as an exact phrase (papers rarely print middle names);
  // a married woman gets one entry per name — maiden (birth→death+2) + each married surname
  // (that marriage's year→death+2, post-death marriages dropped) — Kevin's pick, mirroring
  // the full-text group. Groups by region, gated on the countries the person's events touch.
  const touchedRegions = (p) => {
    const keys = new Set();
    let wales = false; // an E&W place naming Wales (never NSW — that classifies au first)
    const addPlace = (pl) => {
      const c = classify(pl);
      if (c && c.region) {
        keys.add(c.region.key);
        if (c.region.key === "enw" && /\bwales\b/i.test(pl || "")) wales = true;
      }
    };
    addPlace(p.birthPlace);
    addPlace(p.christeningPlace);
    for (const s of p.spouses || []) addPlace(s.marriagePlace);
    for (const f of p.facts || []) addPlace(f.place);
    addPlace(p.deathPlace);
    addPlace(p.burialPlace);
    return { keys, wales };
  };
  function newspaperOptions(p) {
    const out = [];
    const first = String(p.given || "").trim().split(/\s+/)[0];
    if (!first || !p.surname) return out;
    const { keys: regions, wales } = touchedRegions(p);
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    // Life window, Sourcer-style when one bound is missing (~80-year life assumed).
    let lifeFrom = by;
    let lifeTo = dy != null ? dy + 2 : null;
    if (lifeFrom == null && lifeTo != null) lifeFrom = lifeTo - 82;
    if (lifeTo == null && lifeFrom != null) lifeTo = lifeFrom + 82;

    // One search per name: maiden always; a woman also under each married surname, from that
    // marriage's year (post-death marriages dropped, as everywhere).
    const names = [{ surname: p.surname, from: lifeFrom, to: lifeTo }];
    for (const sn of p.marriedSurnames || []) {
      const dated = spousesOf(p)
        .filter((s) => s.year != null && s.surname.toLowerCase() === sn.toLowerCase())
        .sort((a, b) => a.year - b.year);
      if (dy != null && dated.length && dated[0].year > dy) continue; // married after death → wrong person
      names.push({ surname: sn, from: dated.length ? dated[0].year : lifeFrom, to: lifeTo });
    }

    const phrase = (sn) => `${first} ${sn}`;
    const winText = (n) => (n.from != null && n.to != null ? ` ${n.from}–${n.to}` : "");
    const clampWin = (n, lo, hi) => {
      if (n.from == null || n.to == null) return { from: null, to: null };
      const from = Math.max(n.from, lo);
      const to = Math.min(n.to, hi);
      return from <= to ? { from, to } : null; // null = the life window misses the coverage
    };
    const add = (group, siteLabel, n, url, tooltip) => {
      out.push({ group, label: `${siteLabel} — "${phrase(n.surname)}"${winText(n)}`, url, tooltip });
    };
    const perName = (fn) => {
      for (const n of names) fn(n);
    };

    // WORLDWIDE ------------------------------------------------------------------
    perName((n) => {
      let url = `https://www.newspapers.com/search?query=${encodeURIComponent(`"${phrase(n.surname)}"`)}`;
      if (n.from != null && n.to != null) url += `&dr_year=${n.from}-${n.to}`;
      add("Worldwide", "Newspapers.com", n, url,
        `Newspapers.com (your subscription): exact phrase "${phrase(n.surname)}"${winText(n)}. Largest US coverage plus UK, Canada and Australia.`);
    });
    perName((n) => {
      // Grammar from Kevin's own manual searches (2026-09-04): the page wants BOTH qkeyword
      // (the raw name) and q (the quoted phrase) — q alone leaves the boxes empty — and a
      // year range travels as qpublication-date=+year=<from>+matchExactly=1+yearTo=<to>.
      let url = `https://www.oldnews.com/en/search?qkeyword=${encodeURIComponent(phrase(n.surname))}`;
      if (n.from != null && n.to != null) url += `&qpublication-date=${encodeURIComponent(`+year=${n.from}+matchExactly=1+yearTo=${n.to}`)}`;
      url += `&q=${encodeURIComponent(`"${phrase(n.surname)}"`)}`;
      add("Worldwide", "OldNews", n, url,
        `OldNews.com (MyHeritage): exact phrase "${phrase(n.surname)}"${winText(n)}.`);
    });

    // UNITED STATES --------------------------------------------------------------
    if (regions.has("us")) {
      perName((n) => {
        let url = `https://www.genealogybank.com/explore/newspapers/all?fname=${encodeURIComponent(first)}&lname=${encodeURIComponent(n.surname)}`;
        if (n.from != null && n.to != null) url += `&rgfromdate=${n.from}&rgtodate=${n.to}&dateType=range`;
        add("United States", "GenealogyBank", n, url,
          `GenealogyBank (your subscription): US newspapers 1690 on, ${first} + ${n.surname}${winText(n)}.`);
      });
      perName((n) => {
        const w = clampWin(n, 1756, 1963);
        if (!w) return; // the digitised run ends 1963
        let url = `https://www.loc.gov/collections/chronicling-america/?dl=page&ops=PHRASE&searchType=advanced&qs=${encodeURIComponent(phrase(n.surname))}`;
        if (w.from != null) url += `&start_date=${w.from}-01-01&end_date=${w.to}-12-31`;
        add("United States", "Chronicling America", { ...n, ...w }, url,
          `Chronicling America (Library of Congress, free): US newspapers to 1963, exact phrase "${phrase(n.surname)}"${w.from != null ? ` ${w.from}–${w.to}` : ""}.`);
      });
    }

    // UK & IRELAND (Findmypast's British & Irish newspapers = the BNA index; Kevin has FMP).
    // Grammar from Kevin's own working search (2026-09-04): `/search/results?sid=100` (the
    // newspapers dataset) takes the person's BIRTH and DEATH years ±2 directly — far better
    // than a publication-year window — plus firstname_variants (Jas./Jos. etc.) and an
    // optional sourcecountry filter, sent only when the person's UK footprint is one
    // unambiguous country (Wales-touched E&W people get no filter: their papers are Welsh
    // AND English).
    if (regions.has("enw") || regions.has("scotland") || regions.has("ireland")) {
      const uk = ["enw", "scotland", "ireland"].filter((k) => regions.has(k));
      let country = null;
      if (uk.length === 1) {
        if (uk[0] === "scotland") country = "scotland";
        else if (uk[0] === "ireland") country = "ireland";
        else if (!wales) country = "england";
      }
      perName((n) => {
        let url = `${fmpResults()}?sid=100&firstname=${encodeURIComponent(first)}&firstname_variants=true&lastname=${encodeURIComponent(n.surname)}`;
        if (by != null) url += `&yearofbirth=${by}&yearofbirth_offset=2`;
        if (dy != null) url += `&yearofdeath=${dy}&yearofdeath_offset=2`;
        url += "&keywordsplace_proximity=5";
        if (country) url += `&sourcecountry=${country}`;
        add("UK & Ireland", "Findmypast newspapers", n, url,
          `Findmypast's British & Irish newspapers (the British Newspaper Archive index — your FMP login works): ${first} (+ name variants) + ${n.surname}, born ${by != null ? by + " ±2" : "?"}${dy != null ? `, died ${dy} ±2` : ""}.` +
            (country ? ` Restricted to ${country[0].toUpperCase()}${country.slice(1)} papers.` : " Covers English, Welsh, Scottish and Irish papers."));
      });
    }

    // AUSTRALIA ------------------------------------------------------------------
    if (regions.has("au")) {
      perName((n) => {
        let url = `https://trove.nla.gov.au/search/advanced/category/newspapers?keyword.phrase=${encodeURIComponent(phrase(n.surname))}`;
        const w = clampWin(n, 1803, 2100);
        if (w && w.from != null) url += `&date.from=${w.from}&date.to=${w.to}`;
        add("Australia", "Trove", n, url,
          `Trove (National Library of Australia, free): exact phrase "${phrase(n.surname)}"${winText(n)}. Australian newspapers from 1803.`);
      });
    }

    // NEW ZEALAND ----------------------------------------------------------------
    if (regions.has("nz")) {
      perName((n) => {
        const w = clampWin(n, 1837, 1992);
        if (!w) return;
        let url = `https://paperspast.natlib.govt.nz/newspapers?query=${encodeURIComponent(`"${phrase(n.surname)}"`)}`;
        if (w.from != null) url += `&start_date=01-01-${w.from}&end_date=31-12-${w.to}`;
        add("New Zealand", "Papers Past", { ...n, ...w }, url,
          `Papers Past (National Library of NZ, free): NZ newspapers 1837–1992, exact phrase "${phrase(n.surname)}"${w.from != null ? ` ${w.from}–${w.to}` : ""}.`);
      });
    }
    return out;
  }
  FSSE.newspaperOptions = newspaperOptions; // exposed for tests

  // ---- RootsIreland (the "RootsIreland" menu, v0.2.59) -----------------------------------------
  // The Irish Family History Foundation's county-centre transcripts (baptisms, marriages,
  // burials, census, gravestones, Griffith's, passenger lists). Probed live 2026-09-04: the
  // QUICK search is a plain GET that works ANONYMOUSLY — `search.php?surname=&firstname=
  // &year=` (year ±5, fixed by the site) returns the form pre-filled plus per-category
  // result COUNTS; viewing the records needs a subscription (Kevin: "not yet, considering" —
  // the counts alone tell him where records exist). Scope: `/ifhf/` = all-Ireland, or a
  // county centre's directory (donegal, derry, …). The ADVANCED per-type forms
  // (`/ifhf/quis.php?type=birth|marriage|death|census|gravestone|griffith|ships|subs`) are
  // login-walled (the redirect drops the query string, GRO-style) — Kevin chose "quick now,
  // advanced later": when he subscribes, a pasted logged-in form unlocks phase B (the
  // GRO-pattern filler). Entries: one per life event with an Irish place — the county search
  // (when the place names a county) AND the all-Ireland search (county centres transcribed
  // different sources, so the wide net catches neighbouring centres' records).
  const RI_ALL = "https://www.rootsireland.ie/ifhf/search.php";
  const RI_COUNTY_BASE = "https://rootsireland.ie/"; // + <slug>/search.php
  // County name → centre directory. Multi-centre counties: Cork → the Mallow centre
  // (corknortheast — the only Cork centre online), Galway → galwayeast, Dublin/Tipperary
  // default to the North centre unless the place says South. "Londonderry" maps to derry.
  const RI_COUNTIES = [
    [/londonderry/i, "derry", "Derry"],
    [/\bderry\b/i, "derry", "Derry"],
    [/\bantrim\b/i, "antrim", "Antrim"], [/\barmagh\b/i, "armagh", "Armagh"],
    [/\bcarlow\b/i, "carlow", "Carlow"], [/\bcavan\b/i, "cavan", "Cavan"],
    [/\bclare\b/i, "clare", "Clare"], [/\bcork\b/i, "corknortheast", "Cork (Mallow centre)"],
    [/\bdonegal\b/i, "donegal", "Donegal"], [/\bdown\b/i, "down", "Down"],
    [/\bdublin\b.*\bsouth\b|\bsouth\b.*\bdublin\b/i, "dublinsouth", "Dublin (South)"],
    [/\bdublin\b/i, "dublinnorth", "Dublin (North)"],
    [/\bfermanagh\b/i, "fermanagh", "Fermanagh"], [/\bgalway\b/i, "galwayeast", "Galway (East)"],
    [/\bkerry\b/i, "kerry", "Kerry"], [/\bkildare\b/i, "kildare", "Kildare"],
    [/\bkilkenny\b/i, "kilkenny", "Kilkenny"], [/\blaois\b/i, "laois", "Laois"],
    [/\bleitrim\b/i, "leitrim", "Leitrim"], [/\blimerick\b/i, "limerick", "Limerick"],
    [/\blongford\b/i, "longford", "Longford"], [/\blouth\b/i, "louth", "Louth"],
    [/\bmayo\b/i, "mayo", "Mayo"], [/\bmeath\b/i, "meath", "Meath"],
    [/\bmonaghan\b/i, "monaghan", "Monaghan"], [/\boffaly\b/i, "offaly", "Offaly"],
    [/\broscommon\b/i, "roscommon", "Roscommon"], [/\bsligo\b/i, "sligo", "Sligo"],
    [/\btipperary\b.*\bsouth\b|\bsouth\b.*\btipperary\b/i, "tipperarysouth", "Tipperary (South)"],
    [/\btipperary\b/i, "tipperarynorth", "Tipperary (North)"],
    [/\btyrone\b/i, "tyrone", "Tyrone"], [/\bwaterford\b/i, "waterford", "Waterford"],
    [/\bwestmeath\b/i, "westmeath", "Westmeath"], [/\bwexford\b/i, "wexford", "Wexford"],
    [/\bwicklow\b/i, "wicklow", "Wicklow"],
  ];
  const isIrish = (pl) => {
    const c = classify(pl);
    return !!c && !!c.region && c.region.key === "ireland";
  };
  const riCounty = (pl) => {
    if (!isIrish(pl)) return null;
    for (const [re, slug, name] of RI_COUNTIES) if (re.test(pl)) return { slug, name };
    return null;
  };
  function riUrl(base, surname, first, year) {
    let url = `${base}?surname=${encodeURIComponent(surname)}&firstname=${encodeURIComponent(first)}`;
    if (year != null) url += `&year=${year}`;
    return url;
  }
  function riOptions(p) {
    const out = [];
    const first = String(p.given || "").trim().split(/\s+/)[0];
    if (!first || !p.surname) return out;
    const note = "Searching is free and shows how many baptism, marriage, burial, census, gravestone, Griffith's and passenger-list records match (a RootsIreland subscription opens the records themselves).";
    const addPair = (group, surname, year, place) => {
      const county = riCounty(place);
      const who = `${first} ${surname}${year != null ? `, ${year} ±5` : ""}`;
      if (county) {
        out.push({ group, label: `${county.name} — ${who}`,
          url: riUrl(`${RI_COUNTY_BASE}${county.slug}/search.php`, surname, first, year),
          tooltip: `RootsIreland quick search of the ${county.name} centre's transcripts: ${who}. ${note}` });
      }
      out.push({ group, label: `All Ireland — ${who}`,
        url: riUrl(RI_ALL, surname, first, year),
        tooltip: `RootsIreland quick search across every county centre: ${who}.${county ? " County centres transcribed different sources — the wide net catches records filed under a neighbouring centre." : ""} ${note}` });
    };
    const by = birthYearOf(p);
    const dy = deathYearOf(p);

    // Birth — the birth/christening place is Irish.
    const birthPlace = isIrish(p.birthPlace) ? p.birthPlace : isIrish(p.christeningPlace) ? p.christeningPlace : null;
    if (birthPlace) addPair("Births", p.surname, by, birthPlace);

    // Marriages — each spouse whose marriage place is Irish (searched under the maiden name;
    // Irish marriage records index the bride's maiden surname).
    for (const s of spousesOf(p)) {
      if (isIrish(s.marriagePlace)) addPair("Marriages", p.surname, s.year, s.marriagePlace);
    }

    // Death — the death/burial place is Irish; a married woman under each married surname.
    const deathPlace = isIrish(p.deathPlace) ? p.deathPlace : isIrish(p.burialPlace) ? p.burialPlace : null;
    if (deathPlace && !p.living) {
      const married = p.marriedSurnames || [];
      const afterDeath = (sn) =>
        dy != null && spousesOf(p).some((s) => s.year != null && s.year > dy && s.surname.toLowerCase() === sn.toLowerCase());
      let surnames = [p.surname];
      if (married.length && marriedBy(p, dy)) {
        const ok = married.filter((sn) => !afterDeath(sn));
        if (ok.length) surnames = ok;
      }
      for (const sn of surnames) addPair("Deaths", sn, dy, deathPlace);
    }
    return out;
  }
  FSSE.riOptions = riOptions; // exposed for tests

  // ---- IrishGenealogy.ie (the "IrishGenealogy" menu, v0.2.60) ----------------------------------
  // Ireland's FREE official records site (Dept. of Tourism/Culture): the GRO civil register
  // indexes WITH free register images (births 1864+, marriages 1845+ non-Catholic / 1864+
  // Catholic, deaths 1864+ — released on rolling 100/75/50-year privacy rules) and selected
  // CHURCH registers (Dublin, Kerry, Cork & Ross and some others — coverage is partial, so
  // absence proves nothing). Pure GET URLs — grammar from WikiTree Sourcer's production
  // irishg module (the unified /search/ page): church-or-civil=civil|church, firstname,
  // lastname, yearStart/yearEnd, event-birth|-marriage|-death|-baptisms|-burials=1,
  // mothers-surname. The site sits behind Cloudflare (bot-walls curl; fine in a browser).
  // Spouse/parent "relation" filters exist on the form but their URL naming is unverified —
  // not sent; add them on the page. One civil + one church entry per Irish life event.
  const IG_BASE = "https://www.irishgenealogy.ie/search/";
  // Rolling release cut-offs (roughly current year − 100/75/50; the actual release can lag a
  // year or two — a clamped search just returns fewer rows). Bump IG_NOW occasionally.
  const IG_NOW = 2026;
  const IG_CIVIL = {
    birth: [1864, IG_NOW - 100],
    marriage: [1845, IG_NOW - 75],
    death: [1864, IG_NOW - 50],
  };
  function igUrl(kind, params) {
    const parts = [`church-or-civil=${kind}`];
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
    }
    return `${IG_BASE}?${parts.join("&")}`;
  }
  function igOptions(p) {
    const out = [];
    const first = String(p.given || "").trim().split(/\s+/)[0];
    if (!first || !p.surname) return out;
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const mother = p.mother && p.mother.surname ? p.mother.surname : null;
    const clampIg = (y, [lo, hi]) => {
      if (y == null) return null;
      const from = Math.max(y - 2, lo);
      const to = Math.min(y + 2, hi);
      return from <= to ? { from, to } : null;
    };
    const winOf = (y) => (y != null ? { from: y - 2, to: y + 2 } : { from: null, to: null });
    const wText = (w) => (w.from != null ? `, ${w.from}–${w.to}` : "");
    const base = (surname, w) => ({ firstname: first, lastname: surname, yearStart: w.from, yearEnd: w.to });
    const free = "Free official site — the civil entries link the ACTUAL register images.";
    const church = "Church registers cover selected dioceses (Dublin, Kerry, Cork & Ross and some others) — absence proves nothing.";
    const add = (group, label, url, tooltip) => out.push({ group, label, url, tooltip });

    // Births — civil index (1864+) and/or church baptisms.
    const birthPlace = isIrish(p.birthPlace) ? p.birthPlace : isIrish(p.christeningPlace) ? p.christeningPlace : null;
    if (birthPlace) {
      const w = clampIg(by, IG_CIVIL.birth);
      if (w) {
        add("Births", `Civil births — ${first} ${p.surname}${wText(w)}`,
          igUrl("civil", { ...base(p.surname, w), "event-birth": 1, "mothers-surname": mother }),
          `IrishGenealogy.ie civil birth register index: ${first} ${p.surname}${wText(w)}.` +
            (mother ? ` Mother's maiden surname ${mother} sent.` : "") + ` ${free}`);
      }
      const cw = winOf(by);
      add("Births", `Church baptisms — ${first} ${p.surname}${wText(cw)}`,
        igUrl("church", { ...base(p.surname, cw), "event-baptisms": 1 }),
        `IrishGenealogy.ie church baptism registers: ${first} ${p.surname}${wText(cw)}. ${church}`);
    }

    // Marriages — per Irish-placed spouse (maiden surname; add the spouse on the form —
    // the URL's relation filters are unverified).
    for (const s of spousesOf(p)) {
      if (!isIrish(s.marriagePlace)) continue;
      const w = clampIg(s.year, IG_CIVIL.marriage);
      if (w) {
        add("Marriages", `Civil marriages — ${first} ${p.surname}${wText(w)}${s.surname ? ` (⚭ ${s.surname})` : ""}`,
          igUrl("civil", { ...base(p.surname, w), "event-marriage": 1 }),
          `IrishGenealogy.ie civil marriage register index: ${first} ${p.surname}${wText(w)}, spouse ${s.surname} (add the spouse's name on the form to narrow). ${free}`);
      }
      const cw = winOf(s.year);
      add("Marriages", `Church marriages — ${first} ${p.surname}${wText(cw)}${s.surname ? ` (⚭ ${s.surname})` : ""}`,
        igUrl("church", { ...base(p.surname, cw), "event-marriage": 1 }),
        `IrishGenealogy.ie church marriage registers: ${first} ${p.surname}${wText(cw)}, spouse ${s.surname}. ${church}`);
    }

    // Deaths — civil index (1864+, released 50 years on) and church burials, one per death
    // surname (a woman under each married surname).
    const deathPlace = isIrish(p.deathPlace) ? p.deathPlace : isIrish(p.burialPlace) ? p.burialPlace : null;
    if (deathPlace && !p.living) {
      const married = p.marriedSurnames || [];
      const afterDeath = (sn) =>
        dy != null && spousesOf(p).some((s) => s.year != null && s.year > dy && s.surname.toLowerCase() === sn.toLowerCase());
      let surnames = [p.surname];
      if (married.length && marriedBy(p, dy)) {
        const ok = married.filter((sn) => !afterDeath(sn));
        if (ok.length) surnames = ok;
      }
      for (const sn of surnames) {
        const w = clampIg(dy, IG_CIVIL.death);
        if (w) {
          add("Deaths", `Civil deaths — ${first} ${sn}${wText(w)}`,
            igUrl("civil", { ...base(sn, w), "event-death": 1 }),
            `IrishGenealogy.ie civil death register index: ${first} ${sn}${wText(w)}. ${free}`);
        }
        const cw = winOf(dy);
        add("Deaths", `Church burials — ${first} ${sn}${wText(cw)}`,
          igUrl("church", { ...base(sn, cw), "event-burials": 1 }),
          `IrishGenealogy.ie church burial registers: ${first} ${sn}${wText(cw)}. ${church}`);
      }
    }
    return out;
  }
  FSSE.igOptions = igOptions; // exposed for tests

  // ---- MyHeritage Records (the "MyHeritage Records" menu, v0.2.62) -----------------------------
  // The native MyHeritage row is preserved (it opens FS's own handoff); this menu adds
  // pre-filled searches of MyHeritage's own site. Kevin's scope (2026-09-04): ALL RECORDS +
  // FAMILY TREES only — the trees search (collection-1) is the Ancestry-PMT analog and the
  // Smart Matches well; census/BMD categories are third-tier behind FS/Ancestry/FMP for the
  // same records. Grammar copied verbatim from WikiTree Sourcer's mh module example URLs:
  // /research?formId=master…&qname=Name+fn.<F>+fnmo.1+ln.<S>+lnmsrs.false[+g.M|F]
  // &qevents-event1=Event+et.birth+ey.<y>&qevents-any/1event_1=Event+et.death+ey.<y>
  // &qevents=List — the "+" separators are literal, and SPACES inside values encode as %2F3.
  // Events are numbered Sourcer's way: the FIRST event is qevents-event1, every later one
  // qevents-any/1event_<N> with N counting from 1 (v0.2.111 — the death was 1event_2 with no
  // 1event_1 before, which MyHeritage tolerated; contiguous is what its own form emits).
  // v0.2.111 — COUNTRY SCOPE. Kevin's verified URL (Mary Cullum, b. 1891 d. 1956 Australia):
  //   …&qevents-event1=Event+et.birth+ey.1891&qevents-any/1event_1=Event+et.any+ep.Australia
  //   +epmo.similar&qevents-any/1event_2=Event+et.death+ey.1956&qevents=List
  // — the COUNTRY rides as its own "any" event BETWEEN the birth and death events, and
  // MyHeritage's similar-place matching keeps the search within it instead of searching the
  // world (our URLs carried no place at all, hence "World"). mhOptions offers one all-records
  // entry per country the person's events touch (ancestryCountries' walk — birth first, Wales
  // re-tested) and the worldwide search only when no place classifies. MH_COUNTRY maps our
  // country names to MyHeritage's own words where they differ ("USA" — its places read
  // "…, New York, USA"); only Australia is click-verified, the rest follow the same grammar.
  const MH_BASE = "https://www.myheritage.com/research";
  const MH_MASTER = "?s=1&formId=master&formMode=1&useTranslation=1&exactSearch=&p=1&action=query&view_mode=card"; // Kevin's param order
  const MH_TREES = "/collection-1/myheritage-family-trees?formId=trees&action=query&formMode=1&useTranslation=1&view_mode=card";
  const MH_COUNTRY = { "United States": "USA" };
  // v0.2.121 — CENSUS collections (Kevin: "I assume that MyHeritage.com has the us census returns.
  // Can these census searches be added to the MyHeritage menus?" + "Canada as well please if they
  // are present on MyHeritage.com"): MyHeritage's collection path per census year, from WikiTree
  // Sourcer's production table (record_collections.mjs, `mh.urlPart`) — its mh module runs these
  // live. MyHeritage pages are Imperva-walled, so no title check from here; Kevin's click is the
  // verification. A collection-restricted search = the path + the SAME master-form query as the
  // all-records search (Sourcer's SameCollection route). Not on MyHeritage per the table: the 1921
  // E&W census, Scotland 1911, the Irish censuses, state / provincial censuses.
  const MH_CENSUS = {
    enw: { 1841: "collection-10150/1841-england-wales-census", 1851: "collection-10151/1851-england-wales-census", 1861: "collection-10152/1861-england-wales-census", 1871: "collection-10153/1871-england-wales-census", 1881: "collection-10154/1881-england-wales-census", 1891: "collection-10155/1891-england-wales-census", 1901: "collection-10156/1901-england-wales-census", 1911: "collection-10446/1911-england-wales-census", 1939: "collection-10678/1939-register-of-england-wales" },
    scotland: { 1841: "collection-10979/1841-scotland-census", 1851: "collection-10980/1851-scotland-census", 1861: "collection-10978/1861-scotland-census", 1871: "collection-10976/1871-scotland-census", 1881: "collection-10977/1881-scotland-census", 1891: "collection-10974/1891-scotland-census", 1901: "collection-10975/1901-scotland-census" },
    us: { 1850: "collection-10126/1850-united-states-federal-census", 1860: "collection-10127/1860-united-states-federal-census", 1870: "collection-10128/1870-united-states-federal-census", 1880: "collection-10129/1880-united-states-federal-census", 1900: "collection-10131/1900-united-states-federal-census", 1910: "collection-10132/1910-united-states-federal-census", 1920: "collection-10133/1920-united-states-federal-census", 1930: "collection-10134/1930-united-states-federal-census", 1940: "collection-10053/1940-united-states-federal-census", 1950: "collection-11006/1950-united-states-federal-census" },
    canada: { 1851: "collection-10522/1851-canada-census", 1861: "collection-10521/1861-canada-census", 1871: "collection-10520/1871-canada-census", 1881: "collection-10441/1881-canada-census", 1891: "collection-10440/1891-canada-census", 1901: "collection-10448/1901-canada-census", 1911: "collection-10447/1911-canada-census", 1921: "collection-10690/1921-canada-census", 1931: "collection-20654/1931-canada-census" },
  };
  const mhCountries = (p) => ancestryCountries(p).map((c) => MH_COUNTRY[c.country] || c.country);
  const mhVal = (s) => encodeURIComponent(String(s)).replace(/%20/g, "%2F3");
  // `base` (v1.0.4) = another MyHeritage host's /research root than MH_BASE (the Library Edition).
  function mhUrl(pathAndForm, p, surname, withEvents, country, base) {
    const g = /^m/i.test(p.sex || "") ? "M" : /^f/i.test(p.sex || "") ? "F" : null;
    const first = String(p.given || "").trim().split(/\s+/)[0];
    let qname = `Name+fn.${mhVal(first)}+fnmo.1+ln.${mhVal(surname)}+lnmsrs.false`;
    if (g) qname += `+g.${g}`;
    let url = `${base || MH_BASE}${pathAndForm}&qname=${qname}`;
    if (withEvents) {
      const by = birthYearOf(p);
      const dy = deathYearOf(p);
      const events = [];
      if (by != null) events.push(`Event+et.birth+ey.${by}`);
      if (country) events.push(`Event+et.any+ep.${mhVal(country)}+epmo.similar`);
      if (dy != null) events.push(`Event+et.death+ey.${dy}`);
      events.forEach((e, i) => { url += i === 0 ? `&qevents-event1=${e}` : `&qevents-any/1event_${i}=${e}`; });
      if (events.length) url += "&qevents=List";
    }
    return url;
  }
  FSSE.mhCountries = mhCountries; // exposed for tests
  // v1.0.4 — `opts` = { site, base, brand, trees } builds the same menu for another MyHeritage host:
  // the "MyHeritage Library Edition" row FamilySearch lists on a FamilySearch Center's network
  // (Kevin's find at the Boise FSC, 2026-11-04: FS's link there is OUR master-form grammar on
  // myheritagelibraryedition.com — qname fn/ln + fnmo.1, qevents-event1 birth, the any-event
  // place — plus catId=1 and a click-time csrf_token). `site` keys the native row, `base` every
  // URL we build, `brand` the wording; `trees: false` drops the Family Trees entry (the Library
  // Edition is records only — no member trees, no Smart Matches).
  function mhOptions(p, opts) {
    const cfg = opts || {};
    const siteId = cfg.site || "mh-records";
    const base = cfg.base || MH_BASE;
    const brand = cfg.brand || "MyHeritage";
    const out = [];
    const first = String(p.given || "").trim().split(/\s+/)[0];
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const lived = by != null || dy != null ? ` (${by != null ? by : "?"}–${dy != null ? dy : "?"})` : "";
    // "All Collections — <First Surname> (b–d)" — v0.2.104 (Kevin: the Ancestry treatment for
    // MyHeritage too): the native MyHeritage row is hidden by content.js (site `replaces`) and
    // its search LEADS this menu — the row's own link (the person's details as FamilySearch
    // hands them to MyHeritage), opened byte-for-byte; when the row has no link, or the layout
    // has no MyHeritage row, the all-records search under the maiden name stands in. Labelled
    // "All Results" v0.2.104–111; v0.2.112 (Kevin: "Replace 'All Results' with 'All Collections -
    // Mary Cullum (1891-1956)'") carries the name + life span like every other entry, and no
    // entry of this menu says "MyHeritage" any more ("it should be obvious that each is a
    // MyHeritage search selection") — the bare "All Collections" only until the name scrapes.
    const nativeUrl = nativeUrlOf(p, siteId);
    const nativeRow = nativeRowOf(p, siteId) || !!nativeUrl;
    const who = first && p.surname ? `${first} ${p.surname}` : "this person";
    const allLabel = first && p.surname ? `All Collections — ${first} ${p.surname}${lived}` : "All Collections";
    if (nativeRow) {
      // v0.2.105 — Kevin's finding: the native MyHeritage link is built AT CLICK TIME (it
      // carries a csrf_token + fspid), so the row has no href to read → the click is handed to
      // the row (and is whenever the row is present — "let FamilySearch build the needed URL
      // rather than assume"); a read link / our grammar is only the reserve should the row
      // vanish between ticks.
      out.push({ group: "All records", label: allLabel, nativeClick: true,
        url: nativeUrl || (first && p.surname ? mhUrl(MH_MASTER, p, p.surname, true, null, base) : base),
        tooltip: `${brand}'s own search for ${who} across all its collections — FamilySearch's own ${brand} entry (hidden behind this menu) runs it: your click is handed to it, so ${brand} receives exactly what FamilySearch sends (its partner link with the one-time token).` });
    }
    if (!first || !p.surname) return out;
    if (!nativeUrl && !nativeRow) {
      out.push({ group: "All records", label: allLabel,
        url: mhUrl(MH_MASTER, p, p.surname, true, null, base),
        tooltip: `${brand} all-records search: ${first} ${p.surname}${by != null ? `, born ${by}` : ""}${dy != null ? `, died ${dy}` : ""}. (The native ${brand} search link was not found on this page, so this search is built from the tree's vitals.)` });
    }
    // All records — maiden + each married surname (post-death marriages dropped).
    const names = [p.surname];
    for (const sn of p.marriedSurnames || []) {
      const dated = spousesOf(p).filter((s) => s.year != null && s.surname.toLowerCase() === sn.toLowerCase()).sort((a, b) => a.year - b.year);
      if (dy != null && dated.length && dated[0].year > dy) continue;
      names.push(sn);
    }
    // v0.2.111 — one block per country the person's events touch (birth country first), the
    // country sent as an any-event place (Kevin's verified grammar, see mhUrl); the worldwide
    // search only when no place on the page classifies to a country.
    const countries = mhCountries(p);
    const vitals = `${by != null ? `, born ${by}` : ""}${dy != null ? `, died ${dy}` : ""}`;
    for (const country of countries.length ? countries : [null]) {
      for (const sn of names) {
        const married = sn !== p.surname ? " (married surname)" : "";
        if (country) {
          out.push({ group: "All records", label: `${country} — ${first} ${sn}${lived}`,
            url: mhUrl(MH_MASTER, p, sn, true, country, base),
            tooltip: `${brand} all-records search within ${country}: ${first} ${sn}${vitals}.${married} ${country} is sent as the place of an "any" event with similar-place matching, so MyHeritage keeps the search within it instead of the whole world — offered because this person's places touch ${country}.` });
        } else {
          out.push({ group: "All records", label: `Worldwide — ${first} ${sn}${lived}`,
            url: mhUrl(MH_MASTER, p, sn, true, null, base),
            tooltip: `${brand} all-records search, worldwide: ${first} ${sn}${vitals}.${married} (No place on this page classifies to a country MyHeritage can be told, so the search is not narrowed.)` });
        }
      }
    }
    // CENSUS — v0.2.121: every bracketed census year MyHeritage holds (`censusYears`, the
    // FamilySearch menu's rule; state / provincial sets skipped), the collection path + the master
    // query, a woman under her surname of that year. Label = the shared census title (v0.2.123:
    // "1841 E&W Census", "1900 US Federal Census" — the same wording on every menu) + the name.
    for (const c of censusYears(p)) {
      if (c.sub) continue;
      const path = MH_CENSUS[c.region.key] && MH_CENSUS[c.region.key][c.year];
      if (!path) continue;
      const sn = surnameAt(p, c.year);
      const title = censusTitle(c);
      out.push({ group: "Census", label: `${title} — ${first} ${sn}`,
        url: mhUrl(`/${path}${MH_MASTER}`, p, sn, true, null, base),
        tooltip: `${brand} ${title}: ${first} ${sn}${vitals}.${sn !== p.surname ? " (married surname of that year)" : ""} The search is restricted to that one collection.` });
    }
    if (cfg.trees === false) return out; // the Library Edition holds records only
    // Family trees — the Smart Matches well; maiden name (trees index women by birth name).
    out.push({ group: "Family trees", label: `Family Trees — ${first} ${p.surname}${lived}`,
      url: mhUrl(MH_TREES, p, p.surname, true, null, base), // no country — one worldwide collection
      tooltip: `MyHeritage Family Trees (collection 1) — other members' trees holding a ${first} ${p.surname}${lived}: the Smart Matches well, strong on European trees.` });
    return out;
  }
  FSSE.mhOptions = mhOptions; // exposed for tests
  // v1.0.4 — the FamilySearch Center menu: the same list on the Library Edition's host (FS's own
  // link there has no "www"), without the Family Trees entry.
  const MH_LIBRARY = { site: "mh-library", base: "https://myheritagelibraryedition.com/research", brand: "MyHeritage Library Edition", trees: false };
  const mhLibraryOptions = (p) => mhOptions(p, MH_LIBRARY);
  FSSE.mhLibraryOptions = mhLibraryOptions; // exposed for tests

  // ---- Findmypast Records (the "Findmypast Records" menu, v0.2.62) -----------------------------
  // The native Findmypast row is HIDDEN since v0.2.104 (its search = this menu's leading "All
  // Results" entry; preserved v0.2.62–103). Kevin's scope (2026-09-04): UNIQUE-FIRST — no
  // duplication of what other menus own (GRO indexes → FreeBMD/GRO menus; newspapers → the
  // Newspapers menu; Scottish records → ScotlandsPeople): ALL RECORDS + CENSUS (the 1921 E&W
  // census — FMP holds the IMAGES, FS only an index — the 1939 Register, E&W 1841–1911 and
  // Irish 1901/1911, per bracketed year) + PARISH records (baptisms/marriages/burials — FMP's
  // parish depth; parents sent on baptisms, spouse on marriages). Grammar = Kevin's own
  // verified sid= style + Sourcer's fmp module: /search/results with sid=102 (census
  // category) / sid=101 (BMDs) + collection=, firstname/_variants (first name only — Kevin's
  // pick), eventyear/_offset, yearofbirth/_offset, spouse/parent params, sourcecountry
  // (england unless a Wales place → omitted; ireland for Irish censuses).
  // v0.2.118 — findmypast.COM (was .co.uk): Kevin's account lives there, not on the UK site, and
  // the search grammar is identical across Findmypast's regional sites (his civil-deaths URL was
  // a .com one). The newspapers entries use the same host. v0.2.133: the host is the settings'
  // "FindMyPast" dropdown ("Findmypast opens on" until v0.2.136) (findmypast.com by default; .co.uk, .ie, .com.au) — `fmpHost()`
  // is the one lever, read at build time so a change applies on the next menu open.
  const fmpHost = () => `https://www.${(FSSE.settings && FSSE.settings.get("host.findmypast")) || "findmypast.com"}`;
  const fmpResults = () => `${fmpHost()}/search/results`;
  FSSE.findmypastHost = fmpHost;
  const FMP_CENSUS = "sourcecategory=census%2c+land+%26+surveys&collection=census&sid=102";
  const FMP_BMD = "sourcecategory=life+events%28bmds%29&sid=101";
  // v0.2.118 — the CIVIL deaths set (the GRO-derived England & Wales death index, with the age at
  // death / date of birth), from Kevin's URL (2026-10-26, Thomas Gourley Park d. 1985 Stoke-on-Trent):
  //   sourcecategory=life+events+%28bmds%29&collection=civil+deaths+%26+burials&sid=102&firstname=thomas
  //   +gourley&firstname_variants=true&lastname=park&yearofdeath=1985&yearofdeath_offset=2&keywordsplace=
  //   stoke-on-trent%2c+staffordshire%2c+england&keywordsplace_proximity=5&sourcecountry=great+britain
  // (decision 4a of v0.2.107, closed). Note FMP's own form writes "life+events+%28bmds%29" and
  // sid=102 here, where the Sourcer-derived FMP_BMD says "life+events%28bmds%29" / sid=101 — both
  // land; each constant keeps the form it was verified with.
  const FMP_CIVIL_DEATHS = "sourcecategory=life+events+%28bmds%29&collection=civil+deaths+%26+burials&sid=102";
  const fmpName = (first, sn) => `firstname=${encodeURIComponent(first)}&firstname_variants=true&lastname=${encodeURIComponent(sn)}`;
  const fmpYear = (key, y, off) => (y != null ? `${key}=${y}&${key}_offset=${off}` : null);
  // A year window as FMP's eventyear ± offset: the centre + the smallest offset the form offers
  // (0/1/2/5/10/20/40) covering the half-span; a window wider than 80 years gets ±40 round its
  // centre (v0.2.107, the unknown-death burials search).
  const fmpSpan = (from, to) => {
    if (from == null || to == null) return null;
    const half = Math.ceil((to - from) / 2);
    const off = [0, 1, 2, 5, 10, 20, 40].find((o) => o >= half) ?? 40;
    return `eventyear=${Math.round((from + to) / 2)}&eventyear_offset=${off}`;
  };
  const fmpQ = (parts) => `${fmpResults()}?${parts.filter(Boolean).join("&")}`;
  // Census years FMP uniquely serves, per Kevin's unique-first scope, bracketed like the
  // Records menu: E&W decades 1841–1911 + 1921 + the 1939 Register; Ireland 1901/1911.
  function fmpCensusYears(p) {
    const tl = timeline(p);
    if (!tl) return [];
    const bracketKeys = (y) => {
      let latest = null;
      let earliest = null;
      for (const e of tl.events) {
        if (e.year <= y && (!latest || e.year >= latest.year)) latest = e;
        if (e.year >= y && (!earliest || e.year < earliest.year)) earliest = e;
      }
      const keys = new Set();
      for (const e of [latest, earliest]) if (e && e.region) keys.add(e.region.key);
      return keys;
    };
    const out = [];
    for (const y of [1841, 1851, 1861, 1871, 1881, 1891, 1901, 1911, 1921, 1939]) {
      if (y < tl.lower || y > tl.upper) continue;
      const keys = bracketKeys(y);
      // label = the shared census title (v0.2.123): "1841 E&W Census", "1939 E&W Register", "1901 Ireland Census".
      if (keys.has("enw")) out.push({ year: y, country: "england", label: censusTitle({ year: y, region: regionByKey("enw"), sub: null }) });
      if (keys.has("ireland") && (y === 1901 || y === 1911)) out.push({ year: y, country: "ireland", label: censusTitle({ year: y, region: regionByKey("ireland"), sub: null }) });
    }
    // v0.2.120 — US federal and Canadian censuses (Kevin: "ensure that the ancestry and FindMyPast
    // menus include us and canada census records"): the same bracketed years the FamilySearch and
    // Ancestry menus offer (`censusYears`), sent with Findmypast's country filter in its own
    // lower-case "+" form ("united+states", "canada" — the "great+britain" precedent of v0.2.118;
    // the US word is the one not yet click-verified). State / provincial censuses are not on
    // Findmypast and are skipped.
    // v0.2.122 (Kevin, 2026-10-26: "FindMyPast.com does not have an index to the 1950 us census.
    // They only have browsable images") — an unindexed set cannot be searched by name, so the
    // year is left out HERE only; Ancestry and MyHeritage index 1950 and keep it.
    const FMP_UNINDEXED = { us: [1950] };
    for (const c of censusYears(p)) {
      if (c.sub) continue;
      if ((FMP_UNINDEXED[c.region.key] || []).includes(c.year)) continue;
      if (c.region.key === "us") out.push({ year: c.year, country: "united+states", label: censusTitle(c) }); // "1900 US Federal Census"
      else if (c.region.key === "canada") out.push({ year: c.year, country: "canada", label: censusTitle(c) }); // "1901 Canada Census"
    }
    out.sort((a, b) => a.year - b.year || a.label.localeCompare(b.label));
    return out;
  }
  function fmpOptions(p) {
    const out = [];
    const first = String(p.given || "").trim().split(/\s+/)[0];
    const by = birthYearOf(p);
    const dy = deathYearOf(p);
    const add = (group, label, url, tooltip) => out.push({ group, label, url, tooltip });
    const login = "Your Findmypast login works here.";
    // v0.2.113 (Kevin: the MyHeritage treatment of v0.2.112 for this menu too): the native entry
    // reads "All Collections — <First Surname> (b–d)" ("All Results" v0.2.104–112); the other
    // labels never said "Findmypast", so they stand.
    const span = by != null || dy != null ? ` (${by != null ? by : "?"}–${dy != null ? dy : "?"})` : "";
    const allLabel = first && p.surname ? `All Collections — ${first} ${p.surname}${span}` : "All Collections";
    // "All Collections — <name> (b–d)" (v0.2.113; "All Results" v0.2.104–112) — v0.2.104 (Kevin:
    // the Ancestry treatment for Findmypast too): the native
    // Findmypast row is hidden by content.js (site `replaces`) and its search LEADS this
    // menu — the row's own link (the person's details as FamilySearch hands them to
    // Findmypast), opened byte-for-byte; when the row has no link, or the layout has no
    // Findmypast row, the all-records search under the maiden name stands in.
    const nativeUrl = nativeUrlOf(p, "fmp-records");
    const nativeRow = nativeRowOf(p, "fmp-records") || !!nativeUrl;
    const who = first && p.surname ? `${first} ${p.surname}` : "this person";
    if (nativeRow) {
      // v0.2.105 (Kevin: "let FamilySearch build the needed URL rather than assume"): the row is
      // on the page → the click is handed to it; a read link / our grammar is only the reserve.
      add("All records", allLabel,
        nativeUrl || (first && p.surname ? fmpQ([fmpName(first, p.surname), fmpYear("yearofbirth", by, 2), fmpYear("yearofdeath", dy, 2)]) : fmpResults()),
        `Findmypast's own search for ${who} across all its records — FamilySearch's own Findmypast entry (hidden behind this menu) runs it: your click is handed to it, so Findmypast receives exactly what FamilySearch sends. ${login}`);
      out[out.length - 1].nativeClick = true;
    }
    if (!first || !p.surname) return out;
    if (!nativeUrl && !nativeRow) {
      add("All records", allLabel, fmpQ([fmpName(first, p.surname), fmpYear("yearofbirth", by, 2), fmpYear("yearofdeath", dy, 2)]),
        `Findmypast all-records search: ${first} (+ name variants) + ${p.surname}${by != null ? `, born ${by} ±2` : ""}${dy != null ? `, died ${dy} ±2` : ""}. (The native Findmypast search link was not found on this page, so this search is built from the tree's vitals.) ${login}`);
    }
    const { wales } = touchedRegions(p);
    const enwCountry = wales ? null : "sourcecountry=england";

    // ALL RECORDS — maiden + each married surname.
    const names = [p.surname];
    for (const sn of p.marriedSurnames || []) {
      const dated = spousesOf(p).filter((s) => s.year != null && s.surname.toLowerCase() === sn.toLowerCase()).sort((a, b) => a.year - b.year);
      if (dy != null && dated.length && dated[0].year > dy) continue;
      names.push(sn);
    }
    // v0.2.114 — COUNTRY SCOPE (Kevin's verified URL on Mary Cullum, b. 1891 d. 1956 Australia:
    // …&yearofdeath_offset=2&keywordsplace=australia&keywordsplace_proximity=5&sid=999): the
    // country goes in Findmypast's "Where" box (keywordsplace, proximity 5) with sid=999 — one
    // entry per country the person's events touch (ancestryCountries' walk, birth first; the
    // country word lower-cased as FMP writes it: "england", "united states", "new zealand"), the
    // worldwide search (the v0.2.62 URL, untouched) only when no place classifies. The
    // MyHeritage treatment of v0.2.111, labelled as in v0.2.112 ("<Country> — <name> (b–d)",
    // "Worldwide — …"). Only Australia is click-verified; the other words follow the grammar.
    const countries = ancestryCountries(p).map((c) => c.country);
    const yrs = `${by != null ? `, born ${by} ±2` : ""}${dy != null ? `, died ${dy} ±2` : ""}`;
    for (const country of countries.length ? countries : [null]) {
      for (const sn of names) {
        if (country) {
          add("All records", `${country} — ${first} ${sn}${span}`,
            fmpQ([fmpName(first, sn), fmpYear("yearofbirth", by, 2), fmpYear("yearofdeath", dy, 2), `keywordsplace=${encodeURIComponent(country.toLowerCase())}&keywordsplace_proximity=5`, "sid=999"]),
            `Findmypast all-records search within ${country}: ${first} (+ name variants) + ${sn}${yrs}. ${country} goes in Findmypast's Where box (proximity 5), so the search stays within it instead of the whole world — offered because this person's places touch ${country}. ${login}`);
        } else {
          add("All records", `Worldwide — ${first} ${sn}${span}`,
            fmpQ([fmpName(first, sn), fmpYear("yearofbirth", by, 2), fmpYear("yearofdeath", dy, 2)]),
            `Findmypast all-records search, worldwide: ${first} (+ name variants) + ${sn}${yrs}. (No place on this page classifies to a country, so the search is not narrowed.) ${login}`);
        }
      }
    }

    // CENSUS — the unique sets: 1921 E&W (FMP holds the images), 1939 Register, E&W decades,
    // Irish 1901/1911; a woman under her surname AT that year.
    for (const c of fmpCensusYears(p)) {
      const sn = surnameAt(p, c.year);
      add("Census", `${c.label} — ${first} ${sn}`,
        fmpQ([FMP_CENSUS, fmpName(first, sn), `eventyear=${c.year}&eventyear_offset=0`, fmpYear("yearofbirth", by, 2), c.country === "england" ? enwCountry : `sourcecountry=${c.country}`]),
        `Findmypast ${c.label}: ${first} ${sn}${by != null ? `, born ${by} ±2` : ""}.` +
          (c.year === 1921 ? " Findmypast holds the 1921 census IMAGES (FamilySearch has only an index)." : "") + ` ${login}`);
    }

    // CIVIL DEATHS (E&W) — v0.2.118, Kevin's verified URL (see FMP_CIVIL_DEATHS): yearofdeath ±2 for a
    // known death, the inferred window (centre ± FMP's nearest offset, exactly as the parish burials
    // below) when the tree has none, the BIRTH YEAR ±2 as the discriminator either way (the whole
    // point for an unknown death — the index carries the age), the death place in the Where box
    // (keywordsplace, proximity 5) for a KNOWN death only (a window search must stay wide), and
    // sourcecountry=great+britain as FMP writes it (Wales included — no Wales special case here).
    if (!p.living && isEnw(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace)) {
      const dwc = dy == null ? deathWindow(p) : null;
      const spanc = dwc ? fmpSpan(dwc.from, dwc.to).replace(/eventyear/g, "yearofdeath") : null;
      const sentc = spanc ? spanc.replace("yearofdeath=", "year of death ").replace("&yearofdeath_offset=", " ±") : "";
      const dPlace = dy != null ? FSSE.placeForSearch(p.deathPlace) || FSSE.placeForSearch(p.burialPlace) : "";
      const whereBox = dPlace ? `keywordsplace=${encodeURIComponent(dPlace.toLowerCase())}&keywordsplace_proximity=5` : null;
      if (dy != null || dwc) {
        for (const sn of deathSurnames(p, dy)) {
          add("Civil records", `Civil deaths & burials — ${first} ${sn}${dy != null ? `, ${dy} ±2` : `, ${dwc.from}–${dwc.to} (${UNKNOWN_DEATH})`}`,
            fmpQ([FMP_CIVIL_DEATHS, fmpName(first, sn), dy != null ? fmpYear("yearofdeath", dy, 2) : spanc, fmpYear("yearofbirth", by, 2), whereBox, "sourcecountry=great+britain"]),
            `Findmypast civil deaths & burials — the England & Wales death index, with the age at death / date of birth: ${first} ${sn}${dy != null ? `, died ${dy} ±2` : `, ${unknownDeathText(dwc, dwc.from, dwc.to)} — sent as ${sentc}`}${by != null ? `, born ${by} ±2 (the discriminator)` : ""}.${dPlace ? ` ${dPlace} goes in the Where box (proximity 5) — clear it on Findmypast's form if the right person is missing.` : ""} ${login}`);
        }
      }
    }

    // PARISH RECORDS (E&W) — FMP's depth. Baptisms carry the parents; marriages the spouse.
    if (isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace) || isEnw(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace)) {
      const father = p.father || null;
      const mother = p.mother || null;
      if (isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
        const parentBits = [];
        if (father && father.given) parentBits.push(`fatherfirstname=${encodeURIComponent(String(father.given).split(/\s+/)[0])}&fatherfirstname_variants=true`);
        if (father && father.surname) parentBits.push(`fatherlastname=${encodeURIComponent(father.surname)}`);
        if (mother && mother.given) parentBits.push(`motherfirstname=${encodeURIComponent(String(mother.given).split(/\s+/)[0])}&motherfirstname_variants=true`);
        add("Parish records", `Parish baptisms — ${first} ${p.surname}${by != null ? `, ${by} ±2` : ""}`,
          fmpQ([FMP_BMD, "collection=parish+baptisms", fmpName(first, p.surname), fmpYear("eventyear", by, 2), ...parentBits, enwCountry]),
          `Findmypast parish baptisms: ${first} ${p.surname}${by != null ? `, ${by} ±2` : ""}.` +
            (father || mother ? ` Parents sent: ${[father && father.name, mother && mother.name].filter(Boolean).join(" & ")}.` : "") + ` ${login}`);
      }
      const adult = (p.spouses || []).length > 0 || (p.spouseSurnames || []).length > 0 || by == null || dy == null || dy - by >= 16;
      if (adult) {
        const all = spousesOf(p);
        const marriageEntry = (w, spouse) => {
          const half = w.to != null && w.from != null ? Math.ceil((w.to - w.from) / 2) : null;
          const off = half != null ? [0, 1, 2, 5, 10, 20, 40].find((o) => o >= half) : null;
          const mid = half != null ? Math.round((w.from + w.to) / 2) : null;
          const spouseBits = spouse
            ? [`spouselastname=${encodeURIComponent(spouse.surname)}`,
               spouse.name ? `spousefirstname=${encodeURIComponent(String(spouse.name).trim().split(/\s+/)[0])}&spousefirstname_variants=true` : null]
            : [];
          add("Parish records", `Parish marriages — ${first} ${p.surname}${spouse ? `, spouse ${spouse.surname}` : ""}${w.from != null ? ` (${w.from}–${w.to})` : ""}`,
            fmpQ([FMP_BMD, "collection=parish+marriages", fmpName(first, p.surname), off != null ? `eventyear=${mid}&eventyear_offset=${off}` : null, ...spouseBits, enwCountry]),
            `Findmypast parish marriages: ${first} ${p.surname}${spouse ? ` + spouse ${spouse.surname}` : ""}${w.from != null ? `, ${w.from}–${w.to}` : ""}${spouse && spouse.year == null ? " (inferred: age 18–30)" : ""}. ${login}`);
        };
        for (const s of all.filter((x) => x.year != null)) {
          if (!isEnw(s.marriagePlace, p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) continue;
          marriageEntry({ from: s.year - 2, to: s.year + 2 }, s);
        }
        const undated = all.length ? all.filter((x) => x.year == null) : (p.spouseSurnames || []).map((sn) => ({ name: "", surname: sn, year: null }));
        if ((undated.length || !all.length) && isEnw(p.birthPlace, p.christeningPlace, p.deathPlace, p.burialPlace)) {
          const raw = marriageWindow(p, null);
          if (raw) {
            if (undated.length) {
              const seen = new Set();
              for (const s of undated) {
                if (seen.has(s.surname)) continue;
                seen.add(s.surname);
                marriageEntry(raw, s);
              }
            } else {
              marriageEntry(raw, null);
            }
          }
        }
      }
      if (!p.living && isEnw(p.deathPlace, p.burialPlace, p.birthPlace, p.christeningPlace)) {
        const surnames = deathSurnames(p, dy);
        // v0.2.107 — DEATH YEAR UNKNOWN: the burials search spans the inferred window
        // (deathWindow) as eventyear = centre ± the smallest offset FMP offers that covers it.
        // The CIVIL "Deaths & burials" entry lives in the CIVIL RECORDS group above (v0.2.118).
        const dw = dy == null ? deathWindow(p) : null;
        const span = dw ? fmpSpan(dw.from, dw.to) : null;
        const sent = span ? span.replace("eventyear=", "year ").replace("&eventyear_offset=", " ±") : "";
        for (const sn of surnames) {
          add("Parish records", `Parish burials — ${first} ${sn}${dy != null ? `, ${dy} ±2` : dw ? `, ${dw.from}–${dw.to} (${UNKNOWN_DEATH})` : ""}`,
            fmpQ([FMP_BMD, "collection=parish+burials", fmpName(first, sn), dy != null ? fmpYear("eventyear", dy, 2) : span, enwCountry]),
            `Findmypast parish burials: ${first} ${sn}${dy != null ? `, ${dy} ±2` : dw ? `, ${unknownDeathText(dw, dw.from, dw.to)} — sent as ${sent}` : ""}. ${login}`);
        }
      }
    }
    return out;
  }
  FSSE.fmpOptions = fmpOptions; // exposed for tests

  // ---- v1.0.2: the Temple row for the "Families with Remaining Ordinances" Labs experiment.
  // The state and the URLs live in labs.js (FSSE.labs); without it (a suite that does not load
  // it) the row opens the page and never asks.
  const LABS_ROW_KEY = "familyRemainingOrdinances";
  const LABS_ROW_PAGE = "https://www.familysearch.org/en/temple/family-remaining-ordinances";
  const LABS_ROW_CONFIRM =
    "\"Families with Remaining Ordinances\" is a FamilySearch Labs experiment, and it is currently OFF for your account.\n\n" +
    "OK turns it on through FamilySearch's own Labs page (the same as pressing \"Try It\" there) and then opens it. Cancel leaves everything as it is.";
  function labsRowExp() {
    const x = FSSE.labs && typeof FSSE.labs.experiment === "function" ? FSSE.labs.experiment(LABS_ROW_KEY) : null;
    return {
      pageUrl: x ? x.pageUrl : LABS_ROW_PAGE,
      optInUrl: x ? x.optInUrl : LABS_ROW_PAGE,
      labsHome: FSSE.labs && FSSE.labs.LABS_HOME ? FSSE.labs.LABS_HOME : "https://www.familysearch.org/en/labs/",
    };
  }
  // true | false | null (not known yet, or labs.js absent)
  function labsRowState() {
    const x = FSSE.labs && typeof FSSE.labs.experiment === "function" ? FSSE.labs.experiment(LABS_ROW_KEY) : null;
    return x ? FSSE.labs.isOn(x.id) : null;
  }
  function labsRowTip(on) {
    const base = "Families on your Completed temple ordinances list whose members still need ordinances — a FamilySearch Labs experiment.";
    if (on === true) return base + " The experiment is on for your account. Shift+click opens FamilySearch Labs.";
    if (on === false) return base + " It is OFF for your account: the click offers to turn it on through FamilySearch's own Labs page, then opens it. Shift+click opens FamilySearch Labs.";
    return base + " It must be turned on at FamilySearch Labs; the click opens it, or offers to turn it on first. Shift+click opens FamilySearch Labs.";
  }

  FSSE.SITES = [
    {
      // Expandable menu of Ancestry searches (v0.2.45): the country-focused search (maiden +
      // married variants for married women) and Public Member Trees — which was a top-level
      // row v0.1–v0.2.44. The NATIVE Ancestry row is untouched; this menu sits right after it.
      id: "ancestry-records",
      label: "Ancestry", // plain since v0.2.104 (Kevin); "Ancestry Collections" v0.2.94–103, "Ancestry Records" before
      // v0.2.102 (Kevin: "combine the Ancestry menu in a similar fashion"): this row takes
      // the place of the native Ancestry row — content.js hides it while this row is present
      // and passes the link it carried as p.nativeUrls["ancestry-records"], which
      // ancestryOptions opens as the FIRST entry "All Results" (v0.2.103; last in v0.2.102). The native search is moved,
      // never lost. The hidden row stays the anchor (text lookup), so this row sits in its
      // slot on every layout — and still clones its native Ancestry logo (no `icon`).
      replaces: ["Ancestry"],
      anchorLabel: "Ancestry",
      position: "after",
      applies: () => true, // always shown, but waits for the person (keeps the row order stable)
      describe(p) {
        const opts = ancestryOptions(p);
        const countries = ancestryCountries(p).map((c) => c.country);
        return `Ancestry — click to list ${opts.length} pre-filled Ancestry searches for ${p.fullName || "this person"}` +
          (countries.length ? `, focused on ${countries.join(" + ")}` : "") +
          ((p.marriedSurnames || []).length ? ` (maiden + married name searches)` : "") + ".";
      },
      options: ancestryOptions,
    },
    {
      // Ancestry Institution (v1.0.4) — a FamilySearch CENTER row. On a center's network
      // FamilySearch lists a second Ancestry row, "Ancestry Institution": the edition a center's
      // patrons use without an Ancestry account of their own (Kevin's find at the Boise FSC,
      // 2026-11-04 — FS's link there is its Ancestry link verbatim on www.ancestryinstitution.com).
      // This menu takes that row's place exactly as "Ancestry ▸" takes the native Ancestry row's:
      // the same content-aware list, every URL on the institution host, the row's own link as the
      // first entry. The row's PRESENCE is the signal — `applies` holds only while FamilySearch
      // shows it (content.js writes p.nativeRows[site.id] before it asks), so the menu appears
      // nowhere else and nothing has to detect a center. Both Ancestry menus stand side by side
      // there: a patron with an account keeps ancestry.com, one without uses this one.
      id: "ancestry-institution",
      label: "Ancestry Institution",
      replaces: ["Ancestry Institution"],
      anchorLabel: "Ancestry Institution",
      position: "after",
      applies: (p) => nativeRowOf(p, "ancestry-institution"),
      describe(p) {
        const opts = ancestryInstitutionOptions(p);
        const countries = ancestryCountries(p).map((c) => c.country);
        return `Ancestry Institution — click to list ${opts.length} pre-filled searches on ancestryinstitution.com for ${p.fullName || "this person"}` +
          (countries.length ? `, focused on ${countries.join(" + ")}` : "") +
          ((p.marriedSurnames || []).length ? ` (maiden + married name searches)` : "") +
          ". The institution edition opens on a FamilySearch Center's network without an Ancestry account of your own.";
      },
      options: ancestryInstitutionOptions,
    },
    {
      // FreeBMD (v0.2.47): volunteer transcriptions of the E&W GRO civil-registration indexes,
      // Sep 1837 onward. Shown only for people with an E&W birth/marriage/death that the index
      // can cover. Entries open the FreeBMD search page with the parameters in the URL fragment;
      // src/freebmd-fill.js fills FreeBMD's own form and clicks Find (no GET search exists).
      id: "freebmd",
      label: "FreeBMD",
      icon: "icons/freebmd32.png", // our own badge — never FreeBMD's logo (trademark posture)
      anchorLabel: ["Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      tab: "fsse-freebmd", // v0.2.77 — every FreeBMD search reuses this one tab
      applies: (p) => freebmdOptions(p).length > 0,
      describe(p) {
        const opts = freebmdOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `FreeBMD — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} of the England & Wales GRO indexes (1837 on) for ${p.fullName || "this person"} (${parts.join(", ")}). FreeBMD has no search URLs, so the extension fills its search form for you and presses Find.`;
      },
      options: freebmdOptions,
    },
    {
      // GRO Index (v0.2.49): GRO's own digitised E&W birth/death indexes at gro.gov.uk — free
      // behind a login; births carry the mother's maiden name back to 1837, deaths the age at
      // death from 1866. Shown only for people with an E&W birth or death the index covers
      // (births 1837–1934 & 1984–2024, deaths 1837–1957 & 1984–2024 — no marriages online).
      // Entries open the search page with the parameters in the query string (the server
      // pre-fills the form) AND the #fsse fragment; src/gro-fill.js presses Search and, when
      // the login page intervenes, resumes the search after the sign-in.
      id: "gro",
      label: "GRO Index",
      icon: "icons/gro32.png", // our own badge (GOV.UK-palette "GRO" wordmark) — never GRO's crest
      anchorLabel: ["FreeBMD ▸", "FreeBMD ▾", "Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      tab: "fsse-gro", // v0.2.77 — every GRO search reuses this one tab
      applies: (p) => groOptions(p).length > 0,
      describe(p) {
        const opts = groOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `GRO Index — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} of GRO's own England & Wales online indexes for ${p.fullName || "this person"} (${parts.join(", ")}). Births show the mother's maiden name back to 1837, deaths the age at death from 1866. Free, but needs your GRO login — the extension opens GRO's form pre-filled and presses Search; after a login it resumes by itself.`;
      },
      options: groOptions,
    },
    {
      // ScotlandsPeople (v0.2.52): statutory registers 1855+, Old Parish Registers 1553–1854,
      // censuses 1841–1921 (incl. the 1911/1921 FamilySearch lacks). Free index searches with
      // a free SP login; images cost credits. Entries open the record type's search page with
      // the field values in the #fsse fragment; src/sp-fill.js fills SP's logged-in form by
      // element id and submits it, resuming after a login like the GRO filler. Shown only for
      // people with Scottish events.
      id: "scotlandspeople",
      label: "ScotlandsPeople",
      icon: "icons/sp32.png", // our own saltire badge — never SP's thistle logo (trademark posture)
      anchorLabel: ["GRO Index ▸", "GRO Index ▾", "FreeBMD ▸", "FreeBMD ▾", "Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      applies: (p) => spOptions(p).length > 0,
      describe(p) {
        const opts = spOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `ScotlandsPeople — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} of Scotland's statutory registers, Old Parish Registers and censuses (incl. 1911/1921) for ${p.fullName || "this person"} (${parts.join(", ")}). Free with your ScotlandsPeople login (images cost credits) — the extension fills SP's search form and submits it; after a login it resumes by itself.`;
      },
      options: spOptions,
    },
    {
      // Newspapers (v0.2.55): pure-URL searches of Newspapers.com + OldNews (worldwide),
      // GenealogyBank + Chronicling America (US), Findmypast's British & Irish newspapers
      // (UK & Ireland), Trove (AU), Papers Past (NZ) — grouped by region, gated on the
      // countries the person's events touch; a married woman gets maiden + married-name
      // entries per site. Last of the specialty rows.
      id: "newspapers",
      label: "Newspapers",
      icon: "icons/news32.png", // our own front-page glyph — no site's branding
      anchorLabel: ["ScotlandsPeople ▸", "ScotlandsPeople ▾", "GRO Index ▸", "GRO Index ▾", "FreeBMD ▸", "FreeBMD ▾", "Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      applies: (p) => newspaperOptions(p).length > 0,
      describe(p) {
        const opts = newspaperOptions(p);
        const groups = [...new Set(opts.map((o) => o.group))];
        return `Newspapers — click to list ${opts.length} pre-filled newspaper search${opts.length === 1 ? "" : "es"} for ${p.fullName || "this person"} (${groups.join(", ")}). Exact-phrase name searches with the life span as the date window; a married woman is searched under her maiden and married names.`;
      },
      options: newspaperOptions,
    },
    {
      // RootsIreland (v0.2.59): the IFHF county-centre transcripts. Anonymous GET quick
      // search (county + all-Ireland pairs per Irish life event); free result counts,
      // subscription for the records. Listed AFTER newspapers in this array but anchored on
      // the ScotlandsPeople row — later insertions land closest to the shared anchor, so it
      // renders between SP and Newspapers, keeping the record sites together. Shown only for
      // people with Irish events.
      id: "rootsireland",
      label: "RootsIreland",
      icon: "icons/ri32.png", // our own shamrock in the site's green — never their logo or the harp
      anchorLabel: ["ScotlandsPeople ▸", "ScotlandsPeople ▾", "GRO Index ▸", "GRO Index ▾", "FreeBMD ▸", "FreeBMD ▾", "Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      applies: (p) => riOptions(p).length > 0,
      describe(p) {
        const opts = riOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `RootsIreland — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} of the Irish county genealogy centres' transcripts for ${p.fullName || "this person"} (${parts.join(", ")}). Searching is free and shows how many records match per category; a subscription opens the records.`;
      },
      options: riOptions,
    },
    {
      // IrishGenealogy.ie (v0.2.60): Ireland's free official site — civil register indexes
      // WITH free images (1864+/1845+, rolling 100/75/50-year releases) + selected church
      // registers. Pure GET URLs (Sourcer's irishg grammar). Anchored on the RootsIreland
      // row and listed after it in this array → renders SP, RootsIreland, IrishGenealogy,
      // Newspapers. Shown only for people with Irish events.
      id: "irishgenealogy",
      label: "IrishGenealogy",
      icon: "icons/ig32.png", // our own tricolour/wordmark — never their logo or the harp
      anchorLabel: ["RootsIreland ▸", "RootsIreland ▾", "ScotlandsPeople ▸", "ScotlandsPeople ▾", "GRO Index ▸", "GRO Index ▾", "FreeBMD ▸", "FreeBMD ▾", "Findmypast", "FindMyPast", "MyHeritage", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      position: "after",
      applies: (p) => igOptions(p).length > 0,
      describe(p) {
        const opts = igOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `IrishGenealogy.ie — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} of Ireland's free official records site for ${p.fullName || "this person"} (${parts.join(", ")}). Civil register indexes with FREE images of the actual registers (births 1864+, marriages 1845+, deaths 1864+, on rolling privacy releases) plus selected church registers.`;
      },
      options: igOptions,
    },
    {
      // MyHeritage Records (v0.2.62): the native MyHeritage row is untouched; this menu adds
      // MyHeritage's own all-records search (maiden + married variants) and the Family Trees
      // search (collection-1, the Ancestry-PMT analog / Smart Matches well). No icon → the
      // cloned native MyHeritage logo. Injected late in this array so it lands right after
      // the native row.
      id: "mh-records",
      // v0.2.104 (Kevin: the Ancestry treatment for MyHeritage too): plain "MyHeritage ▸"
      // ("MyHeritage Collections" v0.2.94–103) IN PLACE OF the native MyHeritage row —
      // content.js hides it while this row is present and passes its link as
      // p.nativeUrls["mh-records"], which mhOptions opens as the FIRST entry "All Collections —
      // <name> (b–d)" ("All Results" v0.2.104–111; since v0.2.112 no entry says "MyHeritage").
      label: "MyHeritage",
      replaces: ["MyHeritage"],
      anchorLabel: "MyHeritage",
      position: "after",
      applies: () => true, // always shown, but waits for the person (stable row order)
      describe(p) {
        const opts = mhOptions(p);
        return `MyHeritage — click to list ${opts.length} pre-filled MyHeritage search${opts.length === 1 ? "" : "es"} for ${p.fullName || "this person"}: All Collections (MyHeritage's own search, as the native entry ran it), the all-records search${(() => { const c = mhCountries(p); return c.length ? ` within ${c.join(" / ")}` : ""; })()}${(() => { const n = opts.filter((o) => o.group === "Census").length; return n ? `, ${n} census${n === 1 ? "" : "es"}` : ""; })()}${(p.marriedSurnames || []).length ? " (maiden + married names)" : ""} and Family Trees (the Smart Matches well).`;
      },
      options: mhOptions,
    },
    {
      // MyHeritage Library Edition (v1.0.4) — the other FamilySearch CENTER row (see
      // "ancestry-institution" above): FamilySearch lists it beside MyHeritage on a center's
      // network, and its link is our master-form grammar on myheritagelibraryedition.com. This
      // menu takes that row's place: the row's own link first (FamilySearch builds it at click
      // time with a token, so the click is handed over), then the all-records search per country
      // and the census group on the Library Edition's host. No Family Trees entry — the Library
      // Edition holds records only. Shown only while FamilySearch shows the native row.
      id: "mh-library",
      label: "MyHeritage Library Edition",
      replaces: ["MyHeritage Library Edition"],
      anchorLabel: "MyHeritage Library Edition",
      position: "after",
      applies: (p) => nativeRowOf(p, "mh-library"),
      describe(p) {
        const opts = mhLibraryOptions(p);
        return `MyHeritage Library Edition — click to list ${opts.length} pre-filled search${opts.length === 1 ? "" : "es"} on myheritagelibraryedition.com for ${p.fullName || "this person"}: All Collections (the Library Edition's own search, as the native entry ran it), the all-records search${(() => { const c = mhCountries(p); return c.length ? ` within ${c.join(" / ")}` : ""; })()}${(() => { const n = opts.filter((o) => o.group === "Census").length; return n ? ` and ${n} census${n === 1 ? "" : "es"}` : ""; })()}${(p.marriedSurnames || []).length ? " (maiden + married names)" : ""}. The Library Edition opens on a FamilySearch Center's network without a MyHeritage account; it holds records only, no family trees.`;
      },
      options: mhLibraryOptions,
    },
    {
      // Findmypast Records (v0.2.62): the native Findmypast row is untouched; this menu adds
      // FMP's own searches, UNIQUE-FIRST (no GRO/newspaper/Scottish duplication): all
      // records, the census group (1921 E&W images, 1939 Register, E&W + Irish censuses) and
      // the parish-records group (baptisms w/ parents, marriages w/ spouse, burials). No
      // icon → the cloned native Findmypast logo. Injected late so it lands right after the
      // native row (before the FreeBMD row, which anchors on the same label but injects
      // earlier — later insertions sit closest to the anchor).
      id: "fmp-records",
      // v0.2.104 (Kevin: the Ancestry treatment for Findmypast too): plain "Findmypast ▸"
      // ("Findmypast Collections" v0.2.94–103) IN PLACE OF the native Findmypast row (the
      // narrow layout spells it "FindMyPast" — both listed) — content.js hides it while this
      // row is present and passes its link as p.nativeUrls["fmp-records"], which fmpOptions
      // opens as the FIRST entry "All Results".
      label: "Findmypast",
      replaces: ["Findmypast", "FindMyPast"],
      anchorLabel: ["Findmypast", "FindMyPast"],
      position: "after",
      applies: () => true, // always shown, but waits for the person (stable row order)
      describe(p) {
        const opts = fmpOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${g.toLowerCase()}` : g.toLowerCase()));
        return `Findmypast — click to list ${opts.length} pre-filled Findmypast search${opts.length === 1 ? "" : "es"} for ${p.fullName || "this person"}${parts.length ? ` (${parts.join(", ")})` : ""}${(() => { const c = ancestryCountries(p).map((x) => x.country); return c.length ? `; all records within ${c.join(" / ")}` : ""; })()}. All Collections = Findmypast's own search, as the native entry ran it. Findmypast's unique strengths: the 1921 E&W census images, the 1939 Register and deep parish registers.`;
      },
      options: fmpOptions,
    },
    {
      // Expandable menu of FamilySearch searches (censuses + birth / marriage / death indexes +
      // full-text + all-collections), built from the person's data each time it opens. The
      // standalone "FamilySearch Full-Text Search" row (with its Shift+click married-name
      // cycling) was folded into this menu's FULL TEXT group in v0.2.29 — every variant is now
      // an explicit entry.
      // v0.2.101 (Kevin: "instead of two FamilySearch search entry points"): this row is THE
      // FamilySearch entry — labelled plain "FamilySearch ▸" ("FamilySearch Collections"
      // v0.2.94–100, "FamilySearch Records" before) — and `replaces` the native entry:
      // content.js hides it while this row is present and passes the link it carried as
      // p.nativeUrls["fs-records"], which recordOptions opens as the EVERYTHING entry
      // "Indexed Historical Records". The native search is moved, never lost.
      id: "fs-records",
      label: "FamilySearch",
      replaces: ["FamilySearch", "FamilySearch Records"],
      // Anchored right AFTER the native entry it replaces, so once that entry is hidden this
      // row takes its slot: first in the classic card, first in the Labs dropdown's
      // FamilySearch group (ahead of FamilySearch Full Text / Trees) — native logo kept.
      // "FamilySearch Trees" stays as the Labs fallback (v0.2.92) should the Records entry
      // ever be renamed. FS's narrow-viewport layout (side-docked DevTools, small window,
      // zoom) renders a third-party-only panel with no native FamilySearch row at all, so
      // the chain ends on our Ancestry Collections menu row (whose label carries the ▸/▾
      // caret — both listed) / the native Ancestry row — bringing our own icon there, since
      // the cloned logo would be Ancestry's.
      anchorLabel: ["FamilySearch", "FamilySearch Records", "FamilySearch Trees", "Ancestry ▸", "Ancestry ▾", "Ancestry"],
      icon: (anchor) => (/^FamilySearch/.test(anchor) ? null : "icons/icon32.png"),
      position: "after",
      applies: () => true, // always shown, but waits for the person (keeps the row order stable)
      describe(p) {
        const opts = recordOptions(p);
        const counts = {};
        for (const o of opts) counts[o.group] = (counts[o.group] || 0) + 1;
        const shortName = (g) => g.replace(/ \([^)]*\)$/, "").toLowerCase(); // "Full text (AI-…)" → "full text"
        const parts = Object.entries(counts).map(([g, n]) => (n > 1 ? `${n} ${shortName(g)}` : shortName(g)));
        const attached = opts.filter((o) => o.attached).length;
        const variants = surnameVariants(p);
        return `FamilySearch — click to list the ${opts.length} pre-filled searches that fit ${p.fullName || "this person"} (${parts.join(", ")}).` +
          (attached ? ` ${attached} already attached.` : "") +
          (variants.length ? ` Surname also seen as ${variants.join(", ")} in the attached records.` : "");
      },
      options: recordOptions,
      footer: recordsFooter,
    },
    // ---- Temple dropdown links (v0.2.63, Kevin's ask — nothing to do with sources, but
    // important to church members). The top-nav "Temple" menu (My Reservations · Family
    // Groups · Shared with Temple · Completed · Ordinances Ready · Family Name Assist ·
    // Schedule Temple Appointment) gets three static campaign links after "Ordinances
    // Ready". `section: "temple"` routes them to FSSE.findTempleSection's panel; they clone
    // the Ordinances Ready row for native styling, chain-anchor for stable order, need no
    // person data (no `applies` — injected as soon as the menu is in the DOM), and are
    // skipped silently on non-member accounts.
    {
      id: "temple-opportunities",
      section: "temple",
      sameTab: true, // v0.2.65 — behave like the native Ordinances Ready link
      label: "Temple Opportunities",
      anchorLabel: "Ordinances Ready",
      position: "after",
      tooltip: "Search your family tree for ancestors with temple ordinances ready to reserve and take to the temple. Priority is given to close relatives first.",
      buildUrl: () => "https://www.familysearch.org/en/campaign/temple-opportunity",
    },
    {
      id: "family-ordinance-opportunities",
      section: "temple",
      sameTab: true,
      label: "Family Ordinance Opportunities",
      anchorLabel: ["Temple Opportunities", "Ordinances Ready"],
      position: "after",
      tooltip: "Display the Blue Fan Chart and quickly find available ordinances for descendants of your ancestors.",
      buildUrl: () => "https://www.familysearch.org/en/campaign/family-ordinance-opportunities",
    },
    {
      id: "remaining-ordinances",
      section: "temple",
      sameTab: true,
      label: "Remaining Temple Ordinances",
      anchorLabel: ["Family Ordinance Opportunities", "Temple Opportunities", "Ordinances Ready"],
      position: "after",
      tooltip: "Find additional temple ordinances for people you have already helped. These opportunities are from people in your Completed temple ordinances list.",
      buildUrl: () => "https://www.familysearch.org/en/campaign/remaining-ordinances",
    },
    // ---- v1.0.2: a FamilySearch Labs experiment as a fourth Temple row (Kevin, 2026-11-04).
    // "Families with Remaining Ordinances" (/en/temple/family-remaining-ordinances) works only
    // while the experiment is turned on at FamilySearch Labs; off, FamilySearch renders its own
    // "Page Not Found". labs.js knows the state from the page's OWN preference response (never a
    // request of ours). The row is ALWAYS shown: on, or not yet known → the click opens the
    // page; known OFF → a confirm dialog, then FamilySearch's own opt-in URL (the Labs page's
    // "Try It" link), whose code turns the experiment on with FamilySearch's own token and
    // redirects to the page. Shift+click opens the Labs page itself. The tooltip follows the
    // state (describe runs without a person for a temple row — content.js).
    {
      id: "family-remaining-ordinances",
      section: "temple",
      sameTab: true,
      label: "Families with Remaining Ordinances",
      anchorLabel: ["Remaining Temple Ordinances", "Family Ordinance Opportunities", "Temple Opportunities", "Ordinances Ready"],
      position: "after",
      tooltip: labsRowTip(null),
      describe: () => labsRowTip(labsRowState()),
      confirmText: (p, opts) => ((opts && opts.shift) || labsRowState() !== false ? null : LABS_ROW_CONFIRM),
      buildUrl: (p, opts) => {
        const x = labsRowExp();
        if (opts && opts.shift) return x.labsHome;
        return labsRowState() === false ? x.optInUrl : x.pageUrl;
      },
    },
  ];
})();
