import { slugify } from '@fitsecret/shared';

// Policy pages: title, last-updated date, sticky contents list, sections. Text column ≤ 70ch.
export default function Legal({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: [string, React.ReactNode][] }) {
  return (
    <div className="page-top mx-auto max-w-[1360px] px-4 pb-24 md:px-8">
      <h1 className="display-l">{title}</h1>
      <p className="mt-4 text-sm text-ink-soft">Last updated {updated}</p>
      <p className="story mt-4">{intro}</p>
      <div className="mt-14 grid gap-12 lg:grid-cols-[240px_1fr]">
        <nav aria-label="On this page" className="hidden text-sm lg:sticky lg:top-[calc(var(--nav-h)+2rem)] lg:block lg:self-start">
          <ol className="grid gap-2 border-l border-line">
            {sections.map(([h]) => <li key={h}><a href={`#${slugify(h)}`} className="-ml-px block border-l-2 border-transparent pl-4 text-ink-soft hover:border-haldi hover:text-ink">{h}</a></li>)}
          </ol>
        </nav>
        <div className="grid max-w-[70ch] gap-12">
          {sections.map(([h, body]) => (
            <section key={h} id={slugify(h)} className="scroll-mt-28">
              <h2 className="h3">{h}</h2>
              <div className="mt-4 grid gap-3 leading-relaxed text-ink-soft [&_a]:font-semibold [&_a]:text-river [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc">{body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
