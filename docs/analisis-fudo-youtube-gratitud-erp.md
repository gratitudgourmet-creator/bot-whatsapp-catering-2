# Analisis FUDO vs Gratitud Gourmet ERP

Fecha de analisis: 22/06/2026  
Fuente principal: playlist publica de YouTube "Comienza con Fudo | Capacitaciones completas"  
Fuente secundaria: sitio oficial FUDO Argentina, pagina principal y pagina de funcionalidades.

## Alcance y metodo

Se analizaron los 3 videos de la playlist:

1. [Capacitacion completa parte 1: productos, ingredientes y gastos](https://www.youtube.com/watch?v=RYs15PtY-ik)
2. [Capacitacion completa parte 2: ventas, clientes y proveedores](https://www.youtube.com/watch?v=SSvWqIFFyD4)
3. [Capacitacion completa parte 3: herramientas avanzadas](https://www.youtube.com/watch?v=2m2_yzkQEuk)

Tambien se reviso el estado actual del sistema Gratitud Gourmet ERP en:

- `whatsapp-catering-bot.js`
- `approval-panel.html`
- `Manual_Procedimientos_Operativos_Gratitud_Gourmet.md`
- `docs/DOCUMENTACION_FUNCIONAL_EJECUTIVA.md`

Nota importante: FUDO esta pensado para restaurantes, bares, cafes, mostrador, delivery y mesas. Gratitud Gourmet ERP esta pensado para catering, eventos, produccion previa, compras por evento, logistica, fichas operativas, roles internos y control administrativo. Por eso no conviene copiar FUDO literalmente: conviene tomar patrones de claridad, control y velocidad operativa.

---

# 1. Inventario de videos analizados

## Video 1 - Productos, ingredientes y gastos

Duracion aproximada: 1 h 09 min  
Temas detectados:

- Requerimientos tecnicos.
- Roles y permisos.
- Creacion de usuarios.
- Carga de productos e ingredientes.
- Categorias y subcategorias.
- Recetas y subrecetas.
- Fichas tecnicas.
- Grupos modificadores.
- Control de stock.
- Conteo de inventario.
- Registro de gastos.
- Actualizacion automatica de costos y stock desde gastos.

Lectura para Gratitud Gourmet:

FUDO ordena primero la "base maestra": productos, ingredientes, recetas, usuarios y stock. En Gratitud Gourmet esta base existe, pero todavia esta distribuida entre recetas, compras, proveedores, inventario y costos generales. Falta una experiencia mas centralizada para "maestros operativos": insumos, recetas, categorias, unidades, mermas, proveedores sugeridos, stock y alertas.

### Detalle funcional y UX detectado

| Aspecto | Observacion | Adaptacion para Gratitud Gourmet |
|---|---|---|
| Pantallas | Configuracion, usuarios, roles, productos, ingredientes, recetas, stock, inventario, gastos | Separar configuracion maestra de operacion diaria. Crear "Maestros" dentro de Admin o Stock |
| Botones | Crear nuevo, guardar, editar, eliminar, agregar ingrediente, agregar categoria, activar control de stock | Mantener acciones claras y repetibles en todas las entidades |
| Formularios | Formularios con campos tecnicos pero ordenados por bloques | En recetas, separar datos generales, rendimiento, ingredientes, pasos, fotos, costos y revision |
| Tablas | Listados con filtros y acciones | En Gratitud, todas las tablas largas deben tener scroll interno y columnas principales fijas |
| Filtros | Busqueda por producto/ingrediente/categoria | Filtros por categoria, proveedor, unidad, stock, IVA, evento y estado |
| Estados | Producto activo, control de stock, ingrediente, subreceta, gasto cargado | Estados operativos: activo, discontinuado, con stock, sin precio, con variacion, necesita revision |
| Automatizaciones | Gasto actualiza costo y stock | Compra/recepcion debe actualizar precio, stock, receta y alertas |
| Roles | Permisos por usuario y rol | Completar permisos por modulo, subvista, estadistica y accion |
| Reportes | Stock, inventario, gastos | Reportes por evento, proveedor, categoria, insumo y margen |
| UX | Primero se configura la base, despues se opera | Gratitud necesita un onboarding interno para dejar maestros prolijos |

## Video 2 - Ventas, clientes y proveedores

Duracion aproximada: 35 min  
Temas detectados:

- Apertura y cierre de caja.
- Arqueo de caja.
- Ventas por mesa, mostrador y delivery.
- Propinas.
- Descuentos.
- Cierres parciales.
- Ventas individuales.
- Movimientos de caja.
- Registro de gastos.
- Cuentas corrientes de clientes.
- Cuentas corrientes de proveedores.
- Reportes.

Lectura para Gratitud Gourmet:

Para catering, "venta" no deberia ser mesa o mostrador, sino evento/presupuesto/cobro. La idea fuerte a copiar es la trazabilidad financiera: cada ingreso, egreso, saldo, pago parcial, deuda y cuenta corriente debe estar ligado a un evento, proveedor, cliente o persona.

### Detalle funcional y UX detectado

| Aspecto | Observacion | Adaptacion para Gratitud Gourmet |
|---|---|---|
| Pantallas | Caja, ventas, gastos, clientes, proveedores, cuentas corrientes, reportes | Crear Finanzas como centro: cobros, pagos, deudas, reintegros, cuentas y facturacion |
| Botones | Abrir caja, cerrar caja, registrar movimiento, cerrar venta, aplicar descuento | Para eventos: registrar sena, registrar saldo, pagar proveedor, reintegrar, emitir orden de pago |
| Flujos | Apertura -> venta/gasto -> movimientos -> cierre -> reporte | Evento -> presupuesto -> cobro -> compras -> pagos -> conformidad -> cierre administrativo |
| Formularios | Monto, medio de pago, cliente/proveedor, fecha, observacion | Unificar selects de medio/origen/cuenta y permitir comprobantes |
| Tablas | Movimientos y reportes historicos | Tablas financieras por periodo, proveedor, evento, estado y cuenta |
| Estados | Venta abierta/cerrada, gasto pagado/pendiente, cuenta corriente | Evento cobrado/parcial/pendiente, facturable/no facturable, facturado/no facturado, cerrado |
| Acciones rapidas | Descuentos, cierres parciales, cuentas corrientes | Acciones rapidas sobre evento: cobrar, facturar, pagar compras, cerrar |
| Atajos | Operacion pensada para velocidad de caja | Gratitud necesita velocidad de admin: pocos clicks para cargar pago o deuda |
| Reportes | Ventas, caja, cuentas corrientes | Margen real por evento y deuda real por proveedor |
| UX | Se entiende el estado financiero en pantalla | Gratitud debe mostrar "que falta para cerrar" en cada evento |

## Video 3 - Herramientas avanzadas

Duracion aproximada: 30 min  
Temas detectados:

- App movil.
- Flujo de impresoras.
- Comandas digitales.
- Monitor de cocina/KDS.
- Carta QR.
- Tienda online.
- Integraciones con delivery apps.
- Integracion con medios de pago.
- Facturacion electronica.

Lectura para Gratitud Gourmet:

Lo mas aplicable no es delivery apps, sino "pantallas por rol": cocina, logistica, finanzas, bromatologia, admin y cliente. El equivalente del KDS para catering es una pantalla de produccion/evento: preparaciones, cantidades, responsables, estados, tiempos, fotos, observaciones y cierre.

### Detalle funcional y UX detectado

| Aspecto | Observacion | Adaptacion para Gratitud Gourmet |
|---|---|---|
| Pantallas | App movil, impresoras, monitor cocina, carta QR, tienda online, integraciones, facturacion | Crear pantallas mobile-first por rol y portal cliente |
| Botones | Enviar a cocina, marcar listo, configurar impresora, activar canal, integrar pago | Enviar a produccion, marcar listo, cargar camion, cerrar desmontaje, pedir autorizacion |
| Flujos | Pedido entra -> cocina lo ve -> cambia estado -> venta se cobra/factura | Evento confirmado -> cocina produce -> logistica carga -> evento se realiza -> admin cierra |
| Formularios | Configuracion de canales, impresoras, tienda, facturacion | Configuracion de ficha operativa, plantillas, categorias, permisos, cuentas y facturacion |
| Estados | En preparacion, enviado, entregado; tiempos de preparacion | Pendiente, en produccion, listo, cargado, entregado, desmontado, cerrado |
| Automatizaciones | Integraciones de pedidos y pagos | Integrar pagos, Sheets, inventario, compras, conformidades y futuras IA |
| Roles | App movil para operacion | Logistica, cocina, finanzas y admin con pantallas distintas |
| UX | Muy orientado al usuario operativo, no al tecnico | Gratitud debe esconder costos a logistica/cocina y mostrar solo lo accionable |
| Iconografia | Acciones reconocibles y estados visuales | Usar iconos para mapa, telefono, WhatsApp, descargar, editar, cerrar |
| Dashboard | Monitor de cocina como tablero vivo | Monitor de produccion/evento como tablero vivo |

---

# 1.1 Funcionalidades FUDO detectadas por tipo de objeto

## Usuarios y permisos

- Roles por area.
- Usuarios con permisos especificos.
- Restricciones para acciones sensibles.
- Acceso por dispositivo.

Aplicacion en Gratitud:

- Ya existe base de login/roles.
- Falta una pantalla admin mas simple y obligatoria para administrar permisos por funcion, vista y estadistica.
- Conviene agregar "autorizaciones pendientes" como bandeja central.

## Productos, ingredientes y recetas

- Alta de productos.
- Alta de ingredientes.
- Categorias y subcategorias.
- Recetas y subrecetas.
- Ficha tecnica.
- Modificadores/adicionales.
- Control de merma y desperdicio.
- Listas de precios.

Aplicacion en Gratitud:

- Recetas existe, pero necesita una UX menos tecnica.
- Falta maestro unico de insumos.
- Falta separar procedimiento de ingrediente medible.
- Falta que presupuesto/menu se conecte naturalmente con recetas y orden de compra.

## Stock e inventario

- Control de stock por producto/ingrediente.
- Movimientos historicos.
- Notificaciones por falta de stock.
- Prohibicion de vender si no hay stock.
- Conteo de inventario.

Aplicacion en Gratitud:

- No hay que prohibir "vender" como FUDO; hay que advertir si un evento confirmado no tiene stock/compras/ordenes suficientes.
- El conteo debe ser por deposito, freezer, heladera, vajilla y equipamiento.
- Las diferencias deben generar alerta administrativa.

## Gastos, compras y proveedores

- Carga de gastos.
- Categorias de gastos.
- Actualizacion de costos.
- Actualizacion de stock.
- Cuentas corrientes de proveedores.
- Vencimiento de gastos.

Aplicacion en Gratitud:

- Compras ya es un modulo fuerte.
- Falta cerrar bien la recepcion, diferencias, datos bancarios, historial de pagos y ordenes de pago formales.
- Proveedores deben evitar duplicados por nombre comercial/razon social/CUIT.

## Ventas, caja y clientes

- Ventas por mesa, mostrador y delivery.
- Cierres parciales.
- Descuentos.
- Multiples medios de pago.
- Arqueo de caja.
- Cuentas corrientes de clientes.

Aplicacion en Gratitud:

- Reemplazar venta por evento/presupuesto.
- Hacer cobros parciales por evento.
- Agregar cuenta corriente por cliente.
- Separar cierre logistico de cierre administrativo.

## Cocina y operacion

- Comandas.
- Monitor de cocina.
- Tiempos de preparacion.
- Alertas.
- Aviso al camarero.

Aplicacion en Gratitud:

- Crear Monitor de Produccion por evento.
- Checklist cocina con cantidades.
- Estados por item.
- Rol cocinero sin costos.
- Historial de cambios con aprobacion admin.

## Canales externos

- App movil.
- Carta QR.
- Tienda online.
- Delivery apps.
- Medios de pago.
- Facturacion electronica.

Aplicacion en Gratitud:

- Prioridad: web responsive por rol, portal cliente, links de pago y facturacion.
- Delivery apps queda bajo, salvo que Gratitud venda productos estandarizados.

---

# 2. Comparacion funcional contra Gratitud Gourmet ERP

## Matriz principal

| Funcionalidad FUDO | Video | Problema que resuelve | Modulo | Estado en Gratitud | Implementacion recomendada | Archivos probables | Datos necesarios | Beneficio | Prioridad | Complejidad | Riesgo |
|---|---:|---|---|---|---|---|---|---|---|---|---|
| Roles y permisos por usuario | 1 | Limitar acciones segun area | Usuarios y roles | Existe parcial | Completar panel admin clickeable, permisos por funcion, subvista y estadistica; ocultar no permitido en frontend y bloquear backend | `whatsapp-catering-bot.js`, `approval-panel.html` | roles, permissions, visibleTabs, visibleSections | Orden y seguridad real | Alta | Media | Medio |
| Usuarios ilimitados/operativos | 1 | Operar por persona, no por usuario generico | Usuarios | Existe | Mejorar alta rapida, reset de clave, estado activo/inactivo, ultimo acceso | mismos | users, audit | Control administrativo | Media | Baja | Bajo |
| PIN o autorizacion por rol | 1 | Autorizar acciones sensibles | Seguridad | Parcial | PIN/firma admin para cerrar sin conformidad, aprobar pagos, aprobar cambios de receta | backend + panel | approvals, requestedBy, approvedBy | Evita cierres inseguros | Alta | Media | Medio |
| Productos e ingredientes maestros | 1 | Evitar cargar texto libre repetido | Stock/Compras/Recetas | Parcial | Crear maestro unico de insumos con unidad base, categoria, IVA habitual, proveedor sugerido, stock y equivalencias | backend, panel compras/recetas | products, units, iva, supplierLinks | Menos errores y duplicados | Alta | Alta | Medio |
| Categorias y subcategorias | 1 | Ordenar productos, ingredientes y proveedores | Stock/Proveedores | Parcial | Administrador de categorias reutilizable | backend/panel | category tree | Filtros y reportes mejores | Alta | Media | Bajo |
| Subingredientes o ingredientes vinculados | 1 | Modelar preparaciones intermedias | Recetas | Parcial | Formalizar "preparaciones" como receta insumo: crudo -> limpio -> cocido -> terminado | recetas | recipeType, stage, yield | Costeo real | Alta | Media | Medio |
| Recetas y subrecetas | 1 | Calcular costo real por producto | Recetas/Produccion | Existe parcial | Separar ingredientes de pasos, fotos, mermas, rendimiento, escalado a enteros y exportacion de libro | recetas/panel | ingredients, procedures, media | Cocina mas ordenada | Alta | Media | Medio |
| Ficha tecnica | 1 | Documentar produccion estandar | Recetas/Cocina | Existe parcial | Convertir ficha de receta en vista imprimible y descargable; sin costos para rol cocinero | panel/backend | recipeBook export | Profesionaliza cocina | Alta | Media | Bajo |
| Modificadores/adicionales | 1 | Opciones elegibles dentro de producto | Presupuestos/Menu | No existe bien | Para catering: menu con items, variantes y subitems; extras opcionales; adicionales por persona | eventos/presupuestos | menuItems, variants, addOns | Presupuestos flexibles | Alta | Alta | Medio |
| Control de stock | 1 | Saber disponibilidad | Stock | Parcial | Consolidar inventario por deposito/freezer/heladera, stock ficticio, recepciones y consumos por evento | compras/inventario/eventos | inventoryMovements, locations | Evita compras duplicadas | Alta | Alta | Medio |
| Conteo de inventario | 1 | Comparar stock teorico vs fisico | Stock | Parcial inicial | Crear pantalla de conteo por deposito con diferencias y ajustes aprobables | compras/inventario | counts, adjustments | Control real de deposito | Alta | Media | Medio |
| Registro de gastos | 1/2 | Registrar egresos y cuentas a pagar | Compras/Finanzas | Existe | Mejorar tabla larga, edicion sin duplicar Sheets, proveedor y evento obligatorios salvo gasto general | compras/backend | purchases, payments | Base financiera confiable | Alta | Media | Alto |
| Actualizar costo desde gasto | 1 | Mantener costo de insumos al dia | Compras/Recetas | Parcial | Cuando compra cambia precio, recalcular recetas afectadas y mostrar impacto | compras/recetas | priceHistory, affectedRecipes | Margen real | Alta | Alta | Medio |
| Actualizar stock desde gasto | 1 | Entrada automatica de mercaderia | Compras/Stock | En desarrollo | Recepcion aceptada -> inventario -> compra real | ordenes/recepciones/inventario | receiptItems, stockMovements | Une compra con deposito | Alta | Alta | Medio |
| Vencimiento de gastos | 1 | Evitar atrasos de pago | Finanzas | Parcial | Alertas por proveedor y vencimiento, bloqueo o advertencia si recepcion tiene diferencias | finanzas/compras | dueDate, paymentStatus | Menos deuda oculta | Alta | Media | Medio |
| Arqueo de caja | 2 | Control de ingresos/egresos diarios | Tesoreria | No existe formal | Adaptar a "cajas/cuentas": efectivo, banco, Mercado Pago, Joaquin, German, caja chica | finanzas | cashSessions, movements | Tesoreria ordenada | Media | Alta | Medio |
| Arqueo ciego | 2 | Cierre sin sesgo | Tesoreria | No existe | Solo si hay caja fisica frecuente | finanzas | expected vs counted | Control de caja | Baja | Media | Bajo |
| Movimientos de caja | 2 | Registrar entradas/salidas no ligadas a venta | Finanzas | Parcial | Movimiento manual con categoria, cuenta origen/destino y comprobante | finanzas | treasuryMovements | Contador feliz | Alta | Media | Bajo |
| Cuentas corrientes de proveedores | 2 | Ver deuda y pagos parciales | Proveedores/Finanzas | Existe parcial | Mostrar todos los items de deuda, datos bancarios, comprobantes, historial y OP formal | finanzas/proveedores | supplierDebt, payments, receipts | Pago claro | Alta | Media | Medio |
| Cuentas corrientes de clientes | 2 | Ver cobros pendientes | Clientes/Finanzas | Parcial | Cuenta por evento y por cliente: sena, pagos, saldo, factura, conformidad | finanzas/clientes/eventos | eventCollections | Cobranzas claras | Alta | Media | Medio |
| Descuentos fijos/porcentuales | 2 | Ajustar venta sin romper calculo | Presupuestos | Existe parcial | Separar descuento comercial, ajuste manual, autorizacion admin y motivo | presupuestos | discounts, approvals | Rentabilidad cuidada | Media | Media | Bajo |
| Cierre parcial | 2 | Pagar parte de una venta | Finanzas | Existe en compras; parcial en cobros | Cobro parcial por evento con historial, comprobante y saldo | finanzas/eventos | collectionPayments | Seguimiento real | Alta | Media | Bajo |
| Multiples medios de pago | 2 | Un pago puede tener varios medios | Finanzas | Parcial | Permitir dividir cobros/pagos por medio y cuenta | finanzas | splitPayments | Refleja realidad | Media | Media | Bajo |
| Reportes graficos | 2 | Decidir con datos | Dashboard/Reportes | Parcial | Modulo Reportes con ventas, margen, compras, deuda, eventos, proveedores, productos | panel/backend | aggregated metrics | Gestion ejecutiva | Alta | Alta | Medio |
| App movil | 3 | Operar desde telefono/tablet | Aplicacion movil | Parcial via web/Tailscale | Hacer vistas responsive por rol: logistica, cocina, finanzas | CSS/panel | responsive layouts | Uso real en campo | Alta | Media | Bajo |
| Monitor de cocina/KDS | 3 | Gestionar comandas por estado y tiempo | Cocina/Produccion | No existe como KDS | Crear "Monitor Produccion": evento, item, cantidad, estado, responsable, demorado | panel/backend | productionTasks | Cocina sin papeles | Alta | Alta | Medio |
| Alertas sonoras KDS | 3 | Avisar nueva comanda | Cocina | No existe | Sonido opcional para tareas nuevas/urgentes | panel | notification prefs | Rapidez | Baja | Baja | Bajo |
| Aviso listo para entregar | 3 | Coordinar cocina-servicio | Cocina/Logistica | Parcial | Estados: pendiente, produccion, listo, cargado, entregado | operationalSheet | taskStatus | Menos olvidos | Alta | Media | Medio |
| Carta QR | 3 | Cliente ve menu digital | Portal cliente | No existe | Portal cliente de propuesta/ficha resumida con menu, condiciones y aprobacion | nuevo modulo | publicTokens | Experiencia comercial | Media | Alta | Medio |
| Tienda online | 3 | Venta directa | Comercial/Portal | No aplicar literal | Para catering: formulario de pedido/evento y seleccion de propuesta | portal | quoteRequest | Mejor captacion | Baja | Alta | Medio |
| Integraciones delivery | 3 | Centralizar pedidos de apps | Integraciones | No aplica hoy | Solo integrar PedidosYa si venden productos/eventos chicos | integraciones | externalOrders | Futuro | Baja | Alta | Alto |
| Medios de pago integrados | 3 | Cobrar con QR/link | Finanzas/Portal | No existe | Mercado Pago link/QR para senas y saldos | finanzas/portal | paymentLinks | Cobro mas facil | Media | Alta | Medio |
| Facturacion electronica | 3 | Emitir comprobantes fiscales | Finanzas | Parcial como estado | Integracion ARCA o carga manual avanzada: condicion facturar/no facturar, comprobante, PDF | finanzas/eventos | invoices | Control fiscal | Alta | Alta | Alto |
| Impresion de comandas/precuentas | 3 | Pasar ordenes a cocina/cliente | Cocina/Eventos | Parcial con ficha | Exportar checklist cocina, ficha logistica, orden de compra, conformidad | panel/export | printTemplates | Operacion ordenada | Alta | Media | Bajo |
| API | Sitio oficial | Integrar e-commerce u otros sistemas | Automatizaciones | Parcial sin API formal | Documentar endpoints, tokens y permisos; separar API publica/interna | backend/docs | apiTokens | Escalabilidad | Media | Media | Medio |
| Agentes IA | Sitio oficial | Automatizar venta/recepcion | IA | Parcial con bot y parseos | IA propia: leer presupuestos, sugerir insumos, recetas, cantidades, compras y aprendizajes | backend/IA | prompts, knowledgeBase | Diferencial propio | Alta | Alta | Medio |

---

# 3. Clasificacion por modulos

## CRM / Clientes / Comercial

Ya existe:

- Clientes.
- Historial inicial.
- Pipeline comercial.
- Nuevo pedido / eventos.
- Presupuestos.
- Seguimientos.

Falta o hay que mejorar:

- Unificar "Nuevo pedido" y "Crear evento" en un flujo unico: crear oportunidad/evento desde una sola accion.
- Convertir el pipeline en tablero compacto y usable, no una grilla que se deforma.
- Cuenta corriente de cliente por evento.
- Portal cliente con propuesta, condiciones, aprobacion y conformidad.
- Historial estetico por cliente: eventos, presupuestos, pagos, preferencias, restricciones, notas.

## Eventos / Produccion / Logistica / Cocina

Ya existe:

- Eventos ERP.
- Ficha operativa.
- Logistica Evento por rol.
- Checklist por rubros.
- Cierre logistico con autorizacion admin.
- Observaciones finales para aprendizaje.

Falta o hay que mejorar:

- Monitor de produccion tipo KDS adaptado a eventos.
- Checklist cocina descargable con cantidades.
- Estados por item: pendiente, en produccion, listo, cargado, entregado.
- Diferenciar evento confirmado, en produccion, realizado, cerrado administrativo.
- Que eventos perdidos/cancelados salgan del control operativo.
- Que "solo entrega" no sugiera mobiliario, utensilios ni manteleria.
- Cargar restricciones alimentarias y sugerir insumos/producciones especiales.

## Recetas

Ya existe:

- Recetas con ingredientes/procesos/costos.
- Fotos y revisiones del cocinero.
- Admin aprueba cambios.
- Exportacion/descarga de recetas.

Falta o hay que mejorar:

- Interfaz mas guiada.
- Separar paso/procedimiento de ingrediente medible.
- Mermas y rendimientos mas claros.
- Preparaciones intermedias como insumos.
- Versionado de recetas.
- Escalado a numeros enteros.
- Libro de recetas imprimible por categoria.

## Compras / Proveedores / Stock / Almacenes

Ya existe:

- Planilla de compras.
- Importacion desde Sheets.
- Edicion/eliminacion.
- Deuda por proveedor.
- Pagos parciales.
- Proveedores.
- Ordenes de compra.
- Recepcion de ordenes.
- Inventario basico.
- Insumos con variacion.

Falta o hay que mejorar:

- Maestro unico de productos/insumos.
- Stock por deposito/freezer/heladera/ubicacion.
- Conteo de inventario real.
- Recepcion con diferencias y bloqueo/advertencia de pago.
- Compra real generada desde recepcion aceptada.
- Ordenes de compra adjuntas a eventos, por proveedor y modificables.
- Datos bancarios visibles en pago de deuda.
- Historial de pagos con comprobantes.

## Finanzas / Tesoreria / Administracion

Ya existe:

- Cobros por evento.
- Deuda con proveedores.
- Reintegros a Joaquin/German.
- Ordenes de pago.
- Estado de facturacion.
- Conformidad PDF.

Falta o hay que mejorar:

- Caja/cuentas: efectivo, banco, MP, caja chica, Joaquin, German.
- Movimientos de tesoreria no vinculados a compras.
- Estado de resultados por periodo.
- Reporte de rentabilidad por evento y general.
- Dashboard para contador.
- Facturacion electronica o control fiscal avanzado.
- Cierre administrativo del evento distinto de "realizado".

## Reportes / Dashboard

Ya existe:

- ERP resumen.
- Compras por periodo.
- Finanzas.
- Estados de eventos.

Falta o hay que mejorar:

- Reportes por periodo con graficos.
- Ventas aceptadas, cobradas y pendientes.
- Margen por evento, tipo de servicio, cliente, responsable.
- Compras por categoria/proveedor/evento.
- Variacion de precios.
- Ranking de productos/insumos mas usados.
- Reporte de stock: valor, faltantes, vencimientos, desperdicios.

## Usuarios y roles

Ya existe:

- Login.
- Roles.
- Permisos.
- Historial.
- Pestañas visibles por rol.

Falta o hay que mejorar:

- Panel admin realmente accionable para editar cada permiso, vista, funcion y metrica.
- Historial filtrable por usuario, modulo, fecha y accion.
- Autorizaciones pendientes centralizadas.
- Simulador de rol: "ver como Bruno", "ver como Finanzas".

## Automatizaciones / IA

Ya existe:

- Bot WhatsApp.
- OCR de compras en estado experimental.
- Parseo de presupuestos.
- Sugerencias operativas.

Falta o hay que mejorar:

- IA para extraer menu de PDFs con estructura: item, descripcion, categoria, subitems, infraestructura.
- IA para sugerir cantidades por persona.
- IA para sugerir ordenes de compra desde menu + recetas + stock.
- IA para aprender de comentarios post-evento.
- IA para alertar inconsistencias: evento sin presupuesto, compra sin evento, margen bajo, deuda vencida.

---

# 4. Analisis estetico y UX/UI de FUDO

## Rasgos visuales detectados

El mensaje oficial de FUDO insiste en interfaz "simple, moderna, amigable y facil de usar", funcionamiento online y uso desde distintos dispositivos. Su pagina de funcionalidades agrupa el sistema en bloques claros: ventas, gastos, productos, clientes, proveedores, usuarios y reportes. La navegacion publica y el discurso del producto priorizan accion rapida, control operativo y poca friccion.

Patrones utiles para Gratitud:

- Modulos simples, no pantallas interminables.
- Acciones principales visibles y pocas por pantalla.
- Formularios orientados a tareas, no a bases de datos gigantes.
- Reportes con foco en decisiones: ventas, gastos, stock, margen, rankings.
- Cada flujo tiene un "cierre": cerrar caja, cerrar venta, cerrar gasto, cerrar comanda.
- Separacion clara entre configuracion maestra y operacion diaria.

## Diferencias con el panel actual

Gratitud Gourmet ERP tiene mas profundidad para catering, pero la UI actual todavia se siente cargada:

- Muchas tarjetas grandes con informacion repetida.
- Tablas que se rebalsan horizontalmente.
- Modales que a veces quedan angostos para eventos grandes.
- Pipeline comercial poco expresivo cuando hay varios eventos.
- Campos y selects que todavia no se sienten todos iguales.
- Se mezclan vistas operativas con administrativas.
- Hay funciones potentes, pero no siempre se llega a ellas intuitivamente.

## Linea UX recomendada

Gratitud debe parecer menos "planilla avanzada" y mas "centro de mando gastronomico":

- Home por modulo.
- Submenus por hover/click, pero con vista principal clara.
- Tablas con columnas fijas, scroll interno y acciones con menu de tres puntos.
- Fichas grandes para eventos, recetas y proveedores.
- Paneles de estado con semaforos.
- Botones primarios verdes oscuros, secundarios neutros, peligros rojos suaves.
- Menos texto explicativo dentro de la app; mas labels claros.

---

# GUIA VISUAL PARA GRATITUD GOURMET ERP

## Paleta recomendada

- Fondo principal: `#EEF2F4` o `#F3F6F7`.
- Superficies: `#FFFFFF`.
- Texto principal: `#17212B`.
- Texto secundario: `#66758A`.
- Verde marca/accion: `#0F4F43`.
- Verde claro de exito: `#DCEFE9`.
- Amarillo alerta: `#FFF1D2`.
- Rojo alerta: `#F8D7DA`.
- Azul informacion muy puntual: `#E6F0FA`.
- Bordes: `#D6DEE6`.

Evitar que todo sea verde. El verde debe marcar accion, estado positivo o identidad; el resto debe ser neutro y legible.

## Tipografia

- Usar una sans-serif moderna: Inter, system-ui, Segoe UI.
- Texto base: 14 px.
- Labels: 11-12 px, mayusculas suaves.
- Titulos de tarjeta: 15-16 px.
- Titulos de pantalla: 20-24 px.
- Evitar textos en mayuscula completa salvo etiquetas cortas.

## Botones

- Primario: fondo verde oscuro, texto blanco, altura 36-40 px.
- Secundario: blanco, borde gris, texto oscuro.
- Peligro: rojo suave, texto rojo oscuro.
- Acciones de fila: boton circular de tres puntos.
- Botones con icono cuando sea una accion conocida: descargar, editar, mapa, telefono, WhatsApp, imprimir.

## Tarjetas

- Radio 8 px maximo.
- Borde fino.
- Sombra minima o nula.
- No meter tarjetas dentro de tarjetas.
- Usar tarjetas para entidades: evento, proveedor, receta, deuda.

## Tablas

- Header fijo.
- Scroll interno.
- Columnas principales visibles.
- Columnas secundarias ocultables.
- Acciones en tres puntos.
- Badges para estado.
- Fila clickeable para abrir ficha.

## Formularios

- Dos columnas en desktop, una columna en mobile.
- Selects y inputs con la misma altura.
- Autocomplete para cliente, lugar, proveedor, producto.
- Boton "Agregar nuevo" dentro del flujo, sin salir de la pantalla.
- Validaciones visibles dentro del modal.

## Modales

- Eventos y fichas operativas: modal casi pantalla completa.
- Compras/proveedores/clientes: modal ancho medio.
- Confirmaciones: modal chico.
- ESC siempre debe cerrar si no hay cambios sin guardar.

## Dashboard

- No mostrar todo. Mostrar:
  - eventos proximos reales,
  - eventos pendientes de cierre,
  - compras/deudas urgentes,
  - cobros pendientes,
  - margen por periodo,
  - alertas accionables.

## Uso del logo

Usar el logo solo en header/login/reportes/exportaciones. En pantallas internas, priorizar claridad operativa.

---

# REDISENO PROPUESTO DEL PANEL

## Header

- Izquierda: logo + "Gratitud Gourmet ERP".
- Centro: buscador global.
- Derecha: usuario, rol, notificaciones, salir.

## Menu principal

Pestañas principales:

- ERP
- Comercial
- Eventos
- Compras
- Finanzas
- Produccion/Cocina
- Logistica Evento
- Recetas
- Stock
- Proveedores
- Clientes
- RRHH
- Bromatologia
- Seguridad
- Reportes

Cada pestaña abre su home. Al pasar el mouse muestra submenus. Al tocar la pestaña, carga la vista mas importante.

## Dashboard inicial ERP

Debe ser un resumen ejecutivo:

- Proximos eventos confirmados.
- Eventos en produccion.
- Cierres pendientes.
- Venta aceptada del periodo.
- Cobrado vs pendiente.
- Compras pendientes.
- Deuda proveedores.
- Margen estimado y margen real.
- Alertas criticas.

## Comercial

Debe contener:

- Leads/oportunidades.
- Pipeline compacto.
- Clientes.
- Lugares.
- Presupuestos.
- Seguimientos.

"Nuevo pedido" y "Crear evento" deberian unificarse en "Nuevo evento / oportunidad".

## Eventos

Debe ser el centro de vida del evento:

- Ficha general.
- Menu.
- Presupuesto.
- Compras imputadas.
- Ordenes de compra.
- Produccion.
- Logistica.
- Cobros.
- Facturacion.
- Conformidad.
- Cierre administrativo.

## Compras

Debe contener:

- Planilla de compras.
- Cargar compra.
- Ordenes de compra.
- Recepciones.
- Inventario.
- Insumos con variacion.
- Importar/exportar Sheets.

## Finanzas

Debe contener:

- Cobros por evento.
- Pagos a proveedores.
- Reintegros.
- Ordenes de pago.
- Cuentas/cajas.
- Facturacion.
- Reporte para contador.

## Recetas / Produccion

Debe contener:

- Libro de recetas.
- Cargar/editar receta.
- Revision de cambios del cocinero.
- Fotos.
- Exportar receta.
- Checklist cocina por evento.
- Monitor de produccion.

## Logistica Evento

Debe ser mobile-first:

- Eventos confirmados/proximos.
- Ficha operativa sin costos.
- Checklist editable por rubro.
- Comentarios de cierre obligatorios.
- Boton de mapa.
- Telefono/WhatsApp del cliente.
- Cierre enviado a autorizacion admin.

## Usuarios/Roles

Debe contener:

- Usuarios.
- Roles.
- Permisos por funcion.
- Permisos por vista.
- Permisos por estadistica.
- Auditoria filtrable.
- Autorizaciones pendientes.

## Reportes

Debe contener:

- Ventas.
- Compras.
- Margen.
- Stock.
- Proveedores.
- Clientes.
- Eventos.
- RRHH.
- Bromatologia.
- Exportaciones Excel/PDF.

---

# BACKLOG FUNCIONAL

## Prioridad alta

- Maestro unico de productos/insumos con unidad base, IVA, categoria, proveedor sugerido y stock.
- Stock por deposito/freezer/heladera/ubicacion.
- Recepcion de ordenes con diferencias, alertas y bloqueo/advertencia de pago.
- Convertir recepcion aceptada en compra real.
- Cuentas corrientes completas de proveedores y clientes.
- Historial de pagos con comprobantes.
- Reportes ejecutivos por periodo.
- Monitor de produccion/cocina por evento.
- Eventos como entidad central: presupuesto, compras, cobros, logistica, conformidad, facturacion y cierre.
- Portal/flujo de autorizaciones admin.
- Panel admin accionable para permisos y funciones.
- Mejorar importacion de presupuesto PDF: menu estructurado, subitems, infraestructura separada.
- Ordenes de compra desde menu + recetas + stock.

## Prioridad media

- Caja/cuentas de tesoreria.
- Multiples medios de pago por cobro/pago.
- Estado de resultados.
- Portal cliente para propuesta, aprobacion y conformidad.
- Mercado Pago para senas y saldos.
- Facturacion electronica o integracion fiscal.
- Versionado de recetas.
- Conteo de inventario.
- Alertas de stock minimo.
- Simulador de rol.
- Reportes graficos.

## Prioridad baja

- Tienda online para pedidos simples.
- Integraciones delivery.
- Alertas sonoras.
- App nativa. Primero conviene perfeccionar web responsive.
- Balanzas.
- Arqueo ciego, salvo que la caja fisica crezca.

---

# BACKLOG DE DISENO / UX

## Alta

- Tablas largas con scroll interno, header fijo y columnas ordenadas.
- Fichas de evento en modal grande.
- Formularios consistentes.
- Selects/autocomplete unificados.
- Acciones de fila con tres puntos.
- Dashboard ERP con datos accionables.
- Pipeline comercial compacto y legible.
- Mobile-first para Logistica Evento y Cocina.
- Alertas accionables con modal de resolucion.

## Media

- Home por modulo con accesos rapidos.
- Badges de estado unificados.
- Panel de autorizaciones admin.
- Tarjetas de proveedor/cliente mas limpias.
- Vista de reportes con filtros por periodo.
- Buscador global mas visible.

## Baja

- Animaciones suaves.
- Temas visuales.
- Personalizacion de colores por usuario.

---

# QUICK WINS

1. Unificar "Nuevo pedido" y "Crear evento" como "Nuevo evento / oportunidad".
2. Crear pestaña "Eventos" separada de Comercial y ERP.
3. Pasar "Estados de eventos" a dashboard accionable con filtros.
4. Hacer modal de evento casi pantalla completa.
5. Limitar tablas de compras/proveedores/eventos con scroll interno real.
6. Agregar menu de tres puntos en todas las filas.
7. Hacer que cada alerta abra un modal con detalle y accion.
8. Separar infraestructura/servicios del menu en presupuestos importados.
9. Agregar filtro por usuario en historial.
10. Crear reporte de "cierres pendientes": conformidad, cobro, facturacion, compras, comentario logistico.
11. Mostrar datos bancarios del proveedor dentro de deuda/pago.
12. Crear export "Checklist cocina" desde evento.

---

# ROADMAP 90 DIAS

## Semana 1 a 2

Objetivo: ordenar la experiencia y corregir fricciones criticas.

- Redisenar ERP como dashboard ejecutivo real.
- Crear modulo Eventos como centro del evento.
- Mejorar tablas largas.
- Unificar botones y selects.
- Arreglar pipeline comercial o reemplazarlo por lista + tablero compacto.
- Panel admin clickeable y auditoria filtrable.
- Estado de facturacion/no facturar bien integrado.
- Modal de evento grande.
- Manual actualizado.

## Semana 3 a 4

Objetivo: cerrar compras, proveedores y finanzas.

- Maestro de proveedores completo y sin duplicados por cambio de nombre.
- Deuda proveedor con todos los items, datos bancarios y comprobantes.
- Historial de pagos.
- Reintegros Joaquin/German con cuentas y comprobantes.
- Recepcion de ordenes con diferencias.
- Convertir recepcion aceptada en compra.
- Bloqueo/advertencia de pago si hay diferencias.
- Dashboard financiero por periodo.

## Mes 2

Objetivo: produccion, cocina, recetas y stock.

- Maestro unico de insumos/productos.
- Inventario por ubicacion.
- Conteo de inventario.
- Monitor de produccion tipo KDS para eventos.
- Checklist cocina descargable.
- Recetas con versionado, fotos, procedimientos sin costos para cocinero.
- Mejorar mermas, rendimiento y unidades.
- Ordenes de compra desde menu + recetas + stock.

## Mes 3

Objetivo: administracion avanzada y experiencia externa.

- Portal cliente.
- Aprobaciones admin centralizadas.
- Facturacion avanzada.
- Reportes graficos.
- Cuentas/cajas de tesoreria.
- IA de aprendizaje post-evento.
- IA para presupuestos PDF y sugerencias de cantidades.
- Mobile responsive completo para Logistica, Cocina y Finanzas.

---

# Cambios que conviene implementar primero en Codex

Orden recomendado:

1. Crear modulo `Eventos` independiente y mover ahi el control integral del evento.
2. Convertir ERP en resumen ejecutivo limpio.
3. Corregir tablas largas y modal de evento grande.
4. Mejorar panel admin para que sea accionable.
5. Completar finanzas/proveedores: deuda completa, datos bancarios, comprobantes e historial.
6. Consolidar maestro de productos/insumos.
7. Construir monitor de produccion/cocina.
8. Armar ordenes de compra desde evento/menu/recetas/stock.
9. Redisenar recetas para que cocina pueda operar sin ver costos.
10. Reforzar IA: parseo de PDFs, sugerencias de cantidades y aprendizaje post-evento.

---

# Fuentes consultadas

- Playlist YouTube: [Comienza con Fudo | Capacitaciones completas](https://www.youtube.com/playlist?list=PLT62ZNwqy8z2GE-cGVPiPPbs3UW-cgKFD)
- Video 1: [Productos, ingredientes y gastos](https://www.youtube.com/watch?v=RYs15PtY-ik)
- Video 2: [Ventas, clientes y proveedores](https://www.youtube.com/watch?v=SSvWqIFFyD4)
- Video 3: [Herramientas avanzadas](https://www.youtube.com/watch?v=2m2_yzkQEuk)
- FUDO Argentina: [https://fu.do/es-ar/](https://fu.do/es-ar/)
- Funcionalidades FUDO: [https://fu.do/es-ar/funcionalidades/](https://fu.do/es-ar/funcionalidades/)
