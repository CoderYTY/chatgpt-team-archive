$startup = [Environment]::GetFolderPath("Startup")
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot "start-companion-hidden.vbs"
$target = Join-Path $startup "ChatGPT Team Archive Companion.vbs"
Copy-Item -Path $source -Destination $target -Force
Write-Host "Installed startup launcher: $target"
