'use client';
import { useEffect, useState } from 'react';
import { Plus, Check } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useCart, type CartLine } from './cart';

export default function QuickAdd({ line, small }: { line: Omit<CartLine, 'qty'>; small?: boolean }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  useEffect(() => { if (!added) return; const t = setTimeout(() => setAdded(false), 1200); return () => clearTimeout(t); }, [added]);
  return (
    <motion.button onClick={() => { add(line); setAdded(true); }} aria-label={`Add ${line.name} to cart`} whileTap={{ scale: 0.88 }}
      className={`relative grid shrink-0 ${small ? 'h-8 w-8 before:absolute before:-inset-1.5' : 'h-10 w-10'} place-items-center rounded-full transition-colors duration-200 ${added ? 'bg-brand text-ink' : 'bg-ink text-white hover:bg-brand hover:text-ink'}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={added ? 'y' : 'n'} className="grid place-items-center" initial={{ opacity: 0, transform: 'scale(0.6) rotate(-45deg)' }}
          animate={{ opacity: 1, transform: 'scale(1) rotate(0deg)' }} exit={{ opacity: 0, transform: 'scale(0.6)' }} transition={{ type: 'spring', duration: 0.35, bounce: 0.3 }}>
          {added ? <Check size={small ? 15 : 18} weight="bold" /> : <Plus size={small ? 15 : 18} weight="bold" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
