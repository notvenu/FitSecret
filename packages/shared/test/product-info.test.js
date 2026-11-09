import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INFO } from '../product-info.js';
import { SEED_ITEMS } from '../seed.js';

test('label facts: every key is a real product and every entry names its source', () => {
  const keys = new Set(SEED_ITEMS.map((i) => i.group_key || i.slug || i.id));
  for (const [k, v] of Object.entries(INFO)) {
    assert.ok(keys.has(k), `unknown product key ${k}`);
    assert.ok(v.source?.url?.startsWith('https://') && v.source.checked, `${k} has no source`);
    for (const r of v.nutrition?.rows || []) assert.ok(r[1] || r[2], `${k}: empty nutrition row ${r[0]}`);
  }
});
