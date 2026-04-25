import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ReportHero } from './shared/ReportHero';
import { ResourceDeltaCard } from './shared/ResourceDeltaCard';
import { CombatReportDetail } from './CombatReportDetail';
import { getShipName } from '@/lib/entity-names';
import { cn } from '@/lib/utils';

interface Props {
  result: Record<string, any>;
  fleet: { ships: Record<string, number>; totalCargo: number };
  gameConfig: any;
  coordinates: { galaxy: number; system: number; position: number };
  reportId: string;
}

function PirateIcon() {
  return (
    <svg viewBox="0 0 72 72" width="72" height="72" fill="none" stroke="#fb7185" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 50 l14 -10 h28 l14 10 l-10 8 h-36 Z" fill="#7f1d1d" />
      <circle cx="36" cy="26" r="11" fill="#0f172a" stroke="#fb7185" />
      <circle cx="32" cy="25" r="2" fill="#fb7185" stroke="none" />
      <circle cx="40" cy="25" r="2" fill="#fb7185" stroke="none" />
      <path d="M32 32 l2 2 l2 -2 l2 2 l2 -2" />
      <path d="M22 46 l-4 -10" />
      <path d="M50 46 l4 -10" />
    </svg>
  );
}

function ShipGrid({ ships, gameConfig }: { ships: Record<string, number>; gameConfig: any }) {
  const entries = Object.entries(ships).filter(([, n]) => n > 0);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground italic">Aucune</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(([id, n]) => (
        <span key={id} className="text-sm">
          <span className="text-foreground font-medium">{n}x</span>{' '}
          <span className="text-muted-foreground">{id === 'flagship' ? (gameConfig?.ships?.flagship?.name ?? 'Vaisseau amiral') : getShipName(id, gameConfig)}</span>
        </span>
      ))}
    </div>
  );
}

function fmt(n: number) { return Math.round(n).toLocaleString('fr-FR'); }

export function ColonizationRaidReportDetail({ result, fleet, gameConfig, coordinates, reportId: _reportId }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const progressPenalty = Number(result.progressPenalty ?? 0);
  const pillage = (result.pillaged ?? result.pillage ?? { minerai: 0, silicium: 0, hydrogene: 0 }) as { minerai: number; silicium: number; hydrogene: number };

  // No garrison variant
  if (result.hasGarrison === false) {
    const pirateFleet = (result.pirateFleet as Record<string, number>) ?? fleet.ships;
    return (
      <div className="space-y-4">
        <ReportHero
          coords={coordinates}
          title="Pillage sans résistance"
          statusLabel="Raid pirate"
          status="danger"
          icon={<PirateIcon />}
          lore="Les pirates ont pillé le chantier. Votre embryon de colonie saigne."
        />
        <ResourceDeltaCard
          title="Pillé"
          cargo={pillage}
          variant="loss"
          explainer="Déployez une garnison pour limiter les prochains pillages."
        />
        <div className="glass-card p-4 border border-rose-500/20 bg-rose-500/5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Progression perdue
          </h3>
          <div className="text-lg font-bold text-rose-400 tabular-nums">−{fmt(progressPenalty)}%</div>
          <p className="text-[11px] text-muted-foreground mt-2 italic">
            La colonisation a reculé.
          </p>
        </div>
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Flotte pirate</h3>
          <ShipGrid ships={pirateFleet} gameConfig={gameConfig} />
        </div>
      </div>
    );
  }

  // Combat variants
  const outcome = result.outcome as 'attacker' | 'defender' | 'draw';
  const attackerFP = Number(result.attackerFP ?? 0);
  const defenderFP = Number(result.defenderFP ?? 0);
  const totalFP = attackerFP + defenderFP || 1;
  const roundCount = Number(result.roundCount ?? 0);
  const defenderLosses = (result.defenderLosses as Record<string, number>) ?? {};
  const attackerLosses = (result.attackerLosses as Record<string, number>) ?? {};

  let heroProps: { title: string; statusLabel: string; status: 'success' | 'warning' | 'danger'; lore?: string };
  if (outcome === 'defender') {
    heroProps = { title: 'Raid repoussé', statusLabel: 'Garnison victorieuse', status: 'success', lore: 'Les pirates ont battu en retraite.' };
  } else if (outcome === 'draw') {
    heroProps = { title: 'Raid contenu', statusLabel: 'Égalité', status: 'warning' };
  } else {
    heroProps = { title: 'Garnison défaite', statusLabel: 'Raid pirate', status: 'danger', lore: 'Les défenseurs ont tenu, puis cédé.' };
  }

  const outcomeText = outcome === 'defender' ? 'Garnison victorieuse' : outcome === 'draw' ? 'Match nul' : 'Pirates victorieux';

  return (
    <div className="space-y-4">
      <ReportHero
        coords={coordinates}
        title={heroProps.title}
        statusLabel={heroProps.statusLabel}
        status={heroProps.status}
        icon={<PirateIcon />}
        lore={heroProps.lore}
      />

      {/* Combat summary card */}
      <div className="glass-card p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Résumé combat</h3>

        {/* FP bar */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>Pirates · <span className="text-rose-400 tabular-nums">{fmt(attackerFP)}</span> FP</span>
            <span><span className="text-cyan-400 tabular-nums">{fmt(defenderFP)}</span> FP · Garnison</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-800">
            <div className="bg-rose-500/80" style={{ width: `${(attackerFP / totalFP) * 100}%` }} />
            <div className="bg-cyan-500/80" style={{ width: `${(defenderFP / totalFP) * 100}%` }} />
          </div>
        </div>

        {/* Round count + outcome label */}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{roundCount} round{roundCount > 1 ? 's' : ''}</span>
          <span className={cn(
            'font-semibold',
            outcome === 'defender' ? 'text-emerald-400' : outcome === 'draw' ? 'text-amber-400' : 'text-rose-400',
          )}>
            {outcomeText}
          </span>
        </div>

        {/* Losses */}
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Pertes garnison</div>
          <ShipGrid ships={defenderLosses} gameConfig={gameConfig} />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Pertes pirates</div>
          <ShipGrid ships={attackerLosses} gameConfig={gameConfig} />
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen(!detailOpen)}
          className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors pt-2 border-t border-border/50"
        >
          <span>{detailOpen ? 'Masquer le détail' : 'Voir le détail du combat'}</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', detailOpen && 'rotate-180')} />
        </button>
      </div>

      {detailOpen && (
        <div className="border-l-2 border-border/50 pl-4">
          <CombatReportDetail result={result} missionType="pirate" gameConfig={gameConfig} coordinates={coordinates} />
        </div>
      )}

      {outcome === 'attacker' && (
        <ResourceDeltaCard title="Pillé" cargo={pillage} variant="loss" />
      )}

      {progressPenalty > 0 && (
        <div className={cn(
          'glass-card p-4 border',
          outcome === 'attacker' ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/20 bg-amber-500/5',
        )}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Progression perdue
          </h3>
          <div className={cn(
            'text-lg font-bold tabular-nums',
            outcome === 'attacker' ? 'text-rose-400' : 'text-amber-400',
          )}>
            −{fmt(progressPenalty)}%
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 italic">
            {outcome === 'draw'
              ? 'Pénalité réduite de moitié grâce à la résistance.'
              : 'La colonisation a reculé.'}
          </p>
        </div>
      )}

      {outcome === 'defender' && progressPenalty === 0 && (
        <div className="glass-card p-4 border border-emerald-500/20 bg-emerald-500/5">
          <p className="text-sm text-emerald-300">Aucune perte de progression — la garnison a protégé le chantier.</p>
        </div>
      )}
    </div>
  );
}
