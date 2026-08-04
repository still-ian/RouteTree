const express = require('express');
const Stripe = require('stripe');
const supabaseAdmin = require('../lib/supabaseAdmin');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

function makeJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function activatePlan(userId, plan, customerId, subscriptionId) {
  if (plan === 'individual') {
    await supabaseAdmin.from('profiles').update({
      individual_status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId
    }).eq('id', userId);
    return;
  }

  if (plan === 'team') {
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();
    if (profile && profile.team_id) {
      await supabaseAdmin.from('teams').update({
        status: 'active', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId
      }).eq('id', profile.team_id);
      return;
    }
    const { data: team } = await supabaseAdmin.from('teams').insert({
      name: (profile && profile.display_name ? profile.display_name + "'s Team" : 'New Team'),
      join_code: makeJoinCode(),
      owner_id: userId,
      status: 'active',
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId
    }).select().single();
    if (team) await supabaseAdmin.from('profiles').update({ team_id: team.id }).eq('id', userId);
  }
}

async function syncSubscriptionStatus(subscriptionId, status) {
  const { data: profileMatch } = await supabaseAdmin
    .from('profiles').select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle();
  if (profileMatch) {
    await supabaseAdmin.from('profiles').update({ individual_status: status }).eq('id', profileMatch.id);
    return;
  }
  const { data: teamMatch } = await supabaseAdmin
    .from('teams').select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle();
  if (teamMatch) {
    await supabaseAdmin.from('teams').update({ status }).eq('id', teamMatch.id);
  }
}

// Stripe calls this endpoint directly (never the browser) whenever a payment or
// subscription changes. req.body arrives as a raw Buffer -- see server.js -- which
// is required for constructEvent to verify the signature below.
router.post('/', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata && session.metadata.supabase_user_id;
      const plan = session.metadata && session.metadata.plan;
      if (userId && plan) await activatePlan(userId, plan, session.customer, session.subscription);
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const status = sub.status === 'active' || sub.status === 'trialing' ? 'active'
        : sub.status === 'past_due' ? 'past_due' : 'canceled';
      await syncSubscriptionStatus(sub.id, status);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err);
    res.status(500).json({ error: 'Webhook handler failed.' });
  }
});

module.exports = router;
