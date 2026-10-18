/**
 * Royal Furniture — Google Sheets → live demo catalog sync.
 *
 * Paste this into your catalog spreadsheet:  Extensions ▸ Apps Script
 * (replace anything the editor pre-fills), save, then reload the sheet and
 * use the "Catalog ▸ Sync now" menu. The first sync asks for authorization —
 * approve it once (it only touches this spreadsheet and the demo receiver).
 *
 * After a sync, the demo app updates itself within ~15 seconds
 * (refresh the browser tab if it does not).
 */

// Demo receiver — sandbox-specific; ask for a new URL if the demo moves.
const ENDPOINT = 'https://8081-ieyf6suwlxmlb9jknj5l4.e2b.app/upload';
const TOKEN = '15b5abea0bf2c148bc81ece317cd8a41c81f638d01719b8a';

/** Adds the "Catalog" menu when the sheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Catalog')
    .addItem('Sync now', 'syncCatalog')
    .addItem('Auto-sync every 5 minutes', 'installAutoSync')
    .addToUi();
}

/** Exports this spreadsheet as .xlsx and POSTs it to the demo app. */
function syncCatalog() {
  const blob = DriveApp.getFileById(SpreadsheetApp.getActive().getId())
    .getBlob()
    .getAs('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setName('catalog.xlsx');
  const response = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    payload: blob.getBytes(),
    contentType: 'application/octet-stream',
    headers: { 'x-bridge-token': TOKEN },
    muteHttpExceptions: true,
  });
  const body = response.getContentText();
  Logger.log('Sync response: ' + body);
  try {
    SpreadsheetApp.getUi().alert('Catalog sync', body, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // running from a trigger (no UI) — the execution log has the result.
  }
  return body;
}

/** Time-driven fallback so edits sync even without the menu. */
function installAutoSync() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncCatalog')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncCatalog').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Auto-sync', 'The sheet will now sync every 5 minutes while this demo is live.', SpreadsheetApp.getUi().ButtonSet.OK);
}
