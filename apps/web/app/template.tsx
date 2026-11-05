// Route change: content fades and rises 12px (320ms), effect #17. Reduced motion turns it into a plain fade (globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-[rise_320ms_var(--ease-out-expo)]">{children}</div>;
}
