import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-28 text-center">
      <p className="display text-9xl text-brand-deep">404</p>
      <h1 className="mt-4 display text-3xl">This page skipped leg day</h1>
      <p className="mt-2 text-mute">It doesn&apos;t exist, or the product is no longer listed.</p>
      <Link href="/shop" className="btn-ink mt-8">Back to the shop</Link>
    </div>
  );
}
