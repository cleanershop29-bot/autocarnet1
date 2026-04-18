// netlify/functions/waitlist-notify.js
// Reçoit le webhook Supabase (INSERT dans waitlist_google_play)
// Envoie 2 emails via Resend :
//   1. Notification à contact@autocarnet.fr
//   2. Email de bienvenue à l'inscrit

exports.handler = async (event) => {

  // Sécurité
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

  const email = payload?.record?.email;
  const createdAt = payload?.record?.created_at;

  if (!email) {
    return { statusCode: 400, body: 'No email in payload' };
  }

  const date = createdAt
    ? new Date(createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
    : new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  const headers = {
    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── Email 1 : notification interne ──
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
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
            <div style="text-align:center;margin-top:20px;font-size:.7rem;color:#94A3B8">AutoCarnet · SIRET 914 511 639 00025</div>
          </div>
        `,
        text: `Nouvelle inscription waitlist Google Play\n\nEmail : ${email}\nDate : ${date}`,
      }),
    });

    // ── Email 2 : bienvenue à l'inscrit ──
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from: 'AutoCarnet <contact@autocarnet.fr>',
        to: [email],
        subject: `Vous êtes sur la liste — AutoCarnet arrive sur Google Play 🚀`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px">

            <div style="text-align:center;margin-bottom:28px">
              <div style="display:inline-block;background:#0A0F1E;padding:12px 24px;border-radius:14px">
                <span style="font-size:1.2rem;font-weight:900;color:#fff;letter-spacing:-.03em">Auto<span style="color:#2563EB">Carnet</span></span>
              </div>
            </div>

            <div style="background:#fff;border:1.5px solid #B8C4D8;border-radius:16px;padding:28px;margin-bottom:16px">
              <div style="font-size:1.1rem;font-weight:800;color:#0A0F1E;margin-bottom:10px">
                Vous êtes sur la liste ! 🎉
              </div>
              <div style="font-size:.9rem;color:#64748B;line-height:1.75;margin-bottom:20px">
                Merci pour votre inscription. Vous serez parmi les premiers à recevoir une notification dès qu'AutoCarnet sera disponible sur <strong style="color:#0A0F1E">Google Play</strong>.
              </div>

              <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:16px;margin-bottom:20px">
                <div style="font-size:.8rem;font-weight:700;color:#1D4ED8;margin-bottom:8px">En attendant, accédez à l'app dès maintenant</div>
                <div style="font-size:.8rem;color:#64748B;line-height:1.65;margin-bottom:14px">AutoCarnet est déjà disponible sur votre navigateur. Carnet d'entretien, rappels, prix carburant — tout y est, gratuitement.</div>
                <a href="https://autocarnet.fr/app.html" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(135deg,#3B82F6,#2563EB);color:#fff;font-size:.86rem;font-weight:800;text-decoration:none">
                  Accéder à AutoCarnet →
                </a>
              </div>

              <div style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;color:#64748B">
                  <span style="width:20px;height:20px;border-radius:50%;background:#ECFDF5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.75rem">✓</span>
                  Gratuit, sans publicité
                </div>
                <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;color:#64748B">
                  <span style="width:20px;height:20px;border-radius:50%;background:#ECFDF5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.75rem">✓</span>
                  Vos données vous appartiennent
                </div>
                <div style="display:flex;align-items:center;gap:10px;font-size:.8rem;color:#64748B">
                  <span style="width:20px;height:20px;border-radius:50%;background:#ECFDF5;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:.75rem">✓</span>
                  Fonctionne hors ligne
                </div>
              </div>
            </div>

            <div style="text-align:center;font-size:.72rem;color:#94A3B8;line-height:1.8">
              AutoCarnet · Fait avec ❤️ en Bretagne, France<br>
              <a href="https://autocarnet.fr" style="color:#94A3B8">autocarnet.fr</a>
            </div>

          </div>
        `,
        text: `Vous êtes sur la liste !\n\nMerci pour votre inscription. Vous serez parmi les premiers notifiés dès qu'AutoCarnet sera sur Google Play.\n\nEn attendant, accédez à l'app sur https://autocarnet.fr/app.html\n\nAutoCarnet · autocarnet.fr`,
      }),
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: 'Error: ' + err.message };
  }
};
