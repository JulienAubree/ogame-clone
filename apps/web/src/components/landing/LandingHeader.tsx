import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';
import { ExiliumLogo } from './ExiliumLogo';
import { useAuthStore } from '@/stores/auth.store';
import type { HomepageContent } from './useHomepageContent';

interface LandingHeaderProps {
  content: HomepageContent;
}

type NavItem = HomepageContent['nav']['items'][number];

export function LandingHeader({ content }: LandingHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = content.nav.items;
  // Authenticated users get a "Mon empire" CTA jumping straight back to the
  // game; unauthenticated users see the admin-configured "Inscription bêta".
  const ctaLabel = isAuthenticated ? 'Mon empire' : content.hero.primaryCta.label;
  const ctaHref = isAuthenticated ? '/empire' : content.hero.primaryCta.href;

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-white/5 bg-background/80 backdrop-blur-xl'
          : 'bg-gradient-to-b from-background/40 to-transparent',
      ].join(' ')}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-10">
        <Link to="/" aria-label="Accueil Exilium" className="flex items-center">
          <ExiliumLogo className="h-6 sm:h-7" />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navItems.map((item: NavItem) => (
            <NavItem key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          {!isAuthenticated && (
            <Link
              to="/login"
              className="text-xs font-medium uppercase tracking-[0.2em] text-foreground/70 transition-colors hover:text-foreground"
            >
              Connexion
            </Link>
          )}
          <CtaLink href={ctaHref}>{ctaLabel}</CtaLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 hover:bg-white/5 lg:hidden"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-white/5 bg-background/95 backdrop-blur-xl lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
            {navItems.map((item: NavItem) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm uppercase tracking-wider text-foreground/80 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
            {!isAuthenticated && (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-md px-3 py-2 text-sm uppercase tracking-wider text-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Connexion
              </Link>
            )}
            <Link
              to={ctaHref}
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {ctaLabel}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavItem({ href, label }: { href: string; label: string }) {
  const isInternal = href.startsWith('/');
  const className =
    'group relative text-xs font-medium uppercase tracking-[0.2em] text-foreground/70 transition-colors hover:text-foreground';
  const content = (
    <>
      {label}
      <span className="absolute -bottom-1 left-1/2 h-px w-0 -translate-x-1/2 bg-primary transition-all duration-300 group-hover:w-full" />
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

function CtaLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const className =
    'inline-flex items-center justify-center rounded-md border border-primary/40 bg-transparent px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-primary transition-all duration-200 hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_20px_-4px_hsl(200,85%,65%,0.6)]';
  if (isInternal) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
