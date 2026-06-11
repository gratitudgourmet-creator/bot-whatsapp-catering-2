/**
 * Webhook de compras para Catering ERP.
 *
 * Este archivo REEMPLAZA el Apps Script anterior.
 * Mantiene la carga historica en Registro_Gastos y agrega:
 * - crear compras desde el panel
 * - editar compras desde el panel
 * - eliminar compras desde el panel
 * - exportar compras historicas hacia el dashboard
 * - avisar al dashboard cuando se edita/elimina desde Sheets
 */

const DEFAULT_SPREADSHEET_ID = '1ZAd6hdDq1gftQPr6QdPZWS0yyhPcTG9UJcnt3Fgp3HI';
const PURCHASE_SHEET_NAME = 'Registro_Gastos';
const CONFIG_SHEET_NAME = 'Config';

const COL = {
  FECHA: 1,
  PROVEEDOR: 2,
  DESCRIPCION: 3,
  CANTIDAD: 4,
  UNITARIO: 5,
  COMPROBANTE: 7,
  EVENTO: 8,
  IVA: 10,
  ESTADO_PAGO: 13,
  MEDIO_PAGO: 14,
  ORIGEN_FONDOS: 15,
};

const HEADER_ID = 'ID ERP';
const HEADER_ACCION = 'Accion Sync';
const HEADER_NOTAS = 'Notas Sync';
const HEADER_MONTO_PAGADO = 'Monto pagado';
const HEADER_SALDO_PENDIENTE = 'Saldo pendiente';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = String(payload.action || 'create').toLowerCase();
    const spreadsheetId = payload.spreadsheetId || DEFAULT_SPREADSHEET_ID;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(payload.sheetName || PURCHASE_SHEET_NAME);
    const configSheet = spreadsheet.getSheetByName(CONFIG_SHEET_NAME);

    if (!sheet) throw new Error('No existe la hoja ' + (payload.sheetName || PURCHASE_SHEET_NAME));
    if (!configSheet) throw new Error('No existe la hoja ' + CONFIG_SHEET_NAME);

    const helperCols = ensureHelperColumns_(sheet);

    if (action === 'export') {
      return jsonResponse_({
        ok: true,
        purchases: readAllPurchases_(sheet, helperCols),
      });
    }

    if (action === 'delete') {
      const purchase = payload.purchase || payload;
      const lineItems = normalizeLineItems_(purchase);
      const row = findExistingPurchaseRow_(sheet, helperCols, purchase.id || payload.id, purchase, lineItems);
      if (row > 1) sheet.deleteRow(row);
      return jsonResponse_({ ok: true, action, id: purchase.id || payload.id });
    }

    const purchase = payload.purchase || payload;
    const result = upsertPurchase_(sheet, configSheet, helperCols, purchase, action);

    return jsonResponse_({
      ok: true,
      action,
      row: result.firstRow,
      rows: result.rows,
      id: result.id,
      message: result.rows === 1
        ? 'Compra guardada en Registro_Gastos fila ' + result.firstRow
        : 'Compra guardada en Registro_Gastos desde fila ' + result.firstRow + ' (' + result.rows + ' productos)',
    });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== PURCHASE_SHEET_NAME || e.range.getRow() === 1) return;

  const helperCols = ensureHelperColumns_(sheet);
  const row = e.range.getRow();
  const purchase = readPurchaseRow_(sheet, helperCols, row);
  const actionValue = String(sheet.getRange(row, helperCols.actionCol).getValue() || '').trim().toUpperCase();

  if (!purchase.id) {
    purchase.id = 'sheets-row-' + row;
    sheet.getRange(row, helperCols.idCol).setValue(purchase.id);
  }

  if (actionValue === 'ELIMINAR' || actionValue === 'DELETE') {
    postToDashboard_('delete', purchase);
    sheet.deleteRow(row);
    return;
  }

  postToDashboard_('upsert', purchase);
}

