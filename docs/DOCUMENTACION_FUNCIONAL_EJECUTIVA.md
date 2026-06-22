# Documentacion funcional, ejecutiva y comercial del sistema

Proyecto analizado: `bot-whatsapp-catering-2`

Fecha de analisis: 2026-06-19

## Fuentes principales revisadas

- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\whatsapp-catering-bot.js`: servidor, bot, reglas de negocio, API, persistencia, integraciones.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\approval-panel.html`: interfaz web del ERP y llamadas al backend.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\package.json`: dependencias y comandos.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\README.md`: instrucciones de uso, produccion, seguridad y sincronizacion.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\.env.example`: variables de entorno esperadas.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\roles-erp.json` y `usuarios-erp.json`: roles, permisos y usuarios reales.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\google-apps-script\compras-webhook.gs`: integracion con Google Sheets para compras.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\google-apps-script\pagos-contador-webhook.gs`: integracion con Google Sheets para pagos del contador.
- `C:\Users\acer\Documents\GitHub\bot-whatsapp-catering-2\docs\Manual_pagos_contador.md` y `docs\Configurar_sincronizacion_pagos_contador.md`: documentacion operativa existente.

---

## Fase 1 - Inventario del sistema

### Actualizacion 22/06/2026 - Navegacion ejecutiva y modulo Eventos

Se separo el control integral de eventos en un modulo propio `Eventos`, independiente de `Comercial`. El modulo `ERP` queda enfocado en lectura ejecutiva, KPIs, alertas y accesos rapidos. `Comercial` conserva oportunidades, pipeline, presupuestos, clientes y lugares.

Cambios funcionales:

- Nueva pestaña `Eventos` en el catalogo de vistas y roles.
- `Eventos` agrupa control integral, estados/cierres y presupuestos asociados.
- `ERP` prioriza venta aceptada, margen estimado, compras pendientes, proximos eventos, deudas y cierres por autorizar.
- Las tablas largas se muestran dentro de contenedores con scroll interno y encabezado fijo.
- Las fichas de evento usan modal amplio para revisar datos completos sin rebalse.
- El panel admin de Seguridad suma accesos accionables hacia usuarios, roles, historial, opciones operativas y modulos.

Archivos modificados:

- `whatsapp-catering-bot.js`
- `approval-panel.html`
- `roles-erp.json`
- `assets/gratitud-gourmet-logo.png`
- `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`

### Actualizacion 22/06/2026 - Backlog UX de alto impacto

Se aplico una capa visual y de uso para corregir los problemas mas visibles del panel:

- Dashboard `ERP` mas compacto y accionable, sin tarjeta hero gigante.
- Tablas largas con contenedor de scroll interno, encabezado fijo y columnas mas estables.
- Fichas de evento en modal amplio, con ancho casi completo para revisar datos operativos y administrativos.
- Formularios, selects, filtros y buscadores con estilo unificado.
- Acciones de fila concentradas en boton de tres puntos en compras, eventos y clientes.
- Pipeline comercial mas compacto y legible.
- Logistica Evento y tarjetas operativas reforzadas para mobile-first y sin rebalse.
- Alertas del ERP accionables mediante modal de detalle.
- Panel admin corregido para abrir el administrador de proveedores desde el acceso correspondiente.

Archivos modificados:

- `approval-panel.html`
- `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`

### Actualizacion 22/06/2026 - Rediseño propuesto del panel

Se aplico la primera version estructural del rediseño del panel:

- Header con marca `Gratitud Gourmet ERP`, buscador global central y bloque derecho de usuario/rol/estado/salida.
- Menu principal reorganizado con pestañas: ERP, Comercial, Eventos, Compras, Finanzas, Produccion/Cocina, Logistica Evento, Recetas, Stock, Proveedores, Clientes, RRHH, Bromatologia, Seguridad y Reportes.
- `Ordenes de pago` queda como vista interna de Finanzas, no como pestaña principal.
- Cada pestaña mantiene un home de modulo y submenus por hover.
- `Produccion/Cocina` suma home, monitor de eventos a producir y checklist cocina por evento sin costos.
- `Stock` suma home de inventario, recepciones e insumos con variacion.
- `Reportes` suma home ejecutivo con ventas, compras, margen, eventos, clientes, proveedores y exportacion.
- Se agregaron permisos/vistas `production`, `stock` y `reports` al catalogo de roles.
- El backend entrega eventos sanitizados para Produccion/Cocina, sin costos, margen, compras ni datos financieros.

Archivos modificados:

- `approval-panel.html`
- `whatsapp-catering-bot.js`
- `roles-erp.json`
- `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`

### Actualizacion 22/06/2026 - Guia visual aplicada

Se formalizo la guia visual de Gratitud Gourmet ERP en la capa CSS del panel:

- Paleta neutra con fondo `#F3F6F7`, superficies blancas, texto `#17212B`, bordes `#D6DEE6` y verde de accion `#0F4F43`.
- Tipografia base `Inter/system-ui/Segoe UI`, texto base 14 px.
- Botones primarios, secundarios y de peligro alineados a la guia.
- Tarjetas con radio maximo 8 px, borde fino y sombra minima.
- Inputs, selects y buscadores con altura consistente.
- Tablas con header neutro, scroll interno y hover discreto.
- Correccion de accesos rapidos con fondos claros y textos legibles.

Archivos modificados:

- `approval-panel.html`
- `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`

### Estructura general

El sistema es una aplicacion Node.js monolitica orientada a la gestion comercial y operativa de un servicio de catering. Combina tres componentes principales:

1. Bot de WhatsApp para recibir consultas y relevar datos de eventos.
2. Panel ERP web para gestionar oportunidades, eventos, presupuestos, compras, finanzas, recetas, proveedores, clientes, lugares, usuarios y logistica.
3. Integraciones con Google Sheets mediante Apps Script para compras historicas, sincronizacion bidireccional de compras y carga de pagos del contador.

La aplicacion se ejecuta desde `whatsapp-catering-bot.js`. Ese archivo crea el cliente de WhatsApp, levanta un servidor HTTP propio, sirve `approval-panel.html`, expone endpoints `/api/*`, lee y escribe archivos JSON y, para compras, usa SQLite si esta disponible.

### Tecnologias utilizadas

- Node.js CommonJS.
- Servidor HTTP nativo de Node, no Express.
- `whatsapp-web.js` para WhatsApp Web.
- `qrcode-terminal` para mostrar el QR de autenticacion.
- `node:sqlite` mediante `DatabaseSync` para persistencia de compras cuando el runtime lo permite.
- Archivos JSON como almacenamiento principal/compatible.
- `xlsx` para exportacion Excel.
- `tesseract.js` para OCR local de comprobantes.
- Google Apps Script como puente con Google Sheets.
- HTML, CSS y JavaScript vanilla en `approval-panel.html`.

Evidencia: dependencias en `package.json`; imports y configuracion inicial en `whatsapp-catering-bot.js` lineas 16-35; servidor en lineas 690-1365; panel servido desde lineas 714-715 y 1413-1424.

### Frameworks y librerias

