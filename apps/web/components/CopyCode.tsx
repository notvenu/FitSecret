'use client';
import { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';

export default function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Copy code ${code}`} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black"
      onClick={() => navigator.clipboard?.writeText(code).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); })}>
      {done ? <><Check size={13} weight="bold" /> Copied</> : <><Copy size={13} /> Copy</>}
    </button>
  );
}
