const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON', detail: e.message }) }; }

  const { user_id, endpoint, p256dh, auth } = body;
  if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id requis' }) };

  if (event.httpMethod === 'DELETE') {
    const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SB_SERVICE_KEY,
        'Authorization': `Bearer ${SB_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: r.status }) };
  }

  if (!endpoint) return { statusCode: 400, headers, body: JSON.stringify({ error: 'endpoint requis' }) };

  const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ user_id, endpoint, p256dh, auth, updated_at: new Date().toISOString() })
  });

  const text = await r.text();
  console.log('Supabase response:', r.status, text);

  if (!r.ok) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase error', status: r.status, detail: text }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: r.status }) };
};
