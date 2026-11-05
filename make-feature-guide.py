# -*- coding: utf-8 -*-
"""Builds the take-home feature guide for the Search Enhancer for FamilySearch.

Run from the repo root:  python make-feature-guide.py
Needs: pip install reportlab   (fonts: Segoe UI, Segoe UI Symbol, Segoe UI Emoji from the Windows Fonts folder)
Update VERSION below and the text when features change, then re-run.
"""
import os, sys
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                Image, KeepTogether, PageBreak, CondPageBreak)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "docs", "feature-guide.pdf")  # served by GitHub Pages
ICONS = os.path.join(HERE, "familysearch-search-enhancer", "icons")
VERSION = "1.0.3"

# ---------- fonts ----------
F = r"C:\Windows\Fonts"
pdfmetrics.registerFont(TTFont("Seg", os.path.join(F, "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("Seg-B", os.path.join(F, "segoeuib.ttf")))
pdfmetrics.registerFont(TTFont("Seg-I", os.path.join(F, "segoeuii.ttf")))
pdfmetrics.registerFont(TTFont("Seg-BI", os.path.join(F, "segoeuiz.ttf")))
pdfmetrics.registerFont(TTFont("Seg-SB", os.path.join(F, "seguisb.ttf")))
pdfmetrics.registerFont(TTFont("Sym", os.path.join(F, "seguisym.ttf")))
pdfmetrics.registerFont(TTFont("Emj", os.path.join(F, "seguiemj.ttf")))
pdfmetrics.registerFontFamily("Seg", normal="Seg", bold="Seg-B", italic="Seg-I", boldItalic="Seg-BI")

NAVY = colors.HexColor("#1f3a5f")
INK = colors.HexColor("#1b1b1b")
MUTED = colors.HexColor("#5a6270")
RULE = colors.HexColor("#c9d2de")
BAND = colors.HexColor("#eef3f8")
TINT = colors.HexColor("#f6f8fb")

def sym(s):
    return '<font name="Sym">%s</font>' % s

TRI = sym("\u25b8")       # ▸
CHECK = sym("\u2713")     # ✓
PIN = sym("\U0001F4CD")   # 📍

# ---------- styles ----------
body = ParagraphStyle("body", fontName="Seg", fontSize=9.1, leading=11.7, textColor=INK, alignment=TA_LEFT)
small = ParagraphStyle("small", parent=body, fontSize=8.4, leading=10.8, textColor=MUTED)
h1 = ParagraphStyle("h1", parent=body, fontName="Seg-B", fontSize=20, leading=24, textColor=NAVY)
sub = ParagraphStyle("sub", parent=body, fontSize=10, leading=13, textColor=MUTED)
h2 = ParagraphStyle("h2", parent=body, fontName="Seg-B", fontSize=13, leading=16, textColor=NAVY,
                    spaceBefore=11, spaceAfter=4)
h3 = ParagraphStyle("h3", parent=body, fontName="Seg-SB", fontSize=10.6, leading=13.5, textColor=NAVY,
                    spaceBefore=7, spaceAfter=2)
b1 = ParagraphStyle("b1", parent=body, leftIndent=14, bulletIndent=3, spaceAfter=1.6)
b2 = ParagraphStyle("b2", parent=body, leftIndent=28, bulletIndent=16, spaceAfter=1.2, fontSize=8.9, leading=11.2)
cell = ParagraphStyle("cell", parent=body, fontSize=8.7, leading=11)
cellh = ParagraphStyle("cellh", parent=cell, fontName="Seg-B", textColor=NAVY)

def P(t, st=body):
    return Paragraph(t, st)

def bullets(items, level=1):
    st = b1 if level == 1 else b2
    mark = "\u2022" if level == 1 else "\u2013"
    out = []
    for it in items:
        if isinstance(it, (list, tuple)):
            out.extend(bullets(it, level + 1))
        else:
            out.append(Paragraph(it, st, bulletText=mark))
    return out

def icon(name, size=13):
    path = os.path.join(ICONS, name)
    return '<img src="%s" width="%d" height="%d" valign="-2"/>&nbsp;' % (path, size, size)

def heading(text, iconfile=None):
    return P((icon(iconfile, 14) if iconfile else "") + text, h3)

def block(head, items):
    """A sub-heading kept on the same page as its first two bullets."""
    bl = bullets(items)
    return [KeepTogether([head] + bl[:2])] + bl[2:]

def section(text):
    return [CondPageBreak(1.3 * inch), P(text, h2)]

def rule():
    t = Table([[""]], colWidths=[7.1 * inch], rowHeights=[2])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, RULE)]))
    return t

