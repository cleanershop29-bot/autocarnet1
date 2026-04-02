// Netlify function — crée une session Stripe Checkout
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY||'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');

const PRICES = {
  famille: 'price_1THcvhPILh21QVYHvmYdmLbf',
  pro: 'price_1THd3FPILh21QVYHlJQ28JpV'
};

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { plan, email } = body;
  if (!plan || !PRICES[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Plan invalide' }) };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      customer_email: email || undefined,
      success_url: 'https://autocarnet.fr/app.html?checkout=success&plan=' + plan,
      cancel_url: 'https://autocarnet.fr/premium.html',
      locale: 'fr',
      metadata: { plan }
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
