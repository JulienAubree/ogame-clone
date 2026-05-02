import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Type accepted by service methods that may run inside a transaction
 * (`tx`) or against the top-level connection (`db`). Drizzle's `tx`
 * argument is structurally compatible with `Database` for query/mutation
 * use, but lacks `$client`, so a plain `Database` parameter rejects it.
 *
 * Usage: `async createFoo(input: ..., dbx: DbOrTx = db) { ... }`
 */
export type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
