$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cloudflared = Join-Path $repoRoot "tools\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflared)) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $cloudflared) | Out-Null
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri $url -OutFile $cloudflared
}

Write-Host "Starting public tunnel for http://localhost:3000"
Write-Host "Look for the trycloudflare.com URL below."
& $cloudflared tunnel --url http://localhost:3000 --no-autoupdate
