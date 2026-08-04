const express = require('express');
const requireAuth = require('../lib/requireAuth');
const supabaseAdmin = require('../lib/supabaseAdmin');

const router = express.Router();

// List every play the coach can see: their own personal plays, plus their team's shared plays.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('plays')
    .select('id, name, team_id, owner_id, created_at, updated_at')
    .or(`owner_id.eq.${req.user.id}${req.profile.team_id ? `,team_id.eq.${req.profile.team_id}` : ''}`)
    .order('updated_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ plays: data });
});

// Fetch one play's full data (players + routes) to load into the designer.
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('plays')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Play not found.' });
  const allowed = data.owner_id === req.user.id || (data.team_id && data.team_id === req.profile.team_id);
  if (!allowed) return res.status(403).json({ error: 'Not your play.' });

  res.json({ play: data });
});

// Save a new play. shareWithTeam=true stores it against the coach's team (visible to teammates)
// instead of just their personal account -- only meaningful if they're on a team plan.
router.post('/', requireAuth, async (req, res) => {
  const { name, data, shareWithTeam } = req.body || {};
  if (!name || !data) return res.status(400).json({ error: 'Missing play name or data.' });

  const row = {
    owner_id: req.user.id,
    team_id: shareWithTeam && req.profile.team_id ? req.profile.team_id : null,
    name: String(name).slice(0, 80),
    data
  };

  const { data: inserted, error } = await supabaseAdmin.from('plays').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ play: inserted });
});

// Overwrite an existing play's diagram (used when re-saving after edits).
router.put('/:id', requireAuth, async (req, res) => {
  const { name, data } = req.body || {};
  const { data: existing } = await supabaseAdmin.from('plays').select('*').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Play not found.' });
  const allowed = existing.owner_id === req.user.id || (existing.team_id && existing.team_id === req.profile.team_id);
  if (!allowed) return res.status(403).json({ error: 'Not your play.' });

  const update = { updated_at: new Date().toISOString() };
  if (name) update.name = String(name).slice(0, 80);
  if (data) update.data = data;

  const { data: updated, error } = await supabaseAdmin
    .from('plays').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ play: updated });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { data: existing } = await supabaseAdmin.from('plays').select('*').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Play not found.' });
  const allowed = existing.owner_id === req.user.id || (existing.team_id && existing.team_id === req.profile.team_id);
  if (!allowed) return res.status(403).json({ error: 'Not your play.' });

  const { error } = await supabaseAdmin.from('plays').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
