// ============================================================
// Club Attendance App — Google Apps Script Backend
// Multi-club version — all clubs in one sheet, filtered by ClubID
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ============================================================

const ss = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  const result = handleRequest(e);
  const json = JSON.stringify(result);
  const cb = (e.parameter || {}).callback;
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const result = handleRequest(e);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleRequest(e) {
  const params   = e.parameter || {};
  const postData = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
  const p        = Object.keys(postData).length > 1 ? postData : params;
  const action   = p.action;

  let result;
  try {
    switch (action) {
      case 'checkUser':          result = checkUser(p.email); break;
      case 'getSettings':        result = getSettings(p.clubId); break;
      case 'getMembers':         result = getMembers(p.clubId); break;
      case 'getMeetings':        result = getMeetings(p.clubId); break;
      case 'addMeeting':         result = addMeeting(p); break;
      case 'updateMeeting':      result = updateMeeting(p); break;
      case 'deleteMeeting':      result = deleteMeeting(p.meetingId, p.clubId); break;
      case 'getAttendance':      result = getAttendance(p.meetingId); break;
      case 'saveAttendance': {
        if (typeof p.records === 'string') p.records = JSON.parse(p.records);
        result = saveAttendance(p); break;
      }
      case 'getTodayEvents':     result = getTodayEvents(p.clubId); break;
      case 'getMonthlyAnalysis': result = getMonthlyAnalysis(p.month, p.year, p.clubId); break;
      case 'addMember':          result = addMember(p); break;
      case 'updateMember':       result = updateMember(p); break;
      case 'deleteMember':       result = deleteMember(p.memberId, p.clubId); break;
      case 'bulkAddMembers': {
        if (typeof p.members === 'string') p.members = JSON.parse(p.members);
        result = bulkAddMembers(p); break;
      }
      case 'getUsers':           result = getUsers(p.clubId); break;
      case 'addUser':            result = addUser(p); break;
      case 'updateUser':         result = updateUser(p); break;
      case 'deleteUser':         result = deleteUser(p.email, p.clubId); break;
      case 'getClubs':           result = getClubs(); break;
      case 'addClub':            result = addClub(p); break;
      case 'updateClub':         result = updateClub(p); break;
      default: result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.toString() };
  }
  return result;
}

// ── Helpers ──────────────────────────────────────────────────
function colVal(row, headers, name, fallbackIdx) {
  const i = headers.indexOf(name);
  return i >= 0 ? row[i] : (fallbackIdx !== undefined && fallbackIdx >= 0 ? row[fallbackIdx] : '');
}

function rowClubId(row, headers) {
  const i = headers.indexOf('ClubID');
  if (i < 0) return 'CL001';
  return (row[i] || '').toString().trim() || 'CL001';
}

function ensureCol(sheet, headers, colName) {
  if (headers.indexOf(colName) >= 0) return headers;
  sheet.getRange(1, headers.length + 1).setValue(colName);
  headers.push(colName);
  return headers;
}

// ── Users ─────────────────────────────────────────────────────
function checkUser(email) {
  if (!email) return { success: false, error: 'No email provided' };
  const sheet   = ss.getSheetByName('Users');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const eIdx    = headers.indexOf('EmailID');
  const nIdx    = headers.indexOf('UserName');
  const rIdx    = headers.indexOf('Role');
  const aIdx    = headers.indexOf('Active');
  const cIdx    = headers.indexOf('ClubID');

  for (let i = 1; i < data.length; i++) {
    if ((data[i][eIdx] || '').toString().toLowerCase() !== email.toLowerCase()) continue;
    const active = data[i][aIdx];
    if (active === true || active === 'TRUE' || active === 'Y' || active === true) {
      return {
        success: true,
        user: {
          email:  data[i][eIdx],
          name:   data[i][nIdx],
          role:   data[i][rIdx],
          clubId: cIdx >= 0 ? ((data[i][cIdx] || 'CL001').toString()) : 'CL001'
        }
      };
    } else {
      return { success: false, error: 'Account inactive. Contact admin.' };
    }
  }
  return { success: false, error: 'Email not authorised. Contact admin.' };
}

function getUsers(clubId) {
  const sheet   = ss.getSheetByName('Users');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const users   = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][headers.indexOf('EmailID')]) continue;
    if (rowClubId(data[i], headers) !== (clubId || 'CL001')) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    users.push(obj);
  }
  return { success: true, users };
}

