$ErrorActionPreference = "Stop"
$src = "D:\app\Compx adobe after effect\Extension\Compx Engine\CompX-Orbit-Studio"
$dest1 = "C:\Users\sonjo\AppData\Roaming\Adobe\CEP\extensions\com.compxorbit.studio"
$dest2 = "C:\Users\sonjo\AppData\Roaming\Adobe\CEP\extensions\CompX-Orbit-Studio"

$excludeDirs  = @(".git","tests","dist","releases","design","tools","node_modules","Claude outputs","scratch")
$excludeFiles = @("*.bak","*.log","*.tmp","*.status","*.pid","*.sql","*.bat","full-deploy.ps1")

foreach ($dest in @($dest1, $dest2)) {
    Write-Host "Deploying to: $dest"
    if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
    $xdArgs = ($excludeDirs | ForEach-Object { "`"$_`"" }) -join " "
    $xfArgs = ($excludeFiles | ForEach-Object { "$_" }) -join " "
    $cmd = "robocopy `"$src`" `"$dest`" /E /XD $xdArgs /XF $xfArgs /NFL /NJH /NJS"
    Invoke-Expression $cmd
    Write-Host "Done: $dest"
}
Write-Host "`nAll done! Restart After Effects."
