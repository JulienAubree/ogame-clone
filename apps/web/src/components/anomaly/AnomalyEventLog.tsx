import { Sparkles } from 'lucide-react';
import { useGameConfig } from '@/hooks/useGameConfig';
import { formatNumber } from '@/lib/format';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';

interface OutcomeApplied {
  minerai?: number;
  silicium?: number;
  hydrogene?: number;
  exilium?: number;
  hullDelta?: number;
  shipsGain?: Record<string, number>;
  shipsLoss?: Record<string, number>;
}

interface EventLogEntry {
  depth: number;
  eventId: string;
  choiceIndex: number;
  outcomeApplied: OutcomeApplied;
  resolvedAt: string;
}

interface AnomalyEvent {
  id: string;
  title: string;
  choices: Array<{ label: string }>;
}

interface Props {
  log: EventLogEntry[];
  events: AnomalyEvent[];
}

/**
 * Compact list of resolved events during the current run. Sits next to the
 * combat reports — events don't generate full reports in V3, so this is the
 * only trace of what happened.
 */
export function AnomalyEventLog({ log, events }: Props) {
  if (log.length === 0) return null;

  const eventById = new Map(events.map((e) => [e.id, e]));

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-violet-400" />
        Événements résolus
      </h3>
      <ul className="space-y-1.5 text-xs">
        {log.map((entry, i) => {
          const def = eventById.get(entry.eventId);
          const choice = def?.choices[entry.choiceIndex];
          return (
            <li key={i} className="flex items-start gap-2 rounded border border-violet-500/15 bg-violet-500/5 px-2 py-1.5">
              <span className="text-violet-300 font-mono text-[10px] tabular-nums shrink-0 mt-0.5">
                P{entry.depth}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-foreground/85">
                  <span className="font-semibold">{def?.title ?? entry.eventId}</span>
                  {choice && <span className="text-muted-foreground"> · {choice.label}</span>}
                </div>
                <OutcomeLine outcome={entry.outcomeApplied} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: OutcomeApplied }) {
  const { data: gameConfig } = useGameConfig();
  const parts: React.ReactNode[] = [];
  const r = outcome;
  if (r.minerai && r.minerai !== 0)
    parts.push(<span key="m" className="text-minerai">{r.minerai > 0 ? '+' : '−'}{formatNumber(Math.abs(r.minerai))} M</span>);
  if (r.silicium && r.silicium !== 0)
    parts.push(<span key="s" className="text-silicium">{r.silicium > 0 ? '+' : '−'}{formatNumber(Math.abs(r.silicium))} Si</span>);
  if (r.hydrogene && r.hydrogene !== 0)
    parts.push(<span key="h" className="text-hydrogene">{r.hydrogene > 0 ? '+' : '−'}{formatNumber(Math.abs(r.hydrogene))} H</span>);
  if (r.exilium && r.exilium !== 0)
    parts.push(
      <span key="ex" className={r.exilium > 0 ? 'text-purple-300' : 'text-red-300'}>
        <ExiliumIcon size={10} className="inline mr-0.5" />{r.exilium > 0 ? '+' : ''}{r.exilium}
      </span>,
    );
  if (r.hullDelta && r.hullDelta !== 0) {
    const pct = Math.round(r.hullDelta * 100);
    parts.push(
      <span key="hull" className={pct > 0 ? 'text-emerald-400' : 'text-red-400'}>
        Coque {pct > 0 ? '+' : ''}{pct}%
      </span>,
    );
  }
  for (const [shipId, count] of Object.entries(r.shipsGain ?? {})) {
    if (count > 0) {
      const name = gameConfig?.ships?.[shipId]?.name ?? shipId;
      parts.push(<span key={`g-${shipId}`} className="text-emerald-300">+{count} {name}</span>);
    }
  }
  for (const [shipId, count] of Object.entries(r.shipsLoss ?? {})) {
    if (count > 0) {
      const name = gameConfig?.ships?.[shipId]?.name ?? shipId;
      parts.push(<span key={`l-${shipId}`} className="text-red-300">−{count} {name}</span>);
    }
  }
  if (parts.length === 0) {
    return <span className="text-muted-foreground/70 italic text-[11px]">Sans effet matériel</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] mt-0.5">
      {parts}
    </div>
  );
}
