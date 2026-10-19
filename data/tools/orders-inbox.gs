/**
 * Royal Furniture — Orders inbox
 *
 * Paste this whole file into the Apps Script editor bound to the
 * "Royal Furniture — Orders" spreadsheet (Extensions → Apps Script).
 *
 * Setup: replace PASTE-YOUR-TOKEN-HERE, run setup(), approve access, then
 * deploy as a Web app (Execute as: Me · Who has access: Anyone).
 *
 * Privacy note: "Anyone" applies only to this script endpoint. It does not
 * make the spreadsheet public. Requests must know the token; status lookups
 * must also match BOTH the order id and the checkout mobile number.
 */

var ORDER_TOKEN = 'PASTE-YOUR-TOKEN-HERE';
var SHEET_NAME = 'Orders';
var HEADERS = [
  'Order ID',
  'Placed at',
  'Customer name',
  'Mobile',
  'Fulfilment',
  'Address / Showroom',
  'Items',
  'Total (AED)',
  'Status',
  'Delivery date',
  'Seller notes'
];
var STATUS_SUGGESTIONS = [
  'New',
  'Confirmed',
  'Payment requested',
  'Scheduled',
  'Out for delivery',
  'Ready for collection',
  'Delivered',
  'Completed',
  'Cancelled'
];

/** Run once from the Apps Script editor. Safe to run again. */
function setup() {
  var sheet = getOrdersSheet_();
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange('I2:I1000').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS_SUGGESTIONS, true).setAllowInvalid(true).build()
  );
  sheet.setColumnWidths(1, HEADERS.length, 140);
  sheet.setColumnWidth(6, 280);
  sheet.setColumnWidth(7, 360);
  sheet.setColumnWidth(11, 240);

  if (!tokenIsConfigured_()) {
    Logger.log('IMPORTANT: replace PASTE-YOUR-TOKEN-HERE with your own token before deploying.');
  }
  Logger.log('Royal Furniture Orders inbox is ready. Now deploy it as a Web app.');
}

/** Receives one order from the app. The app sends JSON as text/plain. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json_({ ok: false });

    var body = JSON.parse(e.postData.contents);
    if (!isAuthorised_(body && body.token)) return json_({ ok: false });

    var order = normaliseOrder_(body.order || {});
    if (!order) return json_({ ok: false });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getOrdersSheet_();
      ensureHeaders_(sheet);

      // Do not duplicate an order if the same submission is ever retried.
      if (findRowById_(sheet, order.id)) {
        return json_({ ok: true, duplicate: true, id: order.id });
      }

      var row = sheet.getLastRow() + 1;
      var range = sheet.getRange(row, 1, 1, HEADERS.length);

      // Format text cells before writing. This preserves leading zeroes in
      // UAE mobile numbers and helps keep customer text as text.
      range.setNumberFormats([[
        '@', 'yyyy-mm-dd hh:mm', '@', '@', '@', '@', '@', '#,##0.00', '@', '@', '@'
      ]]);
      range.setValues([[
        safeText_(order.id),
        new Date(), // Server receipt time: the moment the order reached the sheet.
        safeText_(order.name),
        safeText_(order.phone),
        safeText_(order.fulfilment),
        safeText_(order.address),
        safeText_(order.items),
        order.total,
        'New',
        '',
        ''
      ]]);
      sheet.getRange(row, 6, 1, 2).setWrap(true);
    } finally {
      lock.releaseLock();
    }

    return json_({ ok: true, id: order.id });
  } catch (error) {
    // Do not expose internal error details to the public endpoint.
    return json_({ ok: false });
  }
}

/** Returns seller-edited status/delivery date for the customer's own order. */
function doGet(e) {
  var parameters = (e && e.parameter) || {};
  var payload = { found: false };

  try {
    if (parameters.action === 'status' && isAuthorised_(parameters.token) && parameters.id && parameters.phone) {
      var sheet = getOrdersSheet_();
      ensureHeaders_(sheet);
      var row = findOrderRow_(sheet, String(parameters.id), String(parameters.phone));
      if (row) {
        payload = {
          found: true,
          status: String(row[8] || 'New'),
          deliveryDate: formatDeliveryDate_(row[9])
        };
      }
    } else if (!parameters.action) {
      payload = { ok: true, service: 'Royal Furniture orders inbox' };
    }
  } catch (error) {
    payload = { found: false };
  }

  var callback = String(parameters.callback || '');
  var text = JSON.stringify(payload);
  if (/^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + text + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(payload);
}

function getOrdersSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('This script must be bound to the Orders spreadsheet.');

  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  // A newly created or CSV-converted spreadsheet may have one default tab.
  // Reuse it so setup does not leave a confusing blank/duplicate first tab.
  var sheets = spreadsheet.getSheets();
  if (sheets.length === 1) {
    sheets[0].setName(SHEET_NAME);
    return sheets[0];
  }
  return spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }
  var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  var isBlank = current.every(function (value) { return String(value || '') === ''; });
  if (isBlank) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
}

function normaliseOrder_(raw) {
  var order = {
    id: cappedString_(raw.id, 40),
    name: cappedString_(raw.name, 120),
    phone: cappedString_(raw.phone, 40),
    fulfilment: cappedString_(raw.fulfilment, 40),
    address: cappedString_(raw.address, 600),
    items: cappedString_(raw.items, 5000),
    total: Number(raw.total)
  };
  if (!order.id || !order.name || !order.phone || !order.items) return null;
  if (!isFinite(order.total) || order.total < 0 || order.total > 10000000) return null;
  return order;
}

function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return null;
}

function findOrderRow_(sheet, id, phone) {
  var values = sheet.getDataRange().getValues();
  var wantedPhone = digitsOnly_(phone).slice(-9);
  if (!wantedPhone) return null;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id) && digitsOnly_(values[i][3]).slice(-9) === wantedPhone) {
      return values[i];
    }
  }
  return null;
}

function cappedString_(value, maximum) {
  return String(value == null ? '' : value).trim().slice(0, maximum);
}

function digitsOnly_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function safeText_(value) {
  var text = String(value == null ? '' : value);
  // Prevent customer-entered text from being interpreted as a formula.
  if (/^[=+\-@\t\r]/.test(text)) return "'" + text;
  return text;
}

function formatDeliveryDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'd MMM yyyy');
  }
  return String(value);
}

function tokenIsConfigured_() {
  return Boolean(ORDER_TOKEN) && ORDER_TOKEN !== 'PASTE-YOUR-TOKEN-HERE';
}

function isAuthorised_(token) {
  return tokenIsConfigured_() && String(token || '') === ORDER_TOKEN;
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
