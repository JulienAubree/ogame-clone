/**
 * Renvoie un préfixe `[Nom] ` à coller devant le titre/message d'une notification
 * lorsqu'on connaît la planète concernée. Lit dans cet ordre :
 *   payload.planetName (building/research/shipyard, market)
 *   payload.originName (fleet-arrived/returned, pve-mission-done)
 *   payload.targetPlanetName (fleet-inbound/hostile, attack-landed, flagship)
 * Retourne '' s'il n'y a pas de planète associée (friend, message, etc.).
 */
export function planetPrefix(payload?: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const p = payload as Record<string, unknown>;
  const name = p.planetName ?? p.originName ?? p.targetPlanetName;
  return typeof name === 'string' && name.length > 0 ? `[${name}] ` : '';
}

export function eventTypeColor(type: string) {
  switch (type) {
    case 'building-done': return 'bg-primary';
    case 'research-done': return 'bg-violet-500';
    case 'shipyard-done': return 'bg-orange-500';
    case 'fleet-arrived': return 'bg-blue-500';
    case 'fleet-returned': return 'bg-emerald-500';
    case 'pve-mission-done': return 'bg-amber-500';
    case 'tutorial-quest-done': return 'bg-cyan-500';
    case 'friend-request': return 'bg-sky-500';
    case 'friend-accepted': return 'bg-emerald-500';
    case 'friend-declined': return 'bg-red-500';
    case 'report-sold': return 'bg-emerald-500';
    case 'report-purchased': return 'bg-cyan-500';
    case 'market-offer-reserved': return 'bg-amber-500';
    case 'market-offer-sold': return 'bg-emerald-500';
    default: return 'bg-muted';
  }
}

export function eventTypeLabel(type: string, labels?: Record<string, string>): string {
  return labels?.[`event.${type}`] ?? type;
}

import { getEntityName } from './entity-names';

export function formatEventText(
  event: { type: string; payload?: unknown },
  options?: { includePlanet?: boolean; missions?: Record<string, { label: string }> },
) {
  const p = event.payload as any;
  const prefix = options?.includePlanet ? planetPrefix(event.payload) : '';
  switch (event.type) {
    case 'building-done': return `${prefix}${p.name ?? getEntityName(p.buildingId)} niveau ${p.level}`;
    case 'research-done': return `${prefix}${p.name ?? getEntityName(p.techId)} niveau ${p.level}`;
    case 'shipyard-done': return `${prefix}${p.count}x ${p.name ?? getEntityName(p.unitId)}`;
    case 'fleet-arrived': return `${prefix}Mission ${options?.missions?.[p.mission]?.label ?? p.mission} arrivée en ${p.targetCoords}`;
    case 'fleet-returned': return `${prefix}Flotte rentrée sur ${p.originName}`;
    case 'pve-mission-done': {
      const mLabel = options?.missions?.[p.missionType]?.label ?? p.missionType;
      const loot = [
        p.cargo?.minerai ? `${p.cargo.minerai.toLocaleString('fr-FR')} minerai` : '',
        p.cargo?.silicium ? `${p.cargo.silicium.toLocaleString('fr-FR')} silicium` : '',
        p.cargo?.hydrogene ? `${p.cargo.hydrogene.toLocaleString('fr-FR')} hydrogène` : '',
      ].filter(Boolean).join(', ');
      return `${prefix}${mLabel} en ${p.targetCoords}${loot ? ` — ${loot}` : ''}`;
    }
    case 'tutorial-quest-done': return `Quête "${p.questTitle}" terminée`;
    case 'friend-request': return `Demande d'ami de ${p.fromUsername}`;
    case 'friend-accepted': return `${p.fromUsername} a accepté votre demande`;
    case 'friend-declined': return `${p.fromUsername} a refusé votre demande`;
    case 'report-sold': return `Rapport vendu à ${p.buyerUsername} [${p.galaxy}:${p.system}:?]`;
    case 'report-purchased': return `Rapport acquis en [${p.galaxy}:${p.system}:${p.position}] — ${p.biomeCount} biomes`;
    case 'market-offer-reserved': return p.resourceType
      ? `Offre réservée : ${Number(p.quantity).toLocaleString('fr-FR')} ${p.resourceType}`
      : `Acheteur trouvé pour votre rapport — cargo en route`;
    case 'market-offer-sold': return p.resourceType
      ? `Vente finalisée : ${Number(p.quantity).toLocaleString('fr-FR')} ${p.resourceType}`
      : `Rapport vendu — paiement reçu`;
    default: return 'Événement';
  }
}

export { timeAgo as formatRelativeTime } from './format';

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Group consecutive shipyard-done events with the same unitId + planetId,
 * summing their counts. Prevents notification/event flood when building
 * multiple units of the same type one by one.
 */
export function groupEvents<T extends { type: string; payload?: any; planetId?: string | null }>(events: T[]): T[] {
  const result: T[] = [];

  for (const event of events) {
    const last = result[result.length - 1];

    if (
      last &&
      last.type === 'shipyard-done' &&
      event.type === 'shipyard-done' &&
      (last.payload as any)?.unitId === (event.payload as any)?.unitId &&
      last.planetId === event.planetId
    ) {
      const lastPayload = last.payload as any;
      const eventPayload = event.payload as any;
      result[result.length - 1] = {
        ...last,
        payload: {
          ...lastPayload,
          count: (lastPayload.count ?? 1) + (eventPayload.count ?? 1),
        },
      };
    } else {
      result.push({ ...event });
    }
  }

  return result;
}

export function eventNavigationTarget(type: string, payload?: unknown): string {
  const p = payload as Record<string, unknown> | undefined;
  if (p?.reportId) return `/reports/${p.reportId}`;

  switch (type) {
    case 'building-done': return '/buildings';
    case 'research-done': return '/research';
    case 'shipyard-done':
      return p?.buildType === 'defense' ? '/defense' : '/fleet';
    case 'fleet-arrived':
    case 'fleet-returned':
    case 'fleet-inbound':
    case 'fleet-hostile-inbound': return '/fleet/movements';
    case 'fleet-attack-landed': return '/reports';
    case 'pve-mission-done': return '/missions';
    case 'tutorial-quest-done': return '/';
    case 'friend-request': return '/profile';
    case 'friend-accepted': return p?.fromUserId ? `/player/${p.fromUserId}` : '/profile';
    case 'friend-declined': return '/profile';
    case 'flagship-incapacitated': return '/flagship';
    case 'market-offer-reserved':
    case 'market-offer-sold':
    case 'market-offer-expired':
    case 'report-sold':
    case 'report-purchased': return '/market';
    case 'daily-quest-completed': return '/overview';
    case 'alliance-activity':
    case 'new-alliance-message': return '/alliance';
    default: return '/';
  }
}
