'use client';
import { useEffect, useRef } from 'react';

export const inr0 = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const waLink = (phone: string, text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

// Lucide dropped brand icons; this is WhatsApp's glyph at Lucide's 24px grid.
export function WhatsApp({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

// Magnetic pull (effect #3): drifts up to 8px toward the cursor within 80px, springs back. Off on touch and reduced motion.
export function Magnetic({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const near = Math.max(0, Math.abs(dx) - r.width / 2) < 80 && Math.max(0, Math.abs(dy) - r.height / 2) < 80;
        el.style.transition = near ? 'transform 120ms linear' : 'transform 500ms cubic-bezier(.34,1.56,.64,1)';
        el.style.transform = near ? `translate(${Math.max(-8, Math.min(8, dx * 0.15))}px, ${Math.max(-8, Math.min(8, dy * 0.15))}px)` : '';
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return <span ref={ref} className={`inline-flex ${className}`}>{children}</span>;
}

// Seed-to-pot (effect #7): a seed arcs from the button into the pot icon, which then bumps and grows a leaf.
export function pourToCart(from: HTMLElement | null) {
  const to = document.querySelector<HTMLElement>('[data-cart-icon]:not([hidden])');
  if (!from || !to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!b.width) return;
  const seed = Object.assign(document.createElement('span'), { ariaHidden: 'true' });
  Object.assign(seed.style, { position: 'fixed', left: `${a.left + a.width / 2 - 6}px`, top: `${a.top + a.height / 2 - 9}px`, width: '12px', height: '18px',
    borderRadius: '50%', background: '#8A5A2B', border: '2px solid #17237A', zIndex: '100', pointerEvents: 'none' });
  document.body.appendChild(seed);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  seed.animate([
    { transform: 'translate(0,0) rotate(0)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 140}px) rotate(200deg)`, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(.5)` },
  ], { duration: 600, easing: 'cubic-bezier(.5,0,.5,1)' }).onfinish = () => {
    seed.remove();
    to.classList.remove('bump'); void to.offsetWidth; to.classList.add('bump');
  };
}

// The cart is a clay pot: one leaf per item up to five, then it flowers.
export function Pot({ count, size = 24 }: { count: number; size?: number }) {
  const leaves: [number, number, number][] = [[12, 9, -40], [12, 9, 40], [12, 6, -70], [12, 6, 70], [12, 4, 0]];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 13h14l-1.6 8H6.6Z" fill="#E5483B" fillOpacity=".25" />
      <path d="M4 13h16" />
      {count > 0 && <path d="M12 13V5" stroke="#2E9E5B" />}
      {leaves.slice(0, Math.min(count, 5)).map(([x, y, r], i) => (
        <ellipse key={i} cx={x + (r < 0 ? -2.5 : r > 0 ? 2.5 : 0)} cy={y} rx="2.6" ry="1.3" transform={`rotate(${r} ${x} ${y})`} fill="#2E9E5B" stroke="none" />
      ))}
      {count > 5 && <circle cx="12" cy="3.5" r="2.2" fill="#FFB81F" stroke="none" />}
    </svg>
  );
}
