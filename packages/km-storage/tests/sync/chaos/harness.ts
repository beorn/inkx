/**
 * Test Harness
 *
 * Orchestrates chaos tests with setup, execution, and verification.
 * Supports both real filesystem and MockFileSystem for fast testing.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { Database } from "bun:sqlite"
import type {
  ChaosTestConfig,
  ChaosTestResult,
  ExpectedState,
  FsEvent,
  ChaosScenario,
  ChaosScenarioType,
} from "./types.ts"
import { createChaosWatcher } from "@beorn/watcher-chaos"
import { Verifier } from "./verifier.ts"
import { createEmitter } from "../../../src/emitter.ts"
import { SCHEMA } from "../../../src/schema.ts"
import {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  applyReconcileOps,
} from "../../../src/watch/reconcile.ts"
import { FakeFileSystem, createFakeFileSystem } from "./fake-fs.ts"

// Backwards compatibility aliases
const MockFileSystem = FakeFileSystem
const createMockFileSystem = createFakeFileSystem

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
  const repoDir = "/repo"
  const kmDir = "/repo/.km"

  // Create directories in mock filesystem
  mockFs.mkdirSync(repoDir, { recursive: true })
  mockFs.mkdirSync(kmDir, { recursive: true })

  // Create in-memory database for parallel isolation (no shared state)
  // Note: bun:sqlite Database does not have Symbol.dispose, so we use try/finally
  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Create emitter with skipPersist since we're using mock fs
  const emitter = createEmitter({ kmDir, db, skipPersist: true })

  try {
    // ChaosWatcher has Symbol.asyncDispose - use await using for automatic cleanup
    await using chaosWatcher = createChaosWatcher({
      debounceMs: 50,
      scenario: config.scenario,
      seed: 12345,
    })

    // ─────────────────────────────────────────────────────────────
    // Setup Phase (in-memory)
    // ─────────────────────────────────────────────────────────────

    // Create initial files in mock filesystem
    for (const file of config.setup) {
      const fullPath = join(repoDir, file.path)
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
    // Use reconcileDirectoryRecursive to handle subdirectories
    const ops = reconcileDirectoryRecursive(
      db,
      repoDir,
      repoDir,
      undefined,
      scanner,
    )
    applyReconcileOps(db, ops, repoDir, emitter, mockFs)

    // ─────────────────────────────────────────────────────────────
    // Chaos Injection Phase
    // ─────────────────────────────────────────────────────────────

    chaosWatcher.start(repoDir)

    await new Promise<void>((resolve) => {
      if (config.scenario.type === "init_gap") {
        chaosWatcher.once("ready", resolve)
        void chaosWatcher.advanceTime(
          (config.scenario.params.initDurationMs as number) ?? 2000,
        )
      } else {
        chaosWatcher.once("ready", resolve)
      }
    })

    // Wire up sync handler with mock fs
    chaosWatcher.on(
      "sync",
      (data: { paths: string[]; directories: string[] }) => {
        void (async () => {
          for (const dir of data.directories) {
            const dirOps =
              dir === repoDir
                ? reconcileDirectory(db, dir, repoDir, undefined, scanner)
                : reconcileDirectoryRecursive(
                    db,
                    dir,
                    repoDir,
                    undefined,
                    scanner,
                  )
            applyReconcileOps(db, dirOps, repoDir, emitter, mockFs)
          }
        })()
      },
    )

    // Inject events
    const absoluteEvents: FsEvent[] = config.events.map((e) => ({
      ...e,
      path: join(repoDir, e.path),
    }))

    chaosWatcher.injectBatch(absoluteEvents)
    await chaosWatcher.flush()

    // Minimal wait (no real I/O needed)
    await new Promise((r) => setTimeout(r, config.timeout ?? 10))

    // ─────────────────────────────────────────────────────────────
    // Verification Phase
    // ─────────────────────────────────────────────────────────────

    const verifier = new Verifier(db, mockFs)

    const expectedWithAbsolutePaths: ExpectedState = {
      ...config.expected,
      files: config.expected.files.map((f) => join(repoDir, f)),
      deletedFiles: config.expected.deletedFiles?.map((f) => join(repoDir, f)),
      nodes: config.expected.nodes?.map((n) => ({
        ...n,
        path: join(repoDir, n.path),
      })),
    }

    const verification = verifier.verifyAll(expectedWithAbsolutePaths, repoDir)

    return {
      name: config.name,
      passed: verification.passed,
      verification,
      duration: Date.now() - start,
      eventsEmitted: chaosWatcher.getEmittedEvents().length,
      eventsDropped: chaosWatcher.getDroppedEvents().length,
    }
    // chaosWatcher automatically stopped via Symbol.asyncDispose
  } finally {
    db.close()
  }
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
  const repoDir = join(testDir, "repo")
  const kmDir = join(testDir, ".km")

  // Setup Phase
  mkdirSync(kmDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })

  // Create in-memory database for parallel isolation (no shared state)
  // Note: bun:sqlite Database does not have Symbol.dispose, so we use try/finally
  const db = new Database(":memory:")
  db.run(SCHEMA)

  // Create emitter with db wired for event application
  const emitter = createEmitter({ kmDir, db })

  try {
    // ChaosWatcher has Symbol.asyncDispose - use await using for automatic cleanup
    await using chaosWatcher = createChaosWatcher({
      debounceMs: 50,
      scenario: config.scenario,
      seed: 12345,
    })

    for (const file of config.setup) {
      const fullPath = join(repoDir, file.path)
      const fileDir = dirname(fullPath)
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true })
      }
      writeFileSync(fullPath, file.content)
    }

    // Initial Sync Phase
    // Use reconcileDirectoryRecursive to handle subdirectories
    const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
    applyReconcileOps(db, ops, repoDir, emitter)

    // Chaos Injection Phase
    chaosWatcher.start(repoDir)

    await new Promise<void>((resolve) => {
      if (config.scenario.type === "init_gap") {
        chaosWatcher.once("ready", resolve)
        void chaosWatcher.advanceTime(
          (config.scenario.params.initDurationMs as number) ?? 2000,
        )
      } else {
        chaosWatcher.once("ready", resolve)
      }
    })

    chaosWatcher.on(
      "sync",
      (data: { paths: string[]; directories: string[] }) => {
        void (async () => {
          for (const dir of data.directories) {
            const dirOps =
              dir === repoDir
                ? reconcileDirectory(db, dir, repoDir)
                : reconcileDirectoryRecursive(db, dir, repoDir)
            applyReconcileOps(db, dirOps, repoDir, emitter)
          }
        })()
      },
    )

    const absoluteEvents: FsEvent[] = config.events.map((e) => ({
      ...e,
      path: join(repoDir, e.path),
    }))

    chaosWatcher.injectBatch(absoluteEvents)
    await chaosWatcher.flush()
    await new Promise((r) => setTimeout(r, config.timeout ?? 100))

    // Verification Phase
    const verifier = new Verifier(db)

    const expectedWithAbsolutePaths: ExpectedState = {
      ...config.expected,
      files: config.expected.files.map((f) => join(repoDir, f)),
      deletedFiles: config.expected.deletedFiles?.map((f) => join(repoDir, f)),
      nodes: config.expected.nodes?.map((n) => ({
        ...n,
        path: join(repoDir, n.path),
      })),
    }

    const verification = verifier.verifyAll(expectedWithAbsolutePaths, repoDir)

    return {
      name: config.name,
      passed: verification.passed,
      verification,
      duration: Date.now() - start,
      eventsEmitted: chaosWatcher.getEmittedEvents().length,
      eventsDropped: chaosWatcher.getDroppedEvents().length,
    }
    // chaosWatcher automatically stopped via Symbol.asyncDispose
  } finally {
    db.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a suite of chaos tests
 */
