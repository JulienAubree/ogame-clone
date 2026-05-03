import { useState } from 'react';

interface AnimatedHeroBackgroundProps {
  src: string;
  /**
   * Visual intensity:
   * - "full" → for the public landing hero (Ken Burns + multiple shooting stars + beam)
   * - "subtle" → for /login & /register (soft pan + scattered twinkles only,
   *   so the form stays the focus).
   */
  intensity?: 'full' | 'subtle';
  /**
   * Vignette style:
   * - "linear" → side-darkened cinema bar (better when content sits left)
   * - "radial" → centered darken (better when content sits centered, e.g. forms)
   */
  vignette?: 'linear' | 'radial';
}

/**
 * Animated key-art layer for the landing & auth pages. Stack:
 *   1. Image (Ken Burns) or animated nebula fallback if the image fails.
 *   2. Shooting stars (1 in subtle, 3 in full).
 *   3. Twinkling starfield overlay.
 *   4. Light beam sweeping across the hero (full only).
 *   5. Cinematic vignette darken (radial or linear).
 *
 * All animations honor `prefers-reduced-motion`.
 */
export function AnimatedHeroBackground({
  src,
  intensity = 'full',
  vignette = 'linear',
}: AnimatedHeroBackgroundProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;
  const isFull = intensity === 'full';

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {/* Layer 1: image with Ken Burns OR animated nebula fallback */}
      {showImage ? (
        <img
          src={src}
          alt=""
          aria-hidden
          loading="eager"
          fetchPriority="high"
          className="animate-hero-kenburns absolute inset-0 h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <NebulaFallback />
      )}

      {/* Layer 2: shooting stars */}
      <ShootingStar
        className="absolute left-[5%] top-[10%] h-[2px] w-[120px]"
        delay="0s"
      />
      {isFull && (
        <>
          <ShootingStar
            className="absolute left-[35%] top-[5%] h-[2px] w-[160px]"
            delay="-3.5s"
          />
          <ShootingStar
            className="absolute left-[60%] top-[20%] h-[2px] w-[100px]"
            delay="-6s"
          />
        </>
      )}

      {/* Layer 3: twinkling starfield overlay */}
      <Starfield />

      {/* Layer 4: light beam */}
      {isFull && (
        <div
          aria-hidden
          className="animate-hero-beam pointer-events-none absolute inset-y-0 -left-[50%] w-[40%] bg-gradient-to-r from-transparent via-white/10 to-transparent"
        />
      )}

      {/* Layer 5: vignette */}
      <div
        aria-hidden
        className="animate-hero-vignette pointer-events-none absolute inset-0"
        style={{
          background:
            vignette === 'radial'
              ? 'radial-gradient(60% 60% at 50% 50%, hsla(220,55%,3%,0.85) 0%, hsla(220,55%,3%,0.55) 80%, hsla(220,55%,3%,0.35) 100%)'
              : 'linear-gradient(90deg, hsla(220,55%,3%,0.85) 0%, hsla(220,55%,3%,0.5) 35%, hsla(220,55%,3%,0.3) 65%, hsla(220,55%,3%,0.55) 100%)',
        }}
      />
      {vignette === 'radial' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, hsla(220,55%,3%,0.4) 0%, transparent 30%, transparent 70%, hsla(220,55%,3%,0.4) 100%)',
          }}
        />
      )}
      {vignette === 'linear' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(80% 60% at 50% 40%, transparent 0%, hsla(220,55%,3%,0.5) 100%)',
          }}
        />
      )}
    </div>
  );
}

/** Single shooting star streak that re-fires on a 9s cadence. */
function ShootingStar({ className, delay }: { className: string; delay: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{ animationDelay: delay }}
    >
      <div
        className="animate-shooting-star h-full w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, hsla(195, 100%, 95%, 0.8) 60%, hsla(195, 100%, 95%, 0) 100%)',
          boxShadow: '0 0 6px 1px hsla(195, 100%, 95%, 0.6)',
          borderRadius: '999px',
          animationDelay: delay,
        }}
      />
    </div>
  );
}

/**
 * Procedural starfield overlay — three layers of stars with different
 * twinkle speeds + opacities so the field never feels uniform.
 */
function Starfield() {
  return (
    <>
      <div
        aria-hidden
        className="animate-star-twinkle pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.7), transparent), ' +
            'radial-gradient(1.5px 1.5px at 28% 65%, rgba(255,255,255,0.6), transparent), ' +
            'radial-gradient(1px 1px at 55% 18%, rgba(255,255,255,0.5), transparent), ' +
            'radial-gradient(1px 1px at 70% 42%, rgba(255,255,255,0.7), transparent), ' +
            'radial-gradient(2px 2px at 85% 78%, rgba(255,255,255,0.5), transparent)',
          backgroundSize: '320px 320px',
        }}
      />
      <div
        aria-hidden
        className="animate-star-twinkle-slow pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 8% 80%, rgba(255,255,255,0.55), transparent), ' +
            'radial-gradient(1.2px 1.2px at 45% 35%, rgba(255,255,255,0.5), transparent), ' +
            'radial-gradient(1px 1px at 78% 12%, rgba(255,255,255,0.6), transparent), ' +
            'radial-gradient(1.5px 1.5px at 92% 60%, rgba(255,255,255,0.45), transparent)',
          backgroundSize: '260px 260px',
        }}
      />
      <div
        aria-hidden
        className="animate-star-twinkle-fast pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 22% 50%, rgba(255,255,255,0.7), transparent), ' +
            'radial-gradient(1px 1px at 65% 88%, rgba(255,255,255,0.55), transparent), ' +
            'radial-gradient(1.5px 1.5px at 88% 25%, rgba(255,255,255,0.6), transparent)',
          backgroundSize: '380px 380px',
        }}
      />
    </>
  );
}

/** Animated nebula used when no image is uploaded yet — three breathing blobs. */
function NebulaFallback() {
  return (
    <div className="absolute inset-0 bg-background">
      <div
        aria-hidden
        className="animate-nebula-breathe absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 70% 35%, hsla(280, 60%, 35%, 0.55) 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="animate-nebula-breathe absolute inset-0"
        style={{
          animationDelay: '-3s',
          background:
            'radial-gradient(50% 40% at 20% 60%, hsla(200, 80%, 45%, 0.45) 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="animate-nebula-breathe absolute inset-0"
        style={{
          animationDelay: '-6s',
          background:
            'radial-gradient(40% 30% at 50% 80%, hsla(180, 60%, 35%, 0.35) 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, hsl(220, 55%, 6%) 0%, hsl(220, 55%, 3%) 100%)',
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  );
}
