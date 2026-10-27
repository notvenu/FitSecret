'use client';
import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

// Horizontal shelf row with prev/next for mouse users (touch and trackpads just swipe).
export default function RackScroller({ children, label, className = '' }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ l: true, r: false });
  const sync = () => {
    const el = ref.current; if (!el) return;
    setEdge({ l: el.scrollLeft < 8, r: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
  };
  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);
  const go = (dir: number) => {
    const el = ref.current; if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const btn = 'absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-[0_10px_30px_-10px_rgba(30,42,45,0.5)] transition-[opacity,transform] duration-200 hover:scale-105 active:scale-95 md:grid';
  return (
    <div className="relative">
      <ul ref={ref} onScroll={sync} aria-label={label} className={`no-scrollbar snap-x snap-mandatory overflow-x-auto ${className}`}>
        {children}
      </ul>
      <button type="button" onClick={() => go(-1)} aria-label="Scroll shelf left" className={`${btn} -left-5 ${edge.l ? 'pointer-events-none opacity-0' : ''}`}><CaretLeft size={20} weight="bold" /></button>
      <button type="button" onClick={() => go(1)} aria-label="Scroll shelf right" className={`${btn} -right-5 ${edge.r ? 'pointer-events-none opacity-0' : ''}`}><CaretRight size={20} weight="bold" /></button>
    </div>
  );
}
