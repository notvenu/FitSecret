'use client';
import { useState } from 'react';
import { Star, BellRinging, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { supabase, orderError } from '@/lib/supabase';

type Kind = 'review' | 'message' | 'restock';
const SAVED = 'fs_address_v1'; // checkout remembers name + phone; reuse them so customers don't retype

function remembered() {
  try { const a = JSON.parse(localStorage.getItem(SAVED) || '{}'); return { name: a.name || '', phone: a.phone || '' }; } catch { return { name: '', phone: '' }; }
}

// Sends to the POS inbox (Online Store → Inbox) through the submit_feedback RPC.
export function useSubmit(kind: Kind) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const send = async (p: Record<string, unknown>) => {
    const sb = supabase();
    if (!sb) { setErr('This works once the online store is live. Please WhatsApp us meanwhile.'); return false; }
    setBusy(true); setErr('');
    const { error } = await sb.rpc('submit_feedback', { p: { kind, ...p } });
    setBusy(false);
    if (error) { setErr(orderError(error.message)); return false; }
    setDone(true);
    return true;
  };
  return { busy, err, done, send };
}

export function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return <span className="inline-flex text-amber-500" aria-label={`${n} out of 5 stars`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} weight={i <= Math.round(n) ? 'fill' : 'regular'} />)}</span>;
}

export function ReviewForm({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => ({ ...remembered(), rating: 0, title: '', body: '' }));
  const { busy, err, done, send } = useSubmit('review');
  if (done) return <p className="flex items-center gap-2 rounded-xl bg-brand/15 p-4 text-sm"><CheckCircle size={20} weight="fill" className="text-brand-deep" /> Thanks! Your review will appear once the store checks it.</p>;
  if (!open) return <button onClick={() => { setF((x) => ({ ...x, ...remembered() })); setOpen(true); }} className="btn-line px-6">Write a review</button>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); send({ item_id: itemId, ...f }); }} className="grid max-w-xl gap-4 rounded-[var(--radius-card)] bg-surface p-6">
      <div>
        <span className="text-sm text-mute">Your rating</span>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={f.rating === i} aria-label={`${i} star${i > 1 ? 's' : ''}`} onClick={() => setF({ ...f, rating: i })} className="text-amber-500">
              <Star size={30} weight={i <= f.rating ? 'fill' : 'regular'} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm"><span className="text-mute">Name</span><input className="field" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-2 text-sm"><span className="text-mute">Mobile (not shown)</span><input className="field" required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      </div>
      <label className="grid gap-2 text-sm"><span className="text-mute">Headline (optional)</span><input className="field" maxLength={100} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className="grid gap-2 text-sm"><span className="text-mute">Your review</span><textarea className="field" rows={4} required minLength={10} maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Taste, mixability, results…" /></label>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex gap-3"><button className="btn-ink px-6" disabled={busy || !f.rating}>{busy ? <CircleNotch className="animate-spin" size={18} /> : 'Submit review'}</button>
        <button type="button" className="btn-line px-6" onClick={() => setOpen(false)}>Cancel</button></div>
      <p className="text-xs text-mute">Buyers who received this product get a “Verified buyer” badge.</p>
    </form>
  );
}

export function NotifyMe({ itemId, label }: { itemId: string; label: string }) {
  const [f, setF] = useState(remembered);
  const { busy, err, done, send } = useSubmit('restock');
  if (done) return <p className="mt-4 flex items-center gap-2 rounded-xl bg-brand/15 p-3 text-sm"><CheckCircle size={18} weight="fill" className="text-brand-deep" /> We&apos;ll WhatsApp you when {label} is back.</p>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); send({ item_id: itemId, ...f }); }} className="mt-4 rounded-[var(--radius-card)] border border-line p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><BellRinging size={18} /> Notify me when it&apos;s back</div>
      <div className="flex flex-wrap gap-2">
        <input className="field min-w-0 flex-1" required minLength={2} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
        <input className="field min-w-0 flex-1" required inputMode="tel" placeholder="WhatsApp number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} aria-label="WhatsApp number" />
        <button className="btn-ink px-5" disabled={busy}>{busy ? <CircleNotch className="animate-spin" size={18} /> : 'Notify me'}</button>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
    </form>
  );
}
