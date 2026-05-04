import { Sparkles, Star, Crosshair, Wrench, Layers, Shield, FlaskConical, Sword } from 'lucide-react';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { FacilityHelpSection } from '@/components/common/FacilityHelp';

interface FlagshipHelpProps {
  open: boolean;
  onClose: () => void;
}

/**
 * V8-FlagshipRework : aide modale ouverte au clic sur le rond image du
 * FlagshipHero. Pattern aligné sur ResearchHelp / ShipyardHelp / etc.
 */
export function FlagshipHelp({ open, onClose }: FlagshipHelpProps) {
  return (
    <EntityDetailOverlay open={open} onClose={onClose} title="Vaisseau amiral">
      <FacilityHelpSection
        icon={<Sparkles className="h-3.5 w-3.5 text-violet-400" />}
        title="Rôle"
      >
        Votre vaisseau amiral est l'<span className="text-foreground font-medium">avatar de combat</span> de votre empire. Il s'engage seul dans les <span className="text-foreground font-medium">anomalies gravitationnelles</span> (rogue-lite à profondeur croissante) et débloque des <span className="text-foreground font-medium">missions spécialisées</span> selon sa coque (minage, recyclage, scan, exploration).
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Layers className="h-3.5 w-3.5 text-cyan-400" />}
        title="Coques"
      >
        Trois familles, chacune avec son rôle&nbsp;:
        <span className="block mt-1.5 space-y-0.5">
          <span className="block"><span className="text-red-400 font-medium">Combat</span> — armement+, blindage+, profil de tir agressif (anti-medium / rafales / cascade).</span>
          <span className="block"><span className="text-amber-400 font-medium">Industrielle</span> — coque robuste, missions de minage et recyclage de débris.</span>
          <span className="block"><span className="text-cyan-400 font-medium">Scientifique</span> — vitesse, capacités scan/exploration, missions de découverte.</span>
        </span>
        Le bouton <span className="text-foreground font-medium">Coque</span> en haut permet de changer de coque (cooldown + coût d'Exilium selon config).
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Shield className="h-3.5 w-3.5 text-sky-400" />}
        title="Modules passifs"
      >
        Neuf slots passifs au total&nbsp;: <span className="text-foreground font-medium">1 épique</span>, <span className="text-foreground font-medium">3 rares</span>, <span className="text-foreground font-medium">5 communs</span>. Ils apportent des bonus de stat (coque, bouclier, blindage, dégâts), des effets <span className="text-foreground font-medium">conditionnels</span> (premier round, coque basse, FP ennemi élevé) ou des <span className="text-foreground font-medium">capacités actives</span> consommant des charges épiques (réparation, surcharge, bouclier, scan).
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Crosshair className="h-3.5 w-3.5 text-orange-400" />}
        title="Arsenal"
      >
        Trois slots d'arme indépendants des passives&nbsp;: <span className="text-foreground font-medium">1 commun</span>, <span className="text-foreground font-medium">1 rare</span>, <span className="text-foreground font-medium">1 épique</span>. Chaque arme ajoute un <span className="text-foreground font-medium">profil de tir</span> distinct (dégâts, nombre de tirs, cible privilégiée, rafale, cascade) qui se cumule avec celui de la coque. Le combat tire avec <span className="text-foreground font-medium">tous</span> les profils par tour.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Star className="h-3.5 w-3.5 text-yellow-400" />}
        title="XP & niveau pilote"
      >
        Le vaisseau gagne de l'XP en fin de combat (proportionnel au FP ennemi tué) et en fin de run (bonus profondeur). Chaque niveau ajoute <span className="text-foreground font-medium">+5&nbsp;%</span> aux stats combat (armement, bouclier, coque, blindage). Cap actuel&nbsp;: <span className="text-foreground font-medium">niveau 60</span>.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<FlaskConical className="h-3.5 w-3.5 text-emerald-400" />}
        title="Recherche"
      >
        Les recherches <span className="text-foreground font-medium">armement</span>, <span className="text-foreground font-medium">bouclier</span> et <span className="text-foreground font-medium">blindage</span> s'appliquent sur les stats finales. Le bloc «&nbsp;Stats de combat&nbsp;» à droite affiche les chiffres exacts utilisés en anomalie (niveau × coque × modules × recherches).
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Wrench className="h-3.5 w-3.5 text-amber-400" />}
        title="Statuts"
      >
        <span className="text-emerald-400 font-medium">Opérationnel</span> = prêt à engager. <span className="text-blue-400 font-medium">En mission</span> = parti en flotte ou anomalie active. <span className="text-red-400 font-medium">Incapacité</span> = wipe en anomalie, immobilisé jusqu'à réparation (instant via Exilium ou attente). <span className="text-amber-400 font-medium">Refit</span> = changement de coque en cours.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Sword className="h-3.5 w-3.5 text-red-400" />}
        title="Combat anomalie"
      >
        En anomalie, votre flagship part <span className="text-foreground font-medium">seul</span>. Pas de flotte d'escorte&nbsp;: ce sont vos <span className="text-foreground font-medium">modules</span>, votre <span className="text-foreground font-medium">arsenal</span> et vos <span className="text-foreground font-medium">charges épiques</span> qui font la différence. Un wipe = perte du run + 30&nbsp;min d'incapacitation. Un retour volontaire conserve le butin.
      </FacilityHelpSection>
    </EntityDetailOverlay>
  );
}
