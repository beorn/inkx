/**
 * @beorn/watcher-chaos - Type Definitions
 *
 * Types for simulating file watcher edge cases.
 */

import type { EventEmitter } from "events";

/**
 * File system event types matching chokidar
 */
export type FsEventType = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

/**
 * A file system event
 */
export interface FsEvent {
  type: FsEventType;
  path: string;
  ino?: number;
  mtime?: number;
  size?: number;
}

/**
 * Timing manipulation for events
 */
export interface EventTiming {
  /** Delay before event is emitted (ms) */
  delay?: number;
  /** If true, event is dropped entirely */
  drop?: boolean;
  /** Number of times to duplicate this event */
  duplicates?: number;
  /** Delay between duplicates (ms) */
  duplicateDelay?: number;
}

/**
 * A scheduled event with timing information
 */
export interface ScheduledEvent extends FsEvent {
  timing?: EventTiming;
  /** Original order index for reordering scenarios */
  originalIndex?: number;
}

/**
 * Predefined chaos scenarios
 */
export type ChaosScenarioType =
  | "slow_disk"
  | "queue_overflow"
  | "editor_atomic"
  | "event_storm"
  | "reorder_chaos"
  | "partial_writes"
  | "rename_storm"
  | "fsevents_coalesce"
  | "init_gap"
  | "rapid_succession";

export interface ChaosScenario {
  type: ChaosScenarioType;
  params: Record<string, unknown>;
}

/**
 * Sync event data emitted by watcher
 */
export interface SyncData {
  paths: string[];
  directories: string[];
  overflow?: boolean;
  mustScanSubDirs?: boolean;
}

/**
 * Watcher interface - matches km-storage's FileSystemWatcher/WorkerWatcher
 *
 * Implement this interface to create a drop-in replacement watcher.
 */
export interface WatcherInterface extends EventEmitter {
  /** Start watching a directory */
  start(vaultPath: string): void;

  /** Stop watching */
  stop(): Promise<void>;

  /** Mark a path as in-flight (being written by us) */
  markInFlight(path: string): void;

  /** Clear in-flight status after write settles */
  clearInFlight(path: string, delayMs?: number): void;

  /** Check if a path is in-flight */
  isInFlight(path: string): boolean;

  /** Force immediate sync (bypass debounce) */
  forceSync(): void;

  // Events emitted:
  // "ready" - watcher is ready
  // "sync" - batch of changes detected (SyncData)
  // "error" - error occurred
}

/**
 * Configuration for ChaosWatcher
 */
export interface ChaosWatcherConfig {
  /** Base debounce time (ms) */
  debounceMs: number;
  /** Chaos scenario to apply */
  scenario?: ChaosScenario;
  /** Custom event transformer */
  eventTransformer?: (events: ScheduledEvent[]) => ScheduledEvent[];
  /** Random seed for reproducible chaos */
  seed?: number;
  /** Use virtual time for deterministic testing (default: true) */
  virtualTime?: boolean;
}

/**
 * Extended interface for chaos watcher with test capabilities
 */
export interface IChaosWatcher extends WatcherInterface {
  // Chaos injection methods
  /** Inject a single event */
  inject(event: FsEvent, timing?: EventTiming): void;

  /** Inject multiple events (transformed individually) */
  injectEvents(events: FsEvent[]): void;

  /** Inject a batch of events (transformed as a batch) */
  injectBatch(events: FsEvent[]): void;

  // Scenario control
  /** Set the chaos scenario */
  setScenario(scenario: ChaosScenario): void;

  /** Clear the chaos scenario */
  clearScenario(): void;

  // Queue simulation
  /** Simulate inotify IN_Q_OVERFLOW */
  simulateQueueOverflow(): void;

  /** Simulate FSEvents kFSEventStreamEventFlagMustScanSubDirs */
  simulateFsEventsFlagMustScanSubDirs(dirPath: string): void;

  // Time manipulation (when virtualTime is enabled)
  /** Advance virtual time and process events */
  advanceTime(ms: number): Promise<void>;

  /** Process all pending events immediately */
  flush(): Promise<void>;

  // Introspection
  /** Get pending events not yet emitted */
  getPendingEvents(): ScheduledEvent[];

  /** Get all emitted events */
  getEmittedEvents(): FsEvent[];

  /** Get all dropped events */
  getDroppedEvents(): FsEvent[];

  /** Get current virtual time (if in virtual time mode) */
  getVirtualTime(): number;

  /** Reset all state for a fresh test */
  reset(): void;
}
