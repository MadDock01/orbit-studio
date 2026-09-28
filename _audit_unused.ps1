$ErrorActionPreference = "SilentlyContinue"
$out = @()

# 1) Sizes of .shot-* Chrome profile dirs under design\ and design-mockups\
$out += "== Chrome profile caches (.shot-*) =="
foreach ($d in @(Get-ChildItem -LiteralPath (Join-Path $PWD 'design') -Directory -Force | Where-Object { $_.Name -like '.shot-*' },
                 Get-ChildItem -LiteralPath (Join-Path $PWD 'design-mockups') -Directory -Force | Where-Object { $_.Name -like '.shot-*' })) {
    $s = (Get-ChildItem -LiteralPath $d.FullName -Recurse -Force | Measure-Object -Property Length -Sum).Sum
    $out += ("{0,14:N0}  ({1,8})  {2}" -f $s, (Get-ChildItem -LiteralPath $d.FullName -Recurse -Force -File).Count, $d.FullName.Replace($PWD.Path, '.'))
}

# 2) Which design / design-mockups files are referenced by shipped artifacts
$out += ""
$out += "== References to design files in shipped code =="
$referenced = @()
$refPatterns = @('design/', 'design-mockups/', 'preview.html', 'showcase.html', 'overview.html', 'themes.css', 'showcase.css', 'diag.js', 'shot.js')
foreach ($p in @('index.html', 'js/main.js', 'js/compx-loader.js', 'tools/dev-src/compx-loader.js', 'CSXS/manifest.xml', 'scripts/deploy-dev-extension.ps1', 'scripts/build-release.ps1', 'README.md')) {
    if (Test-Path $p) {
        $c = Get-Content -LiteralPath $p -Raw
        foreach ($r in $refPatterns) { if ($c -match [regex]::Escape($r)) { $referenced += "$p -> $r" } }
    }
}
if ($referenced.Count) { $referenced | Sort-Object -Unique | ForEach-Object { $out += $_ } }
else { $out += "(none - design folder is not referenced by anything shipped)" }

# 3) All top-level / design files with no reference anywhere in shipped code
$out += ""
$out += "== Files in design\ with no textual reference in index.html / scripts / deploy list =="
$shippedText = ""
foreach ($p in @('index.html', 'js/main.js', 'js/compx-loader.js', 'tools/dev-src/compx-loader.js', 'CSXS/manifest.xml', 'README.md')) {
    if (Test-Path $p) { $shippedText += (Get-Content -LiteralPath $p -Raw) }
}
Get-ChildItem -LiteralPath (Join-Path $PWD 'design') -File -Force | ForEach-Object {
    if ($_.Name -notlike '.*') {
        if ($shippedText -notmatch [regex]::Escape($_.Name)) { $out += ("unused? design\ " + $_.Name) }
    }
}

$out | Out-File -LiteralPath (Join-Path $PWD '_audit_result.txt') -Encoding utf8