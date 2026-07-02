# Contexto compartido entre agentes (Claude / Codex)

Este archivo es el puente entre sesiones de Claude y Codex en este proyecto.
Como las dos herramientas no comparten memoria, cada vez que termines una sesión
importante con cualquiera de los dos, agregá una entrada nueva acá arriba (orden
cronológico inverso, la mas reciente primero).

Al empezar una sesion nueva con el otro agente, decile: "Lee CONTEXTO_AGENTES.md
antes de empezar" para que tenga el contexto de lo ultimo hablado.

## Como agregar una entrada

```
## [AAAA-MM-DD] Herramienta usada (Claude / Codex)

**De que se hablo:** resumen corto de la conversacion.
**Decisiones tomadas:** que se decidio hacer (o no hacer) y por que.
**Cambios en el codigo:** que se modifico, en que archivos (commit hash si aplica).
**Pendiente para la proxima sesion:** que queda abierto, sin resolver.
```

---

## [2026-07-02] Claude (sesion 5 - performance Hito 1 y 2 + seguridad de endpoints)

**De que se hablo:** continuacion directa del Hito 1 (cache TTL + skeletons, ya deployado). Se verifico en produccion el impacto real, se implemento Hito 2 y se cerraron endpoints sin autenticacion.

**Decisiones tomadas:**
- Hito 1 verificado en produccion: /api/erp bajo de 11.8s-18.4s a 3.15s (6x), TTFB de 12.76s a 1.92s. Cache de 12s funcionando.
- Hito 2 implementado: /api/erp acepta ?view= para devolver solo los campos que necesita cada modulo. La carga inicial pide ?view=erp (~187KB en 1.37s vs 1.34MB antes). Al navegar a una vista nueva se pide su slice (ej. ?view=finance en 816ms). El boton Actualizar sigue haciendo carga completa. El frontend trackea _erpLoadedViews y fusiona respuestas parciales en erpData sin pisar datos ya cargados.
- Se corrigio bug: el console.log de timing en /api/erp estaba despues del return y nunca ejecutaba. Ahora loguea view y ms en todas las rutas.
- 16 endpoints cerrados que no tenian autenticacion: /api/approve y /api/reject (critico: cualquiera podia aprobar/rechazar solicitudes WhatsApp), /api/export.xlsx y /api/sheets (dump completo de datos), /api/customers, /api/providers, /api/venues, /api/recipes, /api/proposal.txt, /api/purchase-options, /api/comandas-stats, /api/map-search, /api/purchase-option, /api/operational-option, /api/purchase-invoice-ocr.

**Cambios en el codigo:**
- Commit 892ca7e: Hito 2 (?view= en /api/erp) + fix del console.log bug.
- Commit 8e7345c: 16 endpoints con requirePanelPermission / requireAnyPanelPermission.
- Ambos deployados y verificados en produccion (/health OK, /api/export.xlsx devuelve 401 sin sesion).

**Pendiente para la proxima sesion:**
- Hito 3: paginacion/carga on-demand de eventos, compras, clientes, recetas. Los slices de ?view= siguen siendo pesados (ej. finance 644KB).
- Hito 4: mediciones de timing en el frontend (time to visible layout, first useful block).
- Seguridad adicional: revisar /api/status, /api/manual-budget, /api/update-budget, /api/delete-budget (no se auditaron en esta sesion).
- Data hygiene: sacar config-bot.json, usuarios-erp.json, JSON de negocio y catering.db* del tracking de git.
- Gestion de usuarios: toggle activo/inactivo + filtro por nombre/rol.
- VPS: agregar swap 1-2GB, backups externos (rclone), cambiar password root.

---

## [2026-07-02] Codex (medicion de lentitud en carga de vistas)

**De que se hablo:** el usuario sospecho que las vistas demoran varios segundos en cargar datos. Se levanto una copia temporal de los datos en `DATA_DIR` fuera del repo para medir sin tocar usuarios ni datos reales, con panel sin WhatsApp y usuario admin temporal.

