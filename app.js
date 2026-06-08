// ============================================================
// Club Attendance App — app.js
// ============================================================

// ── CONFIG — Update GAS_URL after deploying your Apps Script ──
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyWDLfdX-mLBw3WDIjNVNUQBokq_g3X7L0fNqAiOjjMCSc1HEWsl0WfpqvRhGGgnY2V/exec';

// ── State ──────────────────────────────────────────────────
const State = {
  user: null,
  clubName: 'Club',
  members: [],
  meetings: [],
  attendance: {},        // meetingId → { memberId → record }
  currentMeeting: null,
  attendanceEdited: {},  // memberId → { memberPresent, spousePresent, kidsCount }
  todayEvents: { birthdays: [], anniversaries: [] },
  online: navigator.onLine,
  analysisData: null,
  meetingStarted: true,
};

// ── Local Storage helpers ──────────────────────────────────
const LS = {
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  get: (k)    => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  del: (k)    => localStorage.removeItem(k),
};

// ── API helper (JSONP — bypasses GAS redirect CORS block) ──
function api(params) {
  return new Promise((resolve, reject) => {
    const cbName = '__gasCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const u = new URL(GAS_URL);

    Object.entries(params).forEach(([k, v]) => {
      u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });
    u.searchParams.set('callback', cbName);

    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 20000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      const s = document.getElementById(cbName);
      if (s) s.remove();
    }

    window[cbName] = (data) => { cleanup(); resolve(data); };

    const script = document.createElement('script');
    script.id = cbName;
    script.src = u.toString();
    script.onerror = () => { cleanup(); reject(new Error('Failed to reach server')); };
    document.head.appendChild(script);
  });
}

// ── UI helpers ─────────────────────────────────────────────
function showLoader(msg = 'Loading…') {
  document.getElementById('loader-msg').textContent = msg;
  document.getElementById('loader').classList.add('show');
}
function hideLoader() {
  document.getElementById('loader').classList.remove('show');
}

let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3000);
}

function navigateTo(pageId, title = '') {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

  // Update top bar
  const backBtn = document.querySelector('.back-btn');
  const h1 = document.querySelector('.top-bar h1');
  const isRoot = ['page-home', 'page-meetings', 'page-reminder'].includes(pageId);

  backBtn.classList.toggle('visible', !isRoot);
  h1.textContent = title || pageTitles[pageId] || 'Club Attendance';

  // Bottom nav highlight
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === pageId);
  });

  window._currentPage = pageId;
}

const pageTitles = {
  'page-home':      'Home',
  'page-meetings':  'Meetings',
  'page-attendance':'Attendance',
  'page-reminder':  'Reminders',
  'page-analysis':  'Analysis',
};

// ── Back button ────────────────────────────────────────────
document.querySelector('.back-btn').addEventListener('click', () => {
  if (window._currentPage === 'page-analysis') {
    navigateTo('page-home');
    renderHome();
  } else {
    navigateTo('page-meetings');
  }
});

// ── Bottom nav ─────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    navigateTo(page);
    if (page === 'page-home')     renderHome();
    if (page === 'page-meetings') renderMeetings();
    if (page === 'page-reminder') renderReminder();
  });
});

