# Chisa · hilo de subida — empaquetador
#
# Rehace chisa-ext-<version>.zip a partir del manifest, con rutas con barra
# normal (para que se abra igual en Windows, macOS y Linux).
#
#   powershell -ExecutionPolicy Bypass -File .\tools\pack.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$name = "chisa-ext-$version.zip"
$dst = Join-Path $root $name

$stage = Join-Path ([IO.Path]::GetTempPath()) ("chisa-pack-" + [guid]::NewGuid().ToString("N"))
$pkg = Join-Path $stage "chisa-ext"
New-Item -ItemType Directory -Force -Path (Join-Path $pkg "icons") | Out-Null

# Solo lo que necesita el navegador para cargarla descomprimida.
$files = @(
  "manifest.json", "page.js", "content.js",
  "popup.html", "popup.css", "popup.js",
  "README.md", "LICENSE"
)
foreach ($f in $files) {
  Copy-Item (Join-Path $root $f) (Join-Path $pkg $f) -Force
}
foreach ($icon in @("icon16.png", "icon32.png", "icon48.png", "icon128.png", "seal.svg")) {
  Copy-Item (Join-Path $root "icons\$icon") (Join-Path $pkg "icons\$icon") -Force
}

Remove-Item $dst -Force -ErrorAction SilentlyContinue
$zip = [IO.Compression.ZipFile]::Open($dst, [IO.Compression.ZipArchiveMode]::Create)
$base = (Resolve-Path $pkg).Path.TrimEnd("\")
foreach ($f in (Get-ChildItem $pkg -Recurse -File | Sort-Object FullName)) {
  $rel = $f.FullName.Substring($base.Length + 1) -replace "\\", "/"
  $entry = $zip.CreateEntry("chisa-ext/$rel", [IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = [DateTimeOffset]::new($f.LastWriteTime)
  $stream = $entry.Open()
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Dispose()
}
$zip.Dispose()

Remove-Item $stage -Recurse -Force
"listo: $name ($([math]::Round((Get-Item $dst).Length / 1kb, 1)) kB)"
