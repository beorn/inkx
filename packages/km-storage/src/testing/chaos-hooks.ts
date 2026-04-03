/**
 * ChaosHooks - Repo lifecycle hooks for chaos testing
 *
 * Creates RepoHooks that inject failures at configurable rates.
 * Use with createRepo() for application-level chaos testing.
 *
 * @example
 * ```typescript
 * const hooks = createChaosHooks({
 *   mutationDropRate: 0.1,    // 10% of mutations dropped
 *   mutationDelayMs: 50,      // Add latency to mutations
 * });
 *
 * using repo = runGenerator(createRepo(path, { hooks }));
 * repo.updateNode(id, { ... }); // May be dropped or delayed
 * ```
 */

import { createLogger } from "loggily"
import type { RepoHooks, MutationContext, BeforeMutationResult } from "../repo/repo.ts"

/**
 * Configuration for chaos hook behavior
 */
export interface ChaosHooksConfig {
  /**
   * Probability (0-1) that a mutation will be dropped.
   * Dropped mutations throw an error (simulating write failure).
   * @default 0
   */
  mutationDropRate?: number

  /**
   * Probability (0-1) that a mutation will be corrupted.
   * Corrupted mutations have their changes modified randomly.
   * @default 0
   */
  mutationCorruptRate?: number

  /**
   * Probability (0-1) that a specific mutation type will be dropped.
   * More granular than mutationDropRate.
   */
  dropRates?: {
    update?: number
    add?: number
    delete?: number
    move?: number
  }

  /**
   * Custom random function for deterministic testing.
   * Should return values in [0, 1).
   * @default Math.random
   */
  random?: () => number

  /**
   * Callback for each chaos event (for test assertions).
   */
  onChaosEvent?: (event: ChaosEvent) => void
}

/**
 * Event emitted when chaos is injected
 */
export interface ChaosEvent {
  type: "drop" | "corrupt" | "delay"
  mutation: MutationContext
  timestamp: number
  details?: Record<string, unknown>
}

/**
 * Extended hooks with chaos testing utilities
 */
export interface ChaosHooks extends RepoHooks {
  /** Get all chaos events that occurred */
  getChaosEvents(): ChaosEvent[]

  /** Clear the chaos event log */
  clearChaosEvents(): void

  /** Get statistics about chaos injection */
  getStats(): ChaosStats

  /** Temporarily disable chaos (for setup/teardown) */
  disable(): void

  /** Re-enable chaos after disable() */
  enable(): void

  /** Check if chaos is currently enabled */
  isEnabled(): boolean
}

/**
 * Statistics about chaos injection
 */
export interface ChaosStats {
  totalMutations: number
  droppedMutations: number
  corruptedMutations: number
  successfulMutations: number
}

/**
 * Create RepoHooks that inject chaos for testing.
 *
 * Use these hooks with createRepo() to test how your application
 * handles failures at the repo layer.
 *
 * @param config - Chaos configuration (drop rates, corruption, etc.)
 * @returns ChaosHooks with failure injection and monitoring
 *
 * @example
 * ```typescript
 * // Basic usage - 10% mutation drop rate
 * const hooks = createChaosHooks({ mutationDropRate: 0.1 });
 * using repo = runGenerator(createRepo(path, { hooks }));
 *
 * // Deterministic testing with seeded random
 * const seededRandom = createSeededRandom(12345);
 * const hooks = createChaosHooks({
 *   mutationDropRate: 0.5,
 *   random: seededRandom,
 * });
 *
 * // Track chaos events
 * const events: ChaosEvent[] = [];
 * const hooks = createChaosHooks({
 *   mutationDropRate: 0.1,
 *   onChaosEvent: (e) => events.push(e),
 * });
 * ```
 */
