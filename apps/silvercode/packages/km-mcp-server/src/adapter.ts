/**
 * Adapter from @km/storage → KmContext.
 *
 * Kept separate so the transport can be tested in isolation from the real
 * database — tests instantiate an in-memory KmContext directly (see
 * tests/dispatch.test.ts).
 *
 * The adapter wires v1 read methods (search/getNode/getBoard/renderPath/recent)
 * directly to query callbacks. Selection and v2 mutations are PASSED THROUGH:
 * the host (silvercode) is expected to plug in `getSelection` and the mutation
 * methods only after the ACP permission UX is wired up. Headless harnesses
 * that omit these get an empty selection and "not yet implemented" errors on
 * mutation calls — by design.
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import type { KmContext } from "./tools.ts"

/**
 * Optional hooks the host can supply on top of the read-only DB queries.
 * Selection lives in board state (signals), not the DB, so it's an injected
 * callback. Mutations land here once the permission-gateway UX exists.
 */
export type KmContextExtensions = Pick<
  KmContext,
  "getSelection" | "createCard" | "updateCard" | "moveCard" | "archiveCard" | "setSelection"
>

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
    /**
     * Recently-edited nodes, sorted updated_at desc. Optional `since` floors the
     * timestamp. The default bin (bin.ts) provides a generic implementation
     * over getAllNodes; callers with bigger vaults can wire a SQL-native one.
     */
    recent(db: Database, opts?: { limit?: number; since?: number }): KNode[]
  },
  extensions: KmContextExtensions = {},
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
    async recent(opts?: { limit?: number; since?: number }): Promise<KNode[]> {
      return queries.recent(db, opts)
    },
    ...extensions,
  }
}
