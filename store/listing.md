# Chrome Web Store — paste-ready text for Search Enhancer for FamilySearch

Everything the Developer Dashboard asks for, in the order its tabs ask. Copy each block into the
matching field. No placeholder is left: the privacy policy is served by GitHub Pages at
https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/privacy-policy.html (from `docs/privacy-policy.html` in
the repository, since 2026-11-04). The publisher display name and the contact email go on the
dashboard's **Account** tab, not in this file — decided 2026-11-04:

- Publisher display name ("Offered by"): **Family History Toolsmith**
- Contact email (verified by a link; shown publicly on the listing): **familyhistorytoolsmith@gmail.com**
  (the forwarding Gmail; keep its login for the verification link — the dashboard sends it there).

Facts behind the choices (read off Google's dashboard docs 2026-10-30) are in CLAUDE.md, section
"Chrome Web Store publishing — the plan".

---

## Package tab

Upload `search-enhancer-for-familysearch-v1.0.3.zip`, built by `build-store-zip.ps1` at the repo root
(the same build the GitHub Release carries; a later version works the same way)
(manifest.json at the zip root; the script checks that). The dashboard reads the title, summary, version
and icons from the manifest inside.

---

## Store listing tab

**Title** (from the manifest, 32 characters): `Search Enhancer for FamilySearch`

**Summary** (from the manifest, 126 characters):

```
Unofficial. Pre-filled record searches (Ancestry, MyHeritage, Findmypast, FreeBMD, GRO and more) on FamilySearch person pages.
```

**Description** (plain text; the store shows line breaks, no formatting):

```
Unofficial — not affiliated with, endorsed by, sponsored by or supported by FamilySearch International.

Search Enhancer for FamilySearch adds pre-filled record searches and a few research aids to the person pages of FamilySearch Family Tree. Open a person, and the page's own Search Records list gains expandable menus whose entries open a search on the chosen site with the person's name, years, places, spouse and parents already filled in — built from the page you are looking at, nothing else.

WHAT IT ADDS TO THE SEARCH RECORDS LIST

• FamilySearch ▸ — every FamilySearch collection search that fits the person: censuses, birth / marriage / death indexes, passenger lists, military records, Full-Text Search, all collections. Each entry carries the person's tree ID, so the results page shows who you are searching for. Searches whose collection is already attached to the person are ticked.

• Ancestry ▸, MyHeritage ▸, Findmypast ▸ — the site's own search for the person first (exactly as FamilySearch's standard row runs it), then searches scoped to the countries the person lived in, the censuses, civil and parish records, and member trees.

• FreeBMD ▸ and GRO Index ▸ — the England & Wales civil birth, marriage and death indexes, free; the site's search form is filled and submitted for you.

• ScotlandsPeople ▸ — statutory registers, Old Parish Registers and the 1841–1921 censuses, the form filled for you (free login; images cost credits).

• RootsIreland ▸ and IrishGenealogy ▸ — the Irish county genealogy centres' transcripts and Ireland's free official civil and church registers.

• Newspapers ▸ — Newspapers.com, OldNews, GenealogyBank, Chronicling America, Findmypast's British & Irish newspapers, Trove and Papers Past, offered by the countries the person's events touch.

The lists are content-aware: a search is offered only when its collection covers the person's years and places. A woman is searched under her maiden name before her marriage and each married name after it. A person with no death date gets searches of the years they could have died. Hover any entry to see exactly what a click will send.

RESEARCH AIDS

• A small 📍 map link after every place on the person page, the Sources tab and the Source Linker. On the linker, the record's place and the tree's place are compared on one map with the distance between them — a quick answer to "is this the same place?"

• Hover the Data Quality Score badge for the number behind Low / Medium / High, the thresholds, and the changes that would raise it.

• For signed-in members of The Church of Jesus Christ of Latter-day Saints, four links in the Temple menu — the fourth opens the FamilySearch Labs experiment "Families with Remaining Ordinances" and, while that experiment is off, offers to turn it on through FamilySearch's own Labs page first.

Every feature can be switched off on the settings page (click the toolbar icon), and the Ancestry / Findmypast links can be pointed at your own regional site.

PRIVACY

The extension runs entirely in your browser. It reads the FamilySearch page you are viewing and sends nothing anywhere except on your click: the search you open, the place name sent to OpenStreetMap's geocoder for a map link, and Google's embedded map on the map page. No account, no analytics, nothing collected or sold. Full policy: https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/privacy-policy.html

A FamilySearch account is needed (free). Viewing records on Ancestry, MyHeritage, Findmypast, Newspapers.com, GenealogyBank and RootsIreland needs those sites' own subscriptions. FreeBMD, GRO, ScotlandsPeople (index results), IrishGenealogy, Chronicling America, Trove and Papers Past are free.

FamilySearch is a trademark of FamilySearch/Intellectual Reserve, Inc., and may be registered in the United States of America and other countries.
```

**Category:** Tools (or Productivity if Tools is not offered in the current list — pick the closest).

**Language:** English.

**Store icon:** `store/icon128-padded.png` (128 × 128, the artwork at 96 px on a 16 px transparent margin,
as Google's icon guidance asks; the manifest keeps the unpadded icons).

**Screenshots:** 1 to 5 at 1280 × 800 (PNG or JPEG). Deceased relatives only. Suggested five:
1. READY (2026-11-03): `screenshot-1-search-records-before-after.png` — the Search Records panel before and after, side by side (Mary Ann Bellwood MPRH-2W3, 1833–1907), the FamilySearch ▸ menu open with its CENSUS and BIRTH groups and the ✓ already-attached marks; built by `python make-store-screenshots.py 2.1 store/captures/2.1-before.jpg store/captures/2.1-after.jpg` at the repo root;
2. READY (2026-11-03): `screenshot-2-partner-menus.png` — two partner menus side by side: Findmypast ▸ open on Doris Marjorie Withers LHWF-ZSP (1902–1980; the whole card, so the FamilySearch / Ancestry / MyHeritage rows show every partner row is a menu; ALL RECORDS · CENSUS · CIVIL RECORDS · PARISH RECORDS with her maiden / married split) and Ancestry ▸ open on George Wilson Stephenson MPRC-39D (1832–1889; the same groups plus FAMILY TREES); `python make-store-screenshots.py 2.2 store/captures/2.2-findmypast.jpg store/captures/2.2-ancestry.jpg`;
3. READY (2026-11-03): `screenshot-3-gro-index.png` — the GRO Index ▸ menu open on Doris Marjorie Withers ("GRO births — 1902 ±2"), what the click does beside it, and the gro.gov.uk results strip the click produced across the bottom (one record, mother's maiden surname MILNER); `python make-store-screenshots.py 2.3 store/captures/2.3-gro-menu.jpg store/captures/2.3-gro-results.jpg` (the checklist proposed FreeBMD too — the site was down when the captures were taken);
4. the Source Linker with a "📍 compare" pair and the two-pin map page it opens (Florence May Brain P6QN-SGS, Kingswood ↔ Warmley), or the person page with "📍 map" after every place;
5. the Quality Score tooltip (Thomas Gourley Park GJJ3-YGN) and the settings page.

**Promo tiles** (optional — both READY in this folder): small `promo-tile-440x280.png` (440 × 280), marquee
`marquee-1400x560.png` (1400 × 560). Upload them on the Listing tab under the promo-tile fields. Regenerate with
`make-promo-tiles.py` at the repo root (the icon is redrawn there at tile size; nothing of FamilySearch in them).

**Homepage / support URL** (optional): the help page, https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/
(also the manifest's `homepage_url` since 1.0.3).

---

## Privacy tab

**Single purpose description:**

```
Adds pre-filled genealogy record searches and research aids to FamilySearch Family Tree person pages: extra search entries in the page's own Search Records list (FamilySearch collections, Ancestry, MyHeritage, Findmypast, FreeBMD, GRO, ScotlandsPeople, RootsIreland, IrishGenealogy, newspaper archives), map links for the places the page shows, the number behind the Quality Score badge, and four links in the Temple menu. Everything acts on the FamilySearch page the user is viewing.
```

**Permission justification — `storage`:**

```
Saves the user's settings (which menus and features are on, the regional Ancestry / Findmypast site they subscribe to) and, per person whose Sources tab the user opened, the titles of the sources already attached to that person, so searches whose collection is already attached can be marked; and the short list of FamilySearch Labs experiments the user has turned on, as the FamilySearch page itself last reported it, so the Temple menu's Labs link knows whether to open the experiment or offer to turn it on first. Stored in the browser only; nothing is sent anywhere.
```

**Host permission justification** (the four content-script hosts):

```
www.familysearch.org: the extension reads the person page the user is viewing (name, dates, places, family, attached-source titles) and adds its search rows, map links and tooltip there. www.freebmd.org.uk, www.gro.gov.uk, www.scotlandspeople.gov.uk: these sites have no search URLs. When the user clicks one of the extension's search entries, a small script on that site fills the site's own search form with the parameters carried in the URL fragment and presses Search — only for a search the user launched from FamilySearch; it does nothing when the user browses those sites themselves.
```

**Are you using remote code?** No. (The map page embeds Google Maps in an iframe; no script is loaded from outside the package.)

**Data usage — what the extension collects or handles:** tick **Website content** only (it reads the
FamilySearch page; on a click, a place name goes to OpenStreetMap's Nominatim and the person's name and
years ride in the search URL of the site the user chose). Leave every other category unticked:
no personally identifiable information about the user, no health, financial, authentication, personal
communications, location, web history or user-activity data.

**Certifications** — all three hold, tick them:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://familyhistorytoolsmith.github.io/search-enhancer-for-familysearch/privacy-policy.html — served by
GitHub Pages from `docs/privacy-policy.html` in the repository; its Contact line carries
familyhistorytoolsmith@gmail.com. Google counts reading page content and even local-only
`storage.sync` data as handling user data, so the field is required.

---

## Distribution tab

- **Visibility:** Unlisted first (no store search listing; anyone with the link installs; the same review
  as Public). Public later if wanted. Private would need a trusted-tester list.
- **Payments:** free.
- **Regions:** all.
- **EU trader declaration** (Account tab): non-trader (a hobby project, no business).

---

## Test instructions for the reviewer

(The field for notes to the review team. Never your own FamilySearch login.)

```
This extension only acts on FamilySearch Family Tree person pages, which need a free FamilySearch account. Creating one at familysearch.org takes a minute; no tree of your own is needed — Family Tree is shared.

Steps:
1) Sign in to familysearch.org.
2) Open https://www.familysearch.org/en/tree/person/details/LH18-4BZ (Charles Bellwood, 1805–1879, a long-deceased person with rich data).
3) In the Search Records panel the extension's rows appear in place of / after FamilySearch's own: FamilySearch ▸, Ancestry ▸, MyHeritage ▸, Findmypast ▸, FreeBMD ▸, GRO Index ▸, Newspapers ▸. Click a row to expand its menu; click an entry to open that site's pre-filled search in a new tab.
4) The small "📍 map" links after each place open Google Maps on that place (the place is located through OpenStreetMap's geocoder on the click).
5) Hover the Quality Score badge (Low / Medium / High) for the numeric score tooltip.
6) The toolbar icon opens the settings page; every feature can be switched off there, and FamilySearch's own rows return when a menu is switched off.

The four Temple-menu links appear only for signed-in members of The Church of Jesus Christ of Latter-day Saints and will not show for a new account. The Source Linker map links appear on a record-attachment page (Research Help → a record hint → Review and Attach).

The extension makes no request of its own; the only network activity is the search the user opens, the geocoder lookup on a map click, and the embedded Google map.
```

---

## After approval

- The store copy has a NEW extension id: settings and the source cache start fresh, and anyone running
  the Load-unpacked copy must remove it first (two copies both inject rows and fight over the native rows).
- `"homepage_url"` (the help page) is in the manifest since 1.0.3. Add the listing URL to the README's
  Install section and to the help page's Install section (`docs/index.html`), and take the zip off the
  GitHub Release — the early-access install route ends when the store copy exists.
- Every update is re-reviewed: bump the version, run `build-store-zip.ps1`, Package tab → upload → submit.
  Bundle fixes rather than shipping each patch.
