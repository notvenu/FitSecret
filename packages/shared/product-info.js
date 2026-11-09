// Label facts for the product page and finder, keyed by product key (the website URL: /p/<key>).
// Every value is copied from a published label listing (source below) or the owner's own pack; nothing here is inferred.
// Values not stated on the source (per-100 g figures, servings in other pack sizes, the time of day) are left out on purpose.
// A product page section (How to use, Nutrition, Ingredients' amounts, Pairings) only shows when its data is filled in.
// ponytail: a file until the owner needs to edit it themselves; then it becomes an `items.details` json column with an
// Online Store → Products form, same shape.
//
// Shape (all optional):
// 'key': {
//   finder: { needs_consult: false, beginner_friendly: true, diet: 'vegan', allergens: ['milk'], experience: 'starter' },
//   serving: { size: '1 scoop (30 g)', mix: 'with 200 ml water or milk', per_pack: 33, per_day: 1, max_per_day: 2 },
//   directions: [{ slot: 'morning' | 'pre' | 'post' | 'evening' | 'night', text: 'exactly as on the label' }],
//   nutrition: { basis_g: 30, rows: [['Energy', '120 kcal', '400 kcal'], ['Protein', '24 g', '80 g']] }, // [name, per serving, per 100 g]
//   ingredients: [{ name: 'Whey protein concentrate', amount: '24 g', note: 'from milk', allergen: 'milk' }],
//   cautions: ['Not for children under 18'], storage: 'Store in a cool, dry place',
//   pairs: ['other-product-key'],
//   source: { name: 'Tata 1mg listing (Indian label)', url: 'https://…', checked: 'YYYY-MM-DD' },
// }

const CHECKED = '2026-11-09';
const src = (name, url) => ({ name, url, checked: CHECKED });
// Same product, different flavour or unnamed flavour: how-to-use, cautions and storage carry over; nutrition and ingredients don't.
// Allergens (finder) stay with the full label too: another flavour's emulsifier or sweetener may differ.
const usage = ({ serving, directions, cautions, storage, source }) => ({ serving, directions, cautions, storage, source });
const MILK_SOY = { allergens: ['milk', 'soy'] };

// ---------- Optimum Nutrition Gold Standard 100% Whey, Double Rich Chocolate (Indian label) ----------
const ON_GSW = {
  finder: MILK_SOY,
  serving: { size: '1 scoop (30.4 g)', mix: 'In 180–240 ml cold water, milk or another drink. Stir, shake or blend for about 30 seconds.', per_day: 1 },
  nutrition: { rows: [['Protein', '24 g'], ['Carbohydrate', '3 g'], ['Total sugars', '0.9 g'], ['Added sugars', '0 g'], ['Total fat', '0.9 g'],
    ['Saturated fat', '0.61 g'], ['Trans fat', '0 g'], ['Cholesterol', '45 mg'], ['Sodium', '50 mg'], ['Glutamine & glutamic acid', '4 g']] },
  ingredients: [
    { name: 'Protein blend (93%)', note: 'Whey protein isolate, whey protein concentrate, hydrolysed whey protein, emulsifier INS 322(i)', allergen: 'milk, soy' },
    { name: 'Cocoa powder', note: 'Processed with alkali' },
    { name: 'Artificial flavours', note: 'Chocolate, vanilla' },
    { name: 'Sweetener', note: 'Acesulfame potassium (INS 950)' },
  ],
  cautions: ['Processed in a plant where nut-containing products are made.', 'Not recommended for children, or pregnant or breastfeeding women.',
    'One serving a day. Not a substitute for a varied diet.'],
  storage: 'Keep the container tightly closed. Store in a cool, dry place, out of reach of children.',
  source: src('Tata 1mg listing, ON Gold Standard 100% Whey Double Rich Chocolate (Indian label)', 'https://1mg.com/otc/optimum-nutrition-on-gold-standard-100-whey-protein-for-muscle-recovery-no-added-sugar-flavour-powder-double-rich-chocolate-otc330832'),
};

// ---------- MuscleBlaze Biozyme Performance Whey, Rich Chocolate 1 kg ----------
const MB_BIOZYME = {
  finder: MILK_SOY,
  serving: { size: '1 scoop (36 g)', mix: 'In 200–250 ml chilled water. Shake hard for 15–30 seconds. Drink within 15 minutes so the enzymes don’t turn it bitter.', per_day: 1 },
  nutrition: { rows: [['Protein', '25 g'], ['EAAs', '11.75 g'], ['BCAAs', '5.51 g']] },
  ingredients: [
    { name: 'Protein blend (91%)', note: 'Whey protein concentrate & whey powder', allergen: 'milk' },
    { name: 'Cocoa powder' }, { name: 'MB EnzymePro®', amount: '189 mg' },
    { name: 'Salt, emulsifier (soy lecithin INS 322(i)), stabiliser (bromelain, INS 415)', allergen: 'soy' },
    { name: 'Flavouring, sweetener (sucralose INS 955), anticaking agent (INS 551)' },
  ],
  cautions: ['Made in a facility that also processes oats and barley.', 'Pregnant or breastfeeding women and anyone with a medical condition should ask a dietitian first.',
    'Don’t use if the seal is broken. One serving a day.', 'Contains no doping ingredients (WADA/NADA list).'],
  storage: 'Store in a cool, dry place. Keep the container tightly closed, out of reach of children.',
  source: src('Tata 1mg listing, MuscleBlaze Biozyme Performance Whey Rich Chocolate 1 kg', 'https://www.1mg.com/otc/muscleblaze-mb-biozyme-performance-whey-protein-powder-rich-chocolate-otc659801'),
};

