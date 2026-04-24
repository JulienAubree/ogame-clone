import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { PrerequisiteList, type PrerequisiteItem } from '@/components/common/PrerequisiteList';
import { getShipDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { formatDuration } from '@/lib/format';
import { EnergieIcon } from '@/components/common/ResourceIcons';
import { buildProductionConfig } from '@/lib/production-config';
import { resolveBonus, solarSatelliteEnergy } from '@exilium/game-engine';
import {
  ShieldIcon, ArmorIcon, HullIcon, WeaponsIcon, ShotsIcon,
  SpeedIcon, PropulsionIcon, FuelIcon, CargoIcon,
  StatCell, EffectiveStatCell, SectionHeader, CostPills,
} from './stat-components';
import { WeaponBatteryList } from './WeaponBatteryList';
import { ROLE_LABELS, ARMOR_LABELS } from '@/config/ship-labels';

const COMBAT_CATEGORY_LABELS: Record<string, string> = {
  light: 'Léger',
  medium: 'Moyen',
  heavy: 'Lourd',
  shield: 'Bouclier',
  defense: 'Défense',
  support: 'Support',
};

const fmt = (n: number) => n.toLocaleString('fr-FR');

interface Props {
  shipId: string;
  researchLevels: Record<string, number>;
  buildingLevels?: Record<string, number>;
  maxTemp?: number;
  isHomePlanet?: boolean;
  timePerUnit?: number;
}

export function ShipDetailContent({ shipId, researchLevels, buildingLevels, maxTemp, isHomePlanet, timePerUnit }: Props) {
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

  const shipDef = gameConfig?.ships[shipId] as { role?: string | null; combatCategoryId?: string | null } | undefined;
  const role = shipDef?.role ?? null;
  const combatCategoryId = shipDef?.combatCategoryId ?? null;

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

      {/* Role & armor badges */}
      {(role || combatCategoryId) && (
        <div className="flex gap-1.5 flex-wrap">
          {role && ROLE_LABELS[role] && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {ROLE_LABELS[role]}
            </span>
          )}
          {combatCategoryId && ARMOR_LABELS[combatCategoryId] && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">
              {ARMOR_LABELS[combatCategoryId]}
            </span>
          )}
        </div>
      )}

      {/* Flavor text */}
      {details.flavorText && (
        <p className="text-xs italic text-[#888] leading-relaxed">{details.flavorText}</p>
      )}

      {/* ── Defense ── */}
      <SectionHeader icon={<ShieldIcon size={14} className="text-sky-400" />} label="Défense" color="text-sky-400" />
      <div className="grid grid-cols-2 gap-1.5">
        <EffectiveStatCell
          icon={<ShieldIcon />}
          label="Bouclier"
          base={details.combat.shield}
          effective={effective.shield}
          multiplier={effective.shieldMult}
          variant="shield"
        />
        <StatCell
          icon={<ArmorIcon />}
          label="Blindage"
          value={details.combat.baseArmor}
          variant="armor"
        />
        <EffectiveStatCell
          icon={<HullIcon />}
          label="Coque"
          base={details.combat.hull}
          effective={effective.hull}
          multiplier={effective.hullMult}
          variant="hull"
          wide
        />
      </div>

      <div className="h-px bg-[#334155] my-1" />

      {/* ── Attack ── */}
      <SectionHeader icon={<WeaponsIcon size={14} className="text-red-400" />} label="Attaque" color="text-red-400" />
      {details.combat.weaponProfiles && details.combat.weaponProfiles.length > 0 ? (
        <WeaponBatteryList
          profiles={details.combat.weaponProfiles}
          weaponsMultiplier={effective.weaponsMult}
          categoryLabels={COMBAT_CATEGORY_LABELS}
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <EffectiveStatCell
            icon={<WeaponsIcon />}
            label="Armement"
            base={details.combat.weapons}
            effective={effective.weapons}
            multiplier={effective.weaponsMult}
            variant="weapons"
          />
          <StatCell
            icon={<ShotsIcon />}
            label="Tirs / round"
            value={details.combat.shotCount}
            variant="shots"
          />
        </div>
      )}

      {/* Energy production (stationary ships only) */}
      {details.isStationary && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2 mt-2">
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

      {/* ── Movement ── */}
      {!details.isStationary && (
        <div className="border-t border-[#334155] pt-3 mt-1">
          <SectionHeader
            icon={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><polygon points="3,11 22,2 13,21 11,13" /></svg>}
            label="Déplacement"
            color="text-slate-500"
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <SpeedIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Vitesse</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">
                  {fmt(effective.speed)}
                  {effective.speedMult > 1 && (
                    <span className="text-[9px] text-emerald-500 ml-1">+{Math.round((effective.speedMult - 1) * 100)}%</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PropulsionIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Propulsion</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">
                  {gameConfig?.labels[`drive.${details.stats.driveType}`] ?? details.stats.driveType}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FuelIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Consommation</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">{fmt(details.stats.fuelConsumption)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CargoIcon size={14} className="text-slate-500 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Fret</div>
                <div className="text-xs text-slate-200 font-mono font-semibold">{fmt(details.stats.cargoCapacity)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mining capacity */}
      {details.stats.miningExtraction > 0 && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Capacité de minage
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Extraction par voyage</span>
            <span className="text-slate-200 font-mono font-semibold">
              {fmt(effective.mining)}
              {effective.miningMult > 1 && (
                <span className="text-[9px] text-emerald-500 ml-1">base {fmt(details.stats.miningExtraction)} · +{Math.round((effective.miningMult - 1) * 100)}%</span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Cost ── */}
      <div className="border-t border-[#334155] pt-3 mt-1">
        <SectionHeader
          icon={<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1={3} y1={6} x2={21} y2={6} /><path d="M16 10a4 4 0 0 1-8 0" /></svg>}
          label="Coût unitaire"
          color="text-slate-500"
        />
        <CostPills cost={details.cost} />
        {timePerUnit != null && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            {formatDuration(timePerUnit)}
          </div>
        )}
      </div>

      {/* Prerequisites */}
      {(hasBuildingPrereqs || hasResearchPrereqs) && (() => {
        const prereqItems: PrerequisiteItem[] = [
          ...(details.prerequisites.buildings?.map(p => ({
            id: p.buildingId,
            type: 'building' as const,
            requiredLevel: p.level,
            currentLevel: buildingLevels?.[p.buildingId] ?? 0,
            name: resolveBuildingName(p.buildingId, gameConfig ?? undefined),
          })) ?? []),
          ...(details.prerequisites.research?.map(p => ({
            id: p.researchId,
            type: 'research' as const,
            requiredLevel: p.level,
            currentLevel: researchLevels?.[p.researchId] ?? 0,
            name: resolveResearchName(p.researchId, gameConfig ?? undefined),
          })) ?? []),
        ];
        return (
          <div>
            <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
              Prérequis
            </div>
            <PrerequisiteList items={prereqItems} />
          </div>
        );
      })()}
    </>
  );
}
