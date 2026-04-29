param(
  [string]$TunnelName = "eeconnect-mapleads"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$cloudflared = Join-Path $repoRoot "tools\cloudflared\cloudflared.exe"
$configPath = Join-Path (Join-Path $env:USERPROFILE ".cloudflared") "$TunnelName.yml"

if (-not (Test-Path $cloudflared)) {
  throw "cloudflared was not found. Run scripts\setup-cloudflare-fixed-tunnel.ps1 first."
}

if (-not (Test-Path $configPath)) {
  throw "Tunnel config was not found: $configPath. Run scripts\setup-cloudflare-fixed-tunnel.ps1 first."
}

Write-Host "Starting fixed Cloudflare Tunnel: $TunnelName"
Write-Host "Config: $configPath"
& $cloudflared tunnel --config $configPath run $TunnelName