**Decisiones tomadas:** queda corroborado que la lentitud principal no es la red ni la descarga del HTML, sino el backend armando `/api/erp`. En mediciones con datos copiados, `/api/erp` devolvio ~1.34 MB y tardo entre 11.8s y 18.4s; en una prueba con `Invoke-WebRequest` llego a promediar 26.7s. El tiempo hasta primer byte fue ~12.76s, por lo que el servidor tarda antes de empezar a responder. `/api/buyer-orders` tambien es relativamente pesado: ~1.4s a 2.1s. El HTML inicial pesa ~808 KB pero servido por `curl` tarda ~24-40ms, asi que no es el cuello principal del servidor.

**Cambios en el codigo:** no hubo cambios funcionales. Se usaron servidores temporales en puertos 3099/3100 y luego se cerraron. Se detecto en `approval-panel.html` que `loadInitialData()` dispara varias cargas en paralelo segun permisos y que muchas vistas vuelven a llamar `loadErp()`, que hoy arma demasiados datos para muchas pantallas a la vez.

**Pendiente para la proxima sesion:** optimizar carga de vistas: 1) dividir `/api/erp` en endpoints por modulo o agregar query `?view=`/`?include=` para no recalcular todo; 2) cachear por unos segundos dashboards y listas derivadas caras; 3) paginar/listar parcialmente eventos, compras, clientes y recetas; 4) evitar que el frontend cargue todos los modulos al inicio para admins; 5) instrumentar tiempos internos de `getErpDashboard`, `getPipelineBoard`, `getFinanceDashboard`, `getProductMasterList`, `getProviderList`, `getRecipeListForUser`, `getPurchaseOrderList` y renderizado frontend.

---

## [2026-07-02] Codex (contexto de direccion CTO/CMO/codeador)

**De que se hablo:** el usuario explico que durante la manana estuvo coordinando el desarrollo del ERP con tres frentes: 1) CMO / Directora UX-UI, responsable de jerarquia de informacion, densidad visual, claridad operativa y estetica premium SaaS B2B tipo Stripe/Vercel; 2) codeador, responsable de ejecutar cambios concretos siguiendo directivas tecnicas claras y modulares; 3) alternancia entre IAs por creditos, donde Claude y Codex deben sincronizarse mediante los archivos existentes del repo.

**Decisiones tomadas:** Codex asume rol de CTO / Arquitecto Principal: no debe inventar archivos nuevos de contexto ni duplicar documentacion. La fuente viva de traspaso es `CONTEXTO_AGENTES.md`; `AGENTS.md` y `CLAUDE.md` quedan como reglas estables para cada agente. Toda recomendacion tecnica debe bajar a tareas ejecutables para el codeador y cuidar que la vision visual/operativa de la CMO no rompa arquitectura, seguridad ni rendimiento.

**Cambios en el codigo:** no hubo cambios funcionales por esta coordinacion. Se actualizo esta bitacora para que Claude entienda el marco de trabajo de la manana y no retome el proyecto como una tarea aislada de codigo. Tambien se dejo registrada en la entrada siguiente la auditoria tecnica backend/frontend realizada por Codex.

**Pendiente para la proxima sesion:** Claude debe leer primero esta entrada y la auditoria de Codex del 2026-07-02. Mantener el criterio: no agregar documentacion redundante, no refactorizar fuera de alcance, proponer cambios priorizados para el codeador y validar toda mejora UI contra performance, permisos, persistencia y mantenibilidad. Si el usuario trae decisiones nuevas de la CMO o del codeador, agregarlas aca arriba con fecha y consecuencias tecnicas.

---

## [2026-07-02] Codex (auditoria tecnica backend/frontend)

**De que se hablo:** el usuario pidio analizar el funcionamiento de toda la app para constatar si backend y frontend son potables y recomendar cambios. Se revisaron `whatsapp-catering-bot.js`, `approval-panel.html`, persistencia JSON/SQLite, roles, deploy, configuracion, dependencias y arranque local en modo panel sin WhatsApp.

**Decisiones tomadas:** no se agregaron archivos nuevos de contexto. Se mantiene `CONTEXTO_AGENTES.md` como bitacora viva y `AGENTS.md`/`CLAUDE.md` como reglas estables. Como criterio CTO, la app es funcional y levantable, pero no debe seguir creciendo como monolito: prioridad en seguridad/configuracion, permisos granulares, separacion backend/frontend y migracion gradual de JSON a SQLite/PostgreSQL.

