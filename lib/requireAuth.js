const supabaseAdmin = require('./supabaseAdmin');

// Every protected API route expects the frontend to send:
//   Authorization: Bearer <supabase access token>
// (public/js/supabaseClient.js attaches this automatically on every fetch to /api/*)
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Session expired, please log in again.' });

    req.user = data.user;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) return res.status(401).json({ error: 'Profile not found.' });

    req.profile = profile;
    next();
  } catch (err) {
    console.error('requireAuth error:', err);
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}

module.exports = requireAuth;
