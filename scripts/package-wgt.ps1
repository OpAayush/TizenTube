param(
    [string]$Profile = "axotube",
    [string]$OutDir = "release"
)

$ErrorActionPreference = "Stop"
$tizen = "C:\tizen-studio\tools\ide\bin\tizen.bat"
$root = Split-Path -Parent $PSScriptRoot
$standalone = Join-Path $root "standalone"

if (-not (Test-Path (Join-Path $standalone "service\dist\index.js"))) {
    throw "standalone/service/dist/index.js missing - run 'npm run build:standalone' first"
}

Push-Location $standalone
try {
    Write-Host "==> tizen build-web"
    & $tizen build-web -e ".*" -e "node_modules/*" -e "package*.json" -- $standalone
    if ($LASTEXITCODE -ne 0) { throw "build-web failed" }

    Write-Host "==> tizen package (-s $Profile)"
    & $tizen package -t wgt -o $OutDir -s $Profile -- (Join-Path $standalone ".buildResult")
    if ($LASTEXITCODE -ne 0) { throw "package failed" }

    Get-ChildItem (Join-Path $standalone $OutDir) -Filter *.wgt | Select-Object FullName, Length
} finally {
    Pop-Location
}