/**
 * TLI Field Log - Server Side (Code.gs)
 * Version: 2026.05.04-Stable
 */

const AUTO_LOG_FOLDER_ID = '1Q3BWEfnUoqoPYWFQ0eDeSXGRAjPybQov';
const MASTER_LOG_NAME = 'Master Activity Log';

const HEADERS = [
  'Logged At', 'Case Number', 'Client Last Name', 'Client First Name', 'Activity Type',
  'Date', 'Time', 'Duration (mins)', 'Tenths of Hours', 'Running Total', 'Quantity', 'Mileage', 'From', 'To',
  'Investigator', 'Notes', 'Billed'
];

const MASTER_HEADERS = [
  'Logged At', 'Case Number', 'Client Last Name', 'Client First Name', 'Activity Type',
  'Date', 'Time', 'Duration (mins)', 'Tenths of Hours', 'Running Total', 'Quantity', 'Mileage', 'From', 'To',
  'Investigator', 'Notes', 'Filed To'
];

// Convert minutes to tenths of hours using billing chart (15-minute minimum)
function minutesToTenths(mins) {
  const m = parseInt(mins) || 0;
  if (m <= 0) return 0;
  // Apply 15-minute minimum
  const adjusted = Math.max(m, 15);
  // Conversion chart: 0=0, 1-6=0.1, 7-12=0.2, 13-18=0.3, 19-24=0.4, 25-30=0.5, 31-36=0.6, 37-42=0.7, 43-48=0.8, 49-54=0.9, 55+=1.0
  if (adjusted <= 6) return 0.1;
  if (adjusted <= 12) return 0.2;
  if (adjusted <= 18) return 0.3;
  if (adjusted <= 24) return 0.4;
  if (adjusted <= 30) return 0.5;
  if (adjusted <= 36) return 0.6;
  if (adjusted <= 42) return 0.7;
  if (adjusted <= 48) return 0.8;
  if (adjusted <= 54) return 0.9;
  return 1.0;
}

// Get running total for a case
let caseRunningTotals = {}; // Track running totals per case per session
function getRunningTotal(caseNum, tenths) {
  if (!caseRunningTotals[caseNum]) caseRunningTotals[caseNum] = 0;
  caseRunningTotals[caseNum] += tenths;
  return caseRunningTotals[caseNum];
}

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
    if (action === 'getCaseSummary') return buildResponse(getCaseSummary(e.parameter.case || ''));
    if (action === 'upgradeSheet') return buildResponse(upgradeSheetAction(e.parameter.case || ''));
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

    // Route action-based requests first
    const action = body.action || '';
    if (action === 'createCase') return buildResponse(createCase(body));

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

  // Tenths and running total are now calculated by formulas in the sheet
  // Append empty values for columns 9 and 10; formulas will populate them
  // Billed column is empty by default (will be marked when entry is included in a billing batch)
  const row = [logged, caseNum, clientLast, clientFirst, type, date, time,
               duration, '', '', quantity, mileage, travelFrom, travelTo, investigator, notes, ''];

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
  Logger.log('Sheet ready, checking for missing columns...');
  ensureNewColumns(sheet); // Add new columns if needed
  Logger.log('Appending row...');
  // Blank separator row when the submission batch changes — groups Travel Time + Mileage pairs together
  const clr = sheet.getLastRow();
  if (clr > 1) {
    const prevLogged = String(sheet.getRange(clr, 1).getValue()).trim();
    if (prevLogged !== '' && prevLogged !== logged) {
      sheet.getRange(clr + 1, 1).setValue(' ');
    }
  }
  sheet.appendRow(row);
  const newRowNum = sheet.getLastRow();
  Logger.log('Row appended at row ' + newRowNum);

  // Add formulas to the newly appended row (columns 9 and 10)
  try {
    // Tenths formula: uses LOOKUP with MAX floor check
    const tenthsFormula = '=IF(H' + newRowNum + '="","",MAX(0.3,INT(H' + newRowNum + '/60)+LOOKUP(MOD(H' + newRowNum + ',60),{0,1,7,13,19,25,31,37,43,49,55},{0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1})))';
    const dataStartRow = 4; // New format always starts data at row 4
    const runningTotalFormula = '=IF(I' + newRowNum + '="","",SUMIF($B$' + dataStartRow + ':B' + newRowNum + ',B' + newRowNum + ',$I$' + dataStartRow + ':I' + newRowNum + '))';
    sheet.getRange(newRowNum, 9).setFormula(tenthsFormula);
    sheet.getRange(newRowNum, 10).setFormula(runningTotalFormula);
    Logger.log('Formulas added to new row');
  } catch(formulaErr) {
    Logger.log('Failed to add formulas: ' + formulaErr.message);
  }

  // Auto-sort by Date (col 6) then Time (col 7)
  autoSortActivityLog(sheet);

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
      const ss = SpreadsheetApp.openById(file.getId());
      // Always return Activity Log tab; fall back to active sheet if not found
      return ss.getSheetByName('Activity Log') || ss.getActiveSheet();
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

