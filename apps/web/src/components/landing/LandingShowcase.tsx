interface ShowcaseItem {
  src: string;
  alt: string;
  title: string;
  body: string;
}

const ITEMS: ShowcaseItem[] = [
  {
    src: '/assets/landing/overview.webp',
    alt: "Aperçu de la page Vue d'ensemble d'Exilium",
    title: 'Une planète, un coup d’œil',
    body:
      "Ressources, production, flotte stationnée, menaces en cours : tout ce qui compte sur un seul écran.",
  },
  {
    src: '/assets/landing/galaxy.webp',
    alt: 'Aperçu de la carte galactique',
    title: 'Explorez la galaxie',
    body:
      "Naviguez parmi les systèmes, repérez les voisins, planifiez vos prochaines colonies. La galaxie est vaste — et peuplée de vrais joueurs.",
  },
  {
    src: '/assets/landing/combat.webp',
    alt: 'Aperçu d’un rapport de combat',
    title: 'Reports détaillés, vraie simulation',
    body:
      "Chaque combat est résolu par un moteur déterministe : rounds, boucliers, rapid fire, débris. Les rapports expliquent exactement ce qui s’est passé.",
  },
];

export function LandingShowcase() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="space-y-16 sm:space-y-24">
        {ITEMS.map((item, idx) => {
          const reverse = idx % 2 === 1;
          return (
            <div
              key={item.src}
              className={`grid gap-8 sm:grid-cols-2 sm:items-center sm:gap-12 ${
                reverse ? 'sm:[&>*:first-child]:order-2' : ''
              }`}
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-card/50 shadow-lg">
                <img
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <h3 className="mb-3 text-xl font-semibold text-foreground sm:text-2xl">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {item.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
