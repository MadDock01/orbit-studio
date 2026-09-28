$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path -Parent $PSScriptRoot
$extensionName = "CompX-Orbit-Studio"
$targetRoots = @(
    (Join-Path $env:APPDATA "Adobe\CEP\extensions\com.compxorbit.studio"),
    (Join-Path $env:APPDATA "Adobe\CEP\extensions\$extensionName")
)
foreach ($target in $targetRoots) {
    if (-not (Test-Path -LiteralPath $target -PathType Container)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }
}
$relativeFiles = @(
    "CSXS\manifest.xml",
    "index.html",
    "assets\compx-mark.png",
    "css\style.css",
    "css\library-visual.css",
    "css\graph20.css",
    "css\colorplate.css",
    "css\orbit-foundation.css",
    "css\orbit-shell.css",
    "css\orbit-tools.css",
    "css\orbit-library.css",
    "css\composition-library.css",
    "css\orbit-final.css",
    "css\orbit-compact.css",
    "css\orbit-cards-unified.css",
    "css\orbit-console-theme.css",
    "css\orbit-redesign.css",
    "css\orbit-premium.css",
    "css\orbit-exploder.css",
    "css\orbit-colors.css",
    "css\orbit-library-redesign.css",
    "css\orbit-captions.css",
    "css\orbit-premium-v2.css",
    "css\orbit-text-fx.css",
    "css\orbit-carousel.css",
    "css\license-gate.css",
    "js\main.js",
    "js\ss2ae-engine.js",
    "js\background-remover.js",
    "js\advanced_features.js",
    "js\graph20.js",
    "js\composition-library.js",
    "js\colorplate.js",
    "js\motion-library.js",
    "js\orbit-carousel.js",
    "js\compx-loader.js",
    "js\compx-license.js",
    "js\license-gate.js",
    "jsx\hostscript.jsx",
    "scripts\autocaptions-runtime.json",
    "scripts\background-removal-runtime.json",
    "presets\external-preset-catalog.json"
)
$relativeDirectories = @(
    "plugins",
    "scripts",
    "vendor\onnxruntime",
    "assets\fonts\bangla",
    "presets\word-captions",
    "presets\text-animations",
    "presets\text-animation-pack",
    "presets\effects",
    "presets\shakes"
)
$obsoleteDirectories = @(
    "presets\shake_previews",
    "presets\premiere-prfpset",
    "presets\premiere-mogrt",
    "presets\shakes\sapphire",
    "presets\shakes\sapphire-twitch",
    "presets\transitions\sapphire",
    "presets\transitions\sapphire-starglow",
    "presets\transitions\sapphire-universe",
    "presets\transitions\starglow",
    "presets\transitions\twitch",
    "presets\transitions\universe",
    "presets\plugin-packs",
    "presets\transitions"
)
$obsoleteFiles = @(
    "assets\shake-preview-car.svg",
    "js\orbit-exploder.js",
    "js\orbit-footer.js",
    "presets\transitions\native\one_frame_TV_pixel.ffx",
    "presets\transitions\native\one_frame_vhs_2.ffx",
    "presets\text-animations\Rainbow Text.ffx",
    "presets\text-animations\Text Preset lift.ffx"
)

foreach ($targetRoot in $targetRoots) {
    Write-Host "Deploying to: $targetRoot"
    $resolvedTargetRoot = [System.IO.Path]::GetFullPath($targetRoot).TrimEnd('\') + '\'
    foreach ($obsoleteDirectory in $obsoleteDirectories) {
        $obsoleteTarget = [System.IO.Path]::GetFullPath((Join-Path $targetRoot $obsoleteDirectory))
        if (-not $obsoleteTarget.StartsWith($resolvedTargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a directory outside the installed extension: $obsoleteTarget"
        }
        if (Test-Path -LiteralPath $obsoleteTarget -PathType Container) {
            Remove-Item -LiteralPath $obsoleteTarget -Recurse -Force
        }
    }
    foreach ($obsoleteFile in $obsoleteFiles) {
        $obsoleteTarget = [System.IO.Path]::GetFullPath((Join-Path $targetRoot $obsoleteFile))
        if (-not $obsoleteTarget.StartsWith($resolvedTargetRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove a file outside the installed extension: $obsoleteTarget"
        }
        if (Test-Path -LiteralPath $obsoleteTarget -PathType Leaf) {
            Remove-Item -LiteralPath $obsoleteTarget -Force
        }
    }

    foreach ($relativeFile in $relativeFiles) {
        $source = Join-Path $sourceRoot $relativeFile
        $target = Join-Path $targetRoot $relativeFile
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            throw "Source file is missing: $source"
        }
        $targetParent = Split-Path -Parent $target
        if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }
        Copy-Item -LiteralPath $source -Destination $target -Force
        $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
        $targetHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
        if ($sourceHash -ne $targetHash) {
            throw "Deployment hash mismatch: $relativeFile"
        }
    }

    foreach ($relativeDirectory in $relativeDirectories) {
        $sourceDirectory = Join-Path $sourceRoot $relativeDirectory
        if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) {
            throw "Source directory is missing: $sourceDirectory"
        }
        Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File | ForEach-Object {
            $childRelative = $_.FullName.Substring($sourceRoot.Length).TrimStart('\')
            $targetFile = Join-Path $targetRoot $childRelative
            $targetDirectory = Split-Path -Parent $targetFile
            if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
                New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
            }
            Copy-Item -LiteralPath $_.FullName -Destination $targetFile -Force
            $sourceHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash
            if ($sourceHash -ne $targetHash) {
                throw "Deployment hash mismatch: $childRelative"
            }
        }
    }
}

Set-Content -LiteralPath (Join-Path $sourceRoot "scripts\deploy-dev-extension.status") -Value "SUCCESS" -Encoding ASCII
