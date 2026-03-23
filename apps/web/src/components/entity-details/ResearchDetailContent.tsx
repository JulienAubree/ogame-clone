import { useMemo } from 'react';
import { getResearchDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { resolveBonus } from '@ogame-clone/game-engine';

const STAT_LABELS: Record<string, string> = {
  weapons: 'Dégâts des armes',
  shielding: 'Puissance des boucliers',
  armor: 'Résistance de la coque',
  ship_speed: 'Vitesse des vaisseaux',
  building_time: 'Temps de construction',
  research_time: 'Temps de recherche',
  ship_build_time: 'Temps de construction des vaisseaux',
  defense_build_time: 'Temps de construction des défenses',
  fleet_count: 'Flottes simultanées',
  spy_range: "Portée d'espionnage",
  mining_duration: 'Durée de minage',
  mining_extraction: "Capacité d'extraction",
};

const DRIVE_LABELS: Record<string, string> = {
  combustion: 'Combustion',
  impulse: 'Impulsion',
  hyperspaceDrive: 'Hyperespace',
};

const COMBAT_STATS = new Set(['weapons', 'shielding', 'armor']);

const fmt = (n: number) => n.toLocaleString('fr-FR');

interface Props {
  researchId: string;
  researchLevels: Record<string, number>;
}

export function ResearchDetailContent({ researchId, researchLevels }: Props) {
  const { data: gameConfig } = useGameConfig();
  const details = getResearchDetails(researchId, gameConfig ?? undefined);
  const currentLevel = researchLevels[researchId] ?? 0;

  const matchingBonuses = useMemo(() => {
    if (!gameConfig?.bonuses) return [];
    return gameConfig.bonuses.filter((b) => b.sourceId === researchId);
  }, [gameConfig, researchId]);

  const affectedEntities = useMemo(() => {
    if (!gameConfig || matchingBonuses.length === 0) return null;

    const sections: Array<{
      label: string;
      type: 'units' | 'description';
      items?: Array<{ id: string; category: string; name: string; baseValue: number; effectiveValue: number }>;
      description?: string;
      percentPerLevel: number;
    }> = [];

    for (const bonus of matchingBonuses) {
      if (COMBAT_STATS.has(bonus.stat)) {
        const items: Array<{ id: string; category: string; name: string; baseValue: number; effectiveValue: number }> = [];
        const statKey = bonus.stat === 'shielding' ? 'shield' : bonus.stat;
        const mult = resolveBonus(bonus.stat, null, researchLevels, gameConfig.bonuses);

        for (const ship of Object.values(gameConfig.ships)) {
          const baseValue = (ship as any)[statKey] ?? 0;
          if (baseValue === 0) continue;
          items.push({
            id: ship.id,
            category: 'ships',
            name: ship.name,
            baseValue,
            effectiveValue: Math.floor(baseValue * mult),
          });
        }

        for (const defense of Object.values(gameConfig.defenses)) {
          const baseValue = (defense as any)[statKey] ?? 0;
          if (baseValue === 0) continue;
          items.push({
            id: defense.id,
            category: 'defenses',
            name: defense.name,
            baseValue,
            effectiveValue: Math.floor(baseValue * mult),
          });
        }

        if (items.length > 0) {
          sections.push({
            label: 'Unités affectées',
            type: 'units',
            items,
            percentPerLevel: bonus.percentPerLevel,
          });
        }
      } else if (bonus.stat === 'ship_speed' && bonus.category) {
        const items: Array<{ id: string; category: string; name: string; baseValue: number; effectiveValue: number }> = [];
        const mult = resolveBonus('ship_speed', bonus.category, researchLevels, gameConfig.bonuses);

        for (const ship of Object.values(gameConfig.ships)) {
          if ((ship as any).driveType !== bonus.category) continue;
          const baseValue = (ship as any).baseSpeed ?? 0;
          if (baseValue === 0) continue;
          items.push({
            id: ship.id,
            category: 'ships',
            name: ship.name,
            baseValue,
            effectiveValue: Math.floor(baseValue * mult),
          });
        }

        if (items.length > 0) {
          const driveLabel = DRIVE_LABELS[bonus.category] ?? bonus.category;
          sections.push({
            label: `Vaisseaux affectés (${driveLabel})`,
            type: 'units',
            items,
            percentPerLevel: bonus.percentPerLevel,
          });
        }
      } else if (bonus.stat === 'mining_extraction') {
        const items: Array<{ id: string; category: string; name: string; baseValue: number; effectiveValue: number }> = [];
        const mult = resolveBonus('mining_extraction', null, researchLevels, gameConfig.bonuses);

        for (const ship of Object.values(gameConfig.ships)) {
          const baseValue = (ship as any).miningExtraction ?? 0;
          if (baseValue === 0) continue;
          items.push({
            id: ship.id,
            category: 'ships',
            name: ship.name,
            baseValue,
            effectiveValue: Math.floor(baseValue * mult),
          });
        }

        if (items.length > 0) {
          sections.push({
            label: "Extraction par vaisseau",
            type: 'units',
            items,
            percentPerLevel: bonus.percentPerLevel,
          });
        }
      } else {
        const statLabel = STAT_LABELS[bonus.stat] ?? bonus.stat;
        const sign = bonus.percentPerLevel > 0 ? '+' : '';
        sections.push({
          label: statLabel,
          type: 'description',
          description: `${sign}${bonus.percentPerLevel}% par niveau`,
          percentPerLevel: bonus.percentPerLevel,
        });
      }
    }

    return sections.length > 0 ? sections : null;
  }, [gameConfig, matchingBonuses, researchLevels]);

  const progressionData = useMemo(() => {
    if (matchingBonuses.length === 0) return null;

    const levels = Array.from({ length: 6 }, (_, i) => currentLevel + i);
    const bonuses = matchingBonuses.map((b) => ({
      stat: b.stat,
      label: STAT_LABELS[b.stat] ?? b.stat,
      percentPerLevel: b.percentPerLevel,
    }));

    const rows = levels.map((level, i) => ({
      level,
      isCurrent: i === 0,
      values: matchingBonuses.map((b) => ({
        totalPct: b.percentPerLevel * level,
      })),
    }));

    return { bonuses, rows };
  }, [matchingBonuses, currentLevel]);

  const hasBuildingPrereqs = details.prerequisites.buildings && details.prerequisites.buildings.length > 0;
  const hasResearchPrereqs = details.prerequisites.research && details.prerequisites.research.length > 0;

  const effectDescription = (gameConfig?.research?.[researchId] as any)?.effectDescription ?? details.effect;

  return (
    <>
      {/* Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        <GameImage
          category="research"
          id={researchId}
          size="full"
          alt={details.name}
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-3 right-3 bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-full">
          Niveau {currentLevel}
        </span>
      </div>

      {/* Research name */}
      <h3 className="text-lg font-semibold text-white">{details.name}</h3>

      {/* Flavor text */}
      {details.flavorText && (
        <p className="text-xs italic text-[#888] leading-relaxed">{details.flavorText}</p>
      )}

      {/* Effect description */}
      {effectDescription && (
        <div className="bg-[#1e293b] rounded-lg p-3">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-1">
            Effet en jeu
          </div>
          <p className="text-[11px] text-slate-300">{effectDescription}</p>
        </div>
      )}

      {/* Slag rates for deepSpaceRefining */}
      {researchId === 'deepSpaceRefining' && gameConfig?.universe && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Taux de scories actuel
          </div>
          <div className="space-y-1 text-[11px]">
            {[8, 16].map((pos) => (
              ['minerai', 'silicium', 'hydrogene'].map((res) => {
                const baseRate = Number((gameConfig.universe as Record<string, unknown>)[`slag_rate.pos${pos}.${res}`] ?? 0);
                const effectiveRate = baseRate * Math.pow(0.85, currentLevel);
                const effectivePct = (effectiveRate * 100).toFixed(1);
                return (
                  <div key={`${pos}-${res}`} className="flex justify-between text-slate-300">
                    <span>Pos {pos} — {res}</span>
                    <span className="text-emerald-400">{effectivePct}%</span>
                  </div>
                );
              })
            ))}
          </div>
        </div>
      )}

      {/* Affected entities */}
      {affectedEntities?.map((section, idx) => (
        <div key={idx}>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            {section.label}
          </div>
          {section.type === 'units' && section.items ? (
            <div className="space-y-1.5">
              {section.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-[11px]">
                  <GameImage
                    category={item.category as any}
                    id={item.id}
                    size="thumb"
                    alt={item.name}
                    className="h-6 w-6 rounded object-cover"
                  />
                  <span className="text-slate-300 flex-1 truncate">{item.name}</span>
                  <span className="font-mono text-slate-500">{fmt(item.baseValue)}</span>
                  <span className="text-slate-600">&rarr;</span>
                  <span className="text-emerald-400 font-mono">{fmt(item.effectiveValue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-300">{section.description}</p>
          )}
        </div>
      ))}

      {/* Progression table */}
      {progressionData && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Progression
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="px-2 py-1.5 border-b border-[#1e293b]">Niveau</th>
                {progressionData.bonuses.map((b) => (
                  <th key={b.stat} className="px-2 py-1.5 border-b border-[#1e293b] text-right">
                    {b.label}
                  </th>
                ))}
                <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                  /niv.
                </th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {progressionData.rows.map((row, i) => (
                <tr key={row.level} className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}>
                  <td className={`px-2 py-1.5 ${row.isCurrent ? 'font-semibold text-emerald-400' : ''}`}>
                    {row.level}{row.isCurrent ? ' \u25C4' : ''}
                  </td>
                  {row.values.map((v, j) => {
                    const ppl = progressionData.bonuses[j].percentPerLevel;
                    const isPositive = ppl > 0;
                    return (
                      <td key={j} className={`px-2 py-1.5 text-right ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {row.level === 0 ? '\u2014' : `${isPositive ? '+' : ''}${v.totalPct}%`}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-slate-500">
                    {progressionData.bonuses.map((b) => `${b.percentPerLevel > 0 ? '+' : ''}${b.percentPerLevel}%`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
