// ============================================================
// Club Attendance App — Google Apps Script Backend
// Deploy as Web App: Execute as "Me", Access "Anyone"
// ============================================================

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const ss = SpreadsheetApp.getActiveSpreadsheet();

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const params = e.parameter || {};
  const postData = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
  const action = params.action || postData.action;

  let result;
  try {
    switch (action) {
      case 'checkUser':       result = checkUser(params.email || postData.email); break;
      case 'getSettings':     result = getSettings(); break;
      case 'getMembers':      result = getMembers(); break;
      case 'getMeetings':     result = getMeetings(); break;
      case 'addMeeting':      result = addMeeting(postData); break;
      case 'getAttendance':   result = getAttendance(params.meetingId || postData.meetingId); break;
      case 'saveAttendance':  result = saveAttendance(postData); break;
      case 'getTodayEvents':  result = getTodayEvents(); break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Users ──────────────────────────────────────────────────
function checkUser(email) {
  if (!email) return { success: false, error: 'No email provided' };
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailIdx = headers.indexOf('EmailID');
  const nameIdx  = headers.indexOf('UserName');
  const roleIdx  = headers.indexOf('Role');
  const activeIdx = headers.indexOf('Active');

  for (let i = 1; i < data.length; i++) {
    if (data[i][emailIdx] && data[i][emailIdx].toString().toLowerCase() === email.toLowerCase()) {
      if (data[i][activeIdx] === true || data[i][activeIdx] === 'TRUE') {
        return {
          success: true,
          user: {
            email: data[i][emailIdx],
            name:  data[i][nameIdx],
            role:  data[i][roleIdx]
          }
        };
      } else {
        return { success: false, error: 'Account inactive. Contact admin.' };
      }
    }
  }
  return { success: false, error: 'Email not authorised. Contact admin.' };
}

// ── Settings ───────────────────────────────────────────────
function getSettings() {
  const sheet = ss.getSheetByName('Settings');
  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) settings[data[i][0]] = data[i][1];
  }
  return { success: true, settings };
}

// ── Members ────────────────────────────────────────────────
function getMembers() {
  const sheet = ss.getSheetByName('MemberMaster');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idx = (name) => headers.indexOf(name);

  const members = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[idx('MemberID')]) continue;
    members.push({
      memberId:        row[idx('MemberID')],
      memberName:      row[idx("MEMBER'S NAME")] || row[idx('MEMBERS NAME')] || row[1],
      spouseName:      row[idx("NAME OF (R'ANN)")] || row[idx('SPOUSE NAME')] || row[2],
      memberEmail:     row[idx('EMAIL ID (Rotarian)')] || row[3],
      spouseEmail:     row[idx("EMAIL ID (R'ann)")] || row[4],
      memberMobile:    row[idx('MOBILE NUMBER (Rotarian)')] || row[5],
      spouseMobile:    row[idx("MOBILE NUMBER (R'ann)")] || row[6],
      memberBirthDate: row[idx('BIRTH DATE (Rotarian)')] || row[7],
      spouseBirthDate: row[idx("BIRTH DATE (R'Ann)")] || row[8],
      annet1Name:      row[idx('NAME (Annet-1)')] || row[9],
      annet1Birth:     row[idx('BIRTH DATE (Annet-1)')] || row[10],
      annet2Name:      row[idx('NAME (Annet-2)')] || row[11],
    });
  }
  return { success: true, members };
}

// ── Meetings ───────────────────────────────────────────────
function getMeetings() {
  const sheet = ss.getSheetByName('Meetings');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const meetings = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    meetings.push(obj);
  }
  return { success: true, meetings };
}

