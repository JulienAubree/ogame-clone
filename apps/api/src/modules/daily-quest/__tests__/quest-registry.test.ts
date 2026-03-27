import { describe, it, expect } from 'vitest';
import { DAILY_QUEST_REGISTRY, QUEST_IDS } from '../quest-registry.js';
import type { QuestEvent } from '../quest-registry.js';

describe('quest-registry', () => {
  it('contient exactement 8 quetes', () => {
    expect(QUEST_IDS).toHaveLength(8);
    expect(Object.keys(DAILY_QUEST_REGISTRY)).toHaveLength(8);
  });

  it('chaque quete a un id, name, description, events, check', () => {
    for (const id of QUEST_IDS) {
      const def = DAILY_QUEST_REGISTRY[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
      expect(Array.isArray(def.events)).toBe(true);
      expect(def.events.length).toBeGreaterThan(0);
      expect(typeof def.check).toBe('function');
    }
  });

  it('warrior.check() retourne true seulement si role === "attacker"', () => {
    const warrior = DAILY_QUEST_REGISTRY['warrior'];
    const config = {};

    const attackerEvent: QuestEvent = {
      type: 'pvp:battle_resolved',
      userId: 'user1',
      payload: { role: 'attacker' },
    };
    expect(warrior.check(attackerEvent, config)).toBe(true);

    const defenderEvent: QuestEvent = {
      type: 'pvp:battle_resolved',
      userId: 'user1',
      payload: { role: 'defender' },
    };
    expect(warrior.check(defenderEvent, config)).toBe(false);

    const noRoleEvent: QuestEvent = {
      type: 'pvp:battle_resolved',
      userId: 'user1',
      payload: {},
    };
    expect(warrior.check(noRoleEvent, config)).toBe(false);
  });

  it('explorer.check() retourne true seulement si missionType === "expedition"', () => {
    const explorer = DAILY_QUEST_REGISTRY['explorer'];
    const config = {};

    const expeditionEvent: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: { missionType: 'expedition' },
    };
    expect(explorer.check(expeditionEvent, config)).toBe(true);

    const attackEvent: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: { missionType: 'attack' },
    };
    expect(explorer.check(attackEvent, config)).toBe(false);

    const noTypeEvent: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: {},
    };
    expect(explorer.check(noTypeEvent, config)).toBe(false);
  });

  it('recycler.check() retourne true seulement si missionType === "recycle"', () => {
    const recycler = DAILY_QUEST_REGISTRY['recycler'];
    const config = {};

    const recycleEvent: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: { missionType: 'recycle' },
    };
    expect(recycler.check(recycleEvent, config)).toBe(true);

    const attackEvent: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: { missionType: 'attack' },
    };
    expect(recycler.check(attackEvent, config)).toBe(false);
  });

  it('miner.check() retourne true si totalCollected >= threshold', () => {
    const miner = DAILY_QUEST_REGISTRY['miner'];

    // Avec threshold par defaut (5000)
    const config = {};

    const aboveEvent: QuestEvent = {
      type: 'resources:collected',
      userId: 'user1',
      payload: { totalCollected: 6000 },
    };
    expect(miner.check(aboveEvent, config)).toBe(true);

    const exactEvent: QuestEvent = {
      type: 'resources:collected',
      userId: 'user1',
      payload: { totalCollected: 5000 },
    };
    expect(miner.check(exactEvent, config)).toBe(true);

    const belowEvent: QuestEvent = {
      type: 'resources:collected',
      userId: 'user1',
      payload: { totalCollected: 4999 },
    };
    expect(miner.check(belowEvent, config)).toBe(false);

    // Avec threshold custom
    const customConfig = { daily_quest_miner_threshold: 1000 };

    const customAboveEvent: QuestEvent = {
      type: 'resources:collected',
      userId: 'user1',
      payload: { totalCollected: 1000 },
    };
    expect(miner.check(customAboveEvent, customConfig)).toBe(true);

    const customBelowEvent: QuestEvent = {
      type: 'resources:collected',
      userId: 'user1',
      payload: { totalCollected: 999 },
    };
    expect(miner.check(customBelowEvent, customConfig)).toBe(false);
  });

  it('builder.check() retourne toujours true', () => {
    const builder = DAILY_QUEST_REGISTRY['builder'];
    const event: QuestEvent = {
      type: 'construction:started',
      userId: 'user1',
      payload: {},
    };
    expect(builder.check(event, {})).toBe(true);
  });

  it('navigator.check() retourne toujours true', () => {
    const navigator = DAILY_QUEST_REGISTRY['navigator'];
    const event: QuestEvent = {
      type: 'fleet:dispatched',
      userId: 'user1',
      payload: {},
    };
    expect(navigator.check(event, {})).toBe(true);
  });
});
