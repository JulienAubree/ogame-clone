import { FacilityHelp, FacilityHelpSection } from '@/components/common/FacilityHelp';

interface ResearchHelpProps {
  level: number;
}

export function ResearchHelp({ level }: ResearchHelpProps) {
  return (
    <FacilityHelp buildingId="researchLab" level={level}>
      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
            <path d="M9 3h6" />
            <path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
            <path d="M7.5 15h9" />
          </svg>
        }
        title="Rôle"
      >
        Le Laboratoire de recherche pilote tout le <span className="text-foreground font-medium">programme scientifique</span> de votre empire. Il se construit sur la <span className="text-foreground font-medium">planète-mère</span> uniquement et débloque les niveaux de recherche par paliers.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        }
        title="Domaines"
      >
        Les technologies sont regroupées par domaine&nbsp;: <span className="text-foreground font-medium">sciences</span>, <span className="text-foreground font-medium">propulsion</span>, <span className="text-foreground font-medium">combat</span> et <span className="text-foreground font-medium">défense</span>. Chaque domaine a ses prérequis de niveau et de bâtiments annexes.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        }
        title="Une recherche à la fois"
      >
        Votre empire ne peut mener qu'<span className="text-foreground font-medium">une recherche</span> simultanément. Démarrer une nouvelle technologie est bloqué tant qu'une recherche est en cours&nbsp;: annulez-la (remboursement proportionnel, plafonné à 70&nbsp;%) ou attendez la fin.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        }
        title="Vitesse de recherche"
      >
        La durée des recherches est réduite par plusieurs sources, cumulatives multiplicativement&nbsp;: le <span className="text-foreground font-medium">niveau du Laboratoire</span>, les <span className="text-foreground font-medium">laboratoires annexes</span> (Forge Volcanique, Bio-Laboratoire…), les <span className="text-foreground font-medium">biomes</span> découverts, certains <span className="text-foreground font-medium">talents</span> et la coque de votre <span className="text-foreground font-medium">vaisseau amiral</span>. Le total est affiché en haut&nbsp;; dépliez la carte pour voir le détail.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        }
        title="Laboratoires annexes"
      >
        Certains types de planètes (volcanique, tempérée, aride, glaciaire, gazeuse) permettent de construire un <span className="text-foreground font-medium">laboratoire annexe</span> spécialisé. Chaque niveau d'annexe augmente votre vitesse globale et débloque des recherches exclusives à ce biome.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        }
        title="Annulation"
      >
        Annuler une recherche rembourse les ressources au <span className="text-foreground font-medium">prorata du temps restant</span>, plafonné à <span className="text-foreground font-medium">70&nbsp;%</span>. Le niveau en cours n'est pas acquis tant que la recherche n'est pas terminée.
      </FacilityHelpSection>
    </FacilityHelp>
  );
}
