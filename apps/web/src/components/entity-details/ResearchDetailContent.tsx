import { getResearchDetails, resolveBuildingName, resolveResearchName, type ResearchDetails } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ResourceCost } from '@/components/common/ResourceCost';
import { DetailSection } from '@/components/common/EntityDetailOverlay';

export function ResearchDetailContent({ researchId }: { researchId: string }) {
  const { data: gameConfig } = useGameConfig();
  const details: ResearchDetails = getResearchDetails(researchId, gameConfig ?? undefined);

  const hasBuildingPrereqs = details.prerequisites.buildings && details.prerequisites.buildings.length > 0;
  const hasResearchPrereqs = details.prerequisites.research && details.prerequisites.research.length > 0;

  return (
    <>
      <p className="text-sm italic text-muted-foreground">{details.flavorText}</p>

      <DetailSection title="Effet en jeu">
        <p className="text-sm text-muted-foreground">{details.effect}</p>
      </DetailSection>

      <DetailSection title="Cout de base">
        <ResourceCost
          minerai={details.baseCost.minerai}
          silicium={details.baseCost.silicium}
          hydrogene={details.baseCost.hydrogene}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Facteur de cout : x{details.costFactor} par niveau
        </p>
      </DetailSection>

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
