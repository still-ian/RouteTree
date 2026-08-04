const express = require('express');
const requireAuth = require('../lib/requireAuth');
const supabaseAdmin = require('../lib/supabaseAdmin');
const getPlanStatus = require('../lib/planStatus');

const router = express.Router();

// Returns the signed-in coach's profile plus their current plan status --
// the frontend calls this on every page load to know what to show.
router.get('/me', requireAuth, async (req, res) => {
  const status = await getPlanStatus(req.profile);
  let team = null;
  if (req.profile.team_id) {
    const { data } = await supabaseAdmin.from('teams').select('*').eq('id', req.profile.team_id).single();
    team = data || null;
  }
  res.json({ profile: req.profile, planStatus: status, team });
});

router.put('/me', requireAuth, async (req, res) => {
  const { display_name, theme_color } = req.body || {};
  const update = {};
  if (display_name) update.display_name = String(display_name).slice(0, 40);
  if (theme_color && /^#[0-9a-fA-F]{6}$/.test(theme_color)) update.theme_color = theme_color;
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  const { data, error } = await supabaseAdmin
    .from('profiles').update(update).eq('id', req.user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

module.exports = router;
