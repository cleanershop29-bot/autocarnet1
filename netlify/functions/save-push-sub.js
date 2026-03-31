const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

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
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { user_id, endpoint, p256dh, auth } = body;
  if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'user_id requis' }) };

  // DELETE — désabonnement
  if (event.httpMethod === 'DELETE') {
    await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}`, {
      method: 'DELETE',
      headers: SB_HEADERS
    });
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // POST — enregistrement
  if (!endpoint) return { statusCode: 400, headers, body: JSON.stringify({ error: 'endpoint requis' }) };

  // Upsert (insert ou update si user_id existe déjà)
  await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id, endpoint, p256dh, auth, updated_at: new Date().toISOString() })
  });

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
