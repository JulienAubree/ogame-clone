import type { Blason } from '../alliance-blason/catalog.js';

export type NewAllianceMessagePayload = {
  allianceId: string;
  allianceTag: string;
  senderUsername: string | null;
  senderId: string;
  allianceBlason: Blason | null;
};

export const NOTIFICATION_CATEGORIES = [
  'building',
  'research',
  'shipyard',
  'fleet',
  'combat',
  'message',
  'market',
  'alliance',
  'social',
  'quest',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  building: 'Bâtiments',
  research: 'Recherche',
  shipyard: 'Chantier spatial & Centre de commandement',
  fleet: 'Flottes',
  combat: 'Combat',
  message: 'Messages',
  market: 'Marché galactique',
  alliance: 'Alliance',
  social: 'Social',
  quest: 'Missions & Quêtes',
};

/** Map SSE event type to notification category */
export const EVENT_TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  'building-done': 'building',
  'research-done': 'research',
  'shipyard-done': 'shipyard',
  'fleet-arrived': 'fleet',
  'fleet-returned': 'fleet',
  'fleet-inbound': 'fleet',
  'fleet-attack-landed': 'combat',
  'fleet-hostile-inbound': 'combat',
  'flagship-incapacitated': 'combat',
  'new-message': 'message',
  'new-reply': 'message',
  'market-offer-reserved': 'market',
  'market-offer-sold': 'market',
  'market-offer-expired': 'market',
  'market-reservation-expired': 'market',
  'new-alliance-message': 'alliance',
  'alliance-activity': 'alliance',
  'friend-request': 'social',
  'friend-accepted': 'social',
  'friend-declined': 'social',
  'report-sold': 'market',
  'report-purchased': 'market',
  'daily-quest-completed': 'quest',
  'tutorial-quest-complete': 'quest',
};

/** Human-readable labels for individual event types */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  'building-done': 'Construction terminée',
  'research-done': 'Recherche terminée',
  'shipyard-done': 'Production terminée',
  'fleet-arrived': 'Flotte arrivée',
  'fleet-returned': 'Flotte de retour',
  'fleet-inbound': 'Flotte en approche',
  'fleet-attack-landed': 'Attaque subie',
  'fleet-hostile-inbound': 'Attaque détectée',
  'flagship-incapacitated': 'Vaisseau amiral détruit',
  'new-message': 'Nouveau message',
  'new-reply': 'Nouvelle réponse',
  'market-offer-reserved': 'Offre acceptée',
  'market-offer-sold': 'Vente finalisée',
  'market-offer-expired': 'Offre expirée',
  'market-reservation-expired': 'Réservation expirée',
  'new-alliance-message': 'Message alliance',
  'alliance-activity': 'Activité alliance',
  'friend-request': 'Demande d\'ami',
  'friend-accepted': 'Ami accepté',
  'friend-declined': 'Ami refusé',
  'report-sold': 'Rapport vendu',
  'report-purchased': 'Rapport acheté',
  'daily-quest-completed': 'Mission quotidienne',
  'tutorial-quest-complete': 'Quête tutoriel',
};

/** Get all event types belonging to a category */
export function getEventTypesForCategory(category: NotificationCategory): string[] {
  return Object.entries(EVENT_TYPE_TO_CATEGORY)
    .filter(([, cat]) => cat === category)
    .map(([eventType]) => eventType);
}
