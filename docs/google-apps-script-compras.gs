const SHEET_NAME = "Registro_Gastos";

// Configurar en Apps Script > Project Settings > Script properties:
// DASHBOARD_SYNC_URL = https://tu-dominio.com/api/purchase-sync
// PURCHASE_SYNC_TOKEN = el mismo valor que uses en el servidor

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const action = String(payload.action || "upsert").toLowerCase();
  const purchase = payload.purchase || payload;
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const headers = getHeaders_(sheet);

  if (action === "export") {
    return json_({ ok: true, purchases: readAllPurchases_(sheet, headers) });
  }

  if (action === "delete") {
    const row = findRowById_(sheet, headers, purchase.id || payload.id);
    if (row > 1) sheet.deleteRow(row);
    return json_({ ok: true, action, id: purchase.id || payload.id });
  }

  const row = findRowById_(sheet, headers, purchase.id) || sheet.getLastRow() + 1;
  writePurchaseRow_(sheet, headers, row, purchase);
  return json_({ ok: true, action, row, id: purchase.id });
}

function readAllPurchases_(sheet, headers) {
  const purchases = [];
  for (let row = 2; row <= sheet.getLastRow(); row += 1) {
    const purchase = readPurchaseRow_(sheet, headers, row);
    if (purchase.provider || purchase.description || purchase.totalAmount) {
      purchases.push(purchase);
    }
  }
  return purchases;
}

function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME || e.range.getRow() === 1) return;

  const headers = getHeaders_(sheet);
  const purchase = readPurchaseRow_(sheet, headers, e.range.getRow());
  const actionValue = String(getValue_(sheet, headers, e.range.getRow(), ["Accion", "Accion Sync", "Sync"]) || "").trim().toUpperCase();

  if (!purchase.id) {
    purchase.id = `sheets-${Date.now()}-${e.range.getRow()}`;
    setValue_(sheet, headers, e.range.getRow(), ["ID"], purchase.id);
  }

  if (actionValue === "ELIMINAR" || actionValue === "DELETE") {
    postToDashboard_("delete", purchase);
    sheet.deleteRow(e.range.getRow());
    return;
  }

  postToDashboard_("upsert", purchase);
}

function postToDashboard_(action, purchase) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("DASHBOARD_SYNC_URL");
  if (!url) return;

  const token = props.getProperty("PURCHASE_SYNC_TOKEN") || "";
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({ action, token, purchase }),
  });
}

function getHeaders_(sheet) {
  const values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headers = {};
  values.forEach((name, index) => {
    headers[String(name || "").trim().toLowerCase()] = index + 1;
  });
  return headers;
}

function readPurchaseRow_(sheet, headers, row) {
  const quantity = Number(getValue_(sheet, headers, row, ["Cantidad"]) || 1);
  const unitAmount = Number(getValue_(sheet, headers, row, ["Unitario", "Monto unitario", "Precio unitario"]) || 0);
  const total = Number(getValue_(sheet, headers, row, ["Total", "Monto total"]) || quantity * unitAmount);
  const description = getValue_(sheet, headers, row, ["Producto", "Descripcion", "Producto / descripcion"]);

  return {
    id: getValue_(sheet, headers, row, ["ID"]),
    date: formatDate_(getValue_(sheet, headers, row, ["Fecha"])),
    provider: getValue_(sheet, headers, row, ["Proveedor"]),
    description,
    eventName: getValue_(sheet, headers, row, ["Evento"]),
    invoiceType: getValue_(sheet, headers, row, ["Comprobante", "Tipo comprobante"]),
    paymentStatus: getValue_(sheet, headers, row, ["Estado pago", "Pago"]) || "Pendiente",
    paymentMethod: getValue_(sheet, headers, row, ["Medio pago", "Medio"]),
    fundsSource: getValue_(sheet, headers, row, ["Origen fondos", "Origen"]),
    notes: getValue_(sheet, headers, row, ["Observaciones", "Notas"]),
    items: [{ description, quantity, unitAmount, total }],
  };
}

function writePurchaseRow_(sheet, headers, row, purchase) {
  const item = (purchase.lineItems || purchase.items || [])[0] || {};
  const description = item.description || purchase.description || purchase.descripcion || "";
  const quantity = item.quantity || purchase.quantity || purchase.cantidad || 1;
  const unitAmount = item.unitAmount || purchase.unitAmount || purchase.montoUnitario || 0;
  const total = item.total || purchase.totalAmount || purchase.montoTotal || quantity * unitAmount;

  setValue_(sheet, headers, row, ["ID"], purchase.id);
  setValue_(sheet, headers, row, ["Fecha"], purchase.date || purchase.fecha);
  setValue_(sheet, headers, row, ["Proveedor"], purchase.provider || purchase.proveedor);
  setValue_(sheet, headers, row, ["Producto", "Descripcion", "Producto / descripcion"], description);
  setValue_(sheet, headers, row, ["Evento"], purchase.eventName || purchase.evento);
  setValue_(sheet, headers, row, ["Cantidad"], quantity);
  setValue_(sheet, headers, row, ["Unitario", "Monto unitario", "Precio unitario"], unitAmount);
  setValue_(sheet, headers, row, ["Total", "Monto total"], total);
  setValue_(sheet, headers, row, ["Comprobante", "Tipo comprobante"], purchase.invoiceType || purchase.comprobante);
  setValue_(sheet, headers, row, ["Estado pago", "Pago"], purchase.paymentStatus || purchase.estadoPago || "Pendiente");
  setValue_(sheet, headers, row, ["Medio pago", "Medio"], purchase.paymentMethod || purchase.medioPago);
  setValue_(sheet, headers, row, ["Origen fondos", "Origen"], purchase.fundsSource || purchase.origenFondos);
  setValue_(sheet, headers, row, ["Observaciones", "Notas"], purchase.notes || purchase.observaciones);
}

function findRowById_(sheet, headers, id) {
  if (!id) return 0;
  const col = findColumn_(headers, ["ID"]);
  if (!col) return 0;
  const values = sheet.getRange(2, col, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  const index = values.findIndex((row) => String(row[0]) === String(id));
  return index >= 0 ? index + 2 : 0;
}

function getValue_(sheet, headers, row, aliases) {
  const col = findColumn_(headers, aliases);
  return col ? sheet.getRange(row, col).getValue() : "";
}

function setValue_(sheet, headers, row, aliases, value) {
  const col = findColumn_(headers, aliases);
  if (col) sheet.getRange(row, col).setValue(value || "");
}

function findColumn_(headers, aliases) {
  for (const alias of aliases) {
    const col = headers[String(alias).trim().toLowerCase()];
    if (col) return col;
  }
  return 0;
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return value;
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
