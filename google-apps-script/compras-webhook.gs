/**
 * Webhook para cargar compras desde el panel local.
 * Pegue este codigo en Extensiones > Apps Script dentro de la planilla de compras.
 */
const DEFAULT_SPREADSHEET_ID = '1ZAd6hdDq1gftQPr6QdPZWS0yyhPcTG9UJcnt3Fgp3HI';
const PURCHASE_SHEET_NAME = 'Registro_Gastos';
const CONFIG_SHEET_NAME = 'Config';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const spreadsheetId = payload.spreadsheetId || DEFAULT_SPREADSHEET_ID;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(payload.sheetName || PURCHASE_SHEET_NAME);
    const configSheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);

    if (!sheet) {
      throw new Error('No existe la hoja ' + (payload.sheetName || PURCHASE_SHEET_NAME));
    }

    if (!configSheet) {
      throw new Error('No existe la hoja ' + CONFIG_SHEET_NAME);
    }

    ensureConfigValue_(configSheet, 6, payload.proveedor || '');
    const lineItems = normalizeLineItems_(payload);

    lineItems.forEach(function(item) {
      ensureConfigValue_(configSheet, 7, item.description || '');
    });
    ensureConfigValue_(configSheet, 1, payload.evento || '');
    ensureConfigValue_(configSheet, 3, payload.medioPago || '');
    ensureConfigValue_(configSheet, 4, payload.origenFondos || '');

    const firstRow = findFirstEmptyPurchaseRow_(sheet);
    const rows = lineItems.map(function(item) {
      return [
        parsePanelDate_(payload.fecha),
        payload.proveedor || '',
        item.description || '',
        Number(item.quantity || 0),
        Number(item.unitAmount || 0)
      ];
    });

    // A:E: Fecha, Proveedor, Descripcion, Cantidad, Monto Unitario.
    sheet.getRange(firstRow, 1, rows.length, 5).setValues(rows);

    const comprobanteRows = lineItems.map(function() {
      return [payload.comprobante || '', payload.evento || ''];
    });
    sheet.getRange(firstRow, 7, comprobanteRows.length, 2).setValues(comprobanteRows);

    const ivaRows = lineItems.map(function() {
      return [Number(payload.ivaPorcentaje || 0)];
    });
    sheet.getRange(firstRow, 10, ivaRows.length, 1).setValues(ivaRows);

    const paymentRows = lineItems.map(function() {
      return [payload.estadoPago || 'Pendiente', payload.medioPago || '', payload.origenFondos || ''];
    });
    sheet.getRange(firstRow, 13, paymentRows.length, 3).setValues(paymentRows);

    return jsonResponse_({
      ok: true,
      row: firstRow,
      rows: rows.length,
      message: rows.length === 1
        ? 'Compra cargada en Registro_Gastos fila ' + firstRow
        : 'Compra cargada en Registro_Gastos desde fila ' + firstRow + ' (' + rows.length + ' productos)'
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message
    });
  }
}

function normalizeLineItems_(payload) {
  if (Array.isArray(payload.lineItems) && payload.lineItems.length) {
    return payload.lineItems.map(function(item) {
      return {
        description: item.description || payload.descripcion || '',
        quantity: Number(item.quantity || 1),
        unitAmount: Number(item.unitAmount || 0)
      };
    });
  }

  return [{
    description: payload.descripcion || '',
    quantity: Number(payload.cantidad || 1),
    unitAmount: Number(payload.montoUnitario || 0)
  }];
}

function ensureConfigValue_(sheet, column, value) {
  const cleanValue = String(value || '').trim();

  if (!cleanValue) {
    return;
  }

  const startRow = 2;
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(startRow, column, maxRows - 1, 1).getValues();
  const normalizedValue = normalizeText_(cleanValue);

  for (let index = 0; index < values.length; index++) {
    const current = String(values[index][0] || '').trim();

    if (normalizeText_(current) === normalizedValue) {
      return;
    }
  }

  for (let index = 0; index < values.length; index++) {
    const current = String(values[index][0] || '').trim();

    if (!current) {
      sheet.getRange(startRow + index, column).setValue(cleanValue);
      return;
    }
  }

  sheet.insertRowAfter(maxRows);
  sheet.getRange(maxRows + 1, column).setValue(cleanValue);
}

function normalizeText_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findFirstEmptyPurchaseRow_(sheet) {
  const startRow = 2;
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(startRow, 1, maxRows - 1, 3).getValues();

  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    const hasDateProviderOrDescription = row.some((cell) => String(cell || '').trim() !== '');

    if (!hasDateProviderOrDescription) {
      return startRow + index;
    }
  }

  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function parsePanelDate_(value) {
  if (!value) return new Date();
  const parts = String(value).split('-');

  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  return new Date(value);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
