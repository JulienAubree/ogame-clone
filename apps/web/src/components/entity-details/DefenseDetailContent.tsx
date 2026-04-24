import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { PrerequisiteList, type PrerequisiteItem } from '@/components/common/PrerequisiteList';
import { getDefenseDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { formatDuration } from '@/lib/format';
import { resolveBonus } from '@exilium/game-engine';
import {
  ShieldIcon, ArmorIcon, HullIcon, WeaponsIcon, ShotsIcon,
  StatCell, EffectiveStatCell, SectionHeader, CostPills,
} from './stat-components';
import { WeaponBatteryList } from './WeaponBatteryList';
import { ARMOR_LABELS } from '@/config/ship-labels';

const COMBAT_CATEGORY_LABELS: Record<string, string> = {
  light: 'Léger',
  medium: 'Moyen',
  heavy: 'Lourd',
  shield: 'Bouclier',
  defense: 'Défense',
  support: 'Support',
};

interface Props {
  defenseId: string;
  researchLevels: Record<string, number>;
  buildingLevels?: Record<string, number>;
  timePerUnit?: number;
  planetClassId?: string | null;
}

export function DefenseDetailContent({ defenseId, researchLevels, buildingLevels, timePerUnit, planetClassId }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details = getDefenseDetails(defenseId, gameConfig ?? undefined);
  const variantPlanetTypes = gameConfig?.defenses[defenseId]?.variantPlanetTypes ?? [];
  const hasVariant = !!planetClassId && variantPlanetTypes.includes(planetClassId);

  const effective = useMemo(() => {
    const defs = gameConfig?.bonuses ?? [];
    const weaponsMult = resolveBonus('weapons', null, researchLevels, defs);
    const shieldMult = resolveBonus('shielding', null, researchLevels, defs);
    const armorMult = resolveBonus('armor', null, researchLevels, defs);
    return {
      weapons: Math.floor(details.combat.weapons * weaponsMult),
      weaponsMult,
      shield: Math.floor(details.combat.shield * shieldMult),
      shieldMult,
      hull: Math.floor(details.combat.hull * armorMult),
      hullMult: armorMult,
    };
  }, [researchLevels, details, gameConfig?.bonuses]);

  const defenseDef = gameConfig?.defenses[defenseId] as { combatCategoryId?: string | null } | undefined;
  const combatCategoryId = defenseDef?.combatCategoryId ?? null;

  const hasBuildingPrereqs = details.prerequisites.buildings && details.prerequisites.buildings.length > 0;
  const hasResearchPrereqs = details.prerequisites.research && details.prerequisites.research.length > 0;

  return (
    <>
      {/* Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        <GameImage
          category="defenses"
          id={defenseId}
          size="full"
          alt={details.name}
          className="w-full h-full object-cover"
          planetType={planetClassId ?? undefined}
          hasVariant={hasVariant}
        />
      </div>

      {/* Defense name */}
      <h3 className="text-lg font-semibold text-white">{details.name}</h3>

      {/* Armor badge */}
      {combatCategoryId && ARMOR_LABELS[combatCategoryId] && (
        <div className="flex gap-1.5">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">
            {ARMOR_LABELS[combatCategoryId]}
          </span>
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

      {/* Max per planet */}
      {details.maxPerPlanet && (
        <p className="text-xs text-slate-400">
          Maximum {details.maxPerPlanet} par planète
        </p>
      )}

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
