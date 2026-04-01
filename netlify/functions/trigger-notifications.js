const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';
const VAPID_PUBLIC  = 'BE7KvvdlYZM6Ph2Eipldx1_wDUCrhSRn6FYP3CN9oQq6oRzR1T0UYecZ3xQMjruj0tTvWjwy54P7ZFJXyKNjW6Y';
const VAPID_PRIVATE = 'y5GC26Lqyv-PEL85oUvfKSpPcwbSykYbHG_w1Ci-o3k';
const ADMIN_SECRET  = 'AC2026admin';

const webpush = require('web-push');
const SB_HEADERS = { 'apikey': SB_SERVICE_KEY, 'Authorization': `Bearer ${SB_SERVICE_KEY}`, 'Content-Type': 'application/json' };

webpush.setVapidDetails('mailto:contact@autocarnet.fr', VAPID_PUBLIC, VAPID_PRIVATE);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const params = new URLSearchParams(event.rawQuery || '');
  if (params.get('secret') !== ADMIN_SECRET) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: SB_HEADERS });
  const subs = await subsRes.json();
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

      // Si pas de rappels du jour, envoyer quand même un test
      if (!alerts.length) {
        alerts.push({ title: '🔔 AutoCarnet', body: 'Aucun rappel pour aujourd\'hui ✓' });
      }

      const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };

      for (const alert of alerts) {
        try {
          await webpush.sendNotification(pushSub, JSON.stringify({ title: alert.title, body: alert.body }));
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
