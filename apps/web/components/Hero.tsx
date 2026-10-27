'use client';
import Link from 'next/link';
import { useRef } from 'react';
import { ArrowDown, MapPin } from '@phosphor-icons/react';
import { motion, useScroll, useTransform } from 'motion/react';

// The shop front (you came in through its doors, see ShopEntry): lit signboard, striped awning and a wide display window
// with real packs from the shelves. Scrolling walks you closer. Below it, the store directory and the brands we stock.
type Aisle = { slug: string; name: string; count: number; href: string };
export type WindowPack = { src: string; name: string; href: string };
const EDGE = 'linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)';

export default function Hero({ logos, total, aisles, packs }: { logos: { name: string; src: string }[]; total: number; aisles: Aisle[]; packs: WindowPack[] }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const front = useTransform(scrollYProgress, [0, 0.6], ['scale(1)', 'scale(1.06)']);
  const tiers = [packs.slice(0, 5), packs.slice(5, 11)];

  return (
    <section ref={ref} className="relative isolate overflow-hidden bg-white">
      <motion.div style={{ transform: front }} className="mx-auto max-w-7xl origin-[50%_30%] px-4 pt-8 md:px-6 md:pt-12">
        {/* signboard */}
        <div className="hero-in signboard mx-auto flex max-w-4xl flex-col items-center px-6 py-5 text-center md:py-6">
          <h1 className="display sign-lit text-[clamp(2.4rem,7vw,5.5rem)] leading-none">Fit Secrets<span className="text-brand">.</span></h1>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/70 md:text-xs">Supplements · Dry fruits · Organic · Ayurveda</p>
        </div>
        <div aria-hidden className="awning hero-in mx-auto max-w-5xl" style={{ animationDelay: '120ms' }} />

        {/* display window */}
        <div className="shop-window hero-in relative mx-auto flex min-h-[420px] max-w-5xl flex-col md:min-h-[480px]" style={{ animationDelay: '220ms' }}>
          <div className="relative z-30 flex flex-wrap items-end justify-between gap-5 p-5 md:p-8">
            <div>
              <p className="window-decal display text-[clamp(2rem,5vw,4rem)] leading-[0.95]">Reveal your<br />true strength<span className="text-brand">.</span></p>
              <p className="mt-3 max-w-sm text-sm font-medium text-ink-soft md:text-base">{total}+ genuine products, sealed and billed. Walk the aisles, buy online or pick up at the counter.</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <a href="#aisles" className="btn-ink px-7 py-3.5">Walk the aisles <ArrowDown size={16} weight="bold" /></a>
              <a href="#visit" className="btn border border-ink/25 bg-white/80 px-6 py-3.5 text-ink hover:border-ink"><MapPin size={16} /> Visit the store</a>
            </div>
          </div>
          <div className="mt-auto">
            {tiers.map((row, t) => row.length > 0 && (
              <div key={t} className="window-riser flex items-end justify-center gap-[3%] px-4" style={{ ['--h' as string]: t ? 'clamp(88px,12vw,140px)' : 'clamp(70px,9vw,110px)' }}>
                {row.map((p, i) => (
                  <Link key={p.href + i} href={p.href} title={p.name} className="window-pack" style={{ animationDelay: `${450 + (t * 5 + i) * 70}ms` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.name} className="h-full w-auto object-contain" />
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <span aria-hidden className="window-glare" />
        </div>
        <div aria-hidden className="shop-step mx-auto max-w-5xl"><span className="doormat">Welcome</span></div>

        {/* store directory board, inside the door */}
        <nav aria-label="Store aisles" className="hero-in mx-auto mt-14 max-w-5xl md:mt-16" style={{ animationDelay: '600ms' }}>
          <div className="flex items-end justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mute">Store directory</p>
            <p className="text-xs text-mute">MG Road, Vijayawada · In store &amp; online</p>
          </div>
          <ol className="directory mt-3 grid grid-cols-2 gap-px md:grid-cols-4">
            {aisles.slice(0, 8).map((a, i) => (
              <li key={a.slug}>
                <a href={a.href} className="group flex h-full items-center gap-3 bg-ink px-4 py-4 text-white transition-colors duration-200 hover:bg-brand hover:text-ink md:px-5">
                  <span className="font-mono text-xs font-semibold text-brand transition-colors group-hover:text-ink">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold leading-tight md:text-[15px]">{a.name}</span>
                  <span className="text-xs tabular-nums text-white/50 transition-colors group-hover:text-ink/60">{a.count}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </motion.div>

      {logos.length > 0 && (
        <div aria-hidden className="mt-14 border-y border-line py-6 md:mt-16">
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">On our shelves</p>
          <div className="overflow-hidden" style={{ maskImage: EDGE, WebkitMaskImage: EDGE }}>
            <div className="marquee flex w-max items-center" style={{ ['--dur' as string]: `${logos.length * 2.2}s` }}>
              {[0, 1].map((copy) => (
                <div key={copy} className="flex shrink-0 items-center gap-3 pr-3">
                  {logos.map((l) => (
                    <span key={l.name} className="grid h-14 w-32 shrink-0 place-items-center px-4 md:h-16 md:w-36">
                      {/* multiply blends away the white box baked into some JPG logos */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.src} alt="" className="max-h-[60%] w-auto max-w-full object-contain mix-blend-multiply" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// The heartbeat stroke from the logo.
export function Pulse({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 20" preserveAspectRatio="none" overflow="visible" className={`pulse-line ${className}`} aria-hidden>
      <path d="M0 12 H82 L92 2 L102 19 L110 8 L116 12 H200" fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pathLength={1} />
    </svg>
  );
}
