'use client';
import { useEffect } from 'react';
import { motion } from 'motion/react';

// Re-mounts on every navigation: a short fade so pages don't snap in. Skipped on the first load so server HTML shows immediately.
// Opacity only: a leftover transform would trap position:fixed children.
let first = true;
export default function Template({ children }: { children: React.ReactNode }) {
  const skip = first;
  useEffect(() => { first = false; }, []);
  return <motion.div initial={skip ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: 'easeOut' }}>{children}</motion.div>;
}
