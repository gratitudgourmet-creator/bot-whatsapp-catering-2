@echo off
set "BOT_DIR=%~dp0"
set "BOT_START=%BOT_DIR%iniciar-bot.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$startup=[Environment]::GetFolderPath('Startup'); $shortcutPath=Join-Path $startup 'Bot WhatsApp Catering.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($shortcutPath); $shortcut.TargetPath='%BOT_START%'; $shortcut.WorkingDirectory='%BOT_DIR%'; $shortcut.Save()"

echo Listo. El bot intentara iniciarse automaticamente cuando Windows arranque.
pause
