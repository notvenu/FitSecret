'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Browser client (anon key + customer session). Null in demo mode.
export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return (client ??= createClient(url, key));
}

// Postgres RAISE messages from place_order -> customer-friendly text
export function orderError(msg: string) {
  if (msg.startsWith('OUT_OF_STOCK:')) return `Sorry, "${msg.slice(13)}" just went out of stock. Please reduce the quantity.`;
  return ({
    INVALID_PHONE: 'Enter a valid 10-digit mobile number.', INVALID_NAME: 'Enter your full name.',
    INVALID_ADDRESS: 'Enter a complete address with a 6-digit pincode.', EMPTY_CART: 'Your cart is empty.',
    ITEM_UNAVAILABLE: 'An item in your cart is no longer available.', COD_UNAVAILABLE: 'Cash on delivery is not available for this order. Please pay online.',
    INVALID_QTY: 'Maximum 20 units per item.', STORE_NOT_READY: 'Online ordering is being set up. Please call us to order.',
  } as Record<string, string>)[msg.split(':')[0]] || 'Something went wrong. Please try again.';
}
