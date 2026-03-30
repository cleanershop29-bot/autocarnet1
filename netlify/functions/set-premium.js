const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';
const ADMIN_CODE = 'AC2026admin';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email, is_premium, code } = body;

  if (code !== ADMIN_CODE) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Code incorrect' }) };
  }

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email requis' }) };
  }

  // Trouver l'utilisateur
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`
    }
  });

  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());

  if (!user) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
  }

  const currentPremium = user.user_metadata?.is_premium === true;

  // Si is_premium est null = juste vérifier le statut sans modifier
  if (is_premium === null || is_premium === undefined) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, email, is_premium: currentPremium, check_only: true })
    };
  }

  // Sinon mettre à jour
  const updateRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_metadata: { ...user.user_metadata, is_premium: is_premium === true }
    })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur Supabase' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      email,
      is_premium: is_premium === true,
      message: is_premium ? 'Premium activé !' : 'Premium révoqué.'
    })
  };
};

