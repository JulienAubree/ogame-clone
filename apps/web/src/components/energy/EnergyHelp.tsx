import { getPlanetImageUrl } from '@/lib/assets';
import { FacilityHelpSection } from '@/components/common/FacilityHelp';

interface EnergyHelpProps {
  planetName: string;
  planetClassId?: string | null;
  planetImageIndex?: number | null;
}

export function EnergyHelp({ planetName, planetClassId, planetImageIndex }: EnergyHelpProps) {
  const hasImage = !!planetClassId && planetImageIndex != null;
  return (
    <>
      <div className="relative -mx-5 -mt-5 overflow-hidden rounded-t-lg">
        {hasImage ? (
          <img
            src={getPlanetImageUrl(planetClassId!, planetImageIndex!)}
            alt=""
            className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-indigo-950 via-purple-900/60 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute bottom-3 left-5 right-5">
          <p className="text-sm font-semibold text-foreground truncate">{planetName}</p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Gestion de l'énergie</p>
        </div>
      </div>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        }
        title="Production"
      >
        Deux sources alimentent votre planète&nbsp;: la <span className="text-foreground font-medium">Centrale solaire</span> (bâtiment) et les <span className="text-foreground font-medium">Satellites solaires</span> (vaisseaux stationnaires). Le rendement des satellites dépend de la <span className="text-foreground font-medium">température maximale</span> de la planète — plus il fait chaud, plus ils produisent — avec un bonus sur la planète-mère.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-400">
            <path d="M6 3v12a6 6 0 0 0 12 0V3" />
            <path d="M6 3h12" />
            <path d="M9 21h6" />
          </svg>
        }
        title="Consommation"
      >
        Les <span className="text-foreground font-medium">mines</span> (minerai, silicium, hydrogène) et le <span className="text-foreground font-medium">synthétiseur H₂</span> consomment de l'énergie proportionnellement à leur niveau. Si le <span className="text-foreground font-medium">Bouclier planétaire</span> est construit, il consomme également pour maintenir son champ de force prêt.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-400">
            <path d="M12 2v6" />
            <path d="M12 22v-2" />
            <path d="M2 12h6" />
            <path d="M16 12h6" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        }
        title="Facteur de production"
      >
        Quand la <span className="text-foreground font-medium">consommation dépasse la production</span>, toutes les productions de ressources sont réduites proportionnellement. La barre d'énergie en haut affiche le ratio actuel&nbsp;: tant qu'elle reste verte, vous tournez à plein régime.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        }
        title="Réglage par bâtiment"
      >
        Chaque consommateur peut tourner de <span className="text-foreground font-medium">0 à 100&nbsp;%</span> de sa puissance nominale via son curseur. Baisser la puissance réduit d'autant la consommation <span className="text-foreground font-medium">et</span> la production — pratique pour éviter un déficit sans désactiver un bâtiment en entier.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M12 2L3 6v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V6l-9-4z" />
          </svg>
        }
        title="Bouclier planétaire"
      >
        Sa puissance est réglable indépendamment. À <span className="text-foreground font-medium">100&nbsp;%</span>, sa capacité de blocage est maximale&nbsp;; en dessous, vous économisez de l'énergie mais le bouclier absorbe moins de dégâts par round de combat.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M12 2a10 10 0 1 0 10 10" />
            <path d="M12 6v6l4 2" />
          </svg>
        }
        title="Bonus de type et biomes"
      >
        Le <span className="text-foreground font-medium">type de planète</span> et les <span className="text-foreground font-medium">biomes</span> découverts modifient la production de ressources (pas directement l'énergie). Les bonus cumulés sont visibles en haut de la page, avec le détail par source.
      </FacilityHelpSection>
    </>
  );
}
