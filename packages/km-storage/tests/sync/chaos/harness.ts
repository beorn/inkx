/**
 * Test Harness
 *
 * Orchestrates chaos tests with setup, execution, and verification.
 * Supports both real filesystem and MockFileSystem for fast testing.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import type {
  ChaosTestConfig,
  ChaosTestResult,
  ExpectedState,
  FsEvent,
  ChaosScenario,
  ChaosScenarioType,
} from "./types.ts"
import { ChaosWatcher, createChaosWatcher } from "@beorn/watcher-chaos"
import { Verifier } from "./verifier.ts"
import { runWithKmDir, setDatabase } from "../../../src/emit.ts"
import { resetDb, closeDb, applyEvent } from "../../../src/db.ts"
import {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  applyReconcileOps,
} from "../../../src/watch/reconcile.ts"
import { MockFileSystem, createMockFileSystem } from "./mock-fs.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ChaosTestOptions {
  /** Use in-memory MockFileSystem instead of real /tmp directories */
  useMockFs?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a single chaos test
 */
export async function runChaosTest(
  config: ChaosTestConfig,
  options: ChaosTestOptions = {},
): Promise<ChaosTestResult> {
  const { useMockFs = false } = options

  if (useMockFs) {
    return runChaosTestWithMockFs(config)
  } else {
    return runChaosTestWithRealFs(config)
  }
}

/**
 * Run chaos test using MockFileSystem (fast, in-memory)
 */
async function runChaosTestWithMockFs(
  config: ChaosTestConfig,
): Promise<ChaosTestResult> {
  const start = Date.now()
  const mockFs = createMockFileSystem()
  const vaultDir = "/vault"
  const kmDir = "/tmp/.km" // SQLite still needs real path

  // Create real .km directory for SQLite
  mkdirSync(kmDir, { recursive: true })

  // Wrap in runWithKmDir for context-local kmDir (enables parallel test isolation)
  return runWithKmDir(kmDir, async () => {
    let chaosWatcher: ChaosWatcher | null = null

    try {
      // ─────────────────────────────────────────────────────────────
      // Setup Phase (in-memory)
      // ─────────────────────────────────────────────────────────────

      // Create directories in mock filesystem
      mockFs.mkdirSync(vaultDir, { recursive: true })

      setDatabase({ applyEvent })
      resetDb()

      // Create initial files in mock filesystem
      for (const file of config.setup) {
        const fullPath = join(vaultDir, file.path)
        const fileDir = dirname(fullPath)
        if (!mockFs.existsSync(fileDir)) {
          mockFs.mkdirSync(fileDir, { recursive: true })
        }
        mockFs.writeFileSync(fullPath, file.content)
      }

      // ─────────────────────────────────────────────────────────────
      // Initial Sync Phase
      // ─────────────────────────────────────────────────────────────

      const scanner = mockFs.createScanner()
      const ops = reconcileDirectory(vaultDir, vaultDir, undefined, scanner)
      await applyReconcileOps(ops, vaultDir, mockFs)

      // ─────────────────────────────────────────────────────────────
      // Chaos Injection Phase
      // ─────────────────────────────────────────────────────────────

      chaosWatcher = createChaosWatcher({
        debounceMs: 50,
        scenario: config.scenario,
        seed: 12345,
      })

      chaosWatcher.start(vaultDir)

      await new Promise<void>((resolve) => {
        if (config.scenario.type === "init_gap") {
          chaosWatcher!.once("ready", resolve)
          void chaosWatcher!.advanceTime(
            (config.scenario.params.initDurationMs as number) ?? 2000,
          )
        } else {
          chaosWatcher!.once("ready", resolve)
        }
      })

      // Wire up sync handler with mock fs
      chaosWatcher.on(
        "sync",
        (data: { paths: string[]; directories: string[] }) => {
          void (async () => {
            for (const dir of data.directories) {
              const dirOps =
                dir === vaultDir
                  ? reconcileDirectory(dir, vaultDir, undefined, scanner)
                  : reconcileDirectoryRecursive(
                      dir,
                      vaultDir,
                      undefined,
                      scanner,
                    )
              await applyReconcileOps(dirOps, vaultDir, mockFs)
            }
          })()
        },
      )

      // Inject events
      const absoluteEvents: FsEvent[] = config.events.map((e) => ({
        ...e,
        path: join(vaultDir, e.path),
      }))

      chaosWatcher.injectBatch(absoluteEvents)
      await chaosWatcher.flush()

      // Minimal wait (no real I/O needed)
      await new Promise((r) => setTimeout(r, config.timeout ?? 10))

      // ─────────────────────────────────────────────────────────────
      // Verification Phase
      // ─────────────────────────────────────────────────────────────

      const verifier = new Verifier(mockFs)

      const expectedWithAbsolutePaths: ExpectedState = {
        ...config.expected,
        files: config.expected.files.map((f) => join(vaultDir, f)),
        deletedFiles: config.expected.deletedFiles?.map((f) =>
          join(vaultDir, f),
        ),
        nodes: config.expected.nodes?.map((n) => ({
          ...n,
          path: join(vaultDir, n.path),
        })),
      }

      const verification = verifier.verifyAll(
        expectedWithAbsolutePaths,
        vaultDir,
      )

      return {
        name: config.name,
        passed: verification.passed,
        verification,
        duration: Date.now() - start,
        eventsEmitted: chaosWatcher.getEmittedEvents().length,
        eventsDropped: chaosWatcher.getDroppedEvents().length,
      }
    } finally {
      if (chaosWatcher) {
        await chaosWatcher.stop()
      }
      closeDb()
      // Clean up real .km directory
      if (existsSync(kmDir)) {
        rmSync(kmDir, { recursive: true })
      }
    }
  })
}

