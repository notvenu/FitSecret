import type { Metadata } from 'next';
import { MapPin, Phone, WhatsappLogo, EnvelopeSimple, InstagramLogo, FacebookLogo } from '@phosphor-icons/react/dist/ssr';
import { STORE } from '@fitsecret/shared/seed';
import { Pulse } from '@/components/Hero';
import EnquiryForm from './EnquiryForm';

export const metadata: Metadata = { title: 'Contact us', description: `Visit Fit Secrets on MG Road, Vijayawada, call ${STORE.phone} or message us on WhatsApp.` };

const MAP = `https://www.google.com/maps?q=${encodeURIComponent('Datta Towers, MG Road, Vijayawada')}`;

export default function Contact() {
  const rows = [
    [MapPin, 'Visit', STORE.address, MAP, 'Get directions'],
    [Phone, 'Call', STORE.phone, `tel:+91${STORE.phone}`, 'Call now'],
    [WhatsappLogo, 'WhatsApp', `+91 ${STORE.phone}`, `https://wa.me/91${STORE.phone}`, 'Open chat'],
    [EnvelopeSimple, 'Email', STORE.email, `mailto:${STORE.email}`, 'Send email'],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20">
      <h1 className="display text-[clamp(3rem,8vw,7rem)]">
        Contact <span className="relative inline-block">us<Pulse className="absolute -bottom-[0.1em] left-0 h-[0.14em] w-full" /></span>
      </h1>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-mute">Questions about a product, stock or your order? Reach us any way you like.</p>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {rows.map(([Icon, label, value, href, cta]) => (
              <li key={label} className="flex items-start gap-5 py-6">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface"><Icon size={22} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-mute">{label}</div>
                  <div className="mt-0.5 font-semibold leading-snug">{value}</div>
                </div>
                <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="shrink-0 self-center text-sm font-semibold underline decoration-brand decoration-2 underline-offset-4">{cta}</a>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-3">
            <a href={STORE.instagram} target="_blank" rel="noreferrer" className="btn-line px-5"><InstagramLogo size={18} /> Instagram</a>
            <a href={STORE.facebook} target="_blank" rel="noreferrer" className="btn-line px-5"><FacebookLogo size={18} /> Facebook</a>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] bg-surface p-6 md:p-8">
          <h2 className="display text-3xl">Send an enquiry</h2>
          <p className="mt-2 text-sm text-mute">We usually reply within a few hours, on WhatsApp or by phone.</p>
          <EnquiryForm phone={STORE.phone} />
        </div>
      </div>

      <iframe title="Fit Secrets on Google Maps" src={`${MAP}&output=embed`} loading="lazy"
        className="mt-16 aspect-[16/7] w-full rounded-[var(--radius-card)] border-0 grayscale max-md:aspect-[4/3]" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  );
}
