# Build local preview pages from the imweb widget files (.html.txt).
# Run:  powershell -ExecutionPolicy Bypass -File build-preview.ps1
# Output goes next to this script: home.html, <slug>.html ...
# (ASCII only on purpose: Windows PowerShell 5.1 misreads BOM-less UTF-8 scripts.)

$ErrorActionPreference = 'Stop'
$out  = $PSScriptRoot
$root = Split-Path $out -Parent
$utf8 = [Text.Encoding]::UTF8
$bom  = New-Object System.Text.UTF8Encoding($true)

function Get-Dir($prefix) {
  $d = Get-ChildItem $root -Directory | Where-Object { $_.Name -like "$prefix*" } | Select-Object -First 1
  if (-not $d) { throw "folder not found: $prefix" }
  $d.FullName
}
function Read-Text($path) { [IO.File]::ReadAllText($path, $utf8) }
function Get-Widget($dir, $pattern) {
  $f = Get-ChildItem $dir -File | Where-Object { $_.Name -like $pattern } | Select-Object -First 1
  if (-not $f) { throw "widget not found: $pattern" }
  Read-Text $f.FullName
}

$d1 = Get-Dir '1_'; $d2 = Get-Dir '2_'; $d3 = Get-Dir '3_'; $d4 = Get-Dir '4_'
$favicon  = '../' + (Split-Path $d4 -Leaf) + '/favicon.ico'
$template = Read-Text (Join-Path $out '_template.html')
$board    = Read-Text (Join-Path $out '_board.html')

$w = @{}
foreach ($n in 0..9) { $w[$n] = Get-Widget $d1 "$n-*" }

# imweb slugs (/about, /sickzone#resp, /) -> local files (about.html, sickzone.html#resp, home.html)
function Convert-Links($html) {
  $html = $html.Replace('href="/"', 'href="home.html"')
  [regex]::Replace($html, 'href="/([a-z][a-z0-9-]*)(#[^"]*)?"', {
    param($m) 'href="' + $m.Groups[1].Value + '.html' + $m.Groups[2].Value + '"'
  })
}

function Write-Page($slug, $title, $parts) {
  $body = Convert-Links (($parts -join "`r`n`r`n"))
  $html = $template.Replace('{{TITLE}}', $title).Replace('{{FAVICON}}', $favicon).Replace('{{BODY}}', $body)
  [IO.File]::WriteAllText((Join-Path $out "$slug.html"), $html, $bom)
  Write-Host "  $slug.html"
}

$count = 0
Write-Host 'Building preview pages...'

# Home : 1 ~ 9
Write-Page 'home' ([string][char]0xD648) @($w[1], $w[2], $w[3], $w[4], $w[5], $w[6], $w[7], $w[8], $w[9]); $count++

# Detail pages : [1] [0] [body] [8] [9]
foreach ($f in Get-ChildItem $d2 -File -Filter '*.html.txt' | Sort-Object Name) {
  $m = [regex]::Match($f.Name, '^\d+-(.+?)\s*\(([a-z0-9-]+)\)\.html\.txt$')
  if (-not $m.Success) { Write-Warning "skip: $($f.Name)"; continue }
  Write-Page $m.Groups[2].Value $m.Groups[1].Value @($w[1], $w[0], (Read-Text $f.FullName), $w[8], $w[9]); $count++
}

# Board pages : [1] [0] [hero] [board placeholder] [8] [9]
foreach ($f in Get-ChildItem $d3 -File -Filter '*.html.txt' | Sort-Object Name) {
  $m = [regex]::Match($f.Name, '^(.+?)\s*\(([a-z0-9-]+)\)\.html\.txt$')
  if (-not $m.Success) { Write-Warning "skip: $($f.Name)"; continue }
  $words = $m.Groups[1].Value -split ' '
  $title = ($words[0..([Math]::Max(0, $words.Count - 3))]) -join ' '   # drop the trailing 2 words (hero label)
  Write-Page $m.Groups[2].Value $title @($w[1], $w[0], (Read-Text $f.FullName), $board, $w[8], $w[9]); $count++
}

Write-Host "Done: $count pages -> $out"
