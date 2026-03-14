$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$server = Join-Path $root "apps/companion/src/server.js"

try {
  $listening = Get-NetTCPConnection -LocalPort 3184 -State Listen -ErrorAction Stop
} catch {
  $listening = $null
}

if (-not $listening) {
  Start-Process -FilePath $node -ArgumentList @($server) -WorkingDirectory $root -WindowStyle Hidden
}