# ---------- page furniture ----------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *a, **k):
        canvas.Canvas.__init__(self, *a, **k)
        self._saved = []
    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        n = len(self._saved)
        for st in self._saved:
            self.__dict__.update(st)
            self.draw_footer(n)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)
    def draw_footer(self, n):
        w, h = letter
        self.setStrokeColor(RULE); self.setLineWidth(0.5)
        self.line(0.7 * inch, 0.6 * inch, w - 0.7 * inch, 0.6 * inch)
        self.setFont("Seg", 7.8); self.setFillColor(MUTED)
        self.drawString(0.7 * inch, 0.43 * inch,
                        "Search Enhancer for FamilySearch \u00b7 Feature Guide \u00b7 unofficial, not affiliated with or endorsed by FamilySearch International")
        self.drawRightString(w - 0.7 * inch, 0.43 * inch, "Page %d of %d" % (self._pageNumber, n))

# ---------- content ----------
story = []

title_img = Image(os.path.join(ICONS, "icon128.png"), 0.62 * inch, 0.62 * inch)
title_txt = [P("Search Enhancer for FamilySearch", h1),
             P("A Chrome extension that adds pre-filled record searches to a FamilySearch person page "
               "\u00b7 reference sheet for version %s, November 2026" % VERSION, sub)]
t = Table([[title_img, title_txt]], colWidths=[0.8 * inch, 6.3 * inch])
t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
story += [t, rule(), Spacer(1, 6)]

# --- What it is
story += section("What it is")
story += bullets([
    "On a FamilySearch person page the native <b>Search Records</b> panel lists a handful of sites. The extension "
    "adds <b>ten rows</b> to that panel \u2014 four of them in place of the native <i>FamilySearch</i>, <i>Ancestry</i>, "
    "<i>MyHeritage</i> and <i>Findmypast</i> rows, whose own searches live on as the first entry of each menu \u2014 every "
    "entry opening a search already <b>filled in</b> with the person\u2019s details.",
    "Every search is built from the page you are looking at: name, sex, birth / christening / death / burial year and place, "
    "spouses and marriage dates, parents, and dated residences under <i>Other Information</i>.",
    "The lists are <b>content-aware</b>: a search appears only when its collection actually covers the person\u2019s years and places. "
    "A woman is searched under her maiden name before her marriage and each married name after it.",
    "It runs entirely in your own browser. It reads only the page you have open and makes no request of its own: the only "
    "things that ever leave the browser are the search you click, the place name sent to OpenStreetMap\u2019s geocoder when you "
    "click a map link, and Google\u2019s embedded map on the map page. Nothing is collected, and nothing in your tree is ever changed.",
    "Beyond the Search Records panel it also adds <b>map pins</b> after every place on the person page and the Sources tab, "
    "place-comparison links on the <b>Source Linker</b>, a numeric <b>Quality Score</b> tooltip, and (for church members) "
    "four links in the <b>Temple</b> menu \u2014 see the last page. A <b>settings page</b> switches any of it off.",
])

