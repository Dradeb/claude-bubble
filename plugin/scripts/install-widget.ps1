# Installs (if missing) and starts the Claude Bubble widget. Safe to run repeatedly.
# Set $Repo to the GitHub repository that publishes the release assets:
#   Claude-Bubble-Setup.exe  and  Claude-Bubble-Setup.exe.sha256
param([string]$Repo = 'Dradeb/claude-bubble')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Test-Widget { try { (curl.exe -s --connect-timeout 1 -m 3 http://127.0.0.1:47800/ping) -match 'claude-bubble' } catch { $false } }

if (Test-Widget) { Write-Output 'Claude Bubble is already running.'; exit 0 }

$exe = Join-Path $env:LOCALAPPDATA 'Programs\Claude Bubble\Claude Bubble.exe'
if (-not (Test-Path $exe)) {
    if ($Repo -like 'REPLACE-*') { Write-Error 'This copy of the plugin has no release repository configured (see $Repo in scripts/install-widget.ps1).'; exit 1 }
    $dir = Join-Path $env:TEMP ('claude-bubble-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $dir | Out-Null
    $base = "https://github.com/$Repo/releases/latest/download"
    $setup = Join-Path $dir 'Claude-Bubble-Setup.exe'
    Write-Output "Downloading installer from $base ..."
    Invoke-WebRequest "$base/Claude-Bubble-Setup.exe" -OutFile $setup -UseBasicParsing
    $expected = ((Invoke-WebRequest "$base/Claude-Bubble-Setup.exe.sha256" -UseBasicParsing).Content -split '\s+')[0].Trim().ToLower()
    $actual = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
    if ($expected -ne $actual) { Remove-Item $dir -Recurse -Force; Write-Error "Checksum mismatch (expected $expected, got $actual). Not installing."; exit 1 }
    Write-Output 'Checksum OK. Installing for the current user...'
    Start-Process $setup -ArgumentList '/S' -Wait
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 20 -and -not (Test-Path $exe); $i++) { Start-Sleep -Milliseconds 500 }
    if (-not (Test-Path $exe)) { Write-Error "Installer finished but $exe was not found."; exit 1 }
}

if (-not (Test-Widget)) { Start-Process $exe }
for ($i = 0; $i -lt 30; $i++) { if (Test-Widget) { Write-Output 'Claude Bubble is running.'; exit 0 }; Start-Sleep -Milliseconds 500 }
Write-Error 'The widget was started but did not answer on 127.0.0.1:47800 within 15 s.'
exit 1
