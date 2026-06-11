/**
 * Webhook puente para pagos cargados por el contador.
 *
 * La base real sigue siendo catering.db. Esta planilla solo funciona como
 * bandeja de entrada para informar pagos realizados a proveedores.
 */

const ACCOUNTANT_PAYMENTS_SHEET_NAME = 'Pagos_Contador';
const ACCOUNTANT_DEBTS_SHEET_NAME = 'Deudas_Proveedores';
const ACCOUNTANT_PENDING_PURCHASES_SHEET_NAME = 'Compras_Pendientes';
const ACCOUNTANT_REQUIRED_HEADERS = [
  'Fecha de pago',
  'Proveedor',
  'Tipo de pago',
  'Monto pagado',
  'Medio de pago',
  'Origen de fondos',
  'Nota',
  'Estado',
  'Resultado importacion',
  'Importado el',
];
const DEFAULT_PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Mercado Pago', 'Cheque', 'Tarjeta', 'Otro'];
const DEFAULT_FUNDS_SOURCES = ['Banco', 'Caja', 'Mercado Pago', 'Cuenta corriente', 'Otro'];
const DEFAULT_PAYMENT_TYPES = ['Pago total', 'Pago parcial'];
const PAYMENT_INPUT_ROWS = 500;

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    validateToken_(payload.token || '');

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getOrCreatePaymentsSheet_(spreadsheet);
    const action = String(payload.action || 'export').toLowerCase();

    if (action === 'mark') {
      markRows_(sheet, payload.importedRows || [], payload.errorRows || []);
      return jsonResponse_({ ok: true });
    }

    if (action === 'syncdebts') {
      syncDebts_(spreadsheet, payload.providers || [], payload.purchases || [], payload.updatedAt || '');
      return jsonResponse_({
        ok: true,
        message: 'Deudas actualizadas para el contador.',
      });
    }

    return jsonResponse_({
      ok: true,
      payments: readPendingPayments_(sheet),
    });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function getOrCreatePaymentsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(ACCOUNTANT_PAYMENTS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ACCOUNTANT_PAYMENTS_SHEET_NAME);
  }

  ensurePaymentHeaders_(sheet);
  sheet.setFrozenRows(1);
  setupPaymentsSheet_(spreadsheet, sheet);
  return sheet;
}

function ensurePaymentHeaders_(sheet) {
  const headers = getHeaderMap_(sheet);
  if (!headers[normalizeHeader_('Tipo de pago')] && headers[normalizeHeader_('Monto pagado')]) {
    sheet.insertColumnBefore(headers[normalizeHeader_('Monto pagado')]);
    sheet.getRange(1, headers[normalizeHeader_('Monto pagado')]).setValue('Tipo de pago');
  }

  ACCOUNTANT_REQUIRED_HEADERS.forEach(function(header, index) {
    const cell = sheet.getRange(1, index + 1);
    if (!String(cell.getValue() || '').trim()) {
      cell.setValue(header);
    }
  });
}

function syncDebts_(spreadsheet, providers, purchases, updatedAt) {
  const debtsSheet = getOrCreateSheetWithHeaders_(spreadsheet, ACCOUNTANT_DEBTS_SHEET_NAME, [
    'Proveedor',
    'Alias',
    'Banco',
    'Titular cuenta',
    'CBU / CVU',
    'Compras pendientes',
    'Saldo pendiente',
    'Compra mas antigua',
    'Actualizado el',
  ]);
  const purchasesSheet = getOrCreateSheetWithHeaders_(spreadsheet, ACCOUNTANT_PENDING_PURCHASES_SHEET_NAME, [
    'ID compra',
    'Fecha',
    'Proveedor',
    'Descripcion',
    'Evento',
    'Comprobante',
    'Estado',
    'Total compra',
    'Pagado',
    'Saldo pendiente',
    'Notas',
    'Actualizado el',
  ]);

  clearDataRows_(debtsSheet);
  clearDataRows_(purchasesSheet);

  if (providers.length) {
    debtsSheet.getRange(2, 1, providers.length, 9).setValues(providers.map(function(item) {
      return [
        item.provider || '',
        item.alias || '',
        item.bankName || '',
        item.accountHolder || '',
        item.cbu || '',
        Number(item.purchaseCount || 0),
        Number(item.totalDebt || 0),
        item.oldestDate || '',
        updatedAt ? formatDateTime_(updatedAt) : new Date(),
      ];
    }));
  }

  if (purchases.length) {
    purchasesSheet.getRange(2, 1, purchases.length, 12).setValues(purchases.map(function(item) {
      return [
        item.id || '',
        item.date || '',
        item.provider || '',
        item.description || '',
        item.eventName || '',
        item.invoiceType || '',
        item.paymentStatus || '',
        Number(item.totalAmount || 0),
        Number(item.paidAmount || 0),
        Number(item.pendingAmount || 0),
        item.notes || '',
        updatedAt ? formatDateTime_(updatedAt) : new Date(),
      ];
    }));
  }

  formatMoneyColumns_(debtsSheet, [7]);
  formatMoneyColumns_(purchasesSheet, [8, 9, 10]);
  setupPaymentsSheet_(spreadsheet, getOrCreatePaymentsSheet_(spreadsheet));
  autoResize_(debtsSheet, 9);
  autoResize_(purchasesSheet, 12);
}

