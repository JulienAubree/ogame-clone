import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { getDefenseDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { resolveBonus } from '@ogame-clone/game-engine';

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
  defenseId: string;
  researchLevels: Record<string, number>;
}

export function DefenseDetailContent({ defenseId, researchLevels }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details = getDefenseDetails(defenseId, gameConfig ?? undefined);

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
        />
      </div>

      {/* Defense name */}
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

      {/* Max per planet */}
      {details.maxPerPlanet && (
        <p className="text-xs text-slate-400">
          Maximum {details.maxPerPlanet} par planète
        </p>
      )}

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
