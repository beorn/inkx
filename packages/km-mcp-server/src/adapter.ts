/**
 * Adapter from @km/storage → KmContext.
 *
 * Kept separate so the transport can be tested in isolation from the real
 * database — tests instantiate an in-memory KmContext directly (see
 * tests/dispatch.test.ts).
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import type { KmContext } from "./tools.ts"

/**
 * Wrap a live km Database handle as a KmContext. Assumes the caller has
 * already opened the db in read-only mode when appropriate.
 */
export function createKmContextFromStorage(
  db: Database,
  queries: {
    search(db: Database, query: string, limit?: number): KNode[]
    getNode(db: Database, id: string, opts?: { includeChildren?: boolean; includeBody?: boolean }): KNode | null
    getTopLevelNodes(db: Database): KNode[]
    renderPath(db: Database, id: string): string[]
  },
): KmContext {
  return {
    async search(query: string, limit = 20): Promise<KNode[]> {
      return queries.search(db, query, limit)
    },
    async getNode(id: string, opts?: { includeChildren?: boolean; includeBody?: boolean }): Promise<KNode | null> {
      return queries.getNode(db, id, opts)
    },
    async getBoard(): Promise<KNode[]> {
      return queries.getTopLevelNodes(db)
    },
    async renderPath(id: string): Promise<string[]> {
      return queries.renderPath(db, id)
    },
  }
}
