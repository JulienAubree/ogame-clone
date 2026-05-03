import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { ExiliumLogo } from './ExiliumLogo';
import { AnimatedHeroBackground } from './AnimatedHeroBackground';
import { useHomepageContent } from './useHomepageContent';

interface AuthShellProps {
  /** Title above the form (e.g. "Reprendre la console"). */
  title: string;
  /** Small line above the title. */
  eyebrow: string;
  /** Form contents. */
  children: ReactNode;
  /** Footer slot — typically a "no account? sign up" / "have an account? log in" link. */
  footer?: ReactNode;
}

/**
 * Shared layout for /login and /register: full-bleed key-art background
 * (sourced from the same hero image as the landing) with a centered glass
 * panel containing the form.
 */
export function AuthShell({ title, eyebrow, children, footer }: AuthShellProps) {
  const content = useHomepageContent();
  const heroImage = content.hero.backgroundImage;

  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-background text-foreground">
      <AnimatedHeroBackground src={heroImage} intensity="subtle" vignette="radial" />

      {/* Top bar — minimal, just a back link to the landing + brand */}
      <header className="relative z-10 flex items-center justify-between px-4 py-5 sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </Link>
        <Link to="/" aria-label="Accueil Exilium" className="flex items-center">
          <ExiliumLogo className="h-5 sm:h-6" />
        </Link>
        <span className="w-[60px]" aria-hidden />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/70 p-7 shadow-[0_8px_60px_-8px_hsl(220,55%,3%,0.7)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 text-center">
            {eyebrow && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-primary">
                {eyebrow}
              </p>
            )}
            <h1 className="text-xl font-bold uppercase tracking-[0.18em] text-foreground sm:text-2xl">
              {title}
            </h1>
          </div>
          {children}
          {footer && <div className="mt-6 border-t border-white/5 pt-5 text-center text-sm">{footer}</div>}
        </div>
      </main>

      <footer className="relative z-10 px-4 py-5 text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground/60 sm:px-8">
        Exilium · Stratégie spatiale en bêta
      </footer>
    </div>
  );
}
