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

export type { FakeVault, FakeVaultOptions } from "./fake-vault.ts";
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
