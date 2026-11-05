// UI strings in English and Telugu. Product names and descriptions come from the POS in English.
// Telugu here is a first draft: have a native speaker review it before launch (DESIGN.md §7).
// ponytail: cookie + dictionary, no /te URLs. Move to locale routes (hreflang) when Telugu product copy exists.

export const LANGS = ['en', 'te'] as const;
export type Lang = (typeof LANGS)[number];

const en = {
  'nav.shop': 'Shop', 'nav.goals': 'Goals', 'nav.wholesale': 'Wholesale', 'nav.verify': 'Verify', 'nav.visit': 'Visit',
  'nav.search': 'Search', 'nav.cart': 'Cart', 'nav.menu': 'Menu', 'nav.home': 'Home', 'nav.track': 'Track order', 'nav.close': 'Close',
  'hero.l1': 'Grown here.', 'hero.l2': 'Measured here.',
  'hero.sub': 'Supplements, Ayurveda and organic pantry, from one store on MG Road. Genuine packs, checked batch by batch.',
  'cta.shopGoal': 'Shop by goal', 'cta.finder': 'Not sure? Plant your need', 'nav.help': 'Help me choose', 'finder.empty': "Can't find it? Tell us what you need.", 'cta.whatsapp': 'Chat on WhatsApp', 'cta.shopAll': 'Shop all products', 'cta.verify': 'Verify batch',
  'trust.units': 'Own units in Gollapudi & Tadepalli', 'trust.batch': 'Batch-verified packs', 'trust.genuine': 'Genuine brands, sourced direct', 'trust.fssai': 'FSSAI licensed',
  'goals.title': 'What do you want from today?', 'goals.see': 'See all',
  'goal.build': 'Build', 'goal.lose': 'Lose fat', 'goal.energy': 'Energy', 'goal.immunity': 'Immunity', 'goal.digestion': 'Digestion', 'goal.hair': 'Hair & skin',
  'promise.build': 'Protein, creatine and recovery for the work you put in.',
  'promise.lose': 'Lighter meals, millets and support for a steady cut.',
  'promise.energy': 'Pre-workout, dry fruits and clean fuel for long days.',
  'promise.immunity': 'Vitamins, herbs, honey and ghee for everyday resilience.',
  'promise.digestion': 'Churnams, seeds and cold-pressed oils traditionally used for digestion.',
  'promise.hair': 'Aloe, scrubs and oils for hair and skin care.',
  'best.title': 'Bestsellers', 'best.sub': 'What Vijayawada keeps coming back for.',
  'story.title': 'What goes into it',
  'verify.title': 'Verify your pack', 'verify.sub': 'Every batch has a code on the pack. Enter it to see its lab papers and dates.', 'verify.placeholder': 'Batch code, e.g. FS24A117',
  'shelf.title': 'Three shelves, one store',
  'wholesale.title': 'Buying in bulk?', 'wholesale.sub': 'Wholesale rates for gyms, clinics and retailers across Andhra Pradesh, with GST invoices.', 'wholesale.cta': 'Send a wholesale enquiry',
  'visit.title': 'Visit the store', 'visit.directions': 'Get directions', 'visit.call': 'Call',
  'tile.add': 'Add', 'tile.out': 'Out of stock', 'tile.from': 'from',
  'pdp.add': 'Add to cart', 'pdp.adding': 'Adding…', 'pdp.added': 'Added to cart', 'pdp.out': 'Out of stock', 'pdp.ask': 'Ask on WhatsApp', 'pdp.pack': 'Pack',
  'pdp.inStock': 'In stock', 'pdp.left': 'Only {n} left', 'pdp.pairs': 'Pairs well with', 'pdp.reviews': 'Reviews', 'pdp.noReviews': 'No reviews yet.',
  'pdp.about': 'About this product', 'pdp.howTo': 'How to use', 'pdp.batch': 'Batch & lab info', 'pdp.verifyNote': 'Find the batch code printed near the expiry date on your pack, then check it here.',
  'pdp.bulk': 'Buy {n}+ and pay {p} each', 'pdp.mrp': 'MRP', 'pdp.incl': 'Inclusive of all taxes',
  'cart.title': 'Your cart', 'cart.empty': 'Your cart is empty. Start with a goal.', 'cart.checkout': 'Checkout', 'cart.whatsapp': 'Order on WhatsApp',
  'cart.subtotal': 'Subtotal', 'cart.free': 'Free delivery unlocked', 'cart.away': '{p} away from free delivery', 'cart.remove': 'Remove',
  'search.placeholder': 'Search ashwagandha, whey, honey…', 'search.none': 'Nothing for “{q}”. Try a goal or ask us on WhatsApp.', 'search.all': 'See all results',
  'shop.title': 'Shop', 'shop.filters': 'Filters', 'shop.sort': 'Sort', 'shop.apply': 'Show results', 'shop.clear': 'Clear filters', 'shop.count': '{n} products',
  'shop.none': 'No products match. Clear filters to see everything.', 'shop.category': 'Category', 'shop.goal': 'Goal', 'shop.price': 'Price', 'shop.inStock': 'In stock only',
  'sort.featured': 'Featured', 'sort.low': 'Price: low to high', 'sort.high': 'Price: high to low', 'sort.name': 'Name',
  'foot.tagline': 'Supplements, Ayurvedic and organic products. Made, sourced and sold in Vijayawada.',
  'foot.disclaimer': 'Supplements are not a substitute for a varied diet. Not intended to diagnose, treat or cure any disease.',
  'lang.switch': 'తెలుగు',
} as const;

