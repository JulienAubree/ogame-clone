export interface DailyQuestDefinition {
  id: string;
  name: string;
  description: string;
  /** Liste d'evenements qui peuvent declencher la completion */
  events: string[];
  /**
   * Condition de completion.
   * Recoit le payload de l'evenement + la config univers.
   * Retourne true si la quete est completee.
   */
  check: (event: QuestEvent, config: Record<string, unknown>) => boolean;
}

export interface QuestEvent {
  type: string;
  userId: string;
  payload: Record<string, unknown>;
}

export const DAILY_QUEST_REGISTRY: Record<string, DailyQuestDefinition> = {
  miner: {
    id: 'miner',
    name: 'Mineur assidu',
    description: 'Collecter {daily_quest_miner_threshold} ressources',
    events: ['resources:collected'],
    check: (event, config) => {
      const threshold = Number(config['daily_quest_miner_threshold']) || 5000;
      return (Number(event.payload.totalCollected) || 0) >= threshold;
    },
  },
  builder: {
    id: 'builder',
    name: 'Constructeur',
    description: 'Lancer ou terminer 1 construction',
    events: ['construction:started', 'construction:completed'],
    check: () => true,
  },
  navigator: {
    id: 'navigator',
    name: 'Navigateur',
    description: 'Envoyer 1 flotte',
    events: ['fleet:dispatched'],
    check: () => true,
  },
  bounty_hunter: {
    id: 'bounty_hunter',
    name: 'Chasseur de primes',
    description: 'Gagner 1 combat PvE',
    events: ['pve:victory'],
    check: () => true,
  },
  warrior: {
    id: 'warrior',
    name: 'Guerrier',
    description: 'Engager 1 combat PvP (en tant qu\'attaquant)',
    events: ['pvp:battle_resolved'],
    check: (event) => event.payload.role === 'attacker',
  },
  merchant: {
    id: 'merchant',
    name: 'Marchand',
    description: 'Completer 1 transaction sur le marche',
    events: ['market:transaction_completed'],
    check: () => true,
  },
  explorer: {
    id: 'explorer',
    name: 'Explorateur',
    description: 'Lancer 1 mission d\'expedition',
    events: ['fleet:dispatched'],
    check: (event) => event.payload.missionType === 'expedition',
  },
  recycler: {
    id: 'recycler',
    name: 'Recycleur',
    description: 'Envoyer 1 mission de recyclage',
    events: ['fleet:dispatched'],
    check: (event) => event.payload.missionType === 'recycle',
  },
};

export const QUEST_IDS = Object.keys(DAILY_QUEST_REGISTRY);