async function runChaosSuite(
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
  /** Number of repos to test in parallel */
  repoCount: number
  /** Chaos scenarios to run on each repo */
  scenarios: ChaosScenario[]
  /** Run tests in parallel (default: true) */
  parallel?: boolean
  /** Use mock filesystem (default: true for parallel) */
  useMockFs?: boolean
  /** Callback when a repo test completes */
  onRepoComplete?: (
    repoIndex: number,
    result: ChaosTestResult,
    progress: { completed: number; total: number },
  ) => void
  /** Base seed for reproducible tests (each repo gets seed + repoIndex) */
  baseSeed?: number
  /** Timeout per repo test (ms) */
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
  /** Results grouped by repo */
  byRepo: Map<number, ChaosTestResult[]>
}

/**
 * Run chaos tests across multiple repos in parallel.
 *
 * This enables:
 * - 10-100x speedup via parallelization
 * - Testing multi-user collaborative scenarios
 * - Catching inter-repo race conditions
 * - Better utilization of test resources
 *
 * @example
 * const results = await runChaosSuiteParallel({
 *   repoCount: 10,
 *   scenarios: [SLOW_DISK, EVENT_STORM, QUEUE_OVERFLOW],
 *   parallel: true,
 *   onRepoComplete: (repo, result) => {
 *     console.log(`Repo ${repo}: ${result.passed ? 'PASS' : 'FAIL'}`);
 *   }
 * });
 */
export async function runChaosSuiteParallel(
  config: ParallelSuiteConfig,
): Promise<ParallelSuiteResult> {
  const {
    repoCount,
    scenarios,
    parallel = true,
    useMockFs = true,
    onRepoComplete,
    timeout = 100,
  } = config

  const start = Date.now()
  let completed = 0
  const total = repoCount * scenarios.length

  // Generate all test configs
  const testConfigs: Array<{
    repoIndex: number
    scenario: ChaosScenario
    config: ChaosTestConfig
  }> = []

  for (let repoIndex = 0; repoIndex < repoCount; repoIndex++) {
    for (const scenario of scenarios) {
      testConfigs.push({
        repoIndex,
        scenario,
        config: createTestConfig(
          `repo-${repoIndex}-${scenario.type}`,
          { ...scenario, params: { ...scenario.params } },
          {
            setup: [
              {
                path: "test.md",
                content: `# Repo ${repoIndex}\n- [ ] Task ${repoIndex}`,
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
    if (onRepoComplete) {
      onRepoComplete(testInfo.repoIndex, result, { completed, total })
    }

    return { ...testInfo, result }
  }

  let results: Array<{
    repoIndex: number
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

  // Group results by repo
  const byRepo = new Map<number, ChaosTestResult[]>()
  for (const { repoIndex, result } of results) {
    const repoResults = byRepo.get(repoIndex) || []
    repoResults.push(result)
    byRepo.set(repoIndex, repoResults)
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
    byRepo,
  }
}

/**
 * Print test results to console
 */
function printResults(results: ChaosTestResult[]): void {
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
