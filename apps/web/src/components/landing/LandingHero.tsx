import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LandingHero() {
  const handleSecondaryClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('connexion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative overflow-hidden">
      <img
        aria-hidden
        src="/assets/landing/planet-hero.webp"
        alt=""
        loading="lazy"
        fetchPriority="low"
        width={1600}
        height={1000}
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-[1.08] object-cover"
        style={{ filter: 'blur(18px) brightness(0.45)' }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-background/60" />

      <div className="mx-auto flex min-h-[85vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-primary/80">Stratégie spatiale</p>
        <h1
          className="text-4xl font-extrabold leading-[1.05] text-foreground sm:text-6xl"
          aria-label="Bâtissez votre empire spatial"
        >
          Bâtissez votre
          <br />
          <span className="glow-silicium">empire spatial.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
          Colonisez des mondes, commandez des flottes, forgez des alliances. Stratégie profonde au
          rythme qui vous convient — votre empire tourne même hors ligne.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link
            to="/register"
            className={cn(buttonVariants({ size: 'lg' }), 'min-w-[220px]')}
          >
            Fonder votre empire
          </Link>
          <a
            href="#connexion"
            onClick={handleSecondaryClick}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            J'ai déjà un compte
          </a>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
      />
    </section>
  );
}
