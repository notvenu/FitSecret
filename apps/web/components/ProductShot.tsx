import Image from 'next/image';

// Product photo filling the tile (the store's photos are full square shots with their own backgrounds).
// Text placeholder only for items added in POS without an image URL.
export default function ProductShot({ brand, name, size, image, sizes = '(min-width: 1024px) 25vw, 50vw', priority }: {
  brand: string; name: string; size?: string; image?: string | null; sizes?: string; priority?: boolean;
}) {
  if (image) {
    return (
      <div className="relative h-full w-full bg-surface">
        <Image src={image} alt={name} fill sizes={sizes} priority={priority} className="object-cover" />
      </div>
    );
  }
  return (
    <div className="@container flex h-full w-full flex-col justify-between bg-surface p-[9%]" role="img" aria-label={name}>
      <span className="text-[clamp(9px,1.6cqw,12px)] font-semibold uppercase tracking-wide text-mute">{brand}</span>
      <span className="display text-[clamp(14px,9cqw,40px)] text-ink/85">{name.replace(brand, '').trim()}</span>
      <span className="text-[clamp(9px,1.6cqw,12px)] text-mute">{size}</span>
    </div>
  );
}
