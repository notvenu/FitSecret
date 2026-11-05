import type { Key } from './i18n';

// Shop-by-goal (PRD §8). The POS catalogue has categories but few goal tags, so a product's goals come from
// its POS goal tags, its category, and words in its name. Tag goals in the POS to override.
export type Goal = { slug: string; label: Key; promise: Key; cats: string[]; words: RegExp; pos: string[] };

export const GOALS: Goal[] = [
  { slug: 'build', label: 'goal.build', promise: 'promise.build', pos: ['muscle-gain'],
    cats: ['whey-protein', 'mass-gainers', 'creatine', 'amino-acids', 'testosterone', 'peanut-butter', 'protein-bars-snacks'],
    words: /\b(whey|protein|creatine|gainer|bcaa|eaa|glutamine|isolate|shilajit)\b/i },
  { slug: 'lose', label: 'goal.lose', promise: 'promise.lose', pos: ['weight-loss'],
    cats: ['fat-burners', 'oats-breakfast', 'millets-grains', 'millets-flours', 'diet-diabetic-rice'],
    words: /\b(fat|burner|l-?carnitine|green tea|oats|millet|diet|slim|cla|garcinia)\b/i },
  { slug: 'energy', label: 'goal.energy', promise: 'promise.energy', pos: ['endurance'],
    cats: ['pre-workout', 'nuts', 'dried-fruits', 'laddus-snacks'],
    words: /\b(pre-?workout|energy|electrolyte|caffeine|dates|almond|cashew|ashwagandha)\b/i },
  { slug: 'immunity', label: 'goal.immunity', promise: 'promise.immunity', pos: ['wellness'],
    cats: ['vitamins-wellness', 'ayurvedic-wellness', 'natural-honey-ghee'],
    words: /\b(vitamin|multivitamin|zinc|giloy|tulsi|amla|moringa|honey|ghee|chyawan|omega|fish oil)\b/i },
  { slug: 'digestion', label: 'goal.digestion', promise: 'promise.digestion', pos: [],
    cats: ['seeds', 'cold-pressed-oils', 'organic-essentials'],
    words: /\b(churn(a|am)|triphala|jeera|ajwain|fibre|fiber|isabgol|psyllium|probiotic|digest|chia|flax)\b/i },
  { slug: 'hair', label: 'goal.hair', promise: 'promise.hair', pos: [],
    cats: ['beauty-and-cosmetics'],
    words: /\b(hair|skin|aloe|scrub|shampoo|biotin|collagen|face|soap|serum|aurae)\b/i },
];

export function goalsOf(p: { name: string; categorySlug: string; subSlug: string; goals: string[] }) {
  return GOALS.filter((g) => g.pos.some((x) => p.goals.includes(x)) || g.cats.includes(p.subSlug) || g.cats.includes(p.categorySlug) || g.words.test(p.name))
    .map((g) => g.slug);
}
export const goalBySlug = (s?: string) => GOALS.find((g) => g.slug === s);
