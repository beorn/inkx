/**
 * Test Harness
 *
 * Orchestrates chaos tests with setup, execution, and verification.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import type {
  ChaosTestConfig,
  ChaosTestResult,
  ExpectedState,
  FsEvent,
  ChaosScenario,
} from "./types.ts";
import { MockWatcher, createMockWatcher } from "./mock-watcher.ts";
import { Verifier } from "./verifier.ts";
import { setKmDir, setDatabase } from "../../../src/emit.ts";
import { resetDb, closeDb, applyEvent } from "../../../src/db.ts";
import { reconcileDirectory, applyReconcileOps } from "../../../src/watch/reconcile.ts";

/**
 * Run a single chaos test
 */
export async function runChaosTest(config: ChaosTestConfig): Promise<ChaosTestResult> {
  const start = Date.now();
  const testDir = join("/tmp", `kmtest-chaos-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const vaultDir = join(testDir, "vault");
  const kmDir = join(testDir, ".km");

  let mockWatcher: MockWatcher | null = null;

  try {
    // ─────────────────────────────────────────────────────────────
    // Setup Phase
    // ─────────────────────────────────────────────────────────────

    // Create directories
    mkdirSync(kmDir, { recursive: true });
    mkdirSync(vaultDir, { recursive: true });

    // Configure database
    setKmDir(kmDir);
    setDatabase({ applyEvent });
    resetDb();

    // Create initial files from setup config
    for (const file of config.setup) {
      const fullPath = join(vaultDir, file.path);
      const fileDir = dirname(fullPath);
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }
      writeFileSync(fullPath, file.content);
    }

    // ─────────────────────────────────────────────────────────────
    // Initial Sync Phase
    // ─────────────────────────────────────────────────────────────

    // Perform initial reconciliation (simulates app startup)
    const ops = reconcileDirectory(vaultDir, vaultDir);
    await applyReconcileOps(ops, vaultDir);

    // ─────────────────────────────────────────────────────────────
    // Chaos Injection Phase
    // ─────────────────────────────────────────────────────────────

    // Create mock watcher with scenario
    mockWatcher = createMockWatcher({
      debounceMs: 50,
      scenario: config.scenario,
      seed: 12345, // Reproducible
    });

    // Start watcher
    mockWatcher.start(vaultDir);

    // Wait for ready (in virtual time, this is instant unless init_gap scenario)
    await new Promise<void>((resolve) => {
      if (config.scenario.type === "init_gap") {
        // For init_gap, we need to advance time
        mockWatcher!.once("ready", resolve);
        void mockWatcher!.advanceTime(
          (config.scenario.params.initDurationMs as number) ?? 2000,
        );
      } else {
        mockWatcher!.once("ready", resolve);
      }
    });

    // Wire up sync handler
    mockWatcher.on("sync", (data: { paths: string[]; directories: string[] }) => {
      void (async () => {
        for (const dir of data.directories) {
          const dirOps = reconcileDirectory(dir, vaultDir);
          await applyReconcileOps(dirOps, vaultDir);
        }
      })();
    });

    // Convert relative paths to absolute and inject events
    const absoluteEvents: FsEvent[] = config.events.map((e) => ({
      ...e,
      path: join(vaultDir, e.path),
    }));

    mockWatcher.injectBatch(absoluteEvents);

    // Process all events
    await mockWatcher.flush();

    // Give extra time for any async processing
    await new Promise((r) => setTimeout(r, config.timeout ?? 100));

    // ─────────────────────────────────────────────────────────────
    // Verification Phase
    // ─────────────────────────────────────────────────────────────

    const verifier = new Verifier();

    // Convert expected paths to absolute
    const expectedWithAbsolutePaths: ExpectedState = {
      ...config.expected,
      files: config.expected.files.map((f) => join(vaultDir, f)),
      deletedFiles: config.expected.deletedFiles?.map((f) => join(vaultDir, f)),
      nodes: config.expected.nodes?.map((n) => ({
        ...n,
        path: join(vaultDir, n.path),
      })),
    };

    const verification = verifier.verifyAll(expectedWithAbsolutePaths, vaultDir);

    return {
      name: config.name,
      passed: verification.passed,
      verification,
      duration: Date.now() - start,
      eventsEmitted: mockWatcher.getEmittedEvents().length,
      eventsDropped: mockWatcher.getDroppedEvents().length,
    };
  } finally {
    // Cleanup
    if (mockWatcher) {
      await mockWatcher.stop();
    }
    closeDb();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  }
}

/**
 * Run a suite of chaos tests
 */
export async function runChaosSuite(
  configs: ChaosTestConfig[],
): Promise<{
  results: ChaosTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalDuration: number;
  };
}> {
  const results: ChaosTestResult[] = [];
  const start = Date.now();

  for (const config of configs) {
    const result = await runChaosTest(config);
    results.push(result);
  }

  return {
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalDuration: Date.now() - start,
    },
  };
}

/**
 * Helper to create a simple test config
 */
export function createTestConfig(
  name: string,
  scenario: ChaosScenario,
  options: {
    setup?: Array<{ path: string; content: string }>;
    events?: FsEvent[];
    expectedFiles?: string[];
    timeout?: number;
  } = {},
): ChaosTestConfig {
  return {
    name,
    scenario,
    setup: options.setup ?? [{ path: "test.md", content: "# Test\n- [ ] Task" }],
    events: options.events ?? [{ type: "change", path: "test.md" }],
    expected: {
      files: options.expectedFiles ?? ["test.md"],
    },
    timeout: options.timeout ?? 100,
  };
}

/**
 * Print test results to console
 */
export function printResults(results: ChaosTestResult[]): void {
  console.log("\n=== Chaos Test Results ===\n");

  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    const icon = result.passed ? "✓" : "✗";

    console.log(`${icon} [${status}] ${result.name}`);
    console.log(`   Duration: ${result.duration}ms`);
    console.log(`   Events emitted: ${result.eventsEmitted}`);
    console.log(`   Events dropped: ${result.eventsDropped}`);

    if (!result.passed) {
      console.log(`   Errors:`);
      for (const error of result.verification.errors) {
        console.log(`     - ${error}`);
      }
    }

    if (result.verification.warnings.length > 0) {
      console.log(`   Warnings:`);
      for (const warning of result.verification.warnings) {
        console.log(`     - ${warning}`);
      }
    }

    console.log();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
}
