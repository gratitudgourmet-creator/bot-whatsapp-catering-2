# Configurar sincronizacion de pagos del contador

Esta configuracion se hace una sola vez.

## 1. Crear la planilla

Crear una planilla de Google llamada, por ejemplo:

```txt
Pagos contador - Gratitud
```

Crear una solapa llamada:

```txt
Pagos_Contador
```

Agregar estos encabezados en la fila 1:

```txt
Fecha de pago | Proveedor | Monto pagado | Medio de pago | Origen de fondos | Nota | Estado | Resultado importacion | Importado el
```

## 2. Pegar el Apps Script

En la planilla:

1. Ir a `Extensiones`.
2. Entrar en `Apps Script`.
3. Borrar el contenido inicial.
4. Pegar el contenido de este archivo del bot:

```txt
google-apps-script/pagos-contador-webhook.gs
```

5. Guardar.

## 3. Publicar como aplicacion web

En Apps Script:

1. Ir a `Implementar`.
2. Elegir `Nueva implementacion`.
3. Tipo: `Aplicacion web`.
4. Ejecutar como: `Yo`.
5. Quien tiene acceso: `Cualquier persona con el enlace`.
6. Implementar.
7. Copiar la URL que termina en `/exec`.

## 4. Pegar la URL en el bot

Abrir:

```txt
config-bot.json
```

Completar:

```json
"accountantPaymentsWebhookUrl": "PEGAR_URL_DE_APPS_SCRIPT",
"accountantPaymentsToken": ""
```

Si se quiere usar una clave de seguridad, poner una palabra secreta en `accountantPaymentsToken` y tambien cargarla en Apps Script como propiedad:

```txt
ACCOUNTANT_PAYMENTS_TOKEN
```

Para empezar simple, puede quedar vacio.

El sistema tambien puede crear automaticamente estas solapas cuando se toca `Actualizar planilla contador`:

```txt
Deudas_Proveedores
Compras_Pendientes
```

## 5. Como se sincroniza

1. En el panel del bot, entrar a `ERP`.
2. En `Dashboard de compras`, tocar `Actualizar planilla contador`.
3. El bot crea/actualiza `Deudas_Proveedores` con saldos por proveedor.
4. El bot crea/actualiza `Compras_Pendientes` con el detalle de compras que componen cada deuda.
5. El contador consulta esas dos solapas.
6. El contador carga pagos nuevos en `Pagos_Contador` con estado `Pendiente`.
7. En el panel del bot, tocar `Importar pagos contador`.
8. El bot lee la planilla, aplica los pagos en `catering.db` y actualiza deudas.
9. La planilla marca cada fila como `Importado` o `Error`.

La planilla no guarda la base real. La base real es:

```txt
catering.db
```
