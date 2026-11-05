// Shared botanicals: the home Ingredient Wheel and the product page's Ingredient Explorer use the same list and glyph.
// Lines are descriptive only, never benefit claims (DESIGN v3 §9). Owner to review before launch.
// ponytail: one generic leaf glyph per ingredient; the illustrator's 12 botanicals replace <Sprig/>.
export const INGREDIENTS: [string, string][] = [
  ['Ashwagandha', 'A root used in Ayurveda for generations, dried and ground.'],
  ['Giloy', 'A climbing vine, dried and powdered into churnam.'],
  ['Moringa', 'Leaves of the drumstick tree, dried in the shade and milled.'],
  ['Wheat grass', 'Young wheat shoots, dried and powdered.'],
  ['Aloe', 'The gel behind our Aurae skin and hair range.'],
  ['Shilajit', 'A mineral resin gathered from high mountain rock.'],
  ['Millets', 'Foxtail, little and kodo millets for the everyday kitchen.'],
  ['Turmeric', 'Haldi, ground from sun-dried roots.'],
  ['Tulsi', 'Holy basil leaves, a staple of Indian homes.'],
  ['Amla', 'Indian gooseberry, sun-dried and powdered.'],
  ['Jackfruit', 'Ripe jackfruit, dried and milled into flour.'],
  ['Honey', 'Forest and farm honey, packed in glass.'],
];
export const BOTANICAL_COLORS = ['#FFB81F', '#E5483B', '#FF7FA8', '#2E9E5B', '#8FD3C4', '#C9F26B'];

// match ingredients named in a product's name or description ("Ashwagandha churnam" → Ashwagandha)
export const ingredientsIn = (text: string) => INGREDIENTS.filter(([n]) => new RegExp(`\\b${n.split(' ')[0].replace(/s$/, '')}`, 'i').test(text));

export function Sprig({ color, size }: { color: string; size: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <g transform="translate(2 2)" fill={color}><path d="M20 34 C 8 26, 8 12, 20 4 C 32 12, 32 26, 20 34Z" /></g>
      <g fill="none" stroke="#17237A" strokeWidth="2" strokeLinecap="round"><path d="M20 34 C 8 26, 8 12, 20 4 C 32 12, 32 26, 20 34Z" /><path d="M20 38 V10 M20 22 l -6 -5 M20 28 l 6 -5" /></g>
    </svg>
  );
}