// ---------- MuscleTech NitroTech Whey Protein, Milk Chocolate ----------
const NITROTECH = {
  finder: MILK_SOY,
  serving: { size: '1 scoop', mix: 'In 175–240 ml cold water or skim milk, in a shaker cup. Drink plenty of water through the day.', per_day: 1 },
  nutrition: { rows: [['Protein', '30 g']] },
  ingredients: [
    { name: 'Protein blend (86%)', note: 'Whey protein concentrate, whey protein isolate, whey peptides', allergen: 'milk' },
    { name: 'Creatine monohydrate' }, { name: 'Cocoa', note: 'Processed with alkali' },
    { name: 'Soy and sunflower lecithin', allergen: 'soy' }, { name: 'Gum blend', note: 'Cellulose gum, xanthan gum, carrageenan' },
    { name: 'Sweeteners', note: 'Sucralose (INS 955), acesulfame potassium (INS 950)' }, { name: 'Salt, natural and artificial flavours' },
  ],
  cautions: ['Processed in a facility that also handles tree nuts and fish.', 'For adults only. Not for children, or pregnant or nursing women.',
    'Ask a doctor first if you have a medical condition.', 'Contains creatine monohydrate.'],
  storage: 'Store in a cool, dry place (10–27 °C).',
  source: src('Tata 1mg listing, MuscleTech NitroTech Whey Protein Milk Chocolate', 'https://www.1mg.com/otc/muscletech-nitrotech-whey-protein-powder-milk-chocolate-otc1045162'),
};

// ---------- Optimum Nutrition Micronised Creatine Monohydrate, unflavoured ----------
const ON_CREATINE = {
  finder: { allergens: [] },
  serving: { size: '3 g (about 1 scoop)', mix: 'Stir into a protein shake or a glass of a flavoured drink with a spoon.', per_day: 1 },
  nutrition: { rows: [['Creatine monohydrate', '3 g']] },
  ingredients: [{ name: 'Creatine monohydrate', amount: '3 g', note: '100% pure, micronised' }],
  cautions: ['Not for pregnant or breastfeeding women.', 'Ask a doctor first if you have a medical condition.', 'One serving a day. Sold by weight, so some settling is normal.'],
  storage: 'Store in a cool, dry place. Keep the container tightly closed.',
  source: src('Tata 1mg listing, ON Micronised Creatine Monohydrate Unflavoured 250 g', 'https://www.1mg.com/otc/optimum-nutrition-on-micronised-creatine-monohydrate-for-performance-support-powder-unflavoured-otc678773'),
};

// ---------- MuscleBlaze Creatine Monohydrate, unflavoured ----------
const MB_CREATINE = {
  finder: { allergens: [] },
  serving: { size: '1 level scoop (3 g)', mix: 'In 250–300 ml chilled water, shaken for 30–40 seconds. Can also go into a protein shake or juice, but not milk. Drink 3–5 litres of water a day while taking creatine.' },
  nutrition: { rows: [['Creatine monohydrate', '3 g']] },
  ingredients: [{ name: 'Creatine monohydrate', amount: '3 g', note: 'With MB CreAbsorb™' }],
  cautions: ['Ask a doctor first if you are pregnant or breastfeeding, take prescription medicines, or have strong allergies.', 'Don’t use if the seal is broken. Don’t exceed the recommended dose.'],
  storage: 'Keep the container tightly closed, out of reach of children.',
  source: src('Tata 1mg listing, MuscleBlaze Creatine Monohydrate Unflavoured', 'https://www.1mg.com/otc/muscleblaze-mb-creatine-monohydrate-for-muscle-strength-lean-body-mass-energy-unflavoured-otc610232'),
};

// ---------- Optimum Nutrition Serious Mass, Chocolate ----------
const SERIOUS_MASS = {
  finder: MILK_SOY,
  serving: { size: '2 scoops (334 g)', mix: 'In 710 ml cold water, milk or another drink. Blend for 30–45 seconds. New to it? Take 1 scoop a day for the first week, then 2.', per_day: 1 },
  nutrition: { rows: [['Energy', '1243 kcal'], ['Protein', '50 g']] },
  ingredients: [
    { name: 'Maltodextrin (75%)' },
    { name: 'Protein blend (18%)', note: 'Whey protein concentrate, calcium caseinate, whey powder, emulsifier INS 322(i)', allergen: 'milk, soy' },
    { name: 'Cocoa powder', note: 'Processed with alkali' }, { name: 'Creatine monohydrate' }, { name: 'L-glutamine' },
    { name: 'Vitamin and mineral blend' }, { name: 'Choline, inositol, MCT powder' }, { name: 'Sweetener', note: 'Acesulfame potassium (INS 950)' },
  ],
  cautions: ['Processed in a plant where nut-containing products are made.', 'Not for children, pregnant or breastfeeding women, adolescents or the elderly unless medically advised.',
    'Sold by weight: the scoop may have settled to the bottom.'],
  storage: 'Keep the container tightly closed. Store in a cool, dry place, out of reach of children.',
  source: src('Tata 1mg listing, ON Serious Mass Chocolate', 'https://www.1mg.com/otc/optimum-nutrition-on-serious-mass-high-protein-for-weight-gain-muscle-building-flavour-powder-chocolate-otc706571'),
};