// ── LOGIN ──────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { toast('Please enter your email', 'error'); return; }

  showLoader('Checking access…');
  try {
    const result = await api({ action: 'checkUser', email });
    if (result.success) {
      State.user = result.user;
      LS.set('user', State.user);
      await initApp();
    } else {
      toast(result.error || 'Access denied', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
  hideLoader();
});

document.getElementById('login-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

// ── INIT APP ───────────────────────────────────────────────
async function initApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Step 1 — Load cache instantly so the app is usable immediately
  const cachedMembers  = LS.get('members');
  const cachedMeetings = LS.get('meetings');
  const cachedClubName = LS.get('clubName');
  const hasCached      = cachedMembers || cachedMeetings;

  if (cachedMembers)  State.members  = cachedMembers;
  if (cachedMeetings) State.meetings = cachedMeetings;
  if (cachedClubName) {
    State.clubName = cachedClubName;
    document.querySelector('.club-badge').textContent = cachedClubName;
  }

  document.getElementById('user-pill').textContent = State.user.name || State.user.email;

  if (hasCached) {
    // Show home right away — no blocking loader
    navigateTo('page-home');
    renderHome();
  } else {
    showLoader('Loading data…');
  }

  // Step 2 — Fetch all data in parallel in background
  try {
    const [settingsRes, membersRes, meetingsRes, eventsRes] = await Promise.all([
      api({ action: 'getSettings' }),
      api({ action: 'getMembers' }),
      api({ action: 'getMeetings' }),
      api({ action: 'getTodayEvents' }),
    ]);

    if (settingsRes.success) {
      const settingsKey = Object.keys(settingsRes.settings)
        .find(k => k.trim().toLowerCase() === 'club name');
      State.clubName = (settingsKey ? settingsRes.settings[settingsKey] : '') || 'Club';
      document.querySelector('.club-badge').textContent = State.clubName;
      LS.set('clubName', State.clubName);
      LS.set('settings', settingsRes.settings);
    }
    if (membersRes.success) {
      State.members = membersRes.members;
      LS.set('members', State.members);
    }
    if (meetingsRes.success) {
      State.meetings = meetingsRes.meetings;
      LS.set('meetings', State.meetings);
    }
    if (eventsRes.success) {
      State.todayEvents = eventsRes;
    }

    // Silently refresh home with latest data
    if (window._currentPage === 'page-home') renderHome();

  } catch (err) {
    if (!hasCached) {
      State.members  = [];
      State.meetings = [];
      toast('Cannot connect — check your network', 'error');
    }
  }

  hideLoader();
  if (!hasCached) {
    navigateTo('page-home');
    renderHome();
  }
}

// ── ONLINE / OFFLINE ───────────────────────────────────────
window.addEventListener('online',  () => { State.online = true;  toast('Back online ✓', 'success'); });
window.addEventListener('offline', () => { State.online = false; toast('You are offline', 'error'); });

// ── HOME PAGE ──────────────────────────────────────────────
function renderHome() {
  const today = new Date();
  document.getElementById('home-date').textContent = today.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Stats
  document.getElementById('home-member-count').textContent = State.members.length;
  document.getElementById('home-meeting-count').textContent = State.meetings.length;

  // Birthdays today
  const bdayList = document.getElementById('bday-list');
  const bdayBanner = document.getElementById('bday-banner');
  const { birthdays } = State.todayEvents;

  if (birthdays && birthdays.length) {
    bdayBanner.style.display = 'block';
    bdayList.innerHTML = birthdays.map(b => `
      <div class="event-person">
        <div>
          <div class="name">🎂 ${b.name}</div>
        </div>
        <span class="type-badge">${b.type}</span>
      </div>
    `).join('');
  } else {
    bdayBanner.style.display = 'none';
  }

  // Club name — big and centered
  const clubNameEl = document.getElementById('home-club-name');
  if (clubNameEl) clubNameEl.textContent = State.clubName;

  // Admin-only section
  const isAdmin = State.user && (State.user.role || '').toLowerCase() === 'admin';
  const _ah = document.getElementById('admin-section-heading');
  const _aa = document.getElementById('admin-actions');
  if (_ah) _ah.style.display = isAdmin ? '' : 'none';
  if (_aa) _aa.style.display = isAdmin ? '' : 'none';

  // Recent meeting
  const recent = [...State.meetings].sort((a, b) =>
    new Date(b.MeetingDate) - new Date(a.MeetingDate))[0];
  if (recent) {
    document.getElementById('recent-meeting-card').style.display = 'block';
    document.getElementById('recent-meeting-name').textContent =
      recent.MeetingType + (recent.MeetingSubName ? ' — ' + recent.MeetingSubName : '');
    document.getElementById('recent-meeting-date').textContent = recent.MeetingDate + ' ' + (recent.MeetingTime || '');
    document.getElementById('goto-recent-attendance').onclick = () => {
      openAttendance(recent);
    };
  } else {
    document.getElementById('recent-meeting-card').style.display = 'none';
  }
}

// ── MEETINGS PAGE ──────────────────────────────────────────
function renderMeetings() {
  const list = document.getElementById('meetings-list');
  const typeColors = { Project: 'project', Fellowship: 'fellowship', Speaker: 'speaker', MOM: 'mom' };

  if (!State.meetings.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No meetings yet.<br>Tap + to add one.</p></div>`;
    return;
  }

  const sorted = [...State.meetings].sort((a, b) =>
    new Date(b.MeetingDate) - new Date(a.MeetingDate));

  list.innerHTML = sorted.map(m => `
    <div class="meeting-item" data-id="${m.MeetingID}">
      <div class="meeting-dot ${typeColors[m.MeetingType] || 'project'}"></div>
      <div class="meeting-info">
        <div class="meeting-name">${m.MeetingType}${m.MeetingSubName ? ' — ' + m.MeetingSubName : ''}</div>
        <div class="meeting-meta">${m.MeetingDate}${m.MeetingTime ? ' · ' + m.MeetingTime : ''}${m.Location ? ' · ' + m.Location : ''}</div>
      </div>
      <div class="meeting-actions" onclick="event.stopPropagation()">
        <button class="mtg-edit-btn" data-id="${m.MeetingID}" title="Edit">✏️</button>
        <button class="mtg-del-btn"  data-id="${m.MeetingID}" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.meeting-item').forEach(el => {
    el.addEventListener('click', () => {
      const m = State.meetings.find(x => x.MeetingID === el.dataset.id);
      if (m) openAttendance(m);
    });
  });

  list.querySelectorAll('.mtg-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = State.meetings.find(x => x.MeetingID === btn.dataset.id);
      if (m) openEditMeeting(m);
    });
  });

  list.querySelectorAll('.mtg-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = State.meetings.find(x => x.MeetingID === btn.dataset.id);
      if (m) confirmDeleteMeeting(m);
    });
  });
}

