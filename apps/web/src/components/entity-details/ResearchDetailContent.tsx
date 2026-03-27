import { useMemo } from 'react';
import { getResearchDetails, resolveBuildingName, resolveResearchName } from '@/lib/entity-details';
import { useGameConfig } from '@/hooks/useGameConfig';
import { GameImage } from '@/components/common/GameImage';
import { resolveBonus, calculateSpyReport, calculateDetectionChance, calculateAttackDetection } from '@exilium/game-engine';

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
          const driveLabel = gameConfig?.labels[`drive.${bonus.category}`] ?? bonus.category;
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
      } else if (bonus.stat === 'fleet_count') {
        const maxFleets = Math.floor(resolveBonus('fleet_count', null, researchLevels, gameConfig.bonuses));
        sections.push({
          label: bonus.statLabel ?? bonus.stat,
          type: 'description',
          description: `+1 flotte par niveau — Actuellement : ${maxFleets} flotte${maxFleets > 1 ? 's' : ''} simultanée${maxFleets > 1 ? 's' : ''}`,
          percentPerLevel: bonus.percentPerLevel,
        });
      } else {
        const statLabel = bonus.statLabel ?? bonus.stat;
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
      label: b.statLabel ?? b.stat,
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

      {/* Slag rate for deepSpaceRefining */}
      {researchId === 'deepSpaceRefining' && gameConfig?.universe && (() => {
        const baseRate = Number((gameConfig.universe as Record<string, unknown>).slag_rate ?? 0.5);
        const effectiveRate = baseRate / (1 + currentLevel);
        const nextRate = baseRate / (1 + currentLevel + 1);
        return (
          <div>
            <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
              Taux de scories
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>Taux actuel</span>
                <span className="text-emerald-400">{(effectiveRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Niveau suivant</span>
                <span className="text-emerald-400">{(nextRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Espionage tech — spy mechanics explanation */}
      {researchId === 'espionageTech' && (() => {
        const thresholds = [1, 3, 5, 7, 9];
        const visLabels = ['Ressources', 'Flotte', 'Défenses', 'Bâtiments', 'Recherches'];
        const probeRange = [1, 2, 3, 5, 7, 9, 12];
        const enemyLevel = Math.max(0, currentLevel - 2);
        return (
          <>
            <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Comment fonctionne l'espionnage ?
              </div>
              <div className="text-[11px] text-slate-300 space-y-1.5">
                <p>Envoyez des <span className="text-violet-400">sondes d'espionnage</span> sur une planète ennemie pour obtenir des renseignements.</p>
                <p>Les informations visibles dépendent du <span className="text-emerald-400">nombre de sondes</span> et de la <span className="text-amber-400">différence de niveau</span> entre votre techno espionnage et celle du défenseur.</p>
                <p className="text-slate-500">Formule : Info effective = Sondes − (Niveau ennemi − Votre niveau)</p>
                <p>Plus vous envoyez de sondes, plus vous obtenez d'infos, mais plus le risque de <span className="text-red-400">détection</span> augmente. Si vos sondes sont détectées, elles sont détruites.</p>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Visibilité selon le nombre de sondes
              </div>
              <p className="text-[10px] text-slate-500 mb-2">
                Hypothèse : ennemi niveau {enemyLevel} (votre niveau : {currentLevel})
              </p>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Sondes</th>
                    {visLabels.map((l) => (
                      <th key={l} className="px-1.5 py-1.5 border-b border-[#1e293b] text-center text-[10px]">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {probeRange.map((probes, i) => {
                    const vis = calculateSpyReport(probes, currentLevel, enemyLevel, thresholds);
                    const flags = [vis.resources, vis.fleet, vis.defenses, vis.buildings, vis.research];
                    return (
                      <tr key={probes} className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}>
                        <td className="px-2 py-1.5 text-center font-mono">{probes}</td>
                        {flags.map((f, j) => (
                          <td key={j} className={`px-1.5 py-1.5 text-center ${f ? 'text-emerald-400' : 'text-slate-600'}`}>
                            {f ? '\u2713' : '\u2717'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Risque de détection
              </div>
              <p className="text-[10px] text-slate-500 mb-2">
                Formule : Sondes × 2 − (Votre niv. − Niv. ennemi) × 4, borné entre 0% et 100%
              </p>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Sondes</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right">Détection</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {probeRange.map((probes, i) => {
                    const chance = calculateDetectionChance(probes, currentLevel, enemyLevel);
                    return (
                      <tr key={probes} className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}>
                        <td className="px-2 py-1.5 font-mono">{probes}</td>
                        <td className={`px-2 py-1.5 text-right ${chance >= 50 ? 'text-red-400' : chance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {chance}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-2">
                Augmenter votre niveau d'espionnage réduit la détection de 4% par niveau d'avance sur l'ennemi.
              </p>
            </div>
          </>
        );
      })()}

      {/* Sensor Network — detection mechanics */}
      {researchId === 'sensorNetwork' && (() => {
        const scoreThresholds = [0, 1, 3, 5, 7];
        const timingPercents = [20, 40, 60, 80, 100];
        const tierLabels = ['Alerte', '+ Coordonnées', '+ Nb vaisseaux', '+ Détail flotte', '+ Nom attaquant'];
        const levels = Array.from({ length: 8 }, (_, i) => i + 1);
        return (
          <>
            <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Comment fonctionne la détection ?
              </div>
              <div className="text-[11px] text-slate-300 space-y-1.5">
                <p>Le réseau de capteurs <span className="text-cyan-400">détecte automatiquement</span> les flottes hostiles en approche de vos planètes.</p>
                <p>Le <span className="text-emerald-400">score de détection</span> = votre niveau capteurs − niveau furtivité de l'attaquant.</p>
                <p>Plus le score est élevé, plus la détection est <span className="text-amber-400">précoce</span> (temps restant avant impact) et plus les <span className="text-violet-400">informations</span> sont détaillées.</p>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Paliers de détection
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Score</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-right text-cyan-400">Délai</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Infos visibles</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {scoreThresholds.map((threshold, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-[#1e293b]' : ''}>
                      <td className="px-2 py-1.5 font-mono">≥ {threshold}</td>
                      <td className="px-2 py-1.5 text-right text-cyan-400">{timingPercents[i]}%</td>
                      <td className="px-2 py-1.5 text-[10px]">{tierLabels[i]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-1">
                Délai = % du temps de trajet restant quand l'alerte se déclenche. 100% = détection immédiate au départ.
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Comparatif : votre capteurs vs furtivité ennemie
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Votre niv.</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Furtivité 0</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Furtivité 3</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Furtivité 5</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Furtivité 7</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {levels.map((lvl, i) => (
                    <tr key={lvl} className={`${i % 2 === 0 ? 'bg-[#1e293b]' : ''} ${lvl === currentLevel ? 'ring-1 ring-emerald-500/50' : ''}`}>
                      <td className={`px-2 py-1.5 ${lvl === currentLevel ? 'font-semibold text-emerald-400' : ''}`}>
                        {lvl}{lvl === currentLevel ? ' \u25C4' : ''}
                      </td>
                      {[0, 3, 5, 7].map((stealth) => {
                        const det = calculateAttackDetection(lvl, stealth, scoreThresholds, timingPercents);
                        return (
                          <td key={stealth} className={`px-2 py-1.5 text-center ${det.detectionPercent >= 80 ? 'text-emerald-400' : det.detectionPercent >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                            {det.detectionPercent}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-1">
                Valeurs = % du trajet restant à la détection. Plus c'est élevé, plus vous avez le temps de réagir.
              </p>
            </div>
          </>
        );
      })()}

      {/* Stealth tech — counter-detection mechanics */}
      {researchId === 'stealthTech' && (() => {
        const scoreThresholds = [0, 1, 3, 5, 7];
        const timingPercents = [20, 40, 60, 80, 100];
        const levels = Array.from({ length: 8 }, (_, i) => i + 1);
        return (
          <>
            <div className="bg-[#1e293b] rounded-lg p-3 space-y-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider">
                Comment fonctionne la furtivité ?
              </div>
              <div className="text-[11px] text-slate-300 space-y-1.5">
                <p>La technologie furtive <span className="text-violet-400">réduit l'efficacité</span> du réseau de capteurs ennemi lorsque vous attaquez.</p>
                <p>Le score de détection de l'ennemi = <span className="text-cyan-400">son niveau capteurs</span> − <span className="text-violet-400">votre niveau furtivité</span>.</p>
                <p>Un score plus bas signifie une détection <span className="text-emerald-400">plus tardive</span> et <span className="text-emerald-400">moins d'informations</span> révélées à l'ennemi.</p>
                <p className="text-slate-500">Objectif : dépasser le niveau de capteurs ennemi pour attaquer avec un minimum d'alerte.</p>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Comparatif : votre furtivité vs capteurs ennemis
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Votre niv.</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Capteurs 1</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Capteurs 3</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Capteurs 5</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b] text-center">Capteurs 7</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {levels.map((lvl, i) => (
                    <tr key={lvl} className={`${i % 2 === 0 ? 'bg-[#1e293b]' : ''} ${lvl === currentLevel ? 'ring-1 ring-violet-500/50' : ''}`}>
                      <td className={`px-2 py-1.5 ${lvl === currentLevel ? 'font-semibold text-violet-400' : ''}`}>
                        {lvl}{lvl === currentLevel ? ' \u25C4' : ''}
                      </td>
                      {[1, 3, 5, 7].map((sensor) => {
                        const det = calculateAttackDetection(sensor, lvl, scoreThresholds, timingPercents);
                        const score = sensor - lvl;
                        let label: string;
                        if (score < 0) {
                          label = `${det.detectionPercent}%`;
                        } else {
                          label = `${det.detectionPercent}%`;
                        }
                        return (
                          <td key={sensor} className={`px-2 py-1.5 text-center ${det.detectionPercent <= 20 ? 'text-emerald-400' : det.detectionPercent <= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                            {label}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-1">
                Valeurs = % du trajet restant quand l'ennemi vous détecte. Plus c'est bas, mieux c'est pour vous.
              </p>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider mb-2">
                Informations masquées par niveau
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-slate-500 text-left">
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Votre furtivité</th>
                    <th className="px-2 py-1.5 border-b border-[#1e293b]">Masqué contre capteurs 5</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  {[0, 1, 3, 5, 6, 7].map((stealth, i) => {
                    const det = calculateAttackDetection(5, stealth, scoreThresholds, timingPercents);
                    const vis = det.visibility;
                    const hidden: string[] = [];
                    if (!vis.attackerName) hidden.push('Nom');
                    if (!vis.shipDetails) hidden.push('Détail flotte');
                    if (!vis.shipCount) hidden.push('Nb vaisseaux');
                    if (!vis.originCoords) hidden.push('Coordonnées');
                    return (
                      <tr key={stealth} className={`${i % 2 === 0 ? 'bg-[#1e293b]' : ''} ${stealth === currentLevel ? 'ring-1 ring-violet-500/50' : ''}`}>
                        <td className={`px-2 py-1.5 ${stealth === currentLevel ? 'font-semibold text-violet-400' : ''}`}>
                          {stealth}{stealth === currentLevel ? ' \u25C4' : ''}
                        </td>
                        <td className="px-2 py-1.5 text-[10px]">
                          {hidden.length > 0 ? (
                            <span className="text-emerald-400">{hidden.join(', ')}</span>
                          ) : (
                            <span className="text-red-400">Rien — détection complète</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 mt-1">
                Contre un ennemi avec capteurs niv. 5 : chaque point de furtivité masque des informations supplémentaires.
              </p>
            </div>
          </>
        );
      })()}

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
                    const isFleetCount = progressionData.bonuses[j].stat === 'fleet_count';
                    return (
                      <td key={j} className={`px-2 py-1.5 text-right ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {row.level === 0 ? '\u2014' : isFleetCount ? `${1 + row.level}` : `${isPositive ? '+' : ''}${v.totalPct}%`}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right text-slate-500">
                    {progressionData.bonuses.map((b) => b.stat === 'fleet_count' ? '+1' : `${b.percentPerLevel > 0 ? '+' : ''}${b.percentPerLevel}%`).join(', ')}
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
