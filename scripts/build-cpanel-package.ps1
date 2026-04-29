$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$distRoot = Join-Path $repoRoot "dist\cpanel"
$packageRoot = Join-Path $distRoot "mapleads-app"
$zipPath = Join-Path $distRoot "mapleads-cpanel.zip"

if (Test-Path $packageRoot) {
  Remove-Item -Recurse -Force $packageRoot
}
New-Item -ItemType Directory -Force $packageRoot | Out-Null

$items = @(
  "index.html",
  "styles.css",
  "script.js",
  "server.js",
  "db.js",
  "package.json",
  "scripts\install-gosom-cpanel.sh",
  "CPANEL_DEPLOY.md"
)

foreach ($item in $items) {
  $source = Join-Path $repoRoot $item
  $target = Join-Path $packageRoot $item
  New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
  Copy-Item $source $target
}

if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}
Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath
Write-Host "Created $zipPath"

