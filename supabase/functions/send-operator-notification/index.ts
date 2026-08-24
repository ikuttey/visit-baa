import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('NOTIFICATION_FROM_EMAIL') || '';
const SITE_URL = Deno.env.get('VISIT_BAA_SITE_URL') || 'https://ikuttey.github.io/visit-baa/';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
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

function internalActionUrl(actionUrl: string | null | undefined) {
  if (!actionUrl) return SITE_URL;
  try {
    const base = new URL(SITE_URL);
    const resolved = new URL(actionUrl, base);
    if (resolved.origin !== base.origin) return SITE_URL;
    return resolved.toString();
  } catch {
    return SITE_URL;
  }
}

async function rest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', SERVICE_ROLE_KEY);
  headers.set('authorization', `Bearer ${SERVICE_ROLE_KEY}`);
  headers.set('content-type', 'application/json');
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

async function patchNotification(id: string, values: Record<string, unknown>) {
  await rest(`operator_notifications?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(values)
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Supabase server credentials are unavailable' }, 500);

  let payload: any;
  try { payload = await request.json(); }
  catch { return json({ error: 'Invalid JSON payload' }, 400); }

  const notificationId = payload?.notification_id || payload?.record?.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(notificationId || ''))) {
    return json({ error: 'A valid notification id is required' }, 400);
  }

  const notificationResponse = await rest(
    `operator_notifications?id=eq.${encodeURIComponent(notificationId)}&select=id,operator_id,business_id,type,title,message,action_url,email_status,email_sent_at&limit=1`
  );
  if (!notificationResponse.ok) return json({ error: 'Notification lookup failed' }, 500);
  const notifications = await notificationResponse.json();
  const notification = notifications?.[0];
  if (!notification) return json({ error: 'Notification not found' }, 404);
  if (notification.email_sent_at || notification.email_status === 'sent') return json({ ok: true, status: 'already_sent' });

  if (!RESEND_API_KEY || !FROM_EMAIL) {
    await patchNotification(notification.id, {
      email_status: 'pending',
      email_error: 'Email delivery is waiting for RESEND_API_KEY and NOTIFICATION_FROM_EMAIL.'
    });
    return json({ ok: true, status: 'email_not_configured' }, 202);
  }

  let recipient = '';
  let businessName = 'Visit Baa operator';
  if (notification.business_id) {
    const businessResponse = await rest(
      `businesses?id=eq.${encodeURIComponent(notification.business_id)}&select=email,business_name&limit=1`
    );
    if (businessResponse.ok) {
      const businesses = await businessResponse.json();
      recipient = String(businesses?.[0]?.email || '').trim();
      businessName = String(businesses?.[0]?.business_name || businessName);
    }
  }

  if (!recipient) {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(notification.operator_id)}`, {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        authorization: `Bearer ${SERVICE_ROLE_KEY}`
      }
    });
    if (userResponse.ok) {
      const user = await userResponse.json();
      recipient = String(user?.email || '').trim();
    }
  }

  if (!recipient) {
    await patchNotification(notification.id, {
      email_status: 'skipped',
      email_error: 'No operator email address is available.'
    });
    return json({ ok: true, status: 'no_recipient' }, 202);
  }

  const actionUrl = internalActionUrl(notification.action_url);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#12343b;line-height:1.55">
      <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#52747b">Visit Baa operator notification</p>
      <h2 style="margin:0 0 12px">${escapeHtml(notification.title)}</h2>
      <p>Hello ${escapeHtml(businessName)},</p>
      <p>${escapeHtml(notification.message)}</p>
      <p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0b8990;color:white;text-decoration:none;font-weight:700">Review in Visit Baa</a></p>
      <p style="font-size:12px;color:#6d858a">This is an automated operational notification from Visit Baa.</p>
    </div>`;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [recipient],
      subject: `${notification.title} — Visit Baa`,
      html
    })
  });

  const resendBody = await resendResponse.text();
  if (!resendResponse.ok) {
    await patchNotification(notification.id, {
      email_status: 'failed',
      email_error: resendBody.slice(0, 1000)
    });
    return json({ error: 'Email provider rejected the message' }, 502);
  }

  await patchNotification(notification.id, {
    email_status: 'sent',
    email_sent_at: new Date().toISOString(),
    email_error: null
  });
  return json({ ok: true, status: 'sent' });
});
