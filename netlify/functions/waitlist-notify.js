// netlify/functions/waitlist-notify.js
// Reçoit le webhook Supabase (INSERT dans waitlist_google_play)
// Envoie une notification email via Resend API

exports.handler = async (event) => {

  // Sécurité : vérifier le secret partagé avec Supabase
  const secret = event.headers['x-webhook-secret'];
  if (secret !== process.env.WAITLIST_WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // Parser le body envoyé par Supabase
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const email = payload?.record?.email;
  const createdAt = payload?.record?.created_at;

  if (!email) {
    return { statusCode: 400, body: 'No email in payload' };
  }

  const date = createdAt
    ? new Date(createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    : new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  // Appel API Resend
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AutoCarnet <contact@autocarnet.fr>',
        to: ['contact@autocarnet.fr'],
        subject: `🚀 Nouvelle inscription Google Play — ${email}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px">
            <div style="text-align:center;margin-bottom:28px">
              <div style="display:inline-block;background:#0A0F1E;padding:10px 22px;border-radius:12px">
                <span style="font-size:1.1rem;font-weight:900;color:#fff;letter-spacing:-.03em">Auto<span style="color:#2563EB">Carnet</span></span>
              </div>
            </div>
            <div style="background:#fff;border:1.5px solid #B8C4D8;border-radius:16px;padding:28px">
              <div style="font-size:1.05rem;font-weight:800;color:#0A0F1E;margin-bottom:6px">Nouvelle inscription waitlist Google Play 🎉</div>
              <div style="font-size:.85rem;color:#64748B;margin-bottom:22px;line-height:1.6">Quelqu'un veut être notifié dès la sortie de l'app sur Google Play.</div>
              <div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:10px;padding:16px;margin-bottom:14px">
                <div style="font-size:.68rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.1em;margin-bottom:5px">Email inscrit</div>
                <div style="font-size:1rem;font-weight:800;color:#0A0F1E">${email}</div>
              </div>
              <div style="font-size:.76rem;color:#94A3B8">Inscrit le ${date}</div>
            </div>
            <div style="text-align:center;margin-top:20px;font-size:.7rem;color:#94A3B8">AutoCarnet · SIRET 914 511 639 00025 · Bretagne, France</div>
          </div>
        `,
        text: `Nouvelle inscription waitlist Google Play\n\nEmail : ${email}\nDate : ${date}`,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { statusCode: 500, body: 'Resend error: ' + err };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 500, body: 'Error: ' + err.message };
  }
};
