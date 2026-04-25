import { Shield, ShieldCheck, AlertCircle, XCircle } from 'lucide-react';
import { FacilityHelp, FacilityHelpSection } from '@/components/common/FacilityHelp';

interface ArsenalHelpProps {
  level: number;
}

export function ArsenalHelp({ level }: ArsenalHelpProps) {
  return (
    <FacilityHelp buildingId="arsenal" level={level}>
      <FacilityHelpSection
        icon={<Shield className="h-3.5 w-3.5 text-cyan-400" />}
        title="Rôle"
      >
        L'Arsenal produit les <span className="text-foreground font-medium">défenses planétaires</span> qui protègent votre colonie contre les flottes hostiles. Chaque niveau débloque ou améliore certaines défenses.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
        title="Défenses stationnaires"
      >
        Les défenses ne peuvent pas être envoyées en mission. En cas d'attaque, elles combattent automatiquement aux côtés de la flotte présente sur la planète.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<ShieldCheck className="h-3.5 w-3.5 text-primary" />}
        title="Bouclier planétaire"
      >
        S'il est construit, le Bouclier planétaire forme un <span className="text-foreground font-medium">champ de force indestructible</span> qui se régénère à chaque round de combat. Tant qu'il tient, vos défenses restent intouchables. Sa puissance est réglable depuis les paramètres d'énergie.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<AlertCircle className="h-3.5 w-3.5 text-amber-400" />}
        title="Maximum par planète"
      >
        Certaines défenses sont plafonnées en nombre sur chaque planète. Le compteur <span className="text-foreground font-medium">x{'{n}'} / {'{max}'}</span> indique la quantité déjà construite et le plafond. Les unités en file comptent dans le plafond.
      </FacilityHelpSection>

      <FacilityHelpSection
        icon={<XCircle className="h-3.5 w-3.5 text-destructive" />}
        title="Annulation"
      >
        Annuler un lot rembourse les ressources au <span className="text-foreground font-medium">prorata du temps restant</span>, plafonné à <span className="text-foreground font-medium">70&nbsp;%</span>. Les unités déjà produites sont conservées.
      </FacilityHelpSection>
    </FacilityHelp>
  );
}