No se detecta framework frontend ni backend tradicional. El backend usa `http.createServer`. El frontend es un archivo HTML autocontenido. Librerias declaradas:

- `whatsapp-web.js`
- `qrcode-terminal`
- `tesseract.js`
- `xlsx`
- `pdf-parse`

Evidencia: `package.json` y `whatsapp-catering-bot.js` lineas 16-35.

### Base de datos utilizada

El sistema usa un esquema mixto:

- SQLite `catering.db` para compras y pagos de compras.
- JSON para el resto de entidades operativas.

Tablas SQLite:

- `purchases`: id, fecha, proveedor, evento, descripcion, estado de pago, pagado, pendiente, total, JSON completo, fechas de creacion/actualizacion.
- `purchase_payments`: id, compra asociada, proveedor, fecha, monto, metodo, origen de fondos, notas, JSON completo.

Evidencia: `whatsapp-catering-bot.js` lineas 2122-2170. Si SQLite no esta disponible, el sistema continua con JSON segun lineas 23-28 y 2167-2170.

Archivos JSON relevantes:

- `bot-state.json`: sesiones, chats, aprobaciones, mensajes procesados.
- `clientes-bot.json`: clientes.
- `recetas-bot.json`: recetas, ingredientes, procesos, tiempos y costos.
- `precios-productos-bot.json`: historico/lista de precios por producto.
- `costos-bot.json`: costos generales, opciones operativas y perfiles de insumos.
- `eventos-erp.json`: eventos y fichas operativas.
- `presupuestos-erp.json`: presupuestos.
- `compras-erp.json`: compras, mantenido como compatibilidad junto a SQLite.
- `ordenes-compra-erp.json`: ordenes de compra asociadas a eventos.
- `recepciones-compra-erp.json`: recepciones de ordenes de compra, diferencias y conversion a compra real.
- `inventario-erp.json`: movimientos de inventario generados desde recepciones aceptadas.
- `personal-erp.json`: legajos, roles, disponibilidad y datos del personal.
- `asistencias-personal-erp.json`: turnos, horarios, asistencia y novedades por evento.
- `sueldos-erp.json`: liquidaciones, horas, adicionales, descuentos y pagos de sueldos.
- `bromatologia-erp.json`: documentacion sanitaria, etiquetas, vencimientos, decomisos y aprobaciones.
- `ordenes-pago-erp.json`: ordenes de pago formales, aprobaciones, estados y comprobantes.
- `proveedores-erp.json`: proveedores.
- `lugares-erp.json`: lugares.
- `usuarios-erp.json`: usuarios.
- `roles-erp.json`: roles y permisos.
- `historial-erp.json`: auditoria.

Evidencia: constantes de archivos en `whatsapp-catering-bot.js` lineas 43-61; carga de datos en lineas 2023-2043; guardado en lineas 2331-2381.

### Integraciones externas

1. WhatsApp Web
   - Usa `LocalAuth`, cache de version de WhatsApp Web, Chromium/Chrome headless y reintentos de inicializacion.
   - Evidencia: `whatsapp-catering-bot.js` lineas 104-121, 408-409, 441-489.

2. Google Sheets para compras
   - Webhook de Apps Script para crear, editar, eliminar y exportar compras.
   - Evidencia: `syncPurchaseToSheets` en `whatsapp-catering-bot.js` lineas 7898-7912; Apps Script en `google-apps-script\compras-webhook.gs`.

3. Google Sheets para pagos del contador
   - Sincroniza deudas y compras pendientes, luego importa pagos cargados por contador.
   - Evidencia: `importAccountantPaymentsFromSheets`, `syncAccountantDebtsToSheets` y `callAccountantPaymentsWebhook` en lineas 6282-6542; Apps Script en `google-apps-script\pagos-contador-webhook.gs`; manuales en `docs`.

4. OpenStreetMap Nominatim
   - Busqueda de lugares por texto.
   - Evidencia: endpoint `/api/map-search` en `whatsapp-catering-bot.js` lineas 803-806 y funcion `searchMapPlaces` lineas 4859-4908.

5. OCR local y AI local
   - Tesseract OCR y, si esta disponible, Ollama local en `http://127.0.0.1:11434/api/generate`.
   - Evidencia: `extractPurchaseInvoiceData` lineas 8155-8183 y `tryExtractInvoiceWithOllama` lineas 8260 en adelante.

6. OpenAI
   - Existe funcion para lectura de comprobantes con OpenAI Responses API, pero el flujo activo del endpoint usa OCR local/Ollama y no llama a esa funcion.
   - Evidencia: `extractPurchaseInvoiceDataWithOpenAI` lineas 8185-8246; endpoint `/api/purchase-invoice-ocr` llama a `extractPurchaseInvoiceData` lineas 1229-1232.

7. Webhook de presupuestos
   - Preparado para Google Apps Script, Make, Zapier o CRM.
   - Evidencia: comentario y llamada en `finishConversation` lineas 9226-9232; `sendBudgetRequestToWebhook` usa `BUDGET_WEBHOOK_URL` o `webhookUrl` lineas 9306-9307.

### Servicios de autenticacion y seguridad

El panel tiene login propio con usuarios locales, roles y permisos. Las contrasenas se guardan con hash y salt. Las sesiones usan cookie firmada con `PANEL_SESSION_SECRET`.

Roles identificados:

- `admin`: acceso total.
- `comercial`: comercial y clientes.
- `compras`: compras y proveedores.
- `cocina`: recetas.
- `operacion`: logistica de eventos.
- `logistica_evento`: logistica de eventos.
- `finanzas`: finanzas.
- `rrhh`: legajos, asistencia y sueldos.
- `bromatologia`: documentacion sanitaria, decomisos, vencimientos y aprobaciones.

Evidencia: roles por defecto en `whatsapp-catering-bot.js` lineas 173-209; definiciones de tabs/permisos lineas 210-237; roles reales en `roles-erp.json`; usuarios reales en `usuarios-erp.json`; login en lineas 728-734; usuarios en lineas 1438-1488.

### Hosting o despliegue identificado

No se detecta configuracion especifica de un proveedor cloud. El README menciona modo de produccion web y variables para Render/Railway/Fly u otro hosting con volumen persistente. Tambien hay scripts Windows para ejecucion local, panel sin WhatsApp, instalacion de Node portable, backup y apertura por Tailscale.

Evidencia:

- `README.md`: produccion web, `DATA_DIR` persistente, `BOT_SKIP_WHATSAPP=1`.
- `iniciar-bot.bat`: inicia bot completo y cierra procesos anteriores.
- `iniciar-panel-erp.bat`: inicia panel sin WhatsApp con `BOT_SKIP_WHATSAPP=1`.
- `habilitar-acceso-tailscale-panel.bat`: abre firewall para puerto 3080 en red Tailscale.
- `backup-base-datos.ps1`: comprime `catering.db*` a carpeta de backups.

### Variables de entorno relevantes