export type Key = keyof typeof en;

const te: Partial<Record<Key, string>> = {
  'nav.shop': 'షాప్', 'nav.goals': 'లక్ష్యాలు', 'nav.wholesale': 'హోల్‌సేల్', 'nav.verify': 'ధృవీకరణ', 'nav.visit': 'స్టోర్',
  'nav.search': 'వెతకండి', 'nav.cart': 'కార్ట్', 'nav.menu': 'మెనూ', 'nav.home': 'హోమ్', 'nav.track': 'ఆర్డర్ ట్రాక్', 'nav.close': 'మూసివేయి',
  'hero.l1': 'ఇక్కడే పండింది.', 'hero.l2': 'ఇక్కడే కొలిచాం.',
  'hero.sub': 'సప్లిమెంట్లు, ఆయుర్వేదం, ఆర్గానిక్ ఉత్పత్తులు, MG రోడ్‌లోని ఒకే స్టోర్ నుండి. ప్రతి బ్యాచ్ తనిఖీ చేసిన అసలైన ప్యాక్‌లు.',
  'cta.shopGoal': 'లక్ష్యం ప్రకారం షాప్', 'cta.finder': 'ఏది తెలియదా? మీ అవసరం చెప్పండి', 'nav.help': 'ఎంచుకోవడంలో సహాయం', 'finder.empty': 'దొరకలేదా? మీకు ఏం కావాలో చెప్పండి.', 'cta.whatsapp': 'వాట్సాప్‌లో చాట్', 'cta.shopAll': 'అన్ని ఉత్పత్తులు', 'cta.verify': 'బ్యాచ్ ధృవీకరించండి',
  'trust.units': 'గొల్లపూడి & తాడేపల్లిలో సొంత యూనిట్లు', 'trust.batch': 'బ్యాచ్ ధృవీకరించిన ప్యాక్‌లు', 'trust.genuine': 'అసలైన బ్రాండ్లు, నేరుగా', 'trust.fssai': 'FSSAI లైసెన్స్',
  'goals.title': 'ఈ రోజు మీకు ఏం కావాలి?', 'goals.see': 'అన్నీ చూడండి',
  'goal.build': 'కండరాలు', 'goal.lose': 'బరువు తగ్గడం', 'goal.energy': 'శక్తి', 'goal.immunity': 'రోగనిరోధక శక్తి', 'goal.digestion': 'జీర్ణక్రియ', 'goal.hair': 'జుట్టు & చర్మం',
  'promise.build': 'మీ కష్టానికి ప్రోటీన్, క్రియేటిన్, రికవరీ.',
  'promise.lose': 'తేలికైన భోజనం, మిల్లెట్లు, స్థిరమైన ఫలితాలకు తోడు.',
  'promise.energy': 'ప్రీ-వర్కౌట్, డ్రై ఫ్రూట్స్, రోజంతా శక్తి.',
  'promise.immunity': 'విటమిన్లు, మూలికలు, తేనె, నెయ్యి.',
  'promise.digestion': 'జీర్ణక్రియకు సంప్రదాయంగా వాడే చూర్ణాలు, గింజలు, నూనెలు.',
  'promise.hair': 'జుట్టు, చర్మ సంరక్షణకు అలోవెరా, స్క్రబ్‌లు, నూనెలు.',
  'best.title': 'బెస్ట్ సెల్లర్స్', 'best.sub': 'విజయవాడ మళ్లీ మళ్లీ కొనేవి.',
  'story.title': 'ఇందులో ఏముంది',
  'verify.title': 'మీ ప్యాక్ ధృవీకరించండి', 'verify.sub': 'ప్రతి ప్యాక్‌పై బ్యాచ్ కోడ్ ఉంటుంది. ల్యాబ్ పత్రాలు, తేదీలు చూడటానికి దాన్ని నమోదు చేయండి.', 'verify.placeholder': 'బ్యాచ్ కోడ్',
  'shelf.title': 'మూడు అల్మారాలు, ఒకే స్టోర్',
  'wholesale.title': 'ఎక్కువ మొత్తంలో కొంటున్నారా?', 'wholesale.sub': 'జిమ్‌లు, క్లినిక్‌లు, రిటైలర్లకు హోల్‌సేల్ ధరలు, GST ఇన్వాయిస్‌తో.', 'wholesale.cta': 'హోల్‌సేల్ ఎంక్వైరీ పంపండి',
  'visit.title': 'స్టోర్‌కు రండి', 'visit.directions': 'దారి చూపించు', 'visit.call': 'కాల్',
  'tile.add': 'జోడించు', 'tile.out': 'స్టాక్ లేదు', 'tile.from': 'నుండి',
  'pdp.add': 'కార్ట్‌కు జోడించు', 'pdp.adding': 'జోడిస్తోంది…', 'pdp.added': 'కార్ట్‌కు జోడించబడింది', 'pdp.out': 'స్టాక్ లేదు', 'pdp.ask': 'వాట్సాప్‌లో అడగండి', 'pdp.pack': 'ప్యాక్',
  'pdp.inStock': 'స్టాక్ ఉంది', 'pdp.left': '{n} మాత్రమే మిగిలాయి', 'pdp.pairs': 'వీటితో బాగుంటుంది', 'pdp.reviews': 'రివ్యూలు', 'pdp.noReviews': 'ఇంకా రివ్యూలు లేవు.',
  'pdp.about': 'ఈ ఉత్పత్తి గురించి', 'pdp.howTo': 'ఎలా వాడాలి', 'pdp.batch': 'బ్యాచ్ & ల్యాబ్ సమాచారం', 'pdp.verifyNote': 'ప్యాక్‌పై ఎక్స్‌పైరీ తేదీ దగ్గర ఉన్న బ్యాచ్ కోడ్‌ను ఇక్కడ తనిఖీ చేయండి.',
  'pdp.bulk': '{n}+ కొంటే ఒక్కోటి {p}', 'pdp.mrp': 'MRP', 'pdp.incl': 'అన్ని పన్నులతో కలిపి',
  'cart.title': 'మీ కార్ట్', 'cart.empty': 'మీ కార్ట్ ఖాళీగా ఉంది. ఒక లక్ష్యంతో మొదలుపెట్టండి.', 'cart.checkout': 'చెక్అవుట్', 'cart.whatsapp': 'వాట్సాప్‌లో ఆర్డర్',
  'cart.subtotal': 'మొత్తం', 'cart.free': 'ఉచిత డెలివరీ లభించింది', 'cart.away': 'ఉచిత డెలివరీకి ఇంకా {p}', 'cart.remove': 'తొలగించు',
  'search.placeholder': 'అశ్వగంధ, వే ప్రోటీన్, తేనె…', 'search.none': '“{q}” కి ఏమీ దొరకలేదు. లక్ష్యం ప్రయత్నించండి లేదా వాట్సాప్‌లో అడగండి.', 'search.all': 'అన్ని ఫలితాలు',
  'shop.title': 'షాప్', 'shop.filters': 'ఫిల్టర్లు', 'shop.sort': 'క్రమం', 'shop.apply': 'ఫలితాలు చూపించు', 'shop.clear': 'ఫిల్టర్లు తీసివేయి', 'shop.count': '{n} ఉత్పత్తులు',
  'shop.none': 'ఏ ఉత్పత్తులూ సరిపోలలేదు. ఫిల్టర్లు తీసివేయండి.', 'shop.category': 'విభాగం', 'shop.goal': 'లక్ష్యం', 'shop.price': 'ధర', 'shop.inStock': 'స్టాక్ ఉన్నవి మాత్రమే',
  'sort.featured': 'ఫీచర్డ్', 'sort.low': 'ధర: తక్కువ నుండి', 'sort.high': 'ధర: ఎక్కువ నుండి', 'sort.name': 'పేరు',
  'foot.tagline': 'సప్లిమెంట్లు, ఆయుర్వేద, ఆర్గానిక్ ఉత్పత్తులు. విజయవాడలో తయారు, సేకరణ, అమ్మకం.',
  'foot.disclaimer': 'సప్లిమెంట్లు సమతుల ఆహారానికి ప్రత్యామ్నాయం కాదు. ఏ వ్యాధినీ నిర్ధారించడానికి, చికిత్స చేయడానికి ఉద్దేశించినవి కావు.',
  'lang.switch': 'English',
};

// Missing Telugu falls back to English, never to the key.
export function translator(lang: Lang) {
  return (k: Key, vars?: Record<string, string | number>) => {
    let s: string = (lang === 'te' && te[k]) || en[k];
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.replace(`{${n}}`, String(v));
    return s;
  };
}
export type T = ReturnType<typeof translator>;
export const asLang = (v?: string): Lang => (v === 'te' ? 'te' : 'en');
