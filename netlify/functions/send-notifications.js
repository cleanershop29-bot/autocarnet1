// Netlify Scheduled Function — s'execute toutes les heures
// Configuration dans netlify.toml : schedule = "0 * * * *"

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const SB_HEADERS = { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' };

const webpush = require('web-push');
webpush.setVapidDetails('mailto:contact@autocarnet.fr', VAPID_PUBLIC, VAPID_PRIVATE);

exports.handler = async () => {
  // Heure actuelle en France (UTC+1 hiver, UTC+2 été)
  const now = new Date();
  const offsetFrance = now.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false });
  const heureFrance = parseInt(offsetFrance);
  
  console.log(`send-notifications: heure France = ${heureFrance}h`);

  const today = new Date(); today.setHours(0,0,0,0);

  // Récupérer uniquement les abonnés dont l'heure correspond à maintenant
  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?heure_notif=eq.${heureFrance}&select=*`, { headers: SB_HEADERS });
  const subs = await subsRes.json();
  
  console.log(`Abonnés à ${heureFrance}h : ${Array.isArray(subs) ? subs.length : 0}`);
  
  if (!Array.isArray(subs) || !subs.length) {
    return { statusCode: 200, body: JSON.stringify({ message: `Aucun abonné à ${heureFrance}h` }) };
  }

  let sent = 0, errors = 0, expired = 0;

  for (const sub of subs) {
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
        // Respecter le choix de l'utilisateur (rappel_avant en jours : 0, 7, 15, 30)
        // Si rappel_avant non défini → comportement par défaut (J, J-1, J-7)
        const avant = e.rappel_avant != null ? parseInt(e.rappel_avant) : null;
        let shouldSend = false;
        if (avant !== null) {
          // Envoyer le jour exact choisi (ex: avant=7 → envoyer quand diff===7)
          // + toujours envoyer le jour J (diff===0) comme rappel final
          shouldSend = diff === avant || diff === 0;
        } else {
          // Comportement par défaut si rappel_avant non renseigné
          shouldSend = [0, 1, 7].includes(diff);
        }
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

      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };

      for (const alert of alerts) {
        try {
          await webpush.sendNotification(pushSub, JSON.stringify({ title: alert.title, body: alert.body, url: 'https://autocarnet.fr/app.html' }), { urgency: 'high' });
          sent++;
          console.log(`Envoyé à ${sub.user_id}: ${alert.title}`);
        } catch(e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            expired++;
            await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, { method: 'DELETE', headers: SB_HEADERS });
            console.log(`Souscription expirée supprimée: ${sub.user_id}`);
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

  console.log(`Résultat: ${sent} envoyés, ${errors} erreurs, ${expired} expirés`);
  return { statusCode: 200, body: JSON.stringify({ sent, errors, expired, heure: heureFrance }) };
};
