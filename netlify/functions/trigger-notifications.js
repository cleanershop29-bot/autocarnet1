const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';
const ADMIN_SECRET = 'AC2026admin';

const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

const FIREBASE_PROJECT_ID = 'autocarnet-213ab';
const FIREBASE_CLIENT_EMAIL = 'firebase-adminsdk-fbsvc@autocarnet-213ab.iam.gserviceaccount.com';
const FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDiaEmFM+tcs1qO\ntGeRMoMd4cnB3sGoyjZNUB+XcSCLymcW55iZX4Dtjh4rJzM+9+FKBhfJ4U5E1sVy\ngoEErYiU4wQHYFMBIAhx33zSTAZ2BxPO584VQC+zWOWdS7XWNvpqAwbqU8oeQOZB\n69nbv9z0XiVl1roSGZ82kYgTZ13qBT2Dren/UfHtcc4TQdTWwhFPAn99gFFWm5hJ\nCJn0cNsOS2N43MkUGGej4GazwfSK5WHTuoal/1l849G2wlVA8/7GPJr/LNE/HHDb\nKX70zaHlwGsCQBQV0H4BMp34rp8N4cUYAUwtZCfnlVaTLUdKQOqN37sExmGwITdA\n3sZ6w4v/AgMBAAECggEABUGZj1uct7q8O/rpOqA7FgsDZZpX0aTcLOBS02+/ay9o\nREpdKxZiBmHZxnOzB1+23cKVc8zkxclcrSNlfmfO93HryoYMd0a4m3guTC2SqtPQ\nPGn6SVkDonzKW+QBlTcSijqGwxLt6tTj45znomfqZ8v1v08EY94vaZNoXtb0AbZR\nQGICUhro6Wx6Mn7MGq+z+2nI7wLSc7sfdlzmuoPdNg29vC3OtaeJ6gy/sFkhIJ2U\nnICyPIiUaJxWkd31D/pFX4B28o7TQ+VSZH7M+YhjrAaepMCn6iAI4RgB5FXAUwSo\nMCps2WlnNlsuQAKCrvi4sKpzSQH89eWcOINeE1TgrQKBgQD2DzQf2YXTHv4ncLE8\nQQ0ssrQN88eupN22RK3d3m4M8b5VkfsSZ19vNtoALTHFm0D2vscDFg5ixvvVyao2\nzQLDdx+fZqx/h+1+j+Z3XXstJOWqnQGVPDxBnWcs9sHszFPp4V+/5xzdnGMn3OBT\no/qukvXFGsdgqZts89JsHUIBMwKBgQDrjdah1NPw/CbSeFVwCcA4zXnhCo/Bed5S\n1Zo8T3RW1SKAE4vWkMAcFL9w22TyJ6LdpkWVBaqkkfE1LrWIjHOR/6PZA/hmHxDy\n1Ftugc7uKeF0B3nG++lfR/ex5XcktVEU3t3y8AFcAEGk4RPheyIIQrw0F2EElANf\ncDLeU+xiBQKBgQCSnRiH6crNs2fpBEL3DiPVgF28+ob+zwm0s1OOIh0c5WZuAl/B\n5Yp98AcRl9xSTGH3JFHcyuWjgcFI77LWmG2PHonfJwSdsNaYVRIUCcV9bsDSWl85\nFv0oc6uopReEC3PspfexlvoiKi8C759S9yBFqRd8bKpkNGuCDf5RoVVU9QKBgH2V\n4LHlY54fAZ/DEmIqgLaILovh8qUHkZX+Vj4DapaFCeDZCvw5roMKOMs13YsRwM6F\nwKFkJQea28wr/BMyNsfHURb5++yOcZ3VxG2VfbsSzyXqem2xj0oCd7f8DFqg5PrI\nm/LTLRZc+KKsccoMuSdIVUk8kbg8JdQzYJuSiPv1AoGBAJPon9Jd69l3Efm5cPfy\nyOzgDvhHW/VVrHdm2RGTYC4sYPpf8WYJmbiHCAj3jiRTaD1svd+69wqnOlNYZ4Rb\n+/0FtT1h7AV2PCm69ngCXHQFem2XW6jlByiTHgt81plf+JmsPuZrt/P22JSZWobF\n/xBVvQZhV1v/rTL8Pl8ef2lo\n-----END PRIVATE KEY-----\n';

// Générer un JWT pour FCM v1
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;

  const { createSign } = require('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(FIREBASE_PRIVATE_KEY, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const d = await r.json();
  return d.access_token;
}

// Envoyer une notif via FCM v1
async function sendFCM(endpoint, title, body, url) {
  const token = endpoint.split('/').pop();
  const accessToken = await getAccessToken();

  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: 'https://autocarnet.fr/icon-192.png',
            click_action: url || 'https://autocarnet.fr/app.html'
          },
          fcm_options: { link: url || 'https://autocarnet.fr/app.html' }
        },
        android: {
          notification: { title, body, icon: 'icon-192', click_action: 'FLUTTER_NOTIFICATION_CLICK' }
        }
      }
    })
  });

  if (!r.ok) {
    const err = await r.json();
    const code = err?.error?.details?.[0]?.errorCode || err?.error?.status;
    if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') {
      throw { statusCode: 410, message: 'Token invalide' };
    }
    throw { statusCode: r.status, message: JSON.stringify(err) };
  }
  return true;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const params = new URLSearchParams(event.rawQuery || '');
  if (params.get('secret') !== ADMIN_SECRET) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const userId = params.get('user_id') || null;
  const title  = params.get('title') || null;
  const body   = params.get('body') || null;

  // Mode instantané
  if (userId && title && body) {
    const subRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}&select=*`, { headers: SB_HEADERS });
    const subArr = await subRes.json();
    if (!Array.isArray(subArr) || !subArr.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'Pas de souscription' }) };
    }
    const sub = subArr[0];
    try {
      await sendFCM(sub.endpoint, title, body, 'https://autocarnet.fr/app.html');
      return { statusCode: 200, headers, body: JSON.stringify({ sent: 1 }) };
    } catch(e) {
      return { statusCode: 200, headers, body: JSON.stringify({ error: e.message, statusCode: e.statusCode }) };
    }
  }

  // Mode complet : rappels du jour
  const subsFilter = userId ? `user_id=eq.${userId}&select=*` : `select=*`;
  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?${subsFilter}`, { headers: SB_HEADERS });
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

      if (!alerts.length) {
        alerts.push({ title: '🔔 AutoCarnet', body: "Aucun rappel pour aujourd'hui ✓" });
      }

      for (const alert of alerts) {
        try {
          await sendFCM(sub.endpoint, alert.title, alert.body, 'https://autocarnet.fr/app.html');
          sent++;
        } catch(e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            expired++;
            break;
          }
          errors++;
        }
      }
    } catch(e) {
      errors++;
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ sent, errors, expired, total_subs: subs.length }) };
};
