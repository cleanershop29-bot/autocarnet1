// Netlify function — Stats globales admin AutoCarnet
const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_CODE = process.env.ADMIN_CODE;

const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (!SB_URL || !SB_SERVICE_KEY || !ADMIN_CODE) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config manquante' }) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  if (body.code !== ADMIN_CODE) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Non autorisé' }) };

  try {
    // ── Utilisateurs ──────────────────────────────────────────────
    const usersRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: SB_HEADERS });
    const usersData = await usersRes.json();
    const users = usersData.users || [];

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfWeek = new Date(now - 7 * 86400000).toISOString();

    const totalUsers = users.length;
    const newThisMonth = users.filter(u => u.created_at >= startOfMonth).length;
    const newThisWeek = users.filter(u => u.created_at >= startOfWeek).length;

    const premiumFamille = users.filter(u => u.user_metadata?.plan === 'famille').length;
    const premiumPro = users.filter(u => u.user_metadata?.plan === 'pro').length;
    const totalPremium = premiumFamille + premiumPro;
    const conversionRate = totalUsers > 0 ? ((totalPremium / totalUsers) * 100).toFixed(1) : 0;

    // Revenu estimé (Famille 3.99€/mois, Pro 6.99€/mois)
    const mrr = (premiumFamille * 3.99 + premiumPro * 6.99).toFixed(0);

    // ── Tables Supabase ───────────────────────────────────────────
    const [vehRes, entRes, docRes, rappelRes] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/vehicles?select=count`, { headers: { ...SB_HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' } }),
      fetch(`${SB_URL}/rest/v1/entretiens?select=count`, { headers: { ...SB_HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' } }),
      fetch(`${SB_URL}/rest/v1/documents?select=count`, { headers: { ...SB_HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' } }),
      fetch(`${SB_URL}/rest/v1/rappels_custom?select=count&statut=eq.actif`, { headers: { ...SB_HEADERS, 'Prefer': 'count=exact', 'Range': '0-0' } }),
    ]);

    const getCount = (res) => parseInt(res.headers.get('content-range')?.split('/')[1] || '0');
    const totalVehs = getCount(vehRes);
    const totalEnts = getCount(entRes);
    const totalDocs = getCount(docRes);
    const totalRappels = getCount(rappelRes);

    // ── Derniers inscrits ─────────────────────────────────────────
    const lastUsers = users
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(u => ({
        email: u.email,
        plan: u.user_metadata?.plan || 'free',
        created_at: u.created_at
      }));

    // Action : liste des comptes premium
    if (body.action === 'premium_users') {
      const premiumUsers = users
        .filter(u => u.user_metadata?.plan === 'famille' || u.user_metadata?.plan === 'pro')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(u => ({
          email: u.email,
          plan: u.user_metadata?.plan || 'free',
          created_at: u.created_at
        }));
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ premium_users: premiumUsers })
      };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        users: { total: totalUsers, new_month: newThisMonth, new_week: newThisWeek },
        premium: { famille: premiumFamille, pro: premiumPro, total: totalPremium, conversion: conversionRate, mrr },
        data: { vehicles: totalVehs, entretiens: totalEnts, documents: totalDocs, rappels: totalRappels },
        last_users: lastUsers,
        generated_at: new Date().toISOString()
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
