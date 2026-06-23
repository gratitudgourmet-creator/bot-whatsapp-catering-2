# Diagramas de flujo del Manual Operativo - Gratitud Gourmet

**Base:** Manual Operativo Digital por Areas - Gratitud Gourmet  
**Fecha:** 22/06/2026  
**Formato:** Mermaid editable

Este documento contiene un diagrama general del flujo completo del evento y diagramas separados por area para que cada equipo pueda ver su parte del proceso sin mezclar tareas.

---

## 1. Diagrama general del flujo completo

```mermaid
flowchart TD
    INICIO(["Inicio: consulta del cliente"])

    INICIO --> COM01["COM-01 Recepcion de consulta"]
    COM01 --> COM02["COM-02 Presupuesto y cierre comercial"]
    COM02 --> DECIDE_VENTA{"Cliente acepta presupuesto?"}

    DECIDE_VENTA -- "No" --> SEGUIMIENTO["Seguimiento comercial o cierre perdido"]
    SEGUIMIENTO --> COM02

    DECIDE_VENTA -- "Si" --> CONFIRMADO["Evento confirmado en dashboard"]

    CONFIRMADO --> ADM01["ADM-01 Facturacion, cobranza y cierre administrativo"]
    CONFIRMADO --> ADM02["ADM-02 Personal/RRHH, asistencia y sueldos"]
    CONFIRMADO --> ADM03["ADM-03 Bromatologia"]
    CONFIRMADO --> ADM04["ADM-04 Ordenes de pago formales"]

    CONFIRMADO --> COC01["COC-01 Produccion y mise en place"]
    COC01 --> CPR01["CPR-01 Compras para eventos"]
    CPR01 --> CPR02["CPR-02 Ordenes de compra, recepcion e inventario"]
    CPR02 --> COC01

    COC01 --> DEP01["DEP-01 Carga en deposito antes de salir"]
    CPR02 --> DEP01
    ADM02 --> DEP01
    ADM03 --> DEP01

    DEP01 --> LOG01["LOG-01 Traslado de ida al evento"]
    LOG01 --> MON01["MON-01 Montaje del evento"]
    MON01 --> MON02["MON-02 Servicio durante el evento"]
    MON02 --> DES01["DES-01 Desmontaje del evento"]
    DES01 --> LOG02["LOG-02 Traslado de vuelta al deposito"]
    LOG02 --> DEP02["DEP-02 Descarga en deposito al volver"]

    DEP02 --> LIM01["LIM-01 Limpieza de utensilios"]
    DEP02 --> LIM02["LIM-02 Limpieza de artefactos"]
    DEP02 --> LIM03["LIM-03 Orden y limpieza del deposito"]

    LIM01 --> ADM01
    LIM02 --> ADM01
    LIM03 --> ADM01
    DEP02 --> ADM01

    ADM01 --> DIR01["DIR-01 Control semanal de eventos y rentabilidad"]
    DIR01 --> MEJORA["Acciones de mejora, ajustes y nuevos controles"]
    MEJORA --> COM01

    ADM01 --> FIN(["Evento cerrado"])
```

---

## 2. Area Comercial

```mermaid
flowchart TD
    A(["Consulta recibida"]) --> B["Registrar lead en dashboard"]
    B --> C["Pedir datos minimos"]
    C --> D{"Datos completos?"}
    D -- "No" --> C
    D -- "Si" --> E["Validar tipo de evento, fecha, lugar e invitados"]
    E --> F["Consultar a cocina, logistica o servicio si corresponde"]
    F --> G["Armar presupuesto"]
    G --> H["Enviar propuesta"]
    H --> I["Registrar estado y proxima accion"]
    I --> J{"Cliente acepta?"}
    J -- "No" --> K["Seguimiento comercial o cierre perdido"]
    K --> I
    J -- "Si" --> L["Solicitar seña o autorizacion"]
    L --> M["Cambiar evento a Confirmed"]
    M --> N["Derivar a administracion y planificacion operativa"]
```

---

## 3. Area Administracion

