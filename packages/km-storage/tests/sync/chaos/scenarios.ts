/**
 * Chaos Scenarios
 *
 * Predefined configurations for simulating file watcher edge cases.
 */

import type { ChaosScenario } from "./types.ts"

/**
 * Slow disk - all events delayed 2-5 seconds
 * Simulates: Network drives, busy disks, slow storage
 */
const SLOW_DISK: ChaosScenario = {
  type: "slow_disk",
  params: {
    minDelayMs: 2000,
    maxDelayMs: 5000,
  },
}

/**
 * Queue overflow - drops 20% of events randomly
 * Simulates: inotify IN_Q_OVERFLOW, FSEvents buffer overflow
 */
const QUEUE_OVERFLOW: ChaosScenario = {
  type: "queue_overflow",
  params: {
    dropRate: 0.2,
    burstSize: 50, // Trigger overflow simulation after this many pending events
  },
}

/**
 * Editor atomic writes - modify becomes delete + add pair
 * Simulates: Vim, VSCode, Emacs save patterns (write temp, rename)
 */
const EDITOR_ATOMIC: ChaosScenario = {
  type: "editor_atomic",
  params: {
    tempSuffix: ".tmp",
    renameDelayMs: 50, // ms between temp write and rename
  },
}

/**
 * Event storm - bursts of 100+ events
 * Simulates: npm install, git checkout, bulk file operations
 */
const EVENT_STORM: ChaosScenario = {
  type: "event_storm",
  params: {
    burstSize: 100,
    burstIntervalMs: 10, // ms between events in burst
    cooldownAfterBurstMs: 500,
  },
}

/**
 * Reorder chaos - randomly reorders event batches
 * Simulates: Non-deterministic event delivery order
 */
const REORDER_CHAOS: ChaosScenario = {
  type: "reorder_chaos",
  params: {
    reorderProbability: 0.5,
    maxReorderWindow: 10, // Events within this window may be reordered
  },
}

/**
 * Partial writes - file created before fully written
 * Simulates: Large file writes, slow network saves
 */
const PARTIAL_WRITES: ChaosScenario = {
  type: "partial_writes",
  params: {
    initialWriteDelayMs: 0,
    finalWriteDelayMs: 500,
    intermediateEvents: 3, // Number of "change" events during write
  },
}

/**
 * Rename storm - rapid file renames
 * Simulates: Refactoring tools, bulk rename operations
 */
const RENAME_STORM: ChaosScenario = {
  type: "rename_storm",
  params: {
    chainLength: 5, // file.md -> file1.md -> file2.md -> ...
    renameIntervalMs: 100,
  },
}

/**
 * FSEvents coalescing - parent dir event instead of file events
 * Simulates: macOS FSEvents hierarchical coalescing
 */
const FSEVENTS_COALESCE: ChaosScenario = {
  type: "fsevents_coalesce",
  params: {
    coalesceThreshold: 10, // Coalesce when > N files changed in dir
    useParentDirEvent: true,
  },
}

/**
 * Init gap - file changes during watcher initialization
 * Simulates: Files created between scan and watcher ready
 */
const INIT_GAP: ChaosScenario = {
  type: "init_gap",
  params: {
    initDurationMs: 2000, // How long before "ready" fires
    eventsBeforeReady: 5, // Events that happen during init
  },
}

/**
 * Rapid succession - many edits in milliseconds
 * Simulates: Rapid typing with autosave, search-replace
 */
const RAPID_SUCCESSION: ChaosScenario = {
  type: "rapid_succession",
  params: {
    editsPerFile: 10,
    intervalMs: 10,
  },
}

/**
 * Duplicate events - same event fired multiple times
 * Simulates: fs.watch duplicate event bug
 */
const DUPLICATE_EVENTS: ChaosScenario = {
  type: "rapid_succession", // Reuse rapid_succession with duplicates
  params: {
    editsPerFile: 3,
    intervalMs: 0, // Immediate duplicates
  },
}

/**
 * All predefined scenarios for easy access
 */
export const CHAOS_SCENARIOS = {
  slow_disk: SLOW_DISK,
  queue_overflow: QUEUE_OVERFLOW,
  editor_atomic: EDITOR_ATOMIC,
  event_storm: EVENT_STORM,
  reorder_chaos: REORDER_CHAOS,
  partial_writes: PARTIAL_WRITES,
  rename_storm: RENAME_STORM,
  fsevents_coalesce: FSEVENTS_COALESCE,
  init_gap: INIT_GAP,
  rapid_succession: RAPID_SUCCESSION,
  duplicate_events: DUPLICATE_EVENTS,
} as const

/**
 * Create a custom scenario by merging with defaults
 */
function createScenario(
  type: ChaosScenario["type"],
  overrides: Record<string, unknown> = {},
): ChaosScenario {
  const base = CHAOS_SCENARIOS[type]
  return {
    type,
    params: { ...base.params, ...overrides },
  }
}

/**
 * No chaos - events pass through unchanged
 * Useful for baseline testing
 */
export const NO_CHAOS: ChaosScenario = {
  type: "slow_disk",
  params: {
    minDelayMs: 0,
    maxDelayMs: 0,
  },
}