**Cambios en el codigo:** no hubo cambios funcionales. Verificaciones realizadas: `node --check whatsapp-catering-bot.js` OK; panel levantado localmente con `BOT_SKIP_WHATSAPP=1` en puerto 3099 y `/health` OK. Se detecto que `xlsx` y `pdf-parse` figuran en `package.json`/`package-lock.json` pero faltan en `node_modules`, por lo que exportacion Excel e importacion PDF quedan deshabilitadas localmente hasta reinstalar dependencias.

**Pendiente para la proxima sesion:** priorizar: 1) sacar credenciales/configuracion real y datos operativos trackeados por Git (`config-bot.json`, `usuarios-erp.json`, JSON de negocio, `catering.db*`), dejando ejemplos versionados; 2) cerrar permisos backend en endpoints autenticados sin permiso granular (`/api/sheets`, `/api/export.xlsx`, `/api/proposal.txt`, `/api/purchase-option`, `/api/operational-option`, `/api/purchase-invoice-ocr`, y lecturas amplias); 3) modularizar `whatsapp-catering-bot.js` y `approval-panel.html`; 4) completar migracion de entidades JSON a base transaccional; 5) reinstalar dependencias (`npm install`) o reconstruir `node_modules`.

---

## [2026-07-01] Claude (sesion 4 - integracion comandas + toma de inventario movil)

**De que se hablo:** dos temas principales.
1. Deploy del sistema de comandas "La Linea" al VPS (estaba pendiente del commit 2124bc1).
2. Nuevo modulo de toma de inventario movil para la mudanza al salon nuevo en Guaymallan.

**Decisiones tomadas:**
- Se completo el deploy del commit 2124bc1 (integracion comandas) al VPS. El token
  COMANDAS_SYNC_TOKEN ya estaba configurado en /etc/gratitud-erp/gratitud-erp.env y
  roles-erp.json en produccion ya tenia "comandas" en el rol admin.
- Para el inventario: el usuario va a RECIBIR todo en el salon nuevo (San Ignacio de
  Loyola 2457, Guaymallan) y contar ahi, no de salida de los depositos viejos.
  Se decidio una pagina movil standalone en /inventario, optimizada para celular,
  con sesion compartida entre dispositivos (varios pueden contar en paralelo).
- Los botones del pie se fijaron con position:fixed tras feedback del usuario.

**Cambios en el codigo:**
- Commit 4675f76: nueva pagina /inventario (inventario-movil.html, 570 lineas),
  funciones de sesion en whatsapp-catering-bot.js (start/update/close/cancel),
  5 rutas nuevas (/api/inventario-sesion y subendpoints), boton en approval-panel.html.
- Commit 4610043: fix barra de botones fija en pantalla (position:fixed).
- Ambos deployados y verificados en produccion (/health OK).

**Como funciona la sesion de inventario:**
- Archivo: /var/lib/gratitud-erp/data/inventario-sesion.json
- Al cerrar la sesion: actualiza quantity y location de los items contados en
  inventario-operativo-erp.json (el inventario operativo del panel).
- Items NO contados no se tocan. Items nuevos se pueden agregar desde el celular.

**Pendiente para la proxima sesion:**
- El usuario va a trabajar con Codex en cambios locales — verificar que no haya
  conflictos con los archivos tocados hoy (whatsapp-catering-bot.js, approval-panel.html,
  inventario-movil.html nuevo).
- Mejoras de gestion de usuarios (propuesto en sesion anterior, no implementado aun):
  toggle activo/inactivo y filtro por nombre/rol.
- Pendientes historicos: swap en VPS, backups externos (rclone), cambiar password root VPS.

---

## [2026-06-25] Claude (sesion 2 - deploy a produccion y SQLite para historial)

