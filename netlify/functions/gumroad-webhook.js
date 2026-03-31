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
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parser le body
  let params = {};
  try {
    const body = event.body || '';
    const decoded = event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf-8') : body;
    params = Object.fromEntries(new URLSearchParams(decoded));
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  // Logger tout ce que Gumroad envoie
  await logToSupabase({ params, headers: event.headers });

  const { email, product_permalink, subscription_cancelled_at, refunded } = params;

  if (!email) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Email manquant' }) };
  }

  const plan = product_permalink === PRODUCT_FAMILLE ? 'famille'
    : product_permalink === PRODUCT_PRO ? 'pro'
    : null;

  const isCancel = !!(subscription_cancelled_at || refunded === 'true');

  // Trouver l'utilisateur
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }
  });
  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());

  if (!user) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Utilisateur non trouve' }) };
  }

  let newMeta = { ...user.user_metadata };

  if (isCancel) {
    newMeta.plan = null;
    newMeta.is_premium = false;
  } else if (plan) {
    newMeta.plan = plan;
    newMeta.is_premium = true;
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
    body: JSON.stringify({ success: true, email, plan: newMeta.plan, is_premium: newMeta.is_premium })
  };
};
