'use client';
import { useEffect, useRef } from 'react';
import { MotionConfig, motion, animate, useInView, useScroll, useSpring, type Variants } from 'motion/react';

// Shared scroll motion. Server components wrap content in these; reduced-motion users get opacity only (MotionConfig "user").
const EASE = [0.23, 1, 0.32, 1] as const;
const up: Variants = {
  hidden: { opacity: 0, transform: 'translateY(28px)' },
  show: { opacity: 1, transform: 'translateY(0px)', transition: { duration: 0.7, ease: EASE } },
};

// Reveal's delay has to live in the variant: a variant's transition overrides the component's transition prop.
const upDelayed: Variants = {
  hidden: up.hidden,
  show: (delay: number) => ({ ...(up.show as object), transition: { duration: 0.7, ease: EASE, delay } }),
};

export function MotionRoot({ children }: { children: React.ReactNode }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 });
  return (
    <MotionConfig reducedMotion="user">
      <motion.div aria-hidden style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-brand" />
      {children}
    </MotionConfig>
  );
}

export function Reveal({ children, className, delay = 0, as = 'div' }: { children: React.ReactNode; className?: string; delay?: number; as?: 'div' | 'li' }) {
  const M = as === 'li' ? motion.li : motion.div;
  return (
    <M className={className} variants={upDelayed} custom={delay} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -12% 0px' }}>
      {children}
    </M>
  );
}

// Children animate in one after another (wrap each in <Item>).
export function Stagger({ children, className, each = 0.06, as = 'div' }: { children: React.ReactNode; className?: string; each?: number; as?: 'div' | 'ul' }) {
  const M = as === 'ul' ? motion.ul : motion.div;
  return (
    <M className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -10% 0px' }} variants={{ show: { transition: { staggerChildren: each } } }}>
      {children}
    </M>
  );
}

export function Item({ children, className, as = 'div', lift }: { children: React.ReactNode; className?: string; as?: 'div' | 'li'; lift?: boolean }) {
  const M = as === 'li' ? motion.li : motion.div;
  return (
    <M className={className} variants={up} whileHover={lift ? { transform: 'translateY(-6px)', transition: { type: 'spring', duration: 0.4, bounce: 0.25 } } : undefined}>
      {children}
    </M>
  );
}

// Counts up from 0 once on screen. Non-numeric values render as-is.
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const m = value.match(/^(\d+)(.*)$/);
  useEffect(() => {
    if (!seen || !m || !ref.current) return;
    const el = ref.current, to = Number(m[1]), rest = m[2];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => { el.textContent = Math.round(v) + rest; } });
    return () => c.stop();
  }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="tabular-nums">{value}</span>;
}
