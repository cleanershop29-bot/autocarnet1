const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Vérification config serveur
  if (!SB_URL || !SB_SERVICE_KEY || !ADMIN_CODE) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration serveur manquante' }) };
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { email, is_premium, plan, subscription_id, code } = body;

  if (code !== ADMIN_CODE) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Code incorrect' }) };
  if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email requis' }) };

  // Trouver l'utilisateur
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, {
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}` }
  });
  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());

  if (!user) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };

  const currentPlan = user.user_metadata?.plan || (user.user_metadata?.is_premium ? 'pro' : null);

  // Cas : juste stocker le subscription_id sans changer le plan
  if (subscription_id && !plan && is_premium === undefined) {
    const newMeta = { ...user.user_metadata, gumroad_subscription_id: subscription_id };
    const updateRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_metadata: newMeta })
    });
    if (!updateRes.ok) {
      const err = await updateRes.json();
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur Supabase' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'ID abonnement enregistré' }) };
  }

  // Cas : vérification seule
  if (is_premium === null && plan === undefined) {
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, email, is_premium: !!currentPlan, plan: currentPlan, check_only: true })
    };
  }

  // Cas : changer le plan
  let newMeta = { ...user.user_metadata };

  if (plan === 'pro') {
    newMeta.plan = 'pro'; newMeta.is_premium = true;
  } else if (plan === 'famille') {
    newMeta.plan = 'famille'; newMeta.is_premium = true;
  } else if (plan === null || is_premium === false) {
    newMeta.plan = null; newMeta.is_premium = false;
  } else if (is_premium === true) {
    newMeta.plan = 'pro'; newMeta.is_premium = true;
  }

  // Conserver le subscription_id si fourni
  if (subscription_id) newMeta.gumroad_subscription_id = subscription_id;

  const updateRes = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_metadata: newMeta })
  });

  if (!updateRes.ok) {
    const err = await updateRes.json();
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur Supabase' }) };
  }

  const activePlan = newMeta.plan;
  const label = activePlan === 'pro' ? 'Plan Pro activé !' : activePlan === 'famille' ? 'Plan Famille activé !' : 'Plan révoqué.';

  return {
    statusCode: 200, headers,
    body: JSON.stringify({ success: true, email, is_premium: newMeta.is_premium, plan: activePlan, message: label })
  };
};
