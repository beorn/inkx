/**
 * @km/storage/testing - Test Utilities
 *
 * Test doubles and helpers for storage layer testing.
 */

export { createFakeVault } from "./fake-vault.ts";
export { createChaosFakeVault } from "./chaos-fake-vault.ts";
export { createChaosHooks, createSeededRandom } from "./chaos-hooks.ts";
export {
  generateChaosReport,
  formatChaosReport,
  formatChaosReportJson,
  formatChaosReportMarkdown,
} from "./chaos-report.ts";
export {
  withTestEnv,
  withTestEnvSync,
  getTestMode,
  isRealMode,
  isMockMode,
} from "./env.ts";

export type { FakeVault, FakeVaultOptions } from "./fake-vault.ts";
export type { TestEnv, TestMode } from "./env.ts";
export type {
  ChaosFakeVault,
  ChaosFakeVaultOptions,
  TransactionLogEntry,
  CorruptionType,
  ConsistencyIssue,
} from "./chaos-fake-vault.ts";
export type {
  ChaosHooksConfig,
  ChaosEvent,
  ChaosHooks,
  ChaosStats,
} from "./chaos-hooks.ts";
export type {
  ChaosScenario,
  ChaosStateSnapshot,
  ChaosRecommendation,
  ChaosReport,
  GenerateReportOptions,
} from "./chaos-report.ts";

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
} from "./fixtures.ts";
