import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import Verify from './Verify';
import { getT } from '@/lib/lang';
import { PHONE } from '@/lib/site';

export const metadata: Metadata = { title: 'Verify your pack', description: 'Enter the batch code on your Fit Secrets pack to see its lab papers and dates.' };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const [{ code }, t] = await Promise.all([searchParams, getT()]);
  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <div className="grid gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <ShieldCheck size={48} strokeWidth={1.25} className="text-river" />
          <h1 className="display-l mt-4">{t('verify.title')}</h1>
          <p className="story mt-4 text-ink-soft">{t('verify.sub')}</p>
          <ol className="mt-10 grid gap-4">
            {['Find the batch code. It is printed near the manufacturing and expiry dates, usually on the base or back of the pack.', 'Type it in exactly as printed. Letters and numbers only.', 'See the batch’s lab papers, or ask us on WhatsApp if anything looks off.'].map((s, i) => (
              <li key={i} className="flex gap-4"><span className="num grid size-8 shrink-0 place-items-center rounded-full bg-sage font-bold text-river">{i + 1}</span><p>{s}</p></li>
            ))}
          </ol>
        </div>
        <div className="md:col-span-6 md:col-start-7"><Verify initial={code || ''} phone={PHONE} /></div>
      </div>
    </div>
  );
}
