const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

const PRODUCT_FAMILLE = 'aspjzg';
const PRODUCT_PRO = 'lvoes';

async function logToSupabase(data) {
  try {
    await fetch(`${SB_URL}/rest/v1/webhook_logs`, {
      method: 'POST',
      headers: {
        'apikey': SB_SERVICE_KEY,
        'Authorization': `Bearer ${SB_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ payload: JSON.stringify(data), created_at: new Date().toISOString() })
    });
  } catch(e) {}
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod === 'GET') return { statusCode: 200, headers, body: JSON.stringify({ status: 'ok' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf-8')
    : (event.body || '');

  let params = {};
  try {
    const ct = (event.headers['content-type'] || '').toLowerCase();
    if (ct.includes('application/json')) {
      params = JSON.parse(rawBody);
    } else {
      params = Object.fromEntries(new URLSearchParams(rawBody));
    }
  } catch (e) {
    params = {};
  }

  await logToSupabase({ params });

  const { email, product_permalink, subscription_id, subscription_cancelled_at, refunded } = params;

  if (!email) return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Email manquant' }) };

  const plan = (product_permalink && product_permalink.includes(PRODUCT_FAMILLE)) ? 'famille'
    : (product_permalink && product_permalink.includes(PRODUCT_PRO)) ? 'pro'
    : null;

  const isCancel = !!(subscription_cancelled_at || refunded === 'true');

  // Trouver l'utilisateur
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }
  });
  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());

  if (!user) return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Utilisateur non trouve' }) };

  let newMeta = { ...user.user_metadata };

  if (isCancel) {
    newMeta.plan = null;
    newMeta.is_premium = false;
    // Garder le subscription_id pour reference mais vider le plan
  } else if (plan) {
    newMeta.plan = plan;
    newMeta.is_premium = true;
    // Stocker le subscription_id pour le bouton "Gérer mon abonnement"
    if (subscription_id) {
      newMeta.gumroad_subscription_id = subscription_id;
    }
  } else {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Produit non reconnu' }) };
  }

  await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_metadata: newMeta })
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, email, plan: newMeta.plan, has_subscription_id: !!subscription_id })
  };
};
