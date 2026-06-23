# Publicar Gratitud Gourmet ERP en sistema.gratitudgourmet.com.ar

Esta es la forma recomendada para publicar el sistema de manera segura, confiable y facil de mantener:

- Dominio y DNS en Hostinger.
- VPS Ubuntu en Hostinger.
- Nginx con HTTPS.
- Node.js corriendo como servicio.
- Panel protegido con usuario y clave.
- Datos JSON en carpeta persistente con backups.
- WhatsApp apagado en el servidor al principio (`BOT_SKIP_WHATSAPP=1`) para que el ERP no dependa de Chrome ni de WhatsApp Web.
- Google Sheets no se usa como base de datos. La sincronizacion automatica de compras y contador queda apagada con `PURCHASE_SHEETS_SYNC_ENABLED=false` y `ACCOUNTANT_SHEETS_SYNC_ENABLED=false`.

## 1. Crear el VPS en Hostinger

En Hostinger, crear un VPS Ubuntu LTS. Para empezar alcanza con el plan mas chico que tenga al menos:

- 1 vCPU.
- 1 o 2 GB de RAM.
- 20 GB de disco.

Guardar estos datos:

- IP publica del VPS.
- Usuario SSH.
- Clave o llave SSH.

## 2. Apuntar el subdominio

En Hostinger > Dominios > `gratitudgourmet.com.ar` > DNS:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | sistema | IP_PUBLICA_DEL_VPS |

Esperar entre 5 y 60 minutos. Luego probar que el dominio resuelva:

```bash
nslookup sistema.gratitudgourmet.com.ar
```

## 3. Preparar el servidor

Entrar por SSH al VPS y ejecutar:

```bash
sudo apt update
sudo apt install -y curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --create-home --shell /usr/sbin/nologin gratitud || true
sudo mkdir -p /opt/gratitud-erp /etc/gratitud-erp /var/lib/gratitud-erp/data /var/backups/gratitud-erp
sudo chown -R gratitud:gratitud /opt/gratitud-erp /var/lib/gratitud-erp /var/backups/gratitud-erp
```

## 4. Subir el proyecto

Opcion recomendada: subir el codigo del repo al VPS en `/opt/gratitud-erp`.

Si se usa Git:

```bash
sudo git clone URL_DEL_REPO /opt/gratitud-erp
sudo chown -R gratitud:gratitud /opt/gratitud-erp
cd /opt/gratitud-erp
sudo -u gratitud npm install --omit=dev
```

Si se sube por ZIP/SFTP, copiar todos los archivos del proyecto a `/opt/gratitud-erp` y luego:

```bash
cd /opt/gratitud-erp
sudo chown -R gratitud:gratitud /opt/gratitud-erp
sudo -u gratitud npm install --omit=dev
```

## 5. Migrar la base actual

Copiar los JSON actuales del sistema local a:

```text
/var/lib/gratitud-erp/data
```

Tambien copiar `config-bot.json` a:

```text
/var/lib/gratitud-erp/config-bot.json
```

No subir claves personales ni archivos `.env` locales.

## 6. Configurar variables de produccion

Copiar el ejemplo:

```bash
sudo cp /opt/gratitud-erp/deploy/env.production.example /etc/gratitud-erp/gratitud-erp.env
sudo nano /etc/gratitud-erp/gratitud-erp.env
```

Cambiar obligatoriamente:

- `PANEL_AUTH_PASSWORD`
- `PANEL_SESSION_SECRET`
- `PURCHASE_SYNC_TOKEN`

## 7. Instalar el servicio

```bash
sudo cp /opt/gratitud-erp/deploy/systemd/gratitud-erp.service /etc/systemd/system/gratitud-erp.service
sudo systemctl daemon-reload
sudo systemctl enable gratitud-erp
sudo systemctl start gratitud-erp
sudo systemctl status gratitud-erp
```

Probar localmente en el VPS:

```bash
curl http://127.0.0.1:3080/health
```

## 8. Configurar Nginx

```bash
sudo cp /opt/gratitud-erp/deploy/nginx/gratitud-erp.conf /etc/nginx/sites-available/gratitud-erp.conf
sudo ln -s /etc/nginx/sites-available/gratitud-erp.conf /etc/nginx/sites-enabled/gratitud-erp.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Activar HTTPS

Cuando `sistema.gratitudgourmet.com.ar` ya apunte al VPS:

```bash
sudo certbot --nginx -d sistema.gratitudgourmet.com.ar
```

Luego entrar a:

```text
https://sistema.gratitudgourmet.com.ar
```

## 10. Backups diarios

Dar permiso al script:

```bash
sudo chmod +x /opt/gratitud-erp/deploy/scripts/backup-data.sh
```

Agregar cron:

```bash
sudo crontab -e
```

Linea sugerida:

```cron
15 3 * * * DATA_DIR=/var/lib/gratitud-erp/data BACKUP_DIR=/var/backups/gratitud-erp /opt/gratitud-erp/deploy/scripts/backup-data.sh
```

## 11. Google Sheets

Google Sheets queda como herramienta auxiliar, no como base de datos. En produccion normal debe quedar:

```env
PURCHASE_SHEETS_SYNC_ENABLED=false
ACCOUNTANT_SHEETS_SYNC_ENABLED=false
```

Si mas adelante se quiere importar o sincronizar manualmente compras con Google Sheets, en Apps Script configurar:

```text
DASHBOARD_SYNC_URL=https://sistema.gratitudgourmet.com.ar/api/purchase-sync
PURCHASE_SYNC_TOKEN=el mismo valor del servidor
```

No activar `PURCHASE_SHEETS_SYNC_ENABLED=true` ni `ACCOUNTANT_SHEETS_SYNC_ENABLED=true` salvo que se quiera volver a escribir automaticamente en planillas.

## 12. Que puedo hacer yo y que debe hacer el admin de Hostinger

Yo puedo dejar el proyecto preparado, revisar configuracion, escribir comandos y ajustar el sistema.

Necesitas hacerlo vos o conmigo presente:

- Crear/comprar el VPS.
- Ver la IP publica.
- Crear o confirmar claves.
- Tocar DNS dentro de Hostinger.
- Pegar claves reales en `/etc/gratitud-erp/gratitud-erp.env`.

## 13. Recomendacion operativa

Primero publicar solo el ERP:

```env
BOT_SKIP_WHATSAPP=1
```

Cuando el panel ya este estable, se decide si:

- WhatsApp sigue local en la PC actual.
- WhatsApp corre en otro proceso/servidor.
- WhatsApp se integra al VPS con Chrome y sesion persistente.