```mermaid
flowchart TD
    A(["Evento confirmado"]) --> B["Solicitar o validar datos fiscales"]
    B --> C["Registrar seña, saldo y condiciones"]
    C --> D["Emitir factura o comprobante"]
    D --> E["Controlar cobros"]
    E --> F{"Hay saldo pendiente?"}
    F -- "Si" --> G["Reclamar o agendar cobranza"]
    G --> E
    F -- "No" --> H["Cargar gastos del evento"]
    H --> I["Cargar pagos a proveedores y personal"]
    I --> J["Procesar ordenes de pago formales"]
    J --> K["Calcular rentabilidad"]
    K --> L["Revisar diferencias entre estimado y real"]
    L --> M["Cerrar evento en dashboard"]
    M --> N["Informar a direccion"]
```

---

## 4. Area Personal / RRHH

```mermaid
flowchart TD
    A(["Evento confirmado"]) --> B["Definir personal requerido"]
    B --> C["Asignar cocina, mozos, logistica y apoyo"]
    C --> D["Confirmar disponibilidad"]
    D --> E{"Falta personal?"}
    E -- "Si" --> F["Buscar reemplazo o refuerzo autorizado"]
    F --> D
    E -- "No" --> G["Registrar horarios previstos"]
    G --> H["Controlar asistencia real"]
    H --> I["Registrar horas trabajadas y adicionales"]
    I --> J["Enviar datos a administracion"]
    J --> K["Liquidar sueldos o pagos eventuales"]
```

---

## 5. Area Bromatologia / Calidad

```mermaid
flowchart TD
    A(["Evento confirmado"]) --> B["Revisar requisitos bromatologicos"]
    B --> C["Controlar BPM, higiene y manipuladores"]
    C --> D["Verificar registros necesarios"]
    D --> E["Controlar alergenos y dietas especiales"]
    E --> F["Controlar conservacion, rotulado y temperaturas"]
    F --> G{"Hay desvio?"}
    G -- "Si" --> H["Registrar no conformidad"]
    H --> I["Definir accion correctiva"]
    I --> F
    G -- "No" --> J["Liberar continuidad operativa"]
    J --> K["Archivar evidencia"]
```

---

## 6. Area Cocina y Produccion

```mermaid
flowchart TD
    A(["Evento confirmado"]) --> B["Revisar menu, invitados, horario y formato"]
    B --> C["Revisar restricciones alimentarias y alergenos"]
    C --> D["Armar lista de produccion"]
    D --> E["Revisar stock disponible"]
    E --> F{"Faltan insumos?"}
    F -- "Si" --> G["Informar a compras"]
    G --> H["Esperar recepcion o definir reemplazo"]
    H --> I["Iniciar produccion"]
    F -- "No" --> I
    I --> J["Producir segun prioridad"]
    J --> K["Porcionar y preparar mise en place"]
    K --> L["Rotular preparaciones"]
    L --> M["Conservar segun condicion requerida"]
    M --> N["Entregar a carga con indicaciones de frio, calor o cuidado especial"]
```

---

## 7. Area Compras y Proveedores

```mermaid
flowchart TD
    A(["Necesidad de compra"]) --> B["Revisar lista del evento"]
    B --> C["Consultar stock antes de comprar"]
    C --> D{"Hay stock suficiente?"}
    D -- "Si" --> E["Reservar stock para el evento"]
    D -- "No" --> F["Elegir proveedor aprobado"]
    F --> G["Solicitar precio y disponibilidad"]
    G --> H["Emitir orden de compra si corresponde"]
    H --> I["Coordinar entrega o retiro"]
    I --> J["Recepcion e inventario"]
    J --> K{"Mercaderia conforme?"}
    K -- "No" --> L["Reclamar, rechazar o reemplazar"]
    L --> F
    K -- "Si" --> M["Registrar comprobante y pago pendiente"]
    E --> N["Informar disponibilidad a cocina/deposito"]
    M --> N
```

---

## 8. Area Deposito, Stock y Equipamiento