// ── EDIT / DELETE MEETING ──────────────────────────────────
function openEditMeeting(m) {
  const knownTypes = ['Fellowship','Board','Project','Speaker','MOM'];
  const isOther = !knownTypes.includes(m.MeetingType);

  document.getElementById('edit-mtg-id').value       = m.MeetingID;
  document.getElementById('edit-mtg-type').value     = isOther ? 'Other' : (m.MeetingType || '');
  document.getElementById('edit-mtg-type-other').style.display = isOther ? '' : 'none';
  document.getElementById('edit-mtg-type-other').value = isOther ? m.MeetingType : '';
  document.getElementById('edit-mtg-subname').value  = m.MeetingSubName || '';
  document.getElementById('edit-mtg-date').value     = m.MeetingDate || '';
  document.getElementById('edit-mtg-time').value     = m.MeetingTime || '';
  document.getElementById('edit-mtg-location').value = m.Location || '';
  document.getElementById('edit-mtg-remarks').value  = m.Remarks || '';
  openModal('modal-edit-meeting');
}

document.getElementById('edit-mtg-type').addEventListener('change', function () {
  const o = document.getElementById('edit-mtg-type-other');
  o.style.display = this.value === 'Other' ? '' : 'none';
  if (this.value !== 'Other') o.value = '';
});

document.getElementById('update-meeting-btn').addEventListener('click', async () => {
  const id  = document.getElementById('edit-mtg-id').value;
  const date = document.getElementById('edit-mtg-date').value;
  const sel  = document.getElementById('edit-mtg-type').value;
  const type = sel === 'Other'
    ? document.getElementById('edit-mtg-type-other').value.trim()
    : sel;
  if (!date || !sel) { toast('Date and type required', 'error'); return; }
  if (sel === 'Other' && !type) { toast('Please specify meeting type', 'error'); return; }

  showLoader('Updating meeting…');
  const res = await api({
    action: 'updateMeeting',
    meetingId:   id,
    meetingDate: date,
    meetingTime: document.getElementById('edit-mtg-time').value,
    meetingType: type,
    meetingSubName: document.getElementById('edit-mtg-subname').value.trim(),
    location:    document.getElementById('edit-mtg-location').value.trim(),
    remarks:     document.getElementById('edit-mtg-remarks').value.trim(),
  });
  hideLoader();
  if (res.success) {
    toast('Meeting updated ✓', 'success');
    closeModal('modal-edit-meeting');
    const mRes = await api({ action: 'getMeetings' });
    if (mRes.success) { State.meetings = mRes.meetings; LS.set('meetings', State.meetings); }
    renderMeetings();
  } else {
    toast(res.error || 'Update failed', 'error');
  }
});