/**
 * Run chaos test using real filesystem (original behavior)
 */
async function runChaosTestWithRealFs(
  config: ChaosTestConfig,
): Promise<ChaosTestResult> {
  const start = Date.now()
  const testDir = join(
    "/tmp",
    `kmtest-chaos-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const vaultDir = join(testDir, "vault")
  const kmDir = join(testDir, ".km")

  // Setup Phase
  mkdirSync(kmDir, { recursive: true })
  mkdirSync(vaultDir, { recursive: true })

  // Wrap in runWithKmDir for context-local kmDir (enables parallel test isolation)
  return runWithKmDir(kmDir, async () => {
    let chaosWatcher: ChaosWatcher | null = null

    try {
      setDatabase({ applyEvent })
      resetDb()

      for (const file of config.setup) {
        const fullPath = join(vaultDir, file.path)
        const fileDir = dirname(fullPath)
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true })
        }
        writeFileSync(fullPath, file.content)
      }

      // Initial Sync Phase
      const ops = reconcileDirectory(vaultDir, vaultDir)
      await applyReconcileOps(ops, vaultDir)

      // Chaos Injection Phase
      chaosWatcher = createChaosWatcher({
        debounceMs: 50,
        scenario: config.scenario,
        seed: 12345,
      })

      chaosWatcher.start(vaultDir)

      await new Promise<void>((resolve) => {
        if (config.scenario.type === "init_gap") {
          chaosWatcher!.once("ready", resolve)
          void chaosWatcher!.advanceTime(
            (config.scenario.params.initDurationMs as number) ?? 2000,
          )
        } else {
          chaosWatcher!.once("ready", resolve)
        }
      })

      chaosWatcher.on(
        "sync",
        (data: { paths: string[]; directories: string[] }) => {
          void (async () => {
            for (const dir of data.directories) {
              const dirOps =
                dir === vaultDir
                  ? reconcileDirectory(dir, vaultDir)
                  : reconcileDirectoryRecursive(dir, vaultDir)
              await applyReconcileOps(dirOps, vaultDir)
            }
          })()
        },
      )

      const absoluteEvents: FsEvent[] = config.events.map((e) => ({
        ...e,
        path: join(vaultDir, e.path),
      }))

      chaosWatcher.injectBatch(absoluteEvents)
      await chaosWatcher.flush()
      await new Promise((r) => setTimeout(r, config.timeout ?? 100))

      // Verification Phase
      const verifier = new Verifier()

      const expectedWithAbsolutePaths: ExpectedState = {
        ...config.expected,
        files: config.expected.files.map((f) => join(vaultDir, f)),
        deletedFiles: config.expected.deletedFiles?.map((f) =>
          join(vaultDir, f),
        ),
        nodes: config.expected.nodes?.map((n) => ({
          ...n,
          path: join(vaultDir, n.path),
        })),
      }

      const verification = verifier.verifyAll(
        expectedWithAbsolutePaths,
        vaultDir,
      )

      return {
        name: config.name,
        passed: verification.passed,
        verification,
        duration: Date.now() - start,
        eventsEmitted: chaosWatcher.getEmittedEvents().length,
        eventsDropped: chaosWatcher.getDroppedEvents().length,
      }
    } finally {
      if (chaosWatcher) {
        await chaosWatcher.stop()
      }
      closeDb()
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true })
      }
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a suite of chaos tests
 */
export async function runChaosSuite(
  configs: ChaosTestConfig[],
  options: ChaosTestOptions = {},
): Promise<{
  results: ChaosTestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    totalDuration: number
  }
}> {
  const results: ChaosTestResult[] = []
  const start = Date.now()

  for (const config of configs) {
    const result = await runChaosTest(config, options)
    results.push(result)
  }

  return {
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      totalDuration: Date.now() - start,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper to create a simple test config
 */
export function createTestConfig(
  name: string,
  scenario: ChaosScenario,
  options: {
    setup?: Array<{ path: string; content: string }>
    events?: FsEvent[]
    expectedFiles?: string[]
    timeout?: number
  } = {},
): ChaosTestConfig {
  return {
    name,
    scenario,
    setup: options.setup ?? [
      { path: "test.md", content: "# Test\n- [ ] Task" },
    ],
    events: options.events ?? [{ type: "change", path: "test.md" }],
    expected: {
      files: options.expectedFiles ?? ["test.md"],
    },
    timeout: options.timeout ?? 100,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parallel Suite Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for parallel chaos test suite
 */
export interface ParallelSuiteConfig {
  /** Number of vaults to test in parallel */
  vaultCount: number
  /** Chaos scenarios to run on each vault */
  scenarios: ChaosScenario[]
  /** Run tests in parallel (default: true) */
  parallel?: boolean
  /** Use mock filesystem (default: true for parallel) */
  useMockFs?: boolean
  /** Callback when a vault test completes */
  onVaultComplete?: (
    vaultIndex: number,
    result: ChaosTestResult,
    progress: { completed: number; total: number },
  ) => void
  /** Base seed for reproducible tests (each vault gets seed + vaultIndex) */
  baseSeed?: number
  /** Timeout per vault test (ms) */
  timeout?: number
}

/**
 * Result from parallel suite execution
 */
export interface ParallelSuiteResult {
  results: ChaosTestResult[]
  summary: {
    total: number
    passed: number
    failed: number
    totalDuration: number
    parallelSpeedup: number // estimated vs sequential
  }
  /** Results grouped by scenario */
  byScenario: Map<ChaosScenarioType, ChaosTestResult[]>
  /** Results grouped by vault */
  byVault: Map<number, ChaosTestResult[]>
}

/**
 * Run chaos tests across multiple vaults in parallel.
 *
 * This enables:
 * - 10-100x speedup via parallelization
 * - Testing multi-user collaborative scenarios
 * - Catching inter-vault race conditions
 * - Better utilization of test resources
 *
 * @example
 * const results = await runChaosSuiteParallel({
 *   vaultCount: 10,
 *   scenarios: [SLOW_DISK, EVENT_STORM, QUEUE_OVERFLOW],
 *   parallel: true,
 *   onVaultComplete: (vault, result) => {
 *     console.log(`Vault ${vault}: ${result.passed ? 'PASS' : 'FAIL'}`);
 *   }
 * });
 */
export async function runChaosSuiteParallel(
  config: ParallelSuiteConfig,
): Promise<ParallelSuiteResult> {
  const {
    vaultCount,
    scenarios,
    parallel = true,
    useMockFs = true,
    onVaultComplete,
    timeout = 100,
  } = config

  const start = Date.now()
  let completed = 0
  const total = vaultCount * scenarios.length

  // Generate all test configs
  const testConfigs: Array<{
    vaultIndex: number
    scenario: ChaosScenario
    config: ChaosTestConfig
  }> = []

  for (let vaultIndex = 0; vaultIndex < vaultCount; vaultIndex++) {
    for (const scenario of scenarios) {
      testConfigs.push({
        vaultIndex,
        scenario,
        config: createTestConfig(
          `vault-${vaultIndex}-${scenario.type}`,
          { ...scenario, params: { ...scenario.params } },
          {
            setup: [
              {
                path: "test.md",
                content: `# Vault ${vaultIndex}\n- [ ] Task ${vaultIndex}`,
              },
            ],
            events: [{ type: "change", path: "test.md" }],
            expectedFiles: ["test.md"],
            timeout,
          },
        ),
      })
    }
  }

  // Run tests
  const runSingleTest = async (testInfo: (typeof testConfigs)[0]) => {
    const result = await runChaosTest(testInfo.config, { useMockFs })

    completed++
    if (onVaultComplete) {
      onVaultComplete(testInfo.vaultIndex, result, { completed, total })
    }

    return { ...testInfo, result }
  }

  let results: Array<{
    vaultIndex: number
    scenario: ChaosScenario
    result: ChaosTestResult
  }>

  if (parallel) {
    // Run all tests in parallel
    results = await Promise.all(testConfigs.map(runSingleTest))
  } else {
    // Run sequentially for comparison/debugging
    results = []
    for (const testConfig of testConfigs) {
      results.push(await runSingleTest(testConfig))
    }
  }

  const duration = Date.now() - start

  // Group results by scenario
  const byScenario = new Map<ChaosScenarioType, ChaosTestResult[]>()
  for (const { scenario, result } of results) {
    const scenarioResults = byScenario.get(scenario.type) || []
    scenarioResults.push(result)
    byScenario.set(scenario.type, scenarioResults)
  }

  // Group results by vault
  const byVault = new Map<number, ChaosTestResult[]>()
  for (const { vaultIndex, result } of results) {
    const vaultResults = byVault.get(vaultIndex) || []
    vaultResults.push(result)
    byVault.set(vaultIndex, vaultResults)
  }

  // Calculate estimated sequential time
  const sequentialEstimate = results.reduce(
    (sum, r) => sum + r.result.duration,
    0,
  )

  return {
    results: results.map((r) => r.result),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.result.passed).length,
      failed: results.filter((r) => !r.result.passed).length,
      totalDuration: duration,
      parallelSpeedup: sequentialEstimate / duration,
    },
    byScenario,
    byVault,
  }
}

/**
 * Print test results to console
 */
export function printResults(results: ChaosTestResult[]): void {
  console.log("\n=== Chaos Test Results ===\n")

  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL"
    const icon = result.passed ? "✓" : "✗"

    console.log(`${icon} [${status}] ${result.name}`)
    console.log(`   Duration: ${result.duration}ms`)
    console.log(`   Events emitted: ${result.eventsEmitted}`)
    console.log(`   Events dropped: ${result.eventsDropped}`)

    if (!result.passed) {
      console.log(`   Errors:`)
      for (const error of result.verification.errors) {
        console.log(`     - ${error}`)
      }
    }

    if (result.verification.warnings.length > 0) {
      console.log(`   Warnings:`)
      for (const warning of result.verification.warnings) {
        console.log(`     - ${warning}`)
      }
    }

    console.log()
  }

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(
    `Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`,
  )
}
