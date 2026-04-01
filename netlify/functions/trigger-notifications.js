const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';
const VAPID_PUBLIC  = 'BE7KvvdlYZM6Ph2Eipldx1_wDUCrhSRn6FYP3CN9oQq6oRzR1T0UYecZ3xQMjruj0tTvWjwy54P7ZFJXyKNjW6Y';
const VAPID_PRIVATE = 'y5GC26Lqyv-PEL85oUvfKSpPcwbSykYbHG_w1Ci-o3k';
const VAPID_SUBJECT = 'mailto:contact@autocarnet.fr';
const ADMIN_SECRET  = 'AC2026admin';
const SB_HEADERS = { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' };
const crypto = require('crypto');

function base64urlToBuffer(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function bufferToBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function createVapidToken(audience) {
  const header = bufferToBase64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = bufferToBase64url(Buffer.from(JSON.stringify({ aud: audience, exp: now + 43200, sub: VAPID_SUBJECT })));
  const signing = `${header}.${payload}`;
  const privKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex'),
      base64urlToBuffer(VAPID_PRIVATE),
      Buffer.from('a144034200', 'hex'),
      base64urlToBuffer(VAPID_PUBLIC)
    ]),
    format: 'der', type: 'pkcs8'
  });
  const sig = crypto.sign('sha256', Buffer.from(signing), { key: privKey, dsaEncoding: 'ieee-p1363' });
  return `${signing}.${bufferToBase64url(sig)}`;
}

async function sendPushSimple(endpoint, title, body) {
  try {
    const url = new URL(endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const token = createVapidToken(audience);

    // Envoyer le payload en texte simple sans chiffrement
    const payload = JSON.stringify({ title, body });

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${token},k=${VAPID_PUBLIC}`,
        'Content-Type': 'application/json',
        'TTL': '86400'
      },
      body: payload
    });

    const responseText = await r.text();
    console.log('Push response:', r.status, responseText);
    if (r.status === 410 || r.status === 404) return 'expired';
    return r.ok ? 'ok' : `error_${r.status}_${responseText}`;
  } catch(e) {
    return 'error: ' + e.message;
  }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const params = new URLSearchParams(event.rawQuery || '');
  if (params.get('secret') !== ADMIN_SECRET) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: SB_HEADERS });
  const subs = await subsRes.json();
  if (!Array.isArray(subs) || !subs.length) {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'Aucun abonné', subs: 0 }) };
  }

  const results = [];
  for (const sub of subs) {
    const result = await sendPushSimple(sub.endpoint, '🔔 Test AutoCarnet', 'Notification de test');
    results.push({ user_id: sub.user_id, result });
  }

  return { statusCode: 200, headers, body: JSON.stringify({ results, total: subs.length }) };
};
