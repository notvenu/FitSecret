'use client';
import { useState } from 'react';
import { Loader2, Send, BadgeCheck } from 'lucide-react';
import { supabase, orderError } from '@/lib/supabase';
import { WhatsApp } from '@/components/ui';

const TYPES = ['Gym', 'Clinic', 'Retailer', 'Other'];

// PRD §6.6. Saved to the POS inbox (Online Store → Inbox) via submit_feedback; WhatsApp is the instant fallback.
// Failure keeps everything typed (STATES §13).
export default function WholesaleForm({ phone }: { phone: string }) {
  const [f, setF] = useState({ business: '', type: 'Gym', city: 'Vijayawada', gstin: '', interest: '', volume: '', name: '', mobile: '', email: '', website: '' });
  const [state, setState] = useState<'editing' | 'submitting' | 'success' | 'failure'>('editing');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const body = () => [`Business: ${f.business} (${f.type}), ${f.city}`, f.gstin && `GSTIN: ${f.gstin}`, `Interested in: ${f.interest}`, f.volume && `Monthly quantity: ${f.volume}`, f.email && `Email: ${f.email}`].filter(Boolean).join('\n');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'submitting') return;
    if (f.website) return setState('success'); // honeypot: bots fill hidden fields
    const sb = supabase();
    if (!sb) { setState('failure'); setErr('The enquiry form opens with the online store. Please send it on WhatsApp for now.'); return; }
    setState('submitting'); setErr('');
    const { error } = await sb.rpc('submit_feedback', { p: { kind: 'message', name: f.name, phone: f.mobile, title: 'Wholesale enquiry', body: body() } });
    if (error) { setState('failure'); setErr(orderError(error.message)); } else setState('success');
  };
  const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(`Hi Fit Secrets, wholesale enquiry from ${f.name || '…'}.\n${body()}`)}`;

  if (state === 'success') return (
    <div className="rise grid justify-items-start gap-4 rounded-[28px] bg-river p-8 text-chalk">
      <span className="stamp grid size-16 place-items-center rounded-full bg-haldi text-deep"><BadgeCheck size={32} /></span>
      <p className="h3">Enquiry sent.</p>
      <p className="text-chalk/80">We&apos;ll call or WhatsApp you on {f.mobile} within one working day with prices and minimum quantities.</p>
    </div>
  );

  return (
    <form onSubmit={send} className="grid gap-4 rounded-[28px] bg-paper p-5 shadow-rest md:p-8">
      <h2 className="h3">Wholesale enquiry</h2>
      <input name="website" value={f.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <F label="Business name"><input className="field" required minLength={2} value={f.business} onChange={set('business')} autoComplete="organization" /></F>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Type"><select className="field" value={f.type} onChange={set('type')}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select></F>
        <F label="City"><input className="field" required value={f.city} onChange={set('city')} autoComplete="address-level2" /></F>
      </div>
      <F label="GSTIN (optional)"><input className="field num uppercase" value={f.gstin} onChange={set('gstin')} pattern="[0-9A-Za-z]{15}" title="15-character GSTIN" maxLength={15} /></F>
      <F label="Products you need"><textarea className="field" rows={3} required maxLength={600} value={f.interest} onChange={set('interest')} placeholder="e.g. whey protein, creatine, Ashwagandha churnam" /></F>
      <F label="Estimated monthly quantity (optional)"><input className="field" value={f.volume} onChange={set('volume')} placeholder="e.g. 20 jars" /></F>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Your name"><input className="field" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" /></F>
        <F label="Mobile number"><input className="field num" required inputMode="tel" pattern="[+0-9 \-]{10,15}" title="Enter a 10-digit mobile number" value={f.mobile} onChange={set('mobile')} autoComplete="tel" /></F>
      </div>
      <F label="Email (optional)"><input className="field" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></F>
      {err && <p role="alert" className="text-sm text-madder">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn btn-gold" disabled={state === 'submitting'}>{state === 'submitting' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}Send enquiry</button>
        <a href={wa} target="_blank" rel="noreferrer" className="btn btn-ghost"><WhatsApp size={18} />WhatsApp instead</a>
      </div>
    </form>
  );
}

const F = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>;