# --- Getting started
story += section("Getting started")
story += bullets([
    "<b>Install:</b> from the Chrome Web Store once its listing is live (<b>Add to Chrome</b>). Until then, download the zip "
    "from the project\u2019s help page \u2014 <b>familyhistorytoolsmith.github.io/search-enhancer-for-familysearch</b> \u2014 unzip it "
    "to a folder you will keep, open <b>chrome://extensions</b>, switch on <b>Developer mode</b>, click <b>Load unpacked</b> and "
    "pick that folder; the help page has the step-by-step version. Never run both copies at once.",
    "Sign in to FamilySearch and open any person page. The new rows appear in the <b>Search Records</b> panel once the "
    "person\u2019s details have rendered.",
    "On FamilySearch\u2019s new <b>Labs</b> person page (the one with the \u201cOpt-Out of Experiment\u201d button), "
    "<i>Search Records</i> is a button in the header: click it and the extra rows appear inside its dropdown about a third of a second later.",
    "<b>Settings:</b> click the extension\u2019s toolbar icon (Chrome parks a new icon behind the puzzle-piece menu until you "
    "pin it). Every feature can be switched off there \u2014 switch a site\u2019s menu off and FamilySearch\u2019s own row for "
    "that site comes back \u2014 and the Ancestry / Findmypast links can be pointed at your own regional site.",
    "<b>Updating:</b> the store copy updates itself. If rows ever look odd after an update, refresh the FamilySearch page. "
    "A source copy is updated by replacing the folder, clicking the reload arrow on its card at chrome://extensions, then "
    "refreshing the page.",
])

# --- Reading the menus
story += section("Using the rows")
story += bullets([
    "A row ending in <b>%s</b> is a menu: click it to expand a list of searches, grouped under headers such as CENSUS, BIRTH, MARRIAGE. "
    "Click an entry to open that search in a new tab." % TRI,
    "<b>Hover</b> any row or entry for a tooltip that says exactly which collection, name and years a click will use.",
    "<b>Shift+click</b> an entry to search with the <b>first given name only</b> (\u201cDoris\u201d rather than \u201cDoris Annie\u201d, "
    "the way many indexes record people).",
    "<b>Already attached:</b> searches whose collection is already attached to the person are dimmed and ticked %s "
    "(never hidden \u2014 they stay clickable). On the classic page this switches on once you have opened the person\u2019s "
    "<b>Sources</b> tab; on the Labs page it is automatic." % CHECK,
    "Rows for FreeBMD, GRO, ScotlandsPeople, RootsIreland and IrishGenealogy appear <b>only</b> for people with events in "
    "that country, so different people show different rows.",
    "GRO and FreeBMD searches each reuse <b>one tab</b>, so a long session does not pile up tabs.",
])

# --- Quick map table
story += [PageBreak()]
story += section("The ten rows at a glance")
rows = [
    ["Row", "Shown for", "What it opens"],
    ["FamilySearch " + TRI, "everyone (in place of the native FamilySearch row)",
     "FamilySearch\u2019s own search for the person, then every collection search that fits: censuses, birth / marriage / "
     "death indexes, passenger lists, military records, full-text search, all collections"],
    ["Ancestry " + TRI, "everyone (in place of the native Ancestry row)",
     "Ancestry\u2019s own search for the person, then its global search per country the person\u2019s events touch, "
     "the censuses, civil and parish records, and Public Member Trees"],
    ["MyHeritage " + TRI, "everyone (in place of the native MyHeritage row)",
     "MyHeritage\u2019s own search for the person, then its all-records search per country, the US, Canadian, E&amp;W and "
     "Scottish censuses, and its Family Trees"],
    ["Findmypast " + TRI, "everyone (in place of the native Findmypast row)",
     "Findmypast\u2019s own search for the person, then all records per country, the censuses (the 1921 E&amp;W images, the "
     "1939 Register, US and Canadian), civil deaths and parish records"],
    [icon("freebmd32.png") + "FreeBMD " + TRI, "England &amp; Wales events from 1837",
     "Free searches of the E&amp;W civil birth / marriage / death indexes, form filled and submitted for you"],
    [icon("gro32.png") + "GRO Index " + TRI, "E&amp;W births or deaths the GRO online index covers",
     "The General Register Office\u2019s own indexes (mother\u2019s maiden name back to 1837, age at death), free account needed"],
    [icon("sp32.png") + "ScotlandsPeople " + TRI, "Scottish events",
     "Statutory registers, Old Parish Registers and the 1841\u20131921 censuses, form filled and submitted for you"],
    [icon("ri32.png") + "RootsIreland " + TRI, "Irish events",
     "County-centre and all-Ireland quick searches of the Irish genealogy centres\u2019 transcripts"],
    [icon("ig32.png") + "IrishGenealogy " + TRI, "Irish events",
     "Ireland\u2019s free official civil indexes (with register images) and church registers"],
    [icon("news32.png") + "Newspapers " + TRI, "everyone",
     "Newspapers.com, OldNews, GenealogyBank, Chronicling America, Findmypast newspapers, Trove, Papers Past \u2014 by region"],
]
data = [[P(c, cellh) for c in rows[0]]] + [[P(c, cell) for c in r] for r in rows[1:]]
tbl = Table(data, colWidths=[1.75 * inch, 1.55 * inch, 3.8 * inch], repeatRows=1)
tbl.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), BAND),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, TINT]),
    ("LINEBELOW", (0, 0), (-1, 0), 0.8, RULE),
    ("LINEBELOW", (0, 1), (-1, -1), 0.3, RULE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
]))
story += [tbl]

