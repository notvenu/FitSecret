'use client';
import { Children, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'motion/react';

// Pinned aisle walk: the section sticks to the screen and scrolling swaps the current rack for the next one in place
// (past aisles leave left, the next comes in from the right, its packs drop onto the shelf via .rack-in in globals.css).
// Each aisle gets STEP of scroll distance; the anchors let the hero's directory jump straight to an aisle.
const STEP = 70; // svh of scrolling per aisle (svh: stable while mobile browser bars show/hide)
const EASE = [0.23, 1, 0.32, 1] as const;

export default function AisleWalk({ aisles, children }: { aisles: { slug: string; name: string }[]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const n = aisles.length;
  const [idx, setIdx] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', (p) => setIdx(Math.min(n - 1, Math.max(0, Math.floor(p * n)))));
  const racks = Children.toArray(children);

  const jump = (i: number) => document.getElementById(`aisle-${aisles[i].slug}`)?.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

  return (
    <div ref={ref} id="aisles" className="relative" style={{ height: `calc(${n * STEP}svh + 100svh)` }}>
      {aisles.map((a, i) => <span key={a.slug} id={`aisle-${a.slug}`} aria-hidden className="absolute left-0" style={{ top: `${(i + 0.3) * STEP}svh` }} />)}

      <div className="sticky top-0 flex h-svh flex-col overflow-hidden pt-[76px] lg:pt-[128px]">
        {/* where you are in the store */}
        <div className="mx-auto mb-3 flex w-full max-w-7xl items-center gap-4 px-4 md:mb-8 md:px-6">
          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-mute">
            <span className="text-ink">{String(idx + 1).padStart(2, '0')}</span> / {String(n).padStart(2, '0')}
          </span>
          <ol className="flex flex-1 gap-1.5">
            {aisles.map((a, i) => (
              <li key={a.slug} className="flex-1">
                <button type="button" onClick={() => jump(i)} aria-label={`Go to aisle ${i + 1}: ${a.name}`} aria-current={i === idx || undefined}
                  className="group block w-full py-2">
                  <span className="block h-1 overflow-hidden rounded-full bg-line">
                    <span className={`block h-full origin-left rounded-full transition-transform duration-500 ease-out-expo ${i <= idx ? 'scale-x-100' : 'scale-x-0'} ${i === idx ? 'bg-brand' : 'bg-ink'}`} />
                  </span>
                  <span className={`mt-2 hidden truncate text-left text-xs transition-colors lg:block ${i === idx ? 'font-semibold text-ink' : 'text-mute group-hover:text-ink'}`}>{a.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)]">
          {racks.map((rack, i) => (
            <motion.div key={aisles[i].slug} className="aisle min-w-0 [grid-area:1/1]" data-on={i === idx || undefined} inert={i !== idx}
              initial={false}
              animate={i === idx ? { opacity: 1, transform: 'translateX(0%)' } : { opacity: 0, transform: `translateX(${i < idx ? -6 : 6}%)` }}
              transition={{ duration: 0.55, ease: EASE }}>
              {rack}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
