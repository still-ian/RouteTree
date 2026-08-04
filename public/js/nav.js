// Runs on every protected page. Applies the signed-in coach's saved accent color and
// drops a "plan" pill into the navbar's #planPill slot, if that page has one.
async function initNav(activePage) {
  const session = await requireSession();
  if (!session) return null;

  document.querySelectorAll('nav.top .links a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === activePage);
  });

  let me;
  try {
    me = await apiFetch('/api/profile/me');
  } catch (err) {
    console.error(err);
    return null;
  }

  document.documentElement.style.setProperty('--accent', me.profile.theme_color || '#4F8EF7');

  const pill = document.getElementById('planPill');
  if (pill) {
    pill.textContent = me.planStatus.planLabel;
    pill.classList.toggle('on', me.planStatus.hasAccess);
  }

  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);

  return me;
}
