const supabaseAdmin = require('./supabaseAdmin');

// Returns { hasAccess: boolean, planLabel: string } for a given profile row.
// hasAccess is true if the coach's own individual plan is active, OR their team's plan is active.
async function getPlanStatus(profile) {
  if (profile.individual_status === 'active') {
    return { hasAccess: true, planLabel: 'Individual' };
  }
  if (profile.team_id) {
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('status, name')
      .eq('id', profile.team_id)
      .single();
    if (team && team.status === 'active') {
      return { hasAccess: true, planLabel: 'Team: ' + team.name };
    }
  }
  return { hasAccess: false, planLabel: 'Free' };
}

module.exports = getPlanStatus;
