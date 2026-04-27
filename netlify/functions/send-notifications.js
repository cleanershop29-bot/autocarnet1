// Netlify Scheduled Function — s'execute toutes les heures
// Configuration dans netlify.toml : schedule = "0 * * * *"

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SB_HEADERS = { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' };

const webpush = require('web-push');
webpush.setVapidDetails('mailto:contact@autocarnet.fr', VAPID_PUBLIC, VAPID_PRIVATE);

// ── Rappels saisonniers ──────────────────────────────────────────
const RAPPELS_SAISONNIERS = [
  {
    mois: 10, // Octobre
    emoji: '🍂',
    titre: 'Pneus hiver',
    corps: (veh) => `Il est temps de chausser les pneus hiver sur votre ${veh}.`,
    corpsGeneral: 'Il est temps de chausser vos pneus hiver avant les premières gelées.'
  },
  {
    mois: 4, // Avril
    emoji: '🌸',
    titre: 'Pneus été + Climatisation',
    corps: (veh) => `Remettez les pneus été et vérifiez la clim de votre ${veh}.`,
    corpsGeneral: 'Remettez vos pneus été et vérifiez votre climatisation.'
  },
  {
    mois: 11, // Novembre
    emoji: '❄️',
    titre: 'Antigel & Liquide de refroidissement',
    corps: (veh) => `Vérifiez le niveau d'antigel de votre ${veh} avant l'hiver.`,
    corpsGeneral: "Vérifiez le niveau d'antigel de vos véhicules avant l'hiver."
  },
  {
    mois: 6, // Juin
    emoji: '☀️',
    titre: 'Clim + Lave-glace été',
    corps: (veh) => `Passez en liquide lave-glace été et vérifiez la clim de votre ${veh}.`,
    corpsGeneral: 'Passez en lave-glace été et vérifiez votre climatisation.'
  }
];

// ── Helper push ──────────────────────────────────────────────────
async function sendPush(sub, title, body) {
  const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(
      pushSub,
      JSON.stringify({ title, body, url: 'https://autocarnet.fr/app.html' }),
      { urgency: 'normal' }
    );
    return { ok: true };
  } catch(e) {
    if (e.statusCode === 410 || e.statusCode === 404) return { ok: false, expired: true };
    return { ok: false, expired: false };
  }
}

exports.handler = async () => {
  // Heure actuelle en France
  const now = new Date();
  const heureFrance = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }));
  const nowFrance = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const jourDuMois = nowFrance.getDate();
  const moisActuel = nowFrance.getMonth() + 1; // 1-12

  console.log(`send-notifications: heure France = ${heureFrance}h, jour=${jourDuMois}, mois=${moisActuel}`);

  const today = new Date(); today.setHours(0,0,0,0);

  // Récupérer tous les abonnés actifs
  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: SB_HEADERS });
  const allSubs = await subsRes.json();
  if (!Array.isArray(allSubs) || !allSubs.length) {
    return { statusCode: 200, body: JSON.stringify({ message: 'Aucun abonné' }) };
  }

  // Filtrer par heure de préférence
  const subsForHour = allSubs.filter(s => s.heure_notif === heureFrance);

  let sent = 0, errors = 0, expired = 0;

  // ── Rappels saisonniers (le 1er du mois à 9h) ─────────────────
  const rappelSaisonnier = RAPPELS_SAISONNIERS.find(r => r.mois === moisActuel);
  if (rappelSaisonnier && jourDuMois === 1 && heureFrance === 9) {
    console.log(`Rappel saisonnier: ${rappelSaisonnier.titre}`);
    for (const sub of allSubs) {
      // Récupérer les véhicules de cet utilisateur
      const vehsRes = await fetch(`${SB_URL}/rest/v1/vehicles?user_id=eq.${sub.user_id}&select=marque,modele`, { headers: SB_HEADERS });
      const vehs = await vehsRes.json();
      const vehList = Array.isArray(vehs) ? vehs : [];

      let title, body;
      if (vehList.length === 1) {
        const veh = `${vehList[0].marque} ${vehList[0].modele}`;
        title = `${rappelSaisonnier.emoji} ${rappelSaisonnier.titre}`;
        body = rappelSaisonnier.corps(veh);
      } else {
        title = `${rappelSaisonnier.emoji} ${rappelSaisonnier.titre}`;
        body = rappelSaisonnier.corpsGeneral;
      }

      const res = await sendPush(sub, title, body);
      if (res.ok) { sent++; }
      else if (res.expired) {
        expired++;
        await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
      } else { errors++; }
    }
  }

  // ── Rappel kilométrage mensuel (le 1er du mois à 10h) ─────────
  if (jourDuMois === 1 && heureFrance === 10) {
    console.log('Rappel kilométrage mensuel');
    for (const sub of allSubs) {
      const vehsRes = await fetch(`${SB_URL}/rest/v1/vehicles?user_id=eq.${sub.user_id}&select=marque,modele`, { headers: SB_HEADERS });
      const vehs = await vehsRes.json();
      const vehList = Array.isArray(vehs) ? vehs : [];
      if (!vehList.length) continue;

      const title = '📍 Mise à jour kilométrage';
      const body = vehList.length === 1
        ? `Pensez à mettre à jour le compteur de votre ${vehList[0].marque} ${vehList[0].modele}.`
        : `Pensez à mettre à jour le kilométrage de vos ${vehList.length} véhicules.`;

      const res = await sendPush(sub, title, body);
      if (res.ok) { sent++; }
      else if (res.expired) {
        expired++;
        await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
      } else { errors++; }
    }
  }

  // ── Rappels entretiens / documents habituels ───────────────────
  for (const sub of subsForHour) {
    try {
      const vehsRes = await fetch(`${SB_URL}/rest/v1/vehicles?user_id=eq.${sub.user_id}&select=id,marque,modele,num_parc`, { headers: SB_HEADERS });
      const vehs = await vehsRes.json();
      const vehMap = {};
      (Array.isArray(vehs) ? vehs : []).forEach(v => {
        vehMap[v.id] = v.num_parc ? `${v.marque} ${v.modele} (${v.num_parc})` : `${v.marque} ${v.modele}`;
      });

      const entsRes = await fetch(`${SB_URL}/rest/v1/entretiens?user_id=eq.${sub.user_id}&rappel_date=not.is.null&select=id,type,rappel_date,rappel_avant,vehicle_id`, { headers: SB_HEADERS });
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
        const avant = e.rappel_avant != null ? parseInt(e.rappel_avant) : null;
        let shouldSend = avant !== null ? (diff === avant || diff === 0) : [0, 1, 7].includes(diff);
        if (!shouldSend) return;
        const veh = vehMap[e.vehicle_id] || 'Véhicule';
        const when = diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : `dans ${diff} jours`;
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

      if (!alerts.length) continue;

      for (const alert of alerts) {
        const res = await sendPush(sub, alert.title, alert.body);
        if (res.ok) { sent++; console.log(`Envoyé à ${sub.user_id}: ${alert.title}`); }
        else if (res.expired) {
          expired++;
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
          break;
        } else { errors++; }
      }
    } catch(e) {
      errors++;
      console.error('Erreur user', sub.user_id, e.message);
    }
  }

  console.log(`Résultat: ${sent} envoyés, ${errors} erreurs, ${expired} expirés`);
  return { statusCode: 200, body: JSON.stringify({ sent, errors, expired, heure: heureFrance, jour: jourDuMois, mois: moisActuel }) };
};
