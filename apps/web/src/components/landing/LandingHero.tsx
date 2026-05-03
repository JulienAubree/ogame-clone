import { Link } from 'react-router';
import { Play } from 'lucide-react';
import { AnimatedHeroBackground } from './AnimatedHeroBackground';
import type { HomepageContent } from './useHomepageContent';

interface LandingHeroProps {
  content: HomepageContent;
}

export function LandingHero({ content }: LandingHeroProps) {
  const { hero } = content;

  return (
    <section
      id="accueil"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden"
    >
      <AnimatedHeroBackground src={hero.backgroundImage} intensity="full" vignette="linear" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-32 sm:px-6 lg:px-10 lg:py-40">
        <div className="max-w-2xl">
          {hero.eyebrow && (
            <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.4em] text-primary">
              {hero.eyebrow}
            </p>
          )}

          {/* Title — large stylized wordmark */}
          <h1 className="mb-6">
            <span className="sr-only">{hero.title}</span>
            <span className="block">
              <HeroTitle text={hero.title} />
            </span>
          </h1>

          {hero.tagline && (
            <p className="mb-6 text-lg font-semibold uppercase tracking-[0.25em] text-primary sm:text-xl md:text-2xl">
              {hero.tagline}
            </p>
          )}

          {hero.description && (
            <p className="mb-10 max-w-xl text-base leading-relaxed text-foreground/80 sm:text-lg">
              {hero.description}
            </p>
          )}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <PrimaryCta href={hero.primaryCta.href}>{hero.primaryCta.label}</PrimaryCta>
            {hero.secondaryCta && (
              <SecondaryCta href={hero.secondaryCta.href}>
                {hero.secondaryCta.label}
              </SecondaryCta>
            )}
          </div>
        </div>
      </div>

      {/* Bottom fade into the next section */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background via-background/70 to-transparent"
      />
    </section>
  );
}

function HeroTitle({ text }: { text: string }) {
  // Layered title: a back layer holds the breathing halo (so we can animate
  // text-shadow without fighting the bg-clip text mask used by the front
  // gradient layer). Front layer is the metallic gradient wordmark.
  const titleClass =
    'inline-block text-5xl font-black uppercase leading-none tracking-[0.12em] sm:text-7xl md:text-8xl lg:text-9xl';
  return (
    <span aria-hidden className="relative inline-block">
      <span
        className={`animate-title-halo absolute inset-0 ${titleClass} text-white/0`}
        style={{ pointerEvents: 'none' }}
      >
        {text}
      </span>
      <span
        className={`relative bg-gradient-to-b from-white via-slate-300 to-slate-500 bg-clip-text text-transparent ${titleClass}`}
      >
        {text}
      </span>
    </span>
  );
}

function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const className =
    'group relative inline-flex items-center justify-center overflow-hidden rounded-md bg-primary px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.2em] text-primary-foreground shadow-[0_0_30px_-6px_hsl(200,85%,65%,0.7)] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_0_40px_-4px_hsl(200,85%,65%,0.9)] active:scale-[0.98]';
  const content = (
    <>
      <span className="relative z-10">{children}</span>
      <span
        aria-hidden
        className="absolute inset-0 -z-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/30 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]"
      />
    </>
  );
  if (isInternal) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {content}
    </a>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const className =
    'group inline-flex items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-medium uppercase tracking-[0.2em] text-foreground/90 backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/[0.07]';
  const content = (
    <>
      <Play className="h-3.5 w-3.5 fill-current text-primary" />
      <span>{children}</span>
    </>
  );
  if (isInternal) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {content}
    </a>
  );
}
