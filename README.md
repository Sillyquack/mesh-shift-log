# Mesh Shift Log

Mobile-first internal shift operations tool for Mesh Youngstorget hospitality staff.

Current app version: `0.7.0`.

Release: `v0.7.0-phase-5a-financial-signoffs`.

Mesh Shift Log now supports Supabase-backed alerts, checklist/handover records and financial signoffs with Supabase Auth email/password login. Staff-code login remains available as a local fallback/emergency pilot mode. Routines, events, assets and several manager tools still use localStorage until later backend migration phases.

## Pilot Use

- Email login is the intended path for backend alert sync.
- Staff-code login is still useful for local fallback, but it is not real authentication.
- Alert data can sync through Supabase when backend access is configured and allowed.
- Urgent alerts can send email through a Supabase Edge Function and Resend.
- Checklist, handover and cash/invoice signoff data can sync when using Email login.
- Staff-code activity still stays in the current browser/device unless exported/imported.
- Managers should export backups regularly from the dashboard.
- Use `Clear test logs` before starting a real pilot if test data should be removed.
- Time2Staff workers must enter their actual first name before using a checklist.
- Critical tasks should only be confirmed after a real physical check.
- This is not fully production-ready until all operational data and user management are migrated.

## Current Architecture

- React + Vite frontend
- GitHub Pages deployment
- Supabase Postgres for backend alert, checklist, handover and financial signoff records
- Supabase Auth for email/password sessions and user profiles
- Supabase Edge Functions for urgent alert email notification
- Resend email delivery
- localStorage fallback/cache for local app data and non-migrated modules

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

## v0.7 Operational Flow

- Staff can finish a shift and see a local summary.
- Today's overview is visible to all users for transparent team status.
- Alert manager creates alerts that sync to Supabase when authenticated/configured and fall back to localStorage when not.
- Phase 3C can require Email login for backend alert sync.
- Staff-code mode remains local-only/pending-auth when backend auth is required.
- Managers can acknowledge or resolve alerts.
- Managers can assign role-based responsibilities for shifts and events.
- Managers can manage staff codes from the manager dashboard after login.
- Managers can configure a local Youngs on-site check and temporary override.
- Julie/event floor managers see a dedicated Event Floor Manager dashboard.
- Closing and event flows can record cash/invoice signoff and asset checks.
- Closing shift includes Responsible closing control tasks.

Urgent alerts can send email through the configured Supabase Edge Function and Resend. There are no real push notifications yet.

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

When signed in with Supabase Email login, cash/invoice signoffs sync to `public.financial_signoffs`. Staff-code signoffs remain local-only fallback records until exported/imported or repeated while Email logged in.

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

## Supabase Phase 1.5

Phase 1/1.5 migrates alerts only. The app still works without Supabase env vars and keeps localStorage as fallback/cache.

Environment setup:

```bash
cp .env.example .env.local
```