# ================= page 2: FamilySearch Collections =================
story += section("FamilySearch " + TRI + " in detail")
story += [P("The menu is rebuilt from the person every time it opens. Its groups, in order:", body), Spacer(1, 3)]
story += bullets([
    "<b>CENSUS</b> \u2014 one entry per census year and country inside the life span, named for the census itself "
    "and followed by the person\u2019s name under the surname of that year (<i>1901 E&amp;W Census \u2014 Doris Annie Hiscocks</i>, "
    "<i>1900 US Federal Census \u2014 \u2026</i>, <i>1905 New York State Census</i>) \u2014 the wording every other menu uses for a census. "
    "A country is offered for a year only when the life events on either side of that year put the person there: born and "
    "married in England, died in Canada, means English censuses until the marriage and both countries after it. "
    "Covers England &amp; Wales, Scotland, Ireland, Canada and the United States, with state censuses for New York, "
    "Massachusetts and the Prairie Provinces. The lost 1890 US census is never offered.",
    "<b>BIRTH</b> \u2014 the civil index for the birth year (<i>E&amp;W GRO Birth Index</i>, Ireland civil, state registers for "
    "Ontario, British Columbia, Massachusetts) and/or the country\u2019s births &amp; christenings collection. A pre-1837 "
    "English birth gets the parish entry only. Christening year and place stand in when the birth is unknown.",
    "<b>MARRIAGE</b> \u2014 one entry per marriage. A dated marriage is searched at that year \u00b12 in the index that covers "
    "it, with the spouse\u2019s surname added where the index records spouses (GRO from 1912), and a parish / church "
    "marriage collection alongside where one exists. A spouse without a date gets an inferred window (age 18\u201330). "
    "A person with no spouse on the page still gets one search of that window, in case the marriage is what the tree is missing.",
    "<b>MIGRATION</b> \u2014 when two consecutive dated events are in different countries, the years between them are searched "
    "in the passenger lists of both ends: <i>UK outgoing passenger lists</i>, <i>New York passenger lists</i>, "
    "<i>Ellis Island arrivals</i>, <i>Canada passenger lists</i>, <i>US border crossings from Canada</i>.",
    "<b>MILITARY</b> \u2014 for men of the right age who were in the country at the time: <i>US WWI draft cards 1917\u20131918</i>, "
    "<i>US WWII draft cards 1942</i>, <i>UK WWI service records</i>, and state WWII cards for Pennsylvania and New York City.",
    "<b>DEATH</b> \u2014 the civil index for the death year (<i>E&amp;W GRO Death Index</i>, <i>US Social Security Death Index</i>, "
    "Ireland civil, Scotland and England recent death records), the US <i>NUMIDENT</i> files for a 1936\u20132007 death, the "
    "<i>E&amp;W probate calendar</i> for 1858\u20131957, the parish burial collection with the burial place, and <i>Find A Grave</i>. "
    "A married woman gets one entry per married surname. A person marked <b>Living</b> gets no death searches at all. "
    "A person with <b>no death date</b> is searched over the years they could have died \u2014 from the last year the page "
    "shows them alive (a dated residence, a marriage, an attached census or 1939 Register) to age 100 \u2014 in every index "
    "that window reaches; FreeBMD, GRO, ScotlandsPeople and Findmypast do the same.",
    "<b>FULL TEXT SEARCH (AI-indexed records)</b> \u2014 FamilySearch\u2019s fast-growing full-text collections (probate, deeds, "
    "court and police records\u2026). The exact phrase <i>\u201cGiven Surname\u201d</i> is searched within the life span (plus two "
    "years for probate); a woman also gets each married name; one entry per spouse adds the spouse\u2019s first name to find "
    "records naming the couple; and <i>Simple search</i> runs the same name-plus-ID query as FamilySearch\u2019s own Full Text entry.",
    "<b>EVERYTHING</b> \u2014 <i>Indexed Historical Records</i>, FamilySearch\u2019s own search for the person exactly as its "
    "standard row ran it, then the unfiltered <i>All collections</i> search by maiden name, birth year \u00b12 and birthplace.",
])
story += block(heading("Small things that make the searches better"), [
    "Each FamilySearch collection search carries the person\u2019s tree ID, so the results page shows the "
    "<b>\u201cPerson From FamilySearch Tree\u201d</b> banner with their name, lifespan and ID.",
    "<b>Parents\u2019 names</b> are sent to every collection that indexes parents (parish christenings, NUMIDENT, All collections) "
    "\u2014 a father\u2019s name is the strongest discriminator for a common name. Civil indexes never get them, because "
    "FamilySearch ranks rather than filters and an un-indexed field would only bury the right record.",
    "<b>No place is sent to a civil-registration index</b> for the same reason: those indexes file by registration district, "
    "not by town. Censuses, christenings and All collections do get the birthplace.",
    "<b>Spellings from your own sources:</b> once the Sources tab has been read, a surname your attached records are actually "
    "indexed under (Edward <i>Cummings</i> whose records say <i>Cummins</i>) gets its own full-text and All-collections entries.",
    "<b>Other Information counts:</b> dated residences, immigration, emigration, naturalization and military service join the "
    "timeline, so a 1912 Calgary immigration drops the 1921 England census and narrows the passenger-list window.",
    "An empty result is not proof of absence: several collections (the Australian aggregates, the US births 1867\u20131931) "
    "index selected localities only.",
])

