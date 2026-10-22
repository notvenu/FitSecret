// Turns OCR text of a supplier bill into a draft purchase: supplier GSTIN, bill no, date and item lines matched to the catalogue.
// Free and offline-friendly (the text comes from Tesseract in the browser), so it is heuristic: every field lands in a review screen.
import { round2 } from './index.js';

const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g;
const SKIP = /\b(sub\s*total|total|grand|cgst|sgst|igst|taxable|round|amount in words|rupees|bank|ifsc|a\/c|account|declaration|signatory|terms|balance|received|discount\s*amt|freight)\b/i;
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const UNIT = /^\d+(\.\d+)?(kg|g|gm|gms|lb|lbs|ml|l|ltr|pcs|pc|caps|tabs|s)$/i;

export const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w.length > 1 || /\d/.test(w));

// Share of the item's name words found in the text line (0..1), plus how many matched. Brand + size + flavour words all count.
export function matchScore(line, item) {
  const have = new Set(words(line));
  const want = [...new Set(words(`${item.brand || ''} ${item.name}`))];
  if (!want.length) return { score: 0, hit: 0 };
  const hit = want.filter((w) => have.has(w) || [...have].some((h) => h.length > 3 && (w.startsWith(h) || h.startsWith(w)))).length;
  return { score: hit / want.length, hit };
}

// Needs 2+ shared words and 60% of the name; on a tie the more specific item (more words matched) wins.
export function bestItem(line, items) {
  let best = null, top = { score: 0, hit: 0 };
  for (const it of items) {
    if (it.barcode && line.includes(it.barcode)) return { item: it, score: 1 };
    const m = matchScore(line, it);
    if (m.score > top.score || (m.score === top.score && m.hit > top.hit)) { best = it; top = m; }
  }
  return { item: top.score >= 0.6 && top.hit >= 2 ? best : null, score: round2(top.score) };
}

function expiryOf(line) {
  let m = line.match(/\b(0?[1-9]|1[0-2])[\/\-.](\d{2}|\d{4})\b(?![\/\-.]\d)/);
  let mon, yr;
  if (m) { mon = +m[1]; yr = +m[2]; }
  else if ((m = line.toUpperCase().match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[\s\-\/.']*(\d{2}|\d{4})\b/))) { mon = MONTHS[m[1]]; yr = +m[2]; }
  else return null;
  if (yr < 100) yr += 2000;
  if (yr < 2020 || yr > 2045) return null;
  const last = new Date(yr, mon, 0).getDate(); // expiry printed as MM/YY means end of that month
  return `${yr}-${String(mon).padStart(2, '0')}-${last}`;
}

// One bill row → qty, rate, gst%, hsn, batch, expiry. Rate is whatever makes qty × rate (± GST) ≈ the row amount.
export function parseLine(line) {
  const exp = expiryOf(line);
  const clean = line.replace(/\b(0?[1-9]|1[0-2])[\/\-.](\d{2}|\d{4})\b/g, ' ');
  const gst = clean.match(/\b(0|5|12|18|28|40)(?:\.0+)?\s*%/);
  const tokens = clean.split(/\s+/).filter(Boolean);
  const hsn = tokens.find((t) => /^(\d{4}|\d{6}|\d{8})$/.test(t) && !/^0/.test(t) && !/^20[2-4]\d$/.test(t)) || null;
  const batch = tokens.find((t) => /^[A-Z0-9\-]{4,14}$/i.test(t) && /[A-Z]/i.test(t) && /\d/.test(t) && !UNIT.test(t) && !/%/.test(t)) || null;
  const nums = tokens.filter((t) => t !== hsn && !UNIT.test(t) && /^\d[\d,]*(\.\d+)?%?$/.test(t) && !t.endsWith('%')).map((t) => +t.replace(/,/g, ''));
  if (!nums.length) return null;
  const amount = nums[nums.length - 1], g = gst ? +gst[1] : null;
  const close = (a, b) => b > 0 && Math.abs(a - b) / b < 0.03;
  for (let i = 0; i < nums.length - 1; i++) {
    const q = nums[i];
    if (!(Number.isInteger(q) && q > 0 && q < 1000)) continue;
    for (let j = i + 1; j < nums.length - 1; j++) {
      const r = nums[j];
      if (close(q * r, amount)) return { qty: q, rate: r, gst_rate: g, hsn, batch_no: batch, expiry: exp, amount, inclusive: false };
      if (g != null && close(q * r * (1 + g / 100), amount)) return { qty: q, rate: r, gst_rate: g, hsn, batch_no: batch, expiry: exp, amount, inclusive: false };
    }
  }
  const q = nums.find((n) => Number.isInteger(n) && n > 0 && n < 500 && n !== amount) || 1;
  return { qty: q, rate: round2(amount / q), gst_rate: g, hsn, batch_no: batch, expiry: exp, amount, inclusive: false, guessed: true };
}

export function parseBill(text, items = [], { ownGstin } = {}) {
  const raw = String(text || '');
  const up = raw.toUpperCase().replace(/O(?=\d)/g, '0');
  const gstin = [...new Set(up.match(GSTIN) || [])].find((g) => g !== String(ownGstin || '').toUpperCase()) || null;
  const no = raw.match(/(?:invoice|inv|bill)\s*(?:no|number|#)?\s*[.:#\-]?\s*([A-Z0-9][A-Z0-9\/\-]{1,20})/i)?.[1] || null;
  const dm = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  let date = null;
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + +dm[3] : +dm[3];
    if (+dm[2] >= 1 && +dm[2] <= 12 && +dm[1] >= 1 && +dm[1] <= 31) date = `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  }
  const lines = [];
  for (const l of raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    if (SKIP.test(l) || !/[a-z]{3}/i.test(l)) continue;
    const p = parseLine(l);
    if (!p || !(p.amount > 0)) continue;
    const { item, score } = bestItem(l, items);
    // A row needs either a catalogue match or both a quantity pair and enough words to be a product name.
    if (!item && (p.guessed || words(l).filter((w) => /[a-z]{3}/.test(w)).length < 2)) continue;
    lines.push({ ...p, text: l, item_id: item?.id || null, score });
  }
  return { gstin, no, date, lines };
}
