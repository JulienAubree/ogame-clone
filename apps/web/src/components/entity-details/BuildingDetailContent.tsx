import { useMemo } from 'react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { type PlanetContext } from '@/lib/entity-details';
import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
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

type TableData =
  | { type: 'mine'; title: string; rows: MineRow[] }
  | { type: 'solar'; title: string; rows: SolarRow[] }
  | { type: 'storage'; title: string; rows: StorageRow[] };

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

  // Active effects: bonuses with stat === 'building_time'
  const activeEffects = useMemo(() => {
    if (!gameConfig) return [];
    return gameConfig.bonuses
      .filter((b) => b.stat === 'building_time')
      .map((b) => {
        const sourceName =
          b.sourceType === 'building'
            ? gameConfig.buildings[b.sourceId]?.name ?? b.sourceId
            : gameConfig.research?.[b.sourceId]?.name ?? b.sourceId;
        const playerLevel =
          buildings.find((bld) => bld.id === b.sourceId)?.currentLevel ?? 0;
        return {
          sourceId: b.sourceId,
          sourceType: b.sourceType,
          sourceName,
          playerLevel,
          percentPerLevel: b.percentPerLevel,
        };
      });
  }, [gameConfig, buildings]);

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
      <div className="relative -mx-5 -mt-5 h-[200px] bg-gradient-to-br from-[#0f3460] via-[#16213e] to-[#1a1a2e] flex items-center justify-center">
        <GameImage
          category="buildings"
          id={buildingId}
          size="full"
          alt={name}
          className="h-[120px] w-[120px] rounded-2xl object-cover"
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

      {/* 4. Effets actifs */}
      {activeEffects.length > 0 && (
        <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
          <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
            Effets actifs
          </div>
          {activeEffects.map((effect) => (
            <div key={effect.sourceId} className="flex items-center gap-2.5">
              <GameImage
                category={effect.sourceType === 'building' ? 'buildings' : 'research'}
                id={effect.sourceId}
                size="thumb"
                alt={effect.sourceName}
                className="h-7 w-7 rounded-md object-cover"
              />
              <div>
                <div className="text-[11px] text-slate-200">
                  {effect.sourceName}{' '}
                  <span className="text-slate-500">niv. {effect.playerLevel}</span>
                </div>
                <div className="text-[10px] text-emerald-500">
                  {effect.percentPerLevel}% par niveau
                </div>
              </div>
            </div>
          ))}
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
