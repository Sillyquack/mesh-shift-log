# Mesh Shift Log

Mobile-first internal shift operations tool for Mesh Youngstorget hospitality staff.

Current app version: `0.6.0`.

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
- Youngs local on-site check with manager override
- Event Floor Manager dashboard for Julie/event leads
- Role-based responsibility assignments
- Cash/invoice sign-off flow
- Youngs payment terminal and POS/iPad asset registry
- End-of-shift/event asset checks
- Basic manager-only routine editor
- JSON export/import for backups and moving local data between browsers

## v0.6 Operational Flow

- Staff can finish a shift and see a local summary.
- Today's overview is visible to all users for transparent team status.
- Alert manager creates local alerts visible in this browser/app only.
- Managers can acknowledge or resolve local alerts.
- Managers can assign role-based responsibilities for shifts and events.
- Managers can manage staff codes from the manager dashboard after login.
- Managers can configure a local Youngs on-site check and temporary override.
- Julie/event floor managers see a dedicated Event Floor Manager dashboard.
- Closing and event flows can record cash/invoice signoff and asset checks.
- Closing shift includes Responsible closing control tasks.

Local alerts do not vibrate Bobby's phone or notify another device. Real alerts require a future Slack, email, SMS, push notification or backend integration.

## Staff Codes

Staff codes are not shown on the login page. Managers can view, add, edit, mask/show, copy, deactivate, export/import and generate local staff codes from the manager dashboard.

The default local setup includes Bobby, Ivana, Vlad, Rebekka, Mircea, Dima, Julie and Time2Staff Opening/Closing/Event Responsible, so those users are available after deploy on a fresh device.

Manager-created staff code changes are local to that browser/device. To move staff codes to another phone or browser, use the manager-only staff codes export/import tool, or add the user to the default staff list before deployment.

Treat staff codes as local client-side access codes, not real authentication. Real shared user management requires backend authentication later.

## Youngs Site Access

The manager dashboard includes `Site access` settings for Youngs / Mesh Youngstorget:

- site name, latitude, longitude and allowed radius
- local browser geolocation check on/off
- read-only remote access copy
- temporary manager override for 15 minutes, 1 hour or rest of day

When enabled, operational write actions ask the browser for location and are blocked when the device appears away from Youngs or location is unavailable. Users can still read the app remotely. This is a frontend local on-site check only, not real security. Browser geolocation can fail or be spoofed, and real enforcement requires backend authentication and server-side policy later.

Override history is included in reports, diagnostics and backups. `Clear test logs` clears override history but keeps site settings.

## Event Floor Manager

Julie is seeded as an `event_floor_manager` default user. Event floor managers land on an Event Floor Manager dashboard instead of the regular shift picker, with links to Today's overview and Guides.

The dashboard shows local event cards, readiness checks, during-event checks, closeout checks, weekly/monthly event floor tasks, cash/invoice status and asset checks. There is no calendar integration yet.

## Responsibility Roles

Responsibilities are role-based and can be assigned per date, shift and optionally event:

- overall shift lead
- event responsible
- closing responsible
- cash/invoice responsible
- locking/alarm responsible
- asset check responsible

One person can hold multiple roles, and different people can hold different roles. If `Julie leads this event` is selected on an event card, Julie becomes event responsible only; she is not automatically cash/invoice or locking responsible.

## Cash / Invoice And Assets

Closing and event flows include cash/invoice signoff. The responsible person records whether customer/table, sales punching, invoice/report and settlement are complete, who performed settlement, and who signed off.

The manager dashboard includes a Youngs-only asset registry seeded with known payment terminals and placeholder POS/iPad assets. Closing/event asset checks record present, correct location, condition, charging, serial check and comments. Missing, damaged, wrong-location or not-charging devices appear in Needs attention and the daily report.

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
- Site settings and override history
- Event records and event floor task checks
- Cash/invoice signoffs
- Asset registry and asset check records

Use import to restore a backup or copy data to another browser/device. Bad JSON is rejected with an error message.

The routine editor has separate routine export/import controls for moving just the routine setup. The Staff codes section has separate export/import controls for moving just the local staff/user configuration.

`Clear test logs` removes local logs, handover notes, finish records, alerts, responsible assignments, events, signoffs, asset checks and override history. It keeps routines, routine edits, staff/user code configuration, site settings and the asset registry.

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
- Geolocation check is a local pilot guardrail, not real security
- Export/import is needed for backup and sharing data
- Manager routine edits are local until exported/imported elsewhere
- No real authentication; staff codes are client-side local access only
- Real security will need backend authentication later
- No live multi-device sync
- Offline app shell may require one successful online visit first
