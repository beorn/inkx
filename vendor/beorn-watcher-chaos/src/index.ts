/**
 * @beorn/watcher-chaos
 *
 * Drop-in replacement file watcher for chaos testing.
 * Simulates file watcher edge cases like dropped events, reordering, and coalescing.
 */

// Main exports
export { ChaosWatcher, createChaosWatcher } from "./watcher.ts";
export { SeededRandom } from "./seeded-random.ts";
export { MockFileSystem, createMockFileSystem } from "./mock-fs.ts";

// Scenarios
export {
  // Predefined scenarios
  SLOW_DISK,
  QUEUE_OVERFLOW,
  EDITOR_ATOMIC,
  EVENT_STORM,
  REORDER_CHAOS,
  PARTIAL_WRITES,
  RENAME_STORM,
  FSEVENTS_COALESCE,
  INIT_GAP,
  RAPID_SUCCESSION,
  NO_CHAOS,
  CHAOS_SCENARIOS,
  // Factory functions
  createScenario,
  slowDisk,
  queueOverflow,
  editorAtomic,
  eventStorm,
  reorderChaos,
  fseventsCoalesce,
  rapidSuccession,
  // Transformers
  applyScenario,
  combineScenarios,
} from "./scenarios.ts";

// Types
export type {
  FsEventType,
  FsEvent,
  EventTiming,
  ScheduledEvent,
  ChaosScenarioType,
  ChaosScenario,
  SyncData,
  WatcherInterface,
  ChaosWatcherConfig,
  IChaosWatcher,
  ServiceStatus,
  Service,
} from "./types.ts";

export type {
  StatResult,
  FsEntry,
  FileSystemOps,
  DirectoryScanner,
  ErrorInjection,
} from "./mock-fs.ts";
