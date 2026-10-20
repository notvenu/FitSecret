'use client';
import { Plus } from '@phosphor-icons/react';
import { useCart, type CartLine } from './cart';

export default function QuickAdd({ line }: { line: Omit<CartLine, 'qty'> }) {
  const { add } = useCart();
  return (
    <button onClick={() => add(line)} aria-label={`Add ${line.name} to cart`}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-colors duration-200 hover:bg-brand hover:text-ink active:scale-90">
      <Plus size={18} weight="bold" />
    </button>
  );
}
