'use client';
import { useState } from 'react';
import { WhatsappLogo, PaperPlaneTilt, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { useSubmit } from '@/components/Feedback';

// Saved to the POS inbox (Online Store → Inbox); WhatsApp stays as the instant option.
export default function EnquiryForm({ phone }: { phone: string }) {
  const [f, setF] = useState({ name: '', mobile: '', topic: 'Product question', message: '', order_no: '' });
  const { busy, err, done, send: save } = useSubmit('message');
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    save({ name: f.name, phone: f.mobile, order_no: f.order_no, title: f.topic, body: f.message });
  };
  const whatsapp = () => {
    const text = `Hi Fit Secrets, I'm ${f.name}.\n${f.topic}: ${f.message}`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  if (done) return <p className="mt-6 flex items-center gap-2 rounded-xl bg-brand/15 p-4"><CheckCircle size={22} weight="fill" className="text-brand-deep" /> Got it. We&apos;ll reply on WhatsApp or call you soon.</p>;
  return (
    <form onSubmit={send} className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm"><span className="text-mute">Your name</span>
        <input className="field" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
      </label>
      <label className="grid gap-2 text-sm"><span className="text-mute">Mobile number</span>
        <input className="field" required inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} autoComplete="tel" />
      </label>
      <label className="grid gap-2 text-sm"><span className="text-mute">About</span>
        <select className="field" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
          {['Product question', 'Stock / availability', 'My order', 'Bulk or gym order', 'Something else'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm"><span className="text-mute">Message</span>
        <textarea className="field" rows={4} required maxLength={800} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </label>
      {f.topic === 'My order' && (
        <label className="grid gap-2 text-sm"><span className="text-mute">Order number</span>
          <input className="field uppercase" value={f.order_no} onChange={(e) => setF({ ...f, order_no: e.target.value })} placeholder="FS2610190001" />
        </label>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-ink py-4 text-base" disabled={busy}>{busy ? <CircleNotch className="animate-spin" size={20} /> : <PaperPlaneTilt size={20} />} Send to store</button>
        <button type="button" onClick={whatsapp} className="btn-line py-4 text-base"><WhatsappLogo size={20} /> WhatsApp instead</button>
      </div>
    </form>
  );
}