async function confirmDeleteMeeting(m) {
  const label = m.MeetingType + (m.MeetingSubName ? ' — ' + m.MeetingSubName : '') + ' (' + m.MeetingDate + ')';
  if (!confirm(`Delete meeting:\n${label}\n\nThis cannot be undone.`)) return;
  showLoader('Deleting meeting…');
  const res = await api({ action: 'deleteMeeting', meetingId: m.MeetingID });
  hideLoader();
  if (res.success) {
    toast('Meeting deleted', 'success');
    State.meetings = State.meetings.filter(x => x.MeetingID !== m.MeetingID);
    LS.set('meetings', State.meetings);
    renderMeetings();
  } else {
    toast(res.error || 'Delete failed', 'error');
  }
}

// ── ADD MEETING MODAL ──────────────────────────────────────
document.getElementById('fab-add-meeting').addEventListener('click', () => {
  openModal('modal-add-meeting');
  // Set today as default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('mtg-date').value = today;
  document.getElementById('mtg-time').value = '19:30';
});

function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

document.getElementById('mtg-type').addEventListener('change', function () {
  const otherInput = document.getElementById('mtg-type-other');
  otherInput.style.display = this.value === 'Other' ? '' : 'none';
  if (this.value !== 'Other') otherInput.value = '';
});

document.getElementById('save-meeting-btn').addEventListener('click', async () => {
  const date    = document.getElementById('mtg-date').value;
  const time    = document.getElementById('mtg-time').value;
  const sel     = document.getElementById('mtg-type').value;
  const type    = sel === 'Other'
    ? document.getElementById('mtg-type-other').value.trim()
    : sel;
  const subName = document.getElementById('mtg-subname').value.trim();
  const loc     = document.getElementById('mtg-location').value.trim();
  const remarks = document.getElementById('mtg-remarks').value.trim();

  if (!date || !sel) { toast('Date and type required', 'error'); return; }
  if (sel === 'Other' && !type) { toast('Please specify meeting type', 'error'); return; }

  showLoader('Saving meeting…');
  try {
    const res = await api({
      action: 'addMeeting',
      meetingDate: date,
      meetingTime: time,
      meetingType: type,
      meetingSubName: subName,
      location: loc,
      remarks: remarks,
      createdBy: State.user.email,
    });
    if (res.success) {
      toast('Meeting added ✓', 'success');
      closeModal('modal-add-meeting');
      // Reload meetings
      const mRes = await api({ action: 'getMeetings' });
      if (mRes.success) { State.meetings = mRes.meetings; LS.set('meetings', State.meetings); }
      renderMeetings();
    } else {
      toast(res.error || 'Error saving', 'error');
    }
  } catch {
    toast('Network error', 'error');
  }
  hideLoader();
});

// ── ATTENDANCE PAGE ────────────────────────────────────────
async function openAttendance(meeting) {
  State.currentMeeting = meeting;
  State.attendanceEdited = {};

  navigateTo('page-attendance',
    meeting.MeetingType + (meeting.MeetingSubName ? ' — ' + meeting.MeetingSubName : ''));

  // Sub-title
  const metaEl = document.getElementById('att-meeting-meta');
  const metaText = meeting.MeetingDate + (meeting.MeetingTime ? ' · ' + meeting.MeetingTime : '') +
    (meeting.Location ? ' · ' + meeting.Location : '');
  metaEl.innerHTML = metaText;

  const isMOM   = meeting.MeetingType === 'MOM';
  const isBoard = meeting.MeetingType === 'Board';
  State.meetingStarted = isMeetingStarted(meeting);

  // Show/hide "not started" banner
  let lockBanner = document.getElementById('att-lock-banner');
  if (!lockBanner) {
    lockBanner = document.createElement('div');
    lockBanner.id = 'att-lock-banner';
    lockBanner.className = 'att-lock-banner';
    metaEl.insertAdjacentElement('afterend', lockBanner);
  }
  if (!State.meetingStarted) {
    lockBanner.textContent = '🔒 Meeting not started — only Confirmation can be marked';
    lockBanner.style.display = '';
  } else {
    lockBanner.style.display = 'none';
  }

  showLoader('Loading attendance…');
  let existingMap = {};
  try {
    const res = await api({ action: 'getAttendance', meetingId: meeting.MeetingID });
    if (res.success) {
      res.attendance.forEach(r => { existingMap[r.MemberID] = r; });
    }
  } catch { /* use empty */ }
  hideLoader();

  // Pre-fill edits from existing
  State.members.forEach(m => {
    const ex = existingMap[m.memberId];
    const bool = v => v === true || v === 'TRUE';
    State.attendanceEdited[m.memberId] = {
      memberPresent:   ex ? bool(ex.MemberPresent)   : false,
      spousePresent:   ex ? bool(ex.SpousePresent)   : false,
      kidsCount:       ex ? (parseInt(ex.KidsCount) || 0) : 0,
      memberConfirmed: ex ? bool(ex.MemberConfirmed) : false,
      spouseConfirmed: ex ? bool(ex.SpouseConfirmed) : false,
    };
  });

  renderAttendanceGrid(isMOM, isBoard);
  updateAttendanceStats(isMOM, isBoard);
}

