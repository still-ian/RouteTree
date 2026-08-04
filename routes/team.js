const express = require('express');
const requireAuth = require('../lib/requireAuth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const router = express.Router();

// Lists the coaches on the caller's current team (just names, not emails).
router.get('/members', requireAuth, async (req, res) => {
  if (!req.profile.team_id) return res.json({ members: [] });
  const { data, error } = await supabaseAdmin
    .from('profiles').select('id, display_name').eq('team_id', req.profile.team_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ members: data });
});

// Join an existing (paid, active) team using its 6-character code.
router.post('/join', requireAuth, async (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Enter a team code.' });

  const { data: team, error } = await supabaseAdmin.rpc('find_team_by_code', { code });
  const match = Array.isArray(team) ? team[0] : team;
  if (error || !match) return res.status(404).json({ error: 'No team found with that code.' });
  if (match.status !== 'active') return res.status(400).json({ error: 'That team\'s subscription is not active.' });

  const { data: countData } = await supabaseAdmin.rpc('team_member_count', { t_id: match.id });
  if ((countData || 0) >= match.seat_limit) {
    return res.status(400).json({ error: 'That team is at its seat limit. Ask the team owner to add seats.' });
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles').update({ team_id: match.id }).eq('id', req.user.id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({ team: match });
});

// Leave the current team (back to a personal account).
router.post('/leave', requireAuth, async (req, res) => {
  await supabaseAdmin.from('profiles').update({ team_id: null }).eq('id', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
