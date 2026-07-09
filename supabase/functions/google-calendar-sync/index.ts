import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SyncPayload = {
  sourceId?: string;
  timeMin?: string;
  timeMax?: string;
};

type CalendarSource = {
  id: string;
  organization_id: string;
  provider: string;
  name: string;
  calendar_id: string | null;
  active: boolean;
  settings?: Record<string, any> | null;
};

type IcsContentLine = {
  name: string;
  params: Record<string, string>;
  value: string;
};

type ParsedIcsEvent = Record<string, IcsContentLine | undefined>;

const GOOGLE_API_PRESET_ALIASES = new Set([
  'MY_0_COMMUNITY_STAGE_200',
  'MY_1_BAR_20',
  'MY_0_001_16',
  'MY_0_002_7',
  'MY_0_003_7',
  'MY_0_004_5',
  'MY_0_006_CISCO_WEBEX_8',
  'MY_0_007_CISCO_WEBEX_12',
  'MY_1_MEZZANINE_BOARDROOM_MEZZ_16',
]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function unfoldIcsLines(icsText: string) {
  const rawLines = icsText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const lines: string[] = [];
  rawLines.forEach((line) => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim()) {
      lines.push(line);
    }
  });
  return lines;
}

function parseIcsLine(line: string): IcsContentLine | null {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex < 0) return null;
  const nameAndParams = line.slice(0, separatorIndex);
  const value = line.slice(separatorIndex + 1);
  const [rawName, ...rawParams] = nameAndParams.split(';');
  const params: Record<string, string> = {};
  rawParams.forEach((param) => {
    const [key, ...rest] = param.split('=');
    if (key) params[key.toUpperCase()] = rest.join('=').replaceAll('"', '');
  });
  return { name: rawName.toUpperCase(), params, value };
}

function unescapeIcsText(value = '') {
  return value
    .replaceAll(/\\n/gi, '\n')
    .replaceAll('\\,', ',')
    .replaceAll('\\;', ';')
    .replaceAll('\\\\', '\\')
    .trim();
}

function formatDateParts(value: string) {
  const date = value.slice(0, 8);
  const time = value.includes('T') ? value.split('T')[1].replace('Z', '') : '';
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(4, 6)),
    day: Number(date.slice(6, 8)),
    hour: Number(time.slice(0, 2) || '0'),
    minute: Number(time.slice(2, 4) || '0'),
    second: Number(time.slice(4, 6) || '0'),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToIso(value: string, timeZone: string) {
  const parts = formatDateParts(value);
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function parseIcsDate(line?: IcsContentLine) {
  if (!line?.value) return { iso: null, allDay: false };
  const value = line.value.trim();
  const valueType = line.params.VALUE?.toUpperCase();
  const timeZone = line.params.TZID || '';
  if (valueType === 'DATE' || /^\d{8}$/.test(value)) {
    const { year, month, day } = formatDateParts(value);
    return { iso: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString(), allDay: true };
  }
  if (value.endsWith('Z')) {
    const parts = formatDateParts(value);
    return { iso: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)).toISOString(), allDay: false };
  }
  return { iso: zonedDateTimeToIso(value, timeZone || 'Europe/Oslo'), allDay: false };
}

function parseIcsEvents(icsText: string) {
  const lines = unfoldIcsLines(icsText);
  const events: ParsedIcsEvent[] = [];
  let current: ParsedIcsEvent | null = null;
  lines.forEach((rawLine) => {
    const line = parseIcsLine(rawLine);
    if (!line) return;
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') {
      current = {};
      return;
    }
    if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') {
      if (current) events.push(current);
      current = null;
      return;
    }
    if (current) current[line.name] = line;
  });
  return events;
}

function parseIcsCalendarMetadata(icsText: string) {
  const lines = unfoldIcsLines(icsText);
  let calendarName = '';
  let calendarTimezone = '';
  lines.forEach((rawLine) => {
    const line = parseIcsLine(rawLine);
    if (!line) return;
    if (line.name === 'X-WR-CALNAME' && !calendarName) calendarName = unescapeIcsText(line.value);
    if (line.name === 'X-WR-TIMEZONE' && !calendarTimezone) calendarTimezone = unescapeIcsText(line.value);
  });
  return { calendarName: calendarName || null, calendarTimezone: calendarTimezone || null };
}

