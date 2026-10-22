export type TrackEvent = { at: string | null; status: string; detail: string; location: string };
export type Tracking = {
  provider: 'shiprocket' | 'delhivery'; awb: string; status: 'booked' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'rto';
  label: string; current?: string | null; note?: string; edd?: string | null; delivered_at?: string | null; origin?: string | null; destination?: string | null;
  courier?: string | null; url?: string | null; events: TrackEvent[];
};
export const COURIERS: string[];
export const BUCKET_LABEL: Record<string, string>;
export function providerFor(courier: string | null | undefined): 'shiprocket' | 'delhivery' | null;
export function bucket(text: string): Tracking['status'];
export function parseShiprocket(json: unknown, awb: string): Tracking | null;
export function parseDelhivery(json: unknown, awb: string): Tracking | null;
