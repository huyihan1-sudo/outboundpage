param(
  [string]$Hostname = "maplead.eeconnect.co",
  [string]$TunnelName = "eeconnect-mapleads",
  [string]$ServiceUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cloudflared = Join-Path $repoRoot "tools\cloudflared\cloudflared.exe"
$cloudflaredDir = Join-Path $env:USERPROFILE ".cloudflared"
$configPath = Join-Path $cloudflaredDir "$TunnelName.yml"

if (-not (Test-Path $cloudflared)) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $cloudflared) | Out-Null
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri $url -OutFile $cloudflared
}

New-Item -ItemType Directory -Force $cloudflaredDir | Out-Null

if (-not (Test-Path (Join-Path $cloudflaredDir "cert.pem"))) {
  Write-Host "Cloudflare login is required. A browser window will open."
  Write-Host "Choose the Cloudflare account and zone that owns $Hostname."
  & $cloudflared tunnel login
}

$listJson = & $cloudflared tunnel list --output json 2>$null
$existing = $null
if ($listJson) {
  $existing = ($listJson | ConvertFrom-Json) | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1
}

if ($existing) {
  $tunnelId = $existing.id
  Write-Host "Using existing tunnel: $TunnelName ($tunnelId)"
} else {
  Write-Host "Creating tunnel: $TunnelName"
  $createOutput = & $cloudflared tunnel create $TunnelName
  $tunnelId = (& $cloudflared tunnel list --output json | ConvertFrom-Json | Where-Object { $_.name -eq $TunnelName } | Select-Object -First 1).id
  if (-not $tunnelId) {
    Write-Host $createOutput
    throw "Could not determine the created tunnel id."
  }
}

$credentialsFile = Join-Path $cloudflaredDir "$tunnelId.json"
if (-not (Test-Path $credentialsFile)) {
  throw "Tunnel credentials file was not found: $credentialsFile"
}

@"
tunnel: $tunnelId
credentials-file: $credentialsFile

ingress:
  - hostname: $Hostname
    service: $ServiceUrl
  - service: http_status:404
"@ | Set-Content -Path $configPath -Encoding ASCII

Write-Host "Routing DNS: $Hostname -> $TunnelName"
& $cloudflared tunnel route dns $TunnelName $Hostname

Write-Host ""
Write-Host "Fixed Cloudflare Tunnel is configured."
Write-Host "Hostname: $Hostname"
Write-Host "Tunnel:   $TunnelName ($tunnelId)"
Write-Host "Config:   $configPath"
Write-Host ""
Write-Host "Start it with:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\run-cloudflare-fixed-tunnel.ps1 -TunnelName $TunnelName"
