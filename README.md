# Catering ERP

Sistema de control comercial, presupuestos, recetas, compras y eventos para catering.

## Uso local

1. Instalar dependencias:

```bash
npm install
```

2. Iniciar panel y bot:

```bash
npm start
```

En Windows tambien se puede usar `iniciar-bot.bat`.

## Modo panel/ERP sin WhatsApp

Para usar solo el panel:

```bash
BOT_SKIP_WHATSAPP=1 npm start
```

En PowerShell:

```powershell
$env:BOT_SKIP_WHATSAPP="1"; npm start
```

## Produccion web

Variables recomendadas:

```env
NODE_ENV=production
PORT=3080
PANEL_HOST=0.0.0.0
BOT_SKIP_WHATSAPP=1
DATA_DIR=./data
PANEL_AUTH_USER=admin
PANEL_AUTH_PASSWORD=una-contrasena-segura
PANEL_SESSION_SECRET=un-texto-largo-aleatorio
PANEL_PUBLIC_URL=https://sistema.gratitudgourmet.com
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
PURCHASE_SHEETS_SYNC_ENABLED=false
ACCOUNTANT_SHEETS_SYNC_ENABLED=false
```

Para publicar en `https://sistema.gratitudgourmet.com.ar`, la opcion recomendada es Hostinger VPS + Nginx + HTTPS. La guia completa esta en:

```text
deploy/README_HOSTINGER_VPS.md
```

Archivos de despliegue incluidos:

- `deploy/env.production.example`: variables seguras para produccion.
- `deploy/nginx/gratitud-erp.conf`: proxy web para `sistema.gratitudgourmet.com.ar`.
- `deploy/systemd/gratitud-erp.service`: servicio automatico de Linux.
- `deploy/scripts/backup-data.sh`: backup diario de la base JSON.

En produccion inicial se recomienda mantener `BOT_SKIP_WHATSAPP=1` para publicar primero el ERP estable. El bot de WhatsApp puede seguir local o configurarse en una segunda etapa.

Sheets no debe usarse como base de datos principal. Por defecto `PURCHASE_SHEETS_SYNC_ENABLED=false` y `ACCOUNTANT_SHEETS_SYNC_ENABLED=false`, por lo que compras, pagos y deudas se guardan en la base del ERP dentro de `DATA_DIR`. Sheets queda solo como importacion/exportacion manual si se habilita explicitamente.

El hosting debe conservar `DATA_DIR` en un volumen persistente. Ahi se guardan:

- `bot-state.json`
- `clientes-bot.json`
- `recetas-bot.json`
- `precios-productos-bot.json`
- `costos-bot.json`
- `eventos-erp.json`
- `presupuestos-erp.json`
- `compras-erp.json`
- `ordenes-compra-erp.json`
- `recepciones-compra-erp.json`
- `inventario-erp.json`
- `personal-erp.json`
- `asistencias-personal-erp.json`
- `sueldos-erp.json`
- `bromatologia-erp.json`
- `ordenes-pago-erp.json`
- `backups/`

## Seguridad

En `NODE_ENV=production`, el sistema exige `PANEL_AUTH_PASSWORD`. El panel usa login por usuario/email, sesiones, roles y permisos por modulo/funcion.

El usuario administrador inicial se crea con:

- `PANEL_AUTH_USER`
- `PANEL_AUTH_PASSWORD`

Luego se pueden crear usuarios desde `Seguridad > Usuarios`, asociarles email real y asignar rol. El login acepta usuario o email.

Para dar acceso a una persona sin compartir claves manualmente:

1. Crear el usuario en `Seguridad > Usuarios`.
2. Cargar su email.
3. Dejar la clave vacia si se usara invitacion.
4. Guardar.
5. Tocar `Enviar invitacion`.

El usuario recibe un enlace temporal para crear su propia clave. Las invitaciones vencen en 48 horas.

Para recuperar clave desde el correo se deben configurar:

- `PANEL_PUBLIC_URL`: dominio publico del ERP.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: casilla SMTP que envia los enlaces.

Si SMTP no esta configurado, el sistema avisa desde la pantalla de login.

Endpoint publico para monitoreo:

```text
GET /health
```

## Navegacion del panel

El panel organiza las areas principales como modulos con submenus. Al pasar el mouse por una pestaña se despliegan sus subfunciones. Al tocar una pestaña, se abre directamente la vista principal del modulo:

