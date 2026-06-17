# Mesh Shift Log

Mobile-first internal shift operations tool for Mesh Youngstorget hospitality staff.

Current app version: `0.5.0`.

The app is currently a local-only MVP. It has no backend and stores shift logs, handover notes and manager routine edits in the browser with `localStorage`.

## Pilot Use

- This is a local-only pilot tool.
- Data stays in the current browser/device.
- Managers should export backups regularly from the dashboard.
- Use `Clear test logs` before starting a real pilot if test data should be removed.
- Time2Staff workers must enter their actual first name before using a checklist.
- Critical tasks should only be confirmed after a real physical check.
- There is no backend or live sync yet.

## Install / Offline

The app includes a basic PWA manifest and service worker.

- After the first online visit, the app shell can load offline.
- Shift data is still stored in localStorage on the device.
- Offline support does not sync data between devices.
- Browser install options vary by phone and browser.
- If an update is available, the app may show `Update available. Refresh app.`

## What The App Does

- Staff-code login for named staff and Time2Staff roles
- Opening, daytime, closing, event, weekly and guide views
- Rich checklist tasks with priority, area, section, time block, input fields and critical confirmations
- Done and Not relevant task statuses
- Handover notes per date, shift and user
- Manager dashboard with progress, missing tasks, critical tasks, handover notes and history
- Local data status, backup reminder and daily report copy for managers
- Diagnostics and pilot quick-start copy tools for managers
- Finish shift flow with local finish records
- Staff-facing Today's overview dashboard
- Local Alert manager logging with clear limitations
- Manager-assigned Shift responsible role
- Responsible closing control section
- Manager-only staff code management
- Basic manager-only routine editor
- JSON export/import for backups and moving local data between browsers

## v0.5 Operational Flow

- Staff can finish a shift and see a local summary.
- Today's overview is visible to all users for transparent team status.
- Alert manager creates local alerts visible in this browser/app only.
- Managers can acknowledge or resolve local alerts.
- Managers can assign a Shift responsible for a date and shift.
- Managers can manage staff codes from the manager dashboard after login.
- Closing shift includes Responsible closing control tasks.

Local alerts do not vibrate Bobby's phone or notify another device. Real alerts require a future Slack, email, SMS, push notification or backend integration.

## Staff Codes

Staff codes are not shown on the login page. Managers can view, add, edit, mask/show, copy, deactivate, export/import and generate local staff codes from the manager dashboard.

The default local setup includes Bobby, Ivana, Vlad, Rebekka, Mircea, Dima and Time2Staff Opening/Closing/Event Responsible, so those users are available after deploy on a fresh device.

Manager-created staff code changes are local to that browser/device. To move staff codes to another phone or browser, use the manager-only staff codes export/import tool, or add the user to the default staff list before deployment.

Treat staff codes as local client-side access codes, not real authentication. Real shared user management requires backend authentication later.

## Time2Staff Name Capture

The generic Time2Staff codes ask: "Who is working this shift?"

The typed name is saved in logs, for example `Ana / Time2Staff Opening`, so manager reports show the actual person who completed the task.

## localStorage Behavior

Data is local to the browser/device:

- Logs are stored by date
- Tasks reset visually each day
- Handover notes are stored by date + shift + user
- Manager routine edits are stored locally
- Clearing browser storage removes local app data

## Export / Import

Manager dashboard export backs up:

- Logs
- Handover notes
- Imported or edited routine data
- Finish records
- Local alerts
- Responsible assignments
- Staff/user code configuration

Use import to restore a backup or copy data to another browser/device. Bad JSON is rejected with an error message.

The routine editor has separate routine export/import controls for moving just the routine setup. The Staff codes section has separate export/import controls for moving just the local staff/user configuration.

`Clear test logs` removes local logs, handover notes, finish records, alerts and responsible assignments only. It keeps routines, routine edits and staff/user code configuration.

## Diagnostics

Manager dashboard includes a data health/diagnostics card showing app version, task counts, log counts, handover count, routine source, and localStorage size estimate. Use `Copy diagnostics` when debugging pilot issues.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy To GitHub Pages

This project uses Vite with a relative base path and the `gh-pages` package.

```bash
npm run deploy
```

Before deploying, make sure GitHub Pages is enabled for the `gh-pages` branch in the repository settings.

## Known Limitations

- No backend yet
- Data is local per browser/device
- Local alerts are not real push notifications
- Export/import is needed for backup and sharing data
- Manager routine edits are local until exported/imported elsewhere
- No real authentication; staff codes are client-side local access only
- Real security will need backend authentication later
- No live multi-device sync
- Offline app shell may require one successful online visit first
