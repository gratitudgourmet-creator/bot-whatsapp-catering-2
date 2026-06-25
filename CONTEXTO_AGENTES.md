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