// ---------- Isopure Low Carb Whey Protein Isolate, Dutch Chocolate ----------
const ISOPURE_LC = {
  finder: MILK_SOY,
  serving: { size: '1 scoop (32 g)', mix: 'In 180–240 ml water, in a shaker or blender, or stirred in with a spoon.', per_day: 1 },
  nutrition: { rows: [['Protein', '25 g'], ['Vitamin A', '271 µg'], ['Vitamin C', '61 mg'], ['Vitamin D', '5 µg'], ['Vitamin E', '9 mg'], ['Vitamin B6', '1 mg'],
    ['Folic acid', '58 µg'], ['Biotin', '17 µg'], ['Zinc', '7 mg'], ['Selenium', '29 µg']] },
  ingredients: [
    { name: 'Whey protein isolate (89%)', allergen: 'milk' }, { name: 'Emulsifier INS 322(i)', allergen: 'soy' },
    { name: 'Cocoa powder', note: 'Alkalised' }, { name: 'Sunflower oil, salt' }, { name: 'Vitamins & minerals' },
    { name: 'Thickener (INS 415), artificial flavour (vanilla)' }, { name: 'Sweetener', note: 'Sucralose (INS 955)' },
  ],
  cautions: ['Processed in a plant where nut-containing products are made.', 'Not recommended for children, or pregnant or breastfeeding women.'],
  storage: 'Store in a cool, dry place, out of reach of children.',
  source: src('Tata 1mg listing, Isopure Low Carb Whey Protein Isolate Dutch Chocolate', 'https://www.1mg.com/otc/isopure-low-carb-100-whey-protein-isolate-for-fitness-no-added-sugar-flavour-dutch-chocolate-lactose-free-gluten-free-otc973787'),
};

// ---------- Kapiva Tulsi Giloy Juice 1 L ----------
const KAPIVA_TULSI_GILOY = {
  serving: { size: '30 ml', mix: 'Shake the bottle, then mix 30 ml juice with 30 ml water. Best taken regularly for at least 3 months.', per_day: 2, max_per_day: 2 },
  directions: [{ slot: 'morning', text: 'Before breakfast, on an empty stomach' }, { slot: 'night', text: 'One hour after dinner' }],
  ingredients: [{ name: 'Giloy (Tinospora cordifolia)', amount: '3 g' }, { name: 'Tulsi (Ocimum sanctum)', amount: '0.75 g' }, { name: 'Permitted class II preservatives' }],
  cautions: ['Pregnant or breastfeeding? Ask a healthcare professional first.', 'Settling is natural; colour and taste can vary between batches with the season.'],
  storage: 'Store in a cool, dry place. Refrigerate after opening and finish within 1.5 months.',
  source: src('Tata 1mg listing, Kapiva Wild Tulsi Giloy Juice 1 L', 'https://www.1mg.com/otc/kapiva-wild-tulsi-giloy-juice-otc367568'),
};

