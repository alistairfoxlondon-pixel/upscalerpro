const chips = [
  'Up to 8x larger',
  'Server side processing',
  'Files deleted instantly',
];

export function Hero() {
  return (
    <section className="relative" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-12 text-center sm:pt-16">
        <h1
          id="hero-title"
          className="pf-fade-up text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
        >
          AI image upscaler
        </h1>
        <p
          className="pf-fade-up pf-fade-up-1 mx-auto mt-3 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
        >
          Enlarge photos up to 8x with sharper detail. Uploads are processed in
          memory and never stored.
        </p>
        <div className="pf-fade-up pf-fade-up-2 mt-5 flex flex-wrap items-center justify-center gap-2">
          {chips.map((text) => (
            <span
              key={text}
              className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