- `NODE_ENV`
- `PORT` / `PANEL_PORT`
- `PANEL_HOST`
- `BOT_SKIP_WHATSAPP`
- `BOT_SKIP_PANEL`
- `DATA_DIR`
- `BOT_CONFIG_FILE`
- `PANEL_AUTH_USER`
- `PANEL_AUTH_PASSWORD`
- `PANEL_SESSION_SECRET`
- `PURCHASE_WEBHOOK_URL`
- `PURCHASE_SYNC_TOKEN`
- `PURCHASE_BIDIRECTIONAL_SYNC_ENABLED`
- `ACCOUNTANT_PAYMENTS_WEBHOOK_URL`
- `ACCOUNTANT_PAYMENTS_TOKEN`
- `BUDGET_WEBHOOK_URL`
- `OPENAI_API_KEY`
- `MAX_JSON_BODY_BYTES`
- `JSON_BACKUPS`
- `JSON_BACKUP_KEEP`
- `CATERING_DB_FILE`
- `CATERING_BACKUP_DIR`
- `CATERING_DB_BACKUP_INTERVAL_MS`
- `WHATSAPP_WEB_VERSION`
- `WHATSAPP_CLIENT_ID`
- `CHROME_EXECUTABLE`
- `WHATSAPP_AUTH_TIMEOUT_MS`
- `WHATSAPP_PROTOCOL_TIMEOUT_MS`
- `WHATSAPP_BROWSER_TIMEOUT_MS`
- `WHATSAPP_INIT_MAX_ATTEMPTS`
- `WHATSAPP_INIT_RETRY_MS`

Evidencia: `.env.example`; `whatsapp-catering-bot.js` lineas 43-121, 692-696, 1367-1373.

### Interaccion entre modulos

El flujo central es:

1. WhatsApp recibe consultas y crea sesiones comerciales.
2. El panel consulta `/api/state` y `/api/erp`.
3. Comercial convierte oportunidades en eventos y presupuestos.
4. Eventos aceptados alimentan logistica, compras y finanzas.
5. Compras actualiza proveedores, precios de productos y deudas.
6. Recetas alimenta calculo de costos y presupuestos.
7. Finanzas cruza cobros de eventos, pagos a proveedores y reintegros.
8. Seguridad controla usuarios, roles, permisos y auditoria.
9. Google Sheets funciona como entrada/salida operativa para compras y contador.

La navegacion del panel esta organizada por modulos con submenus desplegables al pasar el mouse por cada pestaña. Al tocar una pestaña principal se abre su vista mas importante; al elegir una subfuncion se cambia a esa subpantalla interna. Cada rol ve solo los modulos, submenus y subpantallas habilitadas por permisos, evitando mostrar todas las funciones del modulo al mismo tiempo.

---

## Fase 2 - Funcionalidades actuales

### 1. Bot de WhatsApp para relevamiento comercial

Objetivo: recibir consultas, pedir autorizacion inicial, relevar datos de evento y generar una solicitud de presupuesto.

Usuarios: clientes por WhatsApp, administrador que aprueba conversaciones, equipo comercial.

Flujo: llega mensaje; si no esta aprobado queda pendiente; admin aprueba desde panel o comando; el bot pregunta motivo, nombre, tipo de evento, fecha, invitados, lugar, servicio, momentos, bebidas, logistica y restricciones; al finalizar envia resumen al cliente y opcionalmente webhook.

Datos que almacena: sesiones, clientes, aprobaciones, historial de chat, estado comercial.

Pantallas: Comercial, detalle de chat, Nuevo pedido manual.

Estado actual: Operativa. El webhook final depende de configuracion externa.

Evidencia: pasos `STEPS` lineas 317-330; aprobacion lineas 7497-7661; payload y resumen lineas 9226-9284; panel Comercial en `approval-panel.html` lineas 3456-3525.

### 2. Panel de login, usuarios, roles y auditoria

Objetivo: controlar acceso al ERP y registrar movimientos.

Usuarios: administradores y usuarios por area.

Flujo: login con usuario/clave; backend crea sesion; UI oculta tabs segun permisos; admin administra usuarios, roles y auditoria.

Datos que almacena: usuarios, hashes, salts, roles, permisos, historial.

Pantallas: Login, Seguridad.

Estado actual: Operativa.

Evidencia: `approval-panel.html` lineas 3048-3081 y 3872-3933; endpoints `/api/login`, `/api/users`, `/api/roles`, `/api/audit-log` en `whatsapp-catering-bot.js` lineas 728-734 y 938-983.

### 3. Dashboard ERP ejecutivo

Objetivo: mostrar KPIs, eventos, presupuestos, ventas, margen, alertas y busqueda global.

Usuarios: administracion, direccion, comercial.

Flujo: el panel carga `/api/erp`; backend calcula dashboard, alertas, pipeline, eventos, presupuestos, compras, clientes, proveedores, recetas y lugares segun permisos.

Datos que almacena: no almacena por si mismo; consume entidades del ERP.

Pantallas: ERP.

Estado actual: Operativa.

Evidencia: `approval-panel.html` lineas 3083-3121; `/api/erp` lineas 818-885; `getErpDashboard` lineas 3623-3675.

### 4. Gestion comercial de oportunidades

Objetivo: ordenar consultas y oportunidades por estado comercial.

Usuarios: comercial, administracion.

Flujo: oportunidades vienen de WhatsApp o carga manual; se actualizan estados, datos del evento, responsable, seguimiento y notas.

Datos que almacena: `bot-state.json`, `clientes-bot.json`.

Pantallas: Comercial, Nuevo pedido, Editar oportunidad, Pipeline.

Estado actual: Operativa.

Evidencia: `createManualBudgetRecord`, `updateBudgetRecord`, `deleteBudgetRecord` lineas 7714-7879; pipeline lineas 3920-4001; UI comercial lineas 3456-3525.

### 5. Gestion de eventos ERP

Objetivo: registrar eventos con datos comerciales, operativos, logisticos, financieros y de produccion.

Usuarios: comercial, operaciones, administracion.

Flujo: se crea evento, se carga cliente, lugar, fecha, invitados, precio, estado, facturacion, menu, bebidas, vajilla, personal, checklist, costos de stock y notas. El evento puede avanzar a confirmado, produccion, finalizado, perdido o cancelado.

Datos que almacena: `eventos-erp.json`.

Pantallas: ERP, Comercial, modal Crear evento, detalle de evento.

Estado actual: Operativa.

Evidencia: formulario en `approval-panel.html` lineas 3135-3358; endpoints `/api/erp-event` y `/api/delete-erp-event` lineas 1154-1172; normalizacion en `normalizeErpEvent` lineas 4933-5038.

### 6. Presupuestos rentables

Objetivo: calcular presupuestos con recetas, costos, margen, impuestos, descuentos y versionado.

Usuarios: comercial, administracion.

Flujo: se selecciona evento, estado, margen objetivo, version, recetas, costos extra, descuentos e impuestos; se calcula costo total, precio sugerido y margen; si el presupuesto es aceptado, el evento se confirma.

Datos que almacena: `presupuestos-erp.json`.

Pantallas: ERP/Comercial, modal Presupuesto rentable, exportacion `proposal.txt`.

