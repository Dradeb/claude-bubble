# Exercises plugin/scripts/install-widget.ps1 branches without installing anything.
$root = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$script = Join-Path $root 'plugin\scripts\install-widget.ps1'
$unpacked = Join-Path $root 'app\dist\win-unpacked\Claude Bubble.exe'
Get-Process 'Claude Bubble' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 1

Write-Output '[A] widget stopped, not installed, no release repo configured (expect a clear error, exit 1):'
$out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script 2>&1 | Out-String
Write-Output ($out.Trim().Split("`n")[0]); Write-Output "exit $LASTEXITCODE"

# temp copy of the script that treats the unpacked build as the installed exe
$tmp = Join-Path $env:TEMP 'iw-test.ps1'
$needle = "Join-Path `$env:LOCALAPPDATA 'Programs\Claude Bubble\Claude Bubble.exe'"
(Get-Content $script -Raw).Replace($needle, "'$unpacked'") | Set-Content $tmp

Write-Output '[B] installed but not running (expect: starts it and waits until it answers, exit 0):'
$sw = [Diagnostics.Stopwatch]::StartNew()
$out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tmp 2>&1 | Out-String
Write-Output ($out.Trim()); Write-Output ("exit {0} after {1:n1}s" -f $LASTEXITCODE, $sw.Elapsed.TotalSeconds)

Write-Output '[C] already running (expect: says so immediately, exit 0):'
$out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $tmp 2>&1 | Out-String
Write-Output ($out.Trim()); Write-Output "exit $LASTEXITCODE"
Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
