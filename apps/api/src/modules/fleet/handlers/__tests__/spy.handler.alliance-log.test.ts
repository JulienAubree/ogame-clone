import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets' },
  planetShips: { __t: 'planetShips' },
  planetDefenses: { __t: 'planetDefenses' },
  planetBuildings: { __t: 'planetBuildings' },
  userResearch: { __t: 'userResearch' },
  flagships: { __t: 'flagships' },
  flagshipTalents: { __t: 'flagshipTalents' },
  allianceMembers: { __t: 'allianceMembers', userId: { __c: 'userId' } },
  alliances: { __t: 'alliances', id: { __c: 'id' }, tag: { __c: 'tag' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  inArray: (col: unknown, vals: unknown) => ({ __op: 'inArray', col, vals }),
}));

vi.mock('@exilium/game-engine', () => ({
  calculateSpyReport: vi.fn(),
  calculateDetectionChance: vi.fn(),
  totalCargoCapacity: vi.fn(),
  simulateCombat: vi.fn(),
}));

vi.mock('../../../lib/config-helpers.js', () => ({
  findShipByRole: vi.fn(),
  findShipsByRole: vi.fn(),
}));

vi.mock('../combat.helpers.js', () => ({
  buildCombatConfig: vi.fn(),
  parseUnitRow: vi.fn(),
  computeCombatMultipliers: vi.fn(),
  computeAttackerSurvivors: vi.fn(),
  applyDefenderLosses: vi.fn(),
  upsertDebris: vi.fn(),
  computeBothFP: vi.fn(),
  computeShotsPerRound: vi.fn(),
  fetchUsernames: vi.fn(),
  buildCombatReportData: vi.fn(),
  outcomeText: vi.fn(),
  defenderOutcome: vi.fn(),
}));

vi.mock('../../notification/notification.publisher.js', () => ({
  publishNotification: vi.fn(),
}));

vi.mock('../fleet.types.js', () => ({
  buildShipStatsMap: vi.fn(),
  buildShipCombatConfigs: vi.fn(),
  buildShipCosts: vi.fn(),
}));

import { emitEspionageAllianceLogs } from '../spy.handler.js';

type MembershipRow = { userId: string; allianceId: string; allianceTag: string };

function makeCtx(memberships: MembershipRow[]) {
  const add = vi.fn().mockResolvedValue({ id: 'log-1' });
  const ctx = {
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(memberships),
          }),
        }),
      }),
    },
    allianceLogService: { add },
  };
  return { ctx: ctx as any, add };
}

const baseArgs = {
  spyUserId: 'spy-1',
  targetUserId: 'target-1',
  spyName: 'Spy',
  targetName: 'Target',
  targetPlanetName: 'Cible',
  coords: '1:2:3',
  reportId: 'report-1',
};

describe('emitEspionageAllianceLogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('no-op si allianceLogService est absent', async () => {
    const ctx = { db: {}, allianceLogService: undefined } as any;
    await expect(
      emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: true }),
    ).resolves.toBeUndefined();
  });

  it('detected=true: emet outgoing pour le spy ET incoming pour la cible', async () => {
    const { ctx, add } = makeCtx([
      { userId: 'spy-1', allianceId: 'A', allianceTag: 'AAA' },
      { userId: 'target-1', allianceId: 'B', allianceTag: 'BBB' },
    ]);
    await emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: true });

    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, expect.objectContaining({
      allianceId: 'A',
      payload: expect.objectContaining({
        type: 'espionage.outgoing',
        targetAllianceTag: 'BBB',
      }),
    }));
    expect(add).toHaveBeenNthCalledWith(2, expect.objectContaining({
      allianceId: 'B',
      payload: expect.objectContaining({
        type: 'espionage.incoming',
        spyAllianceTag: 'AAA',
      }),
    }));
  });

  it('detected=false: emet UNIQUEMENT outgoing (incoming masque cote cible)', async () => {
    const { ctx, add } = makeCtx([
      { userId: 'spy-1', allianceId: 'A', allianceTag: 'AAA' },
      { userId: 'target-1', allianceId: 'B', allianceTag: 'BBB' },
    ]);
    await emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: false });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      allianceId: 'A',
      payload: expect.objectContaining({ type: 'espionage.outgoing' }),
    }));
  });

  it('spy sans alliance: aucun outgoing (et incoming si detected)', async () => {
    const { ctx, add } = makeCtx([
      { userId: 'target-1', allianceId: 'B', allianceTag: 'BBB' },
    ]);
    await emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: true });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      allianceId: 'B',
      payload: expect.objectContaining({ type: 'espionage.incoming' }),
    }));
  });

  it('cible sans alliance: outgoing seul (rien a emettre cote cible)', async () => {
    const { ctx, add } = makeCtx([
      { userId: 'spy-1', allianceId: 'A', allianceTag: 'AAA' },
    ]);
    await emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: true });

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      allianceId: 'A',
      payload: expect.objectContaining({ type: 'espionage.outgoing' }),
    }));
  });

  it('aucune alliance: aucun log emis', async () => {
    const { ctx, add } = makeCtx([]);
    await emitEspionageAllianceLogs(ctx, { ...baseArgs, detected: true });
    expect(add).not.toHaveBeenCalled();
  });
});
