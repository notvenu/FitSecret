import { slugify } from '@fitsecret/shared';
import { Pulse } from './Hero';

// Shared layout for policy pages: title, last-updated date, sticky contents list, numbered sections.
export default function Legal({ title, updated, intro, sections }: {
  title: string; updated: string; intro: string; sections: [string, React.ReactNode][];
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-14 md:px-6 md:pt-20">
      <h1 className="display text-[clamp(2.8rem,7vw,6rem)]">
        <span className="relative inline-block">{title}<Pulse className="absolute -bottom-[0.1em] left-0 h-[0.12em] w-full" /></span>
      </h1>
      <p className="mt-6 text-sm text-mute">Last updated {updated}</p>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</p>

      <div className="mt-14 grid gap-12 lg:grid-cols-[240px_1fr]">
        <nav aria-label="On this page" className="hidden text-sm lg:sticky lg:top-32 lg:block lg:self-start">
          <ol className="space-y-2 border-l border-line">
            {sections.map(([h]) => (
              <li key={h}><a href={`#${slugify(h)}`} className="-ml-px block border-l border-transparent pl-4 text-mute hover:border-ink hover:text-ink">{h}</a></li>
            ))}
          </ol>
        </nav>
        <div className="max-w-3xl space-y-12">
          {sections.map(([h, body], i) => (
            <section key={h} id={slugify(h)} className="scroll-mt-32">
              <h2 className="display text-[1.75rem]"><span className="mr-3 text-brand-deep">{String(i + 1).padStart(2, '0')}</span>{h}</h2>
              <div className="mt-4 space-y-3 leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:decoration-brand [&_a]:decoration-2 [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1">
                {body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
