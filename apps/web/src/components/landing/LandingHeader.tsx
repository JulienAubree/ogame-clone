export function LandingHeader() {
  const handleConnectClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById('connexion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <span className="text-lg font-bold tracking-wide glow-silicium">EXILIUM</span>
        <a
          href="#connexion"
          onClick={handleConnectClick}
          className="text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          Connexion
        </a>
      </div>
    </header>
  );
}
