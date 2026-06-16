@echo off
setlocal
set RULE_NAME=Gratitud ERP Panel - Tailscale 3080

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Solicitando permisos de administrador para habilitar el acceso por Tailscale...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Habilitando acceso al panel ERP solo desde la red privada de Tailscale...
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=3080 remoteip=100.64.0.0/10 profile=any

echo.
echo Listo. Bruno puede probar:
echo http://100.67.8.81:3080
echo.
pause
