/**
 * Store Abstraction Layer - Barrel Re-export
 *
 * Split into focused modules:
 * - store-types.ts: NodeStore interface
 * - store-base.ts:  BaseStore abstract class (shared query methods)
 * - store-memory.ts: MemoryStore implementation (in-memory SQLite with filesystem scanning)
 *
 * This file re-exports everything for backward compatibility.
 */

export type { NodeStore } from "./store-types.ts"
export { MemoryStore } from "./store-memory.ts"

// NOTE: Singleton functions (initStore, getStore, closeStore) removed.
// Use createRepo() factory or instantiate MemoryStore/DiskStore directly.
