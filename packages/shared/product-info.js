// Label facts for the product page and finder, keyed by product key (the website URL: /p/<key>).
// Every value must come from the approved pack label or the owner; nothing here is inferred. A product page section
// (How to use, Nutrition, Ingredients' amounts, Pairings) only shows when its data is filled in.
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
// }
export const INFO = {};