Then fill:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_ORGANIZATION_ID=
VITE_REQUIRE_SUPABASE_AUTH_FOR_BACKEND=false
```

`VITE_SUPABASE_PUBLISHABLE_KEY` is also supported as an alternative to `VITE_SUPABASE_ANON_KEY`. `VITE_SUPABASE_ORGANIZATION_ID` is optional but recommended for keeping pilot alerts scoped to one organization and avoiding duplicate local alert IDs. No service role or secret key should be used in the frontend.

Schema setup:

1. Open Supabase SQL editor.
2. Run [supabase/schema.sql](supabase/schema.sql).
3. For this pilot phase, the schema includes anon read/insert/update policies for alerts.

The pilot RLS policies are not production security. Replace them with authenticated, role-aware RLS before using this as real multi-user operations software.

Alert behavior:

- If Supabase is configured, alerts load from Supabase and writes try Supabase first.
- Alerts poll Supabase every 15 seconds, refresh when the app tab becomes visible, and can be refreshed manually from Manager Dashboard or Staff Dashboard.
- localStorage remains a cache/fallback.
- If Supabase read/write fails, the app continues locally, marks affected alerts as pending backend sync, and shows calm backend status in Manager Dashboard.
- Pending local alerts retry syncing when alerts are refreshed or the backend becomes available again.
- JSON backup/export still includes alerts and does not depend on Supabase.

This is still not production security. The pilot RLS policies allow anonymous alert reads/writes for testing, and staff codes are not real authentication.

## Supabase Phase 2 urgent email notifications

Urgent alerts and alerts marked `Needs immediate help` can trigger an email notification to the manager. Email is sent by a Supabase Edge Function, not by the frontend directly.

The frontend never stores the Resend API key, Supabase service role key, or email secrets. These belong in Supabase Edge Function secrets only:

```bash
supabase secrets set RESEND_API_KEY=...
supabase secrets set ALERT_EMAIL_TO=...
supabase secrets set ALERT_EMAIL_FROM=...
```

Deploy the function:

```bash
supabase functions deploy send-alert-email
```

The function lives at [supabase/functions/send-alert-email/index.ts](supabase/functions/send-alert-email/index.ts). It uses `RESEND_API_KEY`, `ALERT_EMAIL_TO`, and `ALERT_EMAIL_FROM`, and sends through Resend with plain `fetch`.

If the Supabase CLI is not installed yet, the function can be deployed later after CLI setup. Resend sender domains should be verified before production use.

During this no-auth pilot, the frontend calls the Edge Function with the Supabase anon/publishable key. If JWT verification blocks browser invocation during pilot testing, deploy the function with the appropriate Supabase CLI option for the pilot, for example `--no-verify-jwt`, but do not treat that as production security.

Email failure does not block alert creation. Failed urgent/immediate-help email notifications can be retried by managers from the alert card.

## Supabase Phase 3A Auth foundation

Email/password Supabase Auth login is now supported alongside the old staff-code pilot login. Staff-code login remains available during transition, so Bobby is not locked out while Auth profiles are being set up.

There is no public signup, no public password reset, and no service role key in the frontend. Users must be created in Supabase first, then matched with a profile row in `public.user_profiles`.

Setup:

1. In Supabase Dashboard -> Authentication -> Users, create or invite the user.
2. Find the Auth user id.
3. Insert a matching profile row in SQL editor:

```sql
insert into public.user_profiles
(id, organization_id, display_name, role, active)
values
('AUTH_USER_ID_HERE', null, 'Bobby', 'manager', true);
```

Allowed profile roles:

- `manager`
- `shift_lead`
- `event_floor_manager`
- `staff`
- `time2staff`

`organization_id` can stay `null` during the pilot while existing alert rows are still unscoped/null. Later we should create/fill the real organization id and backfill records.

If login succeeds but no profile row exists, the app shows: `Login succeeded, but no Mesh Shift Log profile exists for this user.` If a profile is inactive, access is blocked with `This user is inactive. Contact manager.`

The app uses the official `@supabase/supabase-js` client for Auth session persistence and profile loading. The older REST wrapper remains only for the existing alert sync path.

Phase 3B adds authenticated, role-aware alert policies while keeping the existing anon pilot alert policies active so live alert sync and email notifications keep working during transition.

Next backend phase should add production Auth/RLS lockdown before moving more operational records.

## Supabase Phase 3B Auth-aware backend transition

Alerts now use authenticated Supabase backend requests when an email/password Supabase Auth session exists. The frontend still sends the anon/publishable key in the `apikey` header, but uses the signed-in user's session access token as the `Authorization` bearer token. Staff-code users continue to use the pilot anon backend path during this transition.

Alert rows now support optional Auth audit fields:

- `created_by_auth_user_id`
- `acknowledged_by_auth_user_id`
- `resolved_by_auth_user_id`
- `last_updated_by_auth_user_id`

The readable text fields such as `created_by`, `acknowledged_by`, and `resolved_by` remain in place for reports and daily operations.

Manager Dashboard now shows:

- backend request mode: `authenticated`, `pilot_anon`, or `local_fallback`
- whether alert requests are using an authenticated token
- current Auth user id and profile role when available
- a manager-only `Backend users / Supabase profiles` view for checking `public.user_profiles`

Run the updated schema before testing Phase 3B:

```sql
-- In Supabase SQL editor
-- Run the full contents of supabase/schema.sql
```

Create users in Supabase Dashboard -> Authentication -> Users, then insert matching profile rows:

```sql
insert into public.user_profiles
(id, organization_id, display_name, role, active)
values
('AUTH_USER_ID_HERE', null, 'Name', 'staff', true);
```

Use `manager`, `shift_lead`, `event_floor_manager`, `staff`, or `time2staff` for `role`.

Phase 3B intentionally keeps the anonymous pilot alert policies enabled so staff-code fallback, live alert sync, and urgent email notifications keep working while Auth is tested. Phase 3C should remove or limit anonymous alert read/write policies and require Supabase Auth for backend writes.

Before tightening RLS, test both Bobby staff-code login and Bobby Supabase email login, create an urgent alert, acknowledge/resolve it, retry email notification if needed, and confirm alerts still poll between mobile and PC.

## Supabase Phase 3C authenticated backend lockdown

Supabase Auth is now the intended backend path for alerts. Staff-code login remains available as a local/pilot fallback, but it may be local-only when backend auth is required.

Set this frontend flag only after Bobby email login has been tested locally:

```bash
VITE_REQUIRE_SUPABASE_AUTH_FOR_BACKEND=true
```

When the flag is `false`, the app keeps Phase 3B transition behavior:

- Supabase email users use authenticated backend requests.
- Staff-code users may still use pilot anon backend access if the database policies allow it.

When the flag is `true`:

- Supabase backend alert read/write only runs when an Email login session exists.
- Staff-code users can still use checklists and create local alerts.
- Staff-code-created alerts show `Saved locally. Email login required for backend sync.`
- Urgent email notifications require Email login.
- localStorage fallback/cache remains in place.

To lock down anonymous alert table access, run the updated [supabase/schema.sql](supabase/schema.sql). The Phase 3C section drops the pilot anon alert policies and revokes anon select/insert/update on `public.alerts`.

Rollout checklist:

1. Make sure Bobby email login works.
2. Make sure Bobby has an active `public.user_profiles` row with `role = 'manager'`.
3. Run the updated `supabase/schema.sql`.
4. Test Email login alert create/acknowledge/resolve.
5. Confirm `created_by_auth_user_id`, `acknowledged_by_auth_user_id`, and `resolved_by_auth_user_id` populate.
6. Test urgent email while email-authenticated.
7. Set `VITE_REQUIRE_SUPABASE_AUTH_FOR_BACKEND=true`.
8. Test staff-code login falls back local-only without errors.

Emergency rollback for anon alert access is included as a commented SQL snippet at the bottom of `supabase/schema.sql`.

Organization safety:

- Current pilot alerts may have `organization_id = null`.
- Current profiles may have `organization_id = null`.
- Phase 3C policies still allow null organization rows so Bobby does not lose visibility.
- Later, create a Mesh Youngstorget organization row, set Bobby/profile `organization_id`, backfill existing alerts, then tighten RLS to organization-only.

## Supabase Phase 4A shift/checklist backend foundation

Alerts were already backend-backed before Phase 4A. Phase 4A starts backend sync for the core operational shift records:

- `shift_sessions`
- `task_completions`
- `handover_notes`

Email login is required for real backend sync. Staff-code mode remains a local-only fallback and continues to save checklist activity in localStorage.

Still local-only/not backend-managed in Phase 4A:

- routine/task definitions and routine editor data
- full event floor model
- asset registry/checks
- staff-code management
- site/geofence settings
- backup/import system overhaul

Behavior:

- Checklist task changes update the UI and localStorage immediately.
- If the user is signed in with Supabase Email login, task completions sync to `public.task_completions`.
- Handover notes auto-save locally and sync to `public.handover_notes` after a short typing delay.
- Opening/using a checklist creates or updates a `public.shift_sessions` row.
- Finishing a shift updates `finished_at` and `status = 'finished'` when backend sync is available.
- If backend sync is unavailable, records remain local with calm pending/local status.

Setup:

1. Run the updated [supabase/schema.sql](supabase/schema.sql).
2. Confirm Bobby Email login works.
3. Confirm Bobby has an active `user_profiles` row.
4. Mark one checklist task done while Email logged in.
5. Verify a row appears in `public.task_completions`.
6. Save a handover note.
7. Verify a row appears in `public.handover_notes`.
8. Finish a shift.
9. Verify `public.shift_sessions.finished_at` and `status` update.

Useful Supabase SQL checks:

```sql
select *
from public.shift_sessions
order by created_at desc
limit 5;

