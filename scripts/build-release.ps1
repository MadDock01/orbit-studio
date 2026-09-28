[CmdletBinding()]
param(
    [string]$OutputRoot,
    [string]$ExpectedVersion,
    [string]$ZxpSignCmd,
    [string]$Certificate,
    [string]$CertificatePassword,
    [string]$JsxbinCompiler,
    [string]$TimestampUrl = "http://timestamp.digicert.com",
    [switch]$SkipValidation
)

$ErrorActionPreference = "Stop"
$sourceRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $sourceRoot "dist"
}
$outputRootFull = [System.IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')

function Assert-ChildPath {
    param([string]$Parent, [string]$Child, [string]$Label)
    $parentPrefix = $Parent.TrimEnd('\') + '\'
    if (-not $Child.StartsWith($parentPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label must stay inside $Parent. Resolved path: $Child"
    }
}

function Copy-ReleaseFile {
    param([string]$RelativePath, [string]$StageRoot)
    $source = Join-Path $sourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required release file is missing: $RelativePath"
    }
    $target = Join-Path $StageRoot $RelativePath
    $targetDirectory = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $target -Force
}

function Test-ReleaseNoise {
    param([string]$RelativePath)
    $normalized = $RelativePath.Replace('/', '\')
    if ($normalized -match '(^|\\)(\.cursor|\.freebuff|tools|tests|docs)(\\|$)') { return $true }
    if ($normalized -match '(?i)\.(bak|log|tmp|status|pid)$') { return $true }
    if ($normalized -match '(^|\\)(Thumbs\.db|\.DS_Store)$') { return $true }
    return $false
}

$manifestPath = Join-Path $sourceRoot "CSXS\manifest.xml"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "CSXS manifest is missing."
}
$manifestText = [System.IO.File]::ReadAllText($manifestPath)
$versionMatch = [regex]::Match($manifestText, 'ExtensionBundleVersion="([^"]+)"')
if (-not $versionMatch.Success) {
    throw "Could not read ExtensionBundleVersion from CSXS/manifest.xml."
}
$version = $versionMatch.Groups[1].Value
if ($ExpectedVersion -and $ExpectedVersion -ne $version) {
    throw "Version mismatch: expected $ExpectedVersion but manifest contains $version."
}
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') {
    throw "Release version is not valid semantic versioning: $version"
}

if (-not $SkipValidation) {
    Write-Host "Running production validation..."
    & node (Join-Path $sourceRoot "tests\static-validation.js")
    if ($LASTEXITCODE -ne 0) {
        throw "Static validation failed; release staging was not created."
    }
}

$packageName = "CompX-Orbit-Studio-v$version"
if (-not (Test-Path -LiteralPath $outputRootFull -PathType Container)) {
    New-Item -ItemType Directory -Path $outputRootFull -Force | Out-Null
}
$stageRoot = [System.IO.Path]::GetFullPath((Join-Path $outputRootFull $packageName)).TrimEnd('\')
Assert-ChildPath -Parent $outputRootFull -Child $stageRoot -Label "Release staging directory"
if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

# Root/runtime files are intentionally allowlisted. Developer scripts, tests,
# preview databases, logs and local inventories never enter the staged package.
$releaseFiles = @(
    "index.html",
    "scripts\autocaptions-runtime.json",
    "scripts\background-removal-runtime.json"
)
$releaseDirectories = @(
    "assets",
    "bin",
    "css",
    "CSXS",
    "icons",
    "js",
    "jsx",
    "plugins",
    "presets",
    "vendor"
)

foreach ($relativeFile in $releaseFiles) {
    Copy-ReleaseFile -RelativePath $relativeFile -StageRoot $stageRoot
}
foreach ($relativeDirectory in $releaseDirectories) {
    $sourceDirectory = Join-Path $sourceRoot $relativeDirectory
    if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) {
        throw "Required release directory is missing: $relativeDirectory"
    }
    Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File -Force | ForEach-Object {
        $relativePath = $_.FullName.Substring($sourceRoot.Length + 1)
        if (-not (Test-ReleaseNoise -RelativePath $relativePath)) {
            Copy-ReleaseFile -RelativePath $relativePath -StageRoot $stageRoot
        }
    }
}

if ($JsxbinCompiler) {
    & node (Join-Path $sourceRoot "tools\prepare-jsxbin-release.js") $stageRoot $JsxbinCompiler
    if ($LASTEXITCODE -ne 0) { throw "JSXBIN release preparation failed; package was not signed." }
}
$stagedHost = if ($JsxbinCompiler) { "jsx\hostscript.jsxbin" } else { "jsx\hostscript.jsx" }
$requiredStagedFiles = @(
    "CSXS\manifest.xml",
    "index.html",
    "js\compx-loader.js",
    "js\compx-license.js",
    "js\license-gate.js",
    "js\main.js",
    $stagedHost,
    "plugins\win\LiquidGlass.aex",
    "plugins\mac\LiquidGlass.plugin\Contents\MacOS\LiquidGlass",
    "vendor\onnxruntime\ort-wasm-simd-threaded.wasm"
)
foreach ($required in $requiredStagedFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $stageRoot $required) -PathType Leaf)) {
        throw "Staged package is incomplete: $required"
    }
}