function isMeetingStarted(meeting) {
  if (!meeting.MeetingDate) return true;
  try {
    // Parse date — handles "2026-06-09", "2026-06-09T00:00:00.000Z", "09-Jun-2026"
    let dateStr = meeting.MeetingDate.toString();
    if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
    // Normalise "09-Jun-2026" → "09 Jun 2026"
    dateStr = dateStr.replace(/-/g, ' ');

    // Parse time — handles "19:30", "1899-12-30T19:30:00.000Z", "19:30:00"
    let rawTime = (meeting.MeetingTime || '').toString().trim();
    let timeStr = '00:00';
    const tMatch = rawTime.match(/(\d{1,2}):(\d{2})/);
    if (tMatch) timeStr = tMatch[1].padStart(2,'0') + ':' + tMatch[2];

    const dt = new Date(dateStr + ' ' + timeStr);
    if (isNaN(dt.getTime())) return false; // can't parse → treat as not started (lock attendance)
    return Date.now() >= dt.getTime();
  } catch { return false; }
}

function renderAttendanceGrid(isMOM, isBoard) {
  const grid      = document.getElementById('attendance-grid');
  const header    = document.getElementById('attendance-header');
  const attLocked = !State.meetingStarted;
  const cols      = (isBoard || isMOM) ? '1fr 44px 44px' : '1fr 44px 44px 48px';

  const boardFiltered  = State.members.filter(m => m.boardMember);
  const displayMembers = isBoard
    ? (boardFiltered.length > 0 ? boardFiltered : State.members)
    : State.members;

  // Header
  header.style.gridTemplateColumns = cols;
  if (isBoard) {
    header.innerHTML = `<span>Board Member</span><span>Conf</span><span>Att</span>`;
  } else if (isMOM) {
    header.innerHTML = `<span>Member</span><span>Conf</span><span>Att</span>`;
  } else {
    header.innerHTML = `<span>Member / Spouse</span><span>Conf</span><span>Att</span><span>Kids</span>`;
  }

  grid.innerHTML = displayMembers.map(m => {
    const rec = State.attendanceEdited[m.memberId] || {
      memberPresent: false, spousePresent: false, kidsCount: 0,
      memberConfirmed: false, spouseConfirmed: false
    };

    const mRow = `
      <div class="att-sub-row" style="grid-template-columns:${cols}">
        <div class="member-name-cell" title="${m.memberName}">${m.memberName}</div>
        <div class="tap-cell ${rec.memberConfirmed ? 'conf-yes' : 'conf-no'}"
             data-kind="mconf" data-id="${m.memberId}">${rec.memberConfirmed ? '✅' : '⬜'}</div>
        <div class="tap-cell ${rec.memberPresent ? 'present' : 'absent'}${attLocked ? ' att-locked' : ''}"
             data-kind="matt" data-id="${m.memberId}">${attLocked ? '🔒' : (rec.memberPresent ? '✅' : '⬜')}</div>
        ${(!isBoard && !isMOM) ? `<div class="kids-cell"><input type="number" class="kids-count-input"
          min="0" max="20" value="${rec.kidsCount}" data-id="${m.memberId}" inputmode="numeric"/></div>` : ''}
      </div>`;

    const sRow = (!isMOM && !isBoard && m.spouseName) ? `
      <div class="att-sub-row att-spouse-row" style="grid-template-columns:${cols}">
        <div class="member-name-cell att-spouse-name" title="${m.spouseName}">${m.spouseName}</div>
        <div class="tap-cell ${rec.spouseConfirmed ? 'conf-yes' : 'conf-no'}"
             data-kind="sconf" data-id="${m.memberId}">${rec.spouseConfirmed ? '✅' : '⬜'}</div>
        <div class="tap-cell ${rec.spousePresent ? 'present' : 'absent'}${attLocked ? ' att-locked' : ''}"
             data-kind="satt" data-id="${m.memberId}">${attLocked ? '🔒' : (rec.spousePresent ? '✅' : '⬜')}</div>
        <div class="kids-cell"></div>
      </div>` : '';

    return `<div class="att-group" data-id="${m.memberId}">${mRow}${sRow}</div>`;
  }).join('');

  // Confirmation taps — always active
  grid.querySelectorAll('[data-kind="mconf"],[data-kind="sconf"]').forEach(cell => {
    cell.addEventListener('click', () => {
      const rec = State.attendanceEdited[cell.dataset.id];
      if (!rec) return;
      const key = cell.dataset.kind === 'mconf' ? 'memberConfirmed' : 'spouseConfirmed';
      rec[key]  = !rec[key];
      cell.classList.toggle('conf-yes', rec[key]);
      cell.classList.toggle('conf-no',  !rec[key]);
      cell.textContent = rec[key] ? '✅' : '⬜';
      updateAttendanceStats(isMOM, isBoard);
    });
  });

  // Attendance taps — locked before meeting time
  grid.querySelectorAll('[data-kind="matt"],[data-kind="satt"]').forEach(cell => {
    cell.addEventListener('click', () => {
      if (cell.classList.contains('att-locked')) {
        toast('Attendance opens at meeting start time', 'error');
        return;
      }
      const rec = State.attendanceEdited[cell.dataset.id];
      if (!rec) return;
      const key = cell.dataset.kind === 'matt' ? 'memberPresent' : 'spousePresent';
      rec[key]  = !rec[key];
      cell.classList.toggle('present', rec[key]);
      cell.classList.toggle('absent',  !rec[key]);
      cell.textContent = rec[key] ? '✅' : '⬜';
      updateAttendanceStats(isMOM, isBoard);
    });
  });

  // Kids count
  grid.querySelectorAll('.kids-count-input').forEach(input => {
    input.addEventListener('change', () => {
      State.attendanceEdited[input.dataset.id].kidsCount = parseInt(input.value) || 0;
      updateAttendanceStats(isMOM, isBoard);
    });
  });
}

