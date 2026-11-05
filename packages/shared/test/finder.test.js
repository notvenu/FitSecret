// Finder acceptance rules (GUIDED-FINDER A13) against the real imported catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_ITEMS, SEED_CATEGORIES } from '../seed.js';
import { recommend, attributesOf, goalsFromText, BOOSTER_CATS } from '../finder.js';

const cats = Object.fromEntries(SEED_CATEGORIES.map((c) => [c.id, c]));
// Goals as the website derives them (lib/goals.ts), reduced to category lists for the test.
const GOAL_CATS = {
  build: ['whey-protein', 'mass-gainers', 'creatine', 'amino-acids', 'testosterone', 'peanut-butter', 'protein-bars-snacks'],
  lose: ['fat-burners', 'oats-breakfast', 'millets-grains', 'millets-flours', 'diet-diabetic-rice'],
  energy: ['pre-workout', 'nuts', 'dried-fruits', 'laddus-snacks'],
  immunity: ['vitamins-wellness', 'ayurvedic-wellness', 'natural-honey-ghee'],
  digestion: ['seeds', 'cold-pressed-oils', 'organic-essentials'],
  hair: ['beauty-and-cosmetics'],
};
const products = SEED_ITEMS.map((i) => {
  const c = cats[i.category_id], parent = c.parent_id ? cats[c.parent_id] : null;
  const categorySlug = parent?.slug || c.slug, subSlug = parent ? c.slug : '';
  return { key: i.slug, name: i.name, description: i.description, categorySlug, subSlug, price: i.sale_price, stock: 10, featured: i.featured,
    goals: Object.keys(GOAL_CATS).filter((g) => GOAL_CATS[g].includes(c.slug)) };
});
const byKey = Object.fromEntries(products.map((p) => [p.key, p]));
const picks = (r) => [r.anchor, ...r.supporters, ...r.optional].filter(Boolean).map((x) => byKey[x.key]);
const GOALS = Object.keys(GOAL_CATS);

test('a newcomer who wants to build gets one anchor, up to two supporters from other shelves, and reasons', () => {
  const r = recommend(products, { goals: ['build'], experience: 'new' });
  assert.ok(r.anchor);
  assert.ok(['whey-protein', 'mass-gainers'].includes(byKey[r.anchor.key].subSlug));
  assert.ok(r.supporters.length <= 2);
  const shelves = picks(r).map((p) => p.subSlug || p.categorySlug);
  assert.equal(new Set(shelves).size, shelves.length);
  assert.ok(r.anchor.why.some((c) => c.k === 'goal' && c.g === 'build'));
});

test('any safety answer never returns a product that needs a doctor first', () => {
  for (const g of GOALS) for (const flag of [{ consult: true }, { minor: true }]) {
    for (const p of picks(recommend(products, { goals: [g], ...flag }))) assert.equal(attributesOf(p).needs_consult, false, `${g}: ${p.name}`);
  }
});

test('under 18: no sports boosters', () => {
  for (const g of GOALS) for (const p of picks(recommend(products, { goals: [g], minor: true }))) assert.ok(!BOOSTER_CATS.includes(p.subSlug) && attributesOf(p).min_age === 0, p.name);
});

test('a fat burner on the vitamins shelf is still a booster, never an immunity anchor', () => {
  const at = attributesOf({ key: 'x', name: 'ALTHISTPRO Fat burner', categorySlug: 'nutritional-supplements', subSlug: 'vitamins-wellness' });
  assert.equal(at.min_age, 18);
  assert.equal(at.experience, 'advanced');
  assert.deepEqual(at.anchorFor, []);
  const r = recommend([{ key: 'x', name: 'ALTHISTPRO Fat burner', categorySlug: 'nutritional-supplements', subSlug: 'vitamins-wellness', goals: ['immunity'], price: 1800, stock: 5 }], { goals: ['immunity'] });
  assert.equal(r.anchor, null);
});

test('"dairy-free" and "free from…" are not allergen mentions', () => {
  const at = (description) => attributesOf({ key: 'x', name: 'Yeast protein', description, categorySlug: 'nutritional-supplements', subSlug: 'whey-protein' }).allergens;
  assert.deepEqual(at('It contains no added sugar, is dairy-free, and has probiotics.'), []);
  assert.deepEqual(at('Free from gluten and soy.'), []);
  assert.deepEqual(at('Made with whey and almonds.'), ['milk', 'nuts']);
});

test('unpriced items are never suggested', () => {
  for (const g of GOALS) for (const p of picks(recommend(products, { goals: [g] }))) assert.ok(p.price > 0, p.name);
});

test('a chosen allergen is never in the name or description of a pick', () => {
  for (const a of ['milk', 'nuts', 'gluten', 'soy']) for (const g of GOALS)
    for (const p of picks(recommend(products, { goals: [g], allergens: [a] }))) assert.ok(!attributesOf(p).allergens.includes(a), `${a}: ${p.name}`);
});

test('vegan picks are vegan; vegetarian picks have no fish, egg or collagen', () => {
  for (const g of GOALS) {
    for (const p of picks(recommend(products, { goals: [g], diet: 'vegan' }))) assert.equal(attributesOf(p).diet, 'vegan', p.name);
    for (const p of picks(recommend(products, { goals: [g], diet: 'veg' }))) assert.notEqual(attributesOf(p).diet, 'nonveg', p.name);
  }
});

test('the same answers always give the same result', () => {
  const a = { goals: ['immunity', 'energy'], experience: 'some', budget: 'u1000' };
  assert.deepEqual(recommend(products, a), recommend([...products].reverse(), a));
});

test('every why-chip is backed by an answer', () => {
  const a = { goals: ['build'], experience: 'new', form: 'powder', budget: 'u2000' };
  for (const x of [recommend(products, a).anchor]) for (const c of x.why) {
    if (c.k === 'goal') assert.ok(a.goals.includes(c.g));
    if (c.k === 'form') assert.equal(c.form, a.form);
    if (c.k === 'budget') assert.ok(byKey[x.key].price <= 2000);
  }
});

test('nothing safe and in stock → no anchor', () => {
  assert.equal(recommend(products.map((p) => ({ ...p, stock: 0 })), { goals: ['build'] }).anchor, null);
});

test('own words map to goals, in English and Telugu', () => {
  assert.deepEqual(goalsFromText('I want to gain muscle'), ['build']);
  assert.deepEqual(goalsFromText('జుట్టు రాలడం'), ['hair']);
  assert.deepEqual(goalsFromText('xyz'), []);
});
