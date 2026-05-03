import { useState } from 'react';
import type { HomepageContent } from './useHomepageContent';

interface LandingPillarsProps {
  content: HomepageContent;
}

type PillarIcon = HomepageContent['pillars']['items'][number]['icon'];
type Pillar = HomepageContent['pillars']['items'][number];

export function LandingPillars({ content }: LandingPillarsProps) {
  const { pillars } = content;
  if (pillars.items.length === 0) return null;

  // Adapt grid columns to the number of pillars (2/3/4 cols)
  const colsClass =
    pillars.items.length >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : pillars.items.length === 3
        ? 'sm:grid-cols-3'
        : 'sm:grid-cols-2';

  return (
    <section id="univers" className="relative bg-background">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-10">
        {pillars.title && (
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-bold uppercase tracking-[0.25em] text-foreground sm:text-3xl">
              {pillars.title}
            </h2>
            <div
              aria-hidden
              className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-primary to-transparent"
            />
          </div>
        )}

        <div className={`grid gap-4 ${colsClass} sm:gap-6`}>
          {pillars.items.map((p: Pillar, i: number) => (
            <PillarCard
              key={`${p.title}-${i}`}
              title={p.title}
              description={p.description}
              icon={p.icon}
              image={p.image}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PillarCard({
  title,
  description,
  icon,
  image,
}: {
  title: string;
  description: string;
  icon: PillarIcon;
  image: string;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-white/5 bg-gradient-to-b from-card/80 to-card/40 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_0_40px_-8px_hsl(200,85%,65%,0.5)]">
      {/* Top hover line */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px z-20 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      {/* Visual takes the full width of the card, with a subtle gradient fade
          into the text area below. */}
      <PillarVisual icon={icon} image={image} />

      <div className="flex flex-1 flex-col px-5 pb-6 pt-1 sm:px-6 sm:pb-7">
        <h3 className="mb-3 text-base font-bold uppercase tracking-[0.2em] text-foreground sm:text-lg">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </article>
  );
}

/**
 * Full-width pillar visual. When an admin image is present, it bleeds to the
 * card edges with a soft fade into the card surface. The fallback glyph is
 * still centered but inside the same widescreen frame so the layout never
 * jumps when an image is added or removed.
 */
function PillarVisual({ icon, image }: { icon: PillarIcon; image: string }) {
  const [errored, setErrored] = useState(false);
  const showImage = !!image && !errored;

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden">
      {showImage ? (
        <>
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            onError={() => setErrored(true)}
          />
          {/* Subtle inner glow on hover */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-primary/0 transition-colors duration-500 group-hover:bg-primary/[0.06]"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[hsl(220,55%,8%)] via-[hsl(220,40%,12%)] to-[hsl(200,60%,18%)] text-primary">
          {/* Decorative starfield */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 18% 30%, rgba(255,255,255,0.6), transparent), radial-gradient(1.5px 1.5px at 70% 25%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,0.6), transparent), radial-gradient(2px 2px at 85% 75%, rgba(255,255,255,0.4), transparent)',
              backgroundSize: '120px 120px',
            }}
          />
          <div className="relative transition-transform duration-300 group-hover:scale-110">
            <PillarGlyph icon={icon} />
          </div>
        </div>
      )}

      {/* Bottom fade into the card body — keeps the title legible and ties the
          image into the panel surface instead of feeling like a hard rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card/95 to-transparent"
      />
    </div>
  );
}

function PillarGlyph({ icon }: { icon: PillarIcon }) {
  // Custom-built thin-line icons in the brand's primary tint.
  switch (icon) {
    case 'planet':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="24" cy="24" r="11" fill="currentColor" fillOpacity="0.18" />
          <circle cx="24" cy="24" r="11" />
          <ellipse cx="24" cy="24" rx="20" ry="5" transform="rotate(-15 24 24)" opacity="0.7" />
          <circle cx="38" cy="20" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'building':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 38V18l10-7 10 7v20" fill="currentColor" fillOpacity="0.15" />
          <path d="M14 38V18l10-7 10 7v20" />
          <path d="M14 38h20" />
          <path d="M22 38v-9h4v9" />
          <path d="M19 22h2M27 22h2M19 28h2M27 28h2" />
          <circle cx="24" cy="14" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'sword':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 14L24 24M14 14h6L34 28v6L20 20l-6-6zM34 14L24 24M34 14h-6L14 28v6l14-14 6-6z" fill="currentColor" fillOpacity="0.15" />
          <path d="M14 14L24 24M14 14h6L34 28v6L20 20l-6-6z" />
          <path d="M34 14L24 24M34 14h-6L14 28v6l14-14 6-6z" />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M24 8l13 5v9c0 9-6 16-13 18-7-2-13-9-13-18v-9l13-5z" fill="currentColor" fillOpacity="0.15" />
          <path d="M24 8l13 5v9c0 9-6 16-13 18-7-2-13-9-13-18v-9l13-5z" />
          <path d="M19 23l4 4 7-8" />
        </svg>
      );
    case 'rocket':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M24 4c8 6 12 14 12 22 0 4-2 8-4 10l-8-4-8 4c-2-2-4-6-4-10 0-8 4-16 12-22z" fill="currentColor" fillOpacity="0.15" />
          <path d="M24 4c8 6 12 14 12 22 0 4-2 8-4 10l-8-4-8 4c-2-2-4-6-4-10 0-8 4-16 12-22z" />
          <circle cx="24" cy="20" r="3" />
          <path d="M16 38l2 6 6-2M32 38l-2 6-6-2" />
        </svg>
      );
    case 'globe':
      return (
        <svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="24" cy="24" r="14" fill="currentColor" fillOpacity="0.15" />
          <circle cx="24" cy="24" r="14" />
          <ellipse cx="24" cy="24" rx="6" ry="14" />
          <path d="M10 24h28" />
        </svg>
      );
  }
}