// NOTE: minutesToTenths() is defined earlier (line ~22) with 15-minute minimum for activity log entries

// Returns hours used for a case by reading its Activity Log sheet
function getCaseSummary(caseNum) {
  if (!caseNum) return { status: 'error', message: 'case required' };
  try {
    const autoLogFolder = DriveApp.getFolderById(AUTO_LOG_FOLDER_ID);
    const allFolders = autoLogFolder.getFolders();
    let caseFolder = null;
    while (allFolders.hasNext()) {
      const f = allFolders.next();
      const name = f.getName();
      if (name === caseNum || name.startsWith(caseNum + ' - ')) { caseFolder = f; break; }
    }
    if (!caseFolder) return { status: 'ok', found: false };

    // Find the sheet without creating one
    const files = caseFolder.getFiles();
    let sheet = null;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        sheet = SpreadsheetApp.openById(file.getId()).getActiveSheet();
        break;
      }
    }
    if (!sheet) return { status: 'ok', found: false };

    // Always read from Activity Log tab specifically (PAE Summary may be active after createCase)
    const actLog = sheet.getParent().getSheetByName('Activity Log');
    if (actLog) sheet = actLog;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status: 'ok', found: true, hoursUsed: 0, totalMins: 0, totalMileage: 0 };

    // Read Hours Used directly from D1 (which has the correct formula)
    // and Mileage from H1 (both in the totals bar)
    const d1 = sheet.getRange(1, 4).getValue(); // Column D, row 1
    const h1 = sheet.getRange(1, 8).getValue(); // Column H, row 1
    const hoursUsed = parseFloat((parseFloat(d1) || 0).toFixed(2));
    const totalMileage = parseFloat((parseFloat(h1) || 0).toFixed(2));

    // For reference, also calculate total minutes from data rows
    // Col 5 = Activity Type, Col 8 = Duration (mins)
    // New format: rows 1-3 are totals/blank/headers — data starts at row 4.
    // Old format: row 1 = headers, data starts at row 2.
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    let totalMins = 0;
    for (const row of data) {
      const type = String(row[4] || '').trim();
      const dur  = parseFloat(row[7]) || 0;
      if (/^Investigator Service/i.test(type) && dur > 0) totalMins += dur;
    }

    return {
      status: 'ok',
      found: true,
      hoursUsed,
      totalMins,
      totalMileage
    };
  } catch(err) {
    return { status: 'error', message: err.message };
  }
}

// ── Upgrade Sheet Action (manual upgrade from UI) ───────────────────────────

/**
 * Upgrade a case sheet with new columns if needed.
 * Called from UI button in settings.
 */
function upgradeSheetAction(caseNum) {
  if (!caseNum) return { status: 'error', message: 'case required' };
  try {
    const autoLogFolder = DriveApp.getFolderById(AUTO_LOG_FOLDER_ID);
    const allFolders = autoLogFolder.getFolders();
    let caseFolder = null;

    while (allFolders.hasNext()) {
      const f = allFolders.next();
      const name = f.getName();
      if (name === caseNum || name.startsWith(caseNum + ' - ')) { caseFolder = f; break; }
    }

    if (!caseFolder) return { status: 'error', message: 'case folder not found' };

    // Find the sheet
    const files = caseFolder.getFiles();
    let sheet = null;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        sheet = SpreadsheetApp.openById(file.getId()).getSheetByName('Activity Log');
        break;
      }
    }

    if (!sheet) return { status: 'error', message: 'Activity Log sheet not found' };

    // Upgrade the sheet
    ensureNewColumns(sheet);

    return { status: 'ok', message: 'Sheet upgraded successfully', case: caseNum };
  } catch(err) {
    return { status: 'error', message: err.message };
  }
}

