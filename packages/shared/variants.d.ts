export const SIZE: RegExp;
export function parseVariant(name: string): { base: string[]; size: string; flavour: string };
export function productName(name: string, size?: string | null, flavour?: string | null): string;
export function findVariantGroups(items: { id: string; name: string; group_key?: string | null; size?: string | null; flavour?: string | null }[]):
  { key: string; name: string; items: { id: string; name: string; group_key?: string | null; size: string; flavour: string }[] }[];
