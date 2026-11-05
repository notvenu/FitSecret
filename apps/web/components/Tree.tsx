import Link from 'next/link';

// Hero Tree of Life (DESIGN v3 §5). The tree is decoration (aria-hidden); the flowers (goals), fruits (bestsellers)
// and bird (verify) are real links laid over it, so focus, labels and tap targets work without the drawing.
// Growth is pure CSS (globals.css .tree-*): seed drops → trunk draws → branches → leaves stamp → flowers bloom → sway.
// ponytail: code-drawn placeholder art in the v3 line-plus-offset style. An illustrator's layered SVG drops in here;
// the hotspot coordinates below are all that has to be re-measured. Skipped: scroll wind, bee, petal drift.

const W = 600, H = 640;
type P = [number, number];
// Branches as quadratic curves: start on the trunk, control point, tip. Each tip carries one goal flower.
const BRANCHES: [P, P, P][] = [
  [[300, 470], [200, 450], [105, 385]],
  [[302, 410], [410, 390], [505, 318]],
  [[298, 340], [190, 300], [140, 200]],
  [[302, 305], [420, 265], [470, 165]],
  [[300, 262], [292, 180], [300, 82]],
  [[298, 190], [250, 168], [205, 112]],
];
const q = ([a, c, b]: [P, P, P], t: number): P => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];
const angle = (br: [P, P, P], t: number) => { const [x1, y1] = q(br, t), [x2, y2] = q(br, t + 0.01); return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI; };
const LEAF = 'M0 0 C 7 -11, 20 -11, 27 0 C 20 11, 7 11, 0 0Z';
const leaves = BRANCHES.flatMap((br, b) => [0.3, 0.45, 0.6, 0.75, 0.88].map((t, i) => {
  const [x, y] = q(br, t);
  return { x, y, r: angle(br, t) + (i % 2 ? 55 : -55), d: 800 + (b * 5 + i) * 25, c: (b + i) % 3 === 0 ? '#C9F26B' : '#2E9E5B' };
}));
const pct = ([x, y]: P) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

export type TreeGoal = { slug: string; label: string };
export type TreeFruit = { key: string; name: string };

