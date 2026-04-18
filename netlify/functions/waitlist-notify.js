// netlify/functions/waitlist-notify.js
// Appelé par un webhook Supabase à chaque INSERT dans waitlist_google_play
// Envoie un email de notification à contact@autocarnet.fr via Brevo SMTP

const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  // Sécurité : vérifier le secret partagé
  const secret = event.headers['x-webhook-secret'];
  if (secret !== process.env.WAITLIST_WEBHOOK_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Supabase envoie le record dans payload.record
  const email = payload?.record?.email;
  const createdAt = payload?.record?.created_at;

  if (!email) {
    return { statusCode: 400, body: 'No email in payload' };
  }

  // Transporter Brevo SMTP
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_SMTP_USER,   // login Brevo (votre email Brevo)
      pass: process.env.BREVO_SMTP_KEY,    // clé SMTP Brevo
    },
  });

  const date = createdAt
    ? new Date(createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    : new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  try {
    await transporter.sendMail({
      from: '"AutoCarnet" <contact@autocarnet.fr>',
      to: 'contact@autocarnet.fr',
      subject: '🎉 Nouvelle inscription Google Play — ' + email,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:16px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="display:inline-flex;align-items:center;gap:8px;background:#0A0F1E;padding:10px 20px;border-radius:12px">
              <span style="font-size:1.1rem;font-weight:900;color:#fff;letter-spacing:-.03em">Auto<span style="color:#2563EB">Carnet</span></span>
            </div>
          </div>
          <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #B8C4D8">
            <div style="font-size:1.1rem;font-weight:800;color:#0A0F1E;margin-bottom:6px">Nouvelle inscription waitlist Google Play 🚀</div>
            <div style="font-size:.85rem;color:#64748B;margin-bottom:20px">Quelqu'un veut être notifié dès la sortie sur Google Play.</div>
            <div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
              <div style="font-size:.72rem;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Email inscrit</div>
              <div style="font-size:1rem;font-weight:800;color:#0A0F1E">${email}</div>
            </div>
            <div style="font-size:.78rem;color:#94A3B8">Inscrit le ${date}</div>
          </div>
          <div style="text-align:center;margin-top:20px;font-size:.72rem;color:#94A3B8">AutoCarnet · SIRET 914 511 639 00025</div>
        </div>
      `,
      text: `Nouvelle inscription waitlist Google Play\n\nEmail : ${email}\nDate : ${date}`,
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Mail error:', err);
    return { statusCode: 500, body: 'Mail error: ' + err.message };
  }
};