function addMeeting(payload) {
  const sheet = ss.getSheetByName('Meetings');
  const data = sheet.getDataRange().getValues();

  // Generate MeetingID
  let lastNum = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().startsWith('MT')) {
      const n = parseInt(data[i][0].toString().replace('MT', '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }
  const meetingId = 'MT' + String(lastNum + 1).padStart(4, '0');

  const now = new Date();
  sheet.appendRow([
    meetingId,
    payload.meetingDate,
    payload.meetingTime,
    payload.meetingType,
    payload.meetingSubName || '',
    payload.location || '',
    payload.remarks || '',
    payload.createdBy,
    Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd-MMM-yyyy')
  ]);

  return { success: true, meetingId };
}

// ── Attendance ─────────────────────────────────────────────
function getAttendance(meetingId) {
  if (!meetingId) return { success: false, error: 'No meetingId' };
  const sheet = ss.getSheetByName('Attendance');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('MeetingID')] === meetingId) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = data[i][j]);
      rows.push(obj);
    }
  }
  return { success: true, attendance: rows };
}

function saveAttendance(payload) {
  // payload.meetingId, payload.records (array), payload.updatedBy
  const sheet = ss.getSheetByName('Attendance');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxAID  = headers.indexOf('AttendanceID');
  const idxMID  = headers.indexOf('MeetingID');
  const idxMemID = headers.indexOf('MemberID');

  // Build lookup of existing rows: meetingId+memberId → row index
  const existingMap = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][idxMID] + '|' + data[i][idxMemID];
    existingMap[key] = i + 1; // 1-based sheet row
  }

  // Generate next AttendanceID base
  let lastNum = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().startsWith('AT')) {
      const n = parseInt(data[i][0].toString().replace('AT', '')) || 0;
      if (n > lastNum) lastNum = n;
    }
  }

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MMM-yyyy');

  payload.records.forEach(rec => {
    const key = payload.meetingId + '|' + rec.memberId;
    const rowData = [
      null, // AttendanceID placeholder
      payload.meetingId,
      rec.memberId,
      rec.memberPresent,
      rec.spousePresent,
      rec.kidsCount || 0,
      payload.updatedBy,
      now
    ];

    if (existingMap[key]) {
      // Update existing row (keep AttendanceID)
      const rowNum = existingMap[key];
      sheet.getRange(rowNum, 2, 1, 7).setValues([[
        payload.meetingId,
        rec.memberId,
        rec.memberPresent,
        rec.spousePresent,
        rec.kidsCount || 0,
        payload.updatedBy,
        now
      ]]);
    } else {
      // Insert new row
      lastNum++;
      const attId = 'AT' + String(lastNum).padStart(4, '0');
      rowData[0] = attId;
      sheet.appendRow(rowData);
    }
  });

  return { success: true, message: 'Attendance saved.' };
}

// ── Today's Birthdays / Anniversaries ─────────────────────
function getTodayEvents() {
  const members = getMembers().members;
  const today = new Date();
  const todayStr = (today.getDate()) + '/' + (today.getMonth() + 1);

  function matchesDay(dateStr) {
    if (!dateStr) return false;
    // Expected format: "18th February" or "18/02" etc
    const months = ['january','february','march','april','may','june',
                    'july','august','september','october','november','december'];
    const ds = dateStr.toString().toLowerCase().replace(/st|nd|rd|th/g,'').trim();
    const parts = ds.split(/[\s\/\-]/);
    let day, month;
    if (parts.length >= 2) {
      // Try "18 february"
      if (isNaN(parts[1])) {
        day = parseInt(parts[0]);
        month = months.indexOf(parts[1]) + 1;
      } else {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]);
      }
    }
    return day === today.getDate() && month === (today.getMonth() + 1);
  }

  const birthdays = [];
  const anniversaries = [];

  members.forEach(m => {
    if (matchesDay(m.memberBirthDate)) birthdays.push({ name: m.memberName, type: 'member', mobile: m.memberMobile });
    if (matchesDay(m.spouseBirthDate)) birthdays.push({ name: m.spouseName, type: 'spouse', mobile: m.spouseMobile });
    if (matchesDay(m.annet1Birth))     birthdays.push({ name: m.annet1Name, type: 'annet', mobile: m.memberMobile });
  });

  return { success: true, birthdays, anniversaries };
}
