/**
 * Default strategy resolution.
 *
 * The DSL captures descriptor shape (dir + type). The engine picks a strategy
 * if the user didn't supply one — this module centralizes that policy so a
 * single grep shows what defaults exist today.
 *
 * Current policy (matches the pre-strategy-refactor behaviour exactly):
 *
 *   dir='down' + type='some'     → sparse   (O(1) read, O(depth) write)
 *   dir='down' + type='count'    → sparse   (same index as some)
 *   dir='down' + type='reduce'   → walk     (needs actual values)
 *   dir='up'   + any type        → walk     (ancestors are already O(depth))
 *
 * Escape hatches:
 *
 *   - users override via `{ strategy: walk }` when the sparse assumption
 *     doesn't hold (dense signals, many truthy nodes per frame)
 *   - users override via `{ strategy: singleton }` when they want strict
 *     enforcement that exactly one node is truthy at a time
 *   - users can pass any factory matching the `Strategy` type — the policy
 *     is a default, not a restriction
 */

import type { Descriptor } from "./types.ts"
import type { Strategy } from "./strategy.ts"
import { sparse } from "./strategies/sparse.ts"
import { walk } from "./strategies/walk.ts"

export function resolveDefaultStrategy(desc: Descriptor): Strategy {
  if (desc.strategy) return desc.strategy
  if (desc.dir === "down" && (desc.type === "some" || desc.type === "count")) return sparse
  return walk
}
