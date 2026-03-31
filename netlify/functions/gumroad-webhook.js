const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

// IDs produits Gumroad
const PRODUCT_FAMILLE = 'aspjzg';
const PRODUCT_PRO = 'lvoes';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Parser le body (Gumroad envoie en form-urlencoded)
  let params = {};
  try {
    const body = event.body || '';
    if (event.isBase64Encoded) {
      const decoded = Buffer.from(body, 'base64').toString('utf-8');
      params = Object.fromEntries(new URLSearchParams(decoded));
    } else {
      params = Object.fromEntries(new URLSearchParams(body));
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { email, product_permalink, sale_timestamp, subscription_cancelled_at, refunded } = params;

  if (!email) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email manquant' }) };
  }

  // Determiner le plan selon le produit
  const plan = product_permalink === PRODUCT_FAMILLE ? 'famille'
    : product_permalink === PRODUCT_PRO ? 'pro'
    : null;

  // Determiner l'action
  const isCancel = subscription_cancelled_at || refunded === 'true';

  // Trouver l'utilisateur dans Supabase
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }
  });
  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());

  if (!user) {
    // Utilisateur pas encore inscrit — on ignore
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Utilisateur non trouve, ignore' }) };
  }

  let newMeta = { ...user.user_metadata };

  if (isCancel) {
    // Annulation ou remboursement → révoquer
    newMeta.plan = null;
    newMeta.is_premium = false;
  } else if (plan) {
    // Nouvel abonnement ou renouvellement → activer
    newMeta.plan = plan;
    newMeta.is_premium = true;
  } else {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Produit non reconnu, ignore' }) };
  }

  // Mettre a jour Supabase
  const updateRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: {
      'apikey': SB_SERVICE_KEY,
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_metadata: newMeta })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur Supabase' }) };
  }

  const action = isCancel ? 'revoque' : 'active ('+plan+')';
  console.log(`Webhook Gumroad: ${email} → ${action}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, email, action })
  };
};
