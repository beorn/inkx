/**
 * Chaos Scenarios
 *
 * Predefined configurations for simulating file watcher edge cases.
 */

import { dirname, basename, join } from "path";
import type { ScheduledEvent, ChaosScenario } from "./types.ts";
import type { SeededRandom } from "./seeded-random.ts";

// ─────────────────────────────────────────────────────────────
// Predefined Scenarios
// ─────────────────────────────────────────────────────────────

/**
 * Slow disk - all events delayed 2-5 seconds
 * Simulates: Network drives, busy disks, slow storage
 */
export const SLOW_DISK: ChaosScenario = {
  type: "slow_disk",
  params: {
    minDelayMs: 2000,
    maxDelayMs: 5000,
  },
};

/**
 * Queue overflow - drops 20% of events randomly
 * Simulates: inotify IN_Q_OVERFLOW, FSEvents buffer overflow
 */
export const QUEUE_OVERFLOW: ChaosScenario = {
  type: "queue_overflow",
  params: {
    dropRate: 0.2,
    burstSize: 50, // Trigger overflow simulation after this many pending events
  },
};

/**
 * Editor atomic writes - modify becomes delete + add pair
 * Simulates: Vim, VSCode, Emacs save patterns (write temp, rename)
 */
export const EDITOR_ATOMIC: ChaosScenario = {
  type: "editor_atomic",
  params: {
    tempSuffix: ".tmp",
    renameDelayMs: 50, // ms between temp write and rename
  },
};

/**
 * Event storm - bursts of 100+ events
 * Simulates: npm install, git checkout, bulk file operations
 */
export const EVENT_STORM: ChaosScenario = {
  type: "event_storm",
  params: {
    burstSize: 100,
    burstIntervalMs: 10, // ms between events in burst
    cooldownAfterBurstMs: 500,
  },
};

/**
 * Reorder chaos - randomly reorders event batches
 * Simulates: Non-deterministic event delivery order
 */
export const REORDER_CHAOS: ChaosScenario = {
  type: "reorder_chaos",
  params: {
    reorderProbability: 0.5,
    maxReorderWindow: 10, // Events within this window may be reordered
  },
};

/**
 * Partial writes - file created before fully written
 * Simulates: Large file writes, slow network saves
 */
export const PARTIAL_WRITES: ChaosScenario = {
  type: "partial_writes",
  params: {
    initialWriteDelayMs: 0,
    finalWriteDelayMs: 500,
    intermediateEvents: 3, // Number of "change" events during write
  },
};

/**
 * Rename storm - rapid file renames
 * Simulates: Refactoring tools, bulk rename operations
 */
export const RENAME_STORM: ChaosScenario = {
  type: "rename_storm",
  params: {
    chainLength: 5, // file.md -> file1.md -> file2.md -> ...
    renameIntervalMs: 100,
  },
};

/**
 * FSEvents coalescing - parent dir event instead of file events
 * Simulates: macOS FSEvents hierarchical coalescing
 */
export const FSEVENTS_COALESCE: ChaosScenario = {
  type: "fsevents_coalesce",
  params: {
    coalesceThreshold: 10, // Coalesce when > N files changed in dir
    useParentDirEvent: true,
  },
};

/**
 * Init gap - file changes during watcher initialization
 * Simulates: Files created between scan and watcher ready
 */
export const INIT_GAP: ChaosScenario = {
  type: "init_gap",
  params: {
    initDurationMs: 2000, // How long before "ready" fires
    eventsBeforeReady: 5, // Events that happen during init
  },
};

/**
 * Rapid succession - many edits in milliseconds
 * Simulates: Rapid typing with autosave, search-replace
 */
export const RAPID_SUCCESSION: ChaosScenario = {
  type: "rapid_succession",
  params: {
    editsPerFile: 10,
    intervalMs: 10,
  },
};

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
};

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
} as const;

// ─────────────────────────────────────────────────────────────
// Scenario Factory Functions
// ─────────────────────────────────────────────────────────────

/**
 * Create a custom scenario by merging with defaults
 */
export function createScenario(
  type: ChaosScenario["type"],
  overrides: Record<string, unknown> = {},
): ChaosScenario {
  const base = CHAOS_SCENARIOS[type];
  return {
    type,
    params: { ...base.params, ...overrides },
  };
}

/** Create slow disk scenario with custom delays */
export function slowDisk(minDelayMs = 2000, maxDelayMs = 5000): ChaosScenario {
  return createScenario("slow_disk", { minDelayMs, maxDelayMs });
}

/** Create queue overflow scenario with custom drop rate */
export function queueOverflow(dropRate = 0.2): ChaosScenario {
  return createScenario("queue_overflow", { dropRate });
}

