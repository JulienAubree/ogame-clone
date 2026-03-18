import { getDefenseDetails, resolveBuildingName, resolveResearchName, type DefenseDetails } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ResourceCost } from '@/components/common/ResourceCost';
import { DetailSection, StatRow } from '@/components/common/EntityDetailOverlay';

export function DefenseDetailContent({ defenseId }: { defenseId: string }) {
  const { data: gameConfig } = useGameConfig();
  const details: DefenseDetails = getDefenseDetails(defenseId, gameConfig ?? undefined);

  const hasBuildingPrereqs = details.prerequisites.buildings && details.prerequisites.buildings.length > 0;
  const hasResearchPrereqs = details.prerequisites.research && details.prerequisites.research.length > 0;

  return (
    <>
      <p className="text-sm italic text-muted-foreground">{details.flavorText}</p>

      <DetailSection title="Cout unitaire">
        <ResourceCost
          minerai={details.cost.minerai}
          silicium={details.cost.silicium}
          hydrogene={details.cost.hydrogene}
        />
      </DetailSection>

      <DetailSection title="Stats de combat">
        <div className="space-y-1">
          <StatRow label="Armes" value={details.combat.weapons} />
          <StatRow label="Bouclier" value={details.combat.shield} />
          <StatRow label="Coque" value={details.combat.armor} />
        </div>
      </DetailSection>

      {details.rapidFireFrom.length > 0 && (
        <DetailSection title="Tir rapide subi de">
          <ul className="space-y-1">
            {details.rapidFireFrom.map((rf) => (
              <li key={rf.unitId} className="text-sm text-muted-foreground flex items-center justify-between">
                <span>{rf.unitName}</span>
                <span className="font-mono text-red-400">x{rf.value}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {details.maxPerPlanet && (
        <DetailSection title="Limite">
          <p className="text-sm text-muted-foreground">
            Maximum {details.maxPerPlanet} par planete
          </p>
        </DetailSection>
      )}

      {(hasBuildingPrereqs || hasResearchPrereqs) && (
        <DetailSection title="Prerequis">
          <ul className="space-y-1">
            {details.prerequisites.buildings?.map((p) => (
              <li key={p.buildingId} className="text-sm text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {resolveBuildingName(p.buildingId, gameConfig ?? undefined)} niveau {p.level}
              </li>
            ))}
            {details.prerequisites.research?.map((p) => (
              <li key={p.researchId} className="text-sm text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                {resolveResearchName(p.researchId, gameConfig ?? undefined)} niveau {p.level}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}