# ================= page 3: the other menus =================
story += section("The other search menus")

story += block(heading("Ancestry " + TRI), [
    "<b>All Collections</b> \u2014 Ancestry\u2019s own search for the person, exactly as the native Ancestry row (which this menu "
    "takes the place of) ran it. Then one entry per country the person\u2019s events touch (birth, christening, marriages, "
    "residences, death, burial), birth country first: Ancestry\u2019s global search restricted to that country, with name, "
    "birth / death years and gender filled in; a married woman gets maiden plus each married surname in every block.",
    "<b>Census</b> \u2014 one entry per census year the person\u2019s places bracket, in Ancestry\u2019s own collection for it "
    "(US federal 1790\u20131950, England and Wales 1841\u20131921 as separate sets, the 1939 Register, Scotland, Canada and "
    "the Prairie Provinces, the 1901 Irish census, the New York state censuses).",
    "<b>Civil records</b> \u2014 the civil indexes of the person\u2019s countries (E&amp;W births, marriages, deaths and probate; "
    "Ireland; the US Social Security Death Index; Australia and Victoria; Ontario, British Columbia, Nova Scotia). "
    "<b>Parish records</b> \u2014 the England and Scotland church-register sets: baptisms with the parents, marriages with the "
    "spouse, burials per married surname.",
    "<b>Public Member Trees</b> \u2014 other members\u2019 trees, by name and birth / death years. Viewing records needs an "
    "Ancestry subscription; the settings page can point every link at your regional Ancestry site.",
])
story += block(heading("MyHeritage " + TRI), [
    "<b>All Collections</b> \u2014 MyHeritage\u2019s own search for the person, as the native MyHeritage row ran it. Then the "
    "<b>all-records</b> search scoped to each country the person\u2019s events touch (name, birth and death years, gender; "
    "maiden and married-name entries for a married woman) \u2014 the country is sent as a place, so MyHeritage keeps the "
    "search within it instead of searching the whole world.",
    "<b>Census</b> \u2014 the US federal censuses 1850\u20131950, Canada 1851\u20131931, England &amp; Wales 1841\u20131911 with "
    "the 1939 Register, and Scotland 1841\u20131901, one entry per year the person\u2019s places bracket, within MyHeritage\u2019s "
    "collection for that census.",
    "<b>Family Trees</b> \u2014 other members\u2019 trees (the Smart Matches well, strong on European trees).",
])
story += block(heading("Findmypast " + TRI), [
    "<b>All Collections</b> \u2014 Findmypast\u2019s own search for the person, as the native Findmypast row ran it. Then "
    "<b>all records</b> per country the person\u2019s events touch (name with first-name variants, birth and death years "
    "\u00b12, the country in Findmypast\u2019s Where box). GRO indexes, newspapers and Scottish records stay with their own menus.",
    "<b>Census</b> \u2014 the <b>1921 England &amp; Wales census</b> (Findmypast has the images; FamilySearch only an index), "
    "the <b>1939 Register</b>, E&amp;W 1841\u20131911, Irish 1901 / 1911, the US federal censuses 1850\u20131940 and Canada "
    "1851\u20131931, one per year the person\u2019s places bracket.",
    "<b>Civil deaths &amp; burials</b> \u2014 the E&amp;W death index, which carries the age at death: year of death \u00b12 "
    "(or the inferred window when the tree has no death year) with the birth year \u00b12 as the discriminator. "
    "<b>Parish records</b> \u2014 baptisms with the parents\u2019 names sent, marriages with the spouse, burials per married surname.",
    "Every entry opens findmypast.com unless the settings page points it at .co.uk, .ie or .com.au.",
])
story += block(heading("FreeBMD " + TRI + " \u2014 England &amp; Wales civil indexes, free, no login", "freebmd32.png"), [
    "<b>Births</b> (year \u00b12; the mother\u2019s maiden name is added for births after September 1911, when the index records it), "
    "<b>Marriages</b> (one per spouse, the spouse\u2019s surname always sent \u2014 FreeBMD pairs spouses in every year), "
    "<b>Deaths</b> (one per married surname, with FreeBMD\u2019s <i>Death age/DoB</i> box filled with the birth year \u00b11, so "
    "only the deaths of someone born about then come back; a person with no death year gets one search from the last year they "
    "are known alive to age 100).",
    "FreeBMD has no search links, so the extension opens FreeBMD\u2019s own form, fills it in and presses <b>Find</b> for you. "
    "Second forenames are sent as initials (\u201cDoris A\u201d), which matches both full-name and initial-only index entries.",
])
story += block(heading("GRO Index " + TRI + " \u2014 the General Register Office\u2019s own indexes, free account", "gro32.png"), [
    "Covers births 1837\u20131934 and 1984\u20132024, deaths 1837\u20131957 and 1984\u20132024; the gap years were never digitised "
    "and marriages are not online (use FreeBMD). The row appears only when a birth or death falls in the covered years.",
    "<b>Births</b> send the <b>mother\u2019s maiden name</b> whenever the tree knows her \u2014 GRO indexes it back to 1837, FreeBMD only "
    "from 1911. <b>Deaths</b> send the <b>age at death</b> \u00b12 (indexed from 1866), one entry per married surname; with no "
    "death year in the tree, a ladder of 5-year blocks from the last year known alive to age 100, each with the matching age.",
    "Each entry opens GRO\u2019s form pre-filled and presses Search. If GRO shows its login page instead, sign in \u2014 the search "
    "then finishes itself.",
])
story += block(heading("ScotlandsPeople " + TRI + " \u2014 free login for index results; images cost credits", "sp32.png"), [
    "<b>Statutory registers</b> 1855+ (births and deaths send the mother\u2019s maiden surname, deaths the age \u00b110, marriages the "
    "spouse), <b>Old Parish Registers</b> 1553\u20131854 (both tiers when a window straddles 1855), and the "
    "<b>censuses 1841\u20131921</b> \u2014 including 1911 and 1921, which FamilySearch does not have.",
    "Each entry opens the right ScotlandsPeople search page; the extension fills the form and submits it (sign in first, or "
    "sign in when asked and the search completes). Name matching is left at SP\u2019s exact default \u2014 switch the surname to "
    "phonetic on SP\u2019s form when a search comes up empty.",
])
story += block(heading("RootsIreland " + TRI + " \u2014 free counts, subscription to open records", "ri32.png"), [
    "One pair of entries per Irish life event: the <b>county centre</b>\u2019s search (when the place names a county) and the "
    "<b>all-Ireland</b> search, filled with first name, surname and the event year (the site searches \u00b15).",
    "Covers the county genealogy centres\u2019 transcripts: baptisms, marriages, burials, census, gravestones, Griffith\u2019s Valuation.",
])
story += block(heading("IrishGenealogy " + TRI + " \u2014 Ireland\u2019s free official records site", "ig32.png"), [
    "<b>Civil register indexes with free images of the actual registers</b> (births 1864+, marriages 1845+, deaths 1864+, within "
    "the rolling 100 / 75 / 50-year release rules); the mother\u2019s maiden surname is sent on births.",
    "<b>Church registers</b> of selected dioceses (Dublin, Kerry, Cork &amp; Ross and others) \u2014 partial coverage, so absence proves nothing.",
])
story += block(heading("Newspapers " + TRI + " \u2014 grouped by region, only for countries the person touched", "news32.png"), [
    "<b>Worldwide:</b> Newspapers.com, OldNews (MyHeritage). <b>United States:</b> GenealogyBank, the free Chronicling America "
    "(to 1963). <b>UK &amp; Ireland:</b> Findmypast\u2019s British &amp; Irish newspapers. <b>Australia:</b> the free Trove. "
    "<b>New Zealand:</b> the free Papers Past.",
    "Each search uses the first name and surname as an exact phrase with the life span (birth to death + 2) as the date window (Findmypast is sent the birth and death years instead); "
    "a married woman gets one entry per name, the married ones starting at that marriage\u2019s year.",
])

