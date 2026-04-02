// Netlify function — reçoit les webhooks Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY||'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');

const SB_URL = 'https://qhacwsklhlsfyfxwnjff.supabase.co';
const SB_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoYWN3c2tsaGxzZnlmeHduamZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI5NzEyNiwiZXhwIjoyMDg5ODczMTI2fQ._glWcFJIdUUECVRiOiOUQCz5DN6A4Vz1fOiB1OdHpdw';

const PRICES = {
  'price_1THcvhPILh21QVYHvmYdmLbf': 'famille',
  'price_1THd3FPILh21QVYHlJQ28JpV': 'pro'
};

const SB_HEADERS = {
  'apikey': SB_SERVICE_KEY,
  'Authorization': `Bearer ${SB_SERVICE_KEY}`,
  'Content-Type': 'application/json'
};

async function updateUserPlan(email, plan, subscriptionId) {
  const listRes = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: SB_HEADERS });
  const listData = await listRes.json();
  const user = (listData.users || []).find(u => u.email === email.toLowerCase().trim());
  if (!user) { console.log('Utilisateur non trouvé:', email); return; }

  const newMeta = { ...user.user_metadata };
  if (plan) {
    newMeta.plan = plan;
    newMeta.is_premium = true;
    if (subscriptionId) newMeta.stripe_subscription_id = subscriptionId;
  } else {
    newMeta.plan = null;
    newMeta.is_premium = false;
  }

  await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: SB_HEADERS,
    body: JSON.stringify({ user_metadata: newMeta })
  });
  console.log(`Plan mis à jour: ${email} → ${plan || 'révoqué'}`);
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET||'whsec_ZNXoDbuSqxrOte0IKvTECvte5J4CMUlR';

  let stripeEvent;
  try {
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;

    if (webhookSecret && sig) {
      stripeEvent = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      stripeEvent = JSON.parse(body);
    }
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) };
  }

  const { type, data } = stripeEvent;
  console.log('Stripe webhook:', type);

  try {
    switch (type) {
      case 'checkout.session.completed': {
        const session = data.object;
        const email = session.customer_email || session.customer_details?.email;
        const plan = session.metadata?.plan;
        const subId = session.subscription;
        if (email && plan) await updateUserPlan(email, plan, subId);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = data.object;
        const email = sub.customer_email;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const plan = PRICES[priceId] || null;
        const status = sub.status;
        if (email) {
          if (['active', 'trialing'].includes(status)) {
            await updateUserPlan(email, plan, sub.id);
          } else if (['canceled', 'unpaid', 'past_due'].includes(status)) {
            await updateUserPlan(email, null, null);
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = data.object;
        const custRes = await stripe.customers.retrieve(sub.customer);
        const email = custRes.email;
        if (email) await updateUserPlan(email, null, null);
        break;
      }
      case 'invoice.payment_failed': {
        console.log('Paiement échoué:', data.object.customer_email);
        break;
      }
    }
  } catch (e) {
    console.error('Erreur webhook:', e.message);
  }

  return { statusCode: 200, headers, body: JSON.stringify({ received: true }) };
};
