# Integracion ZKTeco MB20-VL por PUSH/ADMS

## Arquitectura

La integracion recibe marcaciones del reloj ZKTeco MB20-VL por HTTP PUSH/ADMS sin ZKBioTime, QuickPass, ZKBio Zlink ni servicios externos.

- Receptor ADMS separado: `zkteco-adms-receiver.js`.
- Modulo de protocolo y persistencia: `lib/zkteco-adms.js`.
- Endpoints administrativos autenticados del ERP: `/api/biometric/*` en `whatsapp-catering-bot.js`.
- Interfaz administrativa: pestaña `Biometrico` dentro de Personal/RRHH en `approval-panel.html`.
- Persistencia: `catering.db` SQLite dentro de `DATA_DIR`.

El receptor ADMS no debe publicarse por Nginx. Debe escuchar en una interfaz alcanzable desde la LAN del terminal.

## Variables de entorno

```env
ZKTECO_ENABLED=false
ZKTECO_BIND_HOST=0.0.0.0
ZKTECO_PORT=8080
ZKTECO_ALLOWED_IPS=192.168.1.201
ZKTECO_ALLOWED_SERIALS=CO8G230760214
ZKTECO_TIMEZONE=America/Argentina/Buenos_Aires
ZKTECO_DEBOUNCE_SECONDS=180
ZKTECO_LOG_RAW_PAYLOADS=true
ZKTECO_MAX_BODY_BYTES=1048576
ZKTECO_BODY_TIMEOUT_MS=5000
```

`ZKTECO_ENABLED` queda apagado por defecto. Las listas de IPs y seriales aceptan valores separados por coma.

## Configuracion del MB20-VL

Datos confirmados:

- IP terminal: `192.168.1.201`.
- Servidor ADMS: `192.168.1.200`.
- Puerto: `8080`.
- Serial: `CO8G230760214`.
- Push Protocol: `2.4.1`.
- Firmware: `ZMM510-NF-Ver1.0.21`.

El servidor receptor debe correr en una maquina con conectividad directa a `192.168.1.201`. Si el ERP productivo esta en un VPS fuera de esa LAN, el receptor debe correr localmente o mediante una red privada/relay propio posterior. No abrir el puerto 4370 ni el ADMS a Internet.

## Endpoints ADMS

El receptor soporta texto plano:

- `GET /iclock/cdata`
- `POST /iclock/cdata?table=options`
- `POST /iclock/cdata?table=ATTLOG`
- `POST /iclock/cdata?table=OPERLOG`
- `GET /iclock/getrequest`

`getrequest` responde sin tareas (`OK`). No se envian comandos destructivos ni descargas historicas automaticas.

## ATTLOG

Ejemplo:

```text
2	2026-07-20 16:33:44	255	15	0	0	0	0	0	0
```

Mapeo inicial:

- columna 1: `device_employee_id`.
- columna 2: `device_timestamp`.
- columna 3: `attendance_status`.
- columna 4: `verify_method`.
- codigo `15`: `face`.
- codigos desconocidos: `unknown`.

El horario del dispositivo se conserva como horario local, no como UTC. La zona operativa es `America/Argentina/Buenos_Aires`.

## Persistencia

Tablas creadas en SQLite:

- `biometric_events`: fichadas crudas e idempotentes.
- `biometric_staff_links`: vinculos activos/inactivos entre PIN del reloj y empleado ERP.
- `biometric_device_status`: ultima comunicacion y metadatos seguros del terminal.

La clave de idempotencia es SHA-256 de:

```text
deviceSerial|deviceEmployeeId|deviceTimestampNormalizado|attendanceStatus|verifyMethod|rawLineNormalizada
```

Los duplicados no se insertan ni se auditan como errores.

## Seguridad

- Allowlist por IP real de socket.
- Allowlist por numero de serie.
- Limite de body y timeout.
- Sin stack traces en respuestas.
- Sin fotos, huellas ni plantillas faciales.
- Sin confianza en `X-Forwarded-For`.
- Receptor separado del Nginx publico.

Regla recomendada de firewall:

```text
Permitir TCP 8080 unicamente desde 192.168.1.201
```

## Vinculacion y reprocesamiento

El ERP no asume que el PIN del reloj coincida con el ID interno del empleado. La asociacion se hace desde Personal/RRHH > Biometrico.