function normalizeCalendarAlias(value = '') {
  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}

function icsEventHasRecurrence(event: ParsedIcsEvent) {
  return Boolean(event.RRULE || event.RDATE || event.EXDATE);
}

function eventOverlapsRange(row: Record<string, unknown>, timeMin?: string, timeMax?: string) {
  const startsAt = row.starts_at ? new Date(String(row.starts_at)).getTime() : null;
  const endsAt = row.ends_at ? new Date(String(row.ends_at)).getTime() : startsAt;
  const min = timeMin ? new Date(timeMin).getTime() : null;
  const max = timeMax ? new Date(timeMax).getTime() : null;
  if (max && startsAt && startsAt > max) return false;
  if (min && endsAt && endsAt < min) return false;
  return true;
}

function analyzeIcsRows(parsedEvents: ParsedIcsEvent[], rows: Array<Record<string, unknown>>, timeMin?: string, timeMax?: string) {
  const min = timeMin ? new Date(timeMin).getTime() : null;
  const max = timeMax ? new Date(timeMax).getTime() : null;
  const validDateRows = rows.filter((row) => row.starts_at && !Number.isNaN(new Date(String(row.starts_at)).getTime()));
  let skippedBeforeRange = 0;
  let skippedAfterRange = 0;
  const inRangeRows = validDateRows.filter((row) => {
    const startsAt = new Date(String(row.starts_at)).getTime();
    const endsAt = row.ends_at && !Number.isNaN(new Date(String(row.ends_at)).getTime())
      ? new Date(String(row.ends_at)).getTime()
      : startsAt;
    if (min && endsAt < min) {
      skippedBeforeRange += 1;
      return false;
    }
    if (max && startsAt > max) {
      skippedAfterRange += 1;
      return false;
    }
    return true;
  });
  const starts = validDateRows
    .map((row) => String(row.starts_at))
    .sort();
  const recurringEventCount = parsedEvents.filter(icsEventHasRecurrence).length;
  const eventSummaries = validDateRows
    .map((row) => ({
      title: String(row.title || 'Untitled event'),
      startsAt: row.starts_at || null,
    }))
    .sort((first, second) => String(first.startsAt || '').localeCompare(String(second.startsAt || '')));
  const inRangeSummaries = inRangeRows
    .map((row) => ({
      title: String(row.title || 'Untitled event'),
      startsAt: row.starts_at || null,
    }))
    .sort((first, second) => String(first.startsAt || '').localeCompare(String(second.startsAt || '')));
  const parserWarnings: string[] = [];
  if (!parsedEvents.length) parserWarnings.push('No VEVENT entries were found in the iCal feed.');
  if (rows.length && !validDateRows.length) parserWarnings.push('VEVENT entries were found, but no valid DTSTART values were parsed.');
  if (recurringEventCount) {
    parserWarnings.push('Recurring iCal events were detected. This importer does not expand recurring events yet, so future occurrences may not appear.');
  }
  if (validDateRows.length && !inRangeRows.length) parserWarnings.push('Events were parsed, but none were inside the selected date range.');

  return {
    rows: inRangeRows,
    diagnostics: {
      veventCount: parsedEvents.length,
      parsedEventCount: rows.length,
      validDateEventCount: validDateRows.length,
      inRangeEventCount: inRangeRows.length,
      skippedBeforeRange,
      skippedAfterRange,
      skippedMissingDate: rows.length - validDateRows.length,
      recurringEventCount,
      firstParsedStart: starts[0] || null,
      lastParsedStart: starts[starts.length - 1] || null,
      sampleTitles: rows.slice(0, 3).map((row) => String(row.title || 'Untitled event')),
      firstEvents: eventSummaries.slice(0, 3),
      lastEvents: eventSummaries.slice(-3),
      inRangeEvents: inRangeSummaries.slice(0, 10),
      parserWarnings,
    },
  };
}

