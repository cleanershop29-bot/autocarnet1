// Netlify function — Système de parrainage AutoCarnet
const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

// Limites
const MAX_FILLEULS = 3;
const MOIS_PAR_FILLEUL = 1;
const MAX_MOIS_CUMULES = 3;

// Générer un code unique lisible
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AC-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Calculer la date d'expiration premium (+N mois depuis aujourd'hui)
function addMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (!SB_URL || !SB_SERVICE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Config manquante' }) };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { action } = body;

  // ── Vérifier le JWT de l'appelant ──────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  async function getCallerUser() {
    if (!token) return null;
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.json();
  }

  // ── ACTION : get_or_create_code — obtenir ou créer son code parrain ──
  if (action === 'get_or_create_code') {
    const caller = await getCallerUser();
    if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non authentifié' }) };

    // Chercher les parrainages existants de cet utilisateur
    const res = await fetch(`${SB_URL}/rest/v1/parrainages?parrain_id=eq.${caller.id}&order=created_at.asc`, { headers: SB_HEADERS });
    const existing = await res.json();

    const utilises = (existing || []).filter(p => p.statut === 'utilisé');
    const moisGagnes = Math.min(utilises.length * MOIS_PAR_FILLEUL, MAX_MOIS_CUMULES);

    // Récupérer ou créer le code
    let code;
    if (existing && existing.length > 0) {
      code = existing[0].code;
    } else {
      // Créer un nouveau code unique
      let attempts = 0;
      do {
        code = genCode();
        const check = await fetch(`${SB_URL}/rest/v1/parrainages?code=eq.${code}`, { headers: SB_HEADERS });
        const checkData = await check.json();
        if (!checkData.length) break;
        attempts++;
      } while (attempts < 10);

      await fetch(`${SB_URL}/rest/v1/parrainages`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({ parrain_id: caller.id, code, statut: 'en_attente' })
      });
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        code,
        lien: `https://autocarnet.fr/app.html?ref=${code}`,
        filleuls_total: (existing || []).length,
        filleuls_confirmes: utilises.length,
        mois_gagnes: moisGagnes,
        max_filleuls: MAX_FILLEULS,
        max_mois: MAX_MOIS_CUMULES
      })
    };
  }

  // ── ACTION : use_code — un filleul utilise un code ──────────────
  if (action === 'use_code') {
    const { code } = body;
    if (!code) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Code manquant' }) };

    const caller = await getCallerUser();
    if (!caller) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non authentifié' }) };

    // Chercher le code
    const res = await fetch(`${SB_URL}/rest/v1/parrainages?code=eq.${encodeURIComponent(code.toUpperCase().trim())}`, { headers: SB_HEADERS });
    const parrainages = await res.json();
    if (!parrainages || !parrainages.length) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Code invalide' }) };

    const parrainage = parrainages[0];

    // Vérifications
    if (parrainage.parrain_id === caller.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Vous ne pouvez pas utiliser votre propre code' }) };
    if (parrainage.statut === 'utilisé') return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ce code a déjà été utilisé' }) };

    // Vérifier que ce filleul n'a pas déjà utilisé un code
    const alreadyRes = await fetch(`${SB_URL}/rest/v1/parrainages?filleul_id=eq.${caller.id}`, { headers: SB_HEADERS });
    const already = await alreadyRes.json();
    if (already && already.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Vous avez déjà utilisé un code de parrainage' }) };

    // Vérifier que le parrain n'a pas atteint la limite
    const parrainAllRes = await fetch(`${SB_URL}/rest/v1/parrainages?parrain_id=eq.${parrainage.parrain_id}&statut=eq.utilisé`, { headers: SB_HEADERS });
    const parrainAll = await parrainAllRes.json();
    if (parrainAll && parrainAll.length >= MAX_FILLEULS) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Ce parrain a atteint la limite de parrainages' }) };

    // Marquer le code comme utilisé
    await fetch(`${SB_URL}/rest/v1/parrainages?id=eq.${parrainage.id}`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({ statut: 'utilisé', filleul_id: caller.id, filleul_email: caller.email, used_at: new Date().toISOString(), mois_offerts: MOIS_PAR_FILLEUL })
    });

    // Récupérer le parrain pour calculer ses mois cumulés
    const parrainRes = await fetch(`${SB_URL}/rest/v1/parrainages?parrain_id=eq.${parrainage.parrain_id}&statut=eq.utilisé`, { headers: SB_HEADERS });
    const parrainConfirmes = await parrainRes.json();
    const moisTotal = Math.min((parrainConfirmes.length) * MOIS_PAR_FILLEUL, MAX_MOIS_CUMULES);

    // Activer le premium Famille pour le parrain
    const parrainUserRes = await fetch(`${SB_URL}/auth/v1/admin/users/${parrainage.parrain_id}`, { headers: SB_HEADERS });
    const parrainUser = await parrainUserRes.json();
    const currentMeta = parrainUser.user_metadata || {};
    const expiry = addMonths(moisTotal);

    await fetch(`${SB_URL}/auth/v1/admin/users/${parrainage.parrain_id}`, {
      method: 'PUT',
      headers: SB_HEADERS,
      body: JSON.stringify({
        user_metadata: {
          ...currentMeta,
          plan: 'famille',
          is_premium: true,
          referral_premium_expiry: expiry,
          referral_mois_gagnes: moisTotal
        }
      })
    });

    // Donner 7 jours d'essai au filleul s'il est en free
    const filleulMeta = caller.user_metadata || {};
    if (!filleulMeta.plan && !filleulMeta.is_premium) {
      const trialExpiry = new Date(); trialExpiry.setDate(trialExpiry.getDate() + 7);
      await fetch(`${SB_URL}/auth/v1/admin/users/${caller.id}`, {
        method: 'PUT',
        headers: SB_HEADERS,
        body: JSON.stringify({
          user_metadata: { ...filleulMeta, trial_end: trialExpiry.toISOString(), trial_from_referral: true }
        })
      });
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: `Code validé ! Votre parrain reçoit ${moisTotal} mois Premium Famille. Vous bénéficiez de 7 jours Premium Famille offerts.`, filleul_trial: !filleulMeta.plan })
    };
  }

  // ── ACTION : admin_stats — stats pour le panel admin ───────────
  if (action === 'admin_stats') {
    const { code: adminCode } = body;
    if (adminCode !== process.env.ADMIN_CODE) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Non autorisé' }) };

    const allRes = await fetch(`${SB_URL}/rest/v1/parrainages?select=*&order=created_at.desc`, { headers: SB_HEADERS });
    const all = await allRes.json();

    const total = all.length;
    const confirmes = all.filter(p => p.statut === 'utilisé').length;
    const moisOfferts = confirmes * MOIS_PAR_FILLEUL;
    const top5 = Object.entries(
      all.filter(p => p.statut === 'utilisé').reduce((acc, p) => {
        acc[p.parrain_id] = (acc[p.parrain_id] || 0) + 1;
        return acc;
      }, {})
    ).sort((a,b) => b[1]-a[1]).slice(0,5);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ total_codes: total, parrainages_confirmes: confirmes, mois_offerts_total: moisOfferts, top_parrains: top5 })
    };
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Action inconnue' }) };
};