export function createChaosHooks(config: ChaosHooksConfig = {}): ChaosHooks {
  const { mutationDropRate = 0, mutationCorruptRate = 0, dropRates = {}, random = Math.random, onChaosEvent } = config

  // Internal state
  let enabled = true
  const chaosEvents: ChaosEvent[] = []
  const stats: ChaosStats = {
    totalMutations: 0,
    droppedMutations: 0,
    corruptedMutations: 0,
    successfulMutations: 0,
  }

  const log = createLogger("km:storage:chaos")

  function emitEvent(event: ChaosEvent) {
    chaosEvents.push(event)
    onChaosEvent?.(event)
    log.debug?.(`${event.type}: ${event.mutation.type} ${event.mutation.nodeId}`)
  }

  function getDropRateForType(type: MutationContext["type"]): number {
    const specificRate = dropRates[type as keyof typeof dropRates]
    if (specificRate !== undefined) {
      return specificRate
    }
    return mutationDropRate
  }

  function shouldDrop(ctx: MutationContext): boolean {
    if (!enabled) return false
    const rate = getDropRateForType(ctx.type)
    return random() < rate
  }

  function shouldCorrupt(_ctx: MutationContext): boolean {
    if (!enabled) return false
    return random() < mutationCorruptRate
  }

  function corruptMutation(ctx: MutationContext): MutationContext {
    // Apply corruption based on mutation type
    switch (ctx.type) {
      case "update":
        if (ctx.changes) {
          // Randomly clear or modify a change
          const keys = Object.keys(ctx.changes)
          if (keys.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked above
            const keyToCorrupt = keys[Math.floor(random() * keys.length)]!
            return {
              ...ctx,
              changes: {
                ...ctx.changes,
                [keyToCorrupt]: corruptValue((ctx.changes as Record<string, unknown>)[keyToCorrupt]),
              },
            }
          }
        }
        break

      case "move":
        // Corrupt position
        if (ctx.position !== undefined) {
          return {
            ...ctx,
            position: Math.floor(random() * 1000), // Random position
          }
        }
        break

      case "add":
        if (ctx.node) {
          // Corrupt content
          return {
            ...ctx,
            node: {
              ...ctx.node,
              content: `[CORRUPTED] ${ctx.node.content}`,
            },
          }
        }
        break
    }

    return ctx
  }

  function corruptValue(value: unknown): unknown {
    if (typeof value === "string") {
      return `[CORRUPTED] ${value}`
    }
    if (typeof value === "number") {
      return value * -1 || 999
    }
    if (typeof value === "boolean") {
      return !value
    }
    return null
  }

  const hooks: ChaosHooks = {
    beforeMutation(ctx: MutationContext): BeforeMutationResult | void {
      stats.totalMutations++

      // Check for drop
      if (shouldDrop(ctx)) {
        stats.droppedMutations++
        emitEvent({
          type: "drop",
          mutation: ctx,
          timestamp: Date.now(),
        })
        return { cancel: true }
      }

      // Check for corruption
      if (shouldCorrupt(ctx)) {
        stats.corruptedMutations++
        const corrupted = corruptMutation(ctx)
        emitEvent({
          type: "corrupt",
          mutation: ctx,
          timestamp: Date.now(),
          details: { corruptedTo: corrupted },
        })
        return { context: corrupted }
      }

      stats.successfulMutations++
    },

    afterMutation(ctx: MutationContext): void {
      log.debug?.(`mutation completed: ${ctx.type} ${ctx.nodeId}`)
    },

    afterQuery(operation: string, result: unknown): void {
      log.debug?.(
        `query completed: ${operation} ${Array.isArray(result) ? `${result.length} results` : "single result"}`,
      )
    },

    // ChaosHooks-specific methods
    getChaosEvents() {
      return [...chaosEvents]
    },

    clearChaosEvents() {
      chaosEvents.length = 0
    },

    getStats() {
      return { ...stats }
    },

    disable() {
      enabled = false
      log.debug?.("disabled")
    },

    enable() {
      enabled = true
      log.debug?.("enabled")
    },

    isEnabled() {
      return enabled
    },
  }

  return hooks
}

/**
 * Create a seeded random number generator for deterministic testing.
 *
 * @param seed - Initial seed value
 * @returns Function that returns values in [0, 1)
 *
 * @example
 * ```typescript
 * const random = createSeededRandom(12345);
 * const hooks = createChaosHooks({ mutationDropRate: 0.5, random });
 * // Results will be reproducible with the same seed
 * ```
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed
  return () => {
    // Simple LCG (Linear Congruential Generator)
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}
