/**
 * @km/storage/testing - Test Utilities
 *
 * Test doubles and helpers for storage layer testing.
 */

export { createFakeRepo } from "./fake-repo.ts"
export { createChaosFakeRepo } from "./chaos-fake-repo.ts"
export { createChaosHooks, createSeededRandom } from "./chaos-hooks.ts"
export {
  generateChaosReport,
  formatChaosReport,
  formatChaosReportJson,
  formatChaosReportMarkdown,
} from "./chaos-report.ts"
export { withTestEnv, withTestEnvSync, getTestMode, isRealMode, isMockMode } from "./env.ts"

export type { FakeRepo, FakeRepoOptions } from "./fake-repo.ts"
export type { TestEnv, TestMode } from "./env.ts"
export type {
  ChaosFakeRepo,
  ChaosFakeRepoOptions,
  TransactionLogEntry,
  CorruptionType,
  ConsistencyIssue,
} from "./chaos-fake-repo.ts"
export type { ChaosHooksConfig, ChaosEvent, ChaosHooks, ChaosStats } from "./chaos-hooks.ts"
export type {
  ChaosScenario,
  ChaosStateSnapshot,
  ChaosRecommendation,
  ChaosReport,
  GenerateReportOptions,
} from "./chaos-report.ts"

// Fixture DSL for building test data
export {
  board,
  column,
  task,
  section,
  paragraph,
  SIMPLE_BOARD,
  NESTED_BOARD,
  BODY_CONTENT_BOARD,
  type BoardFixture,
} from "./fixtures.ts"

// Fake watcher for testing without real filesystem
export { createFakeWatcher, type FakeWatcher } from "./fake-watcher.ts"
