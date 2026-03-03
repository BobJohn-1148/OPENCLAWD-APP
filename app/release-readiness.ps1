param(
  [string]$AppDir = ".",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$global:HasFailure = $false
$results = @()

function Add-Result {
  param([string]$Step,[string]$Status,[string]$Detail="")
  $script:results += [pscustomobject]@{ Step=$Step; Status=$Status; Detail=$Detail }
}

function Pass { param([string]$Step,[string]$Detail="") Add-Result $Step "PASS" $Detail; Write-Host "PASS: $Step $Detail" -ForegroundColor Green }
function Warn { param([string]$Step,[string]$Detail="") Add-Result $Step "WARN" $Detail; Write-Host "WARN: $Step $Detail" -ForegroundColor Yellow }
function Fail { param([string]$Step,[string]$Detail="") $global:HasFailure = $true; Add-Result $Step "FAIL" $Detail; Write-Host "FAIL: $Step $Detail" -ForegroundColor Red }

function Run-Step {
  param([string]$Name,[string]$Command,[string]$Cwd)
  Write-Host "Running: $Command" -ForegroundColor DarkGray
  Push-Location $Cwd
  try {
    Invoke-Expression $Command
    if ($LASTEXITCODE -eq 0) { Pass $Name }
    else { Fail $Name "ExitCode=$LASTEXITCODE" }
  }
  catch {
    Fail $Name $_.Exception.Message
  }
  finally {
    Pop-Location
  }
}

function Get-PackageJson {
  param([string]$Dir)
  $pkg = Join-Path $Dir "package.json"
  if (!(Test-Path $pkg)) { return $null }
  try {
    return Get-Content -Path $pkg -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Has-InstallerScripts {
  param($Pkg)
  if ($null -eq $Pkg -or $null -eq $Pkg.scripts) { return $false }
  $scripts = $Pkg.scripts.PSObject.Properties.Name
  return ($scripts -contains "installer:pe") -or ($scripts -contains "installer:windows") -or ($scripts -contains "dist:win")
}

Write-Host "`n==> Resolve and validate paths" -ForegroundColor Cyan
$requestedPath = Resolve-Path $AppDir

# Auto-detect correct app dir when user passes nested paths like .\app from scripts\app
$candidates = @($requestedPath)
$parentPath = Split-Path -Parent $requestedPath
$childPath = Join-Path $requestedPath "app"
if ($parentPath) { $candidates += $parentPath }
if (Test-Path $childPath) { $candidates += $childPath }

$appPath = $null
$selectedPkg = $null
foreach ($c in ($candidates | Select-Object -Unique)) {
  $pkg = Get-PackageJson -Dir $c
  if ($pkg -and (Has-InstallerScripts -Pkg $pkg)) {
    $appPath = $c
    $selectedPkg = $pkg
    break
  }
}

if (-not $appPath) {
  $appPath = $requestedPath
  $selectedPkg = Get-PackageJson -Dir $appPath
}

if (-not $selectedPkg) {
  Fail "package.json exists" (Join-Path $appPath "package.json")
  $results | Format-Table -AutoSize
  exit 1
}

Pass "package.json exists" (Join-Path $appPath "package.json")
if ($appPath -ne $requestedPath) {
  Warn "Auto-detected app directory" "Using $appPath instead of requested $requestedPath"
}

Write-Host "`n==> Tooling checks" -ForegroundColor Cyan
try { node --version | Out-Host; Pass "Node available" } catch { Fail "Node available" $_.Exception.Message }
try { npm --version | Out-Host; Pass "npm available" } catch { Fail "npm available" $_.Exception.Message }

Write-Host "`n==> Preflight file checks" -ForegroundColor Cyan
$installDoc = Join-Path $appPath "INSTALL_WINDOWS.md"
$peBat = Join-Path $appPath "build-pe-installer-windows.bat"
if (Test-Path $installDoc) { Pass "File exists" $installDoc } else { Warn "File exists" "$installDoc (optional)" }
if (Test-Path $peBat) { Pass "File exists" $peBat } else { Warn "File exists" "$peBat (optional)" }

Write-Host "`n==> Static duplicate check (App.jsx top-level declarations)" -ForegroundColor Cyan
$appJsx = Join-Path $appPath "src\ui\App.jsx"
$hasDuplicateTopLevel = $false
if (Test-Path $appJsx) {
  $lines = Get-Content -Path $appJsx
  $topLevelFns = @()
  foreach ($line in $lines) {
    if ($line -match '^function\s+([A-Za-z0-9_]+)\s*\(') {
      $topLevelFns += $Matches[1]
    }
  }

  $counts = @{}
  foreach ($name in $topLevelFns) {
    if ($counts.ContainsKey($name)) { $counts[$name] += 1 } else { $counts[$name] = 1 }
  }
  $dups = $counts.GetEnumerator() | Where-Object { $_.Value -gt 1 }

  if ($dups) {
    $dupList = ($dups | Sort-Object Key | ForEach-Object { "$($_.Key) x$($_.Value)" }) -join ", "
    Fail "Duplicate top-level declarations" $dupList
    Warn "Hint" "Open src\ui\App.jsx and remove duplicated top-level function declarations before build."
    $hasDuplicateTopLevel = $true
  } else {
    Pass "Duplicate top-level declarations" "none found"
  }
} else {
  Warn "App.jsx exists" "$appJsx (skipped duplicate check)"
}

if ($hasDuplicateTopLevel) {
  Warn "Build/installer steps" "Skipped because duplicate top-level declarations were found."
  Write-Host "`n==> Summary" -ForegroundColor Cyan
  $results | Format-Table -AutoSize | Out-Host
  Write-Host "Release readiness: NOT READY" -ForegroundColor Red
  exit 1
}

Write-Host "`n==> Install/build/test" -ForegroundColor Cyan
if (-not $SkipInstall) { Run-Step "npm install" "npm install" $appPath } else { Warn "npm install" "Skipped via -SkipInstall" }
Run-Step "npm run build" "npm run build" $appPath
Run-Step "npm test" "npm test" $appPath

Write-Host "`n==> Build Windows PE installer" -ForegroundColor Cyan
$scripts = $selectedPkg.scripts.PSObject.Properties.Name
if ($scripts -contains "installer:pe") {
  Run-Step "npm run installer:pe" "npm run installer:pe" $appPath
} elseif ($scripts -contains "installer:windows") {
  Warn "installer:pe missing" "Falling back to installer:windows"
  Run-Step "npm run installer:windows" "npm run installer:windows" $appPath
} elseif ($scripts -contains "dist:win") {
  Warn "installer:pe missing" "Falling back to dist:win"
  Run-Step "npm run dist:win" "npm run dist:win" $appPath
} else {
  Fail "Windows installer script" "No installer script found in package.json"
}

Write-Host "`n==> Validate installer artifacts" -ForegroundColor Cyan
$releasePath = Join-Path $appPath "release"
if (!(Test-Path $releasePath)) {
  Fail "Release directory exists" $releasePath
} else {
  $exes = Get-ChildItem -Path $releasePath -Filter "*.exe" -File -ErrorAction SilentlyContinue
  if ($exes.Count -eq 0) {
    Fail "Release EXE artifacts" "No .exe files found"
  } else {
    Pass "Release EXE artifacts" "Count=$($exes.Count)"
    $exes | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

    $nsis = $exes | Where-Object { $_.Name -match '^Bob Assistant-.*-x64\.exe$' }
    $portable = $exes | Where-Object { $_.Name -match '^Bob Assistant-.*-x64-portable\.exe$' }
    if ($nsis) { Pass "NSIS artifact present" } else { Warn "NSIS artifact present" "Pattern not found" }
    if ($portable) { Pass "Portable artifact present" } else { Warn "Portable artifact present" "Pattern not found" }
  }
}

Write-Host "`n==> Optional local DB path check" -ForegroundColor Cyan
$dbPath = Join-Path $env:APPDATA "BobAssistant\bob.db"
if (Test-Path $dbPath) { Pass "Local DB exists" $dbPath }
else { Warn "Local DB exists" "Not found yet (launch app once to create)." }

Write-Host "`n==> Summary" -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-Host

if ($global:HasFailure) {
  Write-Host "Release readiness: NOT READY" -ForegroundColor Red
  exit 1
}

Write-Host "Release readiness: READY" -ForegroundColor Green
exit 0