Estado actual: Operativa.

Evidencia: UI lineas 3361-3448; guardado lineas 5749-5793; calculo lineas 5797-5845; endpoint `/api/proposal.txt` lineas 985-987.

### 7. Importacion de presupuestos desde PDF/TXT

Objetivo: leer un documento de presupuesto existente y precargar evento/presupuesto.

Usuarios: comercial, administracion.

Flujo: se sube PDF/TXT; se extrae texto; se parsean cliente, evento, invitados, menu, bebidas y precio; el usuario revisa antes de guardar.

Datos que almacena: solo al confirmar la revision se guardan evento y presupuesto.

Pantallas: Comercial, boton Importar presupuesto y revision.

Estado actual: Parcialmente operativa. Funciona con PDF con texto o TXT; no soporta bien PDF escaneado segun error explicito.

Evidencia: `importQuoteFromDocument` lineas 5171-5190; limite y lectura de archivo lineas 5192-5216; UI lineas 3508-3511 y 8374-8616.

### 8. Gestion de compras

Objetivo: registrar compras por proveedor, producto, evento, comprobante, IVA, estado de pago, metodo y origen de fondos.

Usuarios: compras, finanzas, administracion.

Flujo: se abre formulario de compra; se carga proveedor, productos, cantidades, precios, IVA, evento, estado de pago y notas; el sistema guarda, actualiza precios, proveedores y sincroniza con Sheets si corresponde.

Datos que almacena: `catering.db`, `compras-erp.json`, `precios-productos-bot.json`, proveedores.

Pantallas: Compras, modal Cargar compra, Dashboard de compras.

Estado actual: Operativa.

Evidencia: endpoints `/api/purchase` y `/api/delete-purchase` lineas 1060-1077; `submitPurchaseRecord` lineas 7881-7895; UI compra lineas 4253-4350 y 11711-12039.

### 9. OCR de comprobantes de compra

Objetivo: precargar datos de factura/ticket/remito/presupuesto desde una foto.

Usuarios: compras.

Flujo: usuario sube imagen; frontend envia base64 a `/api/purchase-invoice-ocr`; backend usa Tesseract y, si responde, Ollama local; devuelve proveedor, fecha, items, importes, IVA, CUIT y numero de factura para revision manual.

Datos que almacena: no guarda hasta que el usuario confirma la compra.

Pantallas: Cargar compra.

Estado actual: Experimental. El propio texto del panel indica revisar datos antes de cargar.

Evidencia: UI lineas 11872-11965; endpoint lineas 1229-1232; OCR lineas 8155-8183.

### 10. Sincronizacion de compras con Google Sheets

Objetivo: mantener compras del ERP sincronizadas con una planilla historica.

Usuarios: compras, administracion.

Flujo: al crear/editar/eliminar compra, el sistema envia webhook a Apps Script; Apps Script actualiza `Registro_Gastos`; desde Sheets, `onEdit` puede avisar al dashboard con `/api/purchase-sync`.

Datos que almacena: compras en ERP y filas en Google Sheets.

Pantallas: Compras, acciones de importacion.

Estado actual: Operativa si `purchaseWebhookUrl` y Apps Script estan publicados; si no, queda local.

Evidencia: `config-bot.json` contiene URL de Apps Script; `syncPurchaseToSheets` lineas 7898-7912; `/api/purchase-sync` lineas 745-750 y 1147-1151; Apps Script `compras-webhook.gs`.

### 11. Importacion de compras historicas desde Sheets

Objetivo: traer compras existentes de la planilla al ERP.

Usuarios: compras, administracion.

Flujo: panel llama `/api/import-purchases-from-sheets`; backend pide export al webhook; normaliza cada fila como compra.

Datos que almacena: compras y precios.

Pantallas: Compras.

Estado actual: Parcialmente operativa. Requiere Apps Script actualizado y `purchaseBidirectionalSyncEnabled=true`; el codigo arroja error si no se cumple.

Evidencia: endpoint lineas 1105-1110; funcion lineas 6544-6587.

### 12. Gestion de pagos a proveedores

Objetivo: cancelar deudas de proveedores total o parcialmente.

Usuarios: compras, finanzas.

Flujo: se selecciona proveedor y modalidad de pago; se aplica a compras pendientes mas antiguas; actualiza estados Pagado/Parcial/Pendiente.

Datos que almacena: compras y `purchase_payments`.

Pantallas: Compras, Finanzas.

Estado actual: Operativa.

Evidencia: endpoint `/api/provider-payment` lineas 1079-1089; funcion `applyProviderPayment` desde lineas 6061; manual de contador describe la regla de aplicacion.

### 13. Reintegros por fondos personales

Objetivo: controlar compras pagadas con fondos personales y reintegrarlas.

Usuarios: finanzas, administracion.

Flujo: identifica compras pagadas por personas configuradas; agrupa saldos; registra reintegros parciales o totales.

Datos que almacena: compras, logs de pago/reintegro.

Pantallas: Compras, Finanzas.

Estado actual: Operativa.

Evidencia: endpoint `/api/payer-reimbursement` lineas 1092-1100; funcion `applyPayerReimbursement` lineas 6194-6280; UI lineas 5895-6347.

### 14. Sincronizacion e importacion de pagos del contador

Objetivo: permitir que el contador cargue pagos en Google Sheets sin tocar la base principal.

Usuarios: contador, finanzas, administracion.

Flujo: ERP sincroniza deudas y compras pendientes a Sheets; contador carga pagos en `Pagos_Contador`; ERP importa pagos, aplica deudas y marca filas como Importado o Error.

Datos que almacena: pagos aplicados en compras; planilla externa como bandeja de entrada.

Pantallas: Finanzas, Compras.

Estado actual: Operativa si `accountantPaymentsWebhookUrl` esta configurado.

Evidencia: endpoints lineas 1113-1131; funciones lineas 6282-6542; Apps Script `pagos-contador-webhook.gs`; manuales `docs`.

### 15. Dashboard financiero

Objetivo: mostrar ventas, cobros, saldos pendientes, deudas a proveedores, reintegros y balance proyectado.

Usuarios: finanzas, direccion.

Flujo: backend toma eventos, compras y reintegros; calcula cobrado, pendiente, vencido, deuda proveedor y balance.

Datos que almacena: eventos y compras.

Pantallas: Finanzas.

Estado actual: Operativa.

Evidencia: `/api/erp` retorna vista especial para rol finanzas lineas 847-865; `getFinanceDashboard` lineas 3676-3713; UI Finanzas lineas 3567-3584.

### 16. Registro de cobros de eventos

Objetivo: controlar cobro total/parcial de ventas por evento y facturacion.

Usuarios: finanzas, administracion.

Flujo: usuario registra monto cobrado, metodo, fecha, notas, estado de factura y numero; se recalcula estado de cobro.

Datos que almacena: eventos.

Pantallas: Finanzas, detalle de evento.

Estado actual: Operativa.

Evidencia: endpoint `/api/finance-event-payment` lineas 1137-1144; `updateEventCollectionRecord` lineas 3771-3794; UI lineas 5991-6088.

