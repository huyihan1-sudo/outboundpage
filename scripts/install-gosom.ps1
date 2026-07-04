param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$toolDir = Join-Path $repoRoot "tools\gosom"
$target = Join-Path $toolDir "google-maps-scraper.exe"
$downloadUrl = "https://github.com/gosom/google-maps-scraper/releases/latest/download/google-maps-scraper-windows-amd64.exe"

New-Item -ItemType Directory -Force $toolDir | Out-Null

if ((Test-Path $target) -and -not $Force) {
  Write-Host "gosom/google-maps-scraper is already installed:"
  Write-Host "  $target"
  Write-Host "Use -Force to download the latest release again."
} else {
  $tempTarget = "$target.download"
  Remove-Item -Force $tempTarget -ErrorAction SilentlyContinue

  Write-Host "Downloading the latest gosom/google-maps-scraper release..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $tempTarget -UseBasicParsing

  if ((Get-Item $tempTarget).Length -lt 1MB) {
    Remove-Item -Force $tempTarget -ErrorAction SilentlyContinue
    throw "The downloaded file is unexpectedly small."
  }

  Move-Item -Force $tempTarget $target
  Write-Host "Installed: $target"
}

$versionOutput = Join-Path $env:TEMP "gosom-version-$PID.txt"
$versionError = Join-Path $env:TEMP "gosom-version-$PID.err.txt"
try {
  $process = Start-Process -FilePath $target -ArgumentList "--version" -Wait -PassThru -NoNewWindow `
    -RedirectStandardOutput $versionOutput -RedirectStandardError $versionError
  Get-Content $versionOutput, $versionError -ErrorAction SilentlyContinue | Select-Object -First 8
  if ($process.ExitCode -ne 0) {
    throw "gosom validation failed with exit code $($process.ExitCode)."
  }
} finally {
  Remove-Item -Force $versionOutput, $versionError -ErrorAction SilentlyContinue
}
