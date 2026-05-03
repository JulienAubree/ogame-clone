import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import type { HomepageContent } from './useHomepageContent';

interface LandingImmersiveProps {
  content: HomepageContent;
}

type ImmersiveImage = HomepageContent['immersive']['images'][number];

export function LandingImmersive({ content }: LandingImmersiveProps) {
  const { immersive } = content;

  return (
    <section
      id="galerie"
      className="relative bg-gradient-to-b from-background via-[hsl(220,55%,5%)] to-background"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
          {/* Left column: title + description + CTA */}
          <div className="lg:col-span-3">
            {immersive.title && (
              <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-foreground sm:text-3xl">
                {immersive.title}
              </h2>
            )}
            <div
              aria-hidden
              className="my-5 h-px w-12 bg-gradient-to-r from-primary to-transparent"
            />
            {immersive.description && (
              <p className="mb-8 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {immersive.description}
              </p>
            )}
            {immersive.ctaLabel && immersive.ctaHref && (
              <ImmersiveCta href={immersive.ctaHref}>{immersive.ctaLabel}</ImmersiveCta>
            )}
          </div>

          {/* Right column: image grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5 lg:col-span-9">
            {immersive.images.map((img: ImmersiveImage, i: number) => (
              <ImmersiveTile key={`${img.src}-${i}`} src={img.src} alt={img.alt} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ImmersiveTile({ src, alt, index }: { src: string; alt: string; index: number }) {
  const [errored, setErrored] = useState(false);
  return (
    <figure className="group relative overflow-hidden rounded-lg border border-white/5 bg-card/40 transition-all duration-300 hover:border-primary/30 hover:shadow-[0_0_30px_-10px_hsl(200,85%,65%,0.4)]">
      <div className="aspect-[3/4]">
        {!errored && src ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={() => setErrored(true)}
          />
        ) : (
          <ImmersiveFallback index={index} />
        )}
      </div>
      <figcaption
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4 opacity-90"
      >
        {alt && (
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-foreground/80">
            {alt}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function ImmersiveFallback({ index }: { index: number }) {
  // Different gradient + glyph per slot so the placeholders don't all look
  // identical when the admin hasn't uploaded yet.
  const PALETTES = [
    {
      grad: 'linear-gradient(160deg, hsl(220, 55%, 8%) 0%, hsl(210, 60%, 18%) 50%, hsl(200, 70%, 28%) 100%)',
      glyph: 'mountains',
    },
    {
      grad: 'linear-gradient(160deg, hsl(240, 50%, 8%) 0%, hsl(260, 50%, 14%) 50%, hsl(220, 60%, 22%) 100%)',
      glyph: 'city',
    },
    {
      grad: 'linear-gradient(160deg, hsl(20, 50%, 12%) 0%, hsl(0, 60%, 18%) 50%, hsl(20, 70%, 28%) 100%)',
      glyph: 'tower',
    },
  ];
  const palette = PALETTES[index % PALETTES.length];

  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0" style={{ background: palette.grad }} />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 20% 25%, rgba(255,255,255,0.7), transparent), radial-gradient(1.5px 1.5px at 60% 50%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 80% 20%, rgba(255,255,255,0.6), transparent), radial-gradient(2px 2px at 40% 80%, rgba(255,255,255,0.4), transparent)',
          backgroundSize: '120px 120px',
        }}
      />
      <svg
        viewBox="0 0 300 400"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {palette.glyph === 'mountains' && (
          <g fill="currentColor" className="text-foreground/70">
            <path d="M0 380 L60 240 L100 290 L160 180 L220 280 L260 220 L300 320 L300 400 L0 400 Z" opacity="0.55" />
            <path d="M0 400 L80 300 L140 360 L210 280 L300 360 L300 400 Z" opacity="0.85" />
            <circle cx="220" cy="80" r="38" fill="hsl(195, 100%, 90%)" opacity="0.9" />
          </g>
        )}
        {palette.glyph === 'city' && (
          <g fill="currentColor" className="text-foreground/70">
            <circle cx="240" cy="80" r="50" fill="hsl(280, 50%, 70%)" opacity="0.7" />
            <g opacity="0.85">
              <rect x="40" y="240" width="20" height="160" />
              <rect x="70" y="200" width="32" height="200" />
              <rect x="110" y="270" width="16" height="130" />
              <rect x="140" y="180" width="40" height="220" />
              <rect x="190" y="230" width="20" height="170" />
              <rect x="220" y="260" width="32" height="140" />
              <rect x="262" y="200" width="20" height="200" />
            </g>
            <g fill="hsl(195, 100%, 90%)" opacity="0.9">
              <rect x="146" y="190" width="6" height="6" />
              <rect x="160" y="200" width="6" height="6" />
              <rect x="76" y="220" width="4" height="4" />
              <rect x="96" y="240" width="4" height="4" />
              <rect x="226" y="280" width="6" height="6" />
            </g>
          </g>
        )}
        {palette.glyph === 'tower' && (
          <g className="text-foreground/70">
            <g fill="currentColor" opacity="0.85">
              <path d="M150 120 L130 280 L170 280 Z" />
              <rect x="138" y="240" width="24" height="160" />
              <rect x="100" y="320" width="100" height="80" />
            </g>
            <g fill="hsl(15, 90%, 60%)" opacity="0.95">
              <circle cx="150" cy="180" r="3" />
              <circle cx="150" cy="220" r="3" />
              <circle cx="120" cy="350" r="4" />
              <circle cx="180" cy="350" r="4" />
              <circle cx="150" cy="370" r="4" />
            </g>
            <g fill="currentColor" opacity="0.5">
              <path d="M0 380 L60 360 L120 380 L180 365 L240 380 L300 370 L300 400 L0 400 Z" />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

function ImmersiveCta({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const className =
    'inline-flex items-center gap-2 rounded-md border border-primary/40 bg-transparent px-5 py-2.5 text-xs font-medium uppercase tracking-[0.2em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground';
  const content = (
    <>
      <span>{children}</span>
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
    </>
  );
  if (isInternal) {
    return (
      <Link to={href} className={`group ${className}`}>
        {content}
      </Link>
    );
  }
  return (
    <a href={href} className={`group ${className}`}>
      {content}
    </a>
  );
}
