// map.test.js — the two-pin map page's pure parts (v0.2.86–87): hash parameters, the
// straight-line distance, and the Google URLs — the keyless directions embed (Google's own
// redirect target for maps?saddr=…&daddr=…&output=embed), the Maps Embed API form, the route
// and pin links. Run: node tests/run.js map
const path = require("path");
const M = require(path.join(__dirname, "..", "src", "map.js"));

let fails = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra == null ? "" : "\n      → " + extra}`);
  if (!cond) fails++;
};

const KW = { lat: 51.4605, lon: -2.5044 }; // Kingswood, South Gloucestershire
const WM = { lat: 51.4586, lon: -2.479 }; // Warmley
const SH = { lat: 52.71215, lon: -2.75897 }; // Shrewsbury (the v0.2.82 86-mile miss)

const p = M.parseParams("#a=51.46050%2C-2.50440&al=Kingswood%2C+South+Gloucestershire&at=Kingswood%2C+Gloucestershire&b=51.45860%2C-2.47900&bl=Warmley%2C+South+Gloucestershire&bt=Warmley%2C+Gloucestershire%2C+England%2C+United+Kingdom");
check("parseParams reads both points with labels and texts", p && p.a.lat === 51.4605 && p.a.lon === -2.5044 && p.a.label === "Kingswood, South Gloucestershire" && p.a.text === "Kingswood, Gloucestershire" && p.b.lat === 51.4586 && p.b.text === "Warmley, Gloucestershire, England, United Kingdom", JSON.stringify(p));
check("parseParams: missing or bad coordinates → null", M.parseParams("#a=51.46,-2.50") === null && M.parseParams("#a=x,y&b=1,2") === null && M.parseParams("#a=95,0&b=1,2") === null && M.parseParams("") === null);
check("parseParams: label defaults to the coordinates", M.parseParams("#a=1,2&b=3,4").a.label === "1, 2");
check("haversineMiles: Kingswood ↔ Warmley ≈ 1.1 mi; ↔ Shrewsbury ≈ 87 mi", Math.abs(M.haversineMiles(KW, WM) - 1.1) < 0.15 && Math.abs(M.haversineMiles(KW, SH) - 87) < 2);
check("fmtMiles / fmtKm", M.fmtMiles(1.09) === "1.1 mi" && M.fmtMiles(86.6) === "87 mi" && M.fmtKm(1.09) === "1.8 km" && M.fmtKm(86.6) === "139 km");
check("embedUrl without a key = Google's own redirect target for the legacy saddr/daddr embed (probed 2026-09-15)",
  M.embedUrl(KW, WM, "") === "https://www.google.com/maps/embed?origin=mfe&pb=!1m9!4m8!4m3!3m2!1d51.46050!2d-2.50440!4m3!3m2!1d51.45860!2d-2.47900", M.embedUrl(KW, WM, ""));
check("embedUrl with a key = the Maps Embed API directions mode, driving, imperial, key encoded",
  M.embedUrl(KW, WM, "AIza/x+y") === "https://www.google.com/maps/embed/v1/directions?key=AIza%2Fx%2By&origin=51.46050,-2.50440&destination=51.45860,-2.47900&mode=driving&units=imperial");
check("googleRoute / googlePin byte-exact", M.googleRoute(KW, WM) === "https://www.google.com/maps/dir/?api=1&origin=51.46050,-2.50440&destination=51.45860,-2.47900&travelmode=driving" && M.googlePin(WM) === "https://www.google.com/maps/search/?api=1&query=51.45860,-2.47900");
check("the key lives under one storage name", M.KEY_STORE === "fsse.mapsKey");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
