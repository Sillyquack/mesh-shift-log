# Mesh Shift Log

Mobile-first internal shift operations tool for Mesh Youngstorget hospitality staff.

Current app version: `0.4.0`.

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
- Basic manager-only routine editor
- JSON export/import for backups and moving local data between browsers

## Demo Codes

- `1001` Bobby / manager
- `1002` Ivana
- `1003` Vlad
- `1004` Rebekka
- `1005` Mircea
- `OPEN` Time2Staff Opening
- `CLOSE` Time2Staff Closing
- `EVENT` Time2Staff Event Responsible

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

Use import to restore a backup or copy data to another browser/device. Bad JSON is rejected with an error message.

The routine editor also has separate routine export/import controls for moving just the routine setup.

`Clear test logs` removes local logs and handover notes only. It keeps routines and routine edits.

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
- Export/import is needed for backup and sharing data
- Manager routine edits are local until exported/imported elsewhere
- No real authentication; staff codes are client-side demo access only
- No live multi-device sync
- Offline app shell may require one successful online visit first