function upsertPurchase_(sheet, configSheet, helperCols, payload, action) {
  ensureConfigValue_(configSheet, 6, payload.proveedor || payload.provider || '');
  const lineItems = normalizeLineItems_(payload);

  lineItems.forEach(function(item) {
    ensureConfigValue_(configSheet, 7, item.description || '');
  });
  ensureConfigValue_(configSheet, 1, payload.evento || payload.eventName || '');
  ensureConfigValue_(configSheet, 3, payload.medioPago || payload.paymentMethod || '');
  ensureConfigValue_(configSheet, 4, payload.origenFondos || payload.fundsSource || '');

  const id = payload.id || (payload.rowNumber ? 'sheets-row-' + payload.rowNumber : 'dashboard-' + Date.now());
  const existingRow = findExistingPurchaseRow_(sheet, helperCols, id, payload, lineItems);

  if (String(action || '').toLowerCase() === 'upsert' && existingRow <= 1) {
    throw new Error('No encontre la fila original para editar la compra ' + id + '. Importe Sheets otra vez o revise la columna ID ERP antes de guardar.');
  }

  const firstRow = existingRow > 1 ? existingRow : findFirstEmptyPurchaseRow_(sheet);

  if (existingRow > 1) {
    clearExistingPurchaseRows_(sheet, helperCols, id, firstRow);
  }

  const rows = lineItems.map(function(item) {
    return [
      parsePanelDate_(payload.fecha || payload.date),
      payload.proveedor || payload.provider || '',
      item.description || '',
      Number(item.quantity || 0),
      Number(item.unitAmount || 0),
    ];
  });

  sheet.getRange(firstRow, 1, rows.length, 5).setValues(rows);

  const comprobanteRows = lineItems.map(function() {
    return [payload.comprobante || payload.invoiceType || '', payload.evento || payload.eventName || ''];
  });
  sheet.getRange(firstRow, COL.COMPROBANTE, comprobanteRows.length, 2).setValues(comprobanteRows);

  const ivaRows = lineItems.map(function() {
    return [Number(payload.ivaPorcentaje || payload.ivaRate || 0)];
  });
  sheet.getRange(firstRow, COL.IVA, ivaRows.length, 1).setValues(ivaRows);

  const paymentRows = lineItems.map(function() {
    return [
      payload.estadoPago || payload.paymentStatus || 'Pendiente',
      payload.medioPago || payload.paymentMethod || '',
      payload.origenFondos || payload.fundsSource || '',
    ];
  });
  sheet.getRange(firstRow, COL.ESTADO_PAGO, paymentRows.length, 3).setValues(paymentRows);

  const idRows = lineItems.map(function() { return [id]; });
  sheet.getRange(firstRow, helperCols.idCol, idRows.length, 1).setValues(idRows);

  if (helperCols.paidCol && helperCols.pendingCol) {
    const paymentAmountRows = lineItems.map(function(_, index) {
      if (index > 0) return ['', ''];
      const totalAmount = Number(payload.montoTotal || payload.totalAmount || payload.total || 0);
      const status = String(payload.estadoPago || payload.paymentStatus || '').trim().toLowerCase();
      const paidAmount = Number(payload.paidAmount || payload.montoPagado || (status === 'pagado' ? totalAmount : 0));
      const pendingAmount = payload.pendingAmount !== undefined
        ? Number(payload.pendingAmount || 0)
        : Math.max(0, totalAmount - paidAmount);
      return [paidAmount, pendingAmount];
    });
    sheet.getRange(firstRow, helperCols.paidCol, paymentAmountRows.length, 2).setValues(paymentAmountRows);
  }

  if (helperCols.notesCol) {
    const noteRows = lineItems.map(function(_, index) {
      return [index === 0 ? (payload.observaciones || payload.notes || '') : ''];
    });
    sheet.getRange(firstRow, helperCols.notesCol, noteRows.length, 1).setValues(noteRows);
  }

  return { firstRow, rows: rows.length, id };
}

