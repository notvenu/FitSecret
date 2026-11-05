// "Plant Your Need" guided finder (GUIDED-FINDER spec A6): transparent, rule-based, no black box.
// attributesOf() works out what the catalogue can tell us about a product; recommend() applies hard filters, scores
// what is left and picks one anchor, two supporters and up to two optional items.
//
// Safety first. Nothing is known about a product unless its category, name or description says so, and unknown
// always errs to caution: every ingestible supplement counts as needs_consult until the owner clears it in INFO
// (product-info.js). Allergens can only be excluded when the name or description mentions them, so the result always
// tells people who picked an allergen to read the label.
import { INFO } from './product-info.js';

export const FOOD_CATS = ['millets-flours', 'millets-grains', 'diet-diabetic-rice', 'peanut-butter', 'nuts', 'oats-breakfast', 'cold-pressed-oils',
  'laddus-snacks', 'natural-honey-ghee', 'seeds', 'tea-coffee', 'dried-fruits', 'organic-essentials', 'protein-bars-snacks'];
// Sports boosters: never suggested to under-18s (min_age 18).
export const BOOSTER_CATS = ['whey-protein', 'mass-gainers', 'creatine', 'amino-acids', 'pre-workout', 'fat-burners', 'testosterone'];
const ADVANCED_CATS = ['testosterone', 'pre-workout', 'fat-burners'];
const INTERMEDIATE_CATS = ['creatine', 'amino-acids', 'mass-gainers'];
// What a newcomer should start with for each goal (food first for weight and digestion).
const ANCHOR_CATS = {
  build: ['whey-protein', 'mass-gainers'], lose: ['oats-breakfast', 'millets-grains', 'millets-flours', 'diet-diabetic-rice'],
  energy: ['nuts', 'dried-fruits', 'ayurvedic-wellness'], immunity: ['vitamins-wellness', 'natural-honey-ghee', 'ayurvedic-wellness'],
  digestion: ['seeds', 'organic-essentials', 'ayurvedic-wellness'], hair: ['beauty-and-cosmetics'],
};

const RX = {
  milk: /\b(whey|milk|casein|ghee|paneer|lactose|cheese|curd|dairy)\b/i,
  nuts: /\b(almonds?|cashews?|peanuts?|walnuts?|pista(chios?)?|hazelnuts?|nuts?|badam|kaju)\b/i,
  gluten: /\b(wheat|atta|barley|oats?|gluten|maida|rava|semolina)\b/i,
  soy: /\bsoy(a|abean)?\b/i,
  nonveg: /\b(fish|omega[- ]?3|egg|collagen|chicken|cod liver|gelatin|krill)\b/i,
  vegan: /\b(vegan|plant[- ]based|plant protein|pea protein)\b/i,
  honey: /\bhoney\b/i,
  // the shelf can be wrong (a fat burner filed under vitamins): the name decides
  booster: /\b(fat ?burn(er)?|thermogenic|pre-?workout|testo(sterone)?|test booster)\b/i,
  capsule: /\b(capsules?|caps|tablets?|tabs|softgels?)\b/i,
  drink: /\b(juice|drink|shots?|rtd|sharbat)\b/i,
  powder: /\b(powder|whey|protein|creatine|gainer|churn(a|am)|bcaa|eaa|pre-?workout|mix)\b/i,
};

export function attributesOf(p) {
  const text = `${p.name} ${p.description || ''}`;
  const cat = p.subSlug || p.categorySlug || '';
  const food = FOOD_CATS.includes(cat) || FOOD_CATS.includes(p.categorySlug);
  const beauty = cat === 'beauty-and-cosmetics' || p.categorySlug === 'beauty-and-cosmetics';
  const kind = food ? 'food' : beauty ? 'beauty' : /ayurved/.test(p.categorySlug + cat) ? 'ayurveda' : 'supplement';
  // "dairy-free", "free from gluten and soy", "no added milk" are not mentions of the allergen
  const said = text.replace(/\b(dairy|milk|lactose|gluten|nuts?|soy|soya)[- ]free\b|\bfree (from|of) [a-z ,&]+|\bno (added )?(dairy|milk|lactose|gluten|nuts?|soy)\b|\bnon[- ]dairy\b/gi, ' ');
  const allergens = ['milk', 'nuts', 'gluten', 'soy'].filter((a) => RX[a].test(said));
  const diet = RX.nonveg.test(text) ? 'nonveg' : RX.vegan.test(text) || (food && !allergens.includes('milk') && !RX.honey.test(text)) ? 'vegan' : 'veg';
  const form = beauty ? 'topical' : food ? 'food' : RX.capsule.test(text) ? 'capsule' : RX.drink.test(text) ? 'drink' : RX.powder.test(text) ? 'powder' : 'other';
  const booster = BOOSTER_CATS.includes(cat) || RX.booster.test(p.name);
  const base = {
    kind, form, diet, allergens,
    // explicit label words, so a "Vegetarian" chip is never only our guess
    vegLabel: diet === 'vegan' || /\b(veg|vegetarian)\b/i.test(text),
    needs_consult: kind === 'supplement' || kind === 'ayurveda',
    booster, min_age: booster ? 18 : 0,
    experience: ADVANCED_CATS.includes(cat) || RX.booster.test(p.name) ? 'advanced' : INTERMEDIATE_CATS.includes(cat) || /shilajit/i.test(text) ? 'intermediate' : 'starter',
    anchorFor: RX.booster.test(p.name) ? [] : Object.keys(ANCHOR_CATS).filter((g) => ANCHOR_CATS[g].includes(cat)),
  };
  base.beginner_friendly = base.experience === 'starter';
  return { ...base, ...INFO[p.key]?.finder }; // owner overrides win (e.g. needs_consult: false after review)
}

