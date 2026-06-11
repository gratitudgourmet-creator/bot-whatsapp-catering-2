$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dbFiles = Get-ChildItem -Path $projectDir -Filter "catering.db*" -File

if (-not $dbFiles) {
  Write-Host "No se encontro catering.db. Inicia el bot una vez antes de hacer backup."
  exit 1
}

$candidateDirs = @()
if ($env:CATERING_BACKUP_DIR) {
  $candidateDirs += $env:CATERING_BACKUP_DIR
}
if ($env:OneDrive) {
  $candidateDirs += (Join-Path $env:OneDrive "Backups Catering")
}

$googleDrive = Join-Path $env:USERPROFILE "Google Drive"
if (Test-Path $googleDrive) {
  $candidateDirs += (Join-Path $googleDrive "Backups Catering")
}

$candidateDirs += (Join-Path $projectDir "backups")

$backupDir = $null
foreach ($candidate in $candidateDirs) {
  try {
    New-Item -ItemType Directory -Force -Path $candidate | Out-Null
    $testFile = Join-Path $candidate ".write-test"
    Set-Content -Path $testFile -Value "ok" -Encoding UTF8
    Remove-Item -Path $testFile -Force
    $backupDir = $candidate
    break
  } catch {
    Write-Host "No se pudo usar esta carpeta de backup: $candidate"
  }
}

if (-not $backupDir) {
  throw "No se encontro una carpeta disponible para guardar el backup."
}

$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"
$zipPath = Join-Path $backupDir "catering-db-$stamp.zip"

Compress-Archive -Path ($dbFiles.FullName) -DestinationPath $zipPath -Force

Write-Host "Backup creado:"
Write-Host $zipPath
