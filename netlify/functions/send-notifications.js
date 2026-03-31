// Netlify Scheduled Function — s'execute chaque matin à 8h
// Configuration dans netlify.toml : [functions."send-notifications"] schedule = "0 7 * * *"

const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

const VAPID_PUBLIC  = 'BE7KvvdlYZM6Ph2Eipldx1_wDUCrhSRn6FYP3CN9oQq6oRzR1T0UYecZ3xQMjruj0tTvWjwy54P7ZFJXyKNjW6Y';
const VAPID_PRIVATE = 'y5GC26Lqyv-PEL85oUvfKSpPcwbSykYbHG_w1Ci-o3k';
const VAPID_SUBJECT = 'mailto:contact@autocarnet.fr';

const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

// ── Crypto helpers VAPID ──
const crypto = require('crypto');

function base64urlToBuffer(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function bufferToBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createVapidToken(audience) {
  const header = bufferToBase64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = bufferToBase64url(Buffer.from(JSON.stringify({
    aud: audience, exp: now + 43200, sub: VAPID_SUBJECT
  })));
  const signing = `${header}.${payload}`;
  const privKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex'),
      base64urlToBuffer(VAPID_PRIVATE),
      Buffer.from('a144034200', 'hex'),
      base64urlToBuffer(VAPID_PUBLIC)
    ]),
    format: 'der', type: 'pkcs8'
  });
  const sig = crypto.sign('sha256', Buffer.from(signing), { key: privKey, dsaEncoding: 'ieee-p1363' });
  return `${signing}.${bufferToBase64url(sig)}`;
}

async function sendPush(sub, title, body) {
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const token = createVapidToken(audience);

    const payload = JSON.stringify({ title, body, icon: '/icon-192.png', badge: '/icon-192.png' });

    // Chiffrement du payload (Web Push encryption)
    const serverKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const serverPub = serverKeys.publicKey.export({ type: 'spki', format: 'der' }).slice(-65);
    const clientPub = base64urlToBuffer(sub.p256dh);
    const authSecret = base64urlToBuffer(sub.auth);

    const sharedSecret = crypto.diffieHellman({
      privateKey: serverKeys.privateKey,
      publicKey: crypto.createPublicKey({ key: clientPub, format: 'der', type: 'spki' })
    });

    // PRK
    const prk = crypto.hkdfSync('sha256', sharedSecret, authSecret,
      Buffer.concat([Buffer.from('Content-Encoding: auth\0'), ]), 32);

    // Salt
    const salt = crypto.randomBytes(16);

    // CEK + nonce
    const context = Buffer.concat([Buffer.from('P-256\0'), Buffer.alloc(2), Buffer.from([clientPub.length]), clientPub, Buffer.alloc(2), Buffer.from([serverPub.length]), serverPub]);
    const cek = crypto.hkdfSync('sha256', prk, salt, Buffer.concat([Buffer.from('Content-Encoding: aesgcm\0'), context]), 16);
    const nonce = crypto.hkdfSync('sha256', prk, salt, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), context]), 12);

    // Chiffrer
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const padded = Buffer.concat([Buffer.alloc(2), Buffer.from(payload)]);
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

    const r = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${token},k=${VAPID_PUBLIC}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aesgcm',
        'Encryption': `salt=${bufferToBase64url(salt)}`,
        'Crypto-Key': `dh=${bufferToBase64url(serverPub)};p256ecdh=${bufferToBase64url(serverPub)}`,
        'TTL': '86400'
      },
      body: encrypted
    });

    if (r.status === 410 || r.status === 404) return 'expired';
    return r.ok ? 'ok' : 'error';
  } catch(e) {
    console.error('Push error:', e.message);
    return 'error';
  }
}

exports.handler = async () => {
  console.log('send-notifications: démarrage');

  const today = new Date();
  today.setHours(0,0,0,0);

  // Récupérer tous les abonnements push
  const subsRes = await fetch(`${SB_URL}/rest/v1/push_subscriptions?select=*`, { headers: SB_HEADERS });
  const subs = await subsRes.json();
  if (!subs.length) return { statusCode: 200, body: 'Aucun abonné' };

  // Pour chaque abonné, trouver ses rappels du jour et des 2 prochains jours
  let sent = 0, errors = 0, expired = 0;

  for (const sub of subs) {
    try {
      // Récupérer les entretiens avec rappel aujourd'hui ou dans 2 jours
      const entsRes = await fetch(
        `${SB_URL}/rest/v1/entretiens?user_id=eq.${sub.user_id}&rappel_date=not.is.null&select=*`,
        { headers: SB_HEADERS }
      );
      const ents = await entsRes.json();

      // Rappels custom
      const rcRes = await fetch(
        `${SB_URL}/rest/v1/rappels_custom?user_id=eq.${sub.user_id}&date_rappel=not.is.null&statut=eq.actif&select=*`,
        { headers: SB_HEADERS }
      );
      const rcs = await rcRes.json();

      const alerts = [];

      ents.forEach(e => {
        if (!e.rappel_date) return;
        const d = new Date(e.rappel_date); d.setHours(0,0,0,0);
        const diff = Math.round((d - today) / 86400000);
        if (diff === 0) alerts.push({ title: '🔧 Entretien aujourd\'hui', body: e.type || 'Entretien prévu' });
        if (diff === 1) alerts.push({ title: '🔧 Entretien demain', body: e.type || 'Entretien prévu' });
        if (diff === 7) alerts.push({ title: '🔧 Entretien dans 7 jours', body: e.type || 'Entretien prévu' });
      });

      rcs.forEach(r => {
        if (!r.date_rappel) return;
        const d = new Date(r.date_rappel); d.setHours(0,0,0,0);
        const diff = Math.round((d - today) / 86400000);
        if (diff === 0) alerts.push({ title: '📌 ' + r.titre, body: 'Rappel aujourd\'hui' });
        if (diff === 1) alerts.push({ title: '📌 ' + r.titre, body: 'Rappel demain' });
      });

      for (const alert of alerts) {
        const result = await sendPush(sub, alert.title, alert.body);
        if (result === 'ok') sent++;
        else if (result === 'expired') {
          expired++;
          // Supprimer l'abonnement expiré
          await fetch(`${SB_URL}/rest/v1/push_subscriptions?user_id=eq.${sub.user_id}`, {
            method: 'DELETE', headers: SB_HEADERS
          });
        } else errors++;
      }
    } catch(e) {
      console.error('Erreur pour user', sub.user_id, e.message);
      errors++;
    }
  }

  console.log(`send-notifications: ${sent} envoyés, ${errors} erreurs, ${expired} expirés`);
  return { statusCode: 200, body: JSON.stringify({ sent, errors, expired }) };
};
