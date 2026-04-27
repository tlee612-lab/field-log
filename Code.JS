/**
 * TLI Field Log - Server Side (Code.gs)
 * Version: 2026.04.27-Stable
 */

const AUTO_LOG_FOLDER_ID = '1Q3BWEfnUoqoPYWFQ0eDeSXGRAjPybQov';
const MASTER_LOG_NAME = 'Master Activity Log';

const HEADERS = [
  'Logged At', 'Case Number', 'Client Last Name', 'Client First Name', 'Activity Type',
  'Date', 'Time', 'Duration (mins)', 'Quantity', 'Mileage', 'From', 'To',
  'Investigator', 'Notes'
];

const MASTER_HEADERS = [
  'Logged At', 'Case Number', 'Client Last Name', 'Client First Name', 'Activity Type',
  'Date', 'Time', 'Duration (mins)', 'Quantity', 'Mileage', 'From', 'To',
  'Investigator', 'Notes', 'Filed To'
];

function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function doGet(e) {
  try {
    const action = e.parameter.action || '';
    if (action === 'ping' || (!action && !e.parameter.data)) {
      return buildResponse({ status: 'ok', message: 'TLI Field Log webhook is live' });
    }
    if (action === 'getCases') return buildResponse(getCases());
    // Legacy GET path (kept for backward compatibility)
    if (e.parameter.data) {
      const reqId = e.parameter.reqId || '';
      if (reqId && !checkAndSetReqId(reqId)) {
        return buildResponse({ status: 'ok', message: 'duplicate request ignored' });
      }
      const data = JSON.parse(e.parameter.data);
      const entries = Array.isArray(data) ? data : [data];
      const results = [];
      for (const entry of entries) results.push(logEntry(entry));
      return buildResponse({ status: 'ok', results });
    }
    return buildResponse({ status: 'ok', message: 'TLI Field Log webhook is live' });
  } catch (err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

function doPost(e) {
  try {
    // Body is sent as text/plain JSON: { reqId, data: [...] }
    const raw = (e.postData && e.postData.contents) ? e.postData.contents : (e.parameter.data || '');
    if (!raw) throw new Error('No data received');

    const body = JSON.parse(raw);
    const reqId = body.reqId || '';
    const incoming = body.data !== undefined ? body.data : body;

    if (reqId && !checkAndSetReqId(reqId)) {
      return buildResponse({ status: 'ok', message: 'duplicate request ignored' });
    }

    const entries = Array.isArray(incoming) ? incoming : [incoming];
    const results = [];
    for (const entry of entries) results.push(logEntry(entry));
    return buildResponse({ status: 'ok', results });
  } catch (err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

// Returns true if this reqId is new (and registers it); false if it's a duplicate.
function checkAndSetReqId(reqId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('req_' + reqId)) return false;
    cache.put('req_' + reqId, '1', 60);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getCases() {
  try {
    const autoLogFolder = DriveApp.getFolderById(AUTO_LOG_FOLDER_ID);
    const folders = autoLogFolder.getFolders();
    const cases = [];
    let lastInvestigator = '';
    while (folders.hasNext()) {
      const folder = folders.next();
      const name = folder.getName();
      const parts = name.split(' - ');
      if (parts.length >= 2) {
        const caseNum = parts[0].trim();
        const clientPart = parts.slice(1).join(' - ').trim();
        const nameParts = clientPart.split(',');
        const client = nameParts[0].trim();
        const clientFirst = nameParts.length > 1 ? nameParts[1].trim() : '';
        cases.push({ case: caseNum, client, clientFirst });
        try {
          const files = folder.getFiles();
          while (files.hasNext()) {
            const file = files.next();
            if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
              const ss = SpreadsheetApp.openById(file.getId());
              const sheet = ss.getActiveSheet();
              const lastRow = sheet.getLastRow();
              if (lastRow > 1) {
                const inv = sheet.getRange(lastRow, 13).getValue();
                if (inv) lastInvestigator = inv;
              }
              break;
            }
          }
        } catch(e) {}
      }
    }
    return { status: 'ok', cases, lastInvestigator };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

function logEntry(entry) {
  const caseNum      = (entry.case         || '').trim();
  const clientLast   = (entry.client       || '').trim();
  const clientFirst  = (entry.clientFirst  || '').trim();
  const type         = (entry.type         || '').trim();
  const date         = (entry.date         || '').trim();
  const time         = (entry.time         || '').trim();
  const duration     = (entry.duration     || '').toString().trim();
  const quantity     = (entry.quantity     || '').toString().trim();
  const mileage      = (entry.mileage      || '').toString().trim();
  const travelFrom   = (entry.travelFrom   || '').trim();
  const travelTo     = (entry.travelTo     || '').trim();
  const investigator = (entry.investigator || '').trim();
  const notes        = (entry.notes        || '').trim();
  const logged       = (entry.logged       || new Date().toISOString()).trim();

  const row = [logged, caseNum, clientLast, clientFirst, type, date, time,
               duration, quantity, mileage, travelFrom, travelTo, investigator, notes];

  if (!caseNum || !clientLast) throw new Error('case and client are required');

  // Always write to master log first — captures everything regardless of case folder issues
  let filedTo = '';
  try {
    const masterSheet = getOrCreateMasterSheet();
    // Blank separator row when the case changes — keeps the master log readable
    const mlr = masterSheet.getLastRow();
    if (mlr > 1) {
      const prevCase = String(masterSheet.getRange(mlr, 2).getValue()).trim();
      if (prevCase !== '' && prevCase !== caseNum) {
        masterSheet.getRange(mlr + 1, 1).setValue(' ');
      }
    }
    masterSheet.appendRow([...row, 'PENDING']);
    filedTo = 'PENDING';
  } catch(masterErr) {
    Logger.log('Master log write failed: ' + masterErr.message);
  }

  // Attempt case folder + sheet
  Logger.log('Creating/finding folder for case: ' + caseNum);
  const caseFolder = getOrCreateCaseFolder(caseNum, clientLast, clientFirst);
  Logger.log('Folder ready: ' + caseFolder.getName());

  const folderParts = caseFolder.getName().split(' - ');
  if (folderParts.length >= 2) {
    const existingLast = folderParts[1].split(',')[0].trim();
    const existingFirst = folderParts[1].includes(',') ? folderParts[1].split(',')[1].trim() : '';
    const lastMismatch = existingLast.toLowerCase() !== clientLast.toLowerCase();
    const firstMismatch = existingFirst && clientFirst && existingFirst.toLowerCase() !== clientFirst.toLowerCase();
    if (lastMismatch || firstMismatch) {
      const errMsg = 'Name mismatch: ' + caseNum + ' belongs to ' + existingLast +
        (existingFirst ? ', ' + existingFirst : '') + ' — not ' + clientLast +
        (clientFirst ? ', ' + clientFirst : '');
      // Update master log row status to the error
      updateMasterLogStatus(logged, caseNum, 'ERROR: ' + errMsg);
      throw new Error(errMsg);
    }
  }

  Logger.log('Getting or creating sheet...');
  const sheet = getOrCreateSheet(caseFolder);
  Logger.log('Sheet ready, appending row...');
  // Blank separator row when the submission batch changes — groups Travel Time + Mileage pairs together
  const clr = sheet.getLastRow();
  if (clr > 1) {
    const prevLogged = String(sheet.getRange(clr, 1).getValue()).trim();
    if (prevLogged !== '' && prevLogged !== logged) {
      sheet.getRange(clr + 1, 1).setValue(' ');
    }
  }
  sheet.appendRow(row);
  Logger.log('Row appended successfully');

  // Update master log Filed To column with the actual folder name
  filedTo = caseFolder.getName();
  updateMasterLogStatus(logged, caseNum, filedTo);

  return { case: caseNum, client: clientLast, folder: filedTo };
}

// Updates the 'Filed To' column on the most recent master log row matching logged+caseNum
function updateMasterLogStatus(logged, caseNum, status) {
  try {
    const masterSheet = getOrCreateMasterSheet();
    const lastRow = masterSheet.getLastRow();
    if (lastRow < 2) return;
    // Search from bottom up for the matching row
    const data = masterSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][0]) === String(logged) && String(data[i][1]) === String(caseNum)) {
        masterSheet.getRange(i + 2, MASTER_HEADERS.length).setValue(status);
        return;
      }
    }
  } catch(e) {
    Logger.log('updateMasterLogStatus failed: ' + e.message);
  }
}

function getOrCreateMasterSheet() {
  const autoLogFolder = DriveApp.getFolderById(AUTO_LOG_FOLDER_ID);
  // Look for existing master log spreadsheet
  const files = autoLogFolder.getFilesByName(MASTER_LOG_NAME);
  if (files.hasNext()) {
    const sheet = SpreadsheetApp.openById(files.next().getId()).getActiveSheet();
    // Add headers if the sheet exists but was created without them
    if (String(sheet.getRange(1, 1).getValue()) !== 'Logged At') {
      Logger.log('Master log missing headers — adding now');
      if (sheet.getLastRow() > 0) sheet.insertRowBefore(1);
      const hr = sheet.getRange(1, 1, 1, MASTER_HEADERS.length);
      hr.setValues([MASTER_HEADERS]);
      hr.setFontWeight('bold').setBackground('#1c2030').setFontColor('#00c8a0');
      sheet.setFrozenRows(1);
      [160,110,120,120,280,90,70,100,80,80,100,100,120,400,220].forEach((w,i) => sheet.setColumnWidth(i+1, w));
    }
    return sheet;
  }
  // Create it
  Logger.log('Creating master log spreadsheet...');
  const ss = SpreadsheetApp.create(MASTER_LOG_NAME);
  const file = DriveApp.getFileById(ss.getId());
  autoLogFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  const sheet = ss.getActiveSheet();
  sheet.setName('All Entries');
  sheet.appendRow(MASTER_HEADERS);
  const hr = sheet.getRange(1, 1, 1, MASTER_HEADERS.length);
  hr.setFontWeight('bold');
  hr.setBackground('#1c2030');
  hr.setFontColor('#00c8a0');
  sheet.setFrozenRows(1);
  [160,110,120,120,280,90,70,100,80,80,100,100,120,400,220].forEach((w,i) => sheet.setColumnWidth(i+1, w));
  Logger.log('Master log created');
  return sheet;
}

function getOrCreateCaseFolder(caseNum, clientLast, clientFirst) {
  const autoLogFolder = DriveApp.getFolderById(AUTO_LOG_FOLDER_ID);
  const fullName = clientFirst ? clientLast + ', ' + clientFirst : clientLast;
  const folderName = caseNum + ' - ' + fullName;

  const exact = autoLogFolder.getFoldersByName(folderName);
  if (exact.hasNext()) return exact.next();

  const allFolders = autoLogFolder.getFolders();
  while (allFolders.hasNext()) {
    const folder = allFolders.next();
    const name = folder.getName();
    if (name === caseNum || name.startsWith(caseNum + ' - ')) return folder;
  }

  return autoLogFolder.createFolder(folderName);
}

function getOrCreateSheet(caseFolder) {
  Logger.log('Checking for existing sheet in folder: ' + caseFolder.getName());
  const files = caseFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    Logger.log('Found file: ' + file.getName() + ' type: ' + file.getMimeType());
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      Logger.log('Existing sheet found, returning it');
      return SpreadsheetApp.openById(file.getId()).getActiveSheet();
    }
  }
  Logger.log('No sheet found, creating new one...');
  const sheetName = caseFolder.getName();
  const ss = SpreadsheetApp.create(sheetName);
  Logger.log('Spreadsheet created: ' + ss.getId());
  const file = DriveApp.getFileById(ss.getId());
  caseFolder.addFile(file);
  Logger.log('File added to folder');
  DriveApp.getRootFolder().removeFile(file);
  Logger.log('File removed from root');
  const sheet = ss.getActiveSheet();
  sheet.setName('Activity Log');
  sheet.appendRow(HEADERS);
  const hr = sheet.getRange(1, 1, 1, HEADERS.length);
  hr.setFontWeight('bold');
  hr.setBackground('#1c2030');
  hr.setFontColor('#00c8a0');
  sheet.setFrozenRows(1);
  [160,110,120,120,280,90,70,100,80,80,100,100,120,400].forEach((w,i) => sheet.setColumnWidth(i+1, w));
  Logger.log('Sheet setup complete');
  return sheet;
}

function testLogEntry() {
  const result = logEntry({
    case: 'TEST001',
    client: 'TestClient',
    clientFirst: 'John',
    type: 'Investigator Service - Case Consultation',
    date: '2026-04-27',
    time: '09:00',
    duration: '60',
    quantity: '',
    mileage: '',
    travelFrom: '',
    travelTo: '',
    investigator: 'Lee',
    notes: 'Test entry from Apps Script debug run'
  });
  Logger.log('Result: ' + JSON.stringify(result));
}
