import { getBuildingDetails, resolveBuildingName, type BuildingDetails, type PlanetContext } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ResourceCost } from '@/components/common/ResourceCost';
import { DetailSection, StatRow, DataTable } from '@/components/common/EntityDetailOverlay';

interface Props {
  buildingId: string;
  planetContext?: PlanetContext;
}

export function BuildingDetailContent({ buildingId, planetContext }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details: BuildingDetails = getBuildingDetails(buildingId, gameConfig ?? undefined, planetContext);

  return (
    <>
      <p className="text-sm italic text-muted-foreground">{details.flavorText}</p>

      <DetailSection title="Description">
        <p className="text-sm text-muted-foreground">{details.description}</p>
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

      {details.productionTable && details.productionLabel && (
        <DetailSection title={details.productionLabel}>
          <DataTable
            headers={['Niveau', 'Valeur/h']}
            rows={details.productionTable.map((r) => [r.level, r.value])}
          />
        </DetailSection>
      )}

      {details.energyTable && details.energyLabel && (
        <DetailSection title={details.energyLabel}>
          <DataTable
            headers={['Niveau', 'Energie']}
            rows={details.energyTable.map((r) => [r.level, r.value])}
          />
        </DetailSection>
      )}

      {details.storageTable && (
        <DetailSection title="Capacite de stockage">
          <DataTable
            headers={['Niveau', 'Capacite']}
            rows={details.storageTable.map((r) => [r.level, r.value])}
          />
        </DetailSection>
      )}

      {details.prerequisites.length > 0 && (
        <DetailSection title="Prerequis">
          <ul className="space-y-1">
            {details.prerequisites.map((p) => (
              <li key={p.buildingId} className="text-sm text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {resolveBuildingName(p.buildingId, gameConfig ?? undefined)} niveau {p.level}
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </>
  );
}
