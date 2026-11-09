// Fetches each brand's app icon (its square logo mark), uploads it to Supabase Storage (public bucket "catalog", brands/) as WebP,
// and writes the manifest the homepage reads (apps/web/lib/brand-logos.json). Re-run to refresh; check the contact sheet first.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.
//   node scripts/fetch-brand-logos.mjs [contact-sheet.png]
// Source: Google's public favicon service, which returns the largest icon the brand's own site declares (often its 180–256 px
// app icon). Everything is re-encoded with sharp, so no SVG or script from another site is ever served from ours.
// A brand missing here, or whose icon is too small, gets a typographic sticker on the site instead.
import { writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';

// Brand name exactly as in the catalogue → its official website
export const DOMAINS = {
  MuscleBlaze: 'muscleblaze.com', 'Optimum Nutrition': 'optimumnutrition.com', Kapiva: 'kapiva.in', 'Wellbeing Nutrition': 'wellbeingnutrition.com',
  MuscleTech: 'muscletech.com', Pintola: 'pintola.in', 'RiteBite Max Protein': 'maxprotein.in', Apollon: 'apollonnutrition.com', Wellcore: 'wellcore.in',
  'Big Muscles': 'bigmusclesnutrition.com', Avvatar: 'avvatarindia.com', 'One Science': 'onesciencenutrition.com', Labrada: 'labrada.com',
  Himalaya: 'himalayawellness.in', 'HK Vitals': 'hkvitals.com', Isopure: 'isopure.com', Dymatize: 'dymatize.com', 'Kevin Levrone': 'kevinlevrone.com',
  Animal: 'animalpak.com', 'The Whole Truth': 'thewholetruthfoods.com', Ghost: 'ghostlifestyle.com', C4: 'cellucor.com', Lindt: 'lindt.com',
  Nutella: 'nutella.com', Cadbury: 'cadbury.co.uk', 'Lotus Biscoff': 'lotusbiscoff.com', 'Dr. Morepen': 'drmorepen.com', TrueBasics: 'truebasics.com',
  Nutrex: 'nutrex.com', Farmley: 'farmley.com', SuperYou: 'superyou.in', 'Primeval Labs': 'primevallabs.com', Alpino: 'alpino.store',
};
// Brands whose site declares a better icon than the favicon service returns (read from the site's own <link rel="icon">)
const DIRECT = {
  Kapiva: 'https://kapiva-cdn.gumlet.io/s-5h8rqg02f8/product_images/App-Icon_1.png?w=256',
  'The Whole Truth': 'https://media.thewholetruthfoods.com/public/cms/twt_logo_bw_c541eb7fbf.png',
  Labrada: 'https://labrada.com/public/assets/images/favicon.png',
};
// square marks need 96 px to stay sharp on a sticker; wide wordmarks (180×63) are fine at 150 px wide
const sharpEnough = (w, h) => Math.min(w, h) >= 96 || (Math.max(w, h) >= 150 && Math.min(w, h) >= 40);

const root = new URL('../', import.meta.url);
const env = Object.fromEntries((await readFile(new URL('apps/web/.env.local', root), 'utf8')).split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
if (!U || !K) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local');
const store = async (path, body) => {
  const r = await fetch(`${U}/storage/v1/object/catalog/${path}`, { method: 'POST', body,
    headers: { authorization: 'Bearer ' + K, apikey: K, 'content-type': 'image/webp', 'x-upsert': 'true', 'cache-control': 'max-age=86400' } });
  if (!r.ok) throw new Error('upload ' + r.status);
  return `${U}/storage/v1/object/public/catalog/${path}`;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const manifest = {}, report = [], seen = {};
for (const [brand, domain] of Object.entries(DOMAINS)) {
  try {
    const r = await fetch(DIRECT[brand] || `https://www.google.com/s2/favicons?domain=${domain}&sz=256`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const { width = 0, height = 0 } = await sharp(buf).metadata();
    if (!sharpEnough(width, height)) { report.push([brand, `too small (${width}×${height})`]); continue; }
    const file = `${slug(brand)}.webp`;
    const webp = await sharp(buf).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer();
    manifest[brand] = await store(`brands/${file}`, webp);
    seen[brand] = webp;
    report.push([brand, `ok ${width}px`]);
  } catch (e) { report.push([brand, 'failed: ' + e.message]); }
}
await writeFile(new URL('apps/web/lib/brand-logos.json', root), JSON.stringify(manifest, null, 1) + '\n');
console.table(Object.fromEntries(report));

// Contact sheet for a human check: every fetched logo with its brand name, on one image.
const sheet = process.argv[2];
if (sheet) {
  const tiles = await Promise.all(Object.entries(seen).map(async ([brand, webp], i) => {
    const label = Buffer.from(`<svg width="200" height="30"><text x="100" y="20" font-size="14" text-anchor="middle" font-family="Arial">${brand.replace(/&/g, '&amp;')}</text></svg>`);
    const tile = await sharp({ create: { width: 200, height: 200, channels: 4, background: '#ffffff' } })
      .composite([{ input: await sharp(webp).resize(150, 150).toBuffer(), top: 10, left: 25 }, { input: label, top: 165, left: 0 }]).png().toBuffer();
    return { input: tile, left: (i % 6) * 200, top: Math.floor(i / 6) * 200 };
  }));
  await sharp({ create: { width: 1200, height: Math.ceil(tiles.length / 6) * 200, channels: 4, background: '#eeeeee' } }).composite(tiles).png().toFile(sheet);
  console.log('contact sheet:', sheet);
}