```mermaid
flowchart TD
    A(["Evento listo para preparar carga"]) --> B["Abrir ficha y lista de carga"]
    B --> C["Separar vajilla, cristaleria, manteleria y utensilios"]
    C --> D["Separar equipamiento y artefactos"]
    D --> E["Revisar estado, limpieza y funcionamiento"]
    E --> F{"Hay faltantes o roturas?"}
    F -- "Si" --> G["Registrar y avisar a coordinacion"]
    G --> H["Reponer, alquilar o ajustar lista"]
    F -- "No" --> I["Rotular bultos"]
    H --> I
    I --> J["Entregar a carga y descarga"]
    J --> K["Registrar salida"]
    K --> L(["Despacho a logistica"])

    M(["Retorno del evento"]) --> N["Recibir descarga"]
    N --> O["Contar contra lista original"]
    O --> P["Separar limpio, sucio, dañado y faltante"]
    P --> Q["Actualizar inventario"]
    Q --> R["Guardar o derivar a limpieza/reparacion"]
```

---

## 9. Area Logistica y Traslados

```mermaid
flowchart TD
    A(["Carga autorizada"]) --> B["Revisar direccion, ruta y contacto"]
    B --> C["Revisar vehiculo, combustible y documentacion"]
    C --> D["Registrar hora de salida"]
    D --> E["Avisar salida al coordinador"]
    E --> F["Trasladar con cuidado"]
    F --> G{"Hay demora o incidente?"}
    G -- "Si" --> H["Avisar al coordinador y registrar"]
    H --> I["Continuar o ajustar ruta"]
    G -- "No" --> I
    I --> J["Registrar llegada"]
    J --> K["Definir zona de descarga"]
    K --> L(["Entrega a montaje"])

    M(["Fin de evento"]) --> N["Registrar salida del lugar"]
    N --> O["Trasladar regreso"]
    O --> P["Registrar llegada a deposito"]
    P --> Q(["Entrega a descarga DEP-02"])
```

---

## 10. Area Carga y Descarga

```mermaid
flowchart TD
    A(["Lista de carga aprobada"]) --> B["Recibir bultos por area"]
    B --> C["Cargar mobiliario y estructuras pesadas"]
    C --> D["Cargar equipamiento"]
    D --> E["Cargar vajilla y cristaleria protegida"]
    E --> F["Cargar manteleria y elementos de servicio"]
    F --> G["Cargar alimentos segun indicacion de cocina"]
    G --> H["Cargar bebidas y hielo"]
    H --> I["Cargar limpieza separado de alimentos"]
    I --> J["Asegurar bultos"]
    J --> K(["Vehiculo listo para salir"])

    L(["Llegada al evento"]) --> M["Descargar segun prioridad de montaje"]
    M --> N["Ubicar mobiliario, cajas y artefactos en zona definida"]
    N --> O(["Entrega a montaje"])

    P(["Desmontaje"]) --> Q["Embalar y mover bultos al vehiculo"]
    Q --> R["Asegurar carga de regreso"]
    R --> S(["Retorno a deposito"])
```

---

## 11. Area Montaje

```mermaid
flowchart TD
    A(["Llegada al lugar"]) --> B["Coordinacion confirma espacio y prioridades"]
    B --> C["Logistica define acceso y descarga"]
    C --> D["Carga y descarga baja bultos"]
    D --> E["Mozos montan mesas, estaciones, vajilla y cristaleria"]
    E --> F["Cocina ubica alimentos y zona de apoyo"]
    F --> G["Equipamiento conecta artefactos seguros"]
    G --> H["Limpieza define zona sucia y residuos"]
    H --> I["Calidad revisa higiene, alergenos y seguridad"]
    I --> J{"Montaje completo?"}
    J -- "No" --> K["Corregir faltantes o presentacion"]
    K --> I
    J -- "Si" --> L(["Servicio listo"])
```

---

## 12. Area Servicio / Mozos