### 17. Gestion de proveedores

Objetivo: administrar datos comerciales, fiscales, bancarios y estadisticas de proveedores.

Usuarios: compras, administracion.

Flujo: alta/edicion/baja; sincronizacion automatica desde compras y config; calcula cantidad comprada, total y ultima compra.

Datos que almacena: `proveedores-erp.json`.

Pantallas: Proveedores, gestor modal en compras.

Estado actual: Operativa.

Evidencia: endpoints `/api/provider` lineas 1209-1227; funciones lineas 2627-2899; UI lineas 3645-3738 y 9596-9832.

### 18. Gestion de clientes

Objetivo: administrar clientes, preferencias, restricciones y trazabilidad comercial.

Usuarios: comercial, administracion.

Flujo: alta/edicion/baja; clientes tambien se actualizan desde WhatsApp y cargas manuales; muestra historial e insights.

Datos que almacena: `clientes-bot.json`.

Pantallas: Clientes, Comercial.

Estado actual: Operativa.

Evidencia: endpoints lineas 1235-1252; funciones lineas 2907-3018; UI lineas 3599-3641 y 9463-9577.

### 19. Gestion de lugares

Objetivo: administrar salones/direcciones/lugares con datos de contacto, referencia y coordenadas.

Usuarios: comercial, operaciones.

Flujo: alta/edicion/baja; busqueda por mapa; guarda latitud/longitud y proveedor de mapa.

Datos que almacena: `lugares-erp.json`.

Pantallas: Comercial, modal de lugar.

Estado actual: Operativa.

Evidencia: endpoints `/api/venues`, `/api/venue`, `/api/delete-venue`, `/api/map-search` lineas 796-806 y 1255-1272; UI lineas 3535-3544 y 7181-7413.

### 20. Gestion de recetas y costos

Objetivo: administrar recetas, ingredientes, mermas, procesos, tiempos, fotos y costos.

Usuarios: cocina, administracion.

Flujo: se carga receta base, porciones/unidad, categoria, horas, proceso, ingredientes, mermas y costos; se calcula total, costo unitario y personal; se puede imprimir/ver detalle.

Datos que almacena: `recetas-bot.json`, `precios-productos-bot.json`, `costos-bot.json`.

Pantallas: Recetas, editor de receta, detalle de receta.

Estado actual: Operativa.

Evidencia: endpoints `/api/recipes`, `/api/recipe`, `/api/delete-recipe`, `/api/cost-settings`; funciones lineas 3032-3618; UI lineas 3742-3868 y 9853-11331.

### 21. Revision de cambios de recetas de cocina

Objetivo: permitir que usuarios de cocina propongan cambios sin impactar directamente costos sensibles.

Usuarios: cocina, administracion.

Flujo: cocina guarda cambios; backend crea revision pendiente; administracion aprueba o rechaza.

Datos que almacena: `recetas-pendientes-revision.json`.

Pantallas: Recetas, bandeja Revisiones pendientes.

Estado actual: Operativa.

Evidencia: endpoints lineas 1275-1318; funciones lineas 3311-3418; boton oculto/visible lineas 3748 y 10081-10205.

### 22. Generador de presupuesto desde recetas

Objetivo: calcular costos de un servicio a partir de recetas seleccionadas y cantidades.

Usuarios: administracion, comercial.

Flujo: desde Recetas se abre generador, se eligen recetas/cantidades y se muestra total de comida, personal y costo final.

Datos que almacena: no almacena por si mismo.

Pantallas: Recetas, modal Generar presupuesto.

Estado actual: Operativa en frontend.

Evidencia: UI lineas 4231-4251 y 9904-9999.

### 23. Logistica de evento

Objetivo: preparar y cerrar la ficha logistica de eventos confirmados.

Usuarios: logistica, operaciones, administracion.

Flujo: lista eventos confirmados; detalle por categorias; edita checklist, responsables, notas, sobrantes, sugerencias aprendidas; cierra evento; cierre queda pendiente de aprobacion administrativa.

Datos que almacena: `eventos-erp.json`, dentro de `operationalSheet` y `logisticsStatus`.

Pantallas: Logistica Evento, detalle logistico.

Estado actual: Operativa.

Evidencia: endpoints lineas 886-921; funciones lineas 4025-4244 y 4287-4594; UI lineas 3586-3597 y 6620-7090.

### 24. Conformidad de evento

Objetivo: adjuntar o registrar conformidad de evento y permitir descarga/consulta.

Usuarios: administracion, operaciones.

Flujo: se carga conformidad asociada al evento; se guarda metadata y archivo en directorio de conformidades; puede consultarse por endpoint.

Datos que almacena: evento y archivos en `conformidades-eventos`.

Pantallas: detalle de evento.

Estado actual: Operativa con alcance basico.

Evidencia: endpoints lineas 924-936; funciones `saveEventConformity` y `sendEventConformityPdf` lineas 4154-4244; UI lineas 7731-7795.

### 25. Exportacion Excel y modelo tipo Google Sheets

Objetivo: exportar datos del ERP a Excel y exponer estructura tabular.

Usuarios: administracion.

Flujo: endpoint `/api/sheets` arma hojas; `/api/export.xlsx` genera archivo con hojas de dashboard, eventos, presupuestos, compras, clientes, recetas, productos y mas.

Datos que almacena: no almacena.

Pantallas: ERP, boton Descargar Excel.

Estado actual: Operativa si `xlsx` esta instalado.

Evidencia: README; endpoints lineas 989-998; funciones lineas 1527-1968; boton en `approval-panel.html` linea 3102.

### 26. Personal/RRHH

Objetivo: centralizar legajos, disponibilidad, roles, turnos por evento, asistencia y novedades del personal.

Usuarios: RRHH, administracion y direccion.

Flujo: se crea el legajo; se asignan turnos a eventos; se registra asistencia real y novedades; luego se usa esa informacion para liquidar horas.

Datos que almacena: `personal-erp.json` y `asistencias-personal-erp.json`.

Pantallas: Personal/RRHH.

Estado actual: Operativa en version inicial.

Endpoints principales: `/api/hr`, `/api/hr-staff`, `/api/hr-shift`.

### 27. Sueldos y horas

Objetivo: liquidar horas trabajadas, adicionales, descuentos, pagos pendientes e historial basico.

Usuarios: RRHH, administracion y finanzas segun permisos.

Flujo: se toman horas de turnos/asistencia, se carga periodo, adicionales, descuentos y estado de pago; queda registro para seguimiento administrativo.

Datos que almacena: `sueldos-erp.json`.

Pantallas: Personal/RRHH.

Estado actual: Operativa en version inicial.

Endpoint principal: `/api/payroll`.

### 28. Bromatologia

Objetivo: registrar documentacion sanitaria, etiquetas, vencimientos, decomisos, fotos/comprobantes y aprobaciones.

Usuarios: bromatologia y administracion general.

Flujo: se crea un registro sanitario; puede vincularse a producto, proveedor o evento; se adjunta comprobante; si requiere control, queda pendiente de aprobacion.

