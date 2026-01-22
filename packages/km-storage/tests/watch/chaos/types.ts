/**
 * Chaos Simulation Test Framework - Type Definitions
 *
 * Types for simulating file watcher edge cases and verifying system robustness.
 */

import type { EventEmitter } from "events";

/**
 * File system event types matching chokidar
 */
export type FsEventType = "add" | "change" | "unlink" | "addDir" | "unlinkDir";

/**
 * A file system event that can be injected into the mock watcher
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
 * Configuration for the mock watcher
 */
export interface MockWatcherConfig {
  /** Base debounce time (ms) */
  debounceMs: number;
  /** Chaos scenario to apply */
  scenario?: ChaosScenario;
  /** Custom event transformer */
  eventTransformer?: (events: ScheduledEvent[]) => ScheduledEvent[];
  /** Random seed for reproducible chaos */
  seed?: number;
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
 * Mock watcher interface - drop-in replacement for FileSystemWatcher/WorkerWatcher
 */
export interface IMockWatcher extends EventEmitter {
  // Standard watcher interface
  start(vaultPath: string): void;
  stop(): Promise<void>;
  markInFlight(path: string): void;
  clearInFlight(path: string, delayMs?: number): void;
  isInFlight(path: string): boolean;
  forceSync(): void;

  // Chaos injection methods
  injectEvent(event: FsEvent, timing?: EventTiming): void;
  injectEvents(events: FsEvent[]): void;
  injectBatch(events: FsEvent[]): void;

  // Scenario control
  setScenario(scenario: ChaosScenario): void;
  clearScenario(): void;

  // Queue simulation
  simulateQueueOverflow(): void;
  simulateFsEventsFlagMustScanSubDirs(dirPath: string): void;

  // Time manipulation
  advanceTime(ms: number): Promise<void>;
  flush(): Promise<void>;

  // Introspection
  getPendingEvents(): ScheduledEvent[];
  getEmittedEvents(): FsEvent[];
  getDroppedEvents(): FsEvent[];
}

/**
 * Expected state after chaos simulation
 */
export interface ExpectedState {
  /** Files that should exist as nodes */
  files: string[];
  /** Files that should NOT exist as nodes */
  deletedFiles?: string[];
  /** Expected node count (optional, for sanity check) */
  nodeCount?: number;
  /** Specific nodes to verify */
  nodes?: Array<{
    path: string;
    type: "file" | "folder" | "section" | "task";
    content?: string;
    task_status?: string;
    children?: number;
  }>;
}

/**
 * Verification result
 */
export interface VerificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    expectedFiles: number;
    actualFiles: number;
    duplicateNodes: number;
    orphanedNodes: number;
    missingParents: number;
  };
}

/**
 * Verification functions interface
 */
export interface IVerifier {
  /**
   * Verify final state matches expected state
   */
  verifyState(expected: ExpectedState): VerificationResult;

  /**
   * Verify no duplicate nodes exist for the same fs_path
   */
  verifyNoDuplicates(): VerificationResult;

  /**
   * Verify all nodes have valid parent_id references
   */
  verifyParentIntegrity(): VerificationResult;

  /**
   * Verify all file nodes have valid fs_path
   */
  verifyFilePaths(): VerificationResult;

  /**
   * Verify node tree is internally consistent
   */
  verifyTreeConsistency(): VerificationResult;

  /**
   * Compare filesystem state to database state
   */
  verifyFsDbSync(vaultPath: string): VerificationResult;

  /**
   * Run all verifications
   */
  verifyAll(expected: ExpectedState, vaultPath: string): VerificationResult;
}

/**
 * File setup for test initialization
 */
export interface FileSetup {
  path: string;
  content: string;
}

/**
 * Chaos test configuration
 */
export interface ChaosTestConfig {
  name: string;
  scenario: ChaosScenario;
  setup: FileSetup[];
  events: FsEvent[];
  expected: ExpectedState;
  timeout?: number;
}

/**
 * Chaos test result
 */
export interface ChaosTestResult {
  name: string;
  passed: boolean;
  verification: VerificationResult;
  duration: number;
  eventsEmitted: number;
  eventsDropped: number;
}
