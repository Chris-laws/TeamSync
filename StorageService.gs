var Storage_ = {
  spreadsheet: function () {
    var id = PropertiesService.getScriptProperties().getProperty(CONFIG_.propertyKeys.spreadsheetId);
    if (!id) throw appError_('NOT_CONFIGURED', 'Set the TEAMSYNC_SPREADSHEET_ID script property before using TeamSync.');
    return SpreadsheetApp.openById(id);
  },
  initialize: function () {
    var spreadsheet = this.spreadsheet();
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      Object.keys(SCHEMAS_).forEach(function (name) {
        var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
        var headers = SCHEMAS_[name];
        if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        else {
          var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
          headers.forEach(function (header, index) { if (!existing[index]) sheet.getRange(1, index + 1).setValue(header); });
        }
        sheet.setFrozenRows(1);
      });
      return { initialized: true, spreadsheetId: spreadsheet.getId(), sheets: Object.keys(SCHEMAS_) };
    } finally { lock.releaseLock(); }
  },
  all: function (sheetName) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    if (!sheet) throw appError_('NOT_INITIALIZED', 'Run application initialization first.');
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];
    var headers = SCHEMAS_[sheetName];
    return values.slice(1).filter(function (row) { return row.some(function (cell) { return cell !== ''; }); }).map(function (row, offset) {
      var item = { _row: offset + 2 };
      headers.forEach(function (header, index) { item[header] = row[index] instanceof Date ? row[index].toISOString() : row[index]; });
      return item;
    });
  },
  find: function (sheetName, field, value) { return this.all(sheetName).find(function (item) { return String(item[field]) === String(value); }) || null; },
  insert: function (sheetName, item) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = SCHEMAS_[sheetName];
    sheet.appendRow(headers.map(function (header) { return item[header] == null ? '' : item[header]; }));
    this.invalidate();
    return item;
  },
  update: function (sheetName, rowNumber, item) {
    var sheet = this.spreadsheet().getSheetByName(sheetName);
    var headers = SCHEMAS_[sheetName];
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function (header) { return item[header] == null ? '' : item[header]; })]);
    this.invalidate();
    return item;
  },
  withLock: function (callback) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return callback(); } finally { lock.releaseLock(); }
  },
  invalidate: function () { CacheService.getScriptCache().removeAll(['projects', 'users']); }
};