```mermaid
flowchart TD
    A(["Servicio listo"]) --> B["Briefing del coordinador"]
    B --> C["Inicio en horario acordado"]
    C --> D["Atencion a invitados"]
    D --> E["Reposicion de comida, bebida o estaciones"]
    E --> F["Retiro de vajilla y cristaleria usada"]
    F --> G["Mantener mesas y estaciones prolijas"]
    G --> H{"Pedido o imprevisto del cliente?"}
    H -- "Si" --> I["Derivar al coordinador"]
    I --> J["Ejecutar decision aprobada"]
    H -- "No" --> K["Continuar servicio"]
    J --> K
    K --> L{"Finaliza servicio?"}
    L -- "No" --> D
    L -- "Si" --> M(["Transicion a desmontaje"])
```

---

## 13. Area Desmontaje y Retorno

```mermaid
flowchart TD
    A(["Fin del servicio"]) --> B["Coordinacion autoriza desmontaje"]
    B --> C["Cocina retira alimentos y define sobrantes"]
    C --> D["Barra retira bebidas y devoluciones"]
    D --> E["Mozos retiran vajilla, cristaleria, cubiertos y manteleria"]
    E --> F["Limpieza gestiona residuos y superficies"]
    F --> G["Equipamiento apaga, enfria y prepara artefactos"]
    G --> H["Carga y descarga embala y carga vehiculo"]
    H --> I["Logistica verifica carga segura"]
    I --> J["Coordinacion hace recorrido final"]
    J --> K{"Queda algo en el lugar?"}
    K -- "Si" --> L["Recuperar y registrar"]
    L --> J
    K -- "No" --> M["Registrar salida"]
    M --> N(["Traslado de vuelta"])
```

---

## 14. Area Orden, Limpieza y Mantenimiento

```mermaid
flowchart TD
    A(["Retorno al deposito"]) --> B["Separar utensilios, artefactos, textiles y residuos"]
    B --> C["Limpieza de utensilios"]
    B --> D["Limpieza de artefactos"]
    B --> E["Orden del deposito"]

    C --> C1["Lavar, desinfectar, secar y guardar"]
    D --> D1["Limpiar, revisar funcionamiento y separar dañados"]
    E --> E1["Liberar pasillos, actualizar pendientes y guardar"]

    C1 --> F["Registrar faltantes o roturas"]
    D1 --> F
    E1 --> F
    F --> G{"Hay pendientes?"}
    G -- "Si" --> H["Derivar a reparacion, lavado externo o reposicion"]
    H --> I["Informar a administracion/coordinacion"]
    G -- "No" --> J(["Deposito cerrado y listo"])
```

---

## 15. Area Direccion y Control de Gestion

```mermaid
flowchart TD
    A(["Reunion semanal"]) --> B["Revisar eventos realizados"]
    B --> C["Revisar eventos activos y proximos"]
    C --> D["Revisar ventas, cobros, gastos y rentabilidad"]
    D --> E["Revisar compras, stock, mermas y proveedores"]
    E --> F["Revisar cocina, logistica, servicio e incidentes"]
    F --> G{"Hay desvios importantes?"}
    G -- "Si" --> H["Definir accion correctiva"]
    H --> I["Asignar responsable y fecha"]
    I --> J["Registrar en dashboard"]
    G -- "No" --> K["Mantener seguimiento"]
    J --> L["Controlar cumplimiento en proxima reunion"]
    K --> L
    L --> A
```

---

## 16. Lectura rapida por responsables

| Responsable | Diagramas clave |
|---|---|
| Comercial | Area Comercial, Diagrama general |
| Administracion | Administracion, Ordenes de pago, Direccion |
| Cocina | Cocina y Produccion, Bromatologia, Desmontaje |
| Compras | Compras y Proveedores, Deposito/Stock |
| Deposito | Deposito/Stock, Carga y Descarga, Limpieza |
| Logistica | Logistica y Traslados, Carga y Descarga |
| Mozos / Servicio | Montaje, Servicio / Mozos, Desmontaje |
| Coordinacion de evento | Diagrama general, Montaje, Servicio, Desmontaje |
| Direccion | Direccion y Control de Gestion, Diagrama general |