Datos que almacena: `bromatologia-erp.json`.

Pantallas: Bromatologia.

Estado actual: Operativa en version inicial.

Endpoints principales: `/api/sanitation`, `/api/sanitation-record`, `/api/sanitation-approval`.

### 29. Ordenes de pago formales

Objetivo: crear solicitudes formales de pago a proveedores, personal, reintegros u otros beneficiarios, con aprobacion, estado y comprobante.

Usuarios: finanzas y administracion general.

Flujo: se crea la orden; se revisa y aprueba; cuando se paga, se carga comprobante y queda en historial.

Datos que almacena: `ordenes-pago-erp.json`.

Pantallas: Ordenes de pago.

Estado actual: Operativa en version inicial.

Endpoints principales: `/api/payment-orders`, `/api/payment-order`, `/api/payment-order-status`.

### 30. Backups

Objetivo: proteger datos de SQLite y JSON.

Usuarios: administracion tecnica.

Flujo: cada escritura JSON genera backup si esta habilitado; SQLite tiene backup periodico y script externo.

Datos que almacena: carpeta `backups`.

Pantallas: no aplica.

Estado actual: Operativa.

Evidencia: `backupJsonFile` lineas 2066-2085; `backupCateringDatabase` lineas 2290-2318; script `backup-base-datos.ps1`.

---

## Fase 3 - Funcionalidades en desarrollo o parcialmente implementadas

### Lectura de comprobantes con OpenAI

Que parece resolver: extraer datos de facturas con mejor precision usando OpenAI Responses API.

Avance estimado: 60%. La funcion existe y arma la llamada completa, pero el endpoint activo no la usa.

Falta: conectar una opcion de configuracion o fallback real desde `/api/purchase-invoice-ocr`; resolver manejo de costo/cuota; decidir modelo.

Riesgos: dependencia externa paga, errores de cuota/API key, privacidad de comprobantes.

Evidencia: funcion `extractPurchaseInvoiceDataWithOpenAI` lineas 8185-8246; endpoint usa `extractPurchaseInvoiceData` lineas 1229-1232.

### Webhook de presupuesto a CRM/automatizador

Que parece resolver: enviar solicitudes de presupuesto a Google Apps Script, Make, Zapier o CRM.

Avance estimado: 50%. Payload y funcion de envio existen; `config-bot.json` tiene `webhookUrl` vacio.

Falta: configurar URL real, definir receptor, probar contrato.

Riesgos: solicitudes no llegan a sistemas comerciales si se asume integracion activa.

Evidencia: comentario placeholder lineas 9231-9232; `webhookUrl` vacio en `config-bot.json`; `sendBudgetRequestToWebhook` lineas 9306-9328.

### Importacion de presupuestos escaneados

Que parece resolver: importar presupuestos desde archivos.

Avance estimado: 65%. Funciona con texto/PDF con texto; el propio error indica que PDF escaneado debe convertirsese a texto o cargarse manualmente.

Falta: OCR de PDF/imagen o integracion AI para documentos escaneados.

Riesgos: fallos con documentos reales fotografiados o escaneados.

Evidencia: lineas 5171-5176.

### Importacion de compras historicas desde Sheets

Que parece resolver: migrar historico desde planilla.

Avance estimado: 75%. Funcion lista, pero exige Apps Script actualizado y bandera activa.

Falta: validacion visual del estado de la integracion y proceso guiado de migracion.

Riesgos: duplicados o filas omitidas si los IDs no estan normalizados.

Evidencia: lineas 6544-6554.

### Modo local Ollama para comprobantes

Que parece resolver: mejorar OCR sin costo externo usando modelo local.

Avance estimado: 60%. Se intenta llamar a Ollama, pero depende de servicio local externo.

Falta: instalador, verificacion de disponibilidad, modelo recomendado, fallback visible.

Riesgos: tiempos de respuesta, servicio apagado, resultados variables.

Evidencia: `localInvoiceAiUrl` en `config-bot.json`; funcion `tryExtractInvoiceWithOllama`.

### Pantallas y controles ocultos por permisos

Que parece resolver: separar experiencia por rol.

Avance estimado: 90%. Ya oculta tabs/acciones con `data-permission`.

Falta: revisar endpoints que no tienen permiso explicito fuerte, como `/api/purchase-option` y `/api/operational-option`, si se requiere endurecimiento.

Riesgos: usuarios autenticados con acceso limitado podrian modificar opciones operativas si la UI no los expone pero el endpoint no exige permiso.

Evidencia: UI oculta lineas 4767-4799; endpoints sin chequeo de permiso lineas 1203-1206 y 1329-1332.

### Conformidad de evento

Que parece resolver: documentar aprobacion/conformidad post evento.

Avance estimado: 70%. Hay endpoints y UI; no se observa generacion formal avanzada ni flujo de firma.

Falta: firma digital, plantilla institucional, estados de aprobacion, validacion documental.

Riesgos: valor probatorio limitado si se lo usa como conformidad contractual.

Evidencia: lineas 4154-4244 y UI 7731-7795.

---

## Fase 4 - Proximas Evoluciones Recomendadas

### Impacto Alto

1. Consolidar persistencia en SQLite para todas las entidades.
   - Hoy solo compras/pagos tienen SQLite; eventos, recetas, usuarios y auditoria siguen en JSON.
   - Beneficio: menos riesgo de corrupcion, mejores consultas, multiusuario mas confiable.

2. Cerrar el flujo de presupuesto a CRM/ventas.
   - Ya existe payload y webhook.
   - Beneficio: elimina carga manual entre WhatsApp, comercial y propuesta formal.

3. Fortalecer seguridad de endpoints y configuracion productiva.
   - Revisar endpoints sin permiso explicito; exigir secretos fuertes en produccion.
   - Beneficio: menor riesgo de cambios no autorizados.

4. Dashboard ejecutivo financiero-operativo.
   - Ya existen datos de ventas, compras, margen, cobranza, deudas y eventos.
   - Beneficio: tablero para direccion e inversores.

5. Flujo completo de conformidad y cierre post evento.
   - Ya existe ficha logistica, cierre y conformidad.
   - Beneficio: control de calidad, evidencia de servicio y mejora continua.

### Impacto Medio

1. OCR avanzado configurable: local, OpenAI o manual.
   - La base tecnica ya existe.
   - Beneficio: reduce tiempo de carga de compras.

2. Portal o vista limitada para contador.
   - Hoy se resuelve con Google Sheets.
   - Beneficio: menos dependencia de planillas y menos errores.

3. Automatizacion de compras sugeridas desde eventos/recetas.
   - Ya existen recetas, eventos, menu y compras.
   - Beneficio: planificacion de abastecimiento por evento.

4. Calendario operativo.
   - Ya existen fechas, horarios, lugares y responsables.
   - Beneficio: mejor coordinacion de cocina, compras y logistica.

5. Reportes por proveedor, producto y rentabilidad por evento.
   - Ya existe historial de compras y precios.
   - Beneficio: negociacion y control de costos.

