const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AlertEmailPayload = {
  severity?: string;
  category?: string;
  area?: string;
  createdBy?: string;
  message?: string;
  needsImmediateHelp?: boolean;
  createdAt?: string;
  appUrl?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isUrgent(payload: AlertEmailPayload) {
  return payload.severity === 'Urgent' || payload.needsImmediateHelp === true;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  let payload: AlertEmailPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const requiredFields: Array<keyof AlertEmailPayload> = ['severity', 'category', 'area', 'createdBy', 'message', 'createdAt'];
  const missing = requiredFields.filter((field) => !String(payload[field] ?? '').trim());
  if (missing.length) {
    return jsonResponse({ ok: false, error: `Missing required fields: ${missing.join(', ')}` }, 400);
  }

  if (!isUrgent(payload)) {
    return jsonResponse({ ok: true, skipped: true, reason: 'Email notification not required.' });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailTo = Deno.env.get('ALERT_EMAIL_TO');
  const emailFrom = Deno.env.get('ALERT_EMAIL_FROM');

  if (!resendApiKey || !emailTo || !emailFrom) {
    return jsonResponse({ ok: false, error: 'Email notification is not configured.' }, 500);
  }

  const subject = `Urgent Mesh Shift Log alert: ${payload.category} / ${payload.area}`;
  const needsHelp = payload.needsImmediateHelp ? 'Yes' : 'No';
  const appLine = payload.appUrl ? `App URL: ${payload.appUrl}\n` : '';
  const text = [
    subject,
    '',
    `Severity: ${payload.severity}`,
    `Category: ${payload.category}`,
    `Area: ${payload.area}`,
    `Created by: ${payload.createdBy}`,
    `Message: ${payload.message}`,
    `Needs immediate help: ${needsHelp}`,
    `Created at: ${payload.createdAt}`,
    appLine.trim(),
    '',
    'Open Mesh Shift Log Manager Dashboard to acknowledge or resolve.',
  ].filter(Boolean).join('\n');

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <ul>
      <li><strong>Severity:</strong> ${escapeHtml(payload.severity)}</li>
      <li><strong>Category:</strong> ${escapeHtml(payload.category)}</li>
      <li><strong>Area:</strong> ${escapeHtml(payload.area)}</li>
      <li><strong>Created by:</strong> ${escapeHtml(payload.createdBy)}</li>
      <li><strong>Message:</strong> ${escapeHtml(payload.message)}</li>
      <li><strong>Needs immediate help:</strong> ${escapeHtml(needsHelp)}</li>
      <li><strong>Created at:</strong> ${escapeHtml(payload.createdAt)}</li>
      ${payload.appUrl ? `<li><strong>App URL:</strong> <a href="${escapeHtml(payload.appUrl)}">${escapeHtml(payload.appUrl)}</a></li>` : ''}
    </ul>
    <p>Open Mesh Shift Log Manager Dashboard to acknowledge or resolve.</p>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [emailTo],
      subject,
      text,
      html,
    }),
  });

  const resendBody = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    return jsonResponse({
      ok: false,
      error: resendBody.message || resendBody.error || `Resend failed with ${resendResponse.status}`,
    }, 502);
  }

  return jsonResponse({ ok: true, id: resendBody.id || null });
});
