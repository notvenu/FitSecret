'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, FileText, Loader2, Phone, SearchX } from 'lucide-react';
import { useT } from '@/components/Lang';
import { WhatsApp } from '@/components/ui';

type Res =
  | { state: 'idle' | 'checking' | 'notFound' | 'limited' | 'error' | 'offline' }
  | { state: 'verified'; batch: string; product: string | null; key: string | null; size: string | null; papers: { kind: string; title: string; url: string; valid_until: string | null }[] };

// STATES §12: idle → checking → verified | notFound | limited | error. Never says "fake": says "no match" and offers help.
export default function Verify({ initial, phone }: { initial: string; phone: string }) {
  const t = useT();
  const [code, setCode] = useState(initial);
  const [r, setR] = useState<Res>({ state: 'idle' });

  const check = async (c = code) => {
    if (r.state === 'checking') return;
    setR({ state: 'checking' });
    try {
      const res = await fetch('/api/verify-batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) });
      setR(await res.json());
    } catch { setR({ state: 'error' }); }
  };
  useEffect(() => { if (initial) check(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(`Hi Fit Secrets, I want to check batch code ${code}.`)}`;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); check(); }} className="rounded-[28px] bg-paper p-5 shadow-rest md:p-8">
        <label htmlFor="code" className="font-semibold">Batch code</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input id="code" value={code} onChange={(e) => { setCode(e.target.value); if (r.state !== 'checking') setR({ state: 'idle' }); }} required minLength={3} maxLength={40}
            autoComplete="off" autoCapitalize="characters" placeholder={t('verify.placeholder')}
            className={`field num flex-1 text-lg uppercase placeholder:normal-case ${r.state === 'checking' ? 'skeleton' : ''}`} />
          <button className="btn btn-gold" disabled={r.state === 'checking'}>{r.state === 'checking' ? <Loader2 size={18} className="animate-spin" /> : t('cta.verify')}</button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {r.state === 'verified' && (
          <div className="rise rounded-[28px] bg-river p-6 text-chalk md:p-8">
            <div className="flex items-center gap-4">
              <span className="stamp grid size-16 shrink-0 place-items-center rounded-full bg-haldi text-deep"><BadgeCheck size={34} /></span>
              <div><p className="h3">Verified.</p><p className="text-chalk/80">This batch is on record with Fit Secrets.</p></div>
            </div>
            <dl className="mt-6 grid gap-3 border-t border-mist/20 pt-6 sm:grid-cols-2">
              <div><dt className="text-sm text-mist">Batch</dt><dd className="num text-lg font-semibold">{r.batch}</dd></div>
              {r.product && <div><dt className="text-sm text-mist">Product</dt><dd className="font-semibold">{r.key ? <Link href={`/p/${r.key}`} className="underline underline-offset-4">{r.product}</Link> : r.product}{r.size && ` · ${r.size}`}</dd></div>}
            </dl>
            <ul className="mt-6 grid gap-2">{r.papers.map((p) => (
              <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[12px] bg-deep/50 p-3 hover:bg-deep">
                <FileText size={20} className="text-haldi" /><span className="flex-1"><b className="block">{p.title}</b><span className="text-sm text-mist">{p.kind}{p.valid_until && ` · valid to ${p.valid_until}`}</span></span>
              </a></li>
            ))}</ul>
          </div>
        )}
        {r.state === 'notFound' && (
          <div className="rise rounded-[28px] bg-paper p-6 md:p-8">
            <SearchX size={32} strokeWidth={1.5} className="text-ink-soft" />
            <p className="h3 mt-3">No match for this code.</p>
            <p className="mt-2 text-ink-soft">Check the code on your pack and try again. Some older batches aren&apos;t online yet; we can confirm them for you.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href={wa} target="_blank" rel="noreferrer" className="btn btn-dark"><WhatsApp size={18} />Ask on WhatsApp</a>
              <a href={`tel:+91${phone}`} className="btn btn-ghost"><Phone size={18} />Call</a>
            </div>
          </div>
        )}
        {r.state === 'limited' && <p className="rounded-[20px] bg-haldi/15 p-5">Too many tries. Wait a minute and try again.</p>}
        {r.state === 'error' && <p className="rounded-[20px] bg-madder/10 p-5 text-madder">Couldn&apos;t check right now. <button type="button" onClick={() => check()} className="font-semibold underline">Try again</button></p>}
        {r.state === 'offline' && <p className="rounded-[20px] bg-sage p-5">Online verification opens with the online store. Send us the code on <a href={wa} className="font-semibold underline">WhatsApp</a> and we&apos;ll confirm it.</p>}
      </div>
    </div>
  );
}
