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

  showLoader('Loading data…');
  try {
    // Load settings
    const settingsRes = await api({ action: 'getSettings' });
    if (settingsRes.success) {
      State.clubName = settingsRes.settings['club name'] || settingsRes.settings['clubName'] || 'Club';
      document.querySelector('.club-badge').textContent = State.clubName;
      LS.set('clubName', State.clubName);
      LS.set('settings', settingsRes.settings);
    }

    // Load members
    const membersRes = await api({ action: 'getMembers' });
    if (membersRes.success) {
      State.members = membersRes.members;
      LS.set('members', State.members);
    }

    // Load meetings
    const meetingsRes = await api({ action: 'getMeetings' });
    if (meetingsRes.success) {
      State.meetings = meetingsRes.meetings;
      LS.set('meetings', State.meetings);
    }

    // Today's events
    const eventsRes = await api({ action: 'getTodayEvents' });
    if (eventsRes.success) {
      State.todayEvents = eventsRes;
    }

  } catch (err) {
    // Try from cache
    State.members  = LS.get('members')  || [];
    State.meetings = LS.get('meetings') || [];
    State.clubName = LS.get('clubName') || 'Club';
    document.querySelector('.club-badge').textContent = State.clubName;
    toast('Offline — using cached data', 'error');
  }

  // Update user pill
  document.getElementById('user-pill').textContent = State.user.name || State.user.email;

  hideLoader();
  navigateTo('page-home');
  renderHome();
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
      <div class="meeting-chevron">›</div>
    </div>
  `).join('');

  list.querySelectorAll('.meeting-item').forEach(el => {
    el.addEventListener('click', () => {
      const m = State.meetings.find(x => x.MeetingID === el.dataset.id);
      if (m) openAttendance(m);
    });
  });
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

document.getElementById('save-meeting-btn').addEventListener('click', async () => {
  const date    = document.getElementById('mtg-date').value;
  const time    = document.getElementById('mtg-time').value;
  const type    = document.getElementById('mtg-type').value;
  const subName = document.getElementById('mtg-subname').value.trim();
  const loc     = document.getElementById('mtg-location').value.trim();
  const remarks = document.getElementById('mtg-remarks').value.trim();

  if (!date || !type) { toast('Date and type required', 'error'); return; }

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
  document.getElementById('att-meeting-meta').textContent =
    meeting.MeetingDate + (meeting.MeetingTime ? ' · ' + meeting.MeetingTime : '') +
    (meeting.Location ? ' · ' + meeting.Location : '');

  const isMOM = meeting.MeetingType === 'MOM';

  showLoader('Loading attendance…');
  let existingMap = {};
  try {
    const res = await api({ action: 'getAttendance', meetingId: meeting.MeetingID });
    if (res.success) {
      res.attendance.forEach(r => {
        existingMap[r.MemberID] = r;
      });
    }
  } catch { /* use empty */ }
  hideLoader();

  // Pre-fill edits from existing
  State.members.forEach(m => {
    const ex = existingMap[m.memberId];
    State.attendanceEdited[m.memberId] = {
      memberPresent: ex ? (ex.MemberPresent === true || ex.MemberPresent === 'TRUE') : false,
      spousePresent: ex ? (ex.SpousePresent === true || ex.SpousePresent === 'TRUE') : false,
      kidsCount:     ex ? (parseInt(ex.KidsCount) || 0) : 0,
    };
  });

  renderAttendanceGrid(isMOM);
  updateAttendanceStats(isMOM);
}

function renderAttendanceGrid(isMOM) {
  const grid = document.getElementById('attendance-grid');

  // Header
  const header = document.getElementById('attendance-header');
  header.innerHTML = `
    <span>Member</span>
    <span>Mbr</span>
    <span class="${isMOM ? 'hidden-col' : ''}">Sps</span>
    <span>Kids</span>
  `;

  grid.innerHTML = State.members.map(m => {
    const rec = State.attendanceEdited[m.memberId];
    const mPresent = rec.memberPresent;
    const sPresent = rec.spousePresent;
    const kids     = rec.kidsCount;

    return `
    <div class="attendance-row" data-id="${m.memberId}">
      <div class="member-name-cell" title="${m.memberName}">${m.memberName}</div>
      <div class="tap-cell ${mPresent ? 'present' : 'absent'}"
           data-type="member" data-id="${m.memberId}">
        ${mPresent ? '✅' : '⬜'}
      </div>
      <div class="tap-cell ${sPresent ? 'present' : 'absent'} ${isMOM ? 'hidden-col' : ''}"
           data-type="spouse" data-id="${m.memberId}">
        ${sPresent ? '✅' : '⬜'}
      </div>
      <div class="kids-cell" data-id="${m.memberId}">
        <input type="number" class="kids-count-input"
               min="0" max="20" value="${kids}"
               data-id="${m.memberId}" inputmode="numeric" />
      </div>
    </div>`;
  }).join('');

  // Tap events for member/spouse cells
  grid.querySelectorAll('.tap-cell:not(.hidden-col)').forEach(cell => {
    cell.addEventListener('click', () => {
      const id   = cell.dataset.id;
      const type = cell.dataset.type; // 'member' | 'spouse'
      const rec  = State.attendanceEdited[id];
      if (type === 'member') {
        rec.memberPresent = !rec.memberPresent;
        cell.classList.toggle('present', rec.memberPresent);
        cell.classList.toggle('absent',  !rec.memberPresent);
        cell.textContent = rec.memberPresent ? '✅' : '⬜';
      } else {
        rec.spousePresent = !rec.spousePresent;
        cell.classList.toggle('present', rec.spousePresent);
        cell.classList.toggle('absent',  !rec.spousePresent);
        cell.textContent = rec.spousePresent ? '✅' : '⬜';
      }
      updateAttendanceStats(isMOM);
    });
  });

  // Kids count
  grid.querySelectorAll('.kids-count-input').forEach(input => {
    input.addEventListener('change', () => {
      const id = input.dataset.id;
      State.attendanceEdited[id].kidsCount = parseInt(input.value) || 0;
      updateAttendanceStats(isMOM);
    });
  });
}

function updateAttendanceStats(isMOM) {
  let members = 0, spouses = 0, kids = 0;
  Object.values(State.attendanceEdited).forEach(r => {
    if (r.memberPresent) members++;
    if (!isMOM && r.spousePresent) spouses++;
    kids += r.kidsCount;
  });
  document.getElementById('stat-members').textContent  = members;
  document.getElementById('stat-spouses').textContent  = spouses;
  document.getElementById('stat-kids').textContent     = kids;
  document.getElementById('stat-total').textContent    =
    members + (isMOM ? 0 : spouses) + kids;

  const spouseStatEl = document.getElementById('stat-spouse-wrap');
  if (spouseStatEl) spouseStatEl.style.display = isMOM ? 'none' : '';
}

// Save attendance
document.getElementById('save-attendance-btn').addEventListener('click', async () => {
  if (!State.currentMeeting) return;
  showLoader('Saving attendance…');

  const records = State.members.map(m => ({
    memberId:      m.memberId,
    memberPresent: State.attendanceEdited[m.memberId].memberPresent,
    spousePresent: State.attendanceEdited[m.memberId].spousePresent,
    kidsCount:     State.attendanceEdited[m.memberId].kidsCount,
  }));

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

function renderAnalysisPage(data) {
  const clubName = State.clubName;
  const monthStr = data.monthName + ' ' + data.year;
  const meta     = document.getElementById('analysis-meta');
  const list     = document.getElementById('analysis-list');

  if (!data.meetings || data.meetings.length === 0) {
    meta.textContent = '';
    list.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>No meetings found for ${monthStr}.</p></div>`;
    return;
  }

  meta.textContent = data.meetings.length + ' meeting(s) in ' + monthStr;

  list.innerHTML = data.memberReports.map(member => {
    if (!member.memberName) return '';

    const mobile  = member.mobile.replace(/\D/g, '');
    const message = buildAnalysisMessage(member, monthStr, clubName);
    const waLink  = mobile
      ? `https://wa.me/${mobile}?text=${encodeURIComponent(message)}`
      : null;

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
      <div class="analysis-card">
        <div class="analysis-card-header">
          <span class="analysis-member-name">${member.memberName}</span>
          ${member.isBoardMember ? '<span class="analysis-board-badge">Board</span>' : ''}
        </div>
        <div class="analysis-att-list">${rows}</div>
        ${waLink
          ? `<a href="${waLink}" class="analysis-wa-btn" target="_blank" rel="noopener">📲 Send WhatsApp</a>`
          : `<span class="analysis-no-mobile">No mobile number</span>`}
      </div>`;
  }).join('');
}

function buildAnalysisMessage(member, monthStr, clubName) {
  const lines = [
    `Dear ${member.memberName},`,
    '',
    `Attendance Report - ${monthStr}`,
    ''
  ];

  if (member.attendance.length === 0) {
    lines.push('No applicable meetings this month.');
  } else {
    member.attendance.forEach(att => {
      lines.push(
        `${att.date} | ${att.type} | Member: ${att.memberPresent ? 'Y' : 'N'} | Spouse: ${att.spousePresent ? 'Y' : 'N'}`
      );
    });
  }

  lines.push('', 'Regards,', clubName);
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
