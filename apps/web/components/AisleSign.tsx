// A sign hanging from the ceiling on two wires, the way aisles and counters are marked in a shop.
// label: the small line on top (Aisle 03, Offers, Counter…). tone "green" for the way-out / visit sign.
export default function AisleSign({ label, title, tone = 'ink', as: H = 'h2', className = '' }: { label: string; title: React.ReactNode; tone?: 'ink' | 'green'; as?: 'h1' | 'h2'; className?: string }) {
  return (
    <div className={`aisle-sign ${tone === 'green' ? 'aisle-sign-green' : ''} ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-[0.22em] opacity-70">{label}</span>
      <H className="display mt-1 text-[clamp(1.6rem,4vw,3rem)] leading-none">{title}</H>
    </div>
  );
}
