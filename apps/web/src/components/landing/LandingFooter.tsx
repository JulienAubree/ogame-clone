import { Link } from 'react-router';

export function LandingFooter() {
  return (
    <footer className="border-t border-white/5 bg-background/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <span>Exilium © {new Date().getFullYear()}</span>
        <nav className="flex items-center gap-5">
          <Link to="/changelog" className="hover:text-primary transition-colors">
            Patchnotes
          </Link>
        </nav>
      </div>
    </footer>
  );
}