/** Create editor atomic write scenario */
export function editorAtomic(renameDelayMs = 50): ChaosScenario {
  return createScenario("editor_atomic", { renameDelayMs });
}

/** Create event storm scenario */
export function eventStorm(burstIntervalMs = 10): ChaosScenario {
  return createScenario("event_storm", { burstIntervalMs });
}

/** Create reorder chaos scenario */
export function reorderChaos(maxReorderWindow = 10): ChaosScenario {
  return createScenario("reorder_chaos", { maxReorderWindow });
}

/** Create FSEvents coalesce scenario */
export function fseventsCoalesce(coalesceThreshold = 10): ChaosScenario {
  return createScenario("fsevents_coalesce", { coalesceThreshold });
}

/** Create rapid succession scenario */
export function rapidSuccession(
  editsPerFile = 10,
  intervalMs = 10,
): ChaosScenario {
  return createScenario("rapid_succession", { editsPerFile, intervalMs });
}

// ─────────────────────────────────────────────────────────────
// Scenario Transformers
// ─────────────────────────────────────────────────────────────

/**
 * Apply a chaos scenario transformation to events
 */
export function applyScenario(
  events: ScheduledEvent[],
  scenario: ChaosScenario,
  random: SeededRandom,
): ScheduledEvent[] {
  switch (scenario.type) {
    case "slow_disk":
      return applySlowDisk(events, scenario.params, random);
    case "queue_overflow":
      return applyQueueOverflow(events, scenario.params, random);
    case "editor_atomic":
      return applyEditorAtomic(events, scenario.params);
    case "event_storm":
      return applyEventStorm(events, scenario.params);
    case "reorder_chaos":
      return applyReorderChaos(events, scenario.params, random);
    case "partial_writes":
      return applyPartialWrites(events, scenario.params);
    case "rename_storm":
      return applyRenameStorm(events, scenario.params);
    case "fsevents_coalesce":
      return applyFsEventsCoalesce(events, scenario.params);
    case "init_gap":
      return applyInitGap(events, scenario.params);
    case "rapid_succession":
      return applyRapidSuccession(events, scenario.params);
    default:
      return events;
  }
}

/**
 * Combine multiple scenarios
 */
