import { Globe, ArrowUpDown, Sparkles, Eye } from 'lucide-react';
import { FacilityHelpSection } from '@/components/common/FacilityHelp';

/**
 * Pedagogical help shown when the player clicks the avatar in the Empire
 * hero. Explains the Empire dashboard at a glance: what the page shows, the
 * KPI bar, view modes, and reordering.
 */
export function EmpireHelp() {
  return (
    <>
      <div className="relative -mx-5 -mt-5 overflow-hidden rounded-t-lg">
        <div className="h-40 w-full bg-gradient-to-br from-indigo-900/70 via-cyan-900/50 to-purple-900/70" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 18% 30%, rgba(255,255,255,0.7), transparent), ' +
              'radial-gradient(1.5px 1.5px at 62% 50%, rgba(255,255,255,0.55), transparent), ' +
              'radial-gradient(1px 1px at 80% 22%, rgba(255,255,255,0.6), transparent), ' +
              'radial-gradient(2px 2px at 40% 75%, rgba(255,255,255,0.45), transparent)',
            backgroundSize: '120px 120px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <div className="absolute bottom-3 left-5">
          <p className="text-sm font-semibold text-foreground">Vue d'ensemble de votre empire</p>
        </div>
      </div>

      <FacilityHelpSection
        icon={<Globe className="h-3.5 w-3.5 text-cyan-400" />}
        title="Toutes vos colonies, en un coup d'œil"
      >
        Cette page agrège <span className="text-foreground font-medium">l'ensemble de vos planètes</span>.
        Chaque carte présente la production, les stocks, la flotte stationnée et l'état des files —
        sans avoir à entrer dans chaque planète.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Sparkles className="h-3.5 w-3.5 text-energy" />}
        title="Bandeau d'indicateurs"
      >
        Le bandeau du haut résume l'<span className="text-foreground font-medium">empire entier</span> :
        production cumulée, flottes en mission, attaques entrantes, capacité de gouvernance.
        C'est votre tableau de bord de capitaine.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Eye className="h-3.5 w-3.5 text-violet-400" />}
        title="Modes d'affichage"
      >
        Le sélecteur permet de basculer la grille entre <span className="text-foreground font-medium">ressources</span>,
        <span className="text-foreground font-medium"> flottes</span> et autres vues — pour focaliser
        l'écran sur ce qui vous intéresse au moment où vous regardez.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<ArrowUpDown className="h-3.5 w-3.5 text-emerald-400" />}
        title="Réorganiser"
      >
        À partir de deux colonies, le bouton <span className="text-foreground font-medium">Réorganiser</span>
        permet de glisser-déposer vos planètes dans l'ordre que vous voulez. L'ordre choisi est
        sauvegardé et sert partout où la liste apparaît.
      </FacilityHelpSection>
    </>
  );
}