// ---------- Optimum Nutrition, batch 2 (Tata 1mg listings, Indian labels) ----------
const PLANT_NMS = 'Processed in a plant where nut, soy and milk products are made.';
const ON_GS_PRE = {
  directions: [{ slot: 'pre', text: '30 minutes before activity' }],
  cautions: ['Contains caffeine (200 mg a serving). Not for children, pregnant or breastfeeding women, or anyone sensitive to caffeine.', 'Do not combine with alcohol.',
    'One serving a day. Drink at least 3 litres of water a day.', PLANT_NMS],
  storage: 'Store in a cool, dry place, out of reach of children.',
  source: src('Tata 1mg listing, ON Gold Standard Pre-Workout Fruit Punch sachets', 'https://www.1mg.com/otc/optimum-nutrition-on-gold-standard-pre-workout-sachet-9.5gm-each-fruit-punch-otc893328'),
};
const ON_ZMA = {
  serving: { size: '2 capsules (1.46 g)', mix: 'Two capsules a day, or as your healthcare professional advises.', per_day: 1 },
  nutrition: { rows: [['Magnesium', '370 mg'], ['Zinc', '13.2 mg'], ['Vitamin B6', '1.9 mg']] },
  ingredients: [{ name: 'Magnesium', amount: '370 mg', note: 'From magnesium oxide and magnesium aspartate' }, { name: 'Zinc', amount: '13.2 mg', note: 'As zinc sulphate' },
    { name: 'Vitamin B6', amount: '1.9 mg', note: 'As pyridoxine hydrochloride' }, { name: 'Capsule shell and fillers', note: 'INS 464, 460(i), 1201, 470(iii), 407, 508; colours INS 110, 102, 133' }],
  cautions: ['Not recommended for children.', 'Taking any medicine, or have a medical condition? Ask your doctor first.', PLANT_NMS],
  storage: 'Store in a cool, dry place away from sunlight. Keep the bottle closed and leave the silica gel sachet in.',
  source: src('Tata 1mg listing, ON Zinc Magnesium Aspartate 60 capsules', 'https://www.1mg.com/otc/optimum-nutrition-on-zinc-magnesium-aspartate-capsule-otc1046796'),
};
const ON_GLUTAMINE = {
  serving: { size: '5 g (about 1 scoop)', mix: 'In 235 ml water or your favourite drink.', per_day: 1 },
  nutrition: { rows: [['L-Glutamine', '5 g']] },
  ingredients: [{ name: 'L-Glutamine (100%)', amount: '5 g' }],
  cautions: ['Not for pregnant or breastfeeding women.', 'Ask a doctor first if you have a medical condition.', 'Processed in a plant where nut-containing products are made.'],
  storage: 'Keep the container tightly closed. Store in a cool, dry place.',
  source: src('Tata 1mg listing, ON Glutamine Powder Unflavoured 250 g', 'https://www.1mg.com/otc/optimum-nutrition-on-glutamine-powder-unflavoured-otc673876'),
};
const ON_BCAA_GA = {
  serving: { size: '2 scoops (8.3 g)', mix: 'In 300–350 ml water or your favourite drink. Mix until dissolved. Listed for pre-workout, post-workout and recovery.', per_day: 1 },
  nutrition: { rows: [['L-Leucine', '2.5 g'], ['L-Isoleucine', '1.27 g'], ['L-Valine', '1.27 g'], ['Protein', '0 g']] },
  ingredients: [{ name: 'BCAAs (62%)', note: 'L-leucine 2.5 g, L-isoleucine 1.27 g, L-valine 1.27 g' }, { name: 'Inulin, curcumin' },
    { name: 'Emulsifier, acidity regulators, thickeners, anticaking agent', note: 'INS 322(i), 296, 330, 466, 414, 415, 407, 551, 413' },
    { name: 'Artificial flavours', note: 'Green apple and apple' }, { name: 'Sweetener and colour', note: 'Sucralose (INS 955), INS 133' }],
  cautions: ['One serving a day. Not a substitute for a varied diet.', PLANT_NMS, 'The tub has a desiccant sachet inside. Do not eat it.'],
  storage: 'Store in a cool, dry place. Keep the container tightly closed.',
  source: src('Tata 1mg listing, ON Instantized BCAA 5000 Green Apple 250 g', 'https://www.1mg.com/otc/optimum-nutrition-on-instantized-bcaa-5000-powder-green-apple-otc845007'),
};
const ON_MULTI_MEN = {
  serving: { size: '1 tablet', mix: 'One tablet a day, or as your healthcare professional advises.', per_day: 1, per_pack: 60 },
  nutrition: { rows: [['Vitamin A', '533 mcg'], ['Vitamin C', '40 mg'], ['Vitamin D', '5 mcg'], ['Vitamin E', '7.3 mg'], ['Vitamin K1', '55 mcg'], ['Vitamin B1', '1.5 mg'],
    ['Vitamin B2', '1.7 mg'], ['Vitamin B3', '20 mg'], ['Vitamin B5', '5 mg'], ['Vitamin B6', '1.5 mg'], ['Vitamin B12', '1 mcg'], ['Folic acid', '100 mcg'], ['Biotin', '30 mcg'],
    ['Calcium', '75 mg'], ['Phosphorus', '50 mg'], ['Potassium', '40 mg'], ['Magnesium', '25 mg'], ['Iron', '10 mg'], ['Zinc', '12 mg'], ['Copper', '1.35 mg'], ['Manganese', '2 mg'],
    ['Iodine', '140 mcg'], ['Selenium', '40 mcg'], ['Chromium', '33 mcg'], ['Molybdenum', '45 mcg'], ['Boron', '150 mcg'], ['L-Arginine', '50 mg'], ['L-Lysine', '50 mg'],
    ['L-Methionine', '10 mg'], ['Green tea extract', '50 mg'], ['Beta-carotene', '1.3 mg'], ['Lutein', '1 mg'], ['Lycopene 10%', '500 mcg']] },
  cautions: ['Not recommended for children.', 'Taking any medicine, or have a medical condition? Ask your doctor first.', PLANT_NMS],
  storage: 'Store in a cool, dry place away from sunlight. Keep the bottle closed and leave the silica gel sachet in.',
  source: src('Tata 1mg listing, ON Multivitamin for Men 60 tablets', 'https://www.1mg.com/otc/optimum-nutrition-on-multivitamin-tablet-for-men-otc1046806'),
};
const ON_PERF_WHEY = {
  finder: MILK_SOY,
  serving: { size: '1 scoop (34 g)', mix: 'In 180–240 ml cold water, milk or another drink. Stir, shake or blend for 30 seconds.', per_day: 1 },
  directions: [{ slot: 'post', text: '30–60 minutes after your workout, or any time as a high-protein snack' }],
  nutrition: { rows: [['Protein', '24 g']] },
  ingredients: [{ name: 'Protein blend (91%)', note: 'Whey protein concentrate, whey protein isolate, emulsifier INS 322(i)', allergen: 'milk, soy' },
    { name: 'Cocoa powder', note: 'Processed with alkali' }, { name: 'Salt, thickeners', note: 'INS 466, 415, 407' },
    { name: 'Artificial flavours', note: 'Chocolate, butter, cream, cocoa, custard' }, { name: 'Sweeteners', note: 'Sucralose (INS 955), acesulfame potassium (INS 950)' }],
  cautions: ['Not recommended for children.', 'One serving a day. Not a substitute for a varied diet.'],
  storage: 'Keep the container tightly closed. Store in a cool, dry place, out of reach of children.',
  source: src('Tata 1mg listing, ON Performance Whey Chocolate Milkshake', 'https://1mg.com/otc/optimum-nutrition-on-performance-whey-protein-for-muscle-support-recovery-flavour-powder-chocolate-milkshake-otc667223'),
};
const ON_CREATINE_CITRUS = {
  serving: { size: '3.8 g (about 1 scoop)', mix: 'In 250 ml water, mixed with a shaker or blender.', per_day: 1, per_pack: 65 },
  nutrition: { rows: [['Creatine monohydrate', '3 g'], ['Protein', '0 g']] },
  ingredients: [{ name: 'Creatine monohydrate', amount: '3 g' }, { name: 'Acidity regulator (INS 330), anticaking agent (INS 551)' },
    { name: 'Nature-identical flavouring' }, { name: 'Sweetener and colour', note: 'Sucralose (INS 955), INS 110' }],
  cautions: ['Not for pregnant or breastfeeding women.', 'Ask a doctor first if you have a medical condition.', 'No added sugar. One serving a day.'],
  storage: 'Store in a cool, dry place. Keep the container tightly closed.',
  source: src('Tata 1mg listing, ON Micronised Creatine Citrus Orange 250 g', 'https://www.1mg.com/otc/optimum-nutrition-on-micronised-creatine-monohydrate-for-performance-support-citrus-orange-otc1141157'),
};

