# Downloads the published "latest" release assets exactly like plugin/scripts/install-widget.ps1 does and verifies them.
# Does not install anything.  usage: powershell -File tools/verify-release.ps1 [-Repo owner/name] [-Local path-to-local-installer]
param(
  [string]$Repo = 'Dradeb/claude-bubble',
  [string]$Local = (Join-Path $PSScriptRoot '..\dist\Claude-Bubble-Setup.exe')
)
$base = "https://github.com/$Repo/releases/latest/download"
foreach ($n in 'Claude-Bubble-Setup.exe', 'Claude-Bubble-Setup.exe.sha256') {
  $lines = curl.exe -sIL --max-time 30 "$base/$n"
  $status = ($lines | Where-Object { $_ -match '^HTTP/' } | Select-Object -Last 1)
  Write-Output ("{0,-34} {1}" -f $n, $status)
}
$dir = Join-Path $env:TEMP ('bubble-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
New-Item -ItemType Directory -Path $dir | Out-Null
try {
  curl.exe -sL --max-time 300 -o "$dir\setup.exe" "$base/Claude-Bubble-Setup.exe"
  curl.exe -sL --max-time 30 -o "$dir\setup.sha256" "$base/Claude-Bubble-Setup.exe.sha256"
  $expected = (Get-Content "$dir\setup.sha256" -Raw).Trim().Split(' ')[0].ToLower()
  $actual = (Get-FileHash "$dir\setup.exe" -Algorithm SHA256).Hash.ToLower()
  Write-Output ("downloaded size       : {0:n1} MB" -f ((Get-Item "$dir\setup.exe").Length / 1MB))
  Write-Output "published .sha256     : $expected"
  Write-Output "sha256 of download    : $actual"
  Write-Output "checksum file matches download : $($expected -eq $actual)"
  if (Test-Path $Local) {
    $local = (Get-FileHash $Local -Algorithm SHA256).Hash.ToLower()
    Write-Output "download identical to local build : $($actual -eq $local)"
  }
} finally {
  Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
}
