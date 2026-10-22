// Supabase session for the /admin app. Staff sign in with their Supabase email + password (the `staff` table decides the role).
import { createClient } from '@supabase/supabase-js';
import { demoClient } from './demo.js';

export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const env = import.meta.env || {};
export const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL;
// Own storage key: the storefront's customer session lives on the same origin and must not be shared with staff.
export let sb = projectUrl && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(projectUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { storageKey: 'fs-admin-auth' } })
  : null;
export const setClient = (c) => { sb = c; me = null; }; // tests inject a fake client

export let me = null; // { id, name, role: 'admin' | 'cashier', branch_id, email }

// Demo: swap in the throwaway in-browser client until sign-out, then go back to the real one.
const real = sb;
let demo = false;
export function enterDemo() { sb = demoClient(); me = null; demo = true; }

export async function loadMe() {
  if (!sb) return (me = null); // not configured: show the login screen, which says so (and offers the demo)
  const { data } = await sb.auth.getSession();
  const s = data?.session;
  if (!s) return (me = null);
  if (me?.id === s.user.id) return me;
  const { data: row } = await sb.from('staff').select('name, role, branch_id').eq('user_id', s.user.id).maybeSingle();
  if (!row) { await sb.auth.signOut(); return (me = null); }
  return (me = { id: s.user.id, name: row.name || s.user.email, role: row.role === 'admin' ? 'admin' : 'cashier', branch_id: row.branch_id, email: s.user.email });
}

export async function signIn(email, password) {
  if (!sb) throw new UserError('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in apps/web/.env.local).', 500);
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new UserError(error.message);
  if (!(await loadMe())) throw new UserError('This account is not in the staff table. Add it in Supabase (see README, step 2).');
}

export async function signOut() {
  me = null;
  await sb?.auth.signOut();
  if (demo) { sb = real; demo = false; }
}
