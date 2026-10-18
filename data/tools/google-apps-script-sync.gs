/**
 * Royal Furniture — Google Sheets → live demo catalog sync.
 * Menu: Catalog ▸ Sync now (or enable the 5-minute auto-sync).
 *
 * Native Google Sheets cannot be converted to .xlsx with getAs() (it only
 * exports PDF), so this uses the spreadsheet's own xlsx export endpoint.
 */

// Demo receiver - sandbox-specific; ask for a new URL if the demo moves.
// SECURITY: paste your push token below before use. It is a shared secret for
// the demo receiver - keep it out of source control; store it in your secret
// manager or a private note. The receiver reads it from RECEIVER_TOKEN.
const ENDPOINT = 'https://8081-ieyf6suwlxmlb9jknj5l4.e2b.app/upload';
const TOKEN = 'PASTE_PUSH_TOKEN_HERE';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Catalog')
    .addItem('Sync now', 'syncCatalog')
    .addItem('Auto-sync every 5 minutes', 'installAutoSync')
    .addToUi();
}

/** Exports this spreadsheet as .xlsx via the Drive export endpoint. */
function exportXlsx_() {
  const id = SpreadsheetApp.getActive().getId();
  DriveApp.getFileById(id).getName(); // keeps the Drive scope on the token
  const url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Could not export this sheet as .xlsx (HTTP ' + response.getResponseCode() + ')');
  }
  return response.getBlob().setName('catalog.xlsx');
}

/** Exports this spreadsheet and POSTs it to the demo app receiver. */
function syncCatalog() {
  let body;
  try {
    const blob = exportXlsx_();
    const response = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      payload: blob.getBytes(),
      contentType: 'application/octet-stream',
      headers: { 'x-bridge-token': TOKEN },
      muteHttpExceptions: true,
    });
    body = response.getContentText();
  } catch (err) {
    body = String(err && err.message ? err.message : err);
    try {
      SpreadsheetApp.getUi().alert('Catalog sync failed', body, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (e) {}
    Logger.log('Sync error: ' + body);
    return body;
  }
  Logger.log('Sync response: ' + body);
  try {
    SpreadsheetApp.getUi().alert('Catalog sync', body, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
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
