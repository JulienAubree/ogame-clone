import { Layers, Swords, Sun, XCircle } from 'lucide-react';
import { FacilityHelp, FacilityHelpSection } from '@/components/common/FacilityHelp';
import { ClockIcon } from '@/components/icons/utility-icons';

interface CommandCenterHelpProps {
  level: number;
}

export function CommandCenterHelp({ level }: CommandCenterHelpProps) {
  return (
    <FacilityHelp buildingId="commandCenter" level={level}>
      <FacilityHelpSection
        icon={<Layers className="h-3.5 w-3.5 text-cyan-400" />}
        title="Rôle"
      >
        Le Centre de commandement assemble les <span className="text-foreground font-medium">vaisseaux militaires</span> de votre empire&nbsp;: intercepteurs, frégates, croiseurs et cuirassés. Les vaisseaux industriels (transport, prospecteurs, sondes…) sont produits au <span className="text-foreground font-medium">Chantier spatial</span>.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Swords className="h-3.5 w-3.5 text-rose-400" />}
        title="Classes de combat"
      >
        Chaque niveau du Centre débloque ou améliore des unités&nbsp;: <span className="text-foreground font-medium">légères</span> (intercepteur), <span className="text-foreground font-medium">moyennes</span> (frégate) et <span className="text-foreground font-medium">lourdes</span> (croiseur, cuirassé). Les classes plus lourdes exigent une recherche en propulsion avancée.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Sun className="h-3.5 w-3.5 text-amber-400" />}
        title="Slots parallèles"
      >
        Par défaut, un seul slot de production est actif. Les <span className="text-foreground font-medium">talents militaires</span> (<span className="text-foreground font-medium">Production parallèle militaire</span>) débloquent des slots supplémentaires.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <ClockIcon width={14} height={14} className="text-emerald-400" />
        }
        title="File d'attente"
      >
        Les vaisseaux en surplus des slots actifs sont <span className="text-foreground font-medium">mis en file</span> et démarrent dès qu'un slot se libère. Utilisez <span className="text-foreground font-medium">-1</span> pour retirer une unité d'un lot, ou <span className="text-foreground font-medium">Annuler</span> pour tout arrêter.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<XCircle className="h-3.5 w-3.5 text-destructive" />}
        title="Annulation"
      >
        Annuler un lot rembourse les ressources au <span className="text-foreground font-medium">prorata du temps restant</span>, plafonné à <span className="text-foreground font-medium">70&nbsp;%</span>. Les vaisseaux déjà produits sont conservés dans votre hangar.
      </FacilityHelpSection>
    </FacilityHelp>
  );
}
