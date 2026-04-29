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

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  // Auth : JWT utilisateur OU suppression admin par email
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  let uid;
  
  // Mode admin : supprimer un compte par email
  const { admin_email, admin_code } = body;
  if (admin_email && admin_code) {
    if (admin_code !== process.env.ADMIN_CODE) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Code admin incorrect' }) };
    // Trouver l'utilisateur par email
    const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: SB_HEADERS });
    const listData = await listRes.json();
    const targetUser = (listData.users || []).find(u => u.email === admin_email.toLowerCase().trim());
    if (!targetUser) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
    uid = targetUser.id;
  } else {
    // Mode utilisateur : JWT
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token invalide' }) };
    const user = await userRes.json();
    uid = user.id;
    if (!uid) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
  }

  const SB_HEADERS = {
    'apikey': SB_SERVICE_KEY,
    'Authorization': `Bearer ${SB_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // ── 1. Supprimer les fichiers Supabase Storage ─────────────────
    // Bucket "factures" : photos d'entretiens et signalements (chemin {uid}/...)
    const facturesListRes = await fetch(
      `${SB_URL}/storage/v1/object/list/factures`,
      {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: uid + '/', limit: 1000 })
      }
    );
    if (facturesListRes.ok) {
      const facturesFiles = await facturesListRes.json().catch(() => []);
      const facturePaths = (Array.isArray(facturesFiles) ? facturesFiles : [])
        .map(f => uid + '/' + f.name)
        .filter(Boolean);
      if (facturePaths.length) {
        await fetch(`${SB_URL}/storage/v1/object/factures`, {
          method: 'DELETE',
          headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: facturePaths })
        });
      }
    }

    // Bucket "documents-vehicule" : photos de documents (chemin {uid}/{vid}/...)
    const docsListRes = await fetch(
      `${SB_URL}/storage/v1/object/list/documents-vehicule`,
      {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: uid + '/', limit: 1000 })
      }
    );
    if (docsListRes.ok) {
      const docsFiles = await docsListRes.json().catch(() => []);
      const docPaths = (Array.isArray(docsFiles) ? docsFiles : [])
        .map(f => uid + '/' + f.name)
        .filter(Boolean);
      if (docPaths.length) {
        await fetch(`${SB_URL}/storage/v1/object/documents-vehicule`, {
          method: 'DELETE',
          headers: { ...SB_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: docPaths })
        });
      }
    }

    // ── 2. Supprimer toutes les tables Supabase ────────────────────
    // Ordre important : d'abord les tables enfants, puis les parents
    const tables = [
      { table: 'entretien_photos',   col: 'user_id' },
      { table: 'entretiens',         col: 'user_id' },
      { table: 'km_history',         col: 'user_id' },
      { table: 'rappels_custom',     col: 'user_id' },
      { table: 'documents',          col: 'user_id' },
      { table: 'veh_notes',          col: 'user_id' },
      { table: 'signalements',       col: 'owner_id' },
      { table: 'signalements',       col: 'reporter_id' },
      { table: 'factures',           col: 'user_id' },
      { table: 'partages',           col: 'owner_id' },
      { table: 'partages',           col: 'invited_user_id' },
      { table: 'push_subscriptions', col: 'user_id' },
      { table: 'parrainages',        col: 'parrain_id' },
      { table: 'parrainages',        col: 'filleul_id' },
      { table: 'vehicles',           col: 'user_id' },
    ];

    for (const { table, col } of tables) {
      await fetch(`${SB_URL}/rest/v1/${table}?${col}=eq.${uid}`, {
        method: 'DELETE',
        headers: SB_HEADERS
      });
    }

    // ── 3. Supprimer le compte Supabase Auth ───────────────────────
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
