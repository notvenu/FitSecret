import type { Metadata } from 'next';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { WhatsApp } from '@/components/ui';
import { getT } from '@/lib/lang';
import { STORE, PHONE, MAP, HOURS } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Visit the store',
  description: 'Fit Secrets, Datta Towers, MG Road, Labbipet, Vijayawada, opposite All India Radio. Supplement and organic store near Swaraj Maidan and the Ambedkar statue.',
};

export default async function Visit() {
  const t = await getT();
  type Row = [React.ComponentType<{ size?: number; className?: string }>, string, string, string, string];
  const rows: Row[] = [
    [MapPin, 'Address', STORE.address, MAP, t('visit.directions')],
    ...(HOURS ? [[Clock, 'Hours', HOURS, '', ''] as Row] : []),
    [Phone, 'Phone', `+91 ${PHONE}`, `tel:+91${PHONE}`, t('visit.call')],
    [WhatsApp, 'WhatsApp', 'Orders, stock checks and questions', `https://wa.me/91${PHONE}`, t('cta.whatsapp')],
    [Mail, 'Email', STORE.email, `mailto:${STORE.email}`, 'Email us'],
  ];
  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <h1 className="display-l">{t('visit.title')}</h1>
      <p className="story mt-4 text-ink-soft">On MG Road in Labbipet, opposite All India Radio and beside Subhamasthu Shopping Mall. Come in to see the range, ask about a product, or pick up an order.</p>
      <ul className="mt-12 grid gap-4 md:grid-cols-2">
        {rows.map(([Icon, h, v, href, cta]) => (
          <li key={h} className="flex gap-4 rounded-[20px] bg-paper p-6">
            <Icon size={24} className="mt-0.5 shrink-0 text-river" />
            <div className="min-w-0">
              <p className="font-semibold">{h}</p>
              <p className="mt-1 break-words text-ink-soft">{v}</p>
              {href && <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-3 inline-block font-semibold text-river underline underline-offset-4">{cta}</a>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex gap-3">
        <a href={STORE.instagram} target="_blank" rel="noreferrer" className="btn btn-ghost">Instagram</a>
        <a href={STORE.facebook} target="_blank" rel="noreferrer" className="btn btn-ghost">Facebook</a>
      </div>
    </div>
  );
}
