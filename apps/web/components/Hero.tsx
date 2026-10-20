import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react/dist/ssr';

// Centred tagline over a full-bleed wall of official brand logos (each in its own tile), scrolling in alternating directions.
// Top and bottom rows run edge to edge in reserved space; the middle rows are masked out behind the copy, so logos
// never pass under the text at any width (on phones the middle rows disappear entirely).
const ROWS = [
  { dur: 70, reverse: false, cut: false },
  { dur: 55, reverse: true, cut: true },
  { dur: 64, reverse: false, cut: true },
  { dur: 50, reverse: true, cut: true },
  { dur: 74, reverse: false, cut: false },
];
// clear zone tracks the headline width (its font is clamp(..., 7.5vw, 7.25rem), so half-width ~ 26vw, capped), feathered over 70px
const HALF = 'min(calc(26vw + 48px), 450px)';
const CUT = `linear-gradient(90deg,#000 0,#000 calc(50% - ${HALF} - 70px),transparent calc(50% - ${HALF}),transparent calc(50% + ${HALF}),#000 calc(50% + ${HALF} + 70px),#000 100%)`;
const EDGE = 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)';

function LogoRow({ logos, dur, reverse, cut }: { logos: { name: string; src: string }[]; dur: number; reverse: boolean; cut: boolean }) {
  return (
    <div className={`overflow-hidden ${cut ? 'hidden md:block' : ''}`} style={{ maskImage: cut ? CUT : EDGE, WebkitMaskImage: cut ? CUT : EDGE }}>
      <div className={`marquee flex w-max items-center ${reverse ? 'reverse' : ''}`} style={{ ['--dur' as string]: `${dur}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center gap-4 pr-4">
            {logos.map((l) => (
              <span key={l.name} className="grid h-[clamp(52px,5vw,74px)] w-[clamp(120px,11vw,180px)] shrink-0 place-items-center px-5">
                {/* multiply blends away the white box baked into some JPG logos */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt="" className="max-h-[62%] w-auto max-w-full object-contain mix-blend-multiply" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero({ logos, total }: { logos: { name: string; src: string }[]; total: number }) {
  // spread logos so neighbouring rows don't start with the same brands
  const rows = ROWS.map((_, r) => logos.filter((_, i) => i % ROWS.length === r));

  return (
    <section className="relative isolate overflow-hidden bg-surface">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 flex select-none flex-col justify-between py-6 md:py-8">
        {ROWS.map((row, r) => <LogoRow key={r} logos={rows[r].length >= 4 ? rows[r] : logos} {...row} />)}
      </div>

      <div className="mx-auto flex min-h-[calc(100dvh-145px)] max-w-4xl flex-col items-center justify-center px-4 py-[clamp(110px,14vh,150px)] text-center">
        <h1 className="display hero-in text-[clamp(2.6rem,7.5vw,7.25rem)] leading-[0.95]">
          <span className="whitespace-nowrap">Reveal your</span><br /><span className="whitespace-nowrap">true <span className="relative inline-block">strength<Pulse className="absolute -bottom-[0.12em] left-0 h-[0.16em] w-full" /></span><span className="text-brand">.</span></span>
        </h1>
        <p className="hero-in mx-auto mt-8 max-w-lg text-lg leading-relaxed text-mute" style={{ animationDelay: '120ms' }}>
          Supplements, dry fruits, millets and organic wellness from our MG Road store. {total}+ products, delivered or ready for pickup.
        </p>
        <div className="hero-in mt-9 flex flex-wrap items-center justify-center gap-4" style={{ animationDelay: '220ms' }}>
          <Link href="/shop?category=nutritional-supplements" className="btn-ink group px-8 py-4 text-base">
            Shop supplements <ArrowRight size={18} weight="bold" className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/shop" className="btn-line bg-white px-8 py-4 text-base">All products</Link>
        </div>
      </div>
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