### Impacto Bajo

1. Plantillas imprimibles adicionales.
   - Recetas ya tienen vista imprimible.
   - Beneficio: estandarizacion operativa.

2. Asistente de carga de lugares.
   - Ya existe busqueda por mapa.
   - Beneficio: carga mas simple.

3. Catalogo visual de recetas.
   - El modelo soporta fotos.
   - Beneficio: mejor venta y capacitacion interna.

4. Alertas por WhatsApp internas.
   - El cliente WhatsApp ya existe.
   - Beneficio: avisos de seguimiento, compras pendientes o eventos proximos.

---

## Fase 5 - Resumen Ejecutivo

El sistema es una plataforma integral para administrar una empresa de catering desde la primera consulta del cliente hasta el cierre operativo y financiero del evento.

Permite recibir pedidos por WhatsApp, organizar oportunidades comerciales, registrar eventos, calcular presupuestos rentables, controlar recetas y costos, cargar compras, administrar proveedores, seguir pagos, coordinar la logistica del evento y conservar un historial auditable de la operacion.

Resuelve un problema habitual en empresas de catering: la informacion dispersa entre WhatsApp, planillas, notas, compras, cocina, administracion y pagos. Al centralizar los datos, reduce errores, evita perdidas de informacion, mejora los tiempos de respuesta y permite tomar decisiones con datos reales.

Su valor principal esta en conectar areas que normalmente trabajan separadas: comercial, cocina, compras, finanzas y logistica. Esto permite conocer la rentabilidad de los eventos, anticipar necesidades operativas, controlar deudas y profesionalizar la atencion al cliente.

Para intendentes, directores, gerentes, inversores y clientes, el sistema representa una herramienta de gestion que transforma un proceso artesanal y fragmentado en una operacion medible, ordenada y escalable.

---

## Fase 6 - Memoria descriptiva del proyecto

### 1. Introduccion

El proyecto consiste en un sistema ERP operativo y comercial para empresas de catering. Integra atencion inicial por WhatsApp, gestion comercial, administracion de eventos, presupuestacion, recetas, compras, finanzas, proveedores, clientes y logistica de evento.

### 2. Objetivos

- Centralizar la informacion comercial y operativa.
- Automatizar el relevamiento inicial de consultas.
- Ordenar el pipeline de oportunidades.
- Calcular presupuestos con costos y margenes.
- Controlar compras, proveedores, pagos y reintegros.
- Coordinar la logistica de eventos confirmados.
- Registrar usuarios, permisos y auditoria.
- Facilitar integracion con Google Sheets para procesos administrativos.

### 3. Alcance

Incluye bot de WhatsApp, panel ERP web, persistencia local, exportaciones, sincronizacion con planillas y control por roles. No se observa en el codigo una aplicacion movil nativa ni integracion contable formal mas alla de Google Sheets.

### 4. Funcionalidades

El sistema cubre: atencion WhatsApp, aprobacion de conversaciones, oportunidades comerciales, eventos, presupuestos, importacion de documentos, compras, OCR de comprobantes, pagos a proveedores, pagos del contador, reintegros, finanzas, clientes, proveedores, lugares, recetas, costos, revision de recetas, logistica, conformidad, auditoria y exportacion Excel.

### 5. Arquitectura general

Arquitectura monolitica Node.js. Un servidor HTTP propio expone API y sirve un panel HTML. Los datos se almacenan en JSON y SQLite. WhatsApp se conecta mediante `whatsapp-web.js`. Las integraciones con Google Sheets se realizan mediante Apps Script. El panel consume endpoints internos con `fetch`.

### 6. Beneficios operativos

- Menos carga manual.
- Menos perdida de informacion.
- Mayor trazabilidad.
- Mejor coordinacion entre areas.
- Control de compras y pagos.
- Preparacion logistica mas ordenada.
- Estandarizacion de recetas y costos.

### 7. Beneficios economicos

- Mejor control de margenes.
- Reduccion de sobrecostos por compras no planificadas.
- Deteccion de deudas y pagos pendientes.
- Mejora de negociacion con proveedores.
- Menor tiempo administrativo.
- Mayor capacidad de seguimiento comercial.

### 8. Estado actual del desarrollo

El sistema esta operativo en modalidad local/panel y cuenta con datos reales cargados. Algunas funciones dependen de configuracion externa: WhatsApp requiere sesion activa, Google Sheets requiere Apps Script publicado, presupuesto a CRM requiere webhook configurado, y OCR avanzado depende de Ollama/OpenAI si se desea mayor precision.

### 9. Evolucion prevista

La arquitectura permite evolucionar hacia una base de datos centralizada, despliegue web con volumen persistente, reportes ejecutivos, portal de contador, automatizacion de abastecimiento y flujo formal de cierre/conformidad.

### 10. Conclusiones

El proyecto constituye una solucion integral de gestion para catering con alto valor operativo. Ya integra procesos clave y tiene una base clara para crecer hacia un ERP mas robusto, multiusuario y desplegable en produccion.

---

## Fase 7 - Presentacion comercial

Esta solucion digitaliza y ordena la gestion completa de un servicio de catering.

Desde el primer mensaje del cliente por WhatsApp, el sistema ayuda a relevar la informacion necesaria, organizar la oportunidad comercial y transformarla en un evento presupuestable. Luego permite calcular costos, registrar recetas, controlar compras, administrar proveedores, seguir pagos, coordinar la logistica y cerrar el evento con trazabilidad.

Automatiza procesos que habitualmente se hacen en planillas, mensajes sueltos o notas internas: relevamiento de datos, seguimiento comercial, carga de compras, actualizacion de proveedores, calculo de costos, control de deudas, pagos del contador y preparacion logistica.

El ahorro se genera por menor tiempo administrativo, menos errores de carga, menor perdida de informacion, mejor control de compras y mayor visibilidad de margenes. Tambien mejora la velocidad de respuesta comercial, lo que aumenta la probabilidad de convertir consultas en ventas.

Sus ventajas competitivas son:

- Gestion integral en un solo panel.
- Atencion inicial conectada a WhatsApp.
- Presupuestos basados en costos reales.
- Control financiero de compras, pagos y reintegros.
- Logistica por evento con cierre operativo.
- Integracion con Google Sheets para equipos externos.
- Roles y permisos por area.
- Auditoria de movimientos.

Elegir esta solucion permite profesionalizar la operacion, ordenar equipos, reducir costos invisibles y escalar el negocio con informacion confiable.

---

## Fase 8 - Matriz de funcionalidades

