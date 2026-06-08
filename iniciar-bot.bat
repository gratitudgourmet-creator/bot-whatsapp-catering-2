@echo off
cd /d "%~dp0"
echo Iniciando Bot WhatsApp Catering...

set "LOCAL_NODE=%~dp0.runtime\node-v22.21.1-win-x64\node.exe"
set "OLD_LOCAL_NODE=%~dp0.runtime\node-v24.12.0-win-x64\node.exe"
set "CODEX_NODE=%~dp0.runtime\codex-node\node.exe"

echo Cerrando instancias anteriores del bot en esta carpeta...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$project = (Resolve-Path '%~dp0').Path.TrimEnd('\'); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like ('*' + $project + '*whatsapp-catering-bot.js*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
timeout /t 2 /nobreak >nul

if exist "%LOCAL_NODE%" (
  "%LOCAL_NODE%" whatsapp-catering-bot.js
) else if exist "%OLD_LOCAL_NODE%" (
  "%OLD_LOCAL_NODE%" whatsapp-catering-bot.js
) else if exist "%CODEX_NODE%" (
  "%CODEX_NODE%" whatsapp-catering-bot.js
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo No se encontro Node.js en esta computadora.
    echo Ejecute primero instalar-node-portable.bat y vuelva a abrir este archivo.
    echo.
  ) else (
    node whatsapp-catering-bot.js
  )
)
pause