const BUDGET = { u500: 500, u1000: 1000, u2000: 2000 };
const LEVEL = { new: 'starter', some: 'intermediate', regular: 'advanced' };
const RANK = { starter: 0, intermediate: 1, advanced: 2 };

// a = { goals: [slug, slug?], experience: 'new'|'some'|'regular'|null, diet: 'veg'|'vegan'|'egg'|null,
//       allergens: [], form: 'powder'|'capsule'|'drink'|'food'|null, budget: 'u500'|'u1000'|'u2000'|null,
//       consult: bool (any safety answer), minor: bool (under 18) }
// products: [{ key, name, description, categorySlug, subSlug, goals: [slug], price, stock, featured }]
export function recommend(products, a) {
  const max = BUDGET[a.budget] || Infinity;
  const pool = [];
  for (const p of products) {
    const at = p.at || attributesOf(p); // the website precomputes these on the server
    // hard filters
    if (!(p.stock > 0) || !(p.price > 0)) continue; // unpriced items aren't for sale
    if (a.allergens?.some((x) => at.allergens.includes(x))) continue;
    if (a.diet === 'veg' && at.diet === 'nonveg') continue;
    if (a.diet === 'vegan' && at.diet !== 'vegan') continue;
    if ((a.consult || a.minor) && at.needs_consult) continue;
    if (a.minor && at.min_age >= 18) continue;
    if (a.experience === 'new' && at.experience === 'advanced') continue;
    // score
    // a booster only ever answers a training goal, whatever shelf it sits on
    const matched = a.goals.filter((g) => p.goals.includes(g) && (!at.booster || ['build', 'lose', 'energy'].includes(g)));
    if (!matched.length) continue;
    let s = matched.reduce((n, g) => n + (g === a.goals[0] ? 10 : 5), 0);
    if (a.experience === 'new' && at.beginner_friendly) s += 3;
    if (a.experience && RANK[at.experience] <= RANK[LEVEL[a.experience]]) s += 2;
    if (a.form && a.form === at.form) s += 2;
    if (max < Infinity) s += p.price <= max ? 2 : p.price <= max * 1.25 ? 0 : -2;
    if (p.featured) s += 1;
    const anchorable = matched.some((g) => at.anchorFor.includes(g));
    pool.push({ p, at, s, matched, anchorable, cat: p.subSlug || p.categorySlug });
  }
  pool.sort((x, y) => y.s - x.s || (y.p.stock || 0) - (x.p.stock || 0) || x.p.name.localeCompare(y.p.name));
  const anchor = pool.find((x) => x.anchorable && x.p.price <= max * 1.25) || pool.find((x) => x.p.price <= max * 1.25) || null;
  if (!anchor) return { anchor: null, supporters: [], optional: [] };
  const cats = new Set([anchor.cat]), supporters = [], optional = [];
  for (const x of pool) {
    if (x === anchor) continue;
    if (supporters.length < 2 && !cats.has(x.cat) && x.p.price <= max * 1.25) { supporters.push(x); cats.add(x.cat); }
    else if (optional.length < 2 && !cats.has(x.cat)) { optional.push(x); cats.add(x.cat); }
    if (supporters.length === 2 && optional.length === 2) break;
  }
  const chips = (x) => whyChips(x, a, max);
  return { anchor: { key: anchor.p.key, why: chips(anchor) }, supporters: supporters.map((x) => ({ key: x.p.key, why: chips(x) })), optional: optional.map((x) => ({ key: x.p.key, why: chips(x) })) };
}

// Only facts we can back: the person's own answers matched against what the product data says.
export function whyChips({ p, at, matched }, a, max = BUDGET[a.budget] || Infinity) {
  const out = matched.map((g) => ({ k: 'goal', g }));
  if (a.experience === 'new' && at.beginner_friendly) out.push({ k: 'beginner' });
  if (a.diet === 'vegan' && at.diet === 'vegan') out.push({ k: 'vegan' });
  else if (a.diet === 'veg' && at.vegLabel) out.push({ k: 'veg' });
  if (a.form && a.form === at.form) out.push({ k: 'form', form: at.form });
  if (max < Infinity && p.price <= max) out.push({ k: 'budget' });
  if ((a.consult || a.minor) && at.kind === 'food') out.push({ k: 'food' });
  return out;
}

// Free text → goals (English and Telugu keywords). Never used for health advice: it only picks goal cards.
const WORDS = {
  build: /muscle|strength|strong|gain|bulk|gym|protein|weight gain|కండ|బలం|బరువు పెర/i,
  lose: /lose|loss|fat|slim|weight loss|belly|diet|తగ్గ|కొవ్వు|బరువు తగ్/i,
  energy: /energy|tired|fatigue|stamina|active|శక్తి|అలసట|నీరసం/i,
  immunity: /immun|cold|cough|sick|resistance|రోగనిరోధ|జలుబు/i,
  digestion: /digest|gas|acidity|stomach|constipation|bloat|జీర్ణ|కడుపు|అజీర్/i,
  hair: /hair|skin|glow|dandruff|pimple|acne|జుట్టు|చర్మ|మెరుపు/i,
};
export const goalsFromText = (s) => Object.keys(WORDS).filter((g) => WORDS[g].test(s || '')).slice(0, 2);