# ================= page 4: beyond the panel =================
story += [PageBreak()]
story += section("Beyond the Search Records panel")

story += block(heading("Source Linker: compare two places on a map"), [
    "When you attach a record, the linker shows the record\u2019s facts on the left and the tree\u2019s on the right. A "
    "<b>%s compare</b> link follows every place that has a partner of the same kind of fact on the other side \u2014 a census "
    "against the residence of the same year, a birth against a birth \u2014 never a census against a death." % PIN,
    "Click it and a page opens with <b>Google\u2019s embedded directions map</b>: a lettered pin on each place (A = the record\u2019s, "
    "B = the tree\u2019s), the driving route, and a header naming both places with the straight-line distance in miles and km. "
    "Shift+click goes straight to the route on the Google Maps website.",
    "Before opening the map the extension <b>locates both places</b> with OpenStreetMap\u2019s free geocoder, so a duplicated "
    "name (there are two Kingswoods in Gloucestershire) resolves to the pair nearest each other. The link then shows the "
    "distance itself (<b>%s 1.1 mi</b>); hover it for the details, including a note when a name matched several places." % PIN,
    "A place without a partner gets a <b>%s map</b> link that drops a single pin. Two names that turn out to be one place "
    "read <b>%s same place</b>; a place inside a region the other side names (<i>Pennsylvania</i> against <i>Coalmont, "
    "Huntingdon, Pennsylvania</i>) reads <b>%s in Pennsylvania</b>. Every click reuses one map tab." % (PIN, PIN, PIN),
])

