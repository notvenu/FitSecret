import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="page-top mx-auto grid max-w-xl justify-items-center gap-6 px-4 pb-24 text-center">
      <p className="display-xl text-haldi">404</p>
      <h1 className="h2">This page isn&apos;t on the shelf.</h1>
      <p className="text-ink-soft">It may have moved or sold out for good. Search for it, or start from a goal.</p>
      <form action="/shop" className="flex w-full gap-2"><input name="q" className="field flex-1" placeholder="Search products" aria-label="Search products" /><button className="btn btn-dark">Search</button></form>
      <Link href="/" className="font-semibold text-river underline underline-offset-4">Back to home</Link>
    </div>
  );
}
