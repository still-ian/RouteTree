const express = require('express');
const Stripe = require('stripe');
const requireAuth = require('../lib/requireAuth');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Kicks off a subscription checkout for either plan. Stripe redirects the coach back to
// billing.html afterwards; the actual account upgrade happens in routes/stripeWebhook.js
// once Stripe confirms payment -- never trust the redirect alone for that.
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  const { plan } = req.body || {}; // 'individual' | 'team'
  if (plan !== 'individual' && plan !== 'team') {
    return res.status(400).json({ error: 'Unknown plan.' });
  }
  const priceId = plan === 'individual' ? process.env.STRIPE_PRICE_INDIVIDUAL : process.env.STRIPE_PRICE_TEAM;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.id,
      customer_email: req.user.email,
      metadata: { supabase_user_id: req.user.id, plan },
      subscription_data: { metadata: { supabase_user_id: req.user.id, plan } },
      success_url: `${process.env.APP_URL}/billing.html?checkout=success`,
      cancel_url: `${process.env.APP_URL}/billing.html?checkout=canceled`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    res.status(500).json({ error: 'Could not start checkout.' });
  }
});

// Lets an already-paying coach manage or cancel their subscription via Stripe's hosted portal.
router.post('/create-portal-session', requireAuth, async (req, res) => {
  const customerId = req.profile.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: 'No active subscription to manage.' });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.APP_URL}/billing.html`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('create-portal-session error:', err);
    res.status(500).json({ error: 'Could not open the billing portal.' });
  }
});

module.exports = router;