// ---------- MuscleBlaze, batch 2 (Tata 1mg listings) ----------
// Listings for the same MB product often disagree (scoop size, sweetener). Only what the page states without contradiction is used.
const MB_ISO_ZERO = {
  serving: { size: '1 scoop (33.5 g)', mix: 'In 200–250 ml chilled water. Shake hard for 15–30 seconds.' },
  cautions: ['Made in a facility that also processes oats and barley.', 'Pregnant or breastfeeding women and anyone with a medical condition should ask a dietitian first.', 'Don’t exceed the recommended daily use.'],
  storage: 'Store in a cool, dry place. Keep the container tightly closed.',
  source: src('Tata 1mg listing, MuscleBlaze Biozyme Iso-Zero Ice Cream Chocolate 1 kg', 'https://1mg.com/otc/muscleblaze-biozyme-iso-zero-low-carb-isolate-whey-protein-powder-27g-per-scoop-flavour-ice-cream-chocolate-otc484489'),
};
const MB_GOLD_GAINER = {
  serving: { size: '1 level scoop', mix: 'In 300 ml chilled milk. Mix well.', per_day: 2, max_per_day: 2 },
  cautions: ['Contains creatine monohydrate and MCTs.', 'Keep out of reach of children.'],
  storage: 'Store in a cool, dry place.',
  source: src('Tata 1mg listing, MuscleBlaze High Protein Gold Gainer Chocolate 3 kg', 'https://www.1mg.com/otc/muscleblaze-high-protein-gold-gainer-powder-chocolate-otc933700'),
};
const MB_PRE_XTREME = {
  directions: [{ slot: 'pre', text: 'Within 30 minutes before working out' }],
  cautions: ['Contains caffeine (200 mg). Not for children, pregnant or breastfeeding women, or anyone sensitive to caffeine.',
    'Anyone with a medical condition should ask a dietitian first.', 'One serving a day. Scoop size differs between flavours: follow your tub.'],
  storage: 'Store in a cool, dry place in an airtight container, away from moisture.',
  source: src('Tata 1mg listing, MuscleBlaze Pre-Workout 200 Xtreme Fruit Punch 100 g', 'https://1mg.com/otc/muscleblaze-pre-workout-200-xtreme-for-energy-endurance-muscle-pump-powder-fruit-punch-otc792734'),
};
const MB_FISH_OIL_GOLD = {
  serving: { size: '1 softgel', mix: 'One softgel a day, or as your dietitian suggests.', per_day: 1, per_pack: 60 },
  nutrition: { rows: [['Fish oil', '1300 mg'], ['EPA', '500 mg'], ['DHA', '400 mg']] },
  ingredients: [{ name: 'Fish oil', amount: '1300 mg', note: 'EPA 500 mg, DHA 400 mg', allergen: 'fish' }, { name: 'Softgel', note: 'Gelatin, purified water, humectants INS 422 & 420(ii)' },
    { name: 'Preservatives, antioxidant, flavour', note: 'INS 218 & 216, INS 307, ethyl vanillin' }],
  cautions: ['Contains fish.', 'Pregnant or breastfeeding women and anyone with a medical condition should ask a dietitian first.', 'Polyols may have a laxative effect.',
    'Accidental overdose? Contact a doctor.'],
  storage: 'Store in a dry, dark place below 25 °C, away from sunlight, heat and moisture.',
  source: src('Tata 1mg listing, MuscleBlaze Omega 3 Fish Oil Gold 60 softgels', 'https://www.1mg.com/otc/muscleblaze-omega-3-fish-oil-gold-soft-gelatin-capsule-otc634279'),
};
const MB_MASS_XXL = {
  serving: { size: '1 level scoop (100 g)', mix: 'In 300 ml chilled milk, blended for a minute. Start with 1–2 servings a day for the first week, then 2–3.', per_day: 2, max_per_day: 3 },
  cautions: ['Contains milk and added sugar (sucrose).', 'Not recommended for children.', 'Pregnant or breastfeeding, on prescription medicines or with strong allergies? Ask your healthcare professional first.',
    'Don’t use if the seal is broken.'],
  storage: 'Store in a cool, dry place away from sunlight. Keep the container tightly closed.',
  source: src('Tata 1mg listing, MuscleBlaze Mass Gainer XXL Chocolate 6.6 lb', 'https://www.1mg.com/otc/muscleblaze-mb-mass-gainer-xxl-with-digestive-enzymes-for-muscles-chocolate-otc328744'),
};

