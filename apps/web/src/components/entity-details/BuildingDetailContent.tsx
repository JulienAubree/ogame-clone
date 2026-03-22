import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { type PlanetContext } from '@/lib/entity-details';
import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
  buildingBonusAtLevel,
  discoveryCooldown, depositSize, baseExtraction,
} from '@ogame-clone/game-engine';

interface BuildingListItem {
  id: string;
  name: string;
  currentLevel: number;
}

interface Props {
  buildingId: string;
  buildings: BuildingListItem[];
  planetContext?: PlanetContext;
}

// ---------------------------------------------------------------------------
// Contextual table computation
// ---------------------------------------------------------------------------

interface MineRow { level: number; production: number; gain: number | null; energy: number }
interface SolarRow { level: number; production: number; gain: number | null }
interface StorageRow { level: number; capacity: number; gain: number | null }
interface MissionCenterRow { level: number; cooldown: number; depositSize: number; extraction: number }

type TableData =
  | { type: 'mine'; title: string; rows: MineRow[] }
  | { type: 'solar'; title: string; rows: SolarRow[] }
  | { type: 'storage'; title: string; rows: StorageRow[] }
  | { type: 'missionCenter'; title: string; rows: MissionCenterRow[] };

function getContextualTable(
  buildingId: string,
  currentLevel: number,
  maxTemp: number,
  productionFactor: number,
): TableData | null {
  const pf = productionFactor;
  const levels = Array.from({ length: 6 }, (_, i) => currentLevel + i);

  const makeMineRows = (
    prodFn: (level: number) => number,
    energyFn: (level: number) => number,
  ): MineRow[] =>
    levels.map((level, i) => ({
      level,
      production: prodFn(level),
      gain: i === 0 ? null : prodFn(level) - prodFn(level - 1),
      energy: -energyFn(level),
    }));

  switch (buildingId) {
    case 'mineraiMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => mineraiProduction(l, pf), mineraiMineEnergy),
      };
    case 'siliciumMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => siliciumProduction(l, pf), siliciumMineEnergy),
      };
    case 'hydrogeneSynth':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows((l) => hydrogeneProduction(l, maxTemp, pf), hydrogeneSynthEnergy),
      };
    case 'solarPlant':
      return {
        type: 'solar',
        title: "Production d'énergie",
        rows: levels.map((level, i) => ({
          level,
          production: solarPlantEnergy(level),
          gain: i === 0 ? null : solarPlantEnergy(level) - solarPlantEnergy(level - 1),
        })),
      };
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      return {
        type: 'storage',
        title: 'Capacité de stockage',
        rows: levels.map((level, i) => ({
          level,
          capacity: storageCapacity(level),
          gain: i === 0 ? null : storageCapacity(level) - storageCapacity(level - 1),
        })),
      };
    case 'missionCenter':
      return {
        type: 'missionCenter',
        title: 'Progression du Centre de missions',
        rows: levels.map((level) => ({
          level,
          cooldown: discoveryCooldown(level),
          depositSize: depositSize(level, 1.0),
          extraction: baseExtraction(level),
        })),
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Format helper
// ---------------------------------------------------------------------------

const fmt = (n: number) => n.toLocaleString('fr-FR');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuildingDetailContent({ buildingId, buildings, planetContext }: Props) {
  const { data: gameConfig } = useGameConfig();

  const building = buildings.find((b) => b.id === buildingId);
  const currentLevel = building?.currentLevel ?? 0;
  const configDef = gameConfig?.buildings[buildingId];
  const name = configDef?.name ?? buildingId;
  const flavorText = configDef?.flavorText ?? '';
  const prerequisites = configDef?.prerequisites ?? [];

  // Bonus provided BY this building
  const buildingBonus = useMemo(() => {
    if (!gameConfig) return null;
    const bonus = gameConfig.bonuses.find(
      (b) => b.sourceType === 'building' && b.sourceId === buildingId,
    );
    if (!bonus) return null;

    const STAT_LABELS: Record<string, string> = {
      building_time: 'Temps de construction',
      research_time: 'Temps de recherche',
      ship_build_time: 'Temps de construction vaisseaux',
      defense_build_time: 'Temps de construction défenses',
    };

    return {
      label: STAT_LABELS[bonus.stat] ?? bonus.stat,
      category: bonus.category,
    };
  }, [gameConfig, buildingId]);

  // Contextual table
  const tableData = useMemo(
    () =>
      getContextualTable(
        buildingId,
        currentLevel,
        planetContext?.maxTemp ?? 50,
        planetContext?.productionFactor ?? 1,
      ),
    [buildingId, currentLevel, planetContext],
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
                  </>
                )}
                {tableData.type === 'missionCenter' && (
                  <>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-cyan-400">
                      Cooldown
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-amber-500">
                      Gisement
                    </th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-emerald-500">
                      Extraction
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
                    <td className="px-2 py-1.5 text-right text-red-500">{fmt(row.energy)}</td>
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
                    <td className="px-2 py-1.5 text-right">{fmt(row.extraction)}/prosp.</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Prerequisites */}
      {prerequisites.length > 0 && (
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
            Prérequis
          </div>
          <div className="space-y-1">
            {prerequisites.map((p) => {
              const met = (buildings.find((b) => b.id === p.buildingId)?.currentLevel ?? 0) >= p.level;
              const prereqName = gameConfig?.buildings[p.buildingId]?.name ?? p.buildingId;
              return (
                <div
                  key={p.buildingId}
                  className={`text-[11px] flex items-center gap-1.5 ${met ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {met ? '\u2713' : '\u2717'} {prereqName} niveau {p.level}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
