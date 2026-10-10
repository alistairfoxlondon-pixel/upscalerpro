export function Hero() {
  return (
    <section className="relative" aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-5xl px-4 pb-6 pt-10 text-center sm:pt-14">
        <h1
          id="hero-title"
          className="pf-fade-up text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl"
        >
          AI image upscaler
        </h1>
        <p className="pf-fade-up pf-fade-up-1 mx-auto mt-3 max-w-md text-pretty text-base text-muted-foreground">
          Real detail up to 8x. Processed in memory, never stored.
        </p>
        <div className="pf-fade-up pf-fade-up-2 mt-4 flex flex-wrap items-center justify-center gap-2">
          {['Up to 8x', 'Real-ESRGAN AI', 'Nothing stored'].map((text) => (
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