// ── createCase: create or upgrade a case spreadsheet with PAE data ──────────

/**
 * Main entry point. Accepts:
 *   { action:'createCase', caseNum, clientLast, clientFirst, paes: [...] }
 * Returns:
 *   { status, created, upgraded, folder, sheetId, paeCount }
 */
function createCase(body) {
  const caseNum     = String(body.caseNum    || '').trim();
  const clientLast  = String(body.clientLast  || '').trim();
  const clientFirst = String(body.clientFirst || '').trim();
  const paes        = Array.isArray(body.paes) ? body.paes : (body.paes ? [body.paes] : []);

  if (!caseNum || !clientLast) {
    return { status: 'error', message: 'caseNum and clientLast are required' };
  }

  // Get or create case folder
  const caseFolder = getOrCreateCaseFolder(caseNum, clientLast, clientFirst);
  Logger.log('createCase: folder = ' + caseFolder.getName());

  // Find existing spreadsheet
  let ss    = null;
  let isNew = false;
  const files = caseFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      ss = SpreadsheetApp.openById(file.getId());
      break;
    }
  }

  // Create spreadsheet if none exists
  if (!ss) {
    isNew = true;
    ss    = SpreadsheetApp.create(caseFolder.getName());
    const newFile = DriveApp.getFileById(ss.getId());
    caseFolder.addFile(newFile);
    DriveApp.getRootFolder().removeFile(newFile);
    Logger.log('createCase: new spreadsheet created');
  }

  // ── Activity Log tab ──────────────────────────────────────────────────────
  let activitySheet = ss.getSheetByName('Activity Log');
  if (!activitySheet) {
    // Rename the default Sheet1 if it exists
    const defaultSheet = ss.getActiveSheet();
    defaultSheet.setName('Activity Log');
    activitySheet = defaultSheet;
  }

  let upgraded = false;
  const a1Val  = String(activitySheet.getRange(1, 1).getValue()).trim();

  if (isNew || activitySheet.getLastRow() === 0) {
    // Brand-new — build full new-format layout
    setupNewActivityLog(activitySheet);
  } else if (a1Val === 'Logged At') {
    // Old format: row 1 = headers, row 2+ = data → insert 2 rows, add totals bar
    upgradeActivityLog(activitySheet);
    upgraded = true;
    Logger.log('createCase: activity log upgraded');
  } else {
    Logger.log('createCase: activity log already in new format, no changes');
  }

  // ── PAE Summary tab ───────────────────────────────────────────────────────
  let paeSheet = ss.getSheetByName('PAE Summary');
  if (!paeSheet) {
    paeSheet = ss.insertSheet('PAE Summary');
    setupPaeSummarySheet(paeSheet, caseNum, clientLast, clientFirst);
    Logger.log('createCase: PAE Summary tab created');
  }

  // Add new PAEs (duplicate-safe)
  let paeCount = 0;
  if (paes.length > 0) {
    paeCount = addPaesToSummarySheet(paeSheet, paes);
    Logger.log('createCase: ' + paeCount + ' new PAE row(s) added');
  }

  return {
    status:   'ok',
    created:   isNew,
    upgraded,
    folder:    caseFolder.getName(),
    sheetId:   ss.getId(),
    paeCount
  };
}

/**
 * Set up a brand-new Activity Log sheet in the 3-row-header format.
 *   Row 1  – Totals bar (Auth Hrs, Used Hrs, Remaining, Mileage)
 *   Row 2  – blank spacer
 *   Row 3  – Column headers (frozen)
 *   Row 4+ – Data
 */
function setupNewActivityLog(sheet) {
  // Clear any default content
  sheet.clearContents();

  // Row 1: totals bar labels + formulas
  const totalsLabels = ['Auth Hrs', '=\'PAE Summary\'!B1', 'Used Hrs',
    '=IFERROR(SUMIF(E4:E9999,"Investigator Service*",I4:I9999),0)',
    'Remaining', '=IFERROR(B1-D1,"--")', 'Mileage', '=SUM(J4:J9999)'];
  sheet.getRange(1, 1, 1, totalsLabels.length).setValues([totalsLabels]);

  // Style totals row
  styleActivityTotalsRow(sheet);

  // Row 2: blank spacer (leave empty)

  // Row 3: column headers
  sheet.getRange(3, 1, 1, HEADERS.length).setValues([HEADERS]);
  const hdr = sheet.getRange(3, 1, 1, HEADERS.length);
  hdr.setFontWeight('bold').setBackground('#1c2030').setFontColor('#00c8a0');

  sheet.setFrozenRows(3);
  applyActivityLogColumnWidths(sheet);
  autoSortActivityLog(sheet);
  Logger.log('setupNewActivityLog: complete');
}