story += block(heading("Map pins on the person page and the Sources tab"), [
    "A <b>%s map</b> link follows every place on the person page \u2014 the birth, christening, death and burial places, each "
    "marriage place, the residences and other facts under <i>Other Information</i> \u2014 and every place field of an expanded "
    "record on the Sources tab. Click it and Google Maps opens pinned on that place." % PIN,
    "The place is located first with OpenStreetMap\u2019s free geocoder (only on the click; a namesake is settled by the other "
    "places on the page). A country, state or county opens <b>framed</b> \u2014 the map fitted to the region with its boundary "
    "drawn \u2014 rather than pinned at its centre. A 1940 census\u2019s \u201cSame Place\u201d points at the record\u2019s own event place.",
])

story += block(heading("Quality Score: the number behind the badge"), [
    "FamilySearch shows a person\u2019s Data Quality Score as a word (Low / Medium / High). <b>Hover the badge</b> and a tooltip "
    "shows the number on a 0\u2013100 scale with one decimal, the thresholds "
    "(Low &lt;40 \u00b7 Medium 40\u201384.9 \u00b7 High \u226585), the birth segment FamilySearch scored the person under "
    "(<i>Scored as: United Kingdom 1800 \u2013 1920</i>), and a <b>\u201cTo reach High:\u201d</b> list.",
    "Each outstanding item becomes an action, biggest gain first, with the score that fix alone would give \u2014 "
    "<i>Add a burial \u2192 85.1</i>, <i>Add the month to the 1985 death \u2192 79.5</i> \u2014 so you can see which one is worth doing.",
    "The number is read from the response the page itself fetches to draw the badge; the extension makes no request of its own. "
    "A High person with nothing left reads \u201cNothing outstanding.\u201d",
])

