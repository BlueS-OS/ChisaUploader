param(
  [int]$Port = 5175
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Split-Path -Parent $root
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host ""
Write-Host "  Chisa - banco de pruebas" -ForegroundColor Red
Write-Host "  $prefix" -ForegroundColor DarkCyan
Write-Host "  Ctrl+C para parar" -ForegroundColor DarkGray
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  try {
    if ($req.HttpMethod -eq "POST") {
      $reader = New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Dispose()

      $name = ($req.Url.AbsolutePath.Trim("/") -replace "[^a-zA-Z0-9\-]", "-")
      if (-not $name) { $name = "post" }
      [IO.File]::WriteAllText((Join-Path $root "last-$name.json"), $body, (New-Object Text.UTF8Encoding($false)))

      $bytes = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
      $res.ContentType = "application/json; charset=utf-8"
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $path = $req.Url.AbsolutePath.TrimStart("/")
      if (-not $path) { $path = "harness.html" }

      $file = Join-Path $app $path
      if (Test-Path $file -PathType Leaf) {
        $ext = [IO.Path]::GetExtension($file)
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        $bytes = [IO.File]::ReadAllBytes($file)
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $res.StatusCode = 404
      }
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