/**
 * Upgrade an old-format Activity Log (row 1 = headers, row 2+ = data)
 * to new format by inserting 2 rows at top and adding the totals bar.
 */
function upgradeActivityLog(sheet) {
  // Insert 2 blank rows before existing header (now becomes row 3)
  sheet.insertRowsBefore(1, 2);

  // Row 1: totals bar
  const totalsLabels = ['Auth Hrs', '=\'PAE Summary\'!B1', 'Used Hrs',
    '=IFERROR(SUMIF(E4:E9999,"Investigator Service*",I4:I9999),0)',
    'Remaining', '=IFERROR(B1-D1,"--")', 'Mileage', '=SUM(J4:J9999)'];
  sheet.getRange(1, 1, 1, totalsLabels.length).setValues([totalsLabels]);

  styleActivityTotalsRow(sheet);

  // Row 3 is now the old header row — re-apply header style
  const hdr = sheet.getRange(3, 1, 1, HEADERS.length);
  hdr.setFontWeight('bold').setBackground('#1c2030').setFontColor('#00c8a0');

  sheet.setFrozenRows(3);
  applyActivityLogColumnWidths(sheet);
  autoSortActivityLog(sheet);
}

/** Apply visual style to the totals bar in row 1 of Activity Log. */
function styleActivityTotalsRow(sheet) {
  const totalsRange = sheet.getRange(1, 1, 1, 8);
  totalsRange.setBackground('#0d1117').setFontColor('#00c8a0').setFontWeight('bold');

  // Label cells (A, C, E, G) — slightly muted
  [1, 3, 5, 7].forEach(col => {
    sheet.getRange(1, col).setFontColor('#5a8a7a').setFontSize(9);
  });
  // Value cells (B, D, F, H) — bright, larger
  [2, 4, 6, 8].forEach(col => {
    sheet.getRange(1, col).setFontColor('#00c8a0').setFontSize(11);
  });
}

