// Product search: every query word must match a word in name/brand/category, exactly as a prefix or by bigram
// similarity (typos like "aswagandha"). Common Telugu terms map to their English catalogue words.
// ponytail: in-memory scan over ~600 products. Move to Postgres pg_trgm when the catalogue passes a few thousand.

const TE: Record<string, string> = {
  'అశ్వగంధ': 'ashwagandha', 'తేనె': 'honey', 'నెయ్యి': 'ghee', 'ప్రోటీన్': 'protein', 'మిల్లెట్': 'millet', 'మిల్లెట్లు': 'millet',
  'ఆయుర్వేద': 'ayurvedic', 'నూనె': 'oil', 'గిలోయ్': 'giloy', 'తిప్పతీగ': 'giloy', 'ఉసిరి': 'amla', 'పసుపు': 'turmeric', 'బాదం': 'almond',
  'జీడిపప్పు': 'cashew', 'ఖర్జూరం': 'dates', 'చూర్ణం': 'churna', 'బియ్యం': 'rice', 'శిలాజిత్': 'shilajit', 'క్రియేటిన్': 'creatine',
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ');
const words = (s: string) => norm(s).split(/\s+/).filter(Boolean);
const grams = (w: string) => { const g = new Set<string>(); for (let i = 0; i < w.length - 1; i++) g.add(w.slice(i, i + 2)); return g; };
function similar(a: string, b: string) {
  if (a.length < 4 || b.length < 3) return false;
  const A = grams(a), B = grams(b.slice(0, a.length + 2));
  let n = 0; for (const g of A) if (B.has(g)) n++;
  return (2 * n) / (A.size + B.size) >= 0.6;
}

export function searchProducts<P extends { name: string; brand: string; category: string; sub: string; featured: boolean }>(products: P[], q: string) {
  const qs = words(q).map((w) => TE[w] || w);
  if (!qs.length || q.trim().length < 2) return [];
  const scored: [P, number][] = [];
  for (const p of products) {
    const ws = words(`${p.name} ${p.brand} ${p.category} ${p.sub}`);
    let score = 0;
    for (const w of qs) {
      const s = ws.some((x) => x === w) ? 3 : ws.some((x) => x.startsWith(w)) ? 2 : ws.some((x) => similar(w, x)) ? 1 : 0;
      if (!s) { score = 0; break; }
      score += s;
    }
    if (score) scored.push([p, score + (p.featured ? 0.5 : 0) + (words(p.name).some((x) => x.startsWith(qs[0])) ? 1 : 0)]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([p]) => p);
}
