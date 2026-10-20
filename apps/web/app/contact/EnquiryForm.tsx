'use client';
import { useState } from 'react';
import { WhatsappLogo } from '@phosphor-icons/react';

// ponytail: enquiries go straight to the store's WhatsApp; add a Supabase "enquiries" table if they want them logged in the POS.
export default function EnquiryForm({ phone }: { phone: string }) {
  const [f, setF] = useState({ name: '', topic: 'Product question', message: '' });
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = `Hi Fit Secrets, I'm ${f.name}.\n${f.topic}: ${f.message}`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <form onSubmit={send} className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm"><span className="text-mute">Your name</span>
        <input className="field" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
      </label>
      <label className="grid gap-2 text-sm"><span className="text-mute">About</span>
        <select className="field" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
          {['Product question', 'Stock / availability', 'My order', 'Bulk or gym order', 'Something else'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm"><span className="text-mute">Message</span>
        <textarea className="field" rows={4} required maxLength={800} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </label>
      <button className="btn-ink py-4 text-base"><WhatsappLogo size={20} /> Send on WhatsApp</button>
    </form>
  );
}
