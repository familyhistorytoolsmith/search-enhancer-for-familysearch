// fs-collections.js — FamilySearch record-search knowledge used by the "FamilySearch Records"
// menu in sites.js:
//   - FSSE.COLLECTIONS      per-region census years → FS collection ids, plus the civil-registration
//                           and church index specs (birth / christening / marriage / death / burial)
//   - FSSE.classifyPlace    place string → { region, sub } (or null when no known census country)
//   - FSSE.placeForSearch   cleans a place so FS's place resolver accepts it (drops a leading church)
//   - FSSE.recordSearchUrl  the /search/record/results URL grammar
//   - FSSE.indexTier        picks the index spec covering an event year
//
// Ported from the companion "Quality Score Analyzer" extension (src/content/config.js
// `censusCalendar` + src/content/census-eval.js), where the ids and the rules were verified live.
// Rules worth keeping in mind when editing:
//   - NEVER send a place to a civil-registration (GRO) index: it files by registration district,
//     which rarely matches the tree's town/county, and FS place matching RANKS rather than filters —
//     a wrong place buries the right record instead of excluding it. Censuses and parish
//     christenings ARE indexed by real locality, so those searches DO send the place.
//   - Every id is click-verified (the christening aggregates, once marked ⏳, on 2026-08-31 – 2026-09-02).
//
// Each index spec: { name (full FS collection title), short (menu label), collectionId, from, to,
// [spouseFrom] }.

