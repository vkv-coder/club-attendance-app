# Club Attendance App — Setup Guide

A mobile PWA for managing Rotary Club meeting attendance.
Built by: vkv-coder | Support: vkvcoder.support@gmail.com

---

## Files

```
index.html       ← Main PWA shell
style.css        ← Stylesheet
app.js           ← App logic
manifest.json    ← PWA manifest
sw.js            ← Service Worker (offline support)
gas-code.gs      ← Google Apps Script backend
icons/           ← Create icon-192.png and icon-512.png
```

---

## Step 1 — Google Apps Script Setup

1. Open your Google Sheet (RCBC Muster)
2. Go to **Extensions → Apps Script**
3. Delete any existing code
4. Paste the contents of `gas-code.gs`
5. Click **Save** (Ctrl+S)
6. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** → copy the Web App URL

---

## Step 2 — Configure app.js

Open `app.js` and replace line 4:

```js
const GAS_URL = 'YOUR_GAS_WEB_APP_URL_HERE';
```

Paste your Web App URL, e.g.:

```js
const GAS_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

---

## Step 3 — Create Icons

Create an `icons/` folder and add two PNG icons:
- `icons/icon-192.png` (192×192 px)
- `icons/icon-512.png` (512×512 px)

Use any icon maker (e.g. https://favicon.io) with your club logo.

---

## Step 4 — Deploy to GitHub Pages

1. Create repo: `vkv-coder/club-attendance-app`
2. Upload all files (index.html, style.css, app.js, sw.js, manifest.json, icons/)
3. Go to **Settings → Pages**
4. Source: **main branch / root**
5. Your app URL: `https://vkv-coder.github.io/club-attendance-app/`

---

## Step 5 — Add Users to Sheet

In the Google Sheet **Users** tab, add rows:
```
EmailID                | UserName | Role  | Active
you@gmail.com          | Vijay    | Admin | TRUE
member@gmail.com       | Rtn. XYZ | User  | TRUE
```

---

## Step 6 — Add to Home Screen (PWA Install)

On mobile Chrome:
- Open the app URL
- Tap the ⋮ menu → **Add to Home screen**
- App works offline after first load

---

## Google Sheet Structure Required

### MemberMaster tab columns:
`MemberID | MEMBER'S NAME | NAME OF (R'ANN) | EMAIL ID (Rotarian) | EMAIL ID (R'ann) | MOBILE NUMBER (Rotarian) | MOBILE NUMBER (R'ann) | BIRTH DATE (Rotarian) | BIRTH DATE (R'Ann) | NAME (Annet-1) | BIRTH DATE (Annet-1) | NAME (Annet-2) | ...`

### Meetings tab columns:
`MeetingID | MeetingDate | MeetingTime | MeetingType | MeetingSubName | Location | Remarks | CreatedBy | CreatedOn`

### Attendance tab columns:
`AttendanceID | MeetingID | MemberID | MemberPresent | SpousePresent | KidsCount | LastUpdatedBy | LastUpdatedOn`

### Users tab columns:
`EmailID | UserName | Role | Active`

### Settings tab columns:
`SettingName | SettingValue`
Row: `club name | RCBC` (or your club name)

---

## Support
Email: vkvcoder.support@gmail.com
Telegram: 8507770594
