'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useT } from './Lang';
import { Flower } from './Tree';
import type { Key } from '@/lib/i18n';

type G = { slug: string; label: Key; promise: Key; count: number; items: { key: string; name: string; image: string | null }[] };

// Effect #9: the selected goal grows (flex-grow, springy) to show its promise and three products; others compress.
export default function GoalSelector({ goals }: { goals: G[] }) {
  const t = useT();
  const [on, setOn] = useState(goals[0]?.slug);
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" role="tablist" aria-label={t('goals.title')}>
      {goals.map((g) => {
        const sel = g.slug === on;
        return (
          <div key={g.slug} role="tab" aria-selected={sel} tabIndex={0}
            onClick={() => setOn(g.slug)} onMouseEnter={() => matchMedia('(hover:hover)').matches && setOn(g.slug)} onFocus={() => setOn(g.slug)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOn(g.slug))}
            className={`sticker group relative flex h-[340px] shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-[24px] p-5 transition-[flex-grow,width,background-color,color] duration-[500ms] ease-[cubic-bezier(.34,1.3,.64,1)] md:h-[380px] md:w-auto md:min-w-0 md:shrink md:basis-0
              ${sel ? 'w-[82vw] grow-[3.2] bg-indigo text-paper' : 'w-[38vw] grow bg-paper text-indigo hover:bg-sky md:w-auto'}`}>
            <span className="flex items-start justify-between"><Flower color={`var(--color-goal-${g.slug})`} size={sel ? 64 : 44} /><span className="num text-sm font-semibold opacity-70">{g.count}</span></span>
            <h3 className={`display mt-auto transition-[font-size] duration-[500ms] ${sel ? 'text-4xl md:text-5xl' : 'text-lg [overflow-wrap:anywhere] lg:text-xl'}`}>{t(g.label)}</h3>
            <div className={`grid transition-[grid-template-rows,opacity] duration-[500ms] ${sel ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <p className="story mt-3 max-w-sm text-mist">{t(g.promise)}</p>
                <div className="mt-4 flex items-center gap-2">
                  {g.items.map((i) => (
                    <Link key={i.key} href={`/p/${i.key}`} tabIndex={sel ? 0 : -1} onClick={(e) => e.stopPropagation()} className="relative size-14 overflow-hidden rounded-[14px] border-2 border-paper bg-paper md:size-16" title={i.name}>
                      {i.image && <Image src={i.image} alt={i.name} fill sizes="64px" className="object-contain p-1" />}
                    </Link>
                  ))}
                  <Link href={`/shop?goal=${g.slug}`} tabIndex={sel ? 0 : -1} onClick={(e) => e.stopPropagation()} className="ml-auto inline-flex items-center gap-1 rounded-full bg-lime px-4 py-2 text-sm font-bold text-indigo">
                    {t('goals.see')} <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