export function combineScenarios(
  events: ScheduledEvent[],
  scenarios: ChaosScenario[],
  random: SeededRandom,
): ScheduledEvent[] {
  let result = events;
  for (const scenario of scenarios) {
    result = applyScenario(result, scenario, random);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Internal Transformer Functions
// ─────────────────────────────────────────────────────────────

function applySlowDisk(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
  random: SeededRandom,
): ScheduledEvent[] {
  const minDelay = (params.minDelayMs as number) ?? 2000;
  const maxDelay = (params.maxDelayMs as number) ?? 5000;

  return events.map((e) => ({
    ...e,
    timing: {
      ...e.timing,
      delay: (e.timing?.delay ?? 0) + random.nextFloat(minDelay, maxDelay),
    },
  }));
}

function applyQueueOverflow(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
  random: SeededRandom,
): ScheduledEvent[] {
  const dropRate = (params.dropRate as number) ?? 0.2;

  return events.map((e) => ({
    ...e,
    timing: {
      ...e.timing,
      drop: e.timing?.drop || random.chance(dropRate),
    },
  }));
}

function applyEditorAtomic(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const tempSuffix = (params.tempSuffix as string) ?? ".tmp";
  const renameDelay = (params.renameDelayMs as number) ?? 50;

  const result: ScheduledEvent[] = [];

  for (const event of events) {
    if (event.type === "change") {
      const baseDelay = event.timing?.delay ?? 0;
      const tempPath = event.path + tempSuffix;

      // 1. Create temp file (write starts)
      result.push({
        ...event,
        type: "add",
        path: tempPath,
        timing: { delay: baseDelay },
        originalIndex: event.originalIndex,
      });

      // 2. Delete original file
      result.push({
        ...event,
        type: "unlink",
        timing: { delay: baseDelay + renameDelay / 2 },
        originalIndex: event.originalIndex,
      });

      // 3. Rename temp to original (appears as add)
      result.push({
        ...event,
        type: "add",
        timing: { delay: baseDelay + renameDelay },
        originalIndex: event.originalIndex,
      });

      // 4. Temp file removed (cleanup)
      result.push({
        ...event,
        type: "unlink",
        path: tempPath,
        timing: { delay: baseDelay + renameDelay + 10 },
        originalIndex: event.originalIndex,
      });
    } else {
      result.push(event);
    }
  }

  return result;
}

function applyEventStorm(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const burstInterval = (params.burstIntervalMs as number) ?? 10;

  return events.map((e, i) => ({
    ...e,
    timing: {
      ...e.timing,
      delay: (e.timing?.delay ?? 0) + i * burstInterval,
    },
  }));
}

function applyReorderChaos(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
  random: SeededRandom,
): ScheduledEvent[] {
  const reorderProb = (params.reorderProbability as number) ?? 0.5;
  const maxWindow = (params.maxReorderWindow as number) ?? 10;

  if (!random.chance(reorderProb)) {
    return events;
  }

  return random.shuffleWithinWindow(events, maxWindow);
}

function applyPartialWrites(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const intermediateEvents = (params.intermediateEvents as number) ?? 3;
  const finalWriteDelay = (params.finalWriteDelayMs as number) ?? 500;

  const result: ScheduledEvent[] = [];

  for (const event of events) {
    if (event.type === "add" || event.type === "change") {
      const baseDelay = event.timing?.delay ?? 0;

      // Initial create/change (file exists but not complete)
      result.push({
        ...event,
        timing: { delay: baseDelay },
      });

      // Intermediate change events (file growing)
      for (let i = 0; i < intermediateEvents; i++) {
        result.push({
          ...event,
          type: "change",
          timing: {
            delay:
              baseDelay +
              (finalWriteDelay / (intermediateEvents + 1)) * (i + 1),
          },
          originalIndex: event.originalIndex,
        });
      }

      // Final change when write completes
      result.push({
        ...event,
        type: "change",
        timing: { delay: baseDelay + finalWriteDelay },
        originalIndex: event.originalIndex,
      });
    } else {
      result.push(event);
    }
  }

  return result;
}

function applyRenameStorm(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const chainLength = (params.chainLength as number) ?? 5;
  const renameInterval = (params.renameIntervalMs as number) ?? 100;

  const result: ScheduledEvent[] = [];

  for (const event of events) {
    if (event.type === "add") {
      const dir = dirname(event.path);
      const ext = event.path.match(/\.[^.]+$/)?.[0] ?? "";
      const baseName = basename(event.path, ext);
      const baseDelay = event.timing?.delay ?? 0;

      // Initial file creation
      result.push(event);

      // Create rename chain: file.md -> file1.md -> file2.md -> ...
      for (let i = 0; i < chainLength; i++) {
        const fromPath =
          i === 0 ? event.path : join(dir, `${baseName}${i}${ext}`);
        const toPath = join(dir, `${baseName}${i + 1}${ext}`);

        // Unlink old path
        result.push({
          ...event,
          type: "unlink",
          path: fromPath,
          timing: { delay: baseDelay + (i + 1) * renameInterval },
          originalIndex: event.originalIndex,
        });

        // Add new path
        result.push({
          ...event,
          type: "add",
          path: toPath,
          timing: { delay: baseDelay + (i + 1) * renameInterval + 10 },
          originalIndex: event.originalIndex,
        });
      }
    } else {
      result.push(event);
    }
  }

  return result;
}

function applyFsEventsCoalesce(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const threshold = (params.coalesceThreshold as number) ?? 10;
  const useParentDir = (params.useParentDirEvent as boolean) ?? true;

  // Group events by directory
  const byDir = new Map<string, ScheduledEvent[]>();
  for (const event of events) {
    const dir = dirname(event.path);
    if (!byDir.has(dir)) {
      byDir.set(dir, []);
    }
    byDir.get(dir)!.push(event);
  }

  const result: ScheduledEvent[] = [];

  for (const [dir, dirEvents] of byDir) {
    if (dirEvents.length > threshold && useParentDir) {
      // Coalesce: emit single directory change instead of individual file events
      result.push({
        type: "change",
        path: dir,
        timing: { delay: 0 },
        originalIndex: dirEvents[0].originalIndex,
      });
    } else {
      result.push(...dirEvents);
    }
  }

  return result;
}

function applyInitGap(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const initDuration = (params.initDurationMs as number) ?? 2000;

  return events.map((e, i) => ({
    ...e,
    timing: {
      ...e.timing,
      delay: (initDuration / (events.length + 1)) * (i + 1),
    },
  }));
}

function applyRapidSuccession(
  events: ScheduledEvent[],
  params: Record<string, unknown>,
): ScheduledEvent[] {
  const editsPerFile = (params.editsPerFile as number) ?? 10;
  const intervalMs = (params.intervalMs as number) ?? 10;

  const result: ScheduledEvent[] = [];

  for (const event of events) {
    const baseDelay = event.timing?.delay ?? 0;

    for (let i = 0; i < editsPerFile; i++) {
      result.push({
        ...event,
        type: event.type === "add" && i > 0 ? "change" : event.type,
        timing: {
          ...event.timing,
          delay: baseDelay + i * intervalMs,
        },
        originalIndex: event.originalIndex,
      });
    }
  }

  return result;
}