function readAllPurchases_(sheet, helperCols) {
  const purchases = [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return purchases;

  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  values.forEach(function(rowValues, index) {
    const purchase = readPurchaseValues_(rowValues, helperCols, index + 2);
    if (purchase.provider || purchase.description || purchase.totalAmount) {
      if (!purchase.id && helperCols.idCol) {
        purchase.id = 'sheets-row-' + purchase.rowNumber;
        sheet.getRange(purchase.rowNumber, helperCols.idCol).setValue(purchase.id);
      }
      purchases.push(purchase);
    }
  });
  return purchases;
}

function readPurchaseValues_(rowValues, helperCols, rowNumber) {
  const quantity = Number(rowValues[COL.CANTIDAD - 1] || 1);
  const unitAmount = Number(rowValues[COL.UNITARIO - 1] || 0);
  const totalCell = rowValues[5];
  const netTotal = Number(totalCell || quantity * unitAmount);
  const ivaRate = parseIvaRate_(rowValues[COL.IVA - 1]);
  const ivaAmount = roundNumber_(netTotal * ivaRate);
  const total = roundNumber_(netTotal + ivaAmount);
  const description = rowValues[COL.DESCRIPCION - 1];

  return {
    id: helperCols.idCol ? rowValues[helperCols.idCol - 1] : '',
    date: formatDate_(rowValues[COL.FECHA - 1]),
    provider: rowValues[COL.PROVEEDOR - 1],
    description,
    eventName: rowValues[COL.EVENTO - 1],
    invoiceType: rowValues[COL.COMPROBANTE - 1],
    paymentStatus: rowValues[COL.ESTADO_PAGO - 1] || 'Pendiente',
    paymentMethod: rowValues[COL.MEDIO_PAGO - 1],
    fundsSource: rowValues[COL.ORIGEN_FONDOS - 1],
    notes: helperCols.notesCol ? rowValues[helperCols.notesCol - 1] : '',
    paidAmount: helperCols.paidCol ? Number(rowValues[helperCols.paidCol - 1] || 0) : (rowValues[COL.ESTADO_PAGO - 1] === 'Pagado' ? total : 0),
    pendingAmount: helperCols.pendingCol ? Number(rowValues[helperCols.pendingCol - 1] || 0) : (rowValues[COL.ESTADO_PAGO - 1] === 'Pagado' ? 0 : total),
    netAmount: netTotal,
    ivaRate,
    ivaAmount,
    totalAmount: total,
    rowNumber,
    items: [{ description, quantity, unitAmount, total: netTotal }],
  };
}

function readPurchaseRow_(sheet, helperCols, row) {
  const quantity = Number(sheet.getRange(row, COL.CANTIDAD).getValue() || 1);
  const unitAmount = Number(sheet.getRange(row, COL.UNITARIO).getValue() || 0);
  const totalCell = sheet.getRange(row, 6).getValue();
  const netTotal = Number(totalCell || quantity * unitAmount);
  const ivaRate = parseIvaRate_(sheet.getRange(row, COL.IVA).getValue());
  const ivaAmount = roundNumber_(netTotal * ivaRate);
  const total = roundNumber_(netTotal + ivaAmount);
  const description = sheet.getRange(row, COL.DESCRIPCION).getValue();

  return {
    id: helperCols.idCol ? sheet.getRange(row, helperCols.idCol).getValue() : '',
    date: formatDate_(sheet.getRange(row, COL.FECHA).getValue()),
    provider: sheet.getRange(row, COL.PROVEEDOR).getValue(),
    description,
    eventName: sheet.getRange(row, COL.EVENTO).getValue(),
    invoiceType: sheet.getRange(row, COL.COMPROBANTE).getValue(),
    paymentStatus: sheet.getRange(row, COL.ESTADO_PAGO).getValue() || 'Pendiente',
    paymentMethod: sheet.getRange(row, COL.MEDIO_PAGO).getValue(),
    fundsSource: sheet.getRange(row, COL.ORIGEN_FONDOS).getValue(),
    notes: helperCols.notesCol ? sheet.getRange(row, helperCols.notesCol).getValue() : '',
    paidAmount: helperCols.paidCol ? Number(sheet.getRange(row, helperCols.paidCol).getValue() || 0) : (sheet.getRange(row, COL.ESTADO_PAGO).getValue() === 'Pagado' ? total : 0),
    pendingAmount: helperCols.pendingCol ? Number(sheet.getRange(row, helperCols.pendingCol).getValue() || 0) : (sheet.getRange(row, COL.ESTADO_PAGO).getValue() === 'Pagado' ? 0 : total),
    netAmount: netTotal,
    ivaRate,
    ivaAmount,
    totalAmount: total,
    rowNumber: row,
    items: [{ description, quantity, unitAmount, total: netTotal }],
  };
}

function parseIvaRate_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? number / 100 : number;
}