(() => {
  const FSSE = (globalThis.FSSE = globalThis.FSSE || {});

  // Find A Grave — ONE worldwide FS collection (~1500→current). Reaches deaths civil registration
  // can't: pre-1837 and post-2015. The same spec is attached to every region as its `burial` index.
  const FIND_A_GRAVE = { name: "Find A Grave Index", short: "Find A Grave", collectionId: "2221801", from: 1500, to: 9999, titleRe: /find\s*a\s*grave/i };

  // Attached-source matching (v0.2.33): every spec may carry `titleRe`, tested against the titles
  // scraped from the person's Sources tab (sources.js). Written as lookaheads so a title matches
  // when it contains ALL the required words in any order — FS's own collection titles ("England
  // and Wales Marriage Registration Index, 1837-2005") AND user-typed Ancestry-style ones ("England
  // & Wales, FreeBMD Marriage Index, 1837-1915") both match. Civil (GRO) indexes are told apart
  // from parish aggregates by the words registration / civil / freebmd / gro. Where one collection
  // serves several event types (the Irish civil index) `tagRe` narrows by the source's tags when
  // the scrape provides them. Regions carry `censusTitleRe` (country words); a census source must
  // also contain a census word and the census YEAR (see FSSE.censusMatch).
  const CIVIL = "(?=.*\\b(registration|civil|freebmd|gro)\\b)";
  const NOT_CIVIL = "(?!.*\\b(registration|civil|freebmd|gro)\\b)";
  const all = (...parts) => new RegExp("^" + parts.join(""), "i");
  const has = (words) => `(?=.*\\b(${words})\\b)`;

  FSSE.COLLECTIONS = {
    searchBase: "https://www.familysearch.org/search/record/results",
    // The unfiltered "All Collections" search — same q.* grammar, no f.collectionId.
    allCollectionsBase: "https://www.familysearch.org/search/all-collections/results",
    findAGrave: FIND_A_GRAVE,
    // Ordered by distinctiveness of the country token (Scotland / Ireland before England & Wales).
    regions: [
      // Australia / New Zealand: NO FS census collections and no configured indexes — nothing is
      // ever offered for them — but they must exist as regions so a marriage or death there counts
      // as a timeline event for the census bracketing rule (sites.js `censusYears`). Edward
      // Cummings L81M-MJX (b. 1842 Donegal, m. 1871 Victoria, d. 1922 Perth) was otherwise still
      // offered the 1901/1911 Irish censuses. Listed FIRST so "New South Wales, Australia" is never
      // read as Wales (this replaces the old `unsupportedRe` bail-out).
      // `titleRe` (region words in a source title) lets the all-collections marriage fallback dim
      // when e.g. "Victoria, Australia, Marriage Index, 1837-1950" is attached (Edward Cummings).
      {
        key: "au", name: "Australia", censusLabel: "Australia Census", titleRe: /\baustralia\b/i, matchRe: /\baustralia\b/i, searchPlace: "Australia", census: {},
        // FS's Australia-wide aggregates (v0.2.40, Kevin's pick). All three are SELECTED-locality
        // indexes (births ~620k, marriages ~173k, deaths ~107k; Queensland absent from births), so
        // zero results are common — the results chip naming the collection is the health signal.
        // Ids: marriages page-verified via the FS collection URL; births/deaths from the OnGenealogy
        // FS listing (whose marriages id matched) — click-verification pending.
        vitalIndexes: {
          christening: { name: "Australia, Births and Baptisms, 1792-1981", short: "Australia births & baptisms 1792–1981", collectionId: "1770729", from: 1792, to: 1981, titleRe: all(has("australia"), has("births?|baptisms?|christenings?")) },
          churchMarriage: { name: "Australia, Marriages, 1810-1980", short: "Australia marriages 1810–1980", collectionId: "1770858", from: 1810, to: 1980, titleRe: all(has("australia"), has("marriages?")) },
          churchBurial: { name: "Australia, Deaths and Burials, 1816-1980", short: "Australia deaths & burials 1816–1980", collectionId: "1770857", from: 1816, to: 1980, titleRe: all(has("australia"), has("deaths?|burials?")) },
          burial: FIND_A_GRAVE,
        },
      },
      { key: "nz", name: "New Zealand", censusLabel: "New Zealand Census", titleRe: /\bnew\s+zealand\b/i, matchRe: /\bnew\s+zealand\b/i, searchPlace: "New Zealand", census: {}, vitalIndexes: { burial: FIND_A_GRAVE } },
      {
        key: "scotland", name: "Scotland", censusLabel: "Scotland Census", censusTitleRe: /\bscotland\b/i, matchRe: /\bscotland\b/i, searchPlace: "Scotland",
        // 1911+ images are ScotlandsPeople-only (no FS collection) → null → generic search.
        census: { 1841: "2016000", 1851: "2028673", 1861: "2028677", 1871: "2028678", 1881: "2046756", 1891: "2046943", 1901: "3212239", 1911: null },
        vitalIndexes: {
          // Click-verified by Kevin 2026-08-31 (Margaret Gowans LWL5-M32, b.1868 Scotland → 79
          // on-target results, collection chip named correctly). ~8M records.
          christening: { name: "Scotland Births and Baptisms, 1564-1950", short: "Scotland births & baptisms 1564–1950", collectionId: "1771030", from: 1564, to: 1950, titleRe: all(has("scotland"), has("births?|baptisms?|christenings?")) },
          // ~2M records: pre-1855 Church of Scotland marriages + civil registration 1855–1875 (95–98%
          // complete for those classes). Id page-verified 2026-08-31.
          churchMarriage: { name: "Scotland, Marriages, 1561-1910", short: "Scotland marriages 1561–1910", collectionId: "1771074", from: 1561, to: 1910, titleRe: all(has("scotland"), has("marriages?")) },
          // FS hosts NO Scottish burial aggregate (the "Scotland Deaths and Burials 1747-1955" is
          // Ancestry/Findmypast only — checked 2026-09-03); the funeral-home collection is the only
          // death index. Id from the FS collection URL; click-verification pending.
          death: { name: "Scotland, Death Records, 1998-2015", short: "Scotland Death Records 1998–2015", collectionId: "4441753", from: 1998, to: 2015, titleRe: all(has("scotland"), has("death records"), has("1998")) },
          burial: FIND_A_GRAVE,
        },
      },
      {
        key: "ireland", name: "Ireland", censusLabel: "Ireland Census", censusTitleRe: /\bireland\b/i, matchRe: /\bireland\b/i, searchPlace: "Ireland", // incl. Northern Ireland
        // Most 19th-c. Irish censuses were destroyed; only 1901 & 1911 survive complete.
        census: { 1901: "1626180", 1911: "2854327" },
        vitalIndexes: {
          // Id→title verified against the live collection page 2026-08-31 ("Ireland, Births and
          // Baptisms, 1620-1881", ~3.6M records); a filtered search hasn't been run on a real person yet.
          christening: { name: "Ireland Births and Baptisms, 1620-1881", short: "Ireland births & baptisms 1620–1881", collectionId: "1584963", from: 1620, to: 1881, titleRe: all(has("ireland"), has("births?|baptisms?|christenings?"), NOT_CIVIL) },
          // Civil registration indexes (GRO Dublin; ~19M records): births + deaths from 1864, marriages
          // from 1845; Northern Ireland only to 1922. District-filed → no place sent (same rule as the
          // E&W GRO). The index does not name spouses → spouseFrom 9999 = never filter by spouse.
          // Id page-verified 2026-08-31.
          // One collection for three event types: the title alone cannot say WHICH — `tagRe` uses the
          // source's tags (Birth / Marriage / Death) when the Sources-tab scrape captured them.
          birth: { name: "Ireland, Civil Registration Indexes, 1845-1958", short: "Ireland civil birth index 1864–1958", collectionId: "1408347", from: 1864, to: 1958, titleRe: all(has("ireland"), CIVIL), tagRe: /birth/i },
          marriage: { name: "Ireland, Civil Registration Indexes, 1845-1958", short: "Ireland civil marriage index 1845–1958", collectionId: "1408347", from: 1845, to: 1958, spouseFrom: 9999, titleRe: all(has("ireland"), CIVIL), tagRe: /marriage/i },
          death: { name: "Ireland, Civil Registration Indexes, 1845-1958", short: "Ireland civil death index 1864–1958", collectionId: "1408347", from: 1864, to: 1958, titleRe: all(has("ireland"), CIVIL), tagRe: /death|burial/i },
          // Partial church/civil marriage index (~382k; Donegal and Antrim best covered). Id page-verified 2026-08-31.
          churchMarriage: { name: "Ireland, Marriages, 1619-1898", short: "Ireland marriages 1619–1898", collectionId: "1584964", from: 1619, to: 1898, titleRe: all(has("ireland"), has("marriages?"), NOT_CIVIL) },
          burial: FIND_A_GRAVE,
        },
      },
      {
        key: "enw", name: "England & Wales", censusLabel: "E&W Census", censusTitleRe: /\b(england|wales)\b/i, matchRe: /\b(england|wales)\b/i, searchPlace: "England",
        // Per-year label overrides: 1939 is the National Register, not a census. "E&W" (v0.2.123,
        // Kevin's pick) — the house abbreviation of the civil groups ("E&W GRO Birth Index",
        // "E&W civil deaths"); every menu's census titles read this table (sites.js censusTitle).
        censusLabels: { 1939: "E&W Register" },
        // 1939 = the National Register (not a decennial census, but the same household lookup —
        // fills the 1921→1951 gap: 1931 was destroyed and no 1941 census was taken).
        census: { 1841: "1493745", 1851: "2563939", 1861: "1493747", 1871: "1538354", 1881: "2562194", 1891: "1865747", 1901: "1888129", 1911: "1921547", 1921: "5000564", 1939: "2836130" },
        vitalIndexes: {
          birth: { name: "England and Wales Birth Registration Index, 1837-2008", short: "E&W GRO Birth Index 1837–2008", collectionId: "2285338", from: 1837, to: 2008, titleRe: all(has("england|wales"), has("births?"), CIVIL) },
          // Parish-register aggregate — NOT civil registration, so the search sends the place. Also the
          // only birth-evidence search for pre-1837 people. Id click-verified by Kevin 2026-08-31
          // (Charles Bellwood LH18-4BZ — sensible results).
          christening: { name: "England Births and Christenings, 1538-1975", short: "England parish births & christenings 1538–1975", collectionId: "1473014", from: 1538, to: 1975, titleRe: all(has("england|wales"), has("christenings?|baptisms?"), NOT_CIVIL) },
          // spouseFrom: the GRO marriage index only NAMES the spouse from 1912 on. A spouse filter on an
          // earlier search silently returns zero, so it's applied only when the whole window is ≥ 1912.
          marriage: { name: "England and Wales Marriage Registration Index, 1837-2005", short: "E&W GRO Marriage Index 1837–2005", collectionId: "2285732", from: 1837, to: 2005, spouseFrom: 1912, titleRe: all(has("england|wales"), has("marriages?"), CIVIL) },
          // Parish-register marriage aggregate (banns included): the only marriage search for pre-1837
          // people and the actual register entry for later ones. Names the spouse; indexed by place, so the
          // search sends the marriage place. Id page-verified 2026-08-31 (10.3M records); Charles
          // Bellwood's 1831 Easingwold marriage surfaced from it via the all-collections search.
          churchMarriage: { name: "England, Marriage Records Index, 1538-1973", short: "England parish marriages 1538–1973", collectionId: "1473015", from: 1538, to: 1973, titleRe: all(has("england|wales"), has("marriages?|banns"), NOT_CIVIL) },
          // Two tiers: the GRO index runs out at 2007; the funeral-home collection covers 1998-2015.
          death: [
            { name: "England and Wales Death Registration Index, 1837-2007", short: "E&W GRO Death Index 1837–2007", collectionId: "2285341", from: 1837, to: 2007, titleRe: all(has("england|wales"), has("deaths?"), CIVIL) },
            { name: "England, Death Records, 1998-2015", short: "England Death Records 1998–2015", collectionId: "3665073", from: 1998, to: 2015, titleRe: all(has("england"), has("death records"), has("1998")) },
          ],
          // Parish-register burial aggregate (~15M): the pre-1837 death search, and the register entry
          // behind a GRO death. Indexed by place → the search sends the burial/death place. Id
          // page-verified 2026-08-31.
          churchBurial: { name: "England, Deaths and Burials, 1538-1991", short: "England parish deaths & burials 1538–1991", collectionId: "1473016", from: 1538, to: 1991, titleRe: all(has("england|wales"), has("burials?"), NOT_CIVIL) },
          // The National Probate Calendar (v0.2.40, Kevin's pick): ~8.2M entries, indexed by the
          // DEATH date (plus probate date, executors/beneficiaries). No place sent. Id page-verified
          // via the FS collection URL 2026-09-03; click-verification pending.
          probate: { name: "England and Wales, National Index of Wills and Administrations, 1858-1957", short: "E&W probate calendar (wills & administrations) 1858–1957", collectionId: "2451051", from: 1858, to: 1957, titleRe: all(has("england|wales"), has("wills?|probate|administrations?")) },
          burial: FIND_A_GRAVE,
        },
      },
      {
        key: "canada", name: "Canada", censusLabel: "Canada Census", censusTitleRe: /\bcanada\b/i, matchRe: /\bcanada\b/i, searchPlace: "Canada",
        // 1861 is split into province-specific collections → null → generic search.
        census: { 1851: "1325192", 1861: null, 1871: "1551612", 1881: "1804541", 1891: "1583536", 1901: "1584557", 1911: "2143998", 1921: "5000285", 1931: "5000196" },
        // Sub-regions (v0.2.42): a province's own `vitalIndexes` are consulted BEFORE the country's
        // (FSSE.indexTier). Provincial registrations are indexed by place → `place: true` sends it.
        // Ids from the OnGenealogy FS listings (whose ids matched FS URLs wherever both were seen);
        // Ontario Deaths 1307826 page-verified earlier. Click-verification pending.
        subRegions: [
          {
            key: "prairie", name: "Prairie Provinces", censusLabel: "Prairie Provinces Census", censusTitleRe: /\b(prairie|alberta|saskatchewan|manitoba)\b/i, matchRe: /\b(alberta|saskatchewan|manitoba)\b/i,
            years: { 1906: "1584925", 1916: "1529118", 1926: "3005862" }, // Census of the Prairie Provinces
          },
          {
            key: "ontario", name: "Ontario", censusTitleRe: /\bontario\b/i, matchRe: /\bontario\b/i, years: {},
            vitalIndexes: {
              birth: { name: "Ontario Births, 1869-1912", short: "Ontario births 1869–1912", collectionId: "1784212", from: 1869, to: 1912, place: true, titleRe: all(has("ontario"), has("births?")) },
              marriage: { name: "Ontario Marriages, 1869-1927", short: "Ontario marriages 1869–1927", collectionId: "1784216", from: 1869, to: 1927, place: true, titleRe: all(has("ontario"), has("marriages?")) },
              death: { name: "Ontario Deaths, 1869-1937 and Overseas Deaths, 1939-1947", short: "Ontario deaths 1869–1937", collectionId: "1307826", from: 1869, to: 1937, place: true, titleRe: all(has("ontario"), has("deaths?")) },
            },
          },
          {
            key: "bc", name: "British Columbia", censusTitleRe: /\bbritish\s+columbia\b/i, matchRe: /\bbritish\s+columbia\b/i, years: {},
            vitalIndexes: {
              birth: { name: "British Columbia Birth Registrations, 1854-1903", short: "British Columbia births 1854–1903", collectionId: "1307731", from: 1854, to: 1903, place: true, titleRe: all(has("british columbia"), has("births?")) },
              marriage: { name: "British Columbia Marriage Registrations, 1859-1932; 1937-1938", short: "British Columbia marriages 1859–1938", collectionId: "1307718", from: 1859, to: 1938, place: true, titleRe: all(has("british columbia"), has("marriages?")) },
              death: { name: "British Columbia Death Registrations, 1872-1986; 1992-1993", short: "British Columbia deaths 1872–1986", collectionId: "1538285", from: 1872, to: 1986, place: true, titleRe: all(has("british columbia"), has("deaths?")) },
            },
          },
        ],
        vitalIndexes: { burial: FIND_A_GRAVE },
      },
      {
        key: "us", name: "United States", censusLabel: "US Federal Census", censusTitleRe: /\bunited\s+states\b|\bu\.?s\.?a?\.?\b|\bfederal\b/i, matchRe: /\bunited\s+states\b|\bu\.?\s*s\.?\s*a\.?\b/i, searchPlace: "United States",
        // Pre-1850 censuses named only the head of household (poorly name-indexed) — omitted. 1890 was
        // destroyed in the 1921 Commerce fire (fragments only) — never offered as a search.
        census: { 1850: "1401638", 1860: "1473181", 1870: "1438024", 1880: "1417683", 1890: "1610551", 1900: "1325221", 1910: "1727033", 1920: "1488411", 1930: "1810731", 1940: "2000219", 1950: "4464515" },
        attachedOnlyYears: [1890],
        // Sub-regions (v0.2.42): state censuses (`years`) and state vital indexes, consulted before
        // the country's. State registrations are indexed by town → `place: true`. Ids from FS
        // collection URLs / OnGenealogy FS listings 2026-09-03; click-verification pending.
        subRegions: [
          {
            key: "ny", name: "New York", censusLabel: "New York State Census", censusTitleRe: /\bnew\s+york\b/i, matchRe: /\bnew\s+york\b/i,
            years: { 1855: "1937366", 1865: "1491284", 1875: "1918735", 1892: "1529100", 1905: "1463113", 1915: "1937454", 1925: "1937489" },
            vitalIndexes: {
              // New York CITY only (five boroughs; Manhattan from 1795, Brooklyn from 1847, the rest
              // from 1898) — offered state-wide since the sub-region is the state; FS ranks by place.
              death: { name: "New York, New York City Municipal Deaths, 1795-1949", short: "New York City municipal deaths 1795–1949", collectionId: "2240477", from: 1795, to: 1949, place: true, titleRe: all(has("new york"), has("deaths?")) },
            },
          },
          {
            key: "ma", name: "Massachusetts", censusLabel: "Massachusetts State Census", censusTitleRe: /\bmassachusetts\b/i, matchRe: /\bmassachusetts\b/i,
            years: { 1855: "1459985", 1865: "1410399" }, // the only two surviving state censuses
            vitalIndexes: {
              birth: { name: "Massachusetts Births, 1841-1915", short: "Massachusetts births 1841–1915", collectionId: "1536925", from: 1841, to: 1915, place: true, titleRe: all(has("massachusetts"), has("births?")) },
              marriage: { name: "Massachusetts Marriages, 1841-1915", short: "Massachusetts marriages 1841–1915", collectionId: "1469062", from: 1841, to: 1915, place: true, titleRe: all(has("massachusetts"), has("marriages?")) },
              death: { name: "Massachusetts Deaths, 1841-1915, 1921-1924", short: "Massachusetts deaths 1841–1924", collectionId: "1463156", from: 1841, to: 1924, place: true, titleRe: all(has("massachusetts"), has("deaths?")) },
            },
          },
          {
            key: "pa", name: "Pennsylvania", censusTitleRe: /\bpennsylvania\b/i, matchRe: /\bpennsylvania\b/i, years: {},
            vitalIndexes: {
              marriage: { name: "Pennsylvania, Marriages, 1709-1940", short: "Pennsylvania marriages 1709–1940", collectionId: "1681011", from: 1709, to: 1940, place: true, titleRe: all(has("pennsylvania"), has("marriages?")) },
            },
          },
        ],
        vitalIndexes: {
          // The wiki-sourced id 1675234 is DEAD (404; results chip showed "Other, 1675234 (0)" on
          // Alice Morgart L7X2-3JN, 2026-08-31). Correct id 1808995 verified against the live
          // collection page the same day. NOTE: only ~37k records (legacy, closed 2010) — genuine
          // zero-result searches will be common; the chip showing the collection TITLE is the health signal.
          christening: { name: "United States, Births and Christenings, 1867-1931", short: "US births & christenings 1867–1931", collectionId: "1808995", from: 1867, to: 1931, titleRe: all(has("united states"), has("births?|christenings?|baptisms?")) },
          // The closest thing to a national US death index (93M+; sparse before ~1962). No place sent.
          // Id page-verified 2026-08-31.
          death: { name: "United States, Social Security Death Index, 1935-2014", short: "US Social Security Death Index 1935–2014", collectionId: "1202535", from: 1935, to: 2014, titleRe: /social\s+security(?!.*numerical)|\bssdi\b/i },
          // NUMIDENT (Kevin's ask 2026-09-03): NARA's Social Security application/claim/death files,
          // ~63.7M merged records of DECEASED people — name, SSN, parents' names, sex, birth date +
          // birth city/state or country, death date. Richer than the SSDI (death dates only), so it is
          // its own key, not a `death` tier (indexTier returns the first applying tier and the SSDI
          // would always win). Birth AND death dates are indexed → the search sends both windows; no
          // place. Id web-verified against the collection URL 2026-09-03; click-verification pending.
          numident: { name: "United States, Social Security Numerical Identification Files (NUMIDENT), 1936-2007", short: "US NUMIDENT (Social Security files) 1936–2007", collectionId: "5000016", from: 1936, to: 2007, titleRe: /numident|numerical\s+identification/i },
          burial: FIND_A_GRAVE,
        },
      },
    ],

    // ---- MIGRATION (v0.2.40, Kevin's pick) ---------------------------------------------------
    // Offered when two consecutive dated events on the person's timeline are in different
    // countries (sites.js `migrationOptions`): the window is [earlier event, later event].
    // `side: "origin"` specs match the country LEFT, `side: "destination"` the country ENTERED
    // (`fromRegions` narrows the origin). Each search sends the name, the birth window (lists
    // carry ages) and the window as q.anyDate. Ids page-verified via the FS collection URLs
    // 2026-09-03; click-verification pending. No FS arrival collection exists for Australia/NZ.
    migration: [
      { key: "uk-out", side: "origin", regions: ["enw", "scotland", "ireland"], name: "United Kingdom, Outgoing Passenger Lists, 1890-1960", short: "UK outgoing passenger lists 1890–1960", collectionId: "4229516", from: 1890, to: 1960, titleRe: all(has("passenger"), has("united kingdom|uk|britain|british|outward|outgoing")) },
      { key: "ny-early", side: "destination", regions: ["us"], name: "New York, Passenger Lists, 1820-1891", short: "New York passenger lists 1820–1891", collectionId: "1849782", from: 1820, to: 1891, titleRe: all(has("new york|castle garden"), has("passenger|arriv\\w*|immigra\\w*")) },
      { key: "ny-ellis", side: "destination", regions: ["us"], name: "New York, Passenger Arrival Lists (Ellis Island), 1892-1925", short: "New York arrivals (Ellis Island) 1892–1925", collectionId: "1368704", from: 1892, to: 1925, titleRe: all(has("new york|ellis island"), has("passenger|arriv\\w*|immigra\\w*")) },
      { key: "us-border-ca", side: "destination", regions: ["us"], fromRegions: ["canada"], name: "United States, Border Crossings from Canada to United States, 1895-1956", short: "US border crossings from Canada 1895–1956", collectionId: "1803785", from: 1895, to: 1956, titleRe: /border\s+cross/i },
      { key: "ca-in", side: "destination", regions: ["canada"], name: "Canada, Passenger Lists, 1881-1922", short: "Canada passenger lists 1881–1922", collectionId: "1823240", from: 1881, to: 1922, titleRe: all(has("canada|canadian"), has("passenger|arriv\\w*|immigra\\w*")) },
    ],

    // ---- MILITARY (v0.2.40, Kevin's pick) ----------------------------------------------------
    // Men only (unknown sex passes), born inside [bornFrom, bornTo], alive at `year`, and in one of
    // `regions` at that year per the timeline bracketing (sites.js `militaryOptions`). Searches
    // send the name + birth window (the cards/records carry the date of birth); no place.
    // The nationwide WWII young-men cards (1940-47) exist on FS only as per-STATE collections
    // (needs sub-region support) — the 1942 "old man's" fourth registration IS one collection.
    // FS hosts no Canadian CEF index (Ancestry / Library and Archives Canada only).
    military: [
      { key: "us-ww1", regions: ["us"], name: "United States World War I Draft Registration Cards, 1917-1918", short: "US WWI draft registration cards 1917–1918", collectionId: "1968530", year: 1917, bornFrom: 1872, bornTo: 1900, titleRe: all(has("draft"), has("world war i|wwi|1917")) },
      { key: "us-ww2-1942", regions: ["us"], name: "United States, World War II Draft Registration Cards, 1942", short: "US WWII draft registration cards 1942 (men born 1877–1897)", collectionId: "1861144", year: 1942, bornFrom: 1877, bornTo: 1897, titleRe: all(has("draft"), has("world war ii|wwii|1942")) },
      { key: "uk-ww1", regions: ["enw", "scotland", "ireland"], name: "United Kingdom, World War I Service Records, 1914-1920", short: "UK WWI service records 1914–1920", collectionId: "2125045", year: 1914, bornFrom: 1866, bornTo: 1901, titleRe: all(has("service|army|soldiers?|military|pension"), has("world war i|wwi|1914")) },
      // Per-STATE young-men WWII cards (v0.2.42): `sub` = a bracketing event must be in that state.
      { key: "pa-ww2", regions: ["us"], sub: "pa", name: "Pennsylvania, World War II Draft Registration Cards, 1940-1947", short: "Pennsylvania WWII draft registration cards 1940–1947", collectionId: "2603579", year: 1940, bornFrom: 1896, bornTo: 1927, titleRe: all(has("draft"), has("world war ii|wwii|1940")) },
      { key: "nyc-ww2", regions: ["us"], sub: "ny", name: "New York, New York City, World War II Draft Registration Cards, 1940-1947", short: "New York City WWII draft registration cards 1940–1947", collectionId: "3288447", year: 1940, bornFrom: 1896, bornTo: 1927, titleRe: all(has("draft"), has("world war ii|wwii|1940")) },
    ],
  };

  // Classify a place string to a census region (+ state/province sub-region). Returns
  // { region, sub } or null when the place names no known country (Australia/NZ ARE regions —
  // census-less ones — so they count as timeline events).
  FSSE.classifyPlace = function classifyPlace(place) {
    const C = FSSE.COLLECTIONS;
    if (!place) return null;
    for (const region of C.regions) {
      if (!region.matchRe.test(place)) continue;
      const sub = (region.subRegions || []).find((s) => s.matchRe.test(place)) || null;
      return { region, sub };
    }
    return null;
  };

  // Turn a raw event place into one FS's place search can resolve: normalize comma spacing and
  // drop a leading church ("Holy Trinity Church, Kingswood, …" → "Kingswood, …") — the place search
  // doesn't index churches and would otherwise fall back to matching the whole country. A bare
  // dedication ("St X") is only dropped from a 4+-level string so genuine "St X" towns survive.
  FSSE.placeForSearch = function placeForSearch(place) {
    if (!place) return "";
    let parts = String(place).split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return "";
    const churchWordRe = /\b(church|chapel|cathedral|minster|abbey|priory|oratory)\b/i;
    const dedicationRe = /^(all\s+saints|holy\s+\S+|christ\s+church|st\.?\s+\S+|saint\s+\S+)$/i;
    if (churchWordRe.test(parts[0]) && parts.length >= 3) parts = parts.slice(1);
    else if (dedicationRe.test(parts[0]) && parts.length >= 4) parts = parts.slice(1);
    return parts.join(", ");
  };

  // Build a record-search URL (default base: /search/record/results). Empty/null params are
  // skipped; the collection filter is added last. Encoding mirrors the companion's verified
  // format (encodeURIComponent, not "+").
  // `pid` (the tree person's ID, e.g. "LJRD-PJ2") is sent as `treeref=` — FamilySearch then shows
  // a "Person From FamilySearch Tree" banner (name, lifespan, PID) above the results and names the
  // person in the tab title. Kevin verified 2026-09-01 that it works on /search/record/results but
  // has NO effect on the all-collections and full-text result pages, so it is only added on the
  // default base.
  FSSE.recordSearchUrl = function recordSearchUrl(params, collectionId, base, pid) {
    const p = [];
    const add = (k, v) => {
      if (v != null && v !== "") p.push(`${k}=${encodeURIComponent(v)}`);
    };
    const root = base || FSSE.COLLECTIONS.searchBase;
    if (pid && root === FSSE.COLLECTIONS.searchBase) add("treeref", pid);
    for (const k of Object.keys(params || {})) add(k, params[k]);
    if (collectionId) add("f.collectionId", collectionId);
    return `${root}?${p.join("&")}`;
  };

  // Does index spec `s` apply? With a known event year the year must fall inside the spec's
  // coverage. Without one, the coverage must overlap what IS known of the life ([minYear, maxYear]):
  // a person dead by 1820 never gets the 1837+ GRO index; one born 2010 never gets an index that
  // ended in 2007. Missing bounds don't exclude (a read-only search costs one tab).
  FSSE.specApplies = function specApplies(s, year, minYear, maxYear) {
    if (!s) return false;
    if (year != null) return year >= s.from && year <= s.to;
    if (minYear != null && s.to < minYear) return false;
    if (maxYear != null && s.from > maxYear) return false;
    return true;
  };

  // ---------------------------------------------------------------------------------------------
  // Attached-source matching (v0.2.33). `sources` = the titles scraped from the Sources tab
  // ([{title, via, tags?}] or plain strings); a match descriptor is { re, [also], [year], [tagRe] }.
  // Returns the first matching source title, or null. Year = the title must contain it (census
  // year); tagRe applies only when the source carries tags (else title-only, dim not hide).
  // ---------------------------------------------------------------------------------------------
  const CENSUS_WORD_RE = /\b(census|register|enumeration)\b/i;

  FSSE.specMatch = function specMatch(spec) {
    return spec && spec.titleRe ? { re: spec.titleRe, tagRe: spec.tagRe || null } : null;
  };

  // The words that identify a region (or sub-region) in a source title.
  const regionWordsRe = (src) =>
    src.censusTitleRe || src.titleRe || new RegExp("\\b" + src.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");

  // Census entry {year, region, sub} → descriptor: country/state words + a census word + the year.
  FSSE.censusMatch = function censusMatch(c) {
    const src = (c.sub && c.sub.censusTitleRe && c.sub) || c.region;
    return { re: regionWordsRe(src), also: CENSUS_WORD_RE, year: c.year };
  };

  // Region + event words → descriptor for an ALL-COLLECTIONS fallback entry (no spec of its own):
  // any attached source naming the region and the event counts, e.g. the Australian marriage
  // indexes for a marriage in Victoria. Null without a region.
  FSSE.regionMatch = function regionMatch(region, eventWords) {
    if (!region) return null;
    return { re: regionWordsRe(region), also: new RegExp("\\b(" + eventWords + ")\\b", "i") };
  };

  // A source matches when its collection title (the quoted part of an FS-shaped title, else the
  // whole title) satisfies the descriptor. `mentioned` sources ("<Person> in entry for <Other>" —
  // the person appears in someone ELSE's record) are skipped unless `wantMentioned`: they must not
  // dim the person's own search, but the menu can still note them in the tooltip.
  function sourceMatches(s, m) {
    const src = typeof s === "string" ? { title: s } : s || {};
    const text = src.collection || src.title;
    if (!text) return false;
    if (m.re && !m.re.test(text)) return false;
    if (m.also && !m.also.test(text)) return false;
    if (m.year != null && !text.includes(String(m.year))) return false;
    const tags = Array.isArray(src.tags) ? src.tags : null;
    if (m.tagRe && tags && tags.length && !tags.some((t) => m.tagRe.test(t))) return false;
    return true;
  }

  FSSE.findAttached = function findAttached(sources, m, wantMentioned) {
    if (!Array.isArray(sources) || !m) return null;
    for (const s of sources) {
      const mentioned = !!(s && typeof s === "object" && s.mentioned);
      if (mentioned !== !!wantMentioned) continue;
      if (sourceMatches(s, m)) return typeof s === "string" ? s : s.title;
    }
    return null;
  };

  // First tier of `vitalIndexes[key]` (a spec or an array of specs) that applies. `where` is a
  // region OR a classification { region, sub } from classifyPlace — with a sub-region, ITS
  // indexes are consulted first (a Massachusetts death in 1900 → Massachusetts Deaths; one in
  // 1950 → the SSDI), then the country's (v0.2.42).
  // Every tier of `vitalIndexes[key]` for `where` (the sub-region's first, then the region's) —
  // the list `indexTier` picks from. The unknown-death window (sites.js, v0.2.107) offers EVERY
  // tier the window reaches, so it needs the whole list.
  FSSE.indexTiers = function indexTiers(where, key) {
    if (!where) return [];
    const region = where.region ? where.region : where;
    const sub = where.region ? where.sub : null;
    const tiers = [];
    for (const src of [sub, region]) {
      const v = src && src.vitalIndexes && src.vitalIndexes[key];
      if (v) tiers.push(...(Array.isArray(v) ? v : [v]));
    }
    return tiers;
  };
  FSSE.indexTier = function indexTier(where, key, year, minYear, maxYear) {
    return FSSE.indexTiers(where, key).find((s) => FSSE.specApplies(s, year, minYear, maxYear)) || null;
  };
})();
