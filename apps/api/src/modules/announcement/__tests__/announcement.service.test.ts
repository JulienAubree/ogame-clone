import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAnnouncementService } from '../announcement.service.js';

// ── Mock DB ──────────────────────────────────────────────────────────
//
// The service uses these drizzle chains:
// - db.select().from(table).where(...).limit(1)   → Promise<rows>
// - db.select().from(table).orderBy(...)          → Promise<rows>
// - db.update(table).set(...).where(...)          → Promise<void>
// - db.update(table).set(...).where(...).returning() → Promise<rows>
// - db.insert(table).values(...).returning()      → Promise<rows>
// - db.delete(table).where(...)                   → Promise<void>
// - db.transaction(cb)                            → cb(tx); same API as db
//
// We expose configurable state (queue of select results, queue of returning
// results) and observable call trackers (all update/insert/delete calls) so
// tests can assert on observable outcomes.

interface MockState {
  selectResults: unknown[][]; // queue of rows returned per select call
  returningResults: unknown[][]; // queue of rows returned per insert/update .returning() call
  updateCalls: Array<{ table: unknown; set: Record<string, unknown>; inTx: boolean }>;
  insertCalls: Array<{ table: unknown; values: Record<string, unknown>; inTx: boolean }>;
  deleteCalls: Array<{ table: unknown; inTx: boolean }>;
  transactionCalls: number;
}

function createMockDb(state: MockState) {
  const makeDb = (inTx: boolean) => {
    const db: any = {};

    db.select = vi.fn().mockImplementation(() => {
      const chain: any = {};
      const resolveRows = () => state.selectResults.shift() ?? [];
      chain.from = vi.fn().mockImplementation(() => chain);
      chain.where = vi.fn().mockImplementation(() => {
        chain.then = (resolve: any) => resolve(resolveRows());
        return chain;
      });
      chain.orderBy = vi.fn().mockImplementation(() => {
        chain.then = (resolve: any) => resolve(resolveRows());
        return chain;
      });
      chain.limit = vi.fn().mockImplementation(() => {
        chain.then = (resolve: any) => resolve(resolveRows());
        return chain;
      });
      // bare .from().then for adminList-style (no where)
      chain.then = (resolve: any) => resolve(resolveRows());
      return chain;
    });

    db.update = vi.fn().mockImplementation((table: unknown) => {
      const chain: any = {};
      let capturedSet: Record<string, unknown> = {};
      chain.set = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedSet = vals;
        return chain;
      });
      chain.where = vi.fn().mockImplementation(() => {
        state.updateCalls.push({ table, set: capturedSet, inTx });
        chain.returning = vi.fn().mockImplementation(() => {
          const rows = state.returningResults.shift() ?? [];
          return Promise.resolve(rows);
        });
        chain.then = (resolve: any) => resolve(undefined);
        return chain;
      });
      return chain;
    });

    db.insert = vi.fn().mockImplementation((table: unknown) => {
      const chain: any = {};
      let capturedValues: Record<string, unknown> = {};
      chain.values = vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedValues = vals;
        state.insertCalls.push({ table, values: vals, inTx });
        return chain;
      });
      chain.returning = vi.fn().mockImplementation(() => {
        const rows = state.returningResults.shift() ?? [{ ...capturedValues, id: 'inserted-id' }];
        return Promise.resolve(rows);
      });
      chain.then = (resolve: any) => resolve(undefined);
      return chain;
    });

    db.delete = vi.fn().mockImplementation((table: unknown) => {
      const chain: any = {};
      chain.where = vi.fn().mockImplementation(() => {
        state.deleteCalls.push({ table, inTx });
        return Promise.resolve();
      });
      return chain;
    });

    db.transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => {
      state.transactionCalls += 1;
      const tx = makeDb(true);
      return cb(tx);
    });

    return db;
  };

  return makeDb(false);
}

function freshState(): MockState {
  return {
    selectResults: [],
    returningResults: [],
    updateCalls: [],
    insertCalls: [],
    deleteCalls: [],
    transactionCalls: 0,
  };
}

