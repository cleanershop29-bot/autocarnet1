const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (!SB_URL || !SB_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration serveur manquante' }) };
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // Vérifier le JWT de l'utilisateur
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };

  // Récupérer l'utilisateur depuis le token
  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!userRes.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token invalide' }) };

  const user = await userRes.json();
  const uid = user.id;
  if (!uid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };

  const SB_HEADERS = {
    'apikey': SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Supprimer toutes les données utilisateur
    const tables = [
      { table: 'entretiens',        col: 'user_id' },
      { table: 'rappels_custom',    col: 'user_id' },
      { table: 'documents',         col: 'user_id' },
      { table: 'partages',          col: 'owner_id' },
      { table: 'push_subscriptions',col: 'user_id' },
      { table: 'vehicles',          col: 'user_id' },
    ];

    for (const { table, col } of tables) {
      await fetch(`${SB_URL}/rest/v1/${table}?${col}=eq.${uid}`, {
        method: 'DELETE',
        headers: SB_HEADERS
      });
    }

    // Supprimer le compte Supabase Auth (vraie suppression)
    const deleteRes = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: SB_HEADERS
    });

    if (!deleteRes.ok) {
      const err = await deleteRes.json().catch(() => ({}));
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur suppression compte' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