function updateAttendanceStats(isMOM, isBoard) {
  let members = 0, spouses = 0, kids = 0, confirmed = 0;

  const boardIds = isBoard
    ? new Set(State.members.filter(m => m.boardMember).map(m => m.memberId))
    : null;

  Object.entries(State.attendanceEdited).forEach(([id, r]) => {
    if (boardIds && !boardIds.has(id)) return;
    if (r.memberPresent)   members++;
    if (!isMOM && !isBoard && r.spousePresent) spouses++;
    if (!isBoard && !isMOM) kids += (r.kidsCount || 0);
    if (r.memberConfirmed) confirmed++;
    if (!isMOM && !isBoard && r.spouseConfirmed) confirmed++;
  });

  document.getElementById('stat-members').textContent  = members;
  document.getElementById('stat-spouses').textContent  = spouses;
  document.getElementById('stat-kids').textContent     = kids;
  document.getElementById('stat-total').textContent    = members + spouses + kids;
  const confEl = document.getElementById('stat-confirmed');
  if (confEl) confEl.textContent = confirmed;

  const spouseWrap = document.getElementById('stat-spouse-wrap');
  const kidsWrap   = document.getElementById('stat-kids-wrap');
  if (spouseWrap) spouseWrap.style.display = (isMOM || isBoard) ? 'none' : '';
  if (kidsWrap)   kidsWrap.style.display   = (isBoard || isMOM) ? 'none' : '';
}

