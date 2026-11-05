// Supabase session for /admin (the Online Store admin). Staff sign in with their Supabase email + password; the
// `staff` table must have a row for them (role 'admin' for the owner; RLS checks it on every table).
import { createClient } from '@supabase/supabase-js';

export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const env = import.meta.env || {};
// Own storage key: the storefront's customer session lives on the same origin and must not be shared with staff.
export let sb = env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { storageKey: 'fs-admin-auth' } })
  : null;
export const setClient = (c) => { sb = c; me = null; }; // tests inject a client

let me = null; // { id, name, role }

export async function loadMe() {
  if (!sb) return (me = null);
  const { data } = await sb.auth.getSession();
  const s = data?.session;
  if (!s) return (me = null);
  if (me?.id === s.user.id) return me;
  const { data: row } = await sb.from('staff').select('name, role').eq('user_id', s.user.id).maybeSingle();
  if (!row) { await sb.auth.signOut(); return (me = null); }
  // staff role 'admin' (or 'owner') = the owner: every Online Store screen. Anyone else: orders, inbox, offers and customers.
  const owner = ['admin', 'owner'].includes(row.role);
  return (me = { id: s.user.id, name: row.name || s.user.email, role: owner ? 'admin' : 'cashier', perms: owner ? null : { online: true, offers: true, parties: true }, email: s.user.email });
}

export async function signIn(email, password) {
  if (!sb) throw new UserError('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY in apps/web/.env.local).', 500);
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new UserError(error.message);
  if (!(await loadMe())) throw new UserError('This account is not a staff login. Add it to the staff table in Supabase (role admin for the owner).');
}

export async function signOut() {
  me = null;
  await sb?.auth.signOut();
}
