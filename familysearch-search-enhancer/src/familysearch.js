// familysearch.js — FSID extraction + the person's vitals, family and facts SCRAPED from the
// rendered person page.
//
// Everything here reads the DOM of the page the user is viewing; nothing is fetched. (A Tree
// API fetch lived here v0.1–v0.2.138 as an unused fallback — the API answers 401 to a
// cookie-only content-script request — and was removed for the 1.0.0 store build: the
// extension makes no request of its own.)

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  // FamilySearch IDs look like "GLQN-3Q2": 4 chars, dash, 2-4 chars. Any person-page tab
  // (details / sources / memories / …) carries the PID as the segment after the tab name — the
  // Sources tab (/tree/person/sources/<PID>) is where attached-source awareness scrapes (v0.2.33).
  // The tab segment is optional: a person page first loads as /tree/person/<PID> and the SPA
  // rewrites it to /details/<PID> (v0.2.34 — the load-time log showed `fsid= null`).
  const FSID_RE = /\/person\/(?:[a-z-]+\/)?([A-Z0-9]{4}-[A-Z0-9]{2,4})(?:[/?#]|$)/i;

  FSSE.getFsid = function getFsid() {
    const m = location.pathname.match(FSID_RE);
    return m ? m[1].toUpperCase() : null;
  };

  // ---------------------------------------------------------------------------
  // DOM scraping (primary source). The Tree API returns 401 for a cookie-only
  // content-script request, so we read the vitals already rendered on the page.
  // ---------------------------------------------------------------------------

  const BOGUS_NAME = /familysearch|^\s*$/i;
  const YEAR_RE = /(1[5-9]\d\d|20[0-2]\d)/; // no \b: years sit flush against places ("1897Fishponds")

  // FamilySearch renders each Vitals row as one concatenated string:
  //   "Name • 5 SourcesDoris Annie Hiscocks"
  //   "Birth • 3 Sources1897Fishponds, Gloucestershire, England, United Kingdom"
  //   "Death • 0 SourcesDeceased"
  // Find the tightest element that starts with the label and holds a value after "Sources".
  function vitalValue(label) {
    const startRe = new RegExp("^" + label + "\\b");
    // Case-SENSITIVE on purpose (v0.2.109): FS writes "Source"/"Sources" and the value follows flush,
    // so with the "i" flag the optional plural "s" swallowed a value's capital S — "Name • 1
    // SourceSarah Jane Thackeray" scraped as "arah Jane" (Kevin, KJWW-DQV). The label is already
    // matched case-sensitively by startRe, so the flag bought nothing.
    const prefixRe = new RegExp("^" + label + "[\\s\\S]*?Sources?");
    let best = null;
    for (const el of FSSE.deepElements(document)) {
      const t = el.textContent.trim();
      if (!startRe.test(t) || !/Sources?/.test(t)) continue;
      const rest = t.replace(prefixRe, "").trim();
      if (!rest) continue; // skip the label/sources wrapper that has no value
      if (!best || t.length < best.length) best = t;
    }
    return best ? best.replace(prefixRe, "").trim() : "";
  }

  // Split a value like "1897Fishponds, Gloucestershire, England" into year + place.
  // After a year, ANY lettered text is the place — including single-word places ("1868Scotland",
  // seen on Margaret Gowans LWL5-M32: requiring a comma dropped her birthplace, which hid her
  // Scottish censuses and mis-routed her christening search to the US aggregate). Without a
  // year the comma stays required so bare "Deceased"/"Living" never become places.
  // v0.2.116 — FS prints the age at death after a burial (or death) date: "13 Feb 1965 (aged
  // 93–94)Karrakatta Cemetery…" (Kevin's Nathaniel Eli Trew 9JWT-KH9 — the burial place scraped as
  // "(aged 93–94)Karrakatta…" and went into the deaths & burials search that way). A place never
  // opens with a parenthesised age, so that group is dropped from the text after the year.
  const AGE_NOTE_RE = /^\(\s*(?:aged?|about|abt\.?|circa|c\.)\b[^)]*\)\s*/i;
  function yearPlace(value) {
    if (!value) return { year: null, place: "" };
    const m = value.match(YEAR_RE);
    const year = m ? m[1] : null;
    let place = "";
    if (year) {
      const after = value.slice(value.indexOf(m[1]) + 4).trim().replace(AGE_NOTE_RE, "").trim();
      if (/[A-Za-z]/.test(after)) place = after;
    } else if (value.includes(",") && /[A-Za-z]/.test(value)) {
      place = value;
    }
    return { year, place };
  }
  FSSE.yearPlace = yearPlace; // exposed for node smoke tests

  function nameFromTitle() {
    // "Doris Annie Hiscocks (1897–Deceased) • Person • Family Tree" -> "Doris Annie Hiscocks"
    return (document.title || "").split("(")[0].split("•")[0].trim();
  }

  // Generational suffixes are NOT surnames: "James Llewellyn Smith Jr." must yield "Smith",
  // not "Jr." (seen live on James Llewellyn Smith Jr. L71G-SBJ — the marriage search filtered
  // on spouse surname "Jr"). Roman numerals II–IV and VI–IX only: bare "V"/"X" are more likely
  // initials ("Mary V"), and stripping one would promote the wrong word to surname — keeping it
  // merely searches a harmless q.surname=V. Exact-match only, so real surnames never trip it.
  const NAME_SUFFIX_RE = /^(jr|sr|junior|senior|ii|iii|iv|vi|vii|viii|ix|esq)\.?$/i;

  // Name tokens with commas and trailing generational suffixes removed (never emptied).
  function nameTokens(fullName) {
    const bits = fullName.replaceAll(",", "").trim().split(/\s+/).filter(Boolean);
    while (bits.length > 1 && NAME_SUFFIX_RE.test(bits.at(-1))) bits.pop();
    return bits;
  }
  FSSE.nameTokens = nameTokens; // exposed for node smoke tests

  function lastToken(fullName) {
    const bits = nameTokens(fullName);
    return bits.length ? bits.at(-1) : "";
  }

  // Collect the spouse surname(s) from the "Spouses and Children" section: the distinct
  // surnames of the person links there that are NOT the person themself, NOT their own surname,
  // and NOT inside a "Children (N)" block (see NOT_SPOUSE_RE below). Each couple block lists the
  // person + spouse above its own children list, so what remains is exactly the spouses — a
  // wife under her maiden name, a husband under his — for any number of marriages. (Earlier
  // versions relied on children sharing the husband's surname and so mistook any differently
  // surnamed child for a spouse.)
  //
  // Each couple block also carries the marriage event when the tree has one — rendered like the
  // vitals as one concatenated string, e.g. "Marriage15 December 1831Easingwold, Yorkshire,
  // England, United Kingdom" (or "Marriage1831", "Marriageabout 1831", "No Marriage Events"
  // when absent). scrapeSpouses() pairs each spouse with the marriage line of ITS OWN block, so
  // sites.js can search a ±2 window around the real year instead of guessing age 18–30.
  // No \b after "Marriage": the date/place sits flush against it ("Marriage15 December…").
  const MARRIAGE_LINE_RE = /^Marriage(?!\s*Events)/i;

  // Parse the text of a marriage line into { date, year, place }. Exposed for node smoke tests.
  //   "Marriage15 December 1831Easingwold, Yorkshire, England" → { date: "15 December 1831",
  //   year: "1831", place: "Easingwold, Yorkshire, England" }
  FSSE.parseMarriageText = function parseMarriageText(text) {
    if (!text) return null;
    let t = String(text).trim();
    if (!MARRIAGE_LINE_RE.test(t)) return null;
    // No "i" flag (v0.2.109): "Marriage • 1 SourceSeptember 1933…" must keep its S — see vitalValue.
    t = t.replace(/^[Mm]arriage(?:\s*•\s*\d+\s*Sources?)?:?\s*/, "");
    // Stop at the children list, which may sit flush against the place ("…EnglandChildren (4)").
    t = t.split(/Children\s*\(\d+\)|\bChildren\b|\bParents\b|Add\s+Child|No\s+Children/)[0].trim();
    if (!t) return null;
    const m = t.match(YEAR_RE);
    if (!m) {
      // No year: keep a comma-separated place on its own, otherwise nothing useful.
      return t.includes(",") && /[A-Za-z]/.test(t) ? { date: "", year: null, place: t } : null;
    }
    const idx = t.indexOf(m[1]);
    const date = t.slice(0, idx + 4).trim();
    let place = t.slice(idx + 4).replace(/^[\s,•·–-]+/, "").trim();
    if (!/[A-Za-z]/.test(place)) place = "";
    return { date, year: m[1], place };
  };

  // The marriage line belonging to spouse link `a`: climb from the link towards `scope` until an
  // ancestor holds a "Marriage…" descendant. Climbing into an ancestor that also contains ANOTHER
  // spouse's link means this couple's block has no marriage line (else we'd pick up the other
  // couple's date), so stop there.
  function marriageFor(a, scope, spouseLinks) {
    for (let el = a.parentElement; el && el !== scope; el = el.parentElement) {
      if (spouseLinks.some((l) => l !== a && el.contains(l))) return null;
      // The marriage row renders as a bare "Marriage" <span> label with the date/place in
      // SIBLING elements (seen in the v0.2.5 DIAG on Charles), so the parseable text lives on
      // a WRAPPER whose textContent starts with "Marriage" ("Marriage15 December 1831Easingwold,
      // …"). Parse every candidate and keep the best result WITH a year, preferring the longest
      // text — that's the wrapper that also carries the place. (v0.2.5 took the smallest text,
      // hit the bare label, parsed nothing and gave up.)
      let best = null;
      let bestNoYear = null;
      for (const d of FSSE.deepElements(el)) {
        const t = d.textContent.trim();
        if (!MARRIAGE_LINE_RE.test(t)) continue;
        const parsed = FSSE.parseMarriageText(t);
        if (!parsed) continue;
        if (parsed.year) {
          if (!best || t.length > best.len) best = { parsed, len: t.length };
        } else if (!bestNoYear || t.length > bestNoYear.len) {
          bestNoYear = { parsed, len: t.length };
        }
      }
      if (best || bestNoYear) return (best || bestNoYear).parsed;
      // Only a bare, dateless "Marriage" label (or nothing) at this level — keep climbing.
    }
    return null;
  }

  // Full spouse scrape: { spouses: [{ name, surname, id, marriageDate, marriageYear,
  // marriagePlace }] (page order, one per couple block), surnames: distinct spouse surnames
  // (minus the person's own), skipped: names dropped as children/parents }.
  // The column under a family heading = the heading element whose scope (≤ 6 levels up) holds
  // person links. Heads are tried in order — the FULL heading text (`fullRe`, "Spouses and
  // Children") before shorter matches, then shortest first — and a head whose scope has no
  // person link is skipped. v0.2.92: the Labs person page renders four bare "Spouse" labels
  // with no links anywhere near them; the old shortest-text rule picked one of those over the
  // real heading, so Betsy Bellwood KHW2-6TP scraped no spouse at all (Kevin's log, 2026-09-21).
  const PERSON_LINK = 'a[href*="/tree/person/"]';
  function familyScope(headRe, fullRe) {
    const heads = [];
    for (const el of FSSE.deepElements(document)) {
      const t = el.textContent.trim();
      if (headRe.test(t)) heads.push({ el, t });
    }
    heads.sort((a, b) => Number(fullRe.test(b.t)) - Number(fullRe.test(a.t)) || a.t.length - b.t.length);
    for (const h of heads) {
      let scope = h.el.parentElement || h.el;
      for (let i = 0; i < 6; i++) {
        if (scope.querySelector && scope.querySelector(PERSON_LINK)) break;
        if (!scope.parentElement) break;
        scope = scope.parentElement;
      }
      if (scope.querySelector && scope.querySelector(PERSON_LINK)) return scope;
    }
    return null;
  }

  function scrapeSpouses(maidenSurname) {
    const empty = { spouses: [], surnames: [], skipped: [] };
    const scope = familyScope(/^Spouses?\b/, /^Spouses and Children\b/i);
    if (!scope) return empty;
    const selfId = FSSE.getFsid();
    const maiden = (maidenSurname || "").toLowerCase();
    const links = scope.querySelectorAll ? scope.querySelectorAll('a[href*="/tree/person/"]') : [];
    // A person link nested inside a "Children (N)" block is a CHILD, never a spouse — even when
    // the child carries a different surname (a daughter recorded under her married name, a
    // step-child, a spelling variant like "Belwood"). Charles Bellwood LH18-4BZ surfaced a
    // phantom spouse "Cuningham" this way. "Parents…" is excluded too in case the scope ever
    // widens to the whole Family Members card.
    const NOT_SPOUSE_RE = /^(Children|Parents)\b/;
    const insideNonSpouseBlock = (a) => {
      for (let el = a.parentElement; el && el !== scope; el = el.parentElement) {
        if (NOT_SPOUSE_RE.test(el.textContent.trim())) return true;
      }
      return false;
    };
    // Pass 1: which links are spouses (needed before pass 2 can tell couple blocks apart).
    const spouseLinks = [];
    const skipped = [];
    for (const a of links) {
      const id = (a.getAttribute("href") || "").split("/").pop();
      if (id === selfId) continue; // skip links back to the person themself
      const nm = a.textContent.trim();
      if (!nm || !/\s/.test(nm) || BOGUS_NAME.test(nm)) continue;
      if (insideNonSpouseBlock(a)) {
        skipped.push(nm);
        continue;
      }
      spouseLinks.push(a);
    }
    // Pass 2: one spouse record per link (+ its own marriage line) and the distinct surname list.
    const seen = new Set();
    const spouses = [];
    const surnames = [];
    for (const a of spouseLinks) {
      const nm = a.textContent.trim();
      const sn = lastToken(nm);
      if (!sn) continue;
      const mar = marriageFor(a, scope, spouseLinks) || {};
      spouses.push({
        name: nm,
        surname: sn,
        id: (a.getAttribute("href") || "").split("/").pop(),
        marriageDate: mar.date || "",
        marriageYear: mar.year || null,
        marriagePlace: mar.place || "",
      });
      const key = sn.toLowerCase();
      if (key === maiden || seen.has(key)) continue;
      seen.add(key);
      surnames.push(sn);
    }
    diagnoseMissingMarriages(spouses, spouseLinks, scope);
    const sig = JSON.stringify([spouses, skipped]);
    if (sig !== scrapeSpouses._lastSig) {
      scrapeSpouses._lastSig = sig;
      // Plain strings, not arrays/objects — the console collapses those to "Array(1)", which
      // makes a pasted log useless.
      FSSE.log(
        "spouse surnames:", surnames.join(", ") || "(none)",
        "| skipped (children/parents blocks):", skipped.join(", ") || "(none)"
      );
      FSSE.log(
        "spouses + marriages:",
        spouses
          .map((s) => `${s.name} — ${s.marriageDate || "no marriage date"}${s.marriagePlace ? ", " + s.marriagePlace : ""}`)
          .join(" ; ") || "(none)"
      );
    }
    return { spouses, surnames, skipped };
  }

  // Distinct spouse surnames only (kept for the diagnostics dump).
  function scrapeMarriedSurnames(maidenSurname) {
    return scrapeSpouses(maidenSurname).surnames;
  }

  // Parents (v0.2.41): the person links in the "Parents and Siblings" column that are NOT inside
  // a "Children (N)" block (those are the siblings) and not the person themself. FamilySearch
  // renders the primary parent couple first, father above mother (William Cummins / Sarah Jane
  // Irvine on Edward Cummings L81M-MJX; John Stephen Hind / Mary Wood on Stephen Hind GLWK-P4F),
  // so the first two links are taken as father and mother — a second couple (step- or alternate
  // parents) is kept in `parents` but not searched. Sites.js sends the parents' names to the
  // collections that index them (parish christenings, the Australian aggregates, NUMIDENT, the
  // all-collections search) — a father's name is the strongest discriminator for a common name.
  function scrapeParents() {
    const empty = { parents: [], father: null, mother: null };
    const scope = familyScope(/^Parents(\s+and\s+Siblings)?\b/, /^Parents and Siblings\b/i);
    if (!scope) return empty;
    const selfId = FSSE.getFsid();
    // Siblings sit in a "Children (N)" block; the scope may also have climbed into the whole
    // Family Members card, so anything under a "Spouses…" heading is excluded as well.
    const NOT_PARENT_RE = /^(Children|Siblings|Spouses)\b/;
    const excluded = (a) => {
      for (let el = a.parentElement; el && el !== scope; el = el.parentElement) {
        if (NOT_PARENT_RE.test(el.textContent.trim())) return true;
      }
      return false;
    };
    const parents = [];
    const seen = new Set();
    for (const a of scope.querySelectorAll ? scope.querySelectorAll('a[href*="/tree/person/"]') : []) {
      const id = (a.getAttribute("href") || "").split("/").pop();
      if (id === selfId || seen.has(id)) continue;
      const nm = a.textContent.trim();
      if (!nm || !/\s/.test(nm) || BOGUS_NAME.test(nm)) continue;
      if (excluded(a)) continue;
      seen.add(id);
      const bits = nameTokens(nm);
      parents.push({ name: nm, id, given: bits.length > 1 ? bits.slice(0, -1).join(" ") : bits[0] || "", surname: bits.length > 1 ? bits.at(-1) : "" });
    }
    const out = { parents, father: parents[0] || null, mother: parents[1] || null };
    const sig = JSON.stringify(parents);
    if (sig !== scrapeParents._lastSig) {
      scrapeParents._lastSig = sig;
      FSSE.log("parents:", parents.map((x) => `${x.name} (${x.id})`).join(" ; ") || "(none)");
    }
    return out;
  }

  // When a spouse comes back with no marriage data, show WHY: (1) the smallest elements in the
  // Spouses section whose text mentions "Marriage" (what the marriage line really looks like) and
  // (2) the ancestor-text chain above the first dateless spouse link (what marriageFor climbed
  // through). Logged once per distinct result; DEBUG-gated like all FSSE.log output.
  function diagnoseMissingMarriages(spouses, spouseLinks, scope) {
    if (!FSSE.DEBUG) return;
    const missIdx = spouses.findIndex((s) => !s.marriageYear && !s.marriagePlace);
    if (missIdx < 0) return;
    const clean = (t) => t.replace(/\s+/g, " ").trim();
    const cands = [];
    for (const d of FSSE.deepElements(scope)) {
      const t = d.textContent;
      if (!/Marriage/i.test(t)) continue;
      if (Array.from(d.children).some((c) => /Marriage/i.test(c.textContent))) continue; // smallest only
      cands.push(`<${d.tagName.toLowerCase()}> ${clean(t).slice(0, 160)}`);
      if (cands.length >= 6) break;
    }
    const chain = [];
    for (let el = spouseLinks[missIdx].parentElement; el && el !== scope && chain.length < 8; el = el.parentElement) {
      chain.push(`<${el.tagName.toLowerCase()}> ${clean(el.textContent).slice(0, 200)}`);
    }
    const sig = JSON.stringify([cands, chain]);
    if (sig === diagnoseMissingMarriages._lastSig) return;
    diagnoseMissingMarriages._lastSig = sig;
    FSSE.log(
      `DIAG no-marriage spouse "${spouses[missIdx].name}".\n` +
        `Marriage-text elements in the Spouses section (smallest):\n  ${cands.join("\n  ") || "(none — the marriage line is outside this section or not rendered)"}\n` +
        `Ancestor chain above the spouse link:\n  ${chain.join("\n  ") || "(none)"}`
    );
  }

  FSSE.scrapeParents = scrapeParents;

  // Dated + placed FACTS from the "Other Information" section (v0.2.43): residences and the
  // migration / military facts. Each row renders like a Vitals row — "Residence • 2 Sources1911
  // Birkenhead, Cheshire, England" (or without the Sources count) — but a person can have
  // SEVERAL of the same kind, so every tightest element starting with the label is taken, not
  // just the smallest. FS collapses the section by default and may not render its rows until it
  // is expanded — the scrape runs every tick, so expanding it on the page feeds the menu live.
  // sites.js adds every dated + classified fact to the timeline (census bracketing, migration
  // windows, the military "in the country" test).
  const FACT_LABELS = ["Residence", "Immigration", "Emigration", "Naturalization", "Military Service"];
  function scrapeFacts() {
    const out = [];
    const seen = new Set();
    for (const label of FACT_LABELS) {
      // No \b: an undated row renders the place flush against the label ("ResidenceFremantle,
      // Western Australia"); a lowercase continuation ("Residences", "Residential") is excluded.
      const startRe = new RegExp("^" + label + "(?![a-z])");
      // No "i" flag (v0.2.109): "Residence • 1 SourceSydney…" must keep its S — see vitalValue.
      const prefixRe = new RegExp("^" + label + "(?:\\s*•\\s*\\d+\\s*Sources?)?:?\\s*");
      // The value of a row element = its text after the label (+ optional Sources count).
      const restOf = (node) => {
        const t = node.textContent.trim();
        if (!startRe.test(t) || t.length > 240) return "";
        const rest = t.replace(prefixRe, "").trim();
        return /^\d+\s*Sources?$/i.test(rest) ? "" : rest;
      };
      for (const el of FSSE.deepElements(document)) {
        const rest = restOf(el);
        if (!rest) continue;
        // Tightest only: skip a wrapper when a CHILD already yields the same kind of value (the
        // label is usually a bare "<span>Residence" child — that child yields nothing, so the
        // wrapper that concatenates label + date + place is the one kept).
        if (Array.from(el.children || []).some((c) => restOf(c))) continue;
        const { year, place } = yearPlace(rest);
        if (!year && !place) continue;
        const key = `${label}|${year}|${place}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: label, year, place, text: rest });
      }
    }
    const sig = JSON.stringify(out);
    if (sig !== scrapeFacts._lastSig) {
      scrapeFacts._lastSig = sig;
      FSSE.log("facts:", out.map((f) => `${f.kind} ${f.year || "?"} ${f.place || ""}`.trim()).join(" ; ") || "(none — is Other Information expanded?)");
    }
    return out;
  }
  FSSE.scrapeFacts = scrapeFacts;

  // Scrape name + birth/christening/death/burial year & place from the rendered Vitals card
  // (Christening and Burial rows render only when the tree has them — same concatenated format).
  // Returns null until a real name is available, so callers keep retrying.
  FSSE.scrapeVitals = function scrapeVitals() {
    // Read straight from the Vitals card. Require it to have rendered before we return
    // anything, so we never cache a half-loaded page (title loads before Vitals/Family).
    const vitalsName = vitalValue("Name");
    const sex = vitalValue("Sex");
    const birth = yearPlace(vitalValue("Birth"));
    const deathRaw = vitalValue("Death"); // "1932Bristol, England", "Deceased", or "Living"
    const death = yearPlace(deathRaw);
    const living = /^living\b/i.test(deathRaw);
    const christening = yearPlace(vitalValue("Christening")); // sites.js uses these as birth/death
    const burial = yearPlace(vitalValue("Burial")); // proxies + better parish-search inputs
    if (!vitalsName && !sex && !birth.year && !death.year) return null; // Vitals not ready

    const name = vitalsName || nameFromTitle();
    if (BOGUS_NAME.test(name)) return null;

    let given = "";
    let surname = "";
    const bits = nameTokens(name); // drops a trailing "Jr."/"III" so it never becomes the surname
    if (bits.length > 1) {
      surname = bits.at(-1);
      given = bits.slice(0, -1).join(" ");
    } else {
      given = bits[0] || name;
    }

    // Spouse surnames (all sexes — the Records menu's marriage entries filter by spouse). For
    // women they are also her married surname(s): Shift+click on the full-text row, and the
    // census / death entries of the Records menu.
    // `spouses` keeps every couple block in page order with its scraped marriage date/place
    // (see scrapeSpouses) so the Records menu can search the real marriage year.
    const { spouses, surnames: spouseSurnames } = scrapeSpouses(surname);
    const marriedSurnames = /female/i.test(sex) ? spouseSurnames : [];
    const { parents, father, mother } = scrapeParents();
    const facts = scrapeFacts();

    const out = {
      id: FSSE.getFsid(), // tree PID ("LJRD-PJ2") — record searches pass it as treeref= (v0.2.27)
      given,
      surname,
      marriedSurnames,
      marriedSurname: marriedSurnames[0] || "", // primary; kept for convenience/logging
      spouseSurnames,
      spouses,
      parents, // [{ name, id, given, surname }] in page order (v0.2.41); father/mother = first two
      father,
      mother,
      facts, // [{ kind, year, place, text }] from Other Information (v0.2.43): residences, migration, military
      sex,
      living, // true when the Death vital reads "Living" (no death searches offered)
      fullName: name,
      birthYear: birth.year,
      birthPlace: birth.place,
      deathYear: death.year,
      deathPlace: death.place,
      christeningYear: christening.year,
      christeningPlace: christening.place,
      burialYear: burial.year,
      burialPlace: burial.place,
    };
    return out;
  };

  // One-time, page-wide diagnostic so we can see where the name / dates actually live.
  FSSE.dumpDiag = function dumpDiag() {
    if (FSSE._diagged) return;
    const leaves = new Set();
    for (const el of FSSE.deepElements(document)) {
      if (el.childElementCount === 0) {
        const t = el.textContent.trim();
        if (t) leaves.add(t);
      }
    }
    const all = [...leaves];
    const years = all.filter((t) => /\b(1[5-9]\d\d|20[0-2]\d)\b/.test(t) && t.length < 80);
    const personLinks = [...document.querySelectorAll('a[href*="/tree/person/"]')];
    // Wait until the Vitals AND Family sections have rendered (otherwise spouses are absent).
    if ((!vitalValue("Sex") && !vitalValue("Birth")) || personLinks.length < 2) return;
    FSSE._diagged = true;
    const exact = (w) => all.filter((t) => t === w).length;
    FSSE.log("DIAG title:", document.title);
    FSSE.log(
      "DIAG headings:",
      [...document.querySelectorAll("h1,h2,h3,h4")].map((h) => h.textContent.trim()).filter(Boolean).slice(0, 20)
    );
    FSSE.log("DIAG labels present:", {
      Vitals: exact("Vitals"),
      Name: exact("Name"),
      Birth: exact("Birth"),
      Death: exact("Death"),
      Born: exact("Born"),
      Died: exact("Died"),
      Sex: exact("Sex"),
    });
    FSSE.log("DIAG year-bearing leaves:", years.slice(0, 25));
    FSSE.log("DIAG sex:", vitalValue("Sex"), "| married surnames:", scrapeMarriedSurnames("").join(", "));
    FSSE.log(
      "DIAG spouse headers:",
      FSSE.deepElements(document)
        .map((el) => el.textContent.trim())
        .filter((t) => /^Spouses?\b/.test(t) && t.length < 70)
        .slice(0, 6)
    );
    FSSE.log(
      "DIAG person links:",
      JSON.stringify(
        personLinks.slice(0, 20).map((a) => ({
          text: a.textContent.trim(),
          aria: a.getAttribute("aria-label"),
          title: a.getAttribute("title"),
          href: (a.getAttribute("href") || "").split("/").pop(),
        }))
      )
    );
  };

  // Entry point used by content.js: scrape the page (auth-free). Returns null until a real
  // name has been scraped from the rendered Vitals card.
  FSSE.getPerson = function getPerson() {
    const p = FSSE.scrapeVitals();
    return p?.fullName ? p : null;
  };
})();