export default function Tree({ goals, fruits, verifyLabel }: { goals: TreeGoal[]; fruits: TreeFruit[]; verifyLabel: string }) {
  const tips = BRANCHES.map((br) => br[2]);
  const fruitAt: P[] = [0, 1, 3].map((b) => { const [x, y] = q(BRANCHES[b], 0.62); return [x, y + 26]; });
  const bird: P = q(BRANCHES[1], 0.7);
  return (
    <div className="relative mx-auto aspect-[600/640] w-full max-w-[620px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <g className="tree-sway">
          {/* trunk and branches: offset fill layer, then the indigo line */}
          <path pathLength={1} className="tree-draw" style={{ animationDelay: '300ms' }} d="M300 590 C 296 520, 312 470, 300 410 S 292 320, 300 262" fill="none" stroke="#8A5A2B" strokeOpacity=".35" strokeWidth="22" strokeLinecap="round" transform="translate(3 3)" />
          <path pathLength={1} className="tree-draw" style={{ animationDelay: '300ms' }} d="M300 590 C 296 520, 312 470, 300 410 S 292 320, 300 262" fill="none" stroke="#17237A" strokeWidth="4" strokeLinecap="round" />
          {BRANCHES.map(([a, c, b], i) => (
            <path key={i} pathLength={1} className="tree-draw" style={{ animationDelay: `${800 + i * 60}ms` }}
              d={`M${a[0]} ${a[1]} Q ${c[0]} ${c[1]} ${b[0]} ${b[1]}`} fill="none" stroke="#17237A" strokeWidth="3" strokeLinecap="round" />
          ))}
          {leaves.map((l, i) => (
            <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r})`}>
              <g className="tree-pop" style={{ animationDelay: `${l.d}ms` }}>
                <path d={LEAF} fill={l.c} transform="translate(3 3)" />
                <path d={LEAF} fill="none" stroke="#17237A" strokeWidth="2" strokeLinejoin="round" />
                <path d="M3 0 H22" stroke="#17237A" strokeWidth="1.2" strokeLinecap="round" />
              </g>
            </g>
          ))}
        </g>
        {/* clay pot and the seed that starts it */}
        <ellipse className="tree-seed" cx="300" cy="582" rx="7" ry="10" fill="#8A5A2B" stroke="#17237A" strokeWidth="2" />
        <path d="M232 586 H368 L352 636 H248Z" fill="#E5483B" transform="translate(4 4)" />
        <path d="M222 576 H378 V592 H222Z M232 592 H368 L352 636 H248Z" fill="#FFF" stroke="#17237A" strokeWidth="3" strokeLinejoin="round" />
        <path d="M262 612 q 10 -8 20 0 t 20 0 t 20 0" fill="none" stroke="#E5483B" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {/* Goal flowers: labelled on desktop; on phones the flower row under the hero carries the labels */}
      {goals.slice(0, tips.length).map((g, i) => (
        <Link key={g.slug} href={`/shop?goal=${g.slug}`} aria-label={g.label} style={{ ...pct(tips[i]), animationDelay: `${1500 + i * 120}ms` }}
          className="tree-pop group absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 rounded-full">
          <Flower color={`var(--color-goal-${g.slug})`} />
          <span aria-hidden className="sticker hidden rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-indigo transition-transform duration-[200ms] group-hover:-translate-y-0.5 md:inline-block md:text-sm">{g.label}</span>
        </Link>
      ))}

      {/* Bestseller fruits */}
      {fruits.slice(0, 3).map((f, i) => (
        <Link key={f.key} href={`/p/${f.key}`} aria-label={f.name} title={f.name} style={{ ...pct(fruitAt[i]), animationDelay: `${1800 + i * 100}ms` }}
          className="tree-pop absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full">
          <svg viewBox="0 0 30 34" className="size-8 transition-transform duration-[350ms] ease-[var(--ease-stamp)] hover:rotate-12" aria-hidden>
            <path d="M15 2 V8" stroke="#17237A" strokeWidth="2" strokeLinecap="round" />
            <circle cx="17" cy="21" r="11" fill="#FFB81F" /><circle cx="15" cy="19" r="11" fill="none" stroke="#17237A" strokeWidth="2" />
          </svg>
        </Link>
      ))}

      {/* The bird takes you to batch verification */}
      <Link href="/verify" aria-label={verifyLabel} title={verifyLabel} style={{ ...pct([bird[0], bird[1] - 22]), animationDelay: '2100ms' }}
        className="tree-pop absolute z-10 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full">
        <svg viewBox="0 0 44 34" className="size-11 transition-transform duration-[350ms] ease-[var(--ease-stamp)] hover:-translate-y-1 hover:-rotate-6" aria-hidden>
          <path d="M6 20 C 6 10, 18 6, 26 10 L 34 6 L 32 14 C 34 24, 22 30, 12 28 Z" fill="#E5483B" transform="translate(2 2)" />
          <path d="M6 20 C 6 10, 18 6, 26 10 L 34 6 L 32 14 C 34 24, 22 30, 12 28 Z" fill="none" stroke="#17237A" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 18 q 6 4 12 -2" fill="none" stroke="#17237A" strokeWidth="2" strokeLinecap="round" />
          <circle cx="27" cy="12.5" r="1.6" fill="#17237A" /><path d="M14 28 l -2 5 M20 28 l 0 5" stroke="#17237A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}

// Six-petal flower in the goal colour, print-offset fill under an indigo outline. Bloom (effect #14) on hover/focus.
export function Flower({ color, size = 52 }: { color: string; size?: number }) {
  const petals = [0, 60, 120, 180, 240, 300];
  return (
    <svg viewBox="-26 -26 52 52" width={size} height={size} className="transition-transform duration-[400ms] ease-[var(--ease-stamp)] group-hover:scale-115 group-hover:rotate-[30deg] group-focus-visible:scale-115" aria-hidden>
      <g transform="translate(2.5 2.5)">{petals.map((r) => <ellipse key={r} cx="0" cy="-13" rx="7" ry="11" fill={color} transform={`rotate(${r})`} />)}</g>
      <g fill="none" stroke="#17237A" strokeWidth="2">{petals.map((r) => <ellipse key={r} cx="0" cy="-13" rx="7" ry="11" transform={`rotate(${r})`} />)}</g>
      <circle r="6" fill="#FFB81F" stroke="#17237A" strokeWidth="2" />
    </svg>
  );
}
