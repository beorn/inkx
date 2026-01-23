/**
 * Chaos Simulation Test Framework
 *
 * Export all chaos testing utilities.
 */

// Types
export type {
  FsEventType,
  FsEvent,
  EventTiming,
  ScheduledEvent,
  MockWatcherConfig,
  ChaosScenarioType,
  ChaosScenario,
  IMockWatcher,
  ExpectedState,
  VerificationResult,
  IVerifier,
  FileSetup,
  ChaosTestConfig,
  ChaosTestResult,
} from "./types.ts";

// Scenarios
export {
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
  DUPLICATE_EVENTS,
  CHAOS_SCENARIOS,
  NO_CHAOS,
  createScenario,
} from "./scenarios.ts";

// Utilities
export { SeededRandom } from "./seeded-random.ts";
export { applyScenario, combineScenarios } from "./scenario-transformer.ts";
export { MockWatcher, createMockWatcher } from "./mock-watcher.ts";
export { Verifier, createVerifier, quickVerify } from "./verifier.ts";

// Test Harness
export {
  runChaosTest,
  runChaosSuite,
  createTestConfig,
  printResults,
} from "./harness.ts";

// Fuzzer - Property-based chaos scenario testing
export type {
  FuzzConfig,
  GeneratedScenario,
  InvariantViolation as FuzzerInvariantViolation,
  FuzzIterationResult,
  FuzzFailure,
  FuzzResult,
  SyncBugReport,
} from "./fuzzer.ts";

export {
  generateScenarios,
  runFuzzer,
  generateBugReport,
  formatBugReport,
  generateRandomFile,
  createDefaultFuzzConfig,
  printFuzzResults,
} from "./fuzzer.ts";