describe('announcement.service', () => {
  let state: MockState;
  let service: ReturnType<typeof createAnnouncementService>;

  beforeEach(() => {
    vi.clearAllMocks();
    state = freshState();
    service = createAnnouncementService(createMockDb(state) as any);
  });

  describe('getActive()', () => {
    it('returns the active row when one exists', async () => {
      const row = {
        id: 'a1',
        message: 'Hello',
        variant: 'info',
        changelogId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.selectResults.push([row]);

      const result = await service.getActive();
      expect(result).toEqual(row);
    });

    it('returns null when no active row exists', async () => {
      state.selectResults.push([]);

      const result = await service.getActive();
      expect(result).toBeNull();
    });
  });

  describe('adminCreate()', () => {
    it('with activate: true deactivates all active rows inside a transaction before inserting', async () => {
      // no changelogId → no pre-check select
      // returning for insert:
      state.returningResults.push([{ id: 'new-id', message: 'm', variant: 'info', changelogId: null, active: true }]);

      const result = await service.adminCreate({
        message: 'm',
        variant: 'info',
        activate: true,
      });

      expect(state.transactionCalls).toBe(1);
      // Exactly one UPDATE (the "deactivate all active" one), inside tx.
      expect(state.updateCalls).toHaveLength(1);
      expect(state.updateCalls[0].inTx).toBe(true);
      expect(state.updateCalls[0].set).toMatchObject({ active: false });
      expect(state.updateCalls[0].set.updatedAt).toBeInstanceOf(Date);
      // Insert inside tx with active: true.
      expect(state.insertCalls).toHaveLength(1);
      expect(state.insertCalls[0].inTx).toBe(true);
      expect(state.insertCalls[0].values).toMatchObject({
        message: 'm',
        variant: 'info',
        changelogId: null,
        active: true,
      });
      expect(result).toMatchObject({ id: 'new-id', active: true });
    });

    it('with activate: false does NOT deactivate any existing rows', async () => {
      state.returningResults.push([{ id: 'new-id', message: 'm', variant: 'warning', changelogId: null, active: false }]);

      await service.adminCreate({
        message: 'm',
        variant: 'warning',
        activate: false,
      });

      // Still wrapped in a transaction, but no UPDATE call should have been made.
      expect(state.updateCalls).toHaveLength(0);
      expect(state.insertCalls).toHaveLength(1);
      expect(state.insertCalls[0].values).toMatchObject({ active: false });
    });

    it('throws BAD_REQUEST when changelogId does not exist', async () => {
      // The changelog existence check: select returns empty.
      state.selectResults.push([]);

      await expect(
        service.adminCreate({
          message: 'm',
          variant: 'info',
          changelogId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toMatchObject({
        name: 'TRPCError',
        code: 'BAD_REQUEST',
      });

      // No insert/update/transaction should have run.
      expect(state.transactionCalls).toBe(0);
      expect(state.insertCalls).toHaveLength(0);
    });
  });

  describe('adminUpdate()', () => {
    it('throws NOT_FOUND when the announcement does not exist', async () => {
      state.selectResults.push([]); // existence check returns empty

      await expect(
        service.adminUpdate('missing-id', { message: 'x' }),
      ).rejects.toBeInstanceOf(TRPCError);

      // No write should have happened.
      expect(state.updateCalls).toHaveLength(0);
    });
  });

  describe('adminSetActive()', () => {
    it('with active: true deactivates all other active rows then activates the target', async () => {
      // existence check
      state.selectResults.push([{ id: 'target' }]);
      // returning for the "activate target" update
      state.returningResults.push([{ id: 'target', active: true }]);

      const result = await service.adminSetActive('target', true);

      expect(state.transactionCalls).toBe(1);
      // Two updates, both inside tx: deactivate others, then activate target.
      expect(state.updateCalls).toHaveLength(2);
      expect(state.updateCalls[0].inTx).toBe(true);
      expect(state.updateCalls[0].set).toMatchObject({ active: false });
      expect(state.updateCalls[1].inTx).toBe(true);
      expect(state.updateCalls[1].set).toMatchObject({ active: true });
      expect(result).toMatchObject({ id: 'target', active: true });
    });

    it('with active: false only updates the target row (no transaction, no other side effects)', async () => {
      state.selectResults.push([{ id: 'target' }]);
      state.returningResults.push([{ id: 'target', active: false }]);

      const result = await service.adminSetActive('target', false);

      expect(state.transactionCalls).toBe(0);
      expect(state.updateCalls).toHaveLength(1);
      expect(state.updateCalls[0].inTx).toBe(false);
      expect(state.updateCalls[0].set).toMatchObject({ active: false });
      expect(result).toMatchObject({ id: 'target', active: false });
    });
  });
});
