'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { INGREDIENTS as ITEMS, BOTANICAL_COLORS as COLORS, Sprig } from './Botanical';

// Ingredient Wheel (DESIGN v3 effect #10). Desktop: pinned (CSS sticky); each scroll step turns the mandala 30° and the
// centre swaps to the active ingredient. Mobile and reduced motion: a swipeable card row.
// Lines are descriptive only, never benefit claims (§9). Owner to review before launch.
// ponytail: one generic leaf glyph per node; the illustrator's 12 botanicals replace <Sprig/>.



export default function IngredientWheel({ title }: { title: string }) {
  const [on, setOn] = useState(0);
  const marks = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setOn(Number((e.target as HTMLElement).dataset.i))), { rootMargin: '-50% 0px -50% 0px' });
    marks.current.forEach((m) => m && io.observe(m));
    return () => io.disconnect();
  }, []);
  const [name, line] = ITEMS[on];

  return (
    <section className="paisley relative bg-indigo text-paper" aria-labelledby="wheel-h">
      {/* Mobile / reduced motion: carousel */}
      <div className="py-20 md:hidden motion-reduce:md:block">
        <h2 id="wheel-h" className="display-l px-4 md:px-8">{title}</h2>
        <ul className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:px-8">
          {ITEMS.map(([n, l], i) => (
            <li key={n} className="w-[72vw] max-w-xs shrink-0 snap-start rounded-[24px] border-2 border-paper/20 bg-deep/40 p-6">
              <Sprig color={COLORS[i % COLORS.length]} size={56} />
              <h3 className="h3 mt-4">{n}</h3>
              <p className="mt-2 text-mist">{l}</p>
              <Link href={`/shop?q=${encodeURIComponent(n)}`} className="mt-4 inline-flex items-center gap-1 font-semibold text-lime">Shop {n} <ArrowRight size={16} /></Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Desktop: pinned wheel */}
      <div className="relative hidden md:block motion-reduce:md:hidden" style={{ height: `${ITEMS.length * 40 + 60}vh` }}>
        <div className="sticky top-0 grid h-dvh grid-cols-12 items-center gap-8 overflow-hidden px-8">
          <div className="col-span-4 col-start-2">
            <h2 className="display-l" aria-hidden>{title}</h2>
            <p className="num mt-8 text-sm text-lime">{String(on + 1).padStart(2, '0')} / {ITEMS.length}</p>
            <div key={on} className="rise">
              <h3 className="h2 mt-2">{name}</h3>
              <p className="story mt-3 text-mist">{line}</p>
              <Link href={`/shop?q=${encodeURIComponent(name)}`} className="btn btn-dark mt-6">Shop products with {name} <ArrowRight size={18} /></Link>
            </div>
          </div>
          <div className="relative col-span-6 col-start-7 aspect-square max-h-[80dvh] [container-type:size]" aria-hidden>
            {/* mandala rings */}
            <svg viewBox="-100 -100 200 200" className="absolute inset-0 size-full">
              <g fill="none" stroke="#C9F26B" strokeOpacity=".25" strokeWidth=".6">
                <circle r="92" /><circle r="62" strokeDasharray="2 3" /><circle r="34" />
                {ITEMS.map((_, i) => <path key={i} d="M0 -34 Q 8 -48 0 -62 Q -8 -48 0 -34" transform={`rotate(${i * 30 + 15})`} />)}
              </g>
            </svg>
            <div className="absolute inset-0 transition-transform duration-[900ms] ease-[var(--ease-grow)]" style={{ transform: `rotate(${-on * 30}deg)` }}>
              {ITEMS.map(([n], i) => (
                <div key={n} className="absolute top-1/2 left-1/2 size-0" style={{ transform: `rotate(${i * 30}deg) translateY(-46cqmin)` }}>
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-[900ms] ease-[var(--ease-grow)]" style={{ transform: `rotate(${-(i - on) * 30}deg) scale(${i === on ? 1.35 : 1})` }}>
                    <span className={`grid size-[clamp(48px,7vw,84px)] place-items-center rounded-full border-2 transition-colors ${i === on ? 'border-lime bg-paper' : 'border-paper/30 bg-deep/40'}`}>
                      <Sprig color={COLORS[i % COLORS.length]} size={36} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute inset-[30%] grid place-items-center rounded-full bg-paper text-center text-indigo">
              <div key={on} className="tree-pop px-2"><Sprig color={COLORS[on % COLORS.length]} size={64} /><p className="display mt-1 text-lg">{name}</p></div>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0">
          {ITEMS.map(([n], i) => <div key={n} ref={(el) => { marks.current[i] = el; }} data-i={i} style={{ height: '40vh' }} />)}
        </div>
      </div>
    </section>
  );
}
