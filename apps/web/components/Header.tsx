'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bag, MagnifyingGlass, List, X, User } from '@phosphor-icons/react';
import { useCart } from './cart';
import CartDrawer from './CartDrawer';

type NavCat = { name: string; slug: string; subs: { name: string; slug: string }[] };
const SHORT: Record<string, string> = { 'nutritional-supplements': 'Supplements', 'dry-fruits-and-millets': 'Dry fruits & millets', 'organic-products': 'Organic',
  'ayurvedic-products': 'Ayurvedic', 'natural-honey-ghee': 'Honey & ghee', 'cold-pressed-oils': 'Oils', 'diet-diabetic-rice': 'Diet rice', 'beauty-and-cosmetics': 'Beauty' };

// Logo file: public/logo.png. Falls back to a wordmark until it's added.
export function Logo({ className = 'h-11' }: { className?: string }) {
  const [img, setImg] = useState(true);
  // onError can fire before hydration, so also check the already-failed case.
  const ref = (el: HTMLImageElement | null) => { if (el?.complete && !el.naturalWidth) setImg(false); };
  return (
    <Link href="/" aria-label="Fit Secrets home" className="flex shrink-0 items-center">
      {img ? <img ref={ref} src="/logo.png" alt="Fit Secrets" className={`${className} w-auto`} onError={() => setImg(false)} />
        : <span className="display text-[1.7rem] leading-none">Fit<span className="text-brand-deep">·</span>Secrets</span>}
    </Link>
  );
}

export default function Header({ cats = [] }: { cats?: NavCat[] }) {
  const { count, setOpen, ready } = useCart();
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => setMenu(false), [path]);
  const NAV: [string, string][] = [...cats.map((c) => [`/shop?category=${c.slug}`, SHORT[c.slug] || c.name] as [string, string]), ['/shop', 'All products']];
  const search = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    router.push(`/shop?q=${encodeURIComponent(String(new FormData(e.currentTarget).get('q') || ''))}`);
  };

  return (
    <>
      <div className="bg-ink px-4 py-2 text-center text-xs font-medium text-white">
        Free shipping on orders above ₹999 <span className="mx-2 text-brand">/</span> Visit us on MG Road, Vijayawada
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-6 px-4 md:px-6">
          <Logo />
          <form onSubmit={search} role="search" className="relative hidden max-w-md flex-1 md:block">
            <label htmlFor="q" className="sr-only">Search products</label>
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
            <input id="q" name="q" placeholder="Search protein, almonds, Kapiva…" className="w-full rounded-full bg-surface py-2.5 pl-11 pr-4 text-sm outline-none ring-ink/0 transition focus:bg-white focus:ring-2 focus:ring-ink" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/account" className="hidden h-11 w-11 place-items-center rounded-full hover:bg-surface sm:grid" aria-label="My orders"><User size={22} /></Link>
            <button onClick={() => setOpen(true)} className="relative grid h-11 w-11 place-items-center rounded-full hover:bg-surface" aria-label={`Cart, ${count} items`}>
              <Bag size={22} />
              {ready && count > 0 && (
                <motion.span key={count} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-ink">{count}</motion.span>
              )}
            </button>
            <button onClick={() => setMenu(true)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-surface lg:hidden" aria-label="Menu"><List size={24} /></button>
          </div>
        </div>
        <nav className="mx-auto hidden h-11 max-w-7xl items-center gap-7 px-6 text-sm font-medium lg:flex">
          {cats.map((c) => (
            <div key={c.slug} className="group relative flex h-full items-center">
              <Link href={`/shop?category=${c.slug}`} className="text-ink-soft transition-colors hover:text-ink">{SHORT[c.slug] || c.name}</Link>
              {c.subs.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 w-64 translate-y-1 rounded-[var(--radius-card)] border border-line bg-white p-2 opacity-0 shadow-[0_20px_50px_-20px_rgba(30,42,45,0.35)] transition-all duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {c.subs.map((x) => <Link key={x.slug} href={`/shop?category=${c.slug}&sub=${x.slug}`} className="block rounded-lg px-3 py-2 text-ink-soft hover:bg-surface hover:text-ink">{x.name}</Link>)}
                  <Link href={`/shop?category=${c.slug}`} className="mt-1 block rounded-lg border-t border-line px-3 pt-2.5 pb-2 font-semibold hover:bg-surface">All {(SHORT[c.slug] || c.name).toLowerCase()}</Link>
                </div>
              )}
            </div>
          ))}
          <Link href="/shop" className="text-ink-soft transition-colors hover:text-ink">All products</Link>
          <div className="ml-auto flex items-center gap-6">
            <Link href="/about" className="text-ink-soft hover:text-ink">About us</Link>
            <Link href="/contact" className="text-ink-soft hover:text-ink">Contact us</Link>
            <Link href="/track" className="text-ink-soft hover:text-ink">Track order</Link>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-50 overflow-y-auto bg-white p-5 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex items-center justify-between"><Logo /><button onClick={() => setMenu(false)} aria-label="Close menu" className="p-2"><X size={26} /></button></div>
            <form onSubmit={search} className="mt-6"><input name="q" aria-label="Search products" className="field" placeholder="Search products" /></form>
            <nav className="mt-6">
              {[...NAV, ['/about', 'About us'], ['/contact', 'Contact us'], ['/track', 'Track order'], ['/account', 'My orders']].map(([href, label], i) => (
                <motion.div key={href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }} className="border-b border-line">
                  <Link href={href} className="display block py-4 text-4xl">{label}</Link>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
      <CartDrawer />
    </>
  );
}
