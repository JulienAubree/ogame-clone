import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAnomalyService } from '../anomaly.service.js';

function makeMockGameConfig() {
  return {
    getFullConfig: async () => ({
      universe: {
        anomaly_repair_charge_hull_pct: 0.30,
        anomaly_entry_cost_exilium: 5,
        anomaly_repair_charges_per_run: 3,
      },
    }),
  };
}

function makeMockDb(selectResults: unknown[][], onUpdate?: (updates: unknown[]) => void) {
  const queue = [...selectResults];
  const updates: unknown[] = [];
  const db: any = {
    transaction: async (cb: (tx: any) => Promise<any>) => cb(db),
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockImplementation(() => {
      const chain: any = {};
      const result = queue.shift() ?? [];
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.for = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(result);
      chain.then = (resolve: any) => resolve(result);
      return chain;
    }),
    update: vi.fn().mockImplementation(() => {
      const chain: any = {};
      chain.set = vi.fn().mockImplementation((data: unknown) => {
        updates.push(data);
        if (onUpdate) onUpdate(updates);
        return chain;
      });
      chain.where = vi.fn().mockResolvedValue(undefined);
      return chain;
    }),
    _updates: () => updates,
  };
  return db;
}

function makeService(db: any) {
  return createAnomalyService(
    db,
    makeMockGameConfig() as any,
    {} as any,  // exiliumService — not used by useRepairCharge
    {} as any,  // flagshipService — not used by useRepairCharge
    {} as any,  // reportService
    {} as any,  // anomalyContentService
    {} as any,  // modulesService
  );
}

describe('anomalyService.useRepairCharge', () => {
  it('restores +30% hull and decrements charges', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.5 } },
      repairChargesCurrent: 3,
    };
    const db = makeMockDb([[active]]);
    const result = await makeService(db).useRepairCharge('user1');
    expect(result.newHullPercent).toBeCloseTo(0.8);
    expect(result.remainingCharges).toBe(2);
  });

  it('clamps hull to 1.0 when overflow', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.85 } },
      repairChargesCurrent: 1,
    };
    const db = makeMockDb([[active]]);
    const result = await makeService(db).useRepairCharge('user1');
    expect(result.newHullPercent).toBe(1.0);  // 0.85 + 0.30 = 1.15 → clamp 1.0
    expect(result.remainingCharges).toBe(0);
  });

  it('throws NOT_FOUND when no active anomaly', async () => {
    const db = makeMockDb([[]]);  // no active row
    await expect(makeService(db).useRepairCharge('user1')).rejects.toThrow(TRPCError);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST when no charges left', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 0.5 } },
      repairChargesCurrent: 0,
    };
    const db = makeMockDb([[active]]);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Aucune charge'),
    });
  });

  it('throws BAD_REQUEST when hull already at 1.0', async () => {
    const active = {
      id: 'a1',
      status: 'active',
      fleet: { flagship: { count: 1, hullPercent: 1.0 } },
      repairChargesCurrent: 3,
    };
    const db = makeMockDb([[active]]);
    await expect(makeService(db).useRepairCharge('user1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('pleine santé'),
    });
  });
});