story += block(heading("Temple menu links (signed-in church members only)"), [
    "Four links are added after <i>Ordinances Ready</i> in the top-level <b>Temple</b> menu on every FamilySearch page, each "
    "opening its FamilySearch page in the same tab like the native items:",
    ["<b>Temple Opportunities</b> \u2014 search your family tree for ancestors with temple ordinances ready to reserve and take "
     "to the temple; priority is given to close relatives first.",
     "<b>Family Ordinance Opportunities</b> \u2014 display the Blue Fan Chart and quickly find available ordinances for descendants "
     "of your ancestors.",
     "<b>Remaining Temple Ordinances</b> \u2014 find additional temple ordinances for people you have already helped, from your "
     "Completed temple ordinances list.",
     "<b>Families with Remaining Ordinances</b> \u2014 a FamilySearch Labs experiment: families with someone on your Completed "
     "list whose other members still need ordinances. While the experiment is off for your account, the click first offers to "
     "turn it on through FamilySearch\u2019s own Labs page; Shift+click opens the Labs page."],
    "Accounts without a Temple menu are unaffected.",
])

story += section("Good to know")
story += bullets([
    "<b>Accounts and costs.</b> Free with no login: FreeBMD, IrishGenealogy, Chronicling America, Trove, Papers Past, FamilySearch itself. "
    "Free account: GRO, ScotlandsPeople (index results; images cost credits). Subscription to view records: Ancestry, "
    "MyHeritage, Findmypast, Newspapers.com, GenealogyBank, RootsIreland (its counts are free).",
    "<b>Both FamilySearch person pages</b> are supported \u2014 the classic page and the new Labs page \u2014 and the rows follow "
    "FamilySearch\u2019s own styling, so they look native.",
    "<b>The searches are suggestions.</b> Attaching a record is still your decision on the results page; the extension never "
    "writes to your tree.",
    "<b>Living people</b> get no death or burial searches. Data stays in your browser; the only things kept are your "
    "settings, the attached-source titles per person (so the %s marks work), a session-only cache of located places, and "
    "optionally a Google map key you choose to enter." % CHECK,
    "<b>Something odd?</b> Refresh the page first. If a search opens the wrong site or unfilled form, note the person and the "
    "entry you clicked \u2014 the tooltip text says exactly what was sent, which is what is needed to fix it.",
])

doc = SimpleDocTemplate(OUT, pagesize=letter, leftMargin=0.7 * inch, rightMargin=0.7 * inch,
                        topMargin=0.6 * inch, bottomMargin=0.8 * inch,
                        title="Search Enhancer for FamilySearch \u2014 Feature Guide",
                        author="Kevin", subject="Reference sheet for the Search Enhancer for FamilySearch Chrome extension")
doc.build(story, canvasmaker=NumberedCanvas)
print("wrote", OUT)