// ---------- Kapiva and MuscleTech, batch 3 (Tata 1mg listings) ----------
const KAPIVA_JUICE_STORAGE = 'Store in a cool, dry place. Refrigerate after opening and finish within 1.5 months.';
const KAPIVA_PREG = 'Pregnant or breastfeeding? Ask a healthcare professional first.';
const KAPIVA_WHEATGRASS = {
  serving: { size: '30 ml', mix: 'Shake the bottle, then mix 30 ml juice with 30 ml water. Twice a day, before meals.', per_day: 2, max_per_day: 2 },
  ingredients: [{ name: 'Wheatgrass (Triticum aestivum) leaf', amount: '3.75 g' }, { name: 'Ascorbic acid', amount: '0.03 g' }, { name: 'Permitted class II preservatives', amount: 'under 0.06 g' }, { name: 'Water' }],
  cautions: [KAPIVA_PREG, 'Your healthcare professional may change the dose.'],
  storage: KAPIVA_JUICE_STORAGE,
  source: src('Tata 1mg listing, Kapiva Wheatgrass Juice 1 L', 'https://www.1mg.com/otc/kapiva-wheatgrass-juice-detoxify-the-liver-cleanse-the-digestive-system-and-purify-blood-otc349198'),
};
const KAPIVA_GET_SLIM = {
  serving: { size: '30 ml', mix: 'Shake the bottle, then mix 30 ml juice in 250 ml water. Twice a day, before lunch and dinner. Not on an empty stomach. Stay hydrated.', per_day: 2, max_per_day: 2 },
  ingredients: [{ name: 'Daruharidra' }, { name: 'Gudmar' }, { name: 'Gokshura' }, { name: 'Katuki' }, { name: 'Madhunashini' }, { name: 'Amla' }],
  cautions: ['Do not take on an empty stomach.'],
  storage: KAPIVA_JUICE_STORAGE,
  source: src('Tata 1mg listing, Kapiva Get Slim Juice 1 L', 'https://www.1mg.com/otc/kapiva-weight-wise-foods-get-slim-juice-for-healthy-weight-management-1-ltr-each-otc580254'),
};
const KAPIVA_SHILAJIT_RESIN = {
  serving: { size: '500 mg (½ spoon)', mix: 'Mix well in a glass of lukewarm water or milk. Once a day with light workouts, twice a day with intense workouts. Take as a pre-workout, or after a meal (not dinner).', per_day: 1, max_per_day: 2 },
  directions: [{ slot: 'pre', text: 'As a pre-workout' }],
  ingredients: [{ name: 'Shilajit extract', amount: '333.33 mg', note: 'per 1 g' }, { name: 'Coffee extract', amount: '200 mg' }, { name: 'Ashwagandha extract', amount: '133.33 mg' },
    { name: 'Gokshura extract', amount: '77.92 mg' }, { name: 'Haldi extract', amount: '50 mg' }, { name: 'Kali musli extract', amount: '30.83 mg' },
    { name: 'Cardamom essential oil', amount: '7.5 mg' }, { name: 'Swarna bhasma', amount: '0.42 mg' }],
  cautions: ['For men aged 16 and above.', 'Contains coffee extract.', 'Don’t exceed the recommended dose.'],
  storage: 'Store in a cool, dry place. Do not refrigerate.',
  source: src('Tata 1mg listing, Kapiva Shilajit Gold Resin 20 g', 'https://www.1mg.com/otc/kapiva-shilajit-gold-resin-with-ashwagandha-black-musli-gokshura-for-stamina-energy-otc817490'),
};
const KAPIVA_ASHWA_GOLD = {
  serving: { size: '1 capsule', mix: 'With milk or water, twice a day after meals, or as your doctor directs.', per_day: 2, max_per_day: 2 },
  ingredients: [{ name: 'Ashwagandha root extract', amount: '250 mg' }, { name: 'Krishna musali (black musli) root extract', amount: '80 mg' }, { name: 'Gokshura fruit extract', amount: '70 mg' },
    { name: 'Kapikachu (kaunch beej) seed extract', amount: '50 mg' }, { name: 'Shudh shilajit extract', amount: '20 mg' }, { name: 'Swarna bhasma', amount: '0.001 mg' },
    { name: 'Processed in triphala, erand mool and aloe vera' }, { name: 'Preservative', note: 'Potassium sorbate' }],
  cautions: ['For long-term use, ask a healthcare professional.', KAPIVA_PREG],
  storage: 'Store in a cool, dry place.',
  source: src('Tata 1mg listing, Kapiva Ashwagandha Gold 30 capsules', 'https://www.1mg.com/otc/kapiva-ayur-foods-ashwagandha-gold-capsules-with-shilajit-gokshura-for-stamina-stress-management-otc843861'),
};
const MT_PLATINUM_CREATINE = {
  serving: { size: '1 scoop', mix: 'With 200 ml water, or as your gym instructor advises.' },
  ingredients: [{ name: 'Creatine monohydrate' }],
  cautions: ['Don’t exceed the recommended dose.'],
  storage: 'Store in a cool, dry place away from direct sunlight.',
  source: src('Tata 1mg listing, MuscleTech Platinum 100% Creatine Unflavoured', 'https://www.1mg.com/otc/muscletech-platinum-100-creatine-for-muscle-building-strength-performance-unflavored-otc858427'),
};

