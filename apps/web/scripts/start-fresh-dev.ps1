$root = "C:\Users\roger\Documents\dev\the-word\apps\web"
$out = Join-Path $root ".dev.log"
if (Test-Path $out) { Remove-Item $out }
if (Test-Path ($out + ".err")) { Remove-Item ($out + ".err") }
$p = Start-Process -FilePath "node.exe" -ArgumentList "scripts/dev.mjs" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError ($out + ".err") -PassThru
Start-Sleep -Seconds 8
Write-Output "PID=$($p.Id)"
if (Test-Path $out) { Get-Content $out -ErrorAction SilentlyContinue | Select-Object -First 12 }
if (Test-Path ($out + ".err")) { Write-Output "--- err ---"; Get-Content ($out + ".err") -ErrorAction SilentlyContinue | Select-Object -First 12 }