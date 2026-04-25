import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { trpc } from '@/trpc';
import { GameImage } from '@/components/common/GameImage';
import { PrerequisiteList, type PrerequisiteItem } from '@/components/common/PrerequisiteList';
import { type PlanetContext } from '@/lib/entity-details';
import { getBuildingName } from '@/lib/entity-names';
import { buildProductionConfig } from '@/lib/production-config';
import { storageCapacity, buildingBonusAtLevel } from '@exilium/game-engine';
import { getContextualTable } from './building-tables';
import { GovernanceSection } from './GovernanceSection';

interface BuildingListItem {
  id: string;
  name: string;
  currentLevel: number;
  prerequisites?: { buildingId: string; level: number; currentLevel?: number }[];
}

interface Props {
  buildingId: string;
  buildings: BuildingListItem[];
  planetContext?: PlanetContext;
  planetClassId?: string | null;
}

// ---------------------------------------------------------------------------
// Format helper
// ---------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString('fr-FR');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuildingDetailContent({ buildingId, buildings, planetContext, planetClassId }: Props) {
  const { data: gameConfig } = useGameConfig();

  const building = buildings.find((b) => b.id === buildingId);
  const currentLevel = building?.currentLevel ?? 0;
  const configDef = gameConfig?.buildings[buildingId];
  const name = getBuildingName(buildingId, gameConfig);
  const flavorText = configDef?.flavorText ?? '';
  const variantPlanetTypes = configDef?.variantPlanetTypes ?? [];
  const hasVariant = !!planetClassId && variantPlanetTypes.includes(planetClassId);
  const prerequisites = building?.prerequisites ?? configDef?.prerequisites ?? [];

  // Bonus provided BY this building
  const buildingBonus = useMemo(() => {
    if (!gameConfig) return null;
    const bonus = gameConfig.bonuses.find(
      (b) => b.sourceType === 'building' && b.sourceId === buildingId,
    );
    if (!bonus) return null;

    return {
      label: bonus.statLabel ?? bonus.stat,
      category: bonus.category,
    };
  }, [gameConfig, buildingId]);

  const prodConfig = useMemo(
    () => (gameConfig ? buildProductionConfig(gameConfig) : undefined),
    [gameConfig],
  );

  const isStorageBuilding = buildingId === 'storageMinerai' || buildingId === 'storageSilicium' || buildingId === 'storageHydrogene';
  const protectedBaseRatio = gameConfig ? Number(gameConfig.universe?.['protected_storage_base_ratio']) || 0.05 : 0.05;

  // Fetch research level for armored storage display (only for storage buildings)
  const { data: researchData } = trpc.research.list.useQuery();
  const armoredResearch = researchData?.items?.find((r) => r.id === 'armoredStorage');
  const armoredLevel = armoredResearch?.currentLevel ?? 0;

  // Resolve the bonus multiplier: research gives percentPerLevel (default 5) per level
  const armoredBonusPerLevel = gameConfig?.bonuses?.find((b) => b.stat === 'armored_storage')?.percentPerLevel ?? 5;
  const armoredMultiplier = 1 + (armoredBonusPerLevel / 100) * armoredLevel;
  const effectiveRatio = protectedBaseRatio * armoredMultiplier;
  const currentStorageCap = storageCapacity(currentLevel, prodConfig?.storage);
  const currentProtected = Math.floor(currentStorageCap * effectiveRatio);

  // Contextual table
  const tableData = useMemo(
    () =>
      getContextualTable(
        buildingId,
        currentLevel,
        planetContext?.maxTemp ?? 50,
        planetContext?.productionFactor ?? 1,
        prodConfig,
        protectedBaseRatio,
        armoredMultiplier,
      ),
    [buildingId, currentLevel, planetContext, prodConfig, protectedBaseRatio, armoredMultiplier],
  );

  return (
    <>
      {/* 1. Hero image */}
      <div className="relative -mx-5 -mt-5 h-[200px] overflow-hidden">
        <GameImage
          category="buildings"
          id={buildingId}
          size="full"
          alt={name}
          className="w-full h-full object-cover"
          planetType={planetClassId ?? undefined}
          hasVariant={hasVariant}
        />
        <span className="absolute bottom-3 right-3 bg-emerald-700 text-white text-xs font-bold px-3 py-1 rounded-full">
          Niveau {currentLevel}
        </span>
      </div>

      {/* 2. Name */}
      <h3 className="text-lg font-semibold text-white">{name}</h3>

      {/* 3. Flavor text */}
      {flavorText && (
        <p className="text-xs italic text-[#888] leading-relaxed">{flavorText}</p>
      )}

      {/* 3b. Annex lab explanation */}
      {configDef?.allowedPlanetTypes && configDef.allowedPlanetTypes.length > 0 && !configDef.allowedPlanetTypes.includes('homeworld') && (() => {
        // Find the exclusive research unlocked by this annex
        const annexType = configDef.allowedPlanetTypes[0];
        const exclusiveResearch = gameConfig ? Object.values(gameConfig.research).find(
          (r) => r.requiredAnnexType === annexType,
        ) : null;

        const planetTypeNames: Record<string, string> = {
          volcanic: 'volcanique',
          arid: 'aride',
          temperate: 'temperee',
          glacial: 'glaciale',
          gaseous: 'gazeuse',
        };

        return (
          <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 space-y-2">
            <div className="text-[10px] uppercase text-violet-400 font-semibold tracking-wider">Laboratoire annexe</div>
            <div className="text-xs text-slate-300 space-y-2">
              <p>Ce laboratoire est une <span className="text-violet-400 font-medium">annexe de recherche</span> spécialisée, constructible uniquement sur une planète <span className="text-violet-400 font-medium">{planetTypeNames[annexType] ?? annexType}</span>.</p>

              <div className="rounded bg-[#0d1628] px-2.5 py-2 space-y-1.5">
                <div className="text-[10px] uppercase text-emerald-400 font-semibold tracking-wider">Bonus passif</div>
                <p className="text-slate-300">Chaque niveau de ce laboratoire réduit le <span className="text-emerald-400 font-medium">temps de toutes les recherches de 5%</span>. Ce bonus se cumule avec les autres laboratoires annexes de votre empire.</p>
              </div>

              {exclusiveResearch && (
                <div className="rounded bg-[#0d1628] px-2.5 py-2 space-y-1.5">
                  <div className="text-[10px] uppercase text-amber-400 font-semibold tracking-wider">Recherche exclusive</div>
                  <p className="text-slate-300">
                    Debloque la recherche <span className="text-amber-400 font-medium">{exclusiveResearch.name}</span> :
                    {' '}{exclusiveResearch.effectDescription ?? exclusiveResearch.description}
                  </p>
                </div>
              )}

              <p className="text-slate-500 text-[11px]">Le laboratoire principal (planète mère) doit être au niveau 6 minimum.</p>
            </div>
          </div>
        );
      })()}

      {/* 3c. Main lab explanation */}
      {buildingId === 'researchLab' && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 space-y-2">
          <div className="text-[10px] uppercase text-violet-400 font-semibold tracking-wider">Laboratoire principal</div>
          <div className="text-xs text-slate-300 space-y-1.5">
            <p>Le laboratoire de recherche est le <span className="text-violet-400 font-medium">centre névralgique</span> de la recherche de votre empire. Toutes les recherches sont lancées depuis ce laboratoire.</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Chaque niveau réduit le <span className="text-emerald-400">temps de recherche</span> (rendements décroissants)</li>
              <li>Au <span className="text-amber-400">niveau 6</span>, débloque la construction de laboratoires annexes sur vos colonies</li>
              <li>Les ressources de recherche sont prélevées sur la planète mère</li>
            </ul>
          </div>
        </div>
      )}

      {/* 3d. Shield combat explanation */}
      {buildingId === 'planetaryShield' && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3 space-y-1.5">
          <div className="text-[10px] uppercase text-cyan-400 font-semibold tracking-wider">Comportement en combat</div>
          <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
            <li>Le bouclier est <span className="text-cyan-400 font-medium">indestructible</span> et se <span className="text-cyan-400 font-medium">régénère à chaque round</span></li>
            <li>Il <span className="text-red-400">ne protège pas la flotte</span> stationnée sur la planète</li>
            <li>Tant que le bouclier n'est pas percé dans un round, les <span className="text-cyan-400 font-medium">défenses planétaires sont intouchables</span></li>
            <li>L'attaquant doit infliger assez de dégâts en un seul round pour le percer</li>
            <li>Puissance réglable de 0% à 100% dans les paramètres d'énergie</li>
          </ul>
        </div>
      )}

      {/* 3c. Storage armored explanation */}
      {isStorageBuilding && (
        <div className="rounded-lg border border-green-500/20 bg-green-950/20 p-3 space-y-2">
          <div className="text-[10px] uppercase text-green-400 font-semibold tracking-wider">Protection blindée</div>
          <div className="text-xs text-slate-300 space-y-1.5">
            <p>En cas d'attaque, <span className="text-green-400 font-medium">{fmt(currentProtected)}</span> ressources sont protégées et <span className="text-green-400 font-medium">impossibles à piller</span>.</p>
            <div className="rounded bg-[#0d1628] px-2.5 py-2 text-[11px] font-mono text-slate-400 space-y-0.5">
              <div>Capacité stockage : <span className="text-slate-200">{fmt(currentStorageCap)}</span></div>
              <div>Ratio de base : <span className="text-slate-200">{Math.round(protectedBaseRatio * 100)}%</span></div>
              <div>
                Recherche Blindage : <span className="text-slate-200">Nv.{armoredLevel}</span>
                {armoredLevel > 0 && <span className="text-green-400"> (×{armoredMultiplier.toFixed(2)})</span>}
              </div>
              <div className="border-t border-slate-700 pt-1 mt-1">
                = {fmt(currentStorageCap)} × {Math.round(protectedBaseRatio * 100)}%{armoredLevel > 0 ? ` × ${armoredMultiplier.toFixed(2)}` : ''} = <span className="text-green-400 font-semibold">{fmt(currentProtected)}</span>
              </div>
            </div>
            <p className="text-slate-500">Améliorez ce hangar ou la recherche <span className="text-green-400/80">Blindage des hangars</span> pour augmenter la protection.</p>
          </div>
        </div>
      )}

      {/* 3e. Imperial Power Center governance */}
      {buildingId === 'imperialPowerCenter' && <GovernanceSection currentLevel={currentLevel} />}

      {/* 4. Bonus de ce bâtiment */}
      {buildingBonus && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Bonus : {buildingBonus.label}
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="px-2 py-1.5 border-b border-[#1e293b]">Niveau</th>
                <th className="px-2 py-1.5 border-b border-[#1e293b] text-right">Réduction</th>
                <th className="px-2 py-1.5 border-b border-[#1e293b] text-right">Multiplicateur</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {Array.from({ length: 6 }, (_, i) => currentLevel + i).map((level, i) => {
                const mult = buildingBonusAtLevel(level);
                const reduction = Math.round((1 - mult) * 100);
                return (
                  <tr key={level} className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}>
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {level === 0 ? '\u2014' : `-${reduction}%`}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      x{mult.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Contextual table */}
      {tableData && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            {tableData.title}
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="px-2 py-1.5 border-b border-[#1e293b]">Niveau</th>
                {tableData.type === 'mine' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-amber-500">
                      Production/h
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-yellow-400">
                      Énergie
                    </th>
                  </>
                )}
                {tableData.type === 'solar' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-yellow-400">
                      Production
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                  </>
                )}
                {tableData.type === 'storage' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right">
                      Capacité
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Gain
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-green-500">
                      Blindée
                    </th>
                  </>
                )}
                {tableData.type === 'missionCenter' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-cyan-400">
                      Cooldown
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-amber-500">
                      Gisement moy.
                    </th>
                  </>
                )}
                {tableData.type === 'market' && (
                  <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-amber-400">
                    Offres max
                  </th>
                )}
                {tableData.type === 'shield' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-cyan-400">
                      Bouclier
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-yellow-400">
                      Énergie
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {tableData.type === 'mine' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.production)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-red-500">
                      {i === 0 ? '\u2014' : fmt(row.energy)}
                    </td>
                  </tr>
                ))}
              {tableData.type === 'solar' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.production)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                  </tr>
                ))}
              {tableData.type === 'storage' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.capacity)}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-500">
                      {row.gain != null ? `+${fmt(row.gain)}` : '\u2014'}
                    </td>
                    <td className="px-2 py-1.5 text-right text-green-500">{fmt(row.armored)}</td>
                  </tr>
                ))}
              {tableData.type === 'missionCenter' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right text-cyan-400">{row.cooldown}h</td>
                    <td className="px-2 py-1.5 text-right">{fmt(row.depositSize)}</td>
                  </tr>
                ))}
              {tableData.type === 'market' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right text-amber-400">{row.maxOffers}</td>
                  </tr>
                ))}
              {tableData.type === 'shield' &&
                tableData.rows.map((row, i) => (
                  <tr
                    key={row.level}
                    className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}
                  >
                    <td className={`px-2 py-1.5 ${i === 0 ? 'font-semibold text-emerald-400' : ''}`}>
                      {row.level}{i === 0 ? ' \u25C4' : ''}
                    </td>
                    <td className="px-2 py-1.5 text-right text-cyan-400">{fmt(row.shield)}</td>
                    <td className="px-2 py-1.5 text-right text-red-500">{fmt(row.energy)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Prerequisites */}
      {prerequisites.length > 0 && (() => {
        const prereqItems: PrerequisiteItem[] = prerequisites.map((p: { buildingId: string; level: number; currentLevel?: number }) => ({
          id: p.buildingId,
          type: 'building' as const,
          requiredLevel: p.level,
          currentLevel: p.currentLevel ?? buildings.find(b => b.id === p.buildingId)?.currentLevel ?? 0,
          name: getBuildingName(p.buildingId, gameConfig),
        }));
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

