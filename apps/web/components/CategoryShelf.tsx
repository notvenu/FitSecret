'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

// Bestsellers with category tabs. Cards are server-rendered and passed in, so this stays a thin client shell.
export default function CategoryShelf({ tabs, items }: { tabs: [string, string][]; items: { key: string; cat: string; card: React.ReactNode }[] }) {
  const [cat, setCat] = useState(tabs[0]?.[0] || '');
  const shown = items.filter((i) => i.cat === cat).slice(0, 8);
  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="display text-[clamp(2.6rem,6vw,5rem)]">Popular right now</h2>
        <Link href={`/shop?category=${cat}`} className="text-sm font-semibold underline decoration-brand decoration-2 underline-offset-4">See all</Link>
      </div>
      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={cat === k} onClick={() => setCat(k)}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${cat === k ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink'}`}>{l}</button>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {shown.map((i) => (
            <motion.div key={i.key} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {i.card}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
