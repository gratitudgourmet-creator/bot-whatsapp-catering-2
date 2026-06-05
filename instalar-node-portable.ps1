$ErrorActionPreference = "Stop"

$version = "v24.12.0"
$folderName = "node-$version-win-x64"
$botDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $botDir ".runtime"
$nodeDir = Join-Path $runtimeDir $folderName
$zipPath = Join-Path $runtimeDir "$folderName.zip"
$downloadUrl = "https://nodejs.org/dist/$version/$folderName.zip"
$downloadFallbackUrl = "https://r2.nodejs.org/download/release/$version/$folderName.zip"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (Test-Path (Join-Path $nodeDir "node.exe")) {
  Write-Host "Node.js portable ya esta instalado."
  & (Join-Path $nodeDir "node.exe") --version
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

Write-Host "Descargando Node.js desde $downloadUrl"
try {
  Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
} catch {
  Write-Host "Reintentando desde endpoint oficial alternativo..."
  try {
    Invoke-WebRequest -Uri $downloadFallbackUrl -OutFile $zipPath -UseBasicParsing
  } catch {
    Write-Host "Reintentando descarga con metodo alternativo seguro..."
    try {
      Add-Type -AssemblyName System.Net.Http
      $handler = New-Object System.Net.Http.HttpClientHandler
      $handler.UseDefaultCredentials = $true
      $client = New-Object System.Net.Http.HttpClient($handler)
      $client.Timeout = [TimeSpan]::FromMinutes(5)
      $response = $client.GetAsync($downloadFallbackUrl).Result
      $response.EnsureSuccessStatusCode() | Out-Null
      $stream = $response.Content.ReadAsStreamAsync().Result
      $file = [System.IO.File]::Create($zipPath)
      try {
        $stream.CopyTo($file)
      } finally {
        $file.Close()
        $stream.Close()
        $client.Dispose()
      }
    } catch {
      if (Get-Command certutil.exe -ErrorAction SilentlyContinue) {
        & certutil.exe -urlcache -split -f $downloadFallbackUrl $zipPath
        if ($LASTEXITCODE -ne 0) {
          throw "certutil.exe no pudo descargar Node.js. Codigo: $LASTEXITCODE"
        }
      } elseif (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -L --retry 5 --retry-delay 2 --output $zipPath $downloadFallbackUrl
        if ($LASTEXITCODE -ne 0) {
          throw "curl.exe no pudo descargar Node.js. Codigo: $LASTEXITCODE"
        }
      } else {
        throw
      }
    }
  }
}

if (!(Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 1000000) {
  throw "La descarga de Node.js no se completo correctamente."
}

Write-Host "Descomprimiendo Node.js..."
Expand-Archive -Path $zipPath -DestinationPath $runtimeDir -Force
Remove-Item -LiteralPath $zipPath -Force

Write-Host "Verificando instalacion..."
& (Join-Path $nodeDir "node.exe") --version
