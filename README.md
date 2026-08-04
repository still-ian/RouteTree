# RouteTree.ai

An AI-assisted football play designer. Coaches sign up, build formations and routes
by hand for free, and pay to unlock AI play generation ("type it up, watch it get drawn")
and cloud-saved plays -- individually, or as a shared team playbook.

This README is written for someone who hasn't deployed a real app before. Follow it in
order top to bottom -- don't skip steps, later ones depend on earlier ones.

---

## What you're building, in one picture

```
Browser (coaches)  --->  Render (runs server.js, this Node app)
                              |         |
                              |         +---> Anthropic API   (draws the play)
                              |         +---> Stripe            (billing)
                              +---> Supabase (login + database, talks to the browser directly for reads)
```

Supabase handles login and stores your data. Stripe handles payment. Render runs your
actual server (server.js) and serves the web pages. You'll create one account at each
of those three, plus Anthropic for the AI itself.

---

## Step 1: Anthropic API key (powers "Draw it up")

1. Go to console.anthropic.com and create an account (or log in with your existing one).
2. Go to Settings -> Billing and add a payment method, then set a **monthly spend limit** --
   start low, like $20, while you're testing. You can raise it later.
3. Go to Settings -> API Keys -> Create Key. Copy it somewhere safe -- you'll paste it into
   Render's environment variables in Step 5, and you won't be able to see it again after
   you leave the page.
4. Roughly what this costs: Claude Sonnet 5 is priced per million tokens of text, and a
   single "draw this play" request is small (a page or two of text in, a page of JSON out).
   Expect a fraction of a cent per play generated. Check platform.claude.com for current
   pricing -- it can change.

## Step 2: Supabase (login + database)

1. Go to supabase.com, sign up, and create a new project. Pick a strong database password
   and save it somewhere -- you likely won't need it again, but keep it anyway.
2. Once the project finishes setting up, go to the **SQL Editor** in the left sidebar,
   click **New query**, open `supabase/schema.sql` from this project, paste its entire
   contents in, and click **Run**. This creates every table, security rule, and helper
   function the app needs. If it says "Success", you're done with this step.
3. Go to **Project Settings -> API**. You'll need three values from this page later:
   - **Project URL** (`SUPABASE_URL`)
   - **anon public** key (`SUPABASE_ANON_KEY`)
   - **service_role** key (`SUPABASE_SERVICE_ROLE_KEY`) -- keep this one especially private,
     it bypasses all the security rules.
4. Go to **Authentication -> Providers** and confirm Email is enabled (it is by default).
   Optional but recommended while testing: **Authentication -> Settings**, turn OFF
   "Confirm email" so you can sign up and log in immediately without checking an inbox.
   Turn it back on before you launch for real.

## Step 3: Stripe (billing)

1. Go to stripe.com and create an account. You'll need your bank details for payouts --
   you can finish this later, but you need at least a basic account now to get API keys.
2. Make sure you're in **Test mode** (toggle top-right of the dashboard) while you're
   setting things up -- this lets you "pay" with fake test cards.
3. Go to **Product catalog -> Add product**. Create two products, each with a recurring
   monthly price:
   - "RouteTree Individual" -- $9.00/month -- copy its **Price ID** (starts with `price_`)
   - "RouteTree Team" -- $39.00/month -- copy its **Price ID**
4. Go to **Developers -> API keys**. Copy the **Secret key** (`STRIPE_SECRET_KEY`).
5. Go to **Developers -> Webhooks -> Add endpoint**. You won't have a live URL until
   after Step 5, so come back to this step once your app is deployed on Render:
   - Endpoint URL: `https://YOUR-RENDER-URL.onrender.com/api/stripe/webhook`
   - Events to send: `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - After creating it, copy the **Signing secret** (`STRIPE_WEBHOOK_SECRET`, starts with `whsec_`)

## Step 4: Put this project on GitHub

1. Create a free GitHub account if you don't have one.
2. Create a new (empty) repository, e.g. `routetree`.
3. Upload this entire project folder to it. Easiest way with no command line: on the
   repo page, click **Add file -> Upload files**, drag every file and folder in, commit.
   (Do NOT upload a `.env` file if you make one for local testing -- only `.env.example`
   should go up. `.env` should stay only on your own computer.)

## Step 5: Deploy on Render

1. Go to render.com, sign up, and connect your GitHub account.
2. **New -> Web Service**, pick your `routetree` repository.
3. Settings:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: Free is fine to start (it sleeps after inactivity; upgrade to a paid
     tier once you have real users so it doesn't nap between visits).
4. Under **Environment**, add every variable from `.env.example` with your real values
   from Steps 1-3. For `APP_URL`, use the Render URL Render gives you, e.g.
   `https://routetree.onrender.com` (no trailing slash).
5. Click **Create Web Service**. Wait for the build/deploy to finish (a few minutes).
6. Go back to Step 3.5 above and finish creating the Stripe webhook now that you have
   a real URL, then paste the signing secret into Render's environment variables and
   redeploy (Render does this automatically when you save new env vars).

## Step 6: Test it end to end

1. Visit your Render URL, sign up for an account.
2. Go to Billing, subscribe to Individual using a Stripe **test card**: `4242 4242 4242 4242`,
   any future expiry date, any 3-digit CVC.
3. Go to Plays -> New play, type a play description into "Draw it up", confirm it draws.
4. Save the play, go back to the dashboard, confirm it's listed, open it again.
5. Try Team: on a second test account, start a Team plan, go to Team, copy the join code,
   log in as a third test account and join with that code, confirm both can see the same
   saved plays.
6. Once everything works with test cards, flip Stripe out of Test mode, replace the
   test API keys in Render with your live ones, and you're taking real payments.

## Buying a real domain (optional but recommended)

Render gives you a free `.onrender.com` address, which works fine to start. When you're
ready for `routetree.ai` or similar: buy it from a registrar (Namecheap, Google Domains'
successor Squarespace Domains, etc., roughly $12-40/year depending on the TLD -- `.ai`
domains run more like $70-100/year), then in Render go to your service -> Settings ->
Custom Domains and follow their instructions to point it there. Update `APP_URL` in your
environment variables to match, and update the Stripe webhook URL too.

## Ongoing costs to expect

- Anthropic API: usage-based, pennies per play generated -- set a spend cap.
- Supabase: free tier covers a good amount of early usage; paid tier starts around $25/mo
  once you outgrow it.
- Stripe: no monthly fee, takes roughly 2.9% + $0.30 per transaction.
- Render: free tier to start; a persistently-awake instance runs roughly $7-25/mo.
- Domain: $12-100/year depending what you pick.

## What to build next

- Free-tier play limits (e.g. cap Free accounts at 3 saved plays) to push conversions.
- Email notifications when a teammate joins.
- A proper marketing pass on the landing page copy once you know what coaches respond to.