// Save attendance
document.getElementById('save-attendance-btn').addEventListener('click', async () => {
  if (!State.currentMeeting) return;
  showLoader('Saving attendance…');

  const records = State.members.map(m => {
    const e = State.attendanceEdited[m.memberId] || {};
    return {
      memberId:        m.memberId,
      memberPresent:   e.memberPresent   || false,
      spousePresent:   e.spousePresent   || false,
      kidsCount:       e.kidsCount       || 0,
      memberConfirmed: e.memberConfirmed || false,
      spouseConfirmed: e.spouseConfirmed || false,
    };
  });

  try {
    const res = await api({
      action: 'saveAttendance',
      meetingId: State.currentMeeting.MeetingID,
      updatedBy: State.user.email,
      records,
    });
    if (res.success) {
      toast('Attendance saved ✓', 'success');
    } else {
      toast(res.error || 'Error saving', 'error');
    }
  } catch {
    toast('Network error — check connection', 'error');
  }
  hideLoader();
});

// ── REMINDER PAGE ──────────────────────────────────────────
function renderReminder() {
  const sel = document.getElementById('reminder-meeting-sel');
  sel.innerHTML = '<option value="">— Select a meeting —</option>' +
    [...State.meetings]
      .sort((a, b) => new Date(b.MeetingDate) - new Date(a.MeetingDate))
      .map(m => `<option value="${m.MeetingID}">
        ${m.MeetingType}${m.MeetingSubName ? ' — ' + m.MeetingSubName : ''} (${m.MeetingDate})
      </option>`).join('');

  document.getElementById('reminder-preview').style.display = 'none';
}

document.getElementById('reminder-meeting-sel').addEventListener('change', function () {
  const m = State.meetings.find(x => x.MeetingID === this.value);
  if (!m) { document.getElementById('reminder-preview').style.display = 'none'; return; }

  const msg = buildReminderMsg(m);
  document.getElementById('reminder-text-box').textContent = msg;
  document.getElementById('reminder-preview').style.display = 'block';

  const encoded = encodeURIComponent(msg);
  document.getElementById('send-reminder-wa').href =
    `https://wa.me/?text=${encoded}`;
});

function buildReminderMsg(m) {
  const clubName = State.clubName;
  const typeLine = m.MeetingType + (m.MeetingSubName ? ' — ' + m.MeetingSubName : '');
  return `🔔 *${clubName} Meeting Reminder*

📅 Date    : ${m.MeetingDate}
🕐 Time    : ${m.MeetingTime || 'TBA'}
📍 Venue   : ${m.Location || 'TBA'}
🏷️ Type    : ${typeLine}
${m.Remarks ? '\n📝 ' + m.Remarks : ''}

Kindly confirm your attendance.
Thank you! 🙏`;
}

// ── LOGOUT ─────────────────────────────────────────────────
document.getElementById('user-pill').addEventListener('click', () => {
  if (confirm('Logout?')) {
    LS.del('user');
    State.user = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-email').value = '';
  }
});

// ── MONTHLY ANALYSIS ───────────────────────────────────────
function openAnalysisPicker() {
  const now = new Date();
  document.getElementById('analysis-month').value = now.getMonth() + 1;
  document.getElementById('analysis-year').value  = now.getFullYear();
  openModal('modal-analysis-picker');
}

