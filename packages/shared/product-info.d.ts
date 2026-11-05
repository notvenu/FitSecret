export type Slot = 'morning' | 'pre' | 'post' | 'evening' | 'night';
export type ProductInfo = {
  finder?: Record<string, unknown>;
  serving?: { size: string; mix?: string; per_pack?: number; per_day?: number; max_per_day?: number };
  directions?: { slot: Slot; text: string }[];
  nutrition?: { basis_g?: number; rows: [string, string, string?][] };
  ingredients?: { name: string; amount?: string; note?: string; allergen?: string }[];
  cautions?: string[]; storage?: string; pairs?: string[];
};
export const INFO: Record<string, ProductInfo>;