select *
from public.task_completions
order by created_at desc
limit 5;

select *
from public.handover_notes
order by created_at desc
limit 5;
```

The Manager Dashboard includes a Phase 4A checklist backend status card showing backend mode, task/handover source, last Phase 4A action/result, whether a backend write was attempted, whether it succeeded, pending local counts, loaded backend row counts and last sync error.

Phase 4A.2 cross-device restore test:

1. On browser/device A, sign in with Supabase Email login.
2. Open `Opening shift`.
3. Mark one checklist task done.
4. Add a handover note.
5. On browser/device B, sign in with Supabase Email login.
6. Open the same date and `Opening shift`.
7. Wait for restore or tap `Refresh checklist from backend`.
8. Confirm the task appears done and the handover note appears.
9. On browser/device B, change the same task to `Not relevant`.
10. On browser/device A, tap `Refresh checklist from backend` and confirm the updated status appears.
11. Confirm Manager Dashboard progress does not double-count the same task.

The manager-only `Clear synced local checklist pending records` action removes only local pending task/handover records that already have matching synced backend-backed records in the local cache. It does not delete Supabase rows or unsynced local-only records.

## Supabase Phase 4B Manager backend history and daily report

Manager Dashboard can fetch historical shift/checklist data from Supabase for a selected date. Email login is required for backend history; staff-code mode remains a local-only fallback.

Backend history currently includes:

- `shift_sessions`
- `task_completions`
- `handover_notes`
- `alerts`
- `financial_signoffs`

The dashboard shows selected-date backend counts, a compact Last 7 days table, and a `Copy backend daily report` action. Backend daily reports prefer Supabase history when available and fall back to the existing local cache report if backend history cannot be fetched.

Reports may still exclude not-yet-migrated local modules:

- event floor full model
- assets
- routine editor changes

localStorage export/import still exists and remains useful for local fallback/cache data.

Phase 4B test:

1. Sign in with Supabase Email login.
2. Open a shift, complete one task and write a handover note.
3. Finish the shift.
4. Create a normal alert and an urgent alert.
5. Open Manager Dashboard.
6. Click `Refresh backend history` for today.
7. Confirm backend counts include shift sessions, task completions, handover notes and alerts.
8. Click `Copy backend daily report`.
9. Confirm the visible report includes the shift session, checklist counts, handover note and alerts.
10. Click `Last 7 days` and confirm the compact history table loads.
11. Sign in with staff-code mode and confirm backend history reports Email login required / local fallback.

## Supabase Phase 5A cash/invoice financial signoffs

Phase 5A migrates the existing cash/invoice signoff workflow into Supabase for Email login users. It does not migrate event floor models, assets or routine editor data.

Backend table:

- `financial_signoffs`

The existing closing/event cash form still saves immediately to localStorage first. If the user is signed in with Supabase Email login, the app then syncs the signoff to `public.financial_signoffs` in the background. If the user is in staff-code mode, the signoff remains local-only and the UI keeps working.

Manager Dashboard now includes:

- Phase 5A financial backend status
- manual `Refresh financial signoffs`
- cleanup for synced local financial pending records
- financial signoff counts in backend history
- financial signoffs in backend daily reports

Run the updated [supabase/schema.sql](supabase/schema.sql), then test:

1. Sign in with Supabase Email login.
2. Open Closing or Event shift.
3. Save a cash/invoice signoff.
4. Confirm a row appears in `public.financial_signoffs`.
5. Open Manager Dashboard and click `Refresh backend history`.
6. Confirm financial signoff counts appear.
7. Click `Copy backend daily report` and confirm the financial signoff section appears.
8. Sign in with staff-code mode and confirm cash/invoice still saves locally without crashing.

## Supabase Phase 4C backend history polish

Phase 4C improves Manager Dashboard backend history readability and backend daily report accuracy.

Important count labels:

- `Raw backend task rows` means the number of rows returned from Supabase `task_completions`.
- `Unique task records` means deduped logical checklist task records used for progress/reporting.
- `Done tasks` counts records with status `done`.
- `Not relevant tasks` counts records with status `not_relevant`.
- `Open/reset rows` counts records with status `open` or `reset` when those rows are stored.
- `Urgent alerts` counts alerts with severity `Urgent` or `needsImmediateHelp`.
- `Unresolved alerts` means alerts that are not `resolved`.

Alert history uses local-day boundaries against `created_at` and also includes rows with matching `alert_date`, reducing UTC off-by-one surprises in daily reports.

Backend daily reports now include:

- executive summary
- shift sessions with duration where available
- checklist progress by shift using recorded backend task rows
- handover notes
- urgent/open alerts first
- financial signoffs
- data notes and limitations

Still not backend-migrated:

- full event floor model
- assets
- routine editor changes

Phase 4C report test:

1. Sign in with Supabase Email login as a manager.
2. Refresh backend history for today.
3. Confirm raw task rows and unique task records are clearly labeled.
4. Click `Copy backend daily report`.
5. Paste into plain text and confirm it includes executive summary, shift sessions, checklist progress by shift, handover notes, alerts and data notes.
6. Test a date with no backend data and confirm calm empty-state messages.
7. Click `Last 7 days` and confirm Date, sessions, finished shifts, unique task records, done/N/A, handovers, alerts, urgent and open alert counts are readable.

## Backend Schema Notes

- [supabase/schema.sql](supabase/schema.sql) is the current source of truth for Supabase tables, policies, triggers and helper functions.
- Keep a copy of the current schema before future destructive changes.
- Phase 3C removes anon alert table policies and expects Supabase Auth for backend alert access.
- An emergency anon-policy rollback snippet is included at the bottom of `supabase/schema.sql`.
- Organization scoping is intentionally loose during the pilot because old alert/profile rows may still have `organization_id = null`.

## Production Readiness Checklist

- All staff should use Supabase Email login.
- Create `user_profiles` rows for all staff.
- Assign roles for manager, shift lead, event floor manager, staff and Time2Staff users.
- Confirm Phase 3C lockdown is active.
- Confirm anon alert database policies are removed.
- Confirm urgent email notifications work.
- Confirm backup/export still works.
- Confirm manager has emergency recovery and rollback instructions.
- Later: migrate routine definitions, events, assets and staff management to backend.
- Later: remove or restrict staff-code fallback.
- Later: backfill `organization_id`.
- Later: tighten RLS fully by `organization_id`.

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

- Staff-code checklist/task activity remains local-only unless exported/imported.
- Events, assets and routines are not fully backend-migrated yet.
- Staff-code login is not real security.
- There is no full backend admin user creation flow yet.
- There are no push notifications yet.
- There is no full event/calendar integration yet.
- There is no full organization backfill yet.
- Geolocation check is a local pilot guardrail, not real security
- Export/import is needed for backup and sharing data
- Manager routine edits are local until exported/imported elsewhere
- localStorage remains fallback/cache for local data
- Offline app shell may require one successful online visit first
