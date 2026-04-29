$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$distRoot = Join-Path $repoRoot "dist\windows"
$appRoot = Join-Path $distRoot "MapLeads"
$nodeSource = "C:\Program Files\nodejs\node.exe"
$launcherProject = Join-Path $repoRoot "launcher\MapLeadsLauncher.csproj"
$launcherNetFxSource = Join-Path $repoRoot "launcher\MapLeadsLauncher.netfx.cs"

if (-not (Test-Path $nodeSource)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "Node.js was not found. Install Node.js or update this script with a node.exe path."
  }
  $nodeSource = $nodeCommand.Source
}

Remove-Item -Recurse -Force $appRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $appRoot | Out-Null
New-Item -ItemType Directory -Force (Join-Path $appRoot "runtime\node") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $appRoot "tools") | Out-Null

$files = @(
  "index.html",
  "styles.css",
  "script.js",
  "server.js",
  "db.js",
  "package.json",
  "README.md",
  "CLOUDFLARE_TUNNEL.md"
)

foreach ($file in $files) {
  Copy-Item -Path (Join-Path $repoRoot $file) -Destination (Join-Path $appRoot $file) -Force
}

Copy-Item -Path $nodeSource -Destination (Join-Path $appRoot "runtime\node\node.exe") -Force

if (Test-Path (Join-Path $repoRoot "tools\gosom")) {
  Copy-Item -Path (Join-Path $repoRoot "tools\gosom") -Destination (Join-Path $appRoot "tools\gosom") -Recurse -Force
}

if (Test-Path (Join-Path $repoRoot "tools\cloudflared")) {
  Copy-Item -Path (Join-Path $repoRoot "tools\cloudflared") -Destination (Join-Path $appRoot "tools\cloudflared") -Recurse -Force
}

$sdkList = ""
try {
  $sdkList = dotnet --list-sdks 2>$null
} catch {
  $sdkList = ""
}

if ($sdkList) {
  dotnet publish $launcherProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true | Out-Host
  $launcherExe = Join-Path $repoRoot "launcher\bin\Release\net8.0\win-x64\publish\MapLeadsLauncher.exe"
  Copy-Item -Path $launcherExe -Destination (Join-Path $appRoot "MapLeadsLauncher.exe") -Force
} else {
  Write-Host "No .NET SDK found. Compiling launcher with Windows PowerShell Add-Type..."
  Add-Type -OutputAssembly (Join-Path $appRoot "MapLeadsLauncher.exe") -OutputType ConsoleApplication -Path $launcherNetFxSource
}

@"
Map Leads Windows EXE Package
=============================

Start:
  Double-click MapLeadsLauncher.exe

What it does:
  - Starts the local web app at http://localhost:3000
  - Opens your browser automatically
  - Uses tools\gosom\google-maps-scraper.exe for scraping
  - Starts Cloudflare Tunnel if ~/.cloudflared/eeconnect-mapleads.yml exists

Keep the launcher window open while using the app.
Press Ctrl+C in the launcher window to stop the app and tunnel.

Logs:
  logs\server.log
  logs\server.err.log
  logs\cloudflared.log
  logs\cloudflared.err.log

Public URL, after Cloudflare DNS is fully configured:
  https://maplead.eeconnect.co

Advanced:
  START_TUNNEL=0 disables automatic Cloudflare Tunnel startup.
  PORT=3050 starts the local app on another port.
"@ | Set-Content -Path (Join-Path $appRoot "README_START.txt") -Encoding UTF8

$zipPath = Join-Path $distRoot "MapLeads-Windows.zip"
Remove-Item -Force $zipPath -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $appRoot "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Windows EXE package built:"
Write-Host "  $appRoot"
Write-Host "  $zipPath"
