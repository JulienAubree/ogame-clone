import { getBuildingDetails, resolveBuildingName, type BuildingDetails, type PlanetContext } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { ResourceCost } from '@/components/common/ResourceCost';
import { GameImage } from '@/components/common/GameImage';
import { formatDuration } from '@/lib/format';
import { DetailSection, DataTable } from '@/components/common/EntityDetailOverlay';

interface RuntimeData {
  currentLevel: number;
  nextLevelCost: { minerai: number; silicium: number; hydrogene: number };
  nextLevelTime: number;
  isUpgrading: boolean;
  upgradeEndTime?: string | null;
}

interface Props {
  buildingId: string;
  planetContext?: PlanetContext;
  runtimeData?: RuntimeData;
}

export function BuildingDetailContent({ buildingId, planetContext, runtimeData }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details: BuildingDetails = getBuildingDetails(buildingId, gameConfig ?? undefined, planetContext);

  const currentProd = runtimeData && details.productionTable
    ? details.productionTable.find((r) => r.level === runtimeData.currentLevel)?.value
    : undefined;
  const nextProd = runtimeData && details.productionTable
    ? details.productionTable.find((r) => r.level === runtimeData.currentLevel + 1)?.value
    : undefined;

  return (
    <>
      {/* Hero image + stats area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
        {/* Hero image */}
        <div className="relative w-full overflow-hidden rounded-lg">
          <GameImage
            category="buildings"
            id={buildingId}
            size="full"
            alt={details.name}
            className="w-full h-36 lg:h-52 object-cover rounded-lg"
          />
        </div>

        {/* Stats panel */}
        <div className="space-y-3">
          <p className="text-sm italic text-muted-foreground">{details.flavorText}</p>

          {/* Current + Next level stat blocks */}
          {runtimeData && currentProd != null && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/30 border border-border p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                  Actuel
                </div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {currentProd.toLocaleString('fr-FR')}/h
                </div>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                  Niv.{runtimeData.currentLevel + 1}
                </div>
                <div className="text-lg font-mono font-bold text-emerald-400">
                  {nextProd != null ? `${nextProd.toLocaleString('fr-FR')}/h` : '—'}
                </div>
                {nextProd != null && currentProd != null && (
                  <div className="text-xs font-mono text-emerald-400/70">
                    +{(nextProd - currentProd).toLocaleString('fr-FR')}/h
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Costs + duration */}
          {runtimeData && (
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                Coût amélioration
              </div>
              <ResourceCost
                minerai={runtimeData.nextLevelCost.minerai}
                silicium={runtimeData.nextLevelCost.silicium}
                hydrogene={runtimeData.nextLevelCost.hydrogene}
              />
              <div className="text-xs text-muted-foreground font-mono">
                ⏱ {formatDuration(runtimeData.nextLevelTime)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <DetailSection title="Description">
        <p className="text-sm text-muted-foreground">{details.description}</p>
      </DetailSection>

      <DetailSection title="Coût de base">
        <ResourceCost
          minerai={details.baseCost.minerai}
          silicium={details.baseCost.silicium}
          hydrogene={details.baseCost.hydrogene}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Facteur de coût : x{details.costFactor} par niveau
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
            headers={['Niveau', 'Énergie']}
            rows={details.energyTable.map((r) => [r.level, r.value])}
          />
        </DetailSection>
      )}

      {details.storageTable && (
        <DetailSection title="Capacité de stockage">
          <DataTable
            headers={['Niveau', 'Capacité']}
            rows={details.storageTable.map((r) => [r.level, r.value])}
          />
        </DetailSection>
      )}

      {details.prerequisites.length > 0 && (
        <DetailSection title="Prérequis">
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