Flujo:

1. El reloj envia ATTLOG.
2. El sistema guarda el evento crudo.
3. Si no hay vinculo activo, queda `unlinked`.
4. Al vincular PIN con legajo, los eventos pasan a `received`.
5. El admin ejecuta reprocesamiento.
6. Se crean asistencias con `source = zkteco`.

No se modifican liquidaciones automaticamente. No se pisan asistencias manuales existentes.

## Reglas de asistencia iniciales

- Rebote: ignora marcas repetidas del mismo empleado dentro de `ZKTECO_DEBOUNCE_SECONDS`.
- Primera marca valida del dia operativo: entrada.
- Ultima marca valida: salida.
- Una sola marca: asistencia observada/incompleta.
- Marcas entre 00:00 y 05:59 se asocian al dia operativo anterior.
- No calcula tardanzas, salidas anticipadas ni horas extra hasta definir horarios esperados.

## Ejecucion local

Windows o Linux:

```bash
ZKTECO_ENABLED=true node zkteco-adms-receiver.js
```

En PowerShell:

```powershell
$env:ZKTECO_ENABLED="true"
node .\zkteco-adms-receiver.js
```

### Prueba Windows con ERP y receptor en el mismo DATA_DIR

Para ver en la UI del ERP las fichadas recibidas por el receptor local, ambos procesos deben apuntar al mismo `DATA_DIR`. Si el receptor guarda en una carpeta temporal y el ERP abre otra base, la fichada queda guardada pero no aparece en la pantalla.

Ejemplo receptor local:

```powershell
$env:DATA_DIR="$env:TEMP\gratitud-zkteco-real"
$env:ZKTECO_ENABLED="true"
$env:ZKTECO_BIND_HOST="0.0.0.0"
$env:ZKTECO_PORT="8080"
$env:ZKTECO_ALLOWED_IPS="192.168.1.201"
$env:ZKTECO_ALLOWED_SERIALS="CO8G230760214"
node .\zkteco-adms-receiver.js
```

Ejemplo ERP local, en otra terminal, usando el mismo `DATA_DIR`:

```powershell
$env:DATA_DIR="$env:TEMP\gratitud-zkteco-real"
$env:BOT_SKIP_WHATSAPP="1"
$env:PANEL_AUTH_USER="admin"
$env:PANEL_AUTH_PASSWORD="admin"
node .\whatsapp-catering-bot.js
```

Si la carpeta temporal ya contiene `usuarios-erp.json`, cambiar `PANEL_AUTH_PASSWORD` no cambia la clave del usuario existente. En ese caso usar la clave ya creada para ese `DATA_DIR` o iniciar con una carpeta nueva de prueba.

## systemd

Archivo incluido: `deploy/systemd/zkteco-adms.service`.

Debe instalarse solo en una maquina que pueda ser alcanzada por el MB20-VL. El servicio usa `/etc/gratitud-erp/gratitud-erp.env` y ejecuta con usuario `gratitud`.

## Pruebas manuales

```bash
curl "http://127.0.0.1:8080/iclock/getrequest?SN=CO8G230760214"
curl -X POST "http://127.0.0.1:8080/iclock/cdata?SN=CO8G230760214&table=ATTLOG&Stamp=9999" \
  -H "Content-Type: text/plain" \
  --data-binary $'2\t2026-07-20 16:33:44\t255\t15\t0\t0\t0\t0\t0\t0\n'
```

PowerShell:

```powershell
Invoke-WebRequest "http://127.0.0.1:8080/iclock/getrequest?SN=CO8G230760214"
$body = "2`t2026-07-20 16:33:44`t255`t15`t0`t0`t0`t0`t0`t0`n"
Invoke-WebRequest -Method POST "http://127.0.0.1:8080/iclock/cdata?SN=CO8G230760214&table=ATTLOG&Stamp=9999" -Body $body -ContentType "text/plain"
```

## Historicos

El terminal tiene marcaciones acumuladas. Esta version no solicita ni borra historicos. Una importacion historica futura debe ser una operacion explicita, auditada y sin impacto automatico sobre liquidaciones cerradas.

## Desactivacion

1. Definir `ZKTECO_ENABLED=false`.
2. Detener/deshabilitar `zkteco-adms.service`.
3. Mantener las tablas crudas para auditoria.