| Modulo | Funcion | Estado | Prioridad | Observaciones |
|---|---|---|---|---|
| WhatsApp | Conexion con WhatsApp Web | Operativa | Alta | Requiere sesion LocalAuth y Chrome. |
| WhatsApp | Aprobacion inicial de conversaciones | Operativa | Alta | Admin aprueba desde panel o comando. |
| WhatsApp | Cuestionario de presupuesto | Operativa | Alta | Releva datos clave de evento. |
| WhatsApp | Webhook de presupuesto a CRM | Parcial | Alta | Preparado, depende de `webhookUrl`. |
| Panel | Login | Operativa | Alta | Usuarios locales con hash/salt. |
| Panel | Sesiones y cookies | Operativa | Alta | Usa secreto de sesion. |
| Seguridad | Roles y permisos | Operativa | Alta | Admin, comercial, compras, cocina, operacion, logistica, finanzas. |
| Seguridad | Gestion de usuarios | Operativa | Alta | Alta/edicion/activacion. |
| Seguridad | Auditoria | Operativa | Alta | Registra acciones principales. |
| ERP | Dashboard ejecutivo | Operativa | Alta | KPIs, alertas, busqueda global. |
| Comercial | Pipeline | Operativa | Alta | Combina chats y eventos. |
| Comercial | Carga manual de oportunidad | Operativa | Alta | Para canales externos. |
| Comercial | Edicion de oportunidad | Operativa | Alta | Actualiza estado y datos. |
| Eventos | Alta/edicion de evento | Operativa | Alta | Datos comerciales, operativos y financieros. |
| Eventos | Eliminacion de evento | Operativa | Media | Con auditoria. |
| Eventos | Estados de evento | Operativa | Alta | Lead, cotizado, confirmado, produccion, finalizado, perdido, cancelado. |
| Eventos | Facturacion de evento | Operativa | Media | Estado y numero de factura. |
| Eventos | Cobros de evento | Operativa | Alta | Vista finanzas. |
| Presupuestos | Presupuesto rentable | Operativa | Alta | Calcula costos, precio y margen. |
| Presupuestos | Versionado | Operativa | Media | Campo version. |
| Presupuestos | Exportacion texto de propuesta | Operativa | Media | Endpoint `proposal.txt`. |
| Presupuestos | Importacion PDF/TXT | Parcial | Media | No cubre bien escaneados. |
| Compras | Alta/edicion de compra | Operativa | Alta | Multi item, IVA por item. |
| Compras | Eliminacion de compra | Operativa | Alta | Sincroniza con Sheets si aplica. |
| Compras | Dashboard de compras | Operativa | Alta | Deudas, rankings, alertas. |
| Compras | Borrador local de compra | Operativa | Media | Usa localStorage del navegador. |
| Compras | OCR local de comprobantes | Experimental | Media | Requiere revision manual. |
| Compras | OCR con Ollama | Experimental | Media | Depende de servicio local. |
| Compras | OCR con OpenAI | Parcial | Media | Funcion no conectada al endpoint activo. |
| Compras | Sincronizacion Google Sheets | Operativa | Alta | Depende de Apps Script y URL. |
| Compras | Importacion historica desde Sheets | Parcial | Alta | Requiere Apps Script actualizado. |
| Compras | Opciones de proveedor/producto | Operativa | Media | Endpoints sin permiso explicito fuerte. |
| Compras | Ordenes de compra por evento | Operativa | Alta | Asociadas a eventos, editables y agrupadas por proveedor sugerido. |
| Compras | Recepcion de ordenes | Operativa | Alta | Controla cantidad pedida vs recibida, tipo de item, precio, IVA y proveedor/marca. |
| Compras | Diferencias de recepcion | Operativa | Alta | Genera alerta administrativa y requiere resolver o aceptar diferencias. |
| Compras | Conversion a compra real | Operativa | Alta | Convierte recepcion aceptada en compra pendiente y registra trazabilidad. |
| Inventario | Movimientos desde recepcion | Operativa basica | Media | Mercaderia, vajilla y equipamiento suman stock; alquileres no suman stock permanente. |
| Proveedores | ABM proveedor | Operativa | Alta | Datos fiscales, bancarios y contacto. |
| Proveedores | Estadisticas por proveedor | Operativa | Media | Total comprado, cantidad, ultima compra. |
| Finanzas | Dashboard financiero | Operativa | Alta | Ventas, cobros, deudas, reintegros. |
| Finanzas | Pago a proveedores | Operativa | Alta | Aplica a compras mas antiguas. |
| Finanzas | Bloqueo de pago por diferencias | Operativa | Alta | Si hay recepciones con diferencias sin resolver, bloquea pago al proveedor. |
| Finanzas | Reintegros personales | Operativa | Alta | Agrupa y cancela saldos personales. |
| Finanzas | Planilla contador | Operativa | Alta | Sincroniza deudas e importa pagos. |
| Clientes | ABM cliente | Operativa | Alta | Preferencias, restricciones y notas. |
| Clientes | Insights comerciales | Operativa | Media | Historial y conteo de presupuestos. |
| Lugares | ABM de lugares | Operativa | Media | Direccion, contacto, referencia. |
| Lugares | Busqueda por mapa | Operativa | Media | Usa Nominatim/OpenStreetMap. |
| Recetas | ABM receta | Operativa | Alta | Ingredientes, procesos, mermas, costos. |
| Recetas | Calculo de costo | Operativa | Alta | Incluye insumos y mano de obra. |
| Recetas | Fotos de receta/proceso | Operativa | Baja | Modelo y UI soportan fotos. |
| Recetas | Recetas anidadas | Operativa | Media | Ingredientes pueden referenciar recetas. |
| Recetas | Revision de cambios de cocina | Operativa | Alta | Admin aprueba/rechaza. |
| Recetas | Costos generales | Operativa | Alta | Solo admin. |
| Recetas | Generador de presupuesto | Operativa | Media | Calcula costo desde recetas. |
| Logistica | Lista de eventos confirmados | Operativa | Alta | Filtra eventos confirmados. |
| Logistica | Ficha operativa por rubros | Operativa | Alta | Alimentos, vajilla, bebidas, personal, etc. |
| Logistica | Sugerencias aprendidas | Operativa | Media | Usa eventos similares. |
| Logistica | Cierre logistico | Operativa | Alta | Requiere comentario post-evento. |
| Logistica | Aprobacion admin de cierre | Operativa | Alta | Cambia estado final. |
| Conformidad | Carga/consulta de conformidad | Operativa basica | Media | Falta flujo formal de firma. |
| Exportacion | Modelo `/api/sheets` | Operativa | Media | Estructura tabular. |
| Exportacion | Excel `/api/export.xlsx` | Operativa | Media | Depende de `xlsx`. |
| Backup | Backup JSON | Operativa | Alta | Antes de sobrescribir archivos. |
| Backup | Backup SQLite | Operativa | Alta | Script y funcion interna. |
| Despliegue | Modo panel sin WhatsApp | Operativa | Alta | `BOT_SKIP_WHATSAPP=1`. |
| Despliegue | Acceso Tailscale | Operativa | Media | Script firewall puerto 3080. |

---

## Observaciones finales

El sistema encontrado es funcionalmente amplio y ya contiene datos reales. La arquitectura actual prioriza rapidez de uso local y compatibilidad con planillas, con una evolucion natural hacia mayor persistencia, seguridad y reportes. Las funcionalidades deben presentarse comercialmente como operativas cuando dependen solo del codigo y configuracion local; y como integrables o parcialmente operativas cuando requieren servicios externos no configurados o no conectados en el flujo activo.