function calendarSyncDebugEnabled(request: Request) {
  if (Deno.env.get('DEBUG_CALENDAR_SYNC') === 'true') return true;
  const origin = request.headers.get('origin') || '';
  return origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('[::1]');
}

function normalizeIcsEvent(event: ParsedIcsEvent, source: CalendarSource) {
  const start = parseIcsDate(event.DTSTART);
  const end = parseIcsDate(event.DTEND);
  const title = unescapeIcsText(event.SUMMARY?.value || 'Untitled event');
  const startsAt = start.iso;
  const endsAt = end.iso;
  const uid = event.UID?.value?.trim();
  const fallbackId = `ics-${base64Url(`${title}|${startsAt || ''}|${endsAt || ''}`).slice(0, 96)}`;
  return {
    organization_id: source.organization_id,
    source_id: source.id,
    provider: 'google_ics',
    provider_event_id: uid || fallbackId,
    provider_calendar_id: source.calendar_id,
    ical_uid: uid || null,
    title,
    description: unescapeIcsText(event.DESCRIPTION?.value || '') || null,
    location: unescapeIcsText(event.LOCATION?.value || '') || null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: start.allDay,
    status: event.STATUS?.value || null,
    html_link: null,
    raw_payload: {
      mode: 'ics',
      uid: uid || null,
      summary: title,
      description: unescapeIcsText(event.DESCRIPTION?.value || '') || null,
      location: unescapeIcsText(event.LOCATION?.value || '') || null,
      dtstart: event.DTSTART?.value || null,
      dtend: event.DTEND?.value || null,
      status: event.STATUS?.value || null,
      lastModified: event['LAST-MODIFIED']?.value || null,
      dtstamp: event.DTSTAMP?.value || null,
      recurrenceUnsupported: Boolean(event.RRULE),
    },
    imported_at: new Date().toISOString(),
    provider_updated_at: parseIcsDate(event['LAST-MODIFIED'] || event.DTSTAMP).iso,
  };
}