**De que se hablo:** se actualizo produccion (sistema.gratitudgourmet.com)
por primera vez con Claude operando el VPS por SSH directo (se armo una
llave SSH dedicada, ver `~/.ssh/id_ed25519_gratitud_vps`, alias `ssh
gratitud-vps`). Se confirmo que la data real de produccion vive en
`/var/lib/gratitud-erp/data`, SEPARADA del repo git en `/opt/gratitud-erp`
— un `git pull` ahi NO toca la base de datos real. Se revisaron mejoras
de base de datos pedidas por el usuario ("que sea mucho mas solida,
el sistema va a crecer mucho").

**Decisiones tomadas:**
- Se agrego el boton "Copiar ficha" tambien en la vista de checklist
  operativo de eventos (antes solo aparecia para usuarios sin permiso
  `logistics:write`).
- Se migro el log de auditoria (`historial-erp.json`, que se reescribia
  completo en cada accion del sistema, ~3.8MB por escritura) a una
  tabla SQLite (`audit_log` en `catering.db`), siguiendo el mismo
  patron dual-write ya probado con `compras-erp.json`. Ahora cada
  evento de auditoria es un INSERT puntual, no una reescritura total.
  El JSON viejo se migra una sola vez al arrancar y queda como backup
  historico (no se borra).
- Se agrego un checkpoint periodico del WAL de `catering.db` (cada 5
  minutos) para que `catering.db-wal` no siga creciendo sin control.
- Se elimino `usuarios-erp.backup.json` en produccion (copia manual
  vieja, ya superada por backups automaticos).

**Cambios en el codigo:**
- Commit `ccb1f56`: boton "Copiar ficha" en vista de checklist.
- Commit `3d1f7a3`: migracion de auditoria a SQLite (`audit_log`) +
  checkpoint periodico del WAL.
- Ambos ya deployados y verificados en produccion (`/health` OK,
  migracion de 462 registros de auditoria confirmada 1:1 JSON vs SQLite).

**Pendiente para la proxima sesion:**
- Migrar el resto de entidades JSON (eventos, ordenes de compra,
  ordenes de pago, etc.) al mismo patron SQLite, empezando por las de
  mayor escritura (`eventos-erp.json`, `ordenes-compra-erp.json`).
  Estas son de menor riesgo/urgencia que el historial, asi que se
  dejaron para una segunda pasada.
- Agregar swap (1-2GB) al VPS — no se toco infraestructura del
  sistema operativo en esta sesion, solo la app.
- Sincronizar la carpeta `backups/` del VPS a almacenamiento externo
  (ej. rclone) para no depender de un unico disco.
- IMPORTANTE: la contrasena de `root` del VPS quedo expuesta en el
  historial de chat de la sesion anterior (no esta sesion). Sigue
  pendiente que el usuario la cambie manualmente.

---

## [2026-06-25] Claude

**De que se hablo:** revision completa del historial de commits del proyecto
(27 commits desde el inicial) para entender que se hizo hasta ahora, probablemente
con Codex. Se identifico la evolucion: bot simple -> ERP operativo completo con
manuales en PDF/DOCX para el personal.

**Decisiones tomadas:**
- Sacar `.wwebjs_auth/` del tracking de git (ya estaba en `.gitignore` pero
  seguia trackeado desde antes, generaba ruido constante en `git status`).
- Crear este archivo de bitacora compartida entre Claude y Codex.

**Cambios en el codigo:**
- Commit `466f8c8`: removidos 316 archivos de `.wwebjs_auth/` del indice de git
  (sesion local de whatsapp-web.js, se mantienen en disco, no se borraron).

**Pendiente para la proxima sesion:**
- Decidir si consolidar la persistencia de datos (hoy convive JSON suelto +
  SQLite `catering.db` + Sheets desactivado) hacia SQLite como unica fuente
  de verdad, manteniendo las mismas rutas API.
- Revisar `historial-erp.json` (decenas de miles de lineas) — evaluar si rotar
  o archivar en vez de mantenerlo como un solo archivo creciente.
- Revisar en detalle el modulo de seguridad de invitaciones por email
  (commit `60ddca4`) por ser superficie sensible (tokens, expiracion, permisos).
- Mejorar mensajes de commit: muchos commits anteriores son genericos
  ("resumen", "varios", "cambios") sin describir que se toco.
