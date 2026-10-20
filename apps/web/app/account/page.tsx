'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { EnvelopeSimple, SignOut } from '@phosphor-icons/react';
import { inr, ORDER_LABEL } from '@fitsecret/shared';
import { supabase } from '@/lib/supabase';

type Order = { id: string; order_no: string; phone: string; status: string; total: number; created_at: string; order_lines: { name: string; qty: number }[] };

export default function Account() {
  const sb = supabase();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!sb) return setReady(true);
    sb.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    if (!sb || !user) return;
    sb.from('orders').select('id, order_no, phone, status, total, created_at, order_lines(name, qty)').order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) || []));
  }, [sb, user]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const { error } = await sb!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
    error ? setErr(error.message) : setSent(true);
  };

  if (!ready) return null;
  if (!sb) return <Shell><p className="text-mute">Accounts open with the online store. Meanwhile you can <Link className="text-brand-deep" href="/track">track an order</Link>.</p></Shell>;
  if (!user) return (
    <Shell>
      <p className="max-w-md text-mute">Sign in with your email to see every order in one place. No password needed.</p>
      {sent ? <p className="mt-6 rounded-[10px] bg-brand/15 p-4">Check <b>{email}</b> for a sign-in link.</p> : (
        <form onSubmit={login} className="mt-6 flex max-w-md flex-col gap-3 sm:flex-row">
          <label htmlFor="em" className="sr-only">Email</label>
          <input id="em" type="email" required className="field" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-ink"><EnvelopeSimple size={18} /> Email me a link</button>
        </form>
      )}
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      <p className="mt-8 text-sm text-mute">Checked out as a guest? <Link href="/track" className="text-brand-deep">Track with order number</Link>.</p>
    </Shell>
  );
  return (
    <Shell>
      <div className="flex items-center justify-between text-sm text-mute">
        <span>{user.email}</span>
        <button onClick={() => sb.auth.signOut()} className="inline-flex items-center gap-1 hover:text-ink"><SignOut /> Sign out</button>
      </div>
      {!orders ? <div className="mt-8 h-24 animate-pulse rounded-[var(--radius-card)] bg-surface" /> : !orders.length ? (
        <p className="mt-10 text-mute">No orders yet. Orders placed while signed in show up here.</p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/track?no=${o.order_no}&phone=${o.phone}`} className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] bg-surface p-5 transition-colors hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="font-semibold">{o.order_no} <span className="ml-2 text-sm font-normal text-brand-deep">{ORDER_LABEL[o.status]}</span></div>
                  <div className="truncate text-sm text-mute">{o.order_lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</div>
                </div>
                <div className="text-right"><div className="font-bold tabular-nums">{inr(o.total)}</div><div className="text-xs text-mute">{new Date(o.created_at).toLocaleDateString('en-IN')}</div></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-3xl px-4 pt-10 md:px-6"><h1 className="mb-6 display text-4xl md:text-5xl">My orders</h1>{children}</div>
);
