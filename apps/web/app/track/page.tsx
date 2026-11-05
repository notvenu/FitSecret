import type { Metadata } from 'next';
import Tracker from './Tracker';

export const metadata: Metadata = { title: 'Track your order', robots: { index: false } };

export default async function Track({ searchParams }: { searchParams: Promise<{ no?: string; phone?: string; new?: string }> }) {
  const sp = await searchParams;
  return <Tracker no={sp.no || ''} phone={sp.phone || ''} fresh={!!sp.new} />;
}
