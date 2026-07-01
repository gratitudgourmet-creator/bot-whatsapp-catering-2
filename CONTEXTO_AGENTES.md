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
