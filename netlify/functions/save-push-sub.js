const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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

  // Lire l'heure_notif existante pour ne pas l'écraser si déjà définie
  let heure_notif = 8; // valeur par défaut : 8h00
  try {
    const existing = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${user_id}&select=heure_notif`, {
      headers: {
        'apikey': SB_SERVICE_KEY,
        'Authorization': `Bearer ${SB_SERVICE_KEY}`
      }
    });
    const rows = await existing.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].heure_notif != null) {
      heure_notif = rows[0].heure_notif; // conserver l'heure choisie par l'utilisateur
    }
  } catch (e) {
    // fallback silencieux sur la valeur par défaut
  }

  const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ user_id, endpoint, p256dh, auth, heure_notif, updated_at: new Date().toISOString() })
  });

  const text = await r.text();
  console.log('Supabase response:', r.status, text);

  if (!r.ok) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase error', status: r.status, detail: text }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, status: r.status }) };
};
