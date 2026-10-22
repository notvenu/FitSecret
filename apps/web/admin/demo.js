// Demo mode for /admin: a stand-in for the Supabase client that keeps everything in this tab, so the POS screens can be shown without a login.
// It speaks just enough of the API for backend.js (session, staff row, sync_push / sync_pull). Nothing leaves the browser.
// ponytail: the log only grows and a reload starts over; fine for a walkthrough, not for real data.
export function demoClient() {
  const log = [];
  const ok = (data) => ({ data, error: null });
  return {
    auth: { getSession: async () => ok({ session: { user: { id: 'demo', email: 'demo@fitsecrets.in' } } }), signOut: async () => {} },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ok({ name: 'Demo Owner', role: 'admin', branch_id: null }) }) }) }),
    rpc: async (name, a) => {
      if (name === 'sync_push') {
        for (const [t, rows] of Object.entries(a.p)) for (const r of rows) log.push({ t, r: structuredClone(r) });
        return ok({});
      }
      if (name === 'sync_pull') return ok({ rows: log.slice(a.p_since), cursor: log.length, more: false });
      return { data: null, error: { message: 'Not available in the demo' } };
    },
  };
}
