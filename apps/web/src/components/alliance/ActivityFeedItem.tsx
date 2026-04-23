import type { JSX } from 'react';
import type { AllianceLog, AllianceLogPayload } from '@exilium/shared';
import { timeAgo } from '@/lib/format';

function SwordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function iconFor(type: AllianceLogPayload['type']): JSX.Element {
  if (type.startsWith('combat.')) return <SwordIcon />;
  if (type.startsWith('espionage.')) return <EyeIcon />;
  return <UserIcon />;
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
    <li className="flex items-start gap-3 border-b border-border/40 py-3 last:border-b-0">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{iconFor(p.type)}</span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-xs text-muted-foreground">{timeAgo(log.createdAt)}</div>
        <div className="mt-0.5">{renderSentence(p)}</div>
        {hasReport(p) && (
          <a href={`/reports/${p.reportId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
            Voir le rapport
          </a>
        )}
      </div>
    </li>
  );
}
