$ErrorActionPreference = "Continue"
$dep = "C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\CompX-Orbit-Studio-LiquidGlassInstaller last update"
$targets = @(
    (Join-Path $dep "dist"),
    (Join-Path $dep "_codex_backups"),
    (Join-Path $dep "presets\shake_previews"),
    (Join-Path $dep "tools"),
    (Join-Path $dep "assets\shake-preview-car.svg")
)
foreach ($t in $targets) {
    if (Test-Path -LiteralPath $t) {
        try { Remove-Item -LiteralPath $t -Recurse -Force; Write-Output "REMOVED: $t" }
        catch { Write-Output "FAILED: $t - $($_.Exception.Message)" }
    } else {
        Write-Output "SKIP (not present): $t"
    }
}
Write-Output "cleanup script finished"
