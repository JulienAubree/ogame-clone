import type { JSX } from 'react';
import { Link } from 'react-router';
import { Eye, Sword, User } from 'lucide-react';
import type { AllianceLog, AllianceLogPayload } from '@exilium/shared';
import { timeAgo } from '@/lib/format';

function iconFor(type: AllianceLogPayload['type']): JSX.Element {
  if (type.startsWith('combat.')) return <Sword className="h-4 w-4" aria-hidden="true" />;
  if (type.startsWith('espionage.')) return <Eye className="h-4 w-4" aria-hidden="true" />;
  return <User className="h-4 w-4" aria-hidden="true" />;
}

function outcomeLabel(o: 'victory' | 'defeat' | 'draw'): string {
  return o === 'victory' ? 'Victoire' : o === 'defeat' ? 'Défaite' : 'Match nul';
}

function renderSentence(p: AllianceLogPayload): JSX.Element {
  switch (p.type) {
    case 'combat.defense':
      return (
        <span>
          <strong>{p.memberName}</strong> a été attaqué par <strong>{p.attackerName}</strong>
          {p.attackerAllianceTag ? <> [{p.attackerAllianceTag}]</> : null} sur {p.planetName} [{p.coords}].{' '}
          <em>{outcomeLabel(p.outcome)}.</em>
        </span>
      );
    case 'combat.attack':
      return (
        <span>
          <strong>{p.memberName}</strong> a attaqué <strong>{p.targetName}</strong>
          {p.targetAllianceTag ? <> [{p.targetAllianceTag}]</> : null} sur {p.planetName} [{p.coords}].{' '}
          <em>{outcomeLabel(p.outcome)}.</em>
        </span>
      );
    case 'espionage.incoming':
      return (
        <span>
          <strong>{p.memberName}</strong> a été espionné par <strong>{p.spyName}</strong>
          {p.spyAllianceTag ? <> [{p.spyAllianceTag}]</> : null} sur {p.planetName} [{p.coords}].
        </span>
      );
    case 'espionage.outgoing':
      return (
        <span>
          <strong>{p.memberName}</strong> a espionné <strong>{p.targetName}</strong>
          {p.targetAllianceTag ? <> [{p.targetAllianceTag}]</> : null} sur {p.planetName} [{p.coords}].
        </span>
      );
    case 'member.joined':
      return (
        <span>
          <strong>{p.memberName}</strong> a rejoint l'alliance
          {p.via === 'invitation' ? ' (invitation)' : ' (candidature)'}.
        </span>
      );
    case 'member.left':
      return <span><strong>{p.memberName}</strong> a quitté l'alliance.</span>;
    case 'member.kicked':
      return (
        <span>
          <strong>{p.memberName}</strong> a été expulsé par <strong>{p.byName}</strong>.
        </span>
      );
    case 'member.promoted':
      return (
        <span>
          <strong>{p.memberName}</strong> a été promu officier par <strong>{p.byName}</strong>.
        </span>
      );
    case 'member.demoted':
      return (
        <span>
          <strong>{p.memberName}</strong> a été rétrogradé membre par <strong>{p.byName}</strong>.
        </span>
      );
    default: {
      const _never: never = p;
      void _never;
      return <span>Activité inconnue.</span>;
    }
  }
}

function hasReport(p: AllianceLogPayload): p is AllianceLogPayload & { reportId: string } {
  return p.type === 'combat.defense' || p.type === 'combat.attack'
    || p.type === 'espionage.incoming' || p.type === 'espionage.outgoing';
}

type Props = { log: AllianceLog };

export function ActivityFeedItem({ log }: Props) {
  const p = log.payload;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{iconFor(p.type)}</span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</div>
        <div className="mt-0.5">{renderSentence(p)}</div>
        {hasReport(p) && (
          <Link to={`/reports/${p.reportId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
            Voir le rapport
          </Link>
        )}
      </div>
    </li>
  );
}