function setupPaymentsSheet_(spreadsheet, sheet) {
  const headers = getHeaderMap_(sheet);
  const providerCol = headers[normalizeHeader_('Proveedor')];
  const typeCol = headers[normalizeHeader_('Tipo de pago')];
  const amountCol = headers[normalizeHeader_('Monto pagado')];
  const methodCol = headers[normalizeHeader_('Medio de pago')];
  const fundsCol = headers[normalizeHeader_('Origen de fondos')];
  const statusCol = headers[normalizeHeader_('Estado')];

  const providerNames = getProviderNames_(spreadsheet, sheet, providerCol);
  applyDropdown_(sheet, providerCol, providerNames);
  applyDropdown_(sheet, typeCol, DEFAULT_PAYMENT_TYPES);
  applyDropdown_(sheet, methodCol, DEFAULT_PAYMENT_METHODS);
  applyDropdown_(sheet, fundsCol, DEFAULT_FUNDS_SOURCES);
  applyDropdown_(sheet, statusCol, ['Pendiente', 'Importado', 'Error']);

  if (amountCol) {
    sheet.getRange(2, amountCol, PAYMENT_INPUT_ROWS, 1).setNumberFormat('$ #,##0.00');
  }

  if (statusCol) {
    const statusRange = sheet.getRange(2, statusCol, PAYMENT_INPUT_ROWS, 1);
    const values = statusRange.getValues();
    let changed = false;
    values.forEach(function(row) {
      if (!String(row[0] || '').trim()) {
        row[0] = 'Pendiente';
        changed = true;
      }
    });
    if (changed) statusRange.setValues(values);
  }

  if (typeCol) {
    const typeRange = sheet.getRange(2, typeCol, PAYMENT_INPUT_ROWS, 1);
    const values = typeRange.getValues();
    let changed = false;
    values.forEach(function(row) {
      if (!String(row[0] || '').trim()) {
        row[0] = 'Pago total';
        changed = true;
      }
    });
    if (changed) typeRange.setValues(values);
  }

  softenImportedRows_(sheet, headers);
  autoResize_(sheet, ACCOUNTANT_REQUIRED_HEADERS.length);
}

function applyDropdown_(sheet, col, values) {
  if (!col || !values.length) return;
  const rule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, col, PAYMENT_INPUT_ROWS, 1).setDataValidation(rule);
}

function getProviderNames_(spreadsheet, paymentsSheet, providerCol) {
  const debtsSheet = spreadsheet.getSheetByName(ACCOUNTANT_DEBTS_SHEET_NAME);
  const names = [];

  if (debtsSheet && debtsSheet.getLastRow() >= 2) {
    debtsSheet
      .getRange(2, 1, debtsSheet.getLastRow() - 1, 1)
      .getValues()
      .forEach(function(row) {
        names.push(String(row[0] || '').trim());
      });
  }

  if (paymentsSheet && providerCol && paymentsSheet.getLastRow() >= 2) {
    paymentsSheet
      .getRange(2, providerCol, paymentsSheet.getLastRow() - 1, 1)
      .getValues()
      .forEach(function(row) {
        names.push(String(row[0] || '').trim());
      });
  }

  return names
    .filter(function(value, index, list) {
      return value && list.indexOf(value) === index;
    })
    .sort();
}

function softenImportedRows_(sheet, headers) {
  const statusCol = headers[normalizeHeader_('Estado')];
  if (!statusCol || sheet.getLastRow() < 2) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const statuses = sheet.getRange(2, statusCol, lastRow - 1, 1).getValues();

  statuses.forEach(function(row, index) {
    const rowNumber = index + 2;
    const status = normalizeHeader_(row[0]);
    const range = sheet.getRange(rowNumber, 1, 1, lastCol);
    if (status === 'importado') {
      range.setBackground('#eef7f0').setFontColor('#5f6f66');
    } else if (status === 'error') {
      range.setBackground('#fde8e8').setFontColor('#7f1d1d');
    } else {
      range.setBackground(null).setFontColor(null);
    }
  });
}

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== ACCOUNTANT_PAYMENTS_SHEET_NAME || e.range.getRow() === 1) return;

    const headers = getHeaderMap_(sheet);
    const dateCol = headers[normalizeHeader_('Fecha de pago')];
    const providerCol = headers[normalizeHeader_('Proveedor')];
    const typeCol = headers[normalizeHeader_('Tipo de pago')];
    const amountCol = headers[normalizeHeader_('Monto pagado')];
    const statusCol = headers[normalizeHeader_('Estado')];
    const row = e.range.getRow();
    const provider = providerCol ? sheet.getRange(row, providerCol).getValue() : '';
    const paymentType = typeCol ? sheet.getRange(row, typeCol).getValue() : '';
    const amount = amountCol ? sheet.getRange(row, amountCol).getValue() : '';

    if ((provider || amount) && dateCol && !sheet.getRange(row, dateCol).getValue()) {
      sheet.getRange(row, dateCol).setValue(new Date()).setNumberFormat('dd/MM/yyyy');
    }

    if ((provider || amount) && typeCol && !paymentType) {
      sheet.getRange(row, typeCol).setValue('Pago total');
    }

    if (provider && amountCol && isTotalPayment_(paymentType || 'Pago total')) {
      const debt = getProviderDebt_(sheet.getParent(), provider);
      if (debt > 0) {
        sheet.getRange(row, amountCol).setValue(debt).setNumberFormat('$ #,##0.00');
      }
    }

    if ((provider || amount) && statusCol && !sheet.getRange(row, statusCol).getValue()) {
      sheet.getRange(row, statusCol).setValue('Pendiente');
    }
  } catch (error) {
    // Evita interrumpir la carga manual del contador por un error de formato.
  }
}

