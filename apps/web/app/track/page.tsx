import type { Metadata } from 'next';
import Tracker from './Tracker';

export const metadata: Metadata = { title: 'Track your order' };

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ no?: string; phone?: string; new?: string }> }) {
  const sp = await searchParams;
  return <Tracker no={sp.no || ''} phone={sp.phone || ''} fresh={!!sp.new} />;
}
