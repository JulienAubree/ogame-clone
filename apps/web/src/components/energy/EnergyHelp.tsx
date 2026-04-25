import { Beaker, Clock, Crosshair, Shield, SlidersVertical, Zap } from 'lucide-react';
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
        icon={<Zap className="h-3.5 w-3.5 text-amber-400" />}
        title="Production"
      >
        Deux sources alimentent votre planète&nbsp;: la <span className="text-foreground font-medium">Centrale solaire</span> (bâtiment) et les <span className="text-foreground font-medium">Satellites solaires</span> (vaisseaux stationnaires). Le rendement des satellites dépend de la <span className="text-foreground font-medium">température maximale</span> de la planète — plus il fait chaud, plus ils produisent — avec un bonus sur la planète-mère.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Beaker className="h-3.5 w-3.5 text-orange-400" />}
        title="Consommation"
      >
        Les <span className="text-foreground font-medium">mines</span> (minerai, silicium, hydrogène) et le <span className="text-foreground font-medium">synthétiseur H₂</span> consomment de l'énergie proportionnellement à leur niveau. Si le <span className="text-foreground font-medium">Bouclier planétaire</span> est construit, il consomme également pour maintenir son champ de force prêt.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Crosshair className="h-3.5 w-3.5 text-rose-400" />}
        title="Facteur de production"
      >
        Quand la <span className="text-foreground font-medium">consommation dépasse la production</span>, toutes les productions de ressources sont réduites proportionnellement. La barre d'énergie en haut affiche le ratio actuel&nbsp;: tant qu'elle reste verte, vous tournez à plein régime.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<SlidersVertical className="h-3.5 w-3.5 text-cyan-400" />}
        title="Réglage par bâtiment"
      >
        Chaque consommateur peut tourner de <span className="text-foreground font-medium">0 à 100&nbsp;%</span> de sa puissance nominale via son curseur. Baisser la puissance réduit d'autant la consommation <span className="text-foreground font-medium">et</span> la production — pratique pour éviter un déficit sans désactiver un bâtiment en entier.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Shield className="h-3.5 w-3.5 text-primary" />}
        title="Bouclier planétaire"
      >
        Sa puissance est réglable indépendamment. À <span className="text-foreground font-medium">100&nbsp;%</span>, sa capacité de blocage est maximale&nbsp;; en dessous, vous économisez de l'énergie mais le bouclier absorbe moins de dégâts par round de combat.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Clock className="h-3.5 w-3.5 text-emerald-400" />}
        title="Bonus de type et biomes"
      >
        Le <span className="text-foreground font-medium">type de planète</span> et les <span className="text-foreground font-medium">biomes</span> découverts modifient la production de ressources (pas directement l'énergie). Les bonus cumulés sont visibles en haut de la page, avec le détail par source.
      </FacilityHelpSection>
    </>
  );
}
