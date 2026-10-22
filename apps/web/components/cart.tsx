'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StoreSettings } from '@fitsecret/shared/store';

export type CartLine = { id: string; key: string; name: string; variant: string; price: number; mrp: number; brand: string; stock: number; qty: number };
type Cart = {
  lines: CartLine[]; count: number; subtotal: number; ready: boolean; open: boolean; store: StoreSettings;
  add: (l: Omit<CartLine, 'qty'>, qty?: number, open?: boolean) => void; setQty: (id: string, qty: number) => void; clear: () => void; setOpen: (o: boolean) => void;
};

const Ctx = createContext<Cart | null>(null);
const KEY = 'fs_cart_v1';

// store: shipping / COD / min order from the POS (Online Store → Store settings), loaded by the root layout
export function CartProvider({ children, store }: { children: React.ReactNode; store: StoreSettings }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setLines(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(lines)); }, [lines, ready]);

  const value = useMemo<Cart>(() => ({
    lines, ready, open, setOpen, store,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.qty * l.price, 0),
    add: (l, qty = 1, open = true) => {
      setLines((ls) => {
        const ex = ls.find((x) => x.id === l.id);
        const max = Math.min(20, l.stock);
        return ex ? ls.map((x) => (x.id === l.id ? { ...x, ...l, qty: Math.min(max, x.qty + qty) } : x)) : [...ls, { ...l, qty: Math.min(max, qty) }];
      });
      if (open) setOpen(true);
    },
    setQty: (id, qty) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, 20, l.stock) } : l)))),
    clear: () => setLines([]),
  }), [lines, ready, open, store]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
};
