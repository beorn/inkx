/**
 * Chaos Simulation Test Framework - Type Definitions
 *
 * Types for simulating file watcher edge cases and verifying system robustness.
 */

import type { EventEmitter } from "events"

/**
 * File system event types matching chokidar
 */
export type FsEventType = "add" | "change" | "unlink" | "addDir" | "unlinkDir"

/**
 * A file system event that can be injected into the mock watcher
 */
export interface FsEvent {
  type: FsEventType
  path: string
  ino?: number
  mtime?: number
  size?: number
}

/**
 * Timing manipulation for events
 */
interface EventTiming {
  /** Delay before event is emitted (ms) */
  delay?: number
  /** If true, event is dropped entirely */
  drop?: boolean
  /** Number of times to duplicate this event */
  duplicates?: number
  /** Delay between duplicates (ms) */
  duplicateDelay?: number
}

/**
 * A scheduled event with timing information
 */
interface ScheduledEvent extends FsEvent {
  timing?: EventTiming
  /** Original order index for reordering scenarios */
  originalIndex?: number
}

/**
 * Configuration for the mock watcher
 */
interface MockWatcherConfig {
  /** Base debounce time (ms) */
  debounceMs: number
  /** Chaos scenario to apply */
  scenario?: ChaosScenario
  /** Custom event transformer */
  eventTransformer?: (events: ScheduledEvent[]) => ScheduledEvent[]
  /** Random seed for reproducible chaos */
  seed?: number
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
  | "rapid_succession"

interface ChaosScenario {
  type: ChaosScenarioType
  params: Record<string, unknown>
}

/**
 * Mock watcher interface - drop-in replacement for FileSystemWatcher/WorkerWatcher
 */
interface IMockWatcher extends EventEmitter {
  // Standard watcher interface
  start(repoPath: string): void
  stop(): Promise<void>
  markInFlight(path: string): void
  clearInFlight(path: string, delayMs?: number): void
  isInFlight(path: string): boolean
  forceSync(): void

  // Chaos injection methods
  injectEvent(event: FsEvent, timing?: EventTiming): void
  injectEvents(events: FsEvent[]): void
  injectBatch(events: FsEvent[]): void

  // Scenario control
  setScenario(scenario: ChaosScenario): void
  clearScenario(): void

  // Queue simulation
  simulateQueueOverflow(): void
  simulateFsEventsFlagMustScanSubDirs(dirPath: string): void

  // Time manipulation
  advanceTime(ms: number): Promise<void>
  flush(): Promise<void>

  // Introspection
  getPendingEvents(): ScheduledEvent[]
  getEmittedEvents(): FsEvent[]
  getDroppedEvents(): FsEvent[]
}

/**
 * Expected state after chaos simulation
 */
export interface ExpectedState {
  /** Files that should exist as nodes */
  files: string[]
  /** Files that should NOT exist as nodes */
  deletedFiles?: string[]
  /** Expected node count (optional, for sanity check) */
  nodeCount?: number
  /** Specific nodes to verify */
  nodes?: Array<{
    path: string
    type: "h" | "p"
    content?: string
    item?: { task?: { status?: string } }
    children?: number
  }>
}

/**
 * Verification result
 */
export interface VerificationResult {
  passed: boolean
  errors: string[]
  warnings: string[]
  stats: {
    expectedFiles: number
    actualFiles: number
    duplicateNodes: number
    orphanedNodes: number
    missingParents: number
  }
}

/**
 * Verification functions interface
 */
export interface IVerifier {
  /**
   * Verify final state matches expected state
   */
  verifyState(expected: ExpectedState): VerificationResult

  /**
   * Verify no duplicate nodes exist for the same fs_path
   */
  verifyNoDuplicates(): VerificationResult

  /**
   * Verify all nodes have valid parent_id references
   */
  verifyParentIntegrity(): VerificationResult

  /**
   * Verify all file nodes have valid fs_path
   */
  verifyFilePaths(): VerificationResult

  /**
   * Verify node tree is internally consistent
   */
  verifyTreeConsistency(): VerificationResult

  /**
   * Compare filesystem state to database state
   */
  verifyFsDbSync(repoPath: string): VerificationResult

  /**
   * Verify content matches between filesystem and database
   * CRITICAL: Catches silent data loss/corruption
   */
  verifyContentSync(repoPath: string): VerificationResult

  /**
   * Verify metadata (mtime, ino) matches between filesystem and database
   */
  verifyMetadataSync(repoPath: string): VerificationResult

  /**
   * Run all verifications
   */
  verifyAll(expected: ExpectedState, repoPath: string): VerificationResult
}

/**
 * File setup for test initialization
 */
interface FileSetup {
  path: string
  content: string
}

/**
 * Chaos test configuration
 */
interface ChaosTestConfig {
  name: string
  scenario: ChaosScenario
  setup: FileSetup[]
  events: FsEvent[]
  expected: ExpectedState
  timeout?: number
}

/**
 * Chaos test result
 */
interface ChaosTestResult {
  name: string
  passed: boolean
  verification: VerificationResult
  duration: number
  eventsEmitted: number
  eventsDropped: number
}

/**
 * Generated scenario from fuzzer (minimal definition for regression files)
 * Full definition is in fuzzer.ts
 */
interface GeneratedScenario {
  /** The seed used to generate this specific scenario */
  seed: number
  /** Index within the fuzzer run */
  index: number
  /** Initial file setup */
  setup: FileSetup[]
  /** Chaos scenarios applied */
  scenarios: ChaosScenario[]
  /** Filesystem events to inject */
  events: FsEvent[]
}

/**
 * Metadata for a regression scenario file
 */
interface RegressionMetadata {
  /** Bead ID for the bug (e.g., "km-91vy") */
  beadId: string
  /** Brief description of what bug this catches */
  description: string
  /** Commit hash that fixed the bug */
  fixedIn?: string
  /** When this regression was added */
  createdAt: string
  /** Which invariants were violated */
  invariantsViolated: string[]
}

/**
 * A regression scenario file stored in regressions/ directory
 */
interface RegressionScenarioFile {
  metadata: RegressionMetadata
  scenario: GeneratedScenario
}
