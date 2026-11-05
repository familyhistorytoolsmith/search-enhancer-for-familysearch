// run.js — runs every tests/*.test.js in its own node process (each suite stubs globalThis.FSSE /
// document / location differently) after a syntax check of src/*.js. Exit code 1 on any failure.
//   node tests/run.js            all suites, PASS lines hidden
//   node tests/run.js -v         all suites, every line
//   node tests/run.js options    only suites whose file name contains "options"
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const args = process.argv.slice(2);
const verbose = args.includes("-v");
const filter = args.filter((a) => a !== "-v");

let failed = 0;
const step = (label, ok, out) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failed++;
  if (out && (!ok || verbose)) console.log(out.replace(/^/gm, "     "));
};

// 1. Syntax check every content script.
for (const f of fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".js")).sort()) {
  const r = spawnSync(process.execPath, ["--check", path.join(root, "src", f)], { encoding: "utf8" });
  step(`syntax  src/${f}`, r.status === 0, r.stderr);
}

// 2. The manifest must parse and name every content script that exists — and (v0.2.133) the
//    settings page it opens as the toolbar popup / options page, its icons, and every
//    web-accessible resource named outright.
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const listed = manifest.content_scripts.flatMap((cs) => cs.js);
  const pages = [
    manifest.options_ui && manifest.options_ui.page,
    manifest.action && manifest.action.default_popup,
    ...Object.values((manifest.action && manifest.action.default_icon) || {}),
    ...Object.values(manifest.icons || {}),
    ...(manifest.web_accessible_resources || []).flatMap((w) => w.resources).filter((r) => !/[*]/.test(r)),
  ].filter(Boolean);
  const missing = [...listed, ...pages].filter((f) => !fs.existsSync(path.join(root, f)));
  const shape = [];
  if (!(manifest.options_ui && manifest.action && manifest.action.default_popup === manifest.options_ui.page)) shape.push("action.default_popup and options_ui.page must both name the settings page");
  // v1.0.0 (store build): dqs-listen.js is a static content script in world: "MAIN" — a Chrome 111
  // manifest feature; checkVisibility needs 105. Without the floor an older Chrome installs a
  // build whose Quality Score tooltip silently never works.
  if (!(parseInt(manifest.minimum_chrome_version, 10) >= 111)) shape.push('minimum_chrome_version must be "111" or later');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) shape.push("version must be three dotted integers (the store compares them numerically)");
  step(`manifest v${manifest.version} (${listed.length} scripts, ${pages.length} pages/icons, Chrome ≥ ${manifest.minimum_chrome_version})`, missing.length === 0 && !shape.length, missing.length ? `missing: ${missing.join(", ")}` : shape.join("; "));
} catch (err) {
  step("manifest", false, String(err));
}
// Informational: which build this is. The store build script (build-store-zip.ps1) refuses DEBUG true.
{
  const debugOn = /FSSE\.DEBUG\s*=\s*true\b/.test(fs.readFileSync(path.join(root, "src", "inject.js"), "utf8"));
  console.log(`info FSSE.DEBUG = ${debugOn} (${debugOn ? "dev build — the store build script refuses it" : "release build"})`);
}

// 3. Each suite.
const suites = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith(".test.js") && (!filter.length || filter.some((x) => f.includes(x))))
  .sort();
for (const f of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: "utf8", cwd: root });
  const out = (r.stdout || "") + (r.stderr || "");
  const passes = (out.match(/^PASS /gm) || []).length;
  const fails = (out.match(/^FAIL /gm) || []).length;
  const shown = verbose ? out : out.split("\n").filter((l) => !/^PASS /.test(l) && !/^\s*('|\]|\[)/.test(l)).join("\n");
  step(`suite   tests/${f}  (${passes} pass, ${fails} fail)`, r.status === 0 && fails === 0, shown.trim());
}

console.log(failed ? `\n${failed} step(s) FAILED` : "\nALL GREEN");
process.exit(failed ? 1 : 0);