function getProviderDebt_(spreadsheet, provider) {
  const debtsSheet = spreadsheet.getSheetByName(ACCOUNTANT_DEBTS_SHEET_NAME);
  if (!debtsSheet || debtsSheet.getLastRow() < 2) return 0;

  const headers = getHeaderMap_(debtsSheet);
  const providerCol = headers[normalizeHeader_('Proveedor')] || 1;
  const debtCol = headers[normalizeHeader_('Saldo pendiente')] || 7;
  const values = debtsSheet.getRange(2, 1, debtsSheet.getLastRow() - 1, debtsSheet.getLastColumn()).getValues();
  const target = normalizeHeader_(provider);
  for (let index = 0; index < values.length; index += 1) {
    if (normalizeHeader_(values[index][providerCol - 1]) === target) {
      return Number(values[index][debtCol - 1] || 0);
    }
  }

  return 0;
}

function isTotalPayment_(value) {
  const clean = normalizeHeader_(value);
  return clean === 'pago total' || clean === 'total' || clean === 'cancelar deuda total';
}

function getOrCreateSheetWithHeaders_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function clearDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
}

function formatMoneyColumns_(sheet, columns) {
  const rows = Math.max(sheet.getLastRow() - 1, 1);
  columns.forEach(function(col) {
    sheet.getRange(2, col, rows, 1).setNumberFormat('$ #,##0.00');
  });
}

function autoResize_(sheet, columns) {
  for (let col = 1; col <= columns; col += 1) {
    sheet.autoResizeColumn(col);
  }
}

function readPendingPayments_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = getHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  const rows = [];

  values.forEach(function(row, index) {
    const rowNumber = index + 2;
    const status = String(getCell_(row, headers, 'Estado') || '').trim();
    const provider = String(getCell_(row, headers, 'Proveedor') || '').trim();
    const amount = getCell_(row, headers, 'Monto pagado');

    if (!provider && !amount) return;
    if (status && !isPendingStatus_(status)) return;

    rows.push({
      rowNumber,
      date: formatDate_(getCell_(row, headers, 'Fecha de pago')),
      provider,
      paymentType: getCell_(row, headers, 'Tipo de pago'),
      amount,
      paymentMethod: getCell_(row, headers, 'Medio de pago'),
      fundsSource: getCell_(row, headers, 'Origen de fondos'),
      notes: getCell_(row, headers, 'Nota'),
      status,
    });
  });

  return rows;
}

function markRows_(sheet, importedRows, errorRows) {
  const headers = getHeaderMap_(sheet);
  const statusCol = headers[normalizeHeader_('Estado')];
  const resultCol = headers[normalizeHeader_('Resultado importacion')];
  const importedAtCol = headers[normalizeHeader_('Importado el')];

  importedRows.forEach(function(row) {
    const rowNumber = Number(row.rowNumber || 0);
    if (rowNumber < 2) return;
    sheet.getRange(rowNumber, statusCol).setValue('Importado');
    sheet.getRange(rowNumber, resultCol).setValue(row.message || 'Importado correctamente');
    sheet.getRange(rowNumber, importedAtCol).setValue(new Date());
  });

  errorRows.forEach(function(row) {
    const rowNumber = Number(row.rowNumber || 0);
    if (rowNumber < 2) return;
    sheet.getRange(rowNumber, statusCol).setValue('Error');
    sheet.getRange(rowNumber, resultCol).setValue(row.message || 'No se pudo importar');
  });
}

function isPendingStatus_(value) {
  const status = normalizeHeader_(value);
  return !status || status === 'pendiente' || status === 'pendiente de importar' || status === 'nuevo';
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

function getCell_(row, headers, header) {
  const col = headers[normalizeHeader_(header)];
  return col ? row[col - 1] : '';
}

function validateToken_(token) {
  const requiredToken = PropertiesService.getScriptProperties().getProperty('ACCOUNTANT_PAYMENTS_TOKEN') || '';
  if (requiredToken && String(token || '') !== requiredToken) {
    throw new Error('Token invalido.');
  }
}

function formatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value);
}

function formatDateTime_(value) {
  if (!value) return '';
  const date = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
  if (String(date) === 'Invalid Date') return String(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
