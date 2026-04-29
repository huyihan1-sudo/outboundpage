$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$toolDir = Join-Path $repoRoot "tools\gosom"
$target = Join-Path $toolDir "google-maps-scraper.exe"
$api = "https://api.github.com/repos/gosom/google-maps-scraper/releases/latest"

New-Item -ItemType Directory -Force $toolDir | Out-Null

Write-Host "Fetching latest gosom/google-maps-scraper release..."
$release = Invoke-RestMethod -Uri $api -Headers @{ "User-Agent" = "EECONNECT-Maps-Leads" }
$asset = $release.assets | Where-Object { $_.name -match "windows-amd64\.exe$" } | Select-Object -First 1

if (-not $asset) {
  throw "No windows-amd64.exe release asset found."
}

Write-Host "Downloading $($asset.name)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $target

Write-Host "Installed: $target"
Write-Host "Version: $($release.tag_name)"
& $target -h | Select-Object -First 8
