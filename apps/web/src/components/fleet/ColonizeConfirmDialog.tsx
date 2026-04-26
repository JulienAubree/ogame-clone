import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { calculateColonizationDifficulty } from '@exilium/game-engine';
import { Telescope, Package, Clock, ShieldAlert, Hourglass, Globe } from 'lucide-react';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  target: { galaxy: number; system: number; position: number };
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

export function ColonizeConfirmDialog({ open, onConfirm, onCancel, target }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  const { data: gameConfig } = useGameConfig();
  const { data: governance } = trpc.colonization.governance.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const { data: galaxyView } = trpc.galaxy.system.useQuery(
    { galaxy: target.galaxy, system: target.system },
    { enabled: open && !!target.galaxy },
  );

  if (!open) return null;

  const universe = gameConfig?.universe ?? {};
  const ipcLevel = governance?.ipcLevel ?? 0;
  const sf = Number(universe['colonization_cost_scaling_factor']) || 0.5;
  const scale = (base: number) => base * (1 + sf * ipcLevel);

  const baseMinerai = Number(universe['colonization_consumption_minerai']) || 200;
  const baseSilicium = Number(universe['colonization_consumption_silicium']) || 100;
  const consumptionMinerai = scale(baseMinerai);
  const consumptionSilicium = scale(baseSilicium);

  const baseOutpostMinerai = Number(universe['colonization_outpost_threshold_minerai']) || 500;
  const baseOutpostSilicium = Number(universe['colonization_outpost_threshold_silicium']) || 250;
  const outpostMinerai = scale(baseOutpostMinerai);
  const outpostSilicium = scale(baseOutpostSilicium);

  const passiveRate = Number(universe['colonization_passive_rate']) || 0.10;
  const gracePeriodHours = Number(universe['colonization_grace_period_hours']) || 1;
  const outpostTimeoutHours = Number(universe['colonization_outpost_timeout_hours']) || 24;
  const raidIntervalMin = Number(universe['colonization_raid_interval_min']) || 3600;
  const raidIntervalMax = Number(universe['colonization_raid_interval_max']) || 5400;
  const garrisonFpThreshold = Number(universe['colonization_rate_garrison_fp_threshold']) || 50;
  const garrisonBonus = Number(universe['colonization_rate_garrison_bonus']) || 0.05;
  const convoyBonus = Number(universe['colonization_rate_convoy_bonus']) || 0.05;
  const convoyWindowHours = Number(universe['colonization_rate_convoy_window_hours']) || 2;

  // Target info from galaxy view
  const targetSlot = galaxyView?.slots?.find((s) => s !== null && s.position === target.position);
  const planetClassId =
    targetSlot && 'planetClassId' in targetSlot ? (targetSlot.planetClassId as string | null) : null;
  const planetTypeName = gameConfig?.planetTypes.find((t) => t.id === planetClassId)?.name ?? null;

  // Difficulty factor
  const homeworld = planets?.find((p) => p.planetClassId === 'homeworld');
  const homeworldSystem = homeworld?.system ?? target.system;
  const difficultyMap: Record<string, number> = {
    temperate: Number(universe['colonization_difficulty_temperate']) || 1.0,
    arid: Number(universe['colonization_difficulty_arid']) || 0.95,
    glacial: Number(universe['colonization_difficulty_glacial']) || 0.95,
    volcanic: Number(universe['colonization_difficulty_volcanic']) || 0.90,
    gaseous: Number(universe['colonization_difficulty_gaseous']) || 0.90,
  };
  const distancePenaltyPerHop = Number(universe['colonization_distance_penalty_per_hop']) || 0.01;
  const distanceFloor = Number(universe['colonization_distance_floor']) || 0.90;
  const difficulty = planetClassId
    ? calculateColonizationDifficulty(
        planetClassId,
        homeworldSystem,
        target.system,
        difficultyMap,
        distancePenaltyPerHop,
        distanceFloor,
      )
    : 1.0;
  const typeFactor = planetClassId ? (difficultyMap[planetClassId] ?? 0.9) : 1.0;
  const distanceFactor = planetClassId ? difficulty / typeFactor : 1.0;

  const effectiveRate = passiveRate * difficulty;
  const estimatedHours = effectiveRate > 0 ? 1 / effectiveRate : Infinity;

  const coords = `[${target.galaxy}:${target.system}:${target.position}]`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-emerald-500/30 bg-card shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 to-transparent px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/15 p-2 border border-emerald-500/30">
              <Globe className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">Coloniser {coords}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {planetTypeName ? `Planète ${planetTypeName.toLowerCase()}` : 'Type inconnu'}
                {' · '}Avant le départ, voici ce qui vous attend.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3">
          {/* Difficulty */}
          <Section icon={<Telescope className="h-4 w-4" />} color="cyan" title="Difficulté de colonisation">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <Stat label="Type planète" value={`×${typeFactor.toFixed(2)}`} hint={planetTypeName ?? 'Inconnu'} />
              <Stat label="Distance" value={`×${distanceFactor.toFixed(2)}`} hint={`${Math.abs(target.system - homeworldSystem)} systèmes`} />
              <Stat label="Total" value={`×${difficulty.toFixed(2)}`} highlight />
            </div>
            <p className="mt-2 text-[11px] text-cyan-300/70">
              Taux de progression effectif : <span className="font-semibold text-cyan-300">{(effectiveRate * 100).toFixed(1)}%/h</span>
              {' '}(base {Math.round(passiveRate * 100)}% × difficulté).
            </p>
          </Section>

          {/* Outpost establishment */}
          <Section icon={<Package className="h-4 w-4" />} color="emerald" title="Établissement de l'avant-poste">
            <p className="text-xs text-slate-300">
              Pour activer la colonisation, livrez sur place :
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <ResourcePill label="Minerai" value={fmt(outpostMinerai)} color="amber" />
              <ResourcePill label="Silicium" value={fmt(outpostSilicium)} color="slate" />
            </div>
            <p className="mt-2 text-[11px] text-amber-300/80">
              Délai : <span className="font-semibold">{outpostTimeoutHours}h</span> sinon la colonisation échoue.
            </p>
          </Section>

          {/* Recurring consumption */}
          <Section icon={<Clock className="h-4 w-4" />} color="amber" title="Consommation récurrente">
            <p className="text-xs text-slate-300">
              Une fois l'avant-poste établi, la colonie consomme par heure :
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <ResourcePill label="Minerai/h" value={fmt(consumptionMinerai)} color="amber" />
              <ResourcePill label="Silicium/h" value={fmt(consumptionSilicium)} color="slate" />
            </div>
            <p className="mt-2 text-[11px] text-amber-300/70">
              Stock épuisé : progression divisée par 2. Pensez à ravitailler par mission Transport.
            </p>
          </Section>

          {/* Pirate raids */}
          <Section icon={<ShieldAlert className="h-4 w-4" />} color="red" title="Raids pirates">
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
              <li>
                Grâce initiale : <span className="font-semibold text-emerald-400">{gracePeriodHours}h</span> sans risque après l'établissement.
              </li>
              <li>
                Puis raids aléatoires toutes les <span className="font-semibold text-red-300">{Math.round(raidIntervalMin / 60)}–{Math.round(raidIntervalMax / 60)} min</span>, puissance croissante.
              </li>
              <li>
                Sans garnison : ressources pillées, progression nettement réduite. Avec garnison : combat, pillage limité.
              </li>
            </ul>
          </Section>

          {/* Bonus possibles */}
          <Section icon={<Hourglass className="h-4 w-4" />} color="violet" title="Accélérer la progression">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-violet-950/30 border border-violet-500/20 p-2">
                <div className="text-violet-300 font-semibold">+{Math.round(garrisonBonus * 100)}%/h Garnison</div>
                <p className="text-slate-400 text-[11px] mt-0.5">Stationner ≥ {garrisonFpThreshold} FP de flotte</p>
              </div>
              <div className="rounded bg-violet-950/30 border border-violet-500/20 p-2">
                <div className="text-violet-300 font-semibold">+{Math.round(convoyBonus * 100)}%/h Convoi récent</div>
                <p className="text-slate-400 text-[11px] mt-0.5">Tout transport reçu &lt; {convoyWindowHours}h</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Cumulables, plafonnés à +30%/h.</p>
          </Section>

          {/* Estimation */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-4 py-3 flex items-center justify-between">
            <div className="text-xs text-slate-300">
              Estimation à 100% sans bonus, sans rupture de stock :
            </div>
            <div className="text-lg font-bold text-emerald-300">
              {Number.isFinite(estimatedHours) ? `~${Math.round(estimatedHours)} h` : '—'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3 bg-card">
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
          <Button onClick={onConfirm} className="bg-emerald-600 hover:bg-emerald-700">
            Envoyer le vaisseau
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

const COLOR_CLASSES = {
  cyan: { border: 'border-cyan-500/20', bg: 'bg-cyan-950/20', text: 'text-cyan-400', icon: 'bg-cyan-500/15' },
  emerald: { border: 'border-emerald-500/20', bg: 'bg-emerald-950/20', text: 'text-emerald-400', icon: 'bg-emerald-500/15' },
  amber: { border: 'border-amber-500/20', bg: 'bg-amber-950/20', text: 'text-amber-400', icon: 'bg-amber-500/15' },
  red: { border: 'border-red-500/20', bg: 'bg-red-950/20', text: 'text-red-400', icon: 'bg-red-500/15' },
  violet: { border: 'border-violet-500/20', bg: 'bg-violet-950/20', text: 'text-violet-400', icon: 'bg-violet-500/15' },
} as const;

function Section({
  icon,
  color,
  title,
  children,
}: {
  icon: React.ReactNode;
  color: keyof typeof COLOR_CLASSES;
  title: string;
  children: React.ReactNode;
}) {
  const c = COLOR_CLASSES[color];
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} px-3.5 py-3`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`${c.icon} ${c.text} rounded p-1`}>{icon}</div>
        <div className={`text-[11px] uppercase tracking-wider font-semibold ${c.text}`}>{title}</div>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: boolean }) {
  return (
    <div className={`rounded bg-[#0d1628] px-2.5 py-2 ${highlight ? 'ring-1 ring-cyan-500/40' : ''}`}>
      <div className="text-[10px] uppercase text-slate-500 tracking-wider">{label}</div>
      <div className={`text-sm font-bold ${highlight ? 'text-cyan-300' : 'text-slate-200'}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function ResourcePill({ label, value, color }: { label: string; value: string; color: 'amber' | 'slate' }) {
  const colorClass = color === 'amber' ? 'text-amber-300 border-amber-500/30 bg-amber-950/30' : 'text-slate-200 border-slate-500/30 bg-slate-900/50';
  return (
    <div className={`rounded-md border ${colorClass} px-3 py-1.5 text-xs flex items-center gap-2`}>
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}
