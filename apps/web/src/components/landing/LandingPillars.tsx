import { Clock, Globe, Rocket } from 'lucide-react';

interface Pillar {
  title: string;
  body: string;
  icon: React.ReactNode;
}

const PILLARS: Pillar[] = [
  {
    title: 'Un empire à votre mesure',
    body:
      "Des mondes à coloniser, trois ressources à équilibrer, des dizaines de bâtiments à faire monter. Construisez une économie qui tient la route.",
    icon: <Globe className="h-7 w-7" strokeWidth={1.5} />,
  },
  {
    title: 'Flottes, combat, diplomatie',
    body:
      "Concevez vos flottes, lancez des attaques, défendez vos planètes. Rejoignez une alliance ou formez la vôtre. La galaxie est peuplée de vrais joueurs.",
    icon: <Rocket className="h-7 w-7" strokeWidth={1.5} />,
  },
  {
    title: 'Le jeu respecte votre temps',
    body:
      "Queues longues, production persistante, notifications précises. 5 minutes de bonnes décisions valent mieux que 4 heures de clics.",
    icon: <Clock className="h-7 w-7" strokeWidth={1.5} />,
  },
];

export function LandingPillars() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
        {PILLARS.map((p) => (
          <article key={p.title} className="glass-card p-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {p.icon}
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">{p.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
