import { LayoutGrid, Sun, XCircle } from 'lucide-react';
import { FacilityHelp, FacilityHelpSection } from '@/components/common/FacilityHelp';
import { ClockIcon } from '@/components/icons/utility-icons';

interface ShipyardHelpProps {
  level: number;
}

export function ShipyardHelp({ level }: ShipyardHelpProps) {
  return (
    <FacilityHelp buildingId="shipyard" level={level}>
      <FacilityHelpSection
        icon={<LayoutGrid className="h-3.5 w-3.5 text-cyan-400" />}
        title="Rôles de mission"
      >
        Les vaisseaux sont regroupés par rôle&nbsp;: <span className="text-foreground font-medium">transport</span>,
        <span className="text-foreground font-medium"> minier</span>, <span className="text-foreground font-medium">recyclage</span>,
        <span className="text-foreground font-medium"> colonisation</span>, <span className="text-foreground font-medium">exploration</span>,
        <span className="text-foreground font-medium"> espionnage</span> et <span className="text-foreground font-medium">énergie</span>.
        Les vaisseaux de combat sont construits au Centre de commandement.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<Sun className="h-3.5 w-3.5 text-amber-400" />}
        title="Slots parallèles"
      >
        Par défaut, vous disposez d'un seul slot de production. Les <span className="text-foreground font-medium">talents industriels</span> (<span className="text-foreground font-medium">Production parallèle</span>) débloquent des slots supplémentaires, permettant d'assembler plusieurs vaisseaux simultanément.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={
          <ClockIcon width={14} height={14} className="text-emerald-400" />
        }
        title="File d'attente"
      >
        Les vaisseaux en surplus des slots actifs sont <span className="text-foreground font-medium">mis en file</span> et démarrent dès qu'un slot se libère.
        Utilisez <span className="text-foreground font-medium">-1</span> pour retirer une unité d'un lot, ou <span className="text-foreground font-medium">Annuler</span> pour tout arrêter.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<XCircle className="h-3.5 w-3.5 text-destructive" />}
        title="Annulation"
      >
        Annuler un lot rembourse les ressources au <span className="text-foreground font-medium">prorata du temps restant</span>, plafonné à <span className="text-foreground font-medium">70&nbsp;%</span>.
        Les vaisseaux déjà produits sont conservés dans votre hangar.
      </FacilityHelpSection>
    </FacilityHelp>
  );
}
