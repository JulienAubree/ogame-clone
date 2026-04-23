import { useEffect, useState } from 'react';
import { Timer } from '@/components/common/Timer';
import { cn } from '@/lib/utils';
import { ResearchIcon, BuildingsIcon, GalaxyIcon, FlagshipIcon, EmpireIcon } from '@/lib/icons';

type AnnexDetail = { buildingId: string; level: number; planetName: string };
type ResearchBonuses = {
  labLevel: number;
  labMultiplier: number;
  annexMultiplier: number;
  biomeMultiplier: number;
  talentMultiplier: number;
  hullMultiplier: number;
  totalMultiplier: number;
  annexLevelsSum: number;
  discoveredBiomesCount: number;
  annexDetails: AnnexDetail[];
};

type ResearchingTech = {
  id: string;
  name: string;
  currentLevel: number;
  nextLevelTime: number;
  researchEndTime: string | null;
  researchStartTime?: string | null;
} | null;

interface ResearchActivePanelProps {
  bonuses: ResearchBonuses;
  researchingTech: ResearchingTech;
  onTimerComplete: () => void;
  onCancel: () => void;
  cancelPending: boolean;
}

const ANNEX_NAMES: Record<string, string> = {
  labVolcanic: 'Forge Volcanique',
  labArid: 'Laboratoire Aride',
  labTemperate: 'Bio-Laboratoire',
  labGlacial: 'Cryo-Laboratoire',
  labGaseous: 'Nebula-Lab',
};