/** Set column widths for Activity Log. */
function applyActivityLogColumnWidths(sheet) {
  [160, 110, 120, 120, 280, 90, 70, 100, 90, 90, 80, 80, 100, 100, 120, 400, 80]
    .forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

/** Check if sheet is missing new columns; add them if needed. */
function ensureNewColumns(sheet) {
  try {
    // Determine header row (row 3 for new format, row 1 for old format)
    let headerRow = 3;
    const a1 = String(sheet.getRange(1, 1).getValue()).trim();
    const a3 = String(sheet.getRange(3, 1).getValue()).trim();

    if (a1 === 'Logged At') headerRow = 1; // Old format
    if (a3 === 'Logged At') headerRow = 3; // New format

    const headerVals = sheet.getRange(headerRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerStr = headerVals.join('|');

    // Check if new columns exist
    const hasTenths = headerStr.includes('Tenths of Hours');
    const hasRunningTotal = headerStr.includes('Running Total');
    const hasBilled = headerStr.includes('Billed');
    let needsInsert = !hasTenths || !hasRunningTotal;

    if (needsInsert) {
      Logger.log('Sheet missing new columns; inserting...');
      // Insert two columns after Duration (column 8)
      sheet.insertColumns(9, 2);

      // Add headers at row 3 (or row 1 if old format)
      sheet.getRange(headerRow, 9).setValue('Tenths of Hours');
      sheet.getRange(headerRow, 10).setValue('Running Total');

      // Style the new headers to match existing headers
      sheet.getRange(headerRow, 9, 1, 2)
        .setFontWeight('bold')
        .setBackground('#1c2030')
        .setFontColor('#00c8a0');

      // Set column widths for the new columns
      sheet.setColumnWidth(9, 90);
      sheet.setColumnWidth(10, 90);
    }

    // Always add/refresh formulas on columns 9 and 10 (even if columns already existed)
    const lastRow = sheet.getLastRow();
    const dataStartRow = headerRow === 1 ? 2 : 4; // Row 2 for old format, row 4 for new format

    if (lastRow >= dataStartRow) {
      Logger.log('Adding formulas to rows ' + dataStartRow + ' to ' + lastRow);
      // Formula for Tenths of Hours (column 9): uses LOOKUP with MAX floor check
      const tenthsFormula = '=IF(H{ROW}="","",MAX(0.3,INT(H{ROW}/60)+LOOKUP(MOD(H{ROW},60),{0,1,7,13,19,25,31,37,43,49,55},{0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1})))';

      // Formula for Running Total (column 10): blank if Tenths is blank, otherwise sum by case
      const runningTotalFormula = '=IF(I{ROW}="","",SUMIF($B$' + dataStartRow + ':B{ROW},B{ROW},$I$' + dataStartRow + ':I{ROW}))';

      // Apply formulas to each data row
      for (let row = dataStartRow; row <= lastRow; row++) {
        sheet.getRange(row, 9).setFormula(tenthsFormula.replace(/{ROW}/g, row));
        sheet.getRange(row, 10).setFormula(runningTotalFormula.replace(/{ROW}/g, row));
      }
    }

    // Update Hours Used formula in D1 if sheet is in new format
    if (headerRow === 3) {
      const d1Formula = '=IFERROR(SUMIF(E4:E9999,"Investigator Service*",I4:I9999),0)';
      sheet.getRange(1, 4).setFormula(d1Formula);
      Logger.log('Updated Hours Used formula in D1');
    }

    // Add Billed column if missing
    if (!hasBilled) {
      const billedCol = sheet.getLastColumn() + 1;
      sheet.getRange(headerRow, billedCol).setValue('Billed');
      sheet.getRange(headerRow, billedCol)
        .setFontWeight('bold')
        .setBackground('#1c2030')
        .setFontColor('#00c8a0');
      sheet.setColumnWidth(billedCol, 80);
      Logger.log('Added Billed column at column ' + billedCol);
    }

    // Sort the sheet by Date (col 6) then Time (col 7)
    autoSortActivityLog(sheet);

    Logger.log('Columns and formulas are up to date');
  } catch(e) {
    Logger.log('ensureNewColumns failed: ' + e.message);
  }
}

/** Auto-sort Activity Log by Date (col 6) then Time (col 7). Preserves header rows. */
function autoSortActivityLog(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    // Skip if fewer than 5 rows (rows 1-3 are headers/totals, need at least 1 data row)
    if (lastRow < 5) return;

    // Data range: row 4 onwards (row 3 is headers, rows 1-2 are totals bar)
    // Sort by: Date (column 6) ascending, then Time (column 7) ascending
    const dataRange = sheet.getRange(4, 1, lastRow - 3, sheet.getLastColumn());
    dataRange.sort([6, 7]); // Column 6 = Date, Column 7 = Time
    Logger.log('Activity Log sorted by Date and Time');
  } catch(e) {
    Logger.log('autoSortActivityLog failed: ' + e.message);
  }
}

// ── PAE Summary tab ─────────────────────────────────────────────────────────

/**
 * PAE Summary layout:
 *   A1 = "Total Auth Hrs"   B1 = =SUM(B6:B50)
 *   A2 = "Case #"            B2 = caseNum
 *   A3 = "Client"            B3 = "Last, First"
 *   A4 = blank
 *   A5:J5 = PAE table headers
 *   Row 6+ = PAE data rows
 *   Row 56 = blank divider
 *   Row 57 = "OPDC Billing Chart" header
 *   Row 58 = chart column headers
 *   Rows 59-69 = 11 breakpoint rows
 */
function setupPaeSummarySheet(sheet, caseNum, clientLast, clientFirst) {
  sheet.clearContents();

  // ── Info block ─────────────────────────────────────────────────────────────
  sheet.getRange('A1').setValue('Total Auth Hrs');
  sheet.getRange('B1').setFormula('=SUM(B6:B50)');
  sheet.getRange('A2').setValue('Case #');
  sheet.getRange('B2').setValue(caseNum);
  sheet.getRange('A3').setValue('Client');
  sheet.getRange('B3').setValue(clientFirst ? clientLast + ', ' + clientFirst : clientLast);

  // Style info block
  const infoLabels = sheet.getRange('A1:A3');
  infoLabels.setFontWeight('bold').setFontColor('#5a8a7a').setFontSize(9);

  sheet.getRange('B1').setFontWeight('bold').setFontColor('#00c8a0').setFontSize(13);
  sheet.getRange('B2:B3').setFontColor('#000000').setFontWeight('bold').setFontSize(11);

  // Total auth row background
  sheet.getRange('A1:B1').setBackground('#0d1117');

  // ── PAE table headers (row 5) ──────────────────────────────────────────────
  const PAE_HEADERS = [
    'Auth #', 'Auth Hrs', 'Rate/Hr', 'Svc Amt', 'Travel Est',
    'Total Costs', 'Eff Date', 'Exp Date', 'County', 'Attorney'
  ];
  sheet.getRange(5, 1, 1, PAE_HEADERS.length).setValues([PAE_HEADERS]);
  const ph = sheet.getRange(5, 1, 1, PAE_HEADERS.length);
  ph.setFontWeight('bold').setBackground('#1c2030').setFontColor('#00c8a0');

  sheet.setFrozenRows(5);

  // ── OPDC Billing Chart (starting at row 57) ────────────────────────────────
  sheet.getRange(57, 1).setValue('OPDC Billing Chart')
       .setFontWeight('bold').setFontColor('#00c8a0').setBackground('#1c2030');
  sheet.getRange(57, 2).setBackground('#1c2030');

  sheet.getRange(58, 1).setValue('Minutes').setFontWeight('bold').setFontColor('#5a8a7a');
  sheet.getRange(58, 2).setValue('Tenths').setFontWeight('bold').setFontColor('#5a8a7a');

  const chartData = [
    [0, 0], [1, 0.1], [7, 0.2], [13, 0.3], [19, 0.4],
    [25, 0.5], [31, 0.6], [37, 0.7], [43, 0.8], [49, 0.9], [55, 1.0]
  ];
  sheet.getRange(59, 1, chartData.length, 2).setValues(chartData);
  sheet.getRange(59, 1, chartData.length, 1).setFontColor('#c8e8e0');
  sheet.getRange(59, 2, chartData.length, 1).setFontColor('#00c8a0');

  // Column widths
  [120, 90, 80, 90, 90, 90, 90, 90, 100, 160].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  Logger.log('setupPaeSummarySheet: complete');
}

/**
 * Add PAE rows to the PAE Summary sheet, skipping duplicates by authNumber.
 * Returns the count of rows actually added.
 */
function addPaesToSummarySheet(sheet, paes) {
  // PAE data lives in rows 6–50. Billing chart starts at row 57.
  // Scan only rows 6–50 so getLastRow() (which sees the chart rows) doesn't push PAEs to row 70+.
  const PAE_DATA_START = 6;
  const PAE_DATA_END   = 50;
  const paeZone = sheet.getRange(PAE_DATA_START, 1, PAE_DATA_END - PAE_DATA_START + 1, 1).getValues();

  const existingAuthNums = new Set();
  let lastPaeRow = PAE_DATA_START - 1; // one before first data slot

  paeZone.forEach((r, i) => {
    if (r[0] !== '' && r[0] !== null) {
      existingAuthNums.add(String(r[0]).trim());
      lastPaeRow = PAE_DATA_START + i;
    }
  });

  let added = 0;
  paes.forEach(p => {
    const authNum = String(p.authNumber || '').trim();
    if (authNum && existingAuthNums.has(authNum)) return; // skip duplicate

    const nextRow = lastPaeRow + 1 + added;
    sheet.getRange(nextRow, 1).setValue(authNum || '—');
    sheet.getRange(nextRow, 2).setValue(parseFloat(p.hours)        || '');
    sheet.getRange(nextRow, 3).setValue(parseFloat(p.approvedRate) || '');
    sheet.getRange(nextRow, 4).setValue(parseFloat(p.serviceAmount)|| '');
    sheet.getRange(nextRow, 5).setValue(parseFloat(p.travelCosts)  || '');
    sheet.getRange(nextRow, 6).setValue(parseFloat(p.totalCosts)   || '');
    sheet.getRange(nextRow, 7).setValue(p.effectiveDate  || '');
    sheet.getRange(nextRow, 8).setValue(p.expirationDate || '');
    sheet.getRange(nextRow, 9).setValue(p.county    || '');
    sheet.getRange(nextRow, 10).setValue(p.attorney || '');

    existingAuthNums.add(authNum);
    added++;
  });

  return added;
}

// ────────────────────────────────────────────────────────────────────────────

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
