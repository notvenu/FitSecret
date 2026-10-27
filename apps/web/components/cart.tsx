'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { unitPrice, type Buyer, type StoreSettings } from '@fitsecret/shared/store';
import { comboDiscount, type Combo, type ComboResult } from '@fitsecret/shared/offers';
import { supabase } from '@/lib/supabase';

// price = list price; bulkPrice applies per unit from bulkMin units (set per item in the POS)
export type CartLine = { id: string; key: string; name: string; variant: string; price: number; mrp: number; brand: string; stock: number; qty: number;
  bulkPrice?: number | null; bulkMin?: number | null };
// combo: the saving from live combos in this cart (place_order applies the same, so the preview matches the order).
type Cart = {
  lines: CartLine[]; count: number; subtotal: number; ready: boolean; open: boolean; store: StoreSettings; buyer: Buyer | null; combos: Combo[]; combo: ComboResult;
  priceOf: (l: Pick<CartLine, 'id' | 'price' | 'bulkPrice' | 'bulkMin'>, qty: number) => number;
  add: (l: Omit<CartLine, 'qty'>, qty?: number, open?: boolean) => void; setQty: (id: string, qty: number) => void; clear: () => void; setOpen: (o: boolean) => void;
};

const Ctx = createContext<Cart | null>(null);
const KEY = 'fs_cart_v1';
export const MAX_QTY = 100; // per item, same as place_order

// store: shipping / COD / min order from the POS (Online Store → Store settings), loaded by the root layout
export function CartProvider({ children, store, combos = [] }: { children: React.ReactNode; store: StoreSettings; combos?: Combo[] }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [buyer, setBuyer] = useState<Buyer | null>(null);

  useEffect(() => {
    try { setLines(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(lines)); }, [lines, ready]);

  // Regular buyers: their own rates follow their sign-in (My orders → email link). place_order applies the same rates.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const load = () => sb.rpc('my_rates').then(({ data }) => setBuyer(data || null)); // error on databases before 0006 → no rates
    // supabase-js: no awaiting other calls inside the auth callback, so defer
    const { data } = sb.auth.onAuthStateChange(() => { setTimeout(load, 0); });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Cart>(() => {
    const priceOf: Cart['priceOf'] = (l, qty) => unitPrice({ id: l.id, sale_price: l.price, wholesale_price: l.bulkPrice, wholesale_min_qty: l.bulkMin }, qty, buyer);
    return {
      lines, ready, open, setOpen, store, buyer, priceOf, combos,
      combo: comboDiscount(lines.map((l) => ({ item_id: l.id, qty: l.qty, price: priceOf(l, l.qty) })), combos),
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: lines.reduce((s, l) => s + l.qty * priceOf(l, l.qty), 0),
      add: (l, qty = 1, open = true) => {
        setLines((ls) => {
          const ex = ls.find((x) => x.id === l.id);
          const max = Math.min(MAX_QTY, l.stock);
          return ex ? ls.map((x) => (x.id === l.id ? { ...x, ...l, qty: Math.min(max, x.qty + qty) } : x)) : [...ls, { ...l, qty: Math.min(max, qty) }];
        });
        if (open) setOpen(true);
      },
      setQty: (id, qty) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.id !== id) : ls.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, MAX_QTY, l.stock) } : l)))),
      clear: () => setLines([]),
    };
  }, [lines, ready, open, store, buyer, combos]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart outside CartProvider');
  return c;
};