- `ERP`: lectura rapida, alertas y estados de eventos.
- `Comercial`: oportunidades, pipeline, eventos, presupuestos, clientes y lugares.
- `Compras`: compras, ordenes de compra, inventario e insumos con variacion.
- `Finanzas`: resumen, cobros por evento, deudas, reintegros y ordenes de pago.
- `Personal/RRHH`: legajos, asistencia, horarios, sueldos y horas.
- `Bromatologia`: nuevo registro, vencimientos, decomisos y aprobaciones.
- `Seguridad`: usuarios, roles, permisos, panel admin, estado del servidor e historial.

Los submenus y subpantallas respetan los permisos visibles por rol.
Cuando una ventana emergente esta abierta, los submenus quedan ocultos para no tapar formularios.

En mobile, las pestanas se reemplazan por un selector compacto de `Modulos`. Las tablas largas, como compras, se muestran en tarjetas resumidas y la planilla de compras se pagina para no cargar todos los registros juntos.

Desde `Seguridad > Servidor` el administrador puede ver actividad interna del ERP: requests totales, errores HTTP, memoria usada, rutas mas consultadas y ultimas llamadas. Sirve para detectar lentitud, endpoints con errores y carga general del panel sin entrar a la consola del VPS.

## Exportacion tipo Google Sheets

El ERP expone la estructura tabular en:

```text
GET /api/sheets
GET /api/export.xlsx
```

El Excel incluye hojas separadas:

- `Dashboard`
- `Eventos`
- `Presupuestos`
- `Presupuesto_Recetas`
- `Compras`
- `Compra_Items`
- `Clientes`
- `Recetas`
- `Receta_Items`
- `Productos_Precios`

En el panel, la pestaña `ERP` tiene el boton `Descargar Excel`.

## Sincronizacion de compras con Google Sheets

El dashboard permite crear, editar y eliminar compras desde el panel. Para activar edicion/eliminacion tambien desde Google Sheets:

1. Copiar el contenido de `docs/google-apps-script-compras.gs` en Apps Script de la planilla.
2. Configurar propiedades del script:
   - `DASHBOARD_SYNC_URL`: URL publica del panel, terminada en `/api/purchase-sync`.
   - `PURCHASE_SYNC_TOKEN`: el mismo valor que `PURCHASE_SYNC_TOKEN` o `purchaseSyncToken`.
3. Crear un disparador instalable para la funcion `onEdit`.
4. En `config-bot.json`, cambiar `purchaseBidirectionalSyncEnabled` a `true`.

Para eliminar desde Sheets, escribir `ELIMINAR` en la columna `Accion` o `Accion Sync` de la fila. El script elimina la fila y avisa al dashboard.

## Compras, recepcion e inventario

El modulo `Compras` permite:

- Crear ordenes de compra asociadas a eventos.
- Recibir productos separando mercaderia, vajilla, alquileres y equipamiento.
- Registrar diferencias entre pedido y recibido.
- Bloquear pagos a proveedores cuando existen diferencias sin resolver.
- Convertir una recepcion aceptada en compra real.
- Generar movimientos de inventario para mercaderia, vajilla y equipamiento.

El procedimiento operativo completo esta en `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`, seccion `CPR-02 - Ordenes de compra, recepcion e inventario`.

## Personal, bromatologia y ordenes de pago

El ERP suma modulos separados para:

- `Personal/RRHH`: legajos, roles, disponibilidad, turnos por evento, asistencia, novedades y pagos de sueldo.
- `Sueldos y horas` toma asistencias del periodo para mostrar horas trabajadas y monto antes de guardar una liquidacion.
- `Bromatologia`: documentacion sanitaria, etiquetas, vencimientos, decomisos, fotos/comprobantes y aprobaciones.
- `Ordenes de pago`: solicitudes formales a proveedores, personal o reintegros, con aprobacion, estado, comprobante e historial.
- `Logistica Evento` controla sobrantes en la instancia post-evento desde consumibles reservados y permite reingresar stock cuando corresponde.
- `Stock` separa `Stock contable` (recepciones convertidas) de `Inventario operativo` (vajilla, utensilios, contenedores y consumibles seleccionables por evento).
- `Reportes` permite descargas separadas por eventos, compras, proveedores, clientes y stock contable, ademas del Excel general.

Los roles nuevos son `rrhh` y `bromatologia`. Finanzas puede trabajar ordenes de pago y administracion general puede revisar y aprobar todo desde Seguridad.

## Scripts

```bash
npm run check
npm test
npm start
```

## Notas de arquitectura

El sistema mantiene compatibilidad con archivos JSON para seguir funcionando localmente sin base de datos. Para produccion avanzada, el siguiente paso recomendado es migrar `DATA_DIR` a SQLite o PostgreSQL manteniendo las mismas rutas API.
