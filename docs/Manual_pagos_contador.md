# Manual para carga de pagos a proveedores

Este archivo es para que el contador informe pagos realizados sin tocar la base principal del sistema.

La planilla se usa solo como bandeja de entrada. El sistema principal guarda los datos en `catering.db`.

## Solapas

La planilla tiene tres solapas:

```txt
Deudas_Proveedores
Compras_Pendientes
Pagos_Contador
```

## Para consultar deuda

Mirar primero:

```txt
Deudas_Proveedores
```

Esta solapa muestra:

```txt
Proveedor
Alias
Banco
Titular cuenta
CBU / CVU
Compras pendientes
Saldo pendiente
Compra mas antigua
Actualizado el
```

Para ver de que compras se compone una deuda, mirar:

```txt
Compras_Pendientes
```

Esta solapa muestra cada compra pendiente con total, pagado y saldo.

Estas dos solapas son solo de consulta. No deben editarse.

## Para cargar pagos

Usar solamente la solapa:

```txt
Pagos_Contador
```

El contador solo debe completar estos datos:

```txt
Proveedor
Tipo de pago
Monto pagado
Medio de pago
Origen de fondos
Nota
```

La fecha y el estado se completan automaticamente.

Si `Tipo de pago` es `Pago total`, el monto se completa automaticamente con la deuda actual del proveedor.

## Columnas

La planilla debe tener estas columnas:

```txt
Fecha de pago
Proveedor
Monto pagado
Medio de pago
Origen de fondos
Nota
Estado
Resultado importacion
Importado el
```

## Como cargar un pago

Completar una fila por cada pago realizado.

Pasos:

1. Elegir el proveedor desde el desplegable.
2. Elegir `Pago total` o `Pago parcial`.
3. Si es `Pago total`, revisar el monto que se completa solo.
4. Si es `Pago parcial`, escribir el monto pagado.
5. Elegir el medio de pago.
6. Elegir el origen de fondos.
7. Agregar una nota si hace falta.

Ejemplo:

```txt
Proveedor: RUBEN CARNE
Tipo de pago: Pago total
Monto pagado: 4435466,15
Medio de pago: Transferencia
Origen de fondos: Banco
Nota: Cancela deuda completa
```

## Reglas importantes

- El proveedor debe elegirse desde el desplegable.
- Para pago total, revisar el monto automatico.
- Para pago parcial, el monto debe ser solo numero. Puede usarse coma o punto decimal.
- No escribir simbolos como `$` en el monto.
- No cambiar los titulos de las columnas.
- No borrar columnas.
- No editar filas que ya digan `Importado`.
- Si una fila dice `Error`, revisar el mensaje en `Resultado importacion`.

## Que estados se pueden usar

Para pagos nuevos usar uno de estos estados:

```txt
Pendiente
Pendiente de importar
Nuevo
```

Cuando el sistema importe el pago, va a cambiar el estado a:

```txt
Importado
```

Si algo no coincide, va a quedar:

```txt
Error
```

## Como se aplica el pago

El sistema toma el proveedor y aplica el monto a las compras pendientes mas antiguas de ese proveedor.

Si el pago alcanza para cancelar toda la deuda, las compras quedan como `Pagado`.

Si el pago cubre solo una parte, las compras quedan como `Parcial` y se mantiene el saldo pendiente.

## Que hacer si hay un error

Si `Resultado importacion` dice que no se encontro deuda o que el proveedor no existe:

1. Revisar que el proveedor este escrito igual que en el sistema.
2. Revisar que el monto sea correcto.
3. Cambiar el estado nuevamente a `Pendiente`.
4. Avisar para volver a importar desde el panel.

## Que no debe hacer el contador

- No registrar compras nuevas en esta planilla.
- No tocar la solapa de compras historicas.
- No editar `Deudas_Proveedores`.
- No editar `Compras_Pendientes`.
- No cambiar filas importadas.
- No cambiar formulas o encabezados.

Esta planilla es solamente para informar pagos ya efectuados.