// ---------- Kapiva, batch 4 (Tata 1mg listings) ----------
const KAPIVA_AMLA = {
  serving: { size: '30 ml', mix: 'Shake well, then mix 30 ml juice with 30–50 ml water. Twice a day before meals; best taken regularly for 2–3 months.', per_day: 2, max_per_day: 2 },
  ingredients: [{ name: 'Amla (Emblica officinalis) fruit', amount: '100 ml', note: 'per 100 ml' }, { name: 'Ascorbic acid', amount: '100 mg' }, { name: 'Preservative', note: 'Sodium benzoate' }],
  cautions: ['Don’t apply it to your face: it can irritate sensitive skin.'],
  storage: 'Store in a cool, dry place.',
  source: src('Tata 1mg listing, Kapiva Wild Amla Juice 1 L', 'https://www.1mg.com/otc/kapiva-wild-amla-juice-healthy-hair-skin-natural-vitamin-c-no-added-sugar-otc874514'),
};
const KAPIVA_ALOE = {
  serving: { size: '30 ml', mix: 'Mix 30 ml juice in 30–50 ml water. Twice a day before meals, for 2–3 months.', per_day: 2, max_per_day: 2 },
  ingredients: [{ name: 'Aloe vera juice (Aloe barbadensis)' }, { name: 'Citric acid (INS 330)' }, { name: 'Preservatives', note: 'Sodium benzoate (INS 211), potassium sorbate (INS 202)' }],
  storage: KAPIVA_JUICE_STORAGE,
  source: src('Tata 1mg listing, Kapiva Thar Aloe Vera Juice with Pulp 1 L', 'https://www.1mg.com/otc/kapiva-thar-aloe-vera-juice-with-pulp-rejuvenates-skin-hair-no-added-sugar-otc365141'),
};
const KAPIVA_ACV = {
  serving: { size: '10 ml (1–2 teaspoons)', mix: 'Shake the bottle. Mix in a glass of water and drink on an empty stomach. Rinse your mouth afterwards.' },
  ingredients: [{ name: 'Apple juice fermented to 5% acidity (100%)' }],
  cautions: ['Never drink the vinegar undiluted.', 'Pregnant or breastfeeding women, children, and anyone with a medical condition should ask a healthcare professional first.',
    'Allergic to acetic acid? Avoid it, or ask your doctor first.'],
  storage: 'Store in a cool, dry place. Finish within 1.5 months of opening.',
  source: src('Tata 1mg listing, Kapiva Himalayan Apple Cider Vinegar 500 ml', 'https://www.1mg.com/otc/kapiva-weight-wise-foods-himalayan-apple-cider-vinegar-acv-for-hunger-pangs-weight-management-otc411590'),
};
const KAPIVA_SHILAJIT_GOLD_CAPS = {
  serving: { size: '1 capsule', mix: 'With milk or water. Once a day with light workouts, twice a day with intense ones, or as a certified professional directs. 30 minutes before a workout, or after any meal except dinner.', per_day: 1, max_per_day: 2, per_pack: 30 },
  directions: [{ slot: 'pre', text: '30 minutes before your workout' }],
  ingredients: [{ name: 'Shudh shilajit extract', amount: '200 mg' }, { name: 'Coffee seed extract', amount: '99.81 mg' }, { name: 'Ashwagandha root extract', amount: '74.84 mg' },
    { name: 'Gokshura fruit extract', amount: '39.93 mg' }, { name: 'Haldi extract', amount: '24.94 mg' }, { name: 'Kali musli extract', amount: '15.48 mg' }, { name: 'Swarna bhasma', amount: '0.21 mg' },
    { name: 'Processed in triphala, ashwagandha and aloe vera' }, { name: 'Preservative', note: 'Potassium sorbate' }],
  cautions: ['Contains coffee extract.', 'For long-term use, ask a healthcare professional.'],
  storage: 'Store in a cool, dry place.',
  source: src('Tata 1mg listing, Kapiva Shilajit Gold 30 capsules', 'https://www.1mg.com/otc/kapiva-shilajit-gold-capsules-with-black-musli-gokshura-ashwagandha-for-stamina-energy-otc855851'),
};
const KAPIVA_TRIPHALA = {
  serving: { size: '30 ml', mix: 'Shake the bottle, then mix 30 ml juice with 30 ml water.' },
  directions: [{ slot: 'night', text: 'At night, before your meal' }],
  ingredients: [{ name: 'Harad fruit', amount: '33.3%' }, { name: 'Baheda fruit', amount: '33.3%' }, { name: 'Amla fruit', amount: '33.3%' }, { name: 'Preservative', note: 'Sodium benzoate' }],
  cautions: ['Not for children under 6 unless a doctor prescribes it.'],
  storage: 'Store in a cool, dry place. Refrigerate after opening.',
  source: src('Tata 1mg listing, Kapiva Triphala Juice 1 L', 'https://www.1mg.com/otc/kapiva-triphala-juice-100-ayurvedic-relieves-constipation-improves-digestion-otc365559'),
};
const KAPIVA_DIA_FREE = {
  serving: { size: '30 ml', mix: 'Shake the bottle and add 30 ml to a glass of water. Twice a day, for at least 3 months. Can be taken with your regular medicines.', per_day: 2, max_per_day: 2 },
  directions: [{ slot: 'morning', text: 'On an empty stomach' }, { slot: 'night', text: '30 minutes before or after dinner' }],
  ingredients: [{ name: 'Amla fresh fruit', amount: '17.91 ml' }, { name: 'Karela fruit', amount: '3.6 ml' }, { name: 'Jamun seed', amount: '0.72 g' }, { name: 'Giloy stem', amount: '0.36 g' },
    { name: 'Tulsi leaf', amount: '0.36 g' }, { name: 'Neem leaf', amount: '0.18 g' }, { name: 'Bilva fruit pulp', amount: '0.18 g' }, { name: 'Methi seed', amount: '0.18 g' },
    { name: 'Vijayasara heartwood', amount: '0.09 g' }, { name: 'Gudmar leaf', amount: '0.09 g' }, { name: 'Kutki rhizome', amount: '0.03 g' }, { name: 'Preservatives', note: 'Sodium benzoate, potassium sorbate' }],
  cautions: ['For adults 18 and above.', 'Pregnant or breastfeeding women and anyone with a medical condition should ask a healthcare professional first.'],
  storage: 'Store in a cool, dry place away from sunlight. Refrigerate after opening and finish within 1.5 months.',
  source: src('Tata 1mg listing, Kapiva Dia Free Juice 1 L', 'https://www.1mg.com/otc/kapiva-diafree-juice-for-diabetes-care-helps-maintain-healthy-blood-sugar-levels-1-ltr-each-otc349199'),
};