document.getElementById('generate-analysis-btn')?.addEventListener('click', async () => {
  const month = document.getElementById('analysis-month').value;
  const year  = document.getElementById('analysis-year').value.trim();

  if (!year || isNaN(year)) { toast('Enter a valid year', 'error'); return; }

  closeModal('modal-analysis-picker');
  showLoader('Generating analysis…');

  try {
    const res = await api({ action: 'getMonthlyAnalysis', month, year });
    if (res.success) {
      State.analysisData = res;
      navigateTo('page-analysis', res.monthName + ' ' + res.year + ' Analysis');
      renderAnalysisPage(res);
    } else {
      toast(res.error || 'Error generating analysis', 'error');
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
  hideLoader();
});

function analysisSentKey(month, year) {
  return 'analysis-sent-' + month + '-' + year;
}

function markSent(memberId) {
  const data = State.analysisData;
  if (!data) return;
  const key     = analysisSentKey(data.month, data.year);
  const sentArr = LS.get(key) || [];
  if (!sentArr.includes(memberId)) { sentArr.push(memberId); LS.set(key, sentArr); }

  const btn = document.querySelector('.analysis-wa-btn[data-mid="' + memberId + '"]');
  if (btn) {
    btn.textContent = '✓ Sent';
    btn.classList.add('analysis-wa-sent');
  }
  updateSentCounter();
}

function updateSentCounter() {
  const data = State.analysisData;
  if (!data) return;
  const sentArr  = LS.get(analysisSentKey(data.month, data.year)) || [];
  const total    = data.memberReports.filter(m => m.mobile && m.mobile.replace(/\D/g,'') && m.memberName).length;
  const counter  = document.getElementById('analysis-sent-count');
  if (!counter) return;
  counter.textContent = 'Sent: ' + sentArr.length + ' / ' + total;
  counter.className   = 'analysis-sent-counter ' + (sentArr.length === total ? 'all-sent' : sentArr.length > 0 ? 'partial-sent' : '');
}

function renderAnalysisPage(data) {
  const clubName = State.clubName;
  const monthStr = data.monthName + ' ' + data.year;
  const meta     = document.getElementById('analysis-meta');
  const list     = document.getElementById('analysis-list');

  if (!data.meetings || data.meetings.length === 0) {
    meta.innerHTML = '';
    list.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No meetings found for ${monthStr}.</p></div>`;
    return;
  }

  const sentArr = LS.get(analysisSentKey(data.month, data.year)) || [];

  meta.innerHTML = `
    <span>${data.meetings.length} meeting(s) in ${monthStr}</span>
    <span id="analysis-sent-count" class="analysis-sent-counter"></span>`;

  list.innerHTML = data.memberReports.map(member => {
    if (!member.memberName) return '';

    const mobile  = member.mobile.replace(/\D/g, '');
    const message = buildAnalysisMessage(member, monthStr, clubName);
    const waLink  = mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(message)}` : null;
    const isSent  = sentArr.includes(member.memberId);

    const rows = member.attendance.length
      ? member.attendance.map(att => `
          <div class="analysis-att-row">
            <span class="analysis-date">${att.dateShort}</span>
            <span class="analysis-type">${att.type}</span>
            <span class="att-badge ${att.memberPresent ? 'att-yes' : 'att-no'}">M:${att.memberPresent ? 'Y' : 'N'}</span>
            <span class="att-badge ${att.spousePresent ? 'att-yes' : 'att-no'}">S:${att.spousePresent ? 'Y' : 'N'}</span>
          </div>`).join('')
      : `<div style="color:var(--muted);font-size:12px;padding:4px 0;">No applicable meetings</div>`;

    return `
      <div class="analysis-card ${isSent ? 'card-sent' : ''}">
        <div class="analysis-card-header">
          <span class="analysis-member-name">${member.memberName}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            ${member.isBoardMember ? '<span class="analysis-board-badge">Board</span>' : ''}
            ${isSent ? '<span class="sent-tick">✓ Sent</span>' : ''}
          </div>
        </div>
        <div class="analysis-att-list">${rows}</div>
        ${waLink
          ? `<a href="${waLink}" class="analysis-wa-btn ${isSent ? 'analysis-wa-sent' : ''}"
               data-mid="${member.memberId}"
               onclick="markSent('${member.memberId}')"
               target="_blank" rel="noopener">
               ${isSent ? '✓ Sent' : '📲 Send WhatsApp'}
             </a>`
          : `<span class="analysis-no-mobile">No mobile number</span>`}
      </div>`;
  }).join('');

  updateSentCounter();
}

function buildAnalysisMessage(member, monthStr, clubName) {
  const lines = [
    `Dear ${member.memberName},`,
    '',
    `━━━ ATTENDANCE SUMMARY ━━━`,
    `    ${monthStr}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ''
  ];

  if (member.attendance.length === 0) {
    lines.push('No applicable meetings this month.');
  } else {
    member.attendance.forEach(att => {
      lines.push(
        `${att.date} | ${att.type}`,
        `  Member : ${att.memberPresent ? 'Yes' : 'No'}`,
        `  Spouse : ${att.spousePresent ? 'Yes' : 'No'}`,
        ''
      );
    });
  }

  lines.push('Regards,', clubName);
  return lines.join('\n');
}

// ── STARTUP ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Check saved session
  const savedUser = LS.get('user');
  if (savedUser) {
    State.user = savedUser;
    document.getElementById('login-screen').style.display = 'none';
    initApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});
