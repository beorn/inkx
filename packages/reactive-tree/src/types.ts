/**
 * Shared types for `@km/reactive-tree`.
 *
 * The `Descriptor` and `Traversal` types are consumed by the engine
 * (`index.ts`), the strategy interface (`strategy.ts`), and the built-in
 * strategy implementations (`strategies/*`). Keeping them in one place avoids
 * the circular import that would arise if each module declared its own.
 */

/** Alien-signals' callable signal shape: read with 0 args, write with 1. */
export type Sig<T> = { (): T; (value: T): void }

/** Any object with parent + children. Duck-typed. */
export interface Traversal {
  parent(id: string): string | null
  children(id: string): readonly string[]
}

/** Sentinel key used by `isDescriptor` to mark engine descriptors. */
export const DESC = Symbol.for("km:tree-computed")

/** Descriptor produced by the DSL (`tree.descendants(...).some()` etc.). */
export interface Descriptor {
  [DESC]: true
  dir: "up" | "down"
  key: string
  type: "some" | "count" | "reduce"
  reducer?: (acc: unknown, value: unknown) => unknown
  initial?: unknown | (() => unknown)
  equals?: (a: unknown, b: unknown) => boolean
  includeSelf?: boolean
  /**
   * Optional user-supplied strategy factory. When omitted, the engine picks
   * a default based on (dir, type) — see `defaults.ts` / `resolveStrategy`.
   */
  strategy?: import("./strategy.ts").Strategy
}

export function isDescriptor(v: unknown): v is Descriptor {
  return v != null && typeof v === "object" && DESC in v
}
