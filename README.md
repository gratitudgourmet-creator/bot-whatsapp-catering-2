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
```

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

En `NODE_ENV=production`, el sistema exige `PANEL_AUTH_PASSWORD`. El panel y las APIs quedan protegidas con autenticacion HTTP Basic.

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
- `Seguridad`: usuarios, roles, permisos, panel admin e historial.

Los submenus y subpantallas respetan los permisos visibles por rol.
Cuando una ventana emergente esta abierta, los submenus quedan ocultos para no tapar formularios.

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
- `Bromatologia`: documentacion sanitaria, etiquetas, vencimientos, decomisos, fotos/comprobantes y aprobaciones.
- `Ordenes de pago`: solicitudes formales a proveedores, personal o reintegros, con aprobacion, estado, comprobante e historial.

Los roles nuevos son `rrhh` y `bromatologia`. Finanzas puede trabajar ordenes de pago y administracion general puede revisar y aprobar todo desde Seguridad.

## Scripts

```bash
npm run check
npm test
npm start
```

## Notas de arquitectura

El sistema mantiene compatibilidad con archivos JSON para seguir funcionando localmente sin base de datos. Para produccion avanzada, el siguiente paso recomendado es migrar `DATA_DIR` a SQLite o PostgreSQL manteniendo las mismas rutas API.