function base64Url(input: string | ArrayBuffer) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function pemToArrayBuffer(pem: string) {
  const clean = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replaceAll(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signJwt(privateKeyPem: string, header: Record<string, unknown>, claims: Record<string, unknown>) {
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedClaims = base64Url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

async function getGoogleAccessToken() {
  const clientEmail = Deno.env.get('GOOGLE_CALENDAR_CLIENT_EMAIL');
  const privateKeyRaw = Deno.env.get('GOOGLE_CALENDAR_PRIVATE_KEY');
  const privateKeyId = Deno.env.get('GOOGLE_CALENDAR_PRIVATE_KEY_ID') || undefined;
  const impersonatedUser = Deno.env.get('GOOGLE_CALENDAR_IMPERSONATED_USER') || undefined;
  const scopes = Deno.env.get('GOOGLE_CALENDAR_SCOPES') || 'https://www.googleapis.com/auth/calendar.readonly';

  if (!clientEmail || !privateKeyRaw) {
    return {
      ok: false,
      error: 'Google Calendar sync is not configured on the server.',
    };
  }

  const privateKey = privateKeyRaw.replaceAll('\\n', '\n');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    privateKey,
    { alg: 'RS256', typ: 'JWT', ...(privateKeyId ? { kid: privateKeyId } : {}) },
    {
      iss: clientEmail,
      scope: scopes,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      ...(impersonatedUser ? { sub: impersonatedUser } : {}),
    },
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: body.error_description || body.error || `Google auth failed with ${response.status}`,
    };
  }
  return { ok: true, accessToken: body.access_token as string };
}

function normalizeGoogleEvent(event: Record<string, any>, source: CalendarSource, googleCalendarId: string, provider = 'google_api') {
  const start = event.start || {};
  const end = event.end || {};
  const allDay = Boolean(start.date && !start.dateTime);
  return {
    organization_id: source.organization_id,
    source_id: source.id,
    provider,
    provider_event_id: String(event.id || ''),
    provider_calendar_id: googleCalendarId,
    ical_uid: event.iCalUID || null,
    title: event.summary || 'Untitled event',
    description: event.description || null,
    location: event.location || null,
    starts_at: start.dateTime || (start.date ? `${start.date}T00:00:00Z` : null),
    ends_at: end.dateTime || (end.date ? `${end.date}T00:00:00Z` : null),
    all_day: allDay,
    status: event.status || null,
    html_link: event.htmlLink || null,
    raw_payload: { ...event, metadata: { mode: provider } },
    imported_at: new Date().toISOString(),
    provider_updated_at: event.updated || null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Calendar sync backend is not configured.' }, 500);
  }

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  let payload: SyncPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }
  if (!payload.sourceId) return jsonResponse({ ok: false, error: 'sourceId is required.' }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult?.user?.id) {
    return jsonResponse({ ok: false, error: 'Authentication required.' }, 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('id, organization_id, role, active, is_shared_device')
    .eq('id', userResult.user.id)
    .maybeSingle();
  const profileDebugEnabled = Deno.env.get('DEBUG_CALENDAR_SYNC') === 'true';

  if (profileError || !profile?.active) {
    return jsonResponse({
      ok: false,
      error: 'Active user profile required.',
      ...(profileDebugEnabled
        ? {
            debug: {
              authUserId: userResult.user.id,
              authUserEmail: userResult.user.email || null,
              profileFound: Boolean(profile),
              profileActive: profile?.active ?? null,
              profileRole: profile?.role ?? null,
              profileOrganizationId: profile?.organization_id ?? null,
              profileIsSharedDevice: profile?.is_shared_device ?? null,
              profileErrorMessage: profileError?.message || null,
              supabaseUrlConfigured: Boolean(supabaseUrl),
              anonKeyConfigured: Boolean(anonKey),
              serviceRoleKeyConfigured: Boolean(serviceRoleKey),
            },
          }
        : {}),
    }, 403);
  }
  if (profile.is_shared_device || !['manager', 'event_floor_manager'].includes(profile.role)) {
    return jsonResponse({ ok: false, error: 'Only managers and Event Floor Managers can sync calendar events.' }, 403);
  }

  const { data: source, error: sourceError } = await adminClient
    .from('event_calendar_sources')
    .select('*')
    .eq('id', payload.sourceId)
    .eq('organization_id', profile.organization_id)
    .eq('active', true)
    .maybeSingle();

  if (sourceError || !source) return jsonResponse({ ok: false, error: 'Calendar source not found.' }, 404);
  const calendarSource = source as CalendarSource;

  const { data: run } = await adminClient
    .from('calendar_import_runs')
    .insert({
      organization_id: profile.organization_id,
      source_id: calendarSource.id,
      provider: 'google',
      status: 'running',
      created_by: userResult.user.id,
      metadata: { timeMin: payload.timeMin || null, timeMax: payload.timeMax || null },
    })
    .select('*')
    .single();

  async function finishRun(patch: Record<string, unknown>) {
    if (!run?.id) return;
    await adminClient
      .from('calendar_import_runs')
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq('id', run.id);
  }

  const sourceAliasForDiagnostics = normalizeCalendarAlias(calendarSource.calendar_id || '');
  const sourceSettingsPresent = Boolean(calendarSource.settings && Object.keys(calendarSource.settings).length);
  const sourceSettingsKeys = Object.keys(calendarSource.settings || {});
  const sourceLooksLikeGoogleApiPreset = GOOGLE_API_PRESET_ALIASES.has(sourceAliasForDiagnostics);
  const importMode = String(calendarSource.settings?.importMode || 'ics');
  const includeDiagnostics = calendarSyncDebugEnabled(request);

  if (importMode === 'google_api') {
    const googleCalendarId = String(calendarSource.settings?.googleCalendarId || '').trim();
    if (!googleCalendarId) {
      const error = 'Google Calendar ID is missing for this source.';
      await finishRun({ status: 'failed', error_message: error });
      return jsonResponse({ ok: false, mode: 'google_api_missing_calendar_id', error });
    }
    const googleAuth = await getGoogleAccessToken();
    if (!googleAuth.ok) {
      const error = 'Google API credentials are not configured on the server.';
      await finishRun({ status: 'failed', error_message: error });
      return jsonResponse({ ok: false, mode: 'google_api_not_configured', error });
    }
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (payload.timeMin) params.set('timeMin', payload.timeMin);
    if (payload.timeMax) params.set('timeMax', payload.timeMax);
    const googleResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(googleCalendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${googleAuth.accessToken}` } },
    );
    const googleBody = await googleResponse.json().catch(() => ({}));
    if (!googleResponse.ok) {
      const error = googleBody.error?.message || `Google Calendar API failed with ${googleResponse.status}`;
      await finishRun({ status: 'failed', error_message: error });
      return jsonResponse({
        ok: false,
        mode: 'google_api_error',
        error: 'Google API could not access this calendar. Check service account/domain-wide delegation/calendar sharing.',
        apiWarning: error,
        ...(includeDiagnostics
          ? {
              diagnostics: {
                sourceName: calendarSource.name,
                sourceAlias: normalizeCalendarAlias(calendarSource.calendar_id || ''),
                importMode: 'google_api',
                sourceSettingsPresent,
                sourceSettingsKeys,
                googleCalendarIdPresent: Boolean(googleCalendarId),
                impersonatedUserConfigured: Boolean(Deno.env.get('GOOGLE_CALENDAR_IMPERSONATED_USER')),
                fetchedItemCount: 0,
                syncedCount: 0,
                apiWarning: error,
              },
            }
          : {}),
      }, 502);
    }
    const items = Array.isArray(googleBody.items) ? googleBody.items : [];
    const rows = items
      .filter((event: Record<string, unknown>) => event.id)
      .map((event: Record<string, any>) => normalizeGoogleEvent(event, calendarSource, googleCalendarId, 'google_api'));
    let syncedCount = 0;
    if (rows.length) {
      const { error: upsertError } = await adminClient
        .from('external_calendar_events')
        .upsert(rows, { onConflict: 'organization_id,source_id,provider_event_id' });
      if (upsertError) {
        await finishRun({ status: 'failed', error_message: upsertError.message });
        return jsonResponse({ ok: false, error: upsertError.message }, 500);
      }
      syncedCount = rows.length;
    }
    await adminClient
      .from('event_calendar_sources')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', calendarSource.id);
    await finishRun({ status: 'success', imported_count: syncedCount, metadata: { timeMin: payload.timeMin || null, timeMax: payload.timeMax || null, mode: 'google_api' } });
    const eventSummaries = rows
      .map((row) => ({ title: String(row.title || 'Untitled event'), startsAt: row.starts_at || null }))
      .sort((first, second) => String(first.startsAt || '').localeCompare(String(second.startsAt || '')));
    return jsonResponse({
      ok: true,
      mode: 'google_api',
      syncedCount,
      importedCount: syncedCount,
      skippedCount: Math.max(0, items.length - rows.length),
      runId: run?.id || null,
      ...(includeDiagnostics
        ? {
            diagnostics: {
              sourceName: calendarSource.name,
              sourceAlias: normalizeCalendarAlias(calendarSource.calendar_id || ''),
              importMode: 'google_api',
              sourceSettingsPresent,
              sourceSettingsKeys,
              googleCalendarIdPresent: Boolean(googleCalendarId),
              impersonatedUserConfigured: Boolean(Deno.env.get('GOOGLE_CALENDAR_IMPERSONATED_USER')),
              fetchedItemCount: items.length,
              syncedCount,
              firstEvents: eventSummaries.slice(0, 5),
              lastEvents: eventSummaries.slice(-5),
            },
          }
        : {}),
    });
  }

  if (importMode === 'ics') {
    const sourceAlias = normalizeCalendarAlias(calendarSource.calendar_id || '');
    const expectedSecretName = sourceAlias ? `GOOGLE_CALENDAR_ICS_URL_${sourceAlias}` : null;
    const specificIcsUrl = expectedSecretName ? Deno.env.get(expectedSecretName) : '';
    const globalIcsUrl = sourceAlias ? '' : Deno.env.get('GOOGLE_CALENDAR_ICS_URL');
    const icsUrl = sourceAlias ? specificIcsUrl : globalIcsUrl;
    if (!icsUrl) {
      if (expectedSecretName) {
        await finishRun({ status: 'failed', error_message: 'No iCal secret configured for this calendar source.' });
        return jsonResponse({
          ok: false,
          mode: 'ics_missing_source_secret',
          error: 'No iCal secret configured for this calendar source.',
          expectedSecretName,
          sourceAlias,
          ...(includeDiagnostics
            ? {
                diagnostics: {
                  sourceName: calendarSource.name,
                  sourceAlias,
                  expectedSecretName,
                  importMode,
                  sourceSettingsPresent,
                  sourceSettingsKeys,
                  parserWarnings: sourceLooksLikeGoogleApiPreset && !calendarSource.settings?.importMode
                    ? ['This source looks like a Google API preset but settings.importMode is missing.']
                    : [],
                },
              }
            : {}),
        });
      }
      const error = 'Calendar iCal sync is not configured. Add a source alias or configure GOOGLE_CALENDAR_ICS_URL.';
      await finishRun({ status: 'failed', error_message: error });
      return jsonResponse({ ok: false, mode: 'not_configured', error });
    }

    const icsResponse = await fetch(icsUrl);
    if (!icsResponse.ok) {
      const error = `iCal feed failed with ${icsResponse.status}`;
      await finishRun({ status: 'failed', error_message: error });
      return jsonResponse({ ok: false, error }, 502);
    }

    const icsText = await icsResponse.text();
    const parsedEvents = parseIcsEvents(icsText);
    const calendarMetadata = parseIcsCalendarMetadata(icsText);
    const parsedRows = parsedEvents
      .map((event) => normalizeIcsEvent(event, calendarSource))
      .filter((row) => row.provider_event_id);
    const analysis = analyzeIcsRows(parsedEvents, parsedRows, payload.timeMin, payload.timeMax);
    const rows = analysis.rows;
    const metadataWarnings = sourceLooksLikeGoogleApiPreset && !calendarSource.settings?.importMode
      ? ['This source looks like a Google API preset but settings.importMode is missing.']
      : [];
    const diagnostics = {
      mode: 'ics',
      sourceName: calendarSource.name,
      sourceAlias,
      expectedSecretName,
      importMode,
      sourceSettingsPresent,
      sourceSettingsKeys,
      usedSpecificIcsSecret: Boolean(specificIcsUrl),
      fallbackGlobalIcsSecretUsed: !specificIcsUrl && Boolean(globalIcsUrl),
      ...calendarMetadata,
      fetchedBytes: new TextEncoder().encode(icsText).length,
      ...analysis.diagnostics,
      parserWarnings: [...metadataWarnings, ...(analysis.diagnostics.parserWarnings || [])],
    };
    let syncedCount = 0;
    if (rows.length) {
      const { error: upsertError } = await adminClient
        .from('external_calendar_events')
        .upsert(rows, { onConflict: 'organization_id,source_id,provider_event_id' });
      if (upsertError) {
        await finishRun({ status: 'failed', error_message: upsertError.message });
        return jsonResponse({ ok: false, error: upsertError.message }, 500);
      }
      syncedCount = rows.length;
    }

    await adminClient
      .from('event_calendar_sources')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', calendarSource.id);
    await finishRun({
      status: 'success',
      imported_count: syncedCount,
      metadata: {
        timeMin: payload.timeMin || null,
        timeMax: payload.timeMax || null,
        mode: 'ics',
        recurrenceNote: 'ICS recurring events may not fully expand yet.',
      },
    });

    return jsonResponse({
      ok: true,
      mode: 'ics',
      syncedCount,
      importedCount: syncedCount,
      skippedCount: Math.max(0, parsedEvents.length - rows.length),
      runId: run?.id || null,
      note: 'ICS recurring events may not fully expand yet.',
      ...(includeDiagnostics ? { diagnostics } : {}),
    });
  }

  const error = `Unknown calendar import mode: ${importMode}`;
  await finishRun({ status: 'failed', error_message: error });
  return jsonResponse({ ok: false, mode: 'unknown_import_mode', error }, 400);
});