function roundNumber_(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function clearExistingPurchaseRows_(sheet, helperCols, id, firstRow) {
  for (let row = sheet.getLastRow(); row >= 2; row -= 1) {
    if (row === firstRow) continue;
    if (String(sheet.getRange(row, helperCols.idCol).getValue()) === String(id)) {
      sheet.deleteRow(row);
    }
  }
}

function normalizeLineItems_(payload) {
  const items = payload.lineItems || payload.items;
  if (Array.isArray(items) && items.length) {
    return items.map(function(item) {
      return {
        description: item.description || payload.descripcion || payload.description || '',
        quantity: Number(item.quantity || 1),
        unitAmount: Number(item.unitAmount || 0),
      };
    });
  }

  return [{
    description: payload.descripcion || payload.description || '',
    quantity: Number(payload.cantidad || payload.quantity || 1),
    unitAmount: Number(payload.montoUnitario || payload.unitAmount || 0),
  }];
}

function ensureHelperColumns_(sheet) {
  const headers = getHeaderMap_(sheet);
  const idCol = headers[normalizeHeader_(HEADER_ID)] || ensureHeader_(sheet, HEADER_ID);
  const actionCol = headers[normalizeHeader_(HEADER_ACCION)] || ensureHeader_(sheet, HEADER_ACCION);
  const notesCol = headers[normalizeHeader_(HEADER_NOTAS)] || ensureHeader_(sheet, HEADER_NOTAS);
  const paidCol = headers[normalizeHeader_(HEADER_MONTO_PAGADO)] || ensureHeader_(sheet, HEADER_MONTO_PAGADO);
  const pendingCol = headers[normalizeHeader_(HEADER_SALDO_PENDIENTE)] || ensureHeader_(sheet, HEADER_SALDO_PENDIENTE);
  hideHelperColumns_(sheet, [idCol, actionCol, notesCol, paidCol, pendingCol]);
  return { idCol, actionCol, notesCol, paidCol, pendingCol };
}

function ensureHeader_(sheet, header) {
  const col = sheet.getLastColumn() + 1;
  sheet.getRange(1, col).setValue(header);
  return col;
}

function hideHelperColumns_(sheet, columns) {
  columns
    .filter(function(col, index, list) {
      return col && list.indexOf(col) === index;
    })
    .forEach(function(col) {
      try {
        sheet.hideColumns(col);
      } catch (error) {
        // Si la hoja esta protegida o no permite ocultar, el registro igual debe continuar.
      }
    });
}

function getHeaderMap_(sheet) {
  const headers = {};
  const values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  values.forEach(function(value, index) {
    const key = normalizeHeader_(value);
    if (key) headers[key] = index + 1;
  });
  return headers;
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

function findRowById_(sheet, idCol, id) {
  if (!id || !idCol) return 0;
  const values = sheet.getRange(2, idCol, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  const index = values.findIndex(function(row) { return String(row[0]) === String(id); });
  return index >= 0 ? index + 2 : 0;
}

function findExistingPurchaseRow_(sheet, helperCols, id, payload, lineItems) {
  const byId = findRowById_(sheet, helperCols.idCol, id);
  if (byId > 1) return byId;

  const byStableRow = findRowFromStableSheetId_(sheet, id);
  if (byStableRow > 1 && rowLooksLikePurchase_(sheet, byStableRow)) return byStableRow;

  return findMatchingPurchaseRow_(sheet, payload, lineItems);
}

function findRowFromStableSheetId_(sheet, id) {
  const match = String(id || '').match(/^sheets-row-(\d+)$/);
  if (!match) return 0;

  const row = Number(match[1]);
  if (!Number.isFinite(row) || row < 2 || row > sheet.getMaxRows()) return 0;
  return row;
}

function rowLooksLikePurchase_(sheet, row) {
  const values = sheet.getRange(row, COL.FECHA, 1, 3).getValues()[0];
  return values.some(function(value) { return String(value || '').trim() !== ''; });
}

function findMatchingPurchaseRow_(sheet, payload, lineItems) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const firstItem = lineItems[0] || {};
  const target = {
    date: formatDate_(parsePanelDate_(payload.fecha || payload.date)),
    provider: normalizeText_(payload.proveedor || payload.provider || ''),
    description: normalizeText_(firstItem.description || payload.descripcion || payload.description || ''),
    eventName: normalizeText_(payload.evento || payload.eventName || ''),
    quantity: Number(firstItem.quantity || payload.cantidad || payload.quantity || 0),
    unitAmount: Number(firstItem.unitAmount || payload.montoUnitario || payload.unitAmount || 0),
  };

  if (!target.provider || !target.description) return 0;

  const width = Math.max(COL.ORIGEN_FONDOS, sheet.getLastColumn());
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let index = 0; index < values.length; index++) {
    const row = values[index];
    const rowDate = formatDate_(row[COL.FECHA - 1]);
    const sameCore =
      normalizeText_(row[COL.PROVEEDOR - 1]) === target.provider &&
      normalizeText_(row[COL.DESCRIPCION - 1]) === target.description &&
      normalizeText_(row[COL.EVENTO - 1]) === target.eventName;

    const sameNumbers =
      Number(row[COL.CANTIDAD - 1] || 0) === target.quantity &&
      Number(row[COL.UNITARIO - 1] || 0) === target.unitAmount;

    if (sameCore && sameNumbers && (!target.date || String(rowDate) === String(target.date))) {
      return index + 2;
    }
  }

  return 0;
}

function postToDashboard_(action, purchase) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('DASHBOARD_SYNC_URL');
  if (!url) return;

  const token = props.getProperty('PURCHASE_SYNC_TOKEN') || '';
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ action, token, purchase }),
  });
}

function ensureConfigValue_(sheet, column, value) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return;

  const startRow = 2;
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(startRow, column, maxRows - 1, 1).getValues();
  const normalizedValue = normalizeText_(cleanValue);

  for (let index = 0; index < values.length; index++) {
    if (normalizeText_(String(values[index][0] || '').trim()) === normalizedValue) return;
  }

  for (let index = 0; index < values.length; index++) {
    if (!String(values[index][0] || '').trim()) {
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
    const hasDateProviderOrDescription = row.some(function(cell) {
      return String(cell || '').trim() !== '';
    });
    if (!hasDateProviderOrDescription) return startRow + index;
  }

  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function parsePanelDate_(value) {
  if (!value) return new Date();
  if (Object.prototype.toString.call(value) === '[object Date]') return value;

  const parts = String(value).split('-');
  if (parts.length === 3) return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Date(value);
}

function formatDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