export function ResearchActivePanel({
  bonuses,
  researchingTech,
  onTimerComplete,
  onCancel,
  cancelPending,
}: ResearchActivePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!researchingTech?.researchEndTime) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [researchingTech?.researchEndTime]);

  const totalReduction = Math.round((1 - bonuses.totalMultiplier) * 100);
  const labReduction = Math.round((1 - bonuses.labMultiplier) * 100);
  const annexReduction = Math.round((1 - bonuses.annexMultiplier) * 100);
  const biomeReduction = Math.round((1 - bonuses.biomeMultiplier) * 100);
  const talentReduction = Math.round((1 - bonuses.talentMultiplier) * 100);
  const hullReduction = Math.round((1 - bonuses.hullMultiplier) * 100);

  // Progress of current research (0–100)
  let progressPercent = 0;
  if (researchingTech?.researchEndTime) {
    const end = new Date(researchingTech.researchEndTime).getTime();
    const totalMs = researchingTech.nextLevelTime * 1000;
    const start = end - totalMs;
    progressPercent = Math.max(0, Math.min(100, ((nowTick - start) / totalMs) * 100));
  }

  return (
    <div
      className={cn(
        'mt-4 rounded-xl border bg-black/30 backdrop-blur-sm overflow-hidden transition-colors',
        expanded ? 'border-violet-500/40 shadow-lg shadow-violet-500/5' : 'border-white/10',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
        aria-expanded={expanded}
      >
        <div className="relative shrink-0">
          <ResearchIcon width={18} height={18} className="text-violet-400" />
          {researchingTech && (
            <span className="absolute -top-1 -right-1 inline-flex h-2 w-2 rounded-full bg-violet-400 shadow shadow-violet-400/40 animate-pulse" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 text-xs">
            {researchingTech ? (
              <>
                <span className="font-semibold text-foreground truncate">
                  {researchingTech.name} <span className="text-muted-foreground font-normal">Niv. {researchingTech.currentLevel + 1}</span>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground italic">Aucune recherche en cours</span>
            )}
            <span className="ml-auto rounded bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 shrink-0">
              −{totalReduction}% vitesse
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500 ease-linear',
                  researchingTech ? 'bg-gradient-to-r from-violet-500 to-violet-300' : 'bg-white/10',
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {researchingTech?.researchEndTime && (
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                fin {new Date(researchingTech.researchEndTime).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-white/5 px-3.5 py-3 space-y-3">
          {researchingTech && researchingTech.researchEndTime && (
            <div className="rounded-lg bg-white/5 border-l-2 border-l-violet-400 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {researchingTech.name} <span className="text-muted-foreground">Niv. {researchingTech.currentLevel + 1}</span>
                </span>
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelPending}
                  className="text-xs text-destructive hover:text-destructive/80 font-medium"
                >
                  Annuler
                </button>
              </div>
              <Timer
                endTime={new Date(researchingTech.researchEndTime)}
                totalDuration={researchingTech.nextLevelTime}
                onComplete={onTimerComplete}
              />
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Labs */}
            <div className="flex-1 space-y-2">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-violet-400 flex items-center gap-1.5">
                <BuildingsIcon width={14} height={14} />
                Laboratoires de l'empire
              </h3>
              <div className="space-y-1">
                <div className="flex items-center gap-2 bg-card/50 border border-white/10 rounded-lg px-3 py-1.5">
                  <ResearchIcon width={14} height={14} className="text-violet-400 shrink-0" />
                  <span className="text-xs text-foreground font-medium">Laboratoire de recherche</span>
                  <span className="ml-auto text-xs text-violet-400 font-semibold">Niv. {bonuses.labLevel}</span>
                </div>
                {bonuses.annexDetails.map((annex, i) => (
                  <div key={i} className="flex items-center gap-2 bg-card/50 border border-white/10 rounded-lg px-3 py-1.5">
                    <BuildingsIcon width={12} height={12} className="text-violet-400/60 shrink-0" />
                    <span className="text-xs text-foreground truncate">{ANNEX_NAMES[annex.buildingId] ?? annex.buildingId}</span>
                    <span className="text-[10px] text-muted-foreground truncate">({annex.planetName})</span>
                    <span className="ml-auto text-xs text-violet-400/80 font-semibold shrink-0">Niv. {annex.level}</span>
                  </div>
                ))}
                {bonuses.annexDetails.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic px-1">Aucun laboratoire annexe</p>
                )}
              </div>
            </div>

            <div className="hidden lg:block w-px bg-white/10" />
            <div className="lg:hidden h-px bg-white/10" />

            {/* Bonuses breakdown */}
            <div className="flex-1 space-y-2">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-1.5">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Bonus de vitesse
              </h3>
              <div className="space-y-0.5">
                <BonusLine icon={<ResearchIcon width={12} height={12} />} label="Labo principal" detail={`Niv. ${bonuses.labLevel}`} reduction={labReduction} color="text-violet-400" />
                <BonusLine icon={<BuildingsIcon width={12} height={12} />} label="Labos annexes" detail={`${bonuses.annexLevelsSum} niv.`} reduction={annexReduction} color="text-violet-400" />
                <BonusLine icon={<GalaxyIcon width={12} height={12} />} label="Biomes actifs" detail={`${bonuses.discoveredBiomesCount}`} reduction={biomeReduction} color="text-amber-400" />
                {talentReduction > 0 && <BonusLine icon={<EmpireIcon width={12} height={12} />} label="Talents" reduction={talentReduction} color="text-emerald-400" />}
                {hullReduction > 0 && <BonusLine icon={<FlagshipIcon width={12} height={12} />} label="Vaisseau amiral" reduction={hullReduction} color="text-cyan-400" />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BonusLine({ icon, label, detail, reduction, color }: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  reduction: number;
  color: string;
}) {
  const active = reduction > 0;
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className={cn('shrink-0', active ? color : 'text-muted-foreground/50')}>{icon}</span>
      <span className={cn('text-[11px] flex-1 min-w-0 truncate', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        {detail && <span className="text-muted-foreground ml-1">({detail})</span>}
      </span>
      <span className={cn('text-[11px] font-semibold shrink-0', active ? 'text-emerald-400' : 'text-muted-foreground/50')}>−{reduction}%</span>
      <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden shrink-0">
        <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${Math.min(reduction, 100)}%` }} />
      </div>
    </div>
  );
}
