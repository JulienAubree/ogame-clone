import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { getShipDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { EnergieIcon } from '@/components/common/ResourceIcons';
import { buildProductionConfig } from '@/lib/production-config';
import { resolveBonus, solarSatelliteEnergy } from '@ogame-clone/game-engine';

const fmt = (n: number) => n.toLocaleString('fr-FR');

function EffectiveStatRow({ label, base, effective, multiplier }: { label: string; base: number; effective: number; multiplier: number }) {
  const bonusPercent = Math.round((multiplier - 1) * 100);
  const hasBonus = bonusPercent > 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200 font-mono font-semibold">{fmt(effective)}</span>
      </div>
      {hasBonus && (
        <div className="text-[10px] text-right text-emerald-500">
          base {fmt(base)} &middot; +{bonusPercent}%
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-mono font-semibold">{fmt(value)}</span>
    </div>
  );
}

interface Props {
  shipId: string;
  researchLevels: Record<string, number>;
  maxTemp?: number;
  isHomePlanet?: boolean;
}

export function ShipDetailContent({ shipId, researchLevels, maxTemp, isHomePlanet }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details = getShipDetails(shipId, gameConfig ?? undefined);
  const prodConfig = useMemo(
    () => (gameConfig ? buildProductionConfig(gameConfig) : undefined),
    [gameConfig],
  );

  const effective = useMemo(() => {
    const defs = gameConfig?.bonuses ?? [];
    const weaponsMult = resolveBonus('weapons', null, researchLevels, defs);
    const shieldMult = resolveBonus('shielding', null, researchLevels, defs);
    const armorMult = resolveBonus('armor', null, researchLevels, defs);
    const speedMult = resolveBonus('ship_speed', details.stats.driveType, researchLevels, defs);
    const miningMult = resolveBonus('mining_extraction', null, researchLevels, defs);
    return {
      weapons: Math.floor(details.combat.weapons * weaponsMult),
      weaponsMult,
      shield: Math.floor(details.combat.shield * shieldMult),
      shieldMult,
      hull: Math.floor(details.combat.hull * armorMult),
      hullMult: armorMult,
      speed: Math.floor(details.stats.baseSpeed * speedMult),
      speedMult,
      mining: Math.floor(details.stats.miningExtraction * miningMult),
      miningMult,
    };
  }, [researchLevels, details, gameConfig?.bonuses]);

  const hasBuildingPrereqs = details.prerequisites.buildings && details.prerequisites.buildings.length > 0;
  const hasResearchPrereqs = details.prerequisites.research && details.prerequisites.research.length > 0;

  return (
    <>
      {/* Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        <GameImage
          category="ships"
          id={shipId}
          size="full"
          alt={details.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Ship name */}
      <h3 className="text-lg font-semibold text-white">{details.name}</h3>

      {/* Flavor text */}
      {details.flavorText && (
        <p className="text-xs italic text-[#888] leading-relaxed">{details.flavorText}</p>
      )}

      {/* Combat stats */}
      <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
        <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
          Stats de combat
        </div>
        <EffectiveStatRow label="Bouclier" base={details.combat.shield} effective={effective.shield} multiplier={effective.shieldMult} />
        <StatRow label="Blindage" value={details.combat.baseArmor} />
        <EffectiveStatRow label="Coque" base={details.combat.hull} effective={effective.hull} multiplier={effective.hullMult} />
        <EffectiveStatRow label="Armement" base={details.combat.weapons} effective={effective.weapons} multiplier={effective.weaponsMult} />
        <StatRow label="Tirs" value={details.combat.shotCount} />
      </div>

      {/* Energy production (stationary ships only) */}
      {details.isStationary && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Production d&apos;énergie
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Par satellite</span>
            <span className="text-energy font-mono font-semibold flex items-center gap-1">
              <EnergieIcon size={12} className="text-energy" />
              +{fmt(solarSatelliteEnergy(maxTemp ?? 50, isHomePlanet, prodConfig?.satellite))}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            L&apos;énergie produite dépend de la température de la planète et de sa position par rapport au soleil.
            Ce vaisseau est stationnaire : il ne peut pas être envoyé en mission et est vulnérable aux attaques.
          </p>
        </div>
      )}

      {/* Movement — hide for stationary ships */}
      {!details.isStationary && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Déplacement
          </div>
          <EffectiveStatRow label="Vitesse" base={details.stats.baseSpeed} effective={effective.speed} multiplier={effective.speedMult} />
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Consommation</span>
            <span className="text-slate-200 font-mono">{fmt(details.stats.fuelConsumption)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Capacité de fret</span>
            <span className="text-slate-200 font-mono">{fmt(details.stats.cargoCapacity)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Propulsion</span>
            <span className="text-slate-200 font-mono">
              {gameConfig?.labels[`drive.${details.stats.driveType}`] ?? details.stats.driveType}
            </span>
          </div>
        </div>
      )}

      {/* Mining capacity */}
      {details.stats.miningExtraction > 0 && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Capacité de minage
          </div>
          <EffectiveStatRow
            label="Extraction par voyage"
            base={details.stats.miningExtraction}
            effective={effective.mining}
            multiplier={effective.miningMult}
          />
        </div>
      )}

      {/* Unit cost */}
      <div>
        <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
          Coût unitaire
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono font-semibold">
          {details.cost.minerai > 0 && (
            <span className="text-amber-400">{fmt(details.cost.minerai)} minerai</span>
          )}
          {details.cost.silicium > 0 && (
            <span className="text-cyan-400">{fmt(details.cost.silicium)} silicium</span>
          )}
          {details.cost.hydrogene > 0 && (
            <span className="text-emerald-400">{fmt(details.cost.hydrogene)} hydrogène</span>
          )}
        </div>
      </div>

      {/* Prerequisites */}
      {(hasBuildingPrereqs || hasResearchPrereqs) && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Prérequis
          </div>
          <div className="space-y-1">
            {details.prerequisites.buildings?.map((p) => (
              <div key={p.buildingId} className="text-[11px] flex items-center gap-1.5 text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                {resolveBuildingName(p.buildingId, gameConfig ?? undefined)} niveau {p.level}
              </div>
            ))}
            {details.prerequisites.research?.map((p) => (
              <div key={p.researchId} className="text-[11px] flex items-center gap-1.5 text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                {resolveResearchName(p.researchId, gameConfig ?? undefined)} niveau {p.level}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
