@echo off
cd /d "%~dp0"

echo Instalando Node.js portable para Bot WhatsApp Catering...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-node-portable.ps1"

if errorlevel 1 (
  echo.
  echo No se pudo instalar Node.js portable.
  echo Revise el mensaje anterior o instale Node.js manualmente desde https://nodejs.org/
  echo.
) else (
  echo.
  echo Listo. Ahora puede abrir iniciar-bot.bat.
  echo.
)
pause
