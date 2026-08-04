require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();

// Stripe's webhook needs the raw, unparsed request body to verify its signature.
// This route is registered BEFORE express.json() and handles the request itself,
// so it never reaches the JSON parser below.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), require('./routes/stripeWebhook'));

app.use(express.json({ limit: '2mb' }));

// Sends the two PUBLIC Supabase values to the browser. These are safe to expose --
// Supabase's row-level security (see supabase/schema.sql) is what actually protects the data,
// not secrecy of this URL/key pair. The SERVICE ROLE key is never sent here.
app.get('/config.js', (req, res) => {
  res.type('application/javascript').send(
    `window.ENV = ${JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
    })};`
  );
});

app.use('/api/ai-play', require('./routes/ai'));
app.use('/api/plays', require('./routes/plays'));
app.use('/api/team', require('./routes/team'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/stripe', require('./routes/stripe'));

app.use(express.static(path.join(__dirname, 'public')));

app.listen(process.env.PORT || 3000, () => {
  console.log(`RouteTree.ai server running on port ${process.env.PORT || 3000}`);
});
