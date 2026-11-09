import type { Key } from '@/lib/i18n';

// Filter options shared by the server page and the client filter form.
export const PRICES: [string, string][] = [['0-500', 'Under ₹500'], ['500-1000', '₹500 – ₹1,000'], ['1000-2500', '₹1,000 – ₹2,500'], ['2500-', 'Over ₹2,500']];
// Product type, as the finder classifies it (packages/shared/finder.js attributesOf().form)
export const FORMS: [string, Key][] = [['powder', 'form.powder'], ['capsule', 'form.capsule'], ['drink', 'form.drink'], ['food', 'form.food'], ['topical', 'form.topical']];
export const DISCOUNTS: [string][] = [['10'], ['25'], ['40']];
// Multi-select filters travel as one comma-separated URL value: ?brand=MuscleBlaze,Optimum Nutrition
export const listOf = (v?: string) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
