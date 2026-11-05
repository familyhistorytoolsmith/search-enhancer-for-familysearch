<#
build-store-zip.ps1 — builds the Chrome Web Store upload for Search Enhancer for FamilySearch.

  .\build-store-zip.ps1                 # writes search-enhancer-for-familysearch-v<ver>.zip beside this script
  .\build-store-zip.ps1 -OutDir E:\     # somewhere else
  .\build-store-zip.ps1 -SkipTests      # dry run only — never for a real upload

What it does, in order:
  1. refuses a dev build (FSSE.DEBUG = true in src/inject.js), a manifest without minimum_chrome_version,
     and a version that is not three dotted integers;
  2. node --check on every src/*.js, then node tests/run.js (must print ALL GREEN);
  3. stages manifest.json, README.md, src\* and icons\*.png in a fresh temp folder (never tests\,
     never icons\previews\);
  4. zips the stage folder's CONTENTS, so manifest.json sits at the ZIP ROOT — what the store requires
     (the v0.2.x Load-unpacked zips nested a folder, which the dashboard rejects as "manifest missing");
  5. extracts the zip again and checks it: manifest at the root, every file the manifest names present,
     no tests/ or previews/, the version inside matches — then prints the file count and the SHA-256.
It leaves the stage folder in place and prints its path: load THAT folder unpacked in a fresh Chrome
profile for the pre-release test — it is byte-for-byte what the zip holds.
#>
param(
  [string]$OutDir = $PSScriptRoot,
  [switch]$SkipTests
)
$ErrorActionPreference = "Stop"
$ext = Join-Path $PSScriptRoot "familysearch-search-enhancer"

# 1. the build must be a release build
$manifest = Get-Content (Join-Path $ext "manifest.json") -Raw | ConvertFrom-Json
$ver = $manifest.version
if ($ver -notmatch '^\d+\.\d+\.\d+$') { throw "manifest version '$ver' is not three dotted integers" }
if (-not $manifest.minimum_chrome_version) { throw "manifest.json lacks minimum_chrome_version" }
$inject = Get-Content (Join-Path $ext "src\inject.js") -Raw
if ($inject -match 'FSSE\.DEBUG\s*=\s*true\b') { throw "src/inject.js has FSSE.DEBUG = true (a dev build) — set it false for the store" }

# 2. syntax + tests
Push-Location $ext
try {
  Get-ChildItem src -Filter *.js | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE) { throw "syntax error in src/$($_.Name)" }
  }
  if ($SkipTests) {
    Write-Host "tests: SKIPPED (-SkipTests — not a release)"
  } else {
    $out = node tests/run.js 2>&1 | Out-String
    if ($LASTEXITCODE -or $out -notmatch 'ALL GREEN') { Write-Host $out; throw "tests did not pass" }
    Write-Host "tests: ALL GREEN"
  }
} finally { Pop-Location }

# 3. stage a clean copy (a fresh folder name each run — nothing is ever cleared in place)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $env:TEMP "fsse-store-$ver-$stamp\search-enhancer-for-familysearch"
New-Item -ItemType Directory -Force "$stage\src", "$stage\icons" | Out-Null
Copy-Item (Join-Path $ext "manifest.json"), (Join-Path $ext "README.md") $stage
Copy-Item (Join-Path $ext "src\*") "$stage\src"
Copy-Item (Join-Path $ext "icons\*.png") "$stage\icons"

# 4. zip the CONTENTS of the stage folder → manifest.json at the root
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force $OutDir | Out-Null }
$zip = Join-Path $OutDir "search-enhancer-for-familysearch-v$ver.zip"
if (Test-Path $zip) { throw "$zip already exists — delete or rename it first (this script never overwrites)" }
Compress-Archive -Path "$stage\*" -DestinationPath $zip -CompressionLevel Optimal

# 5. extract it again and check what a reviewer would get
$check = Join-Path $env:TEMP "fsse-store-check-$ver-$stamp"
Expand-Archive -Path $zip -DestinationPath $check -Force
$problems = @()
if (-not (Test-Path (Join-Path $check "manifest.json"))) {
  $problems += "manifest.json is not at the zip root"
} else {
  $m2 = Get-Content (Join-Path $check "manifest.json") -Raw | ConvertFrom-Json
  if ($m2.version -ne $ver) { $problems += "the version inside the zip is $($m2.version), expected $ver" }
  $named = @()
  $named += $m2.content_scripts | ForEach-Object { $_.js }
  $named += $m2.icons.PSObject.Properties.Value
  $named += $m2.action.default_icon.PSObject.Properties.Value
  $named += @($m2.action.default_popup, $m2.options_ui.page)
  $named += $m2.web_accessible_resources | ForEach-Object { $_.resources } | Where-Object { $_ -notmatch '\*' }
  foreach ($f in ($named | Where-Object { $_ } | Sort-Object -Unique)) {
    if (-not (Test-Path (Join-Path $check $f))) { $problems += "missing from the zip: $f" }
  }
}
foreach ($bad in @("tests", "icons\previews")) { if (Test-Path (Join-Path $check $bad)) { $problems += "$bad must not ship" } }
$files = Get-ChildItem $check -Recurse -File
foreach ($f in $files) { if ($f.Extension -in ".zip", ".py", ".pdf", ".ps1") { $problems += "unexpected file in the zip: $($f.Name)" } }
if ($problems.Count) {
  $problems | ForEach-Object { Write-Host "PROBLEM: $_" }
  throw "the zip failed its check — not fit for upload"
}
$sha = (Get-FileHash $zip -Algorithm SHA256).Hash
Write-Host ""
Write-Host "zip:    $zip  ($([math]::Round((Get-Item $zip).Length / 1KB)) KB, $($files.Count) files)"
Write-Host "sha256: $sha"
Write-Host "stage:  $stage"
Write-Host "        ^ Load unpacked THIS folder in a fresh Chrome profile for the pre-release test"
Write-Host "check:  manifest.json at the root, every manifest file present, no tests/ or previews/ — OK"