function addUser(payload) {
  if (!payload.email) return { success: false, error: 'Email required' };
  const sheet   = ss.getSheetByName('Users');
  const data    = sheet.getDataRange().getValues();
  let   headers = data[0];
  const eIdx    = headers.indexOf('EmailID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][eIdx] || '').toString().toLowerCase() === payload.email.toLowerCase())
      return { success: false, error: 'Email already exists' };
  }
  headers = ensureCol(sheet, headers, 'ClubID');
  const row = headers.map(h => {
    if (h === 'EmailID')  return payload.email;
    if (h === 'UserName') return payload.name || '';
    if (h === 'Role')     return payload.role || 'Member';
    if (h === 'Active')   return true;
    if (h === 'ClubID')   return payload.clubId || 'CL001';
    return '';
  });
  sheet.appendRow(row);
  return { success: true };
}

function updateUser(payload) {
  const sheet   = ss.getSheetByName('Users');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const eIdx    = headers.indexOf('EmailID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][eIdx] || '').toString().toLowerCase() !== payload.email.toLowerCase()) continue;
    if (rowClubId(data[i], headers) !== (payload.clubId || 'CL001')) continue;
    headers.forEach((h, j) => {
      if (h === 'UserName' && payload.name   !== undefined) sheet.getRange(i+1,j+1).setValue(payload.name);
      if (h === 'Role'     && payload.role   !== undefined) sheet.getRange(i+1,j+1).setValue(payload.role);
      if (h === 'Active'   && payload.active !== undefined) sheet.getRange(i+1,j+1).setValue(payload.active);
    });
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

function deleteUser(email, clubId) {
  const sheet   = ss.getSheetByName('Users');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const eIdx    = headers.indexOf('EmailID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][eIdx] || '').toString().toLowerCase() !== email.toLowerCase()) continue;
    if (rowClubId(data[i], headers) !== (clubId || 'CL001')) continue;
    sheet.deleteRow(i + 1);
    return { success: true };
  }
  return { success: false, error: 'User not found' };
}

// ── Settings ──────────────────────────────────────────────────
function getSettings(clubId) {
  const sheet   = ss.getSheetByName('Settings');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const clubIdx = headers.indexOf('ClubID');
  const cid     = clubId || 'CL001';
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    // If no ClubID column exists, return all (backward compat for RCBC)
    if (clubIdx < 0 || rowClubId(data[i], headers) === cid) {
      settings[data[i][0]] = data[i][1];
    }
  }
  return { success: true, settings };
}

// ── Members ───────────────────────────────────────────────────
function getMembers(clubId) {
  const sheet   = ss.getSheetByName('MemberMaster');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const cid     = clubId || 'CL001';
  const clubIdx = headers.indexOf('ClubID');
  const members = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (clubIdx >= 0 && rowClubId(row, headers) !== cid) continue;
    const mid = colVal(row, headers, 'MemberID', 0);
    if (!mid) continue;
    members.push({
      memberId:        mid.toString(),
      memberName:      colVal(row, headers, "MEMBER'S NAME",              1)  || colVal(row, headers, 'MemberName', -1),
      spouseName:      colVal(row, headers, "NAME OF (R'ANN)",            2)  || colVal(row, headers, 'SpouseName', -1),
      memberEmail:     colVal(row, headers, 'EMAIL ID (Rotarian)',        3)  || colVal(row, headers, 'MemberEmail', -1),
      spouseEmail:     colVal(row, headers, "EMAIL ID (R'ann)",           4)  || colVal(row, headers, 'SpouseEmail', -1),
      memberMobile:    colVal(row, headers, 'MOBILE NUMBER (Rotarian)',   5)  || colVal(row, headers, 'MemberMobile', -1),
      spouseMobile:    colVal(row, headers, "MOBILE NUMBER (R'ann)",      6)  || colVal(row, headers, 'SpouseMobile', -1),
      memberBirthDate: colVal(row, headers, 'BIRTH DATE (Rotarian)',      7)  || colVal(row, headers, 'MemberBirthDate', -1),
      spouseBirthDate: colVal(row, headers, "BIRTH DATE (R'Ann)",         8)  || colVal(row, headers, 'SpouseBirthDate', -1),
      annet1Name:      colVal(row, headers, 'NAME (Annet-1)',             9)  || colVal(row, headers, 'Kid1Name', -1),
      annet1Birth:     colVal(row, headers, 'BIRTH DATE (Annet-1)',       10) || colVal(row, headers, 'Kid1BirthDate', -1),
      annet2Name:      colVal(row, headers, 'NAME (Annet-2)',             11) || colVal(row, headers, 'Kid2Name', -1),
      annet2Birth:     colVal(row, headers, 'BIRTH DATE (Annet-2)',       12) || colVal(row, headers, 'Kid2BirthDate', -1),
      weddingDate:     colVal(row, headers, 'WeddingDate',               -1),
      boardMember:     (colVal(row, headers, 'BoardMember', 14) || '').toString().toUpperCase() === 'Y',
    });
  }
  return { success: true, members };
}

