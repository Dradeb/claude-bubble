# End-to-end test of the user-facing install path: run the plugin's real install script (download -> verify -> silent install -> start),
# check the result, then uninstall silently and check nothing is left behind.
#   usage: powershell -File tools/install-test.ps1 [-ReplaceExisting]
# -ReplaceExisting: first silently uninstall a copy that is already installed (otherwise the test refuses to run).
param([switch]$ReplaceExisting)
$ErrorActionPreference = 'Continue'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$script = Join-Path $root 'plugin\scripts\install-widget.ps1'
$unKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

function Step($t) { Write-Output ''; Write-Output "== $t" }
function Ping { curl.exe -s --connect-timeout 1 -m 2 http://127.0.0.1:47800/ping }
function Entry { Get-ChildItem $unKey -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like 'Claude Bubble*' } | Select-Object -First 1 }
function InstallDir($e) { if ($e -and $e.DisplayIcon) { Split-Path $e.DisplayIcon.Split(',')[0].Trim('"') -Parent } }
function Shortcut { Get-ChildItem $startMenu -Filter 'Claude Bubble*.lnk' -ErrorAction SilentlyContinue | Select-Object -First 1 }
function Uninstall($e) {
    $cmd = $e.UninstallString
    $path = if ($cmd -match '^"([^"]+)"') { $Matches[1] } else { $cmd.Split(' ')[0] }
    $dir = InstallDir $e
    Write-Output "   running: `"$path`" /S"
    Start-Process -FilePath $path -ArgumentList '/S' -Wait
    for ($i = 0; $i -lt 60 -and ((Test-Path $dir) -or (Entry)); $i++) { Start-Sleep -Milliseconds 500 }
}

Step '0. Starting point'
Get-Process 'Claude Bubble' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 2
$e = Entry
Write-Output "already installed  : $([bool]$e) $(if ($e) { '(' + $e.DisplayName + ' at ' + (InstallDir $e) + ')' })"
if ($e) {
    if (-not $ReplaceExisting) { Write-Output 'ABORT: a copy is installed. Re-run with -ReplaceExisting to uninstall it first.'; exit 2 }
    Write-Output '   uninstalling the existing copy first (-ReplaceExisting)'
    Uninstall $e
    Write-Output "   existing copy gone: $(-not (Entry))"
}

Step '1. Running plugin/scripts/install-widget.ps1 (the real /bubble:setup script)'
$sw = [Diagnostics.Stopwatch]::StartNew()
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script 2>&1 | ForEach-Object { Write-Output "   | $_" }
Write-Output ("   script exit code {0} after {1:n1}s" -f $LASTEXITCODE, $sw.Elapsed.TotalSeconds)

Step '2. What got installed'
$e = Entry
$dir = InstallDir $e
Write-Output "uninstall entry    : $(if ($e) { $e.DisplayName + ' ' + $e.DisplayVersion } else { 'MISSING' })"
Write-Output "install folder     : $dir"
if ($dir -and (Test-Path $dir)) {
    $files = Get-ChildItem $dir -Recurse -File
    Write-Output ("size on disk       : {0:n0} MB in {1} files" -f (($files | Measure-Object Length -Sum).Sum / 1MB), $files.Count)
}
$p = Get-Process 'Claude Bubble' -ErrorAction SilentlyContinue
Write-Output "running from       : $(($p | Select-Object -First 1).Path)"
Write-Output "processes          : $(@($p).Count)"
Write-Output "widget answering   : $(Ping)"
Write-Output "start menu shortcut: $([bool](Shortcut))"

Step '3. Does the installed copy handle a hook event?'
$j = '{"hook_event_name":"UserPromptSubmit","session_id":"install-test","cwd":"C:\\work\\install-test"}'
$sw = [Diagnostics.Stopwatch]::StartNew()
$j | curl.exe -s --connect-timeout 1 -m 5 -X POST --data-binary '@-' http://127.0.0.1:47800/hook
Write-Output ("hook round trip    : {0} ms, curl exit {1}" -f $sw.ElapsedMilliseconds, $LASTEXITCODE)
'{"hook_event_name":"SessionEnd","session_id":"install-test","cwd":"C:\\work\\install-test"}' | curl.exe -s --connect-timeout 1 -m 5 -X POST --data-binary '@-' http://127.0.0.1:47800/hook

Step '4. Uninstalling silently'
if ($e -and $e.UninstallString) { Uninstall $e } else { Write-Output '   no uninstall entry found - cannot uninstall automatically' }

Step '5. After uninstall'
Write-Output "install folder gone: $(-not ($dir -and (Test-Path $dir)))"
Write-Output "uninstall entry    : $(if (Entry) { 'STILL PRESENT' } else { 'removed' })"
Write-Output "processes running  : $(@(Get-Process 'Claude Bubble' -ErrorAction SilentlyContinue).Count)"
Write-Output "widget answering   : $([bool](Ping))"
Write-Output "start menu shortcut: $(if (Shortcut) { 'STILL PRESENT' } else { 'removed' })"
Write-Output "user config kept   : $(Test-Path (Join-Path $env:APPDATA 'Claude Bubble\config.json'))"
