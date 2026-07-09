# Supabase Realtime Roadmap

## Now in Supabase

- Event Operations boards (`event_operations`)
- Event staff presence (`event_staff_presence`)
- Event role assignments (`event_role_assignments`)
- Event tasks (`event_tasks`)
- Event responsibility handovers (`event_responsibility_handovers`)
- Daily event access codes (`event_access_codes`)
- Calendar import sources and imported calendar events (`event_calendar_sources`, `external_calendar_events`)
- Calendar import runs and event-board links (`calendar_import_runs`, `event_operation_calendar_links`)

## Still using localStorage

- Shared-device current operator and shift scope convenience state
- Event code validation cache for the current Oslo date/operator
- Selected event board/view/filter convenience state
- Routine editor/default routine overrides
- Some checklist/offline cache state and pending sync queues
- UI preferences and temporary local status messages

LocalStorage remains in this phase so existing Workbar Device, offline fallback and operator switching flows keep working while realtime is introduced safely.

## Recommended migration order

1. Event Operations realtime
2. Workbar Device operator/session cleanup
3. Shift routine completions
4. Guides/preferences
5. Offline fallback/sync queue

## Google Calendar sync setup

- Google service account credentials must be configured as Supabase Edge Function secrets.
- The target Google Calendar must be shared with the service account email, or domain-wide delegation/impersonation must be configured.
- Calendar import supports two modes: iCal alias mode and Google Calendar API mode.
- iCal alias mode is simpler, but requires Google Calendar "Secret address in iCal format".
- Google Calendar API mode is for resource calendars and room calendars where iCal secret URLs are unavailable.
- Google API mode stores only the Google Calendar ID in `event_calendar_sources.settings.googleCalendarId`. Service account JSON/private keys must never be stored in frontend, Git or database.
- Google API setup requires Google Calendar API enabled, service account credentials as Supabase Edge Function secrets, and either calendar sharing with the service account or domain-wide delegation/impersonated user with access.
- Quick setup can use the Google Calendar secret iCal address as the `GOOGLE_CALENDAR_ICS_URL` Supabase Edge Function secret. This avoids Google Cloud Console for now.
- Treat the secret iCal address as a password. Do not paste it into chat, frontend code, Git or public docs.
- Mesh Youngstorget uses multiple event calendars/resources. Each source should store only a safe alias in the app, while the actual iCal URL stays as a Supabase Edge Function secret.
- Example: source name `MY-1-Bar (20)`, alias `MY_1_BAR_20`, Supabase secret `GOOGLE_CALENDAR_ICS_URL_MY_1_BAR_20`.
- Current event calendar aliases: `MY_0_COMMUNITY_STAGE_200`, `MY_1_ATRIUM_100`, `MY_1_BAR_20`, `MY_1_LOUNGE_VENUE_40`, `MY_1_WORKBAR_100`.
- The iCal-ready model requires one Supabase secret per calendar source. Do not silently use the global `GOOGLE_CALENDAR_ICS_URL` fallback for named aliases, because that can import the wrong calendar under the wrong source.
- Only sources without an alias may use the global `GOOGLE_CALENDAR_ICS_URL` fallback for backward compatibility.
- If a Google Calendar/resource does not expose Secret address in iCal format, do not use a public iCal link for internal calendars. Mark it as API/admin-required.
- Calendars without iCal secrets need either Workspace admin access or Google Calendar API/service account later.
- If expected events do not appear, open the event in Google Calendar and confirm which calendar/resource it belongs to.
- The app must never store Google private keys or calendar credentials in frontend code.
- Calendar descriptions may contain internal event details, so only managers and Event Floor Managers can read imported calendar details.
- ICS recurring events may not fully expand yet. Google API sync may still be needed later if recurring bookings are not represented correctly.
- Meeting room calendars will be added later for daily operations/opening shift: `MY_0_001_16`, `MY_0_002_7`, `MY_0_003_7`, `MY_0_004_5`, `MY_0_006_CISCO_WEBEX_8`, `MY_0_007_CISCO_WEBEX_12`.

## Risks to watch

- Auth/session edge cases when shared devices switch operators
- Location guard blocking expected operational writes
- Event code and notification gating during operator changes
- RLS and organization scoping for imported calendar details
- Realtime reconnect behavior and refresh storms
- Staff seeing stale tasks if localStorage state is not cleared correctly

## Realtime policy

Realtime is used as a refresh signal only. The app reloads Event Operations data through existing Supabase client functions after realtime changes. Realtime payloads are not trusted as authorization or source-of-truth data.