function _nextMemberId(data, headers, clubId) {
  const clubIdx = headers.indexOf('ClubID');
  const idIdx   = headers.indexOf('MemberID');
  const prefix  = (clubId || 'CL001').replace('CL', 'M');
  let lastNum   = 0;
  for (let i = 1; i < data.length; i++) {
    if (clubIdx >= 0 && rowClubId(data[i], headers) !== (clubId || 'CL001')) continue;
    const id = (data[i][idIdx] || '').toString();
    if (id.startsWith(prefix)) {
      const n = parseInt(id.replace(prefix, '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }
  return prefix + String(lastNum + 1).padStart(4, '0');
}

function _memberRow(headers, m, clubId, memberId) {
  const bm = (m.boardMember === true || (m.boardMember || '').toString().toUpperCase() === 'Y') ? 'Y' : '';
  const map = {
    'MemberID': memberId,
    "MEMBER'S NAME": m.memberName || '', 'MemberName': m.memberName || '',
    "NAME OF (R'ANN)": m.spouseName || '', 'SpouseName': m.spouseName || '',
    'EMAIL ID (Rotarian)': m.memberEmail || '', 'MemberEmail': m.memberEmail || '',
    "EMAIL ID (R'ann)": m.spouseEmail || '', 'SpouseEmail': m.spouseEmail || '',
    'MOBILE NUMBER (Rotarian)': m.memberMobile || '', 'MemberMobile': m.memberMobile || '',
    "MOBILE NUMBER (R'ann)": m.spouseMobile || '', 'SpouseMobile': m.spouseMobile || '',
    'BIRTH DATE (Rotarian)': m.memberBirthDate || '', 'MemberBirthDate': m.memberBirthDate || '',
    "BIRTH DATE (R'Ann)": m.spouseBirthDate || '', 'SpouseBirthDate': m.spouseBirthDate || '',
    'NAME (Annet-1)': m.kid1Name || m.annet1Name || '', 'Kid1Name': m.kid1Name || m.annet1Name || '',
    'BIRTH DATE (Annet-1)': m.kid1BirthDate || m.annet1Birth || '', 'Kid1BirthDate': m.kid1BirthDate || m.annet1Birth || '',
    'NAME (Annet-2)': m.kid2Name || m.annet2Name || '', 'Kid2Name': m.kid2Name || m.annet2Name || '',
    'BIRTH DATE (Annet-2)': m.kid2BirthDate || m.annet2Birth || '', 'Kid2BirthDate': m.kid2BirthDate || m.annet2Birth || '',
    'WeddingDate': m.weddingDate || '',
    'BoardMember': bm,
    'ClubID': clubId || 'CL001',
  };
  return headers.map(h => map[h] !== undefined ? map[h] : '');
}

function addMember(payload) {
  const sheet   = ss.getSheetByName('MemberMaster');
  let   data    = sheet.getDataRange().getValues();
  let   headers = data[0];
  headers = ensureCol(sheet, headers, 'ClubID');
  const memberId = _nextMemberId(data, headers, payload.clubId);
  sheet.appendRow(_memberRow(headers, payload, payload.clubId, memberId));
  return { success: true, memberId };
}

function updateMember(payload) {
  const sheet   = ss.getSheetByName('MemberMaster');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('MemberID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() !== payload.memberId) continue;
    if (rowClubId(data[i], headers) !== (payload.clubId || 'CL001')) continue;
    const row = _memberRow(headers, payload, payload.clubId, payload.memberId);
    sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
    return { success: true };
  }
  return { success: false, error: 'Member not found' };
}

function deleteMember(memberId, clubId) {
  const sheet   = ss.getSheetByName('MemberMaster');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('MemberID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() !== memberId) continue;
    if (rowClubId(data[i], headers) !== (clubId || 'CL001')) continue;
    sheet.deleteRow(i + 1);
    return { success: true };
  }
  return { success: false, error: 'Member not found' };
}

function bulkAddMembers(payload) {
  const sheet   = ss.getSheetByName('MemberMaster');
  let   data    = sheet.getDataRange().getValues();
  let   headers = data[0];
  headers = ensureCol(sheet, headers, 'ClubID');
  const clubId  = payload.clubId || 'CL001';
  const mode    = payload.mode   || 'replace';

  if (mode === 'replace') {
    const fresh   = sheet.getDataRange().getValues();
    const fH      = fresh[0];
    for (let i = fresh.length - 1; i >= 1; i--) {
      if (rowClubId(fresh[i], fH) === clubId) sheet.deleteRow(i + 1);
    }
  }

  const freshData    = sheet.getDataRange().getValues();
  const freshHeaders = freshData[0];
  let   lastNum      = 0;
  const prefix       = clubId.replace('CL', 'M');
  const idIdx        = freshHeaders.indexOf('MemberID');
  for (let i = 1; i < freshData.length; i++) {
    if (rowClubId(freshData[i], freshHeaders) !== clubId) continue;
    const id = (freshData[i][idIdx] || '').toString();
    if (id.startsWith(prefix)) {
      const n = parseInt(id.replace(prefix, '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }

  const rows = (payload.members || []).map(m => {
    lastNum++;
    return _memberRow(freshHeaders, m, clubId, prefix + String(lastNum).padStart(4, '0'));
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, freshHeaders.length).setValues(rows);
  }
  return { success: true, count: rows.length };
}

// ── Meetings ──────────────────────────────────────────────────
function getMeetings(clubId) {
  const sheet   = ss.getSheetByName('Meetings');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const clubIdx = headers.indexOf('ClubID');
  const cid     = clubId || 'CL001';
  const meetings = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (clubIdx >= 0 && rowClubId(data[i], headers) !== cid) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    meetings.push(obj);
  }
  return { success: true, meetings };
}

function addMeeting(payload) {
  const sheet   = ss.getSheetByName('Meetings');
  let   data    = sheet.getDataRange().getValues();
  let   headers = data[0];
  headers = ensureCol(sheet, headers, 'ClubID');
  const clubId  = payload.clubId || 'CL001';

  let lastNum = 0;
  for (let i = 1; i < data.length; i++) {
    if (rowClubId(data[i], headers) !== clubId) continue;
    if ((data[i][0] || '').toString().startsWith('MT')) {
      const n = parseInt(data[i][0].toString().replace('MT', '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }
  const meetingId = 'MT' + String(lastNum + 1).padStart(4, '0');
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');

  const freshHeaders = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const row = freshHeaders.map(h => {
    if (h === 'MeetingID')     return meetingId;
    if (h === 'MeetingDate')   return payload.meetingDate;
    if (h === 'MeetingTime')   return payload.meetingTime || '';
    if (h === 'MeetingType')   return payload.meetingType || '';
    if (h === 'MeetingSubName')return payload.meetingSubName || '';
    if (h === 'Location')      return payload.location || '';
    if (h === 'Remarks')       return payload.remarks || '';
    if (h === 'CreatedBy')     return payload.createdBy || '';
    if (h === 'CreatedOn')     return now;
    if (h === 'ClubID')        return clubId;
    return '';
  });
  sheet.appendRow(row);
  return { success: true, meetingId };
}

function updateMeeting(payload) {
  const sheet   = ss.getSheetByName('Meetings');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('MeetingID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() !== payload.meetingId) continue;
    const set = (name, val) => { const j = headers.indexOf(name); if (j >= 0) sheet.getRange(i+1,j+1).setValue(val); };
    set('MeetingDate',    payload.meetingDate);
    set('MeetingTime',    payload.meetingTime || '');
    set('MeetingType',    payload.meetingType);
    set('MeetingSubName', payload.meetingSubName || '');
    set('Location',       payload.location || '');
    set('Remarks',        payload.remarks  || '');
    return { success: true };
  }
  return { success: false, error: 'Meeting not found' };
}

function deleteMeeting(meetingId) {
  const sheet   = ss.getSheetByName('Meetings');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('MeetingID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() === meetingId) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Meeting not found' };
}

// ── Attendance ────────────────────────────────────────────────
function getAttendance(meetingId) {
  if (!meetingId) return { success: false, error: 'No meetingId' };
  const sheet   = ss.getSheetByName('Attendance');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('MeetingID')] !== meetingId) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    if (!('MemberConfirmed' in obj)) obj.MemberConfirmed = data[i][8] || false;
    if (!('SpouseConfirmed'  in obj)) obj.SpouseConfirmed  = data[i][9] || false;
    rows.push(obj);
  }
  return { success: true, attendance: rows };
}

function saveAttendance(payload) {
  const sheet   = ss.getSheetByName('Attendance');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idxMID  = headers.indexOf('MeetingID');
  const idxMem  = headers.indexOf('MemberID');

  const existingMap = {};
  for (let i = 1; i < data.length; i++) {
    existingMap[data[i][idxMID] + '|' + data[i][idxMem]] = i + 1;
  }

  let lastNum = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().startsWith('AT')) {
      const n = parseInt(data[i][0].toString().replace('AT', '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  payload.records.forEach(rec => {
    const key = payload.meetingId + '|' + rec.memberId;
    const vals = [payload.meetingId, rec.memberId, rec.memberPresent,
      rec.spousePresent, rec.kidsCount || 0, payload.updatedBy, now,
      rec.memberConfirmed || false, rec.spouseConfirmed || false];
    if (existingMap[key]) {
      sheet.getRange(existingMap[key], 2, 1, 9).setValues([vals]);
    } else {
      lastNum++;
      sheet.appendRow(['AT' + String(lastNum).padStart(4,'0'), ...vals]);
    }
  });
  return { success: true };
}

// ── Today Events ──────────────────────────────────────────────
function getTodayEvents(clubId) {
  const members = getMembers(clubId || 'CL001').members;
  const today   = new Date();
  const months  = ['january','february','march','april','may','june',
                   'july','august','september','october','november','december'];

  function matchesDay(dateStr) {
    if (!dateStr) return false;
    const ds = dateStr.toString().toLowerCase().replace(/st|nd|rd|th/g,'').trim();
    const parts = ds.split(/[\s\/\-]/);
    if (parts.length < 2) return false;
    let day, month;
    if (isNaN(parts[1])) { day = parseInt(parts[0]); month = months.indexOf(parts[1]) + 1; }
    else { day = parseInt(parts[0]); month = parseInt(parts[1]); }
    return day === today.getDate() && month === (today.getMonth() + 1);
  }

  const birthdays = [];
  members.forEach(m => {
    if (matchesDay(m.memberBirthDate)) birthdays.push({ name: m.memberName, type: 'member', mobile: m.memberMobile });
    if (matchesDay(m.spouseBirthDate)) birthdays.push({ name: m.spouseName,  type: 'spouse', mobile: m.spouseMobile });
    if (matchesDay(m.annet1Birth))     birthdays.push({ name: m.annet1Name,  type: 'annet',  mobile: m.memberMobile });
  });
  return { success: true, birthdays, anniversaries: [] };
}

// ── Monthly Analysis ──────────────────────────────────────────
function getMonthlyAnalysis(month, year, clubId) {
  month  = parseInt(month); year = parseInt(year);
  if (!month || !year) return { success: false, error: 'month and year required' };
  clubId = clubId || 'CL001';
  const tz = Session.getScriptTimeZone();

  const meetSheet   = ss.getSheetByName('Meetings');
  const meetData    = meetSheet.getDataRange().getValues();
  const meetHeaders = meetData[0];
  const meetClubIdx = meetHeaders.indexOf('ClubID');

  const monthMeetings = [];
  for (let i = 1; i < meetData.length; i++) {
    const row = meetData[i];
    if (!row[0]) continue;
    if (meetClubIdx >= 0 && rowClubId(row, meetHeaders) !== clubId) continue;
    const d = (row[1] instanceof Date) ? row[1] : new Date(row[1]);
    if (isNaN(d.getTime())) continue;
    if ((d.getMonth()+1) === month && d.getFullYear() === year) {
      monthMeetings.push({
        meetingId: row[0].toString(),
        date:      Utilities.formatDate(d, tz, 'dd-MMM-yyyy'),
        dateShort: Utilities.formatDate(d, tz, 'dd MMM'),
        type:      (row[3] || '').toString(), ts: d.getTime()
      });
    }
  }
  monthMeetings.sort((a,b) => a.ts - b.ts);

  const attMap = {};
  if (monthMeetings.length) {
    const inScope = {};
    monthMeetings.forEach(m => { inScope[m.meetingId] = true; });
    const attData = ss.getSheetByName('Attendance').getDataRange().getValues();
    for (let j = 1; j < attData.length; j++) {
      const ar  = attData[j];
      const mid = (ar[1] || '').toString();
      if (!inScope[mid]) continue;
      const memId = (ar[2] || '').toString();
      if (!attMap[mid]) attMap[mid] = {};
      attMap[mid][memId] = {
        memberPresent: ar[3] === true || ar[3] === 'TRUE',
        spousePresent: ar[4] === true || ar[4] === 'TRUE'
      };
    }
  }

  const memberReports = getMembers(clubId).members.map(m => ({
    memberId:      m.memberId, memberName: m.memberName,
    mobile:        m.memberMobile, isBoardMember: m.boardMember,
    attendance:    monthMeetings
      .filter(mt => m.boardMember || mt.type !== 'Board')
      .map(mt => {
        const rec = (attMap[mt.meetingId] || {})[m.memberId] || {};
        return { meetingId: mt.meetingId, date: mt.date, dateShort: mt.dateShort, type: mt.type,
                 memberPresent: rec.memberPresent || false, spousePresent: rec.spousePresent || false };
      })
  }));

  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  return { success: true, month, year, monthName: monthNames[month-1],
           meetings: monthMeetings.map(m => ({ meetingId: m.meetingId, date: m.date, type: m.type })),
           memberReports };
}

// ── Clubs (Super Admin) ───────────────────────────────────────
function getClubs() {
  let sheet = ss.getSheetByName('Clubs');
  if (!sheet) return { success: true, clubs: [] };
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const clubs   = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    clubs.push(obj);
  }
  return { success: true, clubs };
}

function addClub(payload) {
  let sheet = ss.getSheetByName('Clubs');
  if (!sheet) {
    sheet = ss.insertSheet('Clubs');
    sheet.appendRow(['ClubID','ClubName','City','AdminEmail','Active','CreatedOn']);
  }
  const data = sheet.getDataRange().getValues();
  let lastNum = 0;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().startsWith('CL')) {
      const n = parseInt(data[i][0].toString().replace('CL','')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }
  const clubId  = 'CL' + String(lastNum + 1).padStart(3, '0');
  const now     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  const headers = data[0];
  const row     = headers.map(h => {
    if (h === 'ClubID')     return clubId;
    if (h === 'ClubName')   return payload.clubName  || '';
    if (h === 'City')       return payload.city       || '';
    if (h === 'AdminEmail') return payload.adminEmail || '';
    if (h === 'Active')     return true;
    if (h === 'CreatedOn')  return now;
    return '';
  });
  sheet.appendRow(row);

  // Auto-add admin user
  if (payload.adminEmail) {
    addUser({ email: payload.adminEmail, name: payload.adminName || '', role: 'Admin', clubId });
  }

  // Add default settings row
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet) {
    const sHeaders = settingsSheet.getDataRange().getValues()[0];
    ensureCol(settingsSheet, sHeaders, 'ClubID');
    const freshH = settingsSheet.getRange(1,1,1,settingsSheet.getLastColumn()).getValues()[0];
    settingsSheet.appendRow(freshH.map(h => {
      if (h === 'ClubID') return clubId;
      if (freshH.indexOf(h) === 0) return 'club name';
      if (freshH.indexOf(h) === 1) return payload.clubName || '';
      return '';
    }));
  }

  return { success: true, clubId };
}

function updateClub(payload) {
  const sheet = ss.getSheetByName('Clubs');
  if (!sheet) return { success: false, error: 'Clubs sheet not found' };
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('ClubID');
  for (let i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString() !== payload.clubId) continue;
    headers.forEach((h, j) => {
      if (h === 'ClubName' && payload.clubName !== undefined) sheet.getRange(i+1,j+1).setValue(payload.clubName);
      if (h === 'City'     && payload.city     !== undefined) sheet.getRange(i+1,j+1).setValue(payload.city);
      if (h === 'Active'   && payload.active   !== undefined) sheet.getRange(i+1,j+1).setValue(payload.active);
    });
    return { success: true };
  }
  return { success: false, error: 'Club not found' };
}
