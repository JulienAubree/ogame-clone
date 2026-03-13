interface ResourceCostProps {
  metal: number;
  crystal: number;
  deuterium: number;
  currentMetal?: number;
  currentCrystal?: number;
  currentDeuterium?: number;
}

export function ResourceCost({
  metal,
  crystal,
  deuterium,
  currentMetal,
  currentCrystal,
  currentDeuterium,
}: ResourceCostProps) {
  const canAfford = (cost: number, current?: number) =>
    current === undefined || current >= cost;

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {metal > 0 && (
        <span className={canAfford(metal, currentMetal) ? 'text-metal' : 'text-destructive'}>
          Metal: {metal.toLocaleString('fr-FR')}
        </span>
      )}
      {crystal > 0 && (
        <span className={canAfford(crystal, currentCrystal) ? 'text-crystal' : 'text-destructive'}>
          Cristal: {crystal.toLocaleString('fr-FR')}
        </span>
      )}
      {deuterium > 0 && (
        <span
          className={
            canAfford(deuterium, currentDeuterium) ? 'text-deuterium' : 'text-destructive'
          }
        >
          Deut: {deuterium.toLocaleString('fr-FR')}
        </span>
      )}
    </div>
  );
}
