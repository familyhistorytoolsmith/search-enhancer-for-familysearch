# Search Enhancer for FamilySearch

A small Chrome extension (Manifest V3) that adds extra **pre-filled** search options to the
native **"Search Records"** list on a FamilySearch person page
(`https://www.familysearch.org/en/tree/person/details/<FSID>`).

> **Unofficial** — this extension is not affiliated with, endorsed by, sponsored by or supported by
> FamilySearch International. It runs entirely in your own browser: it reads the person page
> you are already viewing and builds links to the search pages of FamilySearch and the other
> sites. It makes no request of its own and sends nothing anywhere **except on your click**: the
> search you open (the person's name and years ride in that site's search URL), the place name
> sent to OpenStreetMap's geocoder when you click a 📍 map link, and Google's embedded map on the
> page a 📍 compare link opens. Nothing is collected, no account is involved, nothing is sold.
>
> FamilySearch is a trademark of FamilySearch/Intellectual Reserve, Inc., and may be registered in
> the United States of America and other countries.

**Links:** [help page](https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/) · [feature guide (PDF)](https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/feature-guide.pdf) · [privacy policy](https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/privacy-policy.html) · [latest release](https://github.com/familyhistorytoolsmith/search-enhancer-for-familysearch/releases/latest) · [source](https://github.com/familyhistorytoolsmith/search-enhancer-for-familysearch) — open source under the [MIT License](../LICENSE).

Every addition can be switched off on the extension's settings page, and the Ancestry / Findmypast links can be pointed at your regional site (see [Settings](#settings)). Out of the box it adds ten rows to the **Search Records** panel (four of them take the place of the native *Ancestry*, *FamilySearch*, *MyHeritage* and *Findmypast* rows, whose own searches live on as the first entry of each menu; on a FamilySearch Center's network two more rows become menus — see [At a FamilySearch Center](#at-a-familysearch-center)) and — for signed-in church members, on **every** FamilySearch page — four links to the top-level **Temple** menu after *Ordinances Ready*: **Temple Opportunities**, **Family Ordinance Opportunities**, **Remaining Temple Ordinances** and **Families with Remaining Ordinances** (each opens the matching familysearch.org page in the same tab, like the native menu items; the fourth is a FamilySearch Labs experiment — see [The Temple menu and the Labs experiment](#the-temple-menu-and-the-labs-experiment); accounts without the Temple menu are unaffected). On the **Source Linker** it adds a small **📍 compare** link after each place so you can see how far apart the record's place and the tree's place really are (see [Source Linker: compare two places on a map](#source-linker-compare-two-places-on-a-map)). And on a person page, hovering the **Data Quality Score** badge (Low / Medium / High) shows the **number behind the word**, the thresholds, and what would raise it (see [Quality Score: the number behind the badge](#quality-score-the-number-behind-the-badge)).

| New row | Placed after | Opens |
| --- | --- | --- |
| **FreeBMD ▸** | the native *Findmypast* row — shown only for people with an England & Wales birth, marriage or death that civil registration (from Sep 1837) can cover | An expandable **menu** of [FreeBMD](https://www.freebmd.org.uk/) searches of the E&W GRO indexes: **Births** (window ±2, clamped to Sep 1837; the mother's maiden name goes in for births after Sep 1911, when the index records it), **Marriages** (one per spouse — real year ±2 when dated, else the inferred age-18–30 window; the spouse surname always goes in, since FreeBMD pairs spouses by volume/page for every year; when the tree records no spouse at all, one unfiltered search of the inferred window is still offered — a hit may be the marriage the tree is missing), **Deaths** (one per married surname, with FreeBMD's **Death age/DoB** box filled with the birth year ±1 whenever the window reaches 1866 — FreeBMD checks it against each entry's recorded age or date of birth, so only the deaths of someone born about then come back; when the tree has **no death year** at all, one search of the inferred window — from the last year the page shows the person alive, such as a dated residence, a marriage or an attached census / 1939 Register, to age 100, clamped to FreeBMD's Sep 1837 – Dec 1999 — which that same birth-year filter keeps manageable). FreeBMD has **no search URLs** — its form is a POST bound to the page — so each entry opens the FreeBMD search page with the parameters in the URL *fragment* (never sent to their server); a small content script on freebmd.org.uk then fills FreeBMD's own form and presses **Find** for you. Shift+click an entry to search the first given name only. |
| **GRO Index ▸** | the *FreeBMD ▸* row — shown only for people with an England & Wales birth or death the online index covers (births 1837–1934 & 1984–2024, deaths 1837–1957 & 1984–2024; the gap years were never digitised, and marriages aren't online at all — use FreeBMD for those) | An expandable **menu** of searches of [GRO's own online indexes](https://www.gro.gov.uk/gro/content/certificates/) — richer than FreeBMD where they cover: **Births** (year ±2; the **mother's maiden name** goes in whenever the tree knows the mother — GRO records it back to **1837**, not just from 1911), **Deaths** (one per married surname, year ±2, with the **age at death** ±2 when the birth year is known — recorded in the index from 1866; when the tree has **no death year**, a **ladder of 5-year blocks** from the last year the person is known alive up to age 100 — at most 8 blocks, each Year ±2 with the matching age ±2, the never-digitised 1958–1983 years left to FreeBMD). Searching is free but needs a (free) GRO account: each entry opens GRO's search form **pre-filled** and presses Search for you; if the login page appears instead, sign in and the search finishes itself. Shift+click an entry to search the first forename only. |
| **ScotlandsPeople ▸** | the *GRO Index ▸* row — shown only for people with Scottish events | An expandable **menu** of [ScotlandsPeople](https://www.scotlandspeople.gov.uk/) searches: **statutory registers** (births / marriages / deaths, 1855+ — births and deaths send the **mother's maiden surname** when the tree knows her, deaths the age ±10, marriages the spouse; a death with **no year** in the tree is searched over the inferred window — last seen → age 100 — with the matching age range), **Old Parish Registers** (1553–1854; a ±2 window straddling 1855 gets both tiers), and the **censuses 1841–1921** — including **1911 and 1921, which FamilySearch doesn't have** — one entry per Scotland-bracketed year (*1881 Scotland Census — \<name\>*, the wording every menu uses for a census), a woman under her surname of that year. Searching the indexes is free with a (free) SP login; viewing images costs credits. SP has no search URLs, so each entry opens the right SP search page and a content script fills the form and submits it; if you're signed out, log in and the search finishes itself. Name-matching options are left at SP's own defaults (exact) — flip the surname to fuzzy/phonetic on SP's Refine panel when a search comes up empty. |
| **RootsIreland ▸** | the *ScotlandsPeople ▸* row — shown only for people with Irish events | An expandable **menu** of [RootsIreland](https://www.rootsireland.ie/) quick searches of the Irish county genealogy centres' transcripts (baptisms, marriages, burials, census, gravestones, Griffith's Valuation, passenger lists). One pair of entries per Irish life event — the **county centre's** search when the place names a county (Donegal, Mayo, …) plus the **all-Ireland** search — pre-filled with first name + surname + the event year (the site searches ±5). A married woman's death is searched under each married surname. **Searching is free** and shows how many records match in every category; opening the records needs a RootsIreland subscription. |
| **IrishGenealogy ▸** | the *RootsIreland ▸* row — shown only for people with Irish events | An expandable **menu** of [IrishGenealogy.ie](https://www.irishgenealogy.ie/) searches — Ireland's **free** official records site: the **civil register indexes with free images of the actual registers** (births 1864+, marriages 1845+, deaths 1864+ — released on rolling 100/75/50-year privacy rules; a civil entry only appears when the event falls in the released range, with the mother's maiden surname sent on births when the tree knows her) and the **church registers** (selected dioceses — Dublin, Kerry, Cork & Ross and others; partial coverage, so absence proves nothing). One civil + one church entry per Irish life event, year ±2; a married woman's death under each married surname. |
| **Newspapers ▸** | the *IrishGenealogy ▸* row (or the earlier specialty rows) | An expandable **menu** of pre-filled newspaper searches, grouped by region and offered only for countries the person's events touch: **Worldwide** — [Newspapers.com](https://www.newspapers.com/) and MyHeritage's [OldNews](https://www.oldnews.com/); **United States** — [GenealogyBank](https://www.genealogybank.com/) and the Library of Congress's free [Chronicling America](https://www.loc.gov/collections/chronicling-america/) (to 1963); **UK & Ireland** — Findmypast's British & Irish newspapers (the British Newspaper Archive index); **Australia** — the free [Trove](https://trove.nla.gov.au/) (1803+); **New Zealand** — the free [Papers Past](https://paperspast.natlib.govt.nz/) (1837–1992). Every search sends the first name + surname (as an exact phrase where the site supports one; Findmypast gets the birth and death years ±2 and name variants instead) with the life span (birth → death + 2) as the date window, clamped to each archive's coverage; a married woman gets one entry per name — maiden plus each married surname, the married entries starting at that marriage's year. |
| **MyHeritage ▸** | **in place of** the native *MyHeritage* row, which it hides so there is one MyHeritage entry point — the native search is the menu's first entry, **All Collections — \<name\> (b–d)** | An expandable **menu** of MyHeritage's own searches (no entry repeats the word "MyHeritage" — the row says it): **All Collections — \<name\> (b–d)** (MyHeritage's own search for the person exactly as the hidden native entry ran it), the **census** searches — one entry per census year the person's places bracket, labelled *1841 E&W Census — \<name\>* exactly as every other menu labels that census, restricted to MyHeritage's own collection for it: the US federal censuses 1850–1950, Canada 1851–1931, England & Wales 1841–1911 and the 1939 Register, Scotland 1841–1901 — a woman under her surname of that year; the **all-records** search (name + birth/death years + gender; **one entry per country the person's events touch** — *Australia — Mary Cullum (1891–1956)* — birth country first — the country is sent as a place, so MyHeritage keeps the search within it instead of searching the whole world; a married woman gets maiden + married-name entries in each; when no place on the page classifies to a country, one *Worldwide* search is offered instead) and **Family Trees** — other members' trees, the Smart Matches well, strong on European trees. |
| **Findmypast ▸** | **in place of** the native *Findmypast* row, which it hides so there is one Findmypast entry point — the native search is the menu's first entry, **All Collections — \<name\> (b–d)** | An expandable **menu** of Findmypast's own searches, focused on what FMP uniquely does best (GRO indexes, newspapers and Scottish records stay with their own menus): **All Collections — \<name\> (b–d)** (Findmypast's own search for the person exactly as the hidden native entry ran it), **all records** (name + variants + birth/death ±2; **one entry per country the person's events touch** — *Australia — Mary Cullum (1891–1956)* — with the country in Findmypast's Where box so the search stays within it; a *Worldwide* entry only when no place on the page classifies to a country), **census** (labelled *1841 E&W Census — \<name\>* exactly as every other menu labels that census) — the **1921 England & Wales census** (Findmypast holds the images; FamilySearch has only an index), the **1939 Register**, E&W 1841–1911 and Irish 1901/1911 per bracketed year, and the US federal (1850–1940; Findmypast's 1950 set is images only, so it is left out here) and Canadian (1851–1931) censuses for the years the person's places bracket — **civil deaths & burials** (the England & Wales death index, which carries the age at death — year of death ±2, or the inferred window when the tree has no death year, with the birth year ±2 sent as the discriminator either way and, for a known death, the death place in Findmypast's Where box) and **parish records** (baptisms with the parents' names sent, marriages with the spouse, burials per married surname — spanning the inferred window when the tree has no death year). Every Findmypast entry opens findmypast.com. |
| **Ancestry ▸** | **in place of** the native *Ancestry* row, which it hides so there is one Ancestry entry point — the native search is not lost: it is the menu's **All Collections — \<name\> (b–d)** entry | An expandable **menu** of pre-filled Ancestry searches in two groups, like the MyHeritage menu (no entry repeats the word "Ancestry" — the row says it). **All records**: **All Collections — \<name\> (b–d)** — Ancestry's own search for the person exactly as the hidden native Ancestry entry runs it (your click is handed to that entry; only when no native entry is on the page does our global all-countries search stand in) — then **\<Country\> — \<name\>** (*England — Doris Annie Hiscocks (maiden)*) — the global Ancestry search restricted to a country (`priority=`, e.g. England / Scotland / United States), with name, birth/death years and gender filled in. One country block per country the person's events touch — birth, christening, marriages, Other-Information facts such as residences, death, burial — birth country first; a married woman gets one entry per name (*maiden* + each *married* surname) in every block. **Census**: one entry per census year the person's places bracket, in Ancestry's own collection for that year and country, labelled as every other menu labels a census (*1900 US Federal Census — \<name\>*, *1939 E&W Register — …*) — except that Ancestry keeps England and Wales apart, so its sets read *1841 England Census — …* / *1841 Wales Census — …* where the other menus say *E&W* — US federal 1790–1950, England 1841–1921 (the Welsh sets beside the English ones for a Wales-touched person), the 1939 Register, Scotland 1841–1901, Canada 1851–1931 and the Prairie Provinces 1906/1916, the 1901 Irish census, the New York state censuses of 1855/1905/1915/1925 — with the name, birth year and birthplace filled in, a woman under her surname of that year. **Civil records**: the civil-registration indexes of the person's event countries — England & Wales births, marriages and deaths (the 1837–1915 and 1916–2007 sets, by year) and the probate calendar, Ireland's civil indexes, the US Social Security Death Index, Australia's and Victoria's indexes, Ontario, British Columbia and Nova Scotia — the event year and, for deaths, the birth year as well, no place (these file by district); a death with no year in the tree is searched over the inferred window with the birth year alone. **Parish records**: the England and Scotland church-register aggregates — baptisms with the parents' names sent, marriages with the spouse, burials per married surname. **Family trees**: **Public Member Trees** (collection 1030, name + birth/death years — the former top-level row). When no country is recognised the entry reads *Worldwide — \<name\>* and searches all countries. |
| **FamilySearch ▸** | **in place of** the native *FamilySearch* row (classic page) / *FamilySearch Records* entry (Labs page), which it hides so there is one FamilySearch entry point — the native search is not lost: it is the menu's **Indexed Historical Records** entry. On FamilySearch's narrow-viewport layout (small window, side-docked DevTools, zoom), which shows a third-party-only panel, the row sits after the Ancestry rows instead | An expandable **menu**: click it to list every pre-filled FamilySearch search that fits this person — record collections, full-text search, FamilySearch's own historical-records search and all-collections; click an entry to open it. Each collection search carries the person’s tree ID (`treeref=`), so the results page shows a **"Person From FamilySearch Tree"** banner with their name, lifespan and ID. |

**How the native searches are carried over.** Each hidden native entry's search lives on as the
first entry of its menu (*All Collections — \<name\> (b–d)*; *Indexed Historical Records* at the end
of the FamilySearch menu). That entry hands your click to the hidden native entry, so FamilySearch
builds the search
exactly as it would have — including the one-time partner token MyHeritage's link carries — and
the partner site receives exactly what FamilySearch sends it; the extension never guesses at
those URLs. Only on a layout with no native entry at all does it build a search of its own from
the tree's vitals, and the entry's tooltip says so.

### At a FamilySearch Center

On a FamilySearch Center's network FamilySearch itself lists two more rows in Search Records —
*Ancestry Institution* (after *Ancestry*) and *MyHeritage Library Edition* (after *MyHeritage*):
the editions a center's patrons can use without an account of their own. Where FamilySearch shows
those rows, each becomes a menu as well (new in 1.0.4):

| New row | Placed | Opens |
| --- | --- | --- |
| **Ancestry Institution ▸** | **in place of** the native *Ancestry Institution* row | The same list as *Ancestry ▸* — **All Collections — \<name\> (b–d)** (FamilySearch's own institution link, your click handed to it), the country searches, **Census**, **Civil records**, **Parish records** and *Public Member Trees* — with every search on `ancestryinstitution.com`, whatever the Regional sites setting says. |
| **MyHeritage Library Edition ▸** | **in place of** the native *MyHeritage Library Edition* row | **All Collections — \<name\> (b–d)** (FamilySearch's own Library Edition link, which it builds at the click), then the all-records search per country and the **Census** group on `myheritagelibraryedition.com`. No *Family Trees* entry — the Library Edition holds records only. |

The ordinary *Ancestry ▸* and *MyHeritage ▸* menus stay beside them: a patron with an account
keeps their own site (and their tree), one without uses the institution row. *Findmypast ▸* needs
no twin — FamilySearch's Findmypast link stays on findmypast.com, which a center's network opens
without a personal login. Away from a center FamilySearch does not list the two rows, so neither
menu ever appears; nothing in the extension tries to detect where you are. Each has its own switch
under **FamilySearch Center menus** in the [Settings](#settings).

### The FamilySearch menu

The list is **content-aware** — it is built from the person's data each time it opens, and
only offers searches whose collection actually covers the person's years and places:

| Group | Entries | Left out when… |
| --- | --- | --- |
| **Census** | one per census year (and country) inside the life span, named for the census itself and followed by the person's name under the surname of that year — *1901 E&W Census — Doris Annie Hiscocks*, *1939 E&W Register — Doris Annie Roberts*, *1900 US Federal Census — …*, *1905 New York State Census — …*. The same wording labels the census entries of every other menu (Ancestry, MyHeritage, Findmypast, ScotlandsPeople), so a census reads alike wherever it is offered. A country is offered for a year only when one of the life events bracketing that year (birth, a dated marriage, death) is in that country — born and married in England, died in Canada → English censuses until the marriage, both countries after | the year is outside birth→death (or birth+100), no known census country, the destroyed 1890 US census, a country the person demonstrably wasn't in that year |
| **Birth** | the civil-registration index (e.g. *E&W GRO Birth Index 1837–2008*) and/or the country's births & christenings aggregate (*Scotland births & baptisms 1564–1950*, …) | the index doesn't cover the birth year — a pre-1837 English birth gets only the parish entry |
| **Marriage** | one entry per marriage. When the couple block shows a marriage date, the search is that year ±2 (*E&W GRO Marriage Index — 1920, spouse Roberts*), the index is picked by that year and the marriage place, and the spouse filter is applied only when the index names spouses in that year (GRO from 1912 — earlier marriages show as *— 1885 (Roberts)*, unfiltered). A parish/church marriage aggregate is offered alongside where one covers the year (*England parish marriages 1538–1973*, *Scotland marriages 1561–1910*, *Ireland marriages 1619–1898* — these name the spouse and take the marriage place). Spouses with no marriage date fall back to an inferred window (age 18–30, capped by death). *Marriage — all collections* (with the marriage place) only where no index at all applies | the person died before marrying age |
| **Migration** | one entry per passenger-list collection that covers a move: whenever two consecutive dated events (birth, a marriage, death) are in different countries, the years between them are searched in the departure lists of the country left (*UK outgoing passenger lists 1890–1960*) and the arrival lists of the country entered (*New York passenger lists 1820–1891*, *New York arrivals (Ellis Island) 1892–1925*, *Canada passenger lists 1881–1922*, *US border crossings from Canada 1895–1956*). The label shows the window (*— 1892–1927*); the search sends the name, the birth window (lists carry ages) and the window as an "any event" date range | no country change between dated events; no FamilySearch collection for the route (nothing exists for arrivals in Australia / New Zealand) |
| **Military** | for men (unknown sex passes) born inside the registration's age band, alive at its date and in the country then: *US WWI draft registration cards 1917–1918* (born 1872–1900), *US WWII draft registration cards 1942* (the "old man's" registration, born 1877–1897), *UK WWI service records 1914–1920* (born 1866–1901). Searched by name + birth window | women; outside the age band; dead before the registration; not in that country per the timeline |
| **Death** | the civil index covering the death year (*E&W GRO Death Index*, *England Death Records 1998–2015*, *Ireland civil death index 1864–1958*, *US Social Security Death Index 1935–2014*, *Scotland Death Records 1998–2015*), for a US death 1936–2007 also *US NUMIDENT (Social Security files)* — the application/claim/death files, indexed by birth date, birth place, parents' names and death date, so the search sends both the birth and the death window — for an English/Welsh death 1858–1957 the *E&W probate calendar (wills & administrations)*, the parish burial aggregate (*England parish deaths & burials 1538–1991*, *Australia deaths & burials 1816–1980*, sent with the burial place), then *Find A Grave*; a woman gets one entry per married surname. With **no death year** in the tree, every tier the inferred window reaches — from the last year the page shows the person alive to age 100 — is offered over that window (labelled *death year unknown*), the civil index also with the birth ±2 | the Death vital reads **Living** |
| **Full text Search (AI-indexed records)** | FamilySearch **Full-Text Search** — a fast-growing set of AI-indexed, text-rich collections (probate, deeds, court and police records, …). *"Given Surname" birth–death+2* searches the exact quoted phrase inside the life span (+2 years for probate); a woman also gets *"Given MarriedSurname"* from each marriage year; one *"Given Surname" +SpouseGiven* entry per spouse targets records naming the couple (the `+` requires the spouse's name somewhere on the same page); *— any date* appears only when a life bound is unknown; last, *Simple search — \<Name\> \<ID\>* runs the same query as the native FamilySearch Full Text entry (the name plus the tree ID, which FamilySearch expands into the person's details) | never (the ID entry needs the page's ID; the name entries need a name) |
| **Everything** | *Indexed Historical Records* — FamilySearch's own historical-records search for this person, exactly as the native FamilySearch entry (now hidden) ran it: FamilySearch fills in the name, dates, places and relatives itself (when that link is not on the page, a search of our own by name + birth ±2 + birthplace + death ±2 + death place stands in); then *All collections* — the unfiltered search by maiden name + birth year ±2 + birthplace | never |

Hover the row (or any entry) for a tooltip that says exactly which collection, name and years a
click will use.

**Already-attached sources.** Once you have opened a person's **Sources** tab, the menu dims
(and ticks ✓) every search whose collection is already attached to that person — an attached
*England and Wales Census, 1851* dims the *1851 E&W Census* entry, an attached
*Find a Grave Index* dims *Find A Grave*, and so on. The source titles are read from the
Sources tab as you view it and cached per person in the extension's own storage; the footer
line under the menu says when they were read and opens the Sources tab to refresh them (it
also warns when the page's source count no longer matches). Matching is by collection title,
so a record that merely *mentions* the person (a child's christening naming the parents) can
show as attached — which is why entries are dimmed, never hidden, and stay clickable.

The current person's name, sex, birth / christening / death / burial year + place, spouse
surnames, and each marriage's date + place are scraped from
the rendered person page (the Tree API is not reachable from a content script). The Records row
appears once the Vitals card has rendered.

Regions with census + index data: England & Wales, Scotland, Ireland, Canada, United States.
**States and provinces come first:** when an event's place names Ontario, British Columbia, the
Prairie Provinces, New York, Massachusetts or Pennsylvania, that state's or province's own
registers are offered ahead of the national index — *Ontario births 1869–1912*, *British Columbia
deaths 1872–1986*, *Massachusetts marriages 1841–1915*, *New York City municipal deaths
1795–1949*, *Pennsylvania marriages 1709–1940* — together with its state censuses (New York
1855–1925, Massachusetts 1855/1865, the Prairie Provinces 1906/1916/1926) and, for men of the
right age, its WWII draft cards (Pennsylvania, New York City). Those registers are indexed by town,
so the search sends the place. Australia / New Zealand have no census collections on FamilySearch;
Australia does get the Australia-wide births & baptisms, marriages, and deaths & burials aggregates
(selected localities only, so empty results are common), New Zealand only the Find A Grave /
all-collections fallbacks.

**Surname spellings from your own sources.** Once the Sources tab has been read, the surname
under which this person's attached records are actually indexed is compared with the tree's:
Edward *Cummings* whose records all say *Cummins* gets an extra *"Edward Cummins"* full-text entry
and an *All collections — as Cummins* entry (exact-phrase full text never matches a different
spelling; the record search only partly does). Only near spellings count, and a married or spouse
surname is never treated as a variant.

**Other Information feeds the timeline.** Dated residences, immigration / emigration,
naturalization and military-service facts (expand *Other Information* on the person page) join
the birth, marriages and death as timeline events, so census bracketing, migration windows and the
military "in the country then" test follow them — a 1912 Calgary immigration drops the 1921
England census and narrows the passenger-list window to 1908–1912.

**Shift+click for the first given name only.** Every entry whose search carries the full given
name has an alternate with only the first one ("Doris" instead of "Doris Annie", the way many
indexes record people). Shift+click the entry to open it; the tooltip says so.

**Parents' names.** The father and mother shown under *Parents and Siblings* are sent with every
search whose collection indexes parents — parish and church christenings, the Australian
aggregates, NUMIDENT and the *All collections* search — because a father's name is the strongest
discriminator for a common name. Civil-registration indexes never get them: FamilySearch ranks
rather than filters, so a field the index lacks would only bury the right record.

The core collection ids and search rules were ported from the companion *Quality Score Analyzer*
extension, where they were verified in the browser.

### Source Linker: compare two places on a map

When you attach a record, the Source Linker puts the record's facts on the left and the tree
person's on the right and flags a mismatch with a *Different* chip — but "Kingswood,
Gloucestershire" on the census against "Warmley, Gloucestershire" in the tree still leaves the
real question open: are they close enough to be the same person? The extension appends a small
**📍 compare** link after every place on the page. Click it and a page opens with **Google's
embedded directions map — a lettered pin on each place (A = the record's, B = the tree's) and the
driving route between them** — under a header naming both places and the straight-line distance in
miles and kilometres, with links to the full **Google Maps driving route** or either pin in Google
Maps. (Google Maps' own directions *website* draws the start as a small circle and only the end as
a pin; the embedded map is the one that draws both — Shift+click a compare link to go straight to
the website route.) The embed needs no key; optionally paste your own free Google *Maps Embed API*
key on that page ("Map key…") and it switches to the supported embed, which also prints the driving
distance and time on the map. The link sits on both sides of a matched pair and opens the same map.
Places are **paired by the kind of fact and the year**, not by where they sit on the page: the
record's Birth meets the tree's Birth, a census's Residence meets the tree's residence **of the
same year** (the 1851 census against the 1851 residence — never the 1861 one, and never a later
death that happens to share its row), a christening may stand in for a birth and a burial for a
death. A place with no counterpart of its kind gets a **📍 map** link that opens Google Maps with a
pin on that one place. Every click reuses the same map tab, so a linking session never
piles up map tabs.

**Same name, several places.** "Kingswood, Gloucestershire" is two villages — one beside Warmley
near Bristol, one near Wotton-under-Edge — and Google may pick the wrong one. So a *compare* click
first **locates both places** with OpenStreetMap's free geocoder (Nominatim): every place that fits
the county given is a candidate, and the pair of candidates **nearest each other** wins — one
person's places tend to lie close together. Google Maps then opens by coordinates, so the pins
cannot land on the wrong namesake, and the link itself changes to the straight-line distance
(**📍 1.1 mi**; kilometres in the tooltip, which also says when several places matched a name, so
you can check the pins). Lookups happen only when you click, one at a time, and are remembered for
the session; if the geocoder cannot be reached the map simply opens by name as before. Hover a
link to see exactly what will be sent. Google labels a coordinate pin with the nearest address it
knows — a shop or a street name — but the pin sits on the place; the tooltip names both places.

A **📍 map** link (a place with nothing to compare against) is located the same way and opens
Google Maps by coordinates, so a pin is dropped exactly on the place rather than the area being
outlined; when the name has several namesakes, the one nearest this page's other places is taken
and the tooltip says which. A place that is a whole region — a country, a state or province, a
county — is framed instead: Google's own search fits the map to the region and draws its
boundary, because a pin at a region's centre lands on a field in the middle of nowhere (a bare
"United States" needs no lookup at all).

Only facts that can carry a place get a link — births, deaths, residences, marriages, military
service and the like. A fact whose value is never a place (Marital Status, Occupation, Name, Sex,
Education, Race…) is left alone even when its text happens to contain a comma, so "Single, without
dependents" on a census no longer earns a pin.

When both names turn out to be one place — "Kobe, Japan" beside "Kōbe-shi, Hyōgo-ken, Japan" — the
link reads **📍 same place** and opens a pin on it rather than a route from a place to itself.

A region on one side of a row is a containment question, not a distance. A census that gives a
birthplace as "Pennsylvania" against the tree's "Coalmont, Huntingdon, Pennsylvania, United States"
reads **📍 in Pennsylvania** on both sides with no lookup at all (the one name is the tail of the
other): a click pins Coalmont, Shift+click frames the state. When a lookup shows one side to be a
region — a county, a state — the link says **📍 in** or **📍 not in** that region (judged by its
bounding box, so check a pin near the edge), and two regions against each other read **📍 two
regions**, the record's framed on click and the tree's on Shift+click. A name the map knows as
several boundaries — "London" is both Greater London and the square-mile City of London — is
settled by containment, not by whose centre is nearer: the one that holds the other place is the
one meant, so a record's "Shoreditch, Middlesex" against the tree's "London, England, United
Kingdom" reads **📍 in London** (the everyday name, not "Greater London"), never "not in City of
London" because the square mile's centre happened to be closer.

Three things the lookup allows for: accents and Japanese city/prefecture suffixes are ignored when
names are compared ("Kōbe-shi" is "Kobe"); *Saint* and *St* are tried both ways (and "Georges" as "George");
and the county in the tree is treated as a preference, not a rule — modern map boundaries
("Telford and Wrekin", "City of Bristol") rarely spell the historic county a tree records. When no
place of that name is found under the county as written, the **rest of the place is located too**
and a namesake counts only inside that area, or within fifteen miles of it: a "Saint Georges,
Shropshire" resolves to the St Georges inside Shropshire's boundary (Telford's), never to the St
George in Bristol fifty miles south of the county, and the tooltip says the county was matched by
its boundary — if that pin looks wrong, the tree's place is probably mis-standardised.

A namesake nowhere near the stated place is not that place. The burial "LawnView Cemetery, Fox
Chase, Philadelphia, Pennsylvania" once pinned the only "Lawnview Cemetery" the map knows in the
United States — a field in rural Oklahoma. Now a cemetery, church, hospital or other venue the map
does not know by that name near the rest of the place is searched again by its bare name within
ten miles of it, which finds the map's own name for it ("Lawnview Memorial Park", a mile from Fox
Chase); and if that finds nothing either, the rest of the place **stands in** — a pin on Fox Chase,
the tooltip saying what stands for what — and for a venue the click searches Google Maps by the
full name instead, since Google knows most cemeteries and churches (Shift+click opens the other
reading). A place that names no country is never bounded this way, because its rest could resolve
anywhere ("Shoreditch, Middlesex" has a Middlesex County in New Jersey).

### Map pins on the person page

The same **📍 map** link appears on a person's own page, after every place the page mentions:
the Birth / Christening / Death / Burial places on the Vitals card, the marriage place in each
couple block under Family Members, and the residences, immigrations and other dated events under
Other Information (FamilySearch collapses that section by default; the links appear once you
expand it). Click one and the place is located as on the Source Linker — the free OpenStreetMap
geocoder, only when you click, a name shared by several places settled by the person's other
places — and Google Maps opens in the reused map tab with a pin dropped exactly on it; hover the
link afterwards to see where it was pinned. A cemetery, church or other venue the map knows under
another name is found by its bare name near the rest of the place, and a name the map lacks
altogether is stood in for by the rest of the place — see "Same name, several places" above. A
region — "United States", "Pennsylvania, United
States" — opens framed on the whole country or state with its boundary drawn, rather than pinned
at its centre. A United States place written at FamilySearch's county level — "Huntingdon,
Pennsylvania, United States" — is taken for the county and framed as one, not pinned on the town of
the same name. Where FamilySearch shows a place as two lines — the
text as entered over the standardised place name — the link follows the standardised line, which
is the one a map can find. Facts whose value is not a place (Name, Sex, Occupation…) get nothing,
a Custom Event's own title line ("Military Draft Registration") is never taken for a place — only
the place under it, when it has one — and the click never opens FamilySearch's own fact panel.
The Sources tab is a person page too: expand a source and every place field of its Indexed
Information — Birthplace, Event Place, Marriage Place and the like — gets the link, while its
date, name and number fields never do. On a 1940 census the 1935 residence often reads "Same
Place" (or "Same House") — the enumerator's shorthand for the record's own Event Place — so that
link opens the Event Place's map and its tooltip says so; a card with no Event Place gets no pin
there, and shorthand that names no place at all ("Rural", "Abroad") never does. A place too long for its box — FamilySearch shortens such
a place to two lines and an ellipsis — gets its link on its own line right under the box, where
it stays visible.

### Quality Score: the number behind the badge

FamilySearch grades a person's **Data Quality Score** as a word — Low, Medium or High — but the
grade is derived from a number, and the number is what tells you how far a person is from the
next grade. Hover the badge (or tab to it) and a tooltip shows it — drawn by the extension itself,
in type a little larger than a normal browser tooltip with the score line in bold, so the lines are
easy to read; it goes away
when the mouse leaves, the page scrolls, or you press Escape:

```
Quality score 76.8 · Medium
Low <40 · Medium 40–84.9 · High ≥85
Scored as: United Kingdom 1800 – 1920

To reach High:
• 1939 Register tagged twice — remove
  one → 88.9
• Add a burial → 85.1
• Add the month to the 1985 death → 79.5
```

The score is shown on a 0–100 scale (FamilySearch's own figure runs 0.0–1.0) with one decimal,
because the Medium-to-High line is tight. The third line names the **birth segment** FamilySearch
scored the person under — a country or region and a span of birth years, exactly as FamilySearch
reports it. FamilySearch documents its segments as running 1800–1920 (Ireland to 1844, with a
few countries split in two), so this line is where you will first notice a segment being widened.
Under it, each item FamilySearch counts as outstanding
for this person becomes one action, biggest gain first, with the score that fix **alone** would
give — so you can see at a glance which one is worth doing. The projection uses the scoring rule
FamilySearch applies (the overall is the average of Data Completeness, Source Tagging and Source
Consistency, and any unresolved data conflict zeroes it); the extension checks that rule against
the person's actual score first and, if it does not fit, lists the actions without numbers rather
than promise a wrong one. A High person with nothing left reads "Nothing outstanding."; a person
whose score is "Not Available" gets no tooltip.

The tooltip works at any page width. On a narrow page — a laptop screen with a side panel open,
or a zoomed-in tab — FamilySearch moves the badge under the person's name and shortens its label
from "Quality Score:" to "Quality:"; the badge is recognised either way.

**No request is made for this.** The page itself fetches the score to draw the badge; the
extension only reads that response as it arrives in your browser (a small script in the page
listens for it), so the number is exactly what FamilySearch computed, and nothing is sent or
fetched beyond what the page already does. The thresholds (40 and 85) come from a sample of
scored people rather than FamilySearch documentation; the Low/Medium line is the less certain of
the two — every Low seen so far scored exactly 0.

### The Temple menu and the Labs experiment

For signed-in church members the top-level **Temple** menu gains four links after *Ordinances
Ready*: Temple Opportunities, Family Ordinance Opportunities, Remaining Temple Ordinances and
**Families with Remaining Ordinances**. The first three open FamilySearch campaign pages. The
fourth is a **FamilySearch Labs experiment** (`/en/temple/family-remaining-ordinances`): families
with someone on your Completed list whose other members still need ordinances. It works only while
the experiment is turned on at [FamilySearch Labs](https://www.familysearch.org/en/labs/); turned
off, FamilySearch shows its own "Page Not Found".

The extension knows whether the experiment is on from the page's own data: FamilySearch's pages
read the Labs preference at load, and the extension listens to that response, exactly as it does
for the Quality Score — no request of its own. The row is always shown:

- experiment on (or not known yet): the click opens the page;
- experiment off: a confirm dialog, then FamilySearch's **own** opt-in link (the very link the
  "Try It" button on the Labs page carries), whose code turns the experiment on and sends you to
  the page — the extension never writes the setting itself;
- Shift+click opens the Labs page;
- should the page still come up as "Page Not Found" (the experiment off on a page the extension
  had no state for, or an experiment FamilySearch has ended), a yellow banner at the top offers
  the same opt-in route, or the Labs page.

Hover the row for the current state. It has its own switch on the settings page (Temple menu).

### The Labs person page

FamilySearch's optional new person page (the Labs experiment with the "Opt-Out of Experiment"
button, September 2026) is supported alongside the classic page. The differences it makes:

- **Search Records is a header button.** The extra rows appear inside the dropdown it opens,
  about a third of a second after you open it, and the **FamilySearch ▸** menu takes the place of
  the native *FamilySearch Records* entry (hidden — its search is the menu's *Indexed Historical
  Records*), ahead of *FamilySearch Full Text* and *FamilySearch Trees*. Nothing is injected while
  the dropdown is closed.
- **Sources are read from the Details page.** The new page lists a person's sources in a column
  beside the details, so "already attached" awareness needs no visit to a Sources tab: the
  column is read as the page renders and the FamilySearch menu ticks the attached searches at once.
- Everything else (vitals, spouses and marriages, parents, Other Information facts, the Quality
  Score tooltip, the Temple links) reads the new page as it did the old one.

## Settings

Everything the extension adds can be switched off, and the Ancestry / Findmypast links can be
pointed at your own regional site. Three ways to the settings page (all the same page):

- click the extension's icon in Chrome's toolbar (Chrome parks a new extension's icon behind the
  puzzle-piece menu until you pin it);
- `chrome://extensions` → the extension's **Details** → **Extension options**;
- right-click the icon → **Options**.

Nothing on the FamilySearch page itself leads there — the menus stay search entries only.

| Group | Switches | What "off" does |
| --- | --- | --- |
| **Search Records menus** | FamilySearch · Ancestry · MyHeritage · Findmypast | These four menus stand in for FamilySearch's own row for that site. Untick one and our menu goes, and **FamilySearch's standard row comes back** — the thing to do when you have no account with that site and only want the standard search. |
| | FreeBMD · GRO Index · ScotlandsPeople · RootsIreland · IrishGenealogy · Newspapers | The row is never added (these appear only when the person's places fit anyway). |
| **FamilySearch Center menus** | Ancestry Institution · MyHeritage Library Edition | These two appear only where FamilySearch lists those rows — on a FamilySearch Center's network. Untick one and our menu goes, and FamilySearch's standard row comes back. |
| **Map pins** | Person page · Sources tab · Source Linker | No 📍 links on that kind of page; any already shown disappear within a second. |
| **Quality Score** | the tooltip | Hovering the badge shows only what FamilySearch shows. |
| **Temple menu** | Temple Opportunities · Family Ordinance Opportunities · Remaining Temple Ordinances · Families with Remaining Ordinances | That link is not added (for the last one, no banner on its page either) — handy should FamilySearch start offering one of these tools itself. |
| **Regional sites** | *Ancestry* — ancestry.com (default), ancestry.co.uk, .ca, .com.au, .de, .fr, .it, .se, .mx, or the library / FamilySearch Center editions; *FindMyPast* — findmypast.com (default), .co.uk, .ie, .com.au | Every Ancestry or Findmypast link **this extension builds** (the Newspapers menu's Findmypast entries included) opens on the chosen site — pick the one your subscription is on. The search grammar is the same on every regional site. FamilySearch's own *All Collections* entry still opens wherever FamilySearch sends it, and the *Ancestry Institution* menu always uses ancestryinstitution.com. |
| **Advanced** | Console diagnostics | On: the extension's `[FSSE]` messages appear in the DevTools console (filter by `FSSE`) — turn it on to paste the lines into a bug report, off again afterwards. |

Changes apply at once; open FamilySearch tabs follow within a second, no reload needed.
**Restore defaults** turns everything back on. The settings follow your Chrome profile
(`chrome.storage.sync` — kept locally when Chrome sync is off); nothing is sent anywhere, and an
install that has never opened the page behaves exactly as before the page existed. Only whole
features are switchable: what each menu LISTS stays decided by the person page — the collections,
years and surnames that fit — and is deliberately not a setting.

## Install

**From the Chrome Web Store** — the listing is under review; the link will appear here once it
is live, and that becomes the normal route.

**Before the listing is live** — download the current build from the project's
[latest release](https://github.com/familyhistorytoolsmith/search-enhancer-for-familysearch/releases/latest)
(the `search-enhancer-for-familysearch-v<version>.zip` under *Assets*) and load it unpacked. The
[help page](https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/#install-now) has the
step-by-step version; in short:

1. Extract the zip to a folder you will keep (not Downloads — Chrome loads the extension from
   that folder every time it starts).
2. Open `chrome://extensions`, toggle **Developer mode** (top-right) on, click **Load unpacked**
   and select the extracted folder (the one holding `manifest.json`).
3. Open a person page, e.g. `https://www.familysearch.org/en/tree/person/details/GLQN-3Q2`
   (you must be signed in to FamilySearch). The new rows appear in the **Search Records**
   panel. Click one to open a pre-filled search in a new tab (or, for **FamilySearch ▸**, to
   expand the list).

An unpacked copy does not update itself: for a new release, download the zip, extract it over
the same folder and click the **reload** ↻ icon on the extension's card. Once the store listing
is live, remove the unpacked copy before installing from the store — to Chrome the store copy is
a separate extension, and two copies would both add rows.

**From the source** (development): clone this repository and load its
`familysearch-search-enhancer/` folder unpacked the same way. After editing any file, return to
`chrome://extensions` and click the **reload** ↻ icon on the extension card, then refresh the
FamilySearch page.

## How it works

- `manifest.json` — MV3 config; injects the content scripts on every familysearch.org page
  (the search rows only ever appear where a person and the Search Records panel exist), plus
  the FreeBMD / GRO / ScotlandsPeople form fillers on those sites.
- `src/inject.js` — finds the "Search Records" card and inserts new rows by *cloning* an
  existing row, so they automatically match FamilySearch's styling. `injectRow` makes a plain
  row; `injectMenu` makes the expandable row whose entries are cloned, indented rows.
- `src/settings.js` — the user settings store (see [Settings](#settings)): one object under
  `fsse.settings` in `chrome.storage.sync`, every switch defaulting to "on"; loaded on every
  FamilySearch page and by the settings page. `src/options.html` + `src/options.js` — the
  settings page itself (the toolbar popup and the Chrome options page are this one file).
- `src/familysearch.js` — extracts the FSID from the URL and scrapes the vitals (name, sex,
  living flag, birth/death, spouse surnames) from the rendered page.
- `src/sources.js` — scrapes the source titles from the person's Sources tab, caches them per
  person (`chrome.storage.local`), and provides the title matching the menu uses to dim
  already-attached searches.
- `src/fs-collections.js` — FamilySearch collection ids per region (censuses, birth /
  christening / marriage / death / burial indexes), place → region classification, and the
  record-search URL grammar.
- `src/sites.js` — the **registry** of search options and the content-aware option builder
  (`recordOptions`) for the FamilySearch menu.
- `src/content.js` — watches the React SPA with a `MutationObserver` and keeps the rows
  injected as you navigate between people; de-duplicates via a `data-fsse-id` marker and
  refreshes an open menu when fresher person data arrives.
- `src/linker.js` — the Source Linker's **📍 compare** links: reads each fact's place by its
  visible label ("Birth", "Residence", "Birth • 2 Sources"), pairs the record's and the tree's
  places that share a row, and opens Google Maps directions between them in one reused tab.
- `tests/` — node test suites (no browser needed): `node tests/run.js` syntax-checks `src/`,
  validates the manifest and runs every `*.test.js` (the option builder against a dozen
  real-shaped people, the pure parsers, the Sources-tab scrape and the family scrape on fake
  DOMs). Run it after every change to `src/`.

## Search rules worth knowing

- **Civil-registration indexes never get a place.** They file by registration district, which
  rarely matches the tree's town or county, and FamilySearch *ranks* by place rather than filtering
  — so a wrong place buries the right record. Censuses, parish christenings and the all-collections
  search *do* send the birthplace (they are indexed by real locality / broadly ranked).
- **Marriage dates.** Each couple block's *Marriage* line (date + place) is scraped alongside the
  spouse. A dated marriage gets an exact ±2 search; an undated one keeps the age-18–30 guess.
- **Christening / burial as proxies.** A missing birth year falls back to the christening year, a
  missing death year to the burial year (both within the searches' ±2 windows — tooltips then say
  *christened Y ±2* / *buried Y ±2*). The parish births & christenings entry prefers the
  christening's own year and place — the christening happened at the parish church, so its place
  matches the register better than the birthplace does.
- **Married names.** For a woman the census entries use the surname of her latest marriage dated
  on or before the census year (or, with no dated marriage, her married surname from age 20) and
  her maiden name before; the death entries use the married surname(s) — minus any from a
  marriage dated after her death; birth and marriage entries use the maiden name.
- **Spouse filter.** The England & Wales marriage index only names the spouse from 1912; adding
  the filter to an earlier search returns nothing, so it is only applied when the marriage year
  (or the whole inferred window) is 1912 or later.
- **Unknown death year.** When the Death vital says only *Deceased*, the death searches cover an
  inferred window: from the **last year the page shows the person alive** — the birth, the latest
  dated marriage or Other-Information fact (a residence), or a census / 1939 Register among the
  attached sources — to **age 100** (or 70 years past that last sighting when no birth year is
  known), never beyond the current year. Each menu uses it its own way: FreeBMD one search (to
  1999), GRO a ladder of 5-year blocks with the matching age, FamilySearch the window on every
  death tier it reaches, Findmypast's parish burials as a centre ± offset, ScotlandsPeople the
  year-from / year-to boxes with the matching age range. Every tooltip says what the window rests
  on ("last seen 1939 (1939 Register), searched 1939–1980 (to age 100)").
- **FreeBMD's Death age/DoB box.** Every FreeBMD death search whose window reaches 1866 carries
  the birth year ±1 in that box (e.g. `1879-1881`). FreeBMD checks it against each entry's
  recorded age at death (from 1866) or date of birth (from 1969) in that entry's own quarter, so
  even a 40-year unknown-death window returns only the deaths of someone born about then. The
  one catch: an entry whose age was never transcribed cannot match — if the right person is
  missing, clear the box on FreeBMD's form and press Find again.

## Add another search option

Append one object to `FSSE.SITES` in [`src/sites.js`](src/sites.js). A plain row:

```js
{
  id: "my-site",                       // unique slug
  label: "My Genealogy Site",          // text shown in the list
  icon: "icons/my-site.svg",           // add the file under icons/ (omit to reuse the anchor's logo)
  anchorLabel: "Google",               // row to sit next to (or an array of fallbacks, tried in order)
  position: "after",                   // "after" | "before"
  applies: (p) => true,                // OPTIONAL: wait for the person; show only while true
  describe: (p) => "…",                // OPTIONAL: live tooltip text
  buildUrl(p, opts) {
    // p = { id, given, surname, marriedSurnames, spouseSurnames, spouses, sex, living, fullName,
    //       birthYear, birthPlace, deathYear, deathPlace, christeningYear, christeningPlace,
    //       burialYear, burialPlace }   (years are strings; id = the tree PID, e.g. "LJRD-PJ2")
    // spouses = [{ name, surname, id, marriageDate, marriageYear, marriagePlace }]
    // opts = { shift, cycle }  — cycle counts Shift+clicks on this row for this person
    const u = new URL("https://example.com/search");
    u.searchParams.set("q", p.fullName);
    if (p.birthYear) u.searchParams.set("born", p.birthYear);
    return u.toString();
  },
}
```

For an expandable menu, replace `buildUrl` with `options(p)` returning
`[{ group, label, url, tooltip }]`. For another FamilySearch collection, add its id to the region
tables in [`src/fs-collections.js`](src/fs-collections.js) and build the URL with
`FSSE.recordSearchUrl(params, collectionId)`.

Every site is also a switch on the settings page: add a `site.<id>` entry to `SCHEMA` in
[`src/settings.js`](src/settings.js) (label, group, a one-line hint) — `tests/settings.test.js`
fails until the two lists agree.

Reload the extension and refresh the page.

## Troubleshooting

- Open DevTools on the person page and filter the console by `FSSE`. The first line,
  `[FSSE] content script loaded v0.2.x …`, shows which build is running — if it doesn't match the
  version on the `chrome://extensions` card, the reload hasn't taken (reload the extension, then
  refresh the page). A release build logs nothing until **Console diagnostics** is switched on in
  the settings.
- A row you expect is missing? Check the settings page first — a switched-off menu logs
  `[FSSE] settings: <id> is switched off` once per page.
- `[FSSE] person ready: {…}` shows exactly what was scraped (name, sex, years, places, spouse
  surnames); `[FSSE] spouse surnames: […] | skipped (children/parents blocks): […]` shows which
  family links were treated as spouses; `[FSSE] spouses + marriages: […]` lists each spouse with
  the marriage date/place read from their couple block; `[FSSE] menu built: fs-records N options` fires each time
  the Records list is (re)built. A wrong entry in the menu is almost always a wrong value here.
- The Records row only appears after the Vitals card has rendered; the menu list refreshes itself
  if it was opened before the family section loaded.
- `[FSSE] the extension was updated or reloaded while this tab was open — refresh the page to
  restore it fully.` (logged once, in a release build too): Chrome updated the extension — or you
  reloaded it on `chrome://extensions` — under an open FamilySearch tab. The rows keep working on
  what that tab had loaded, but settings changes and the source cache no longer reach it; refresh it.

## Notes & limitations

- Scoped to English (`/en/`) person pages; the row matching keys off visible labels
  ("Ancestry", "FamilySearch") and English Vitals labels. Other locales would need label mapping.
- The FreeBMD menu adds a content script on `freebmd.org.uk` whose only job is to fill the
  search form from the parameters in the URL fragment and press Find — it runs once per
  FSSE-opened search, reads nothing, and stays inert when you browse FreeBMD yourself.
- The GRO Index menu likewise adds a content script on `gro.gov.uk` that presses Search on the
  form GRO itself pre-filled from the link's parameters; when the login page intervenes it
  remembers the search (in that tab only, for 15 minutes) and finishes it after you sign in.
  It reads nothing and stays inert when you browse GRO yourself.
- FreeBMD and GRO searches each **reuse one tab** (a named window per site) instead of
  opening a new tab per click; every other search opens a fresh tab. Searches launched from
  another program (e.g. RootsMagic's WebSearch) arrive in whatever tab the browser gives them.
- The ScotlandsPeople menu adds the same kind of content script on `scotlandspeople.gov.uk`:
  it fills the search form of the page the entry opened and submits it, with the same
  per-tab, 15-minute resume after a login. It reads nothing and stays inert when you browse
  ScotlandsPeople yourself.
- If FamilySearch changes its DOM, the extension fails gracefully (no rows / bare search)
  rather than breaking the page. Selectors avoid FamilySearch's hashed CSS classes.
- Read-only personal-use tool: it only reads data already shown to you via your own login
  and opens searches in new tabs. What it stores stays on your own machine: your settings
  (`chrome.storage.sync`, so they follow your Chrome profile), the attached-source titles per
  person whose Sources tab you have viewed (at most 200 people, the oldest dropped first) and an
  optional Google map key (`chrome.storage.local`), the list of FamilySearch Labs experiments that are on for your account as the page last reported it (`chrome.storage.local` — for the Temple menu's Labs row), and a per-session cache of located places
  (`sessionStorage`). Nothing leaves the browser except the three click-driven requests named at
  the top of this file.
- Attached-source marks exist only for people whose Sources tab you have opened at least once
  (FamilySearch lists the sources nowhere else), and they are title matches — see above.
