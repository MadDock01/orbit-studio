$ErrorActionPreference = 'Continue'
$log = @()
foreach ($d in @('design\.shot-ember','design\.shot-nebula','design\.shot-ocean','design\.shot-profile','design\.shot-rose')) {
  if (Test-Path -LiteralPath $d) {
    try { Remove-Item -LiteralPath $d -Recurse -Force; $log += "REMOVED: $d" }
    catch { $log += "FAILED: $d :: $($_.Exception.Message)" }
  } else { $log += "already gone: $d" }
}
$hf = 'System.Management.Automation.Internal.Host.InternalHost'
if (Test-Path -LiteralPath $hf) {
  try { Remove-Item -LiteralPath $hf -Force; $log += "REMOVED: $hf" }
  catch { $log += "FAILED: $hf :: $($_.Exception.Message)" }
} else { $log += "already gone: $hf" }
$log += ''
$log += '== design/ remaining =='
Get-ChildItem -LiteralPath design -Force -ErrorAction SilentlyContinue | ForEach-Object { $log += ('  ' + $_.Name) }
$log += ''
$log += '== tools/dev-stage-counter-v101 files =='
Get-ChildItem -Recurse -File tools\dev-stage-counter-v101 -ErrorAction SilentlyContinue | ForEach-Object { $log += ('  ' + $_.FullName.Substring((Get-Location).Path.Length + 1) + '  ' + $_.Length + ' B') }
$log | Out-File _clean1.txt -Encoding utf8
Write-Output DONE