$noise = Get-ChildItem -LiteralPath $stageRoot -Recurse -File -Force | Where-Object {
    $relativePath = $_.FullName.Substring($stageRoot.Length + 1)
    Test-ReleaseNoise -RelativePath $relativePath
}
if ($noise) {
    throw "Release staging contains forbidden development files: $($noise.FullName -join ', ')"
}

$totalBytes = 0
$hashEntries = Get-ChildItem -LiteralPath $stageRoot -Recurse -File -Force |
    Sort-Object FullName |
    ForEach-Object {
        $totalBytes += $_.Length
        [pscustomobject][ordered]@{
            path = $_.FullName.Substring($stageRoot.Length + 1).Replace('\', '/')
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
$fileManifest = [ordered]@{
    schema = 1
    product = "Orbit Studio"
    version = $version
    fileCount = @($hashEntries).Count
    totalBytes = $totalBytes
    files = @($hashEntries)
}
$fileManifestPath = Join-Path $outputRootFull "$packageName.files.json"
[System.IO.File]::WriteAllText($fileManifestPath, ($fileManifest | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))

$signingValues = @($ZxpSignCmd, $Certificate, $CertificatePassword) | Where-Object { $_ }
$zxpPath = Join-Path $outputRootFull "$packageName.zxp"
if ($signingValues.Count -gt 0 -and $signingValues.Count -lt 3) {
    throw "ZXP signing requires -ZxpSignCmd, -Certificate, and -CertificatePassword together."
}
if ($signingValues.Count -eq 3) {
    if (-not (Test-Path -LiteralPath $ZxpSignCmd -PathType Leaf)) { throw "ZXPSignCmd was not found: $ZxpSignCmd" }
    if (-not (Test-Path -LiteralPath $Certificate -PathType Leaf)) { throw "Signing certificate was not found: $Certificate" }
    if (Test-Path -LiteralPath $zxpPath) { Remove-Item -LiteralPath $zxpPath -Force }
    & $ZxpSignCmd -sign $stageRoot $zxpPath $Certificate $CertificatePassword -tsa $TimestampUrl
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zxpPath -PathType Leaf)) {
        throw "ZXPSignCmd failed to create the signed package."
    }
    Write-Host "Signed ZXP: $zxpPath"
} else {
    Write-Host "Signing credentials were not supplied; clean staging was created without a ZXP."
}

Write-Host "Release staging: $stageRoot"
Write-Host "File manifest:   $fileManifestPath"
Write-Host "Files: $($fileManifest.fileCount)  Bytes: $($fileManifest.totalBytes)"
