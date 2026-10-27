// Shown while a page loads: a shelf being stocked, pack by pack.
export default function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4" role="status" aria-live="polite">
      <div className="w-64">
        <div aria-hidden className="flex h-20 items-end justify-center gap-2.5 px-3">
          {[46, 64, 54, 72, 50].map((h, i) => <span key={i} className="stock-pack" style={{ height: h, animationDelay: `${i * 120}ms` }} />)}
        </div>
        <div aria-hidden className="h-2 rounded-sm bg-ink" />
        <p className="mt-4 text-center text-sm font-medium text-mute">Stocking the shelves…</p>
      </div>
    </div>
  );
}
