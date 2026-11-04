# Installs (if missing) and starts the Claude Bubble widget. Safe to run repeatedly.
# Downloads the latest release assets from GitHub:  Claude-Bubble-Setup.exe  and  Claude-Bubble-Setup.exe.sha256
param(
    [string]$Repo = 'Dradeb/claude-bubble',
    [string]$ExePath = ''      # override the installed exe location (used by tests)
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Test-Widget { try { (curl.exe -s --connect-timeout 1 -m 3 http://127.0.0.1:47800/ping) -match 'claude-bubble' } catch { $false } }

# Where the per-user installer put the app. The folder name depends on the installer build, so check the likely
# folders first and then the uninstall registry entry (its DisplayIcon points at the exe).
function Find-Exe {
    if ($ExePath) { if (Test-Path $ExePath) { return $ExePath } else { return $null } }
    foreach ($name in 'claude-bubble', 'Claude Bubble') {
        $p = Join-Path $env:LOCALAPPDATA "Programs\$name\Claude Bubble.exe"
        if (Test-Path $p) { return $p }
    }
    $entry = Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ItemProperty $_.PSPath } |
        Where-Object { $_.DisplayName -like 'Claude Bubble*' -and $_.DisplayIcon } | Select-Object -First 1
    if ($entry) {
        $p = $entry.DisplayIcon.Split(',')[0].Trim('"')
        if (Test-Path $p) { return $p }
    }
    return $null
}

if (Test-Widget) { Write-Output 'Claude Bubble is already running.'; exit 0 }

$exe = Find-Exe
if (-not $exe) {
    $dir = Join-Path $env:TEMP ('claude-bubble-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $dir | Out-Null
    try {
        $base = "https://github.com/$Repo/releases/latest/download"
        $setup = Join-Path $dir 'Claude-Bubble-Setup.exe'
        Write-Output "Downloading installer from $base ..."
        Invoke-WebRequest "$base/Claude-Bubble-Setup.exe" -OutFile $setup -UseBasicParsing
        # save to disk and read as text: GitHub serves release assets as application/octet-stream, so .Content would be a byte[]
        $shaFile = Join-Path $dir 'Claude-Bubble-Setup.exe.sha256'
        Invoke-WebRequest "$base/Claude-Bubble-Setup.exe.sha256" -OutFile $shaFile -UseBasicParsing
        $expected = (Get-Content -LiteralPath $shaFile -Raw).Trim().Split(' ')[0].ToLower()
        $actual = (Get-FileHash $setup -Algorithm SHA256).Hash.ToLower()
        if ($expected -ne $actual) { Write-Error "Checksum mismatch (expected $expected, got $actual). Not installing."; exit 1 }
        Write-Output 'Checksum OK. Installing for the current user...'
        Start-Process $setup -ArgumentList '/S' -Wait
    } finally {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
    for ($i = 0; $i -lt 30 -and -not ($exe = Find-Exe); $i++) { Start-Sleep -Milliseconds 500 }
    if (-not $exe) { Write-Error 'The installer finished but the Claude Bubble executable was not found.'; exit 1 }
}

# the installer may already have started it
for ($i = 0; $i -lt 6 -and -not (Test-Widget); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Widget)) { Start-Process $exe }
for ($i = 0; $i -lt 30; $i++) { if (Test-Widget) { Write-Output 'Claude Bubble is running.'; exit 0 }; Start-Sleep -Milliseconds 500 }
Write-Error 'The widget was started but did not answer on 127.0.0.1:47800 within 15 s.'
exit 1
