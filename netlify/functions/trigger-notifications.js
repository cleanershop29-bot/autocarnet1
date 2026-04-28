const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const ADMIN_SECRET  = process.env.ADMIN_CODE;

const webpush = require('web-push');
const SB_HEADERS = { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' };

webpush.setVapidDetails('mailto:contact@autocarnet.fr', VAPID_PUBLIC, VAPID_PRIVATE);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const params = new URLSearchParams(event.rawQuery || '');

  // Auth : soit token JWT Supabase (appels client), soit secret admin (broadcast cron)
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const secretParam = params.get('secret');

  let authed = false;
  if (secretParam && secretParam === ADMIN_SECRET) {
    // Appel admin/cron avec secret
    authed = true;
  } else if (bearerToken) {
    // Appel client avec JWT Supabase — vérifier que le token est valide
    const verifyRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${bearerToken}` }
    });
    authed = verifyRes.ok;
  }

  if (!authed) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const userId = params.get('user_id') || null;
  const title  = params.get('title')   || null;
  const body   = params.get('body')    || null;

  // Mode broadcast : title + body sans user_id → envoyer à tous ou à un groupe ciblé
  if (!userId && title && body) {
    const target = params.get('target'); // 'free' | 'premium' | null = tous
    const allSubsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: SB_HEADERS });
    let subs = await allSubsRes.json();
    if (!Array.isArray(subs) || !subs.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ sent: 0, message: 'Aucun abonné' }) };
    }
    // Filtrer par plan si target spécifié
    if (target === 'free' || target === 'premium') {
      const usersRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: SB_HEADERS });
      const usersData = await usersRes.json();
      const premiumIds = new Set(
        (usersData.users || [])
          .filter(u => u.user_metadata?.plan === 'famille' || u.user_metadata?.plan === 'pro')
          .map(u => u.id)
      );
      subs = subs.filter(s => target === 'premium' ? premiumIds.has(s.user_id) : !premiumIds.has(s.user_id));
    }
    let sent = 0, errors = 0, expired = 0;
    for (const sub of subs) {
      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        await webpush.sendNotification(pushSub, JSON.stringify({ title, body, url: 'https://autocarnet.fr/app.html' }), { urgency: 'high' });
        sent++;
      } catch(e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          expired++;
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
        } else {
          errors++;
        }
      }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ sent, errors, expired, target: target||'all' }) };
  }

  // Mode instantané : title + body + user_id fournis directement
  if (userId && title && body) {
    const subRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=*`, { headers: SB_HEADERS });
    const subArr = await subRes.json();
    if (!Array.isArray(subArr) || !subArr.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'Pas de souscription' }) };
    }
    const sub = subArr[0];
    const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
    try {
      await webpush.sendNotification(pushSub, JSON.stringify({ title, body, url: 'https://autocarnet.fr/app.html' }), { urgency: 'high' });
      return { statusCode: 200, headers, body: JSON.stringify({ sent: 1 }) };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // Mode complet : scan de tous les rappels du jour
  const subsFilter = userId ? `user_id=eq.${userId}&select=*` : `select=*`;
  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?${subsFilter}`, { headers: SB_HEADERS });
  let subs = await subsRes.json();

  // Filtre target (free / premium) pour les broadcasts admin
  const target = params.get('target');
  if ((target === 'free' || target === 'premium') && !userId) {
    const usersRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: SB_HEADERS });
    const usersData = await usersRes.json();
    const premiumIds = new Set(
      (usersData.users || [])
        .filter(u => u.user_metadata?.plan === 'famille' || u.user_metadata?.plan === 'pro')
        .map(u => u.id)
    );
    subs = subs.filter(s => target === 'premium' ? premiumIds.has(s.user_id) : !premiumIds.has(s.user_id));
  }
  if (!Array.isArray(subs) || !subs.length) {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'Aucun abonné', subs: 0 }) };
  }

  const today = new Date(); today.setHours(0,0,0,0);
  let sent = 0, errors = 0, expired = 0;

  for (const sub of subs) {
    try {
      const vehsRes = await fetch(`${SB_URL}/rest/v1/vehicles?user_id=eq.${sub.user_id}&select=id,marque,modele,num_parc`, { headers: SB_HEADERS });
      const vehs = await vehsRes.json();
      const vehMap = {};
      (Array.isArray(vehs) ? vehs : []).forEach(v => {
        vehMap[v.id] = v.num_parc ? `${v.marque} ${v.modele} (${v.num_parc})` : `${v.marque} ${v.modele}`;
      });

      const entsRes = await fetch(`${SB_URL}/rest/v1/entretiens?user_id=eq.${sub.user_id}&rappel_date=not.is.null&select=id,type,rappel_date,vehicle_id`, { headers: SB_HEADERS });
      const ents = await entsRes.json();

      const rcRes = await fetch(`${SB_URL}/rest/v1/rappels_custom?user_id=eq.${sub.user_id}&date_rappel=not.is.null&statut=eq.actif&select=id,titre,date_rappel,vehicle_id`, { headers: SB_HEADERS });
      const rcs = await rcRes.json();

      const docsRes = await fetch(`${SB_URL}/rest/v1/documents?user_id=eq.${sub.user_id}&date_expiration=not.is.null&select=id,type,nom,date_expiration,vehicle_id`, { headers: SB_HEADERS });
      const docs = await docsRes.json();

      const alerts = [];

      (Array.isArray(ents) ? ents : []).forEach(e => {
        if (!e.rappel_date) return;
        const d = new Date(e.rappel_date); d.setHours(0,0,0,0);
        const diff = Math.round((d - today) / 86400000);
        if (![0,1,7].includes(diff)) return;
        const veh = vehMap[e.vehicle_id] || 'Véhicule';
        const when = diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : 'dans 7 jours';
        alerts.push({ title: `🔧 ${veh}`, body: `${e.type || 'Entretien'} — ${when}` });
      });

      (Array.isArray(rcs) ? rcs : []).forEach(r => {
        if (!r.date_rappel) return;
        const d = new Date(r.date_rappel); d.setHours(0,0,0,0);
        const diff = Math.round((d - today) / 86400000);
        if (diff !== 0 && diff !== 1) return;
        const veh = r.vehicle_id ? (vehMap[r.vehicle_id] || '') : '';
        const when = diff === 0 ? "aujourd'hui" : 'demain';
        alerts.push({ title: `📌 ${r.titre}`, body: `${veh ? veh + ' — ' : ''}${when}` });
      });

      (Array.isArray(docs) ? docs : []).forEach(d => {
        if (!d.date_expiration) return;
        const exp = new Date(d.date_expiration); exp.setHours(0,0,0,0);
        const diff = Math.round((exp - today) / 86400000);
        const veh = d.vehicle_id ? (vehMap[d.vehicle_id] || '') : '';
        const label = d.nom ? `${d.type} — ${d.nom}` : d.type;
        if (diff === 0) alerts.push({ title: `📄 ${label} expire aujourd'hui`, body: veh });
        if (diff === 7) alerts.push({ title: `📄 ${label} expire dans 7j`, body: veh });
        if (diff === 30) alerts.push({ title: `📄 ${label} expire dans 30j`, body: veh });
      });

      if (!alerts.length) {
        alerts.push({ title: '🔔 AutoCarnet', body: "Aucun rappel pour aujourd'hui ✓" });
      }

      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };

      for (const alert of alerts) {
        try {
          await webpush.sendNotification(pushSub, JSON.stringify({ title: alert.title, body: alert.body, url: 'https://autocarnet.fr/app.html' }), { urgency: 'high' });
          sent++;
        } catch(e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            expired++;
            await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
            break;
          }
          console.error('Push error:', e.message);
          errors++;
        }
      }
    } catch(e) {
      errors++;
      console.error('Erreur user', sub.user_id, e.message);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ sent, errors, expired, total_subs: subs.length }) };
};