export const INFO = {
  // ON Gold Standard Whey: chocolate packs get the full Double Rich Chocolate label; vanilla and the unnamed-flavour pack get how-to-use only
  'on-gold-standard-whey-chocolate-flavour-907g': { ...ON_GSW, serving: { ...ON_GSW.serving, per_pack: 29 } },
  'on-gold-standard-whey-chocolate-flavour-1-7kg': ON_GSW,
  'on-gold-standard-whey-chocolate-flavour-2-27kg': ON_GSW,
  'on-gold-standard-whey-chocolate-4kg': ON_GSW,
  'on-gold-standard-whey-907g': usage(ON_GSW),
  'on-gold-standard-whey-vanilla-ice-cream-flavour-2-27kg': usage(ON_GSW),

  'mb-biozyme-performance-whey-chocolate-flavour-2kg': usage(MB_BIOZYME), // the 2 kg chocolate label has a different blend (86%): how-to-use only
  'muscle-blaze-biozyme-performance-whey': usage(MB_BIOZYME),
  'muscle-blaze-biozyme-performance-whey-15671': usage(MB_BIOZYME),
  'mb-biozyme-performance-whey-blue-tokai-flavour-2kg': usage(MB_BIOZYME),

  'muscle-tech-nitrotech-whey-protein': usage(NITROTECH),
  'muscle-tech-nitrotech-whey-protein-4kg': usage(NITROTECH),

  'on-creatine-unflavoured-250g': { ...ON_CREATINE, serving: { ...ON_CREATINE.serving, per_pack: 83 } },
  'on-creatine-unflavoured-100g': ON_CREATINE,

  'muscle-blaze-creatine-unflavoured': MB_CREATINE,
  'muscle-blaze-creatine-unflavoured-15519': MB_CREATINE,

  'optimum-nutrition-serious-mass-chocolate-flavour': SERIOUS_MASS,
  'on-serious-mass': usage(SERIOUS_MASS),

  'isopure-low-carb-dutch-chocolate-flavour': ISOPURE_LC,
  'isopure-low-carb-protein-unflavoured': usage(ISOPURE_LC),

  'kapiva-tulsi-giloy-juice': KAPIVA_TULSI_GILOY,

  'on-gold-standard-pre-workout': ON_GS_PRE, // pack and flavour not named: timing, cautions and storage only
  'on-zinc-magnisium-aspartate-capsules': ON_ZMA,
  'on-glutamine-powder': ON_GLUTAMINE,
  'on-bcaa-green-apple-flavour-250g': ON_BCAA_GA,
  'on-multi-vitamin-for-men-60tabs': ON_MULTI_MEN,
  'on-performance-whey-chocolate-flavour-2kg': ON_PERF_WHEY,
  'on-creatine-citrus-orange-flavour-250g': ON_CREATINE_CITRUS,

  'mb-biozyme-iso-zero-1kg': MB_ISO_ZERO, // flavour not named: how-to-use only
  'mb-high-protein-gold-gainer-3kg': MB_GOLD_GAINER,
  'muscle-blaze-high-protein-gold-gainer-5kg': MB_GOLD_GAINER,
  'mb-pre-workout-xtreme-100g': MB_PRE_XTREME,
  'mb-pre-workout-xtreme-200g': MB_PRE_XTREME,
  'muscleblaze-fish-oil-gold-60-caps': MB_FISH_OIL_GOLD,
  'muscle-blaze-mass-gainer-xxl-5kg': MB_MASS_XXL,

  'kapiva-wheatgrass-juice': KAPIVA_WHEATGRASS,
  'kapiva-weight-wise-foods-get-slim-juice-1l': KAPIVA_GET_SLIM,
  'kapiva-shilajit-gold-raisin': KAPIVA_SHILAJIT_RESIN, // "Raisin" in the catalogue = the resin jar
  'kapiva-ashwagandha-gold': KAPIVA_ASHWA_GOLD,
  'muscletech-creatine-unflavoured': MT_PLATINUM_CREATINE,
  'muscletech-creatine-unflavoured-15561': MT_PLATINUM_CREATINE,

  'kapiva-ayur-foods-wild-amla-juice-1l': KAPIVA_AMLA,
  'kapiva-ayur-foods-thar-aloe-vera-juice-1l': KAPIVA_ALOE,
  'kapiva-weight-wise-foods-apple-cider-vinegar-500ml': KAPIVA_ACV,
  'kapiva-shilajit-gold-30-capsules': KAPIVA_SHILAJIT_GOLD_CAPS,
  'kapiva-ayur-foods-triphala-juice-1l': KAPIVA_TRIPHALA,
  'kapiva-dia-foods-dia-free-juice-1l': KAPIVA_DIA_FREE,
};
