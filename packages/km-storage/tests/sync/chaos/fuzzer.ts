/**
 * Property-Based Chaos Scenario Fuzzer
 *
 * Generates randomized test scenarios for the sync system and verifies invariants.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs"
import { join, dirname } from "path"
import type {
  ChaosScenario,
  FsEvent,
  FsEventType,
  VerificationResult,
} from "./types.ts"
import { SeededRandom } from "./seeded-random.ts"
import { CHAOS_SCENARIOS, NO_CHAOS } from "./scenarios.ts"
import { combineScenarios } from "./scenario-transformer.ts"
import { ChaosWatcher, createChaosWatcher } from "@beorn/watcher-chaos"
import { Verifier } from "./verifier.ts"
import { runWithKmDir } from "../../../src/emit.ts"
import { resetDb, closeDb, getAllNodes, getDb } from "../../../src/db.ts"
import { runWithDb } from "../../../src/db-instance.ts"
import { createEmitter } from "../../../src/emitter.ts"
import { Database } from "bun:sqlite"
import { SCHEMA } from "../../../src/schema.ts"
import {
  reconcileDirectory,
  reconcileDirectoryRecursive,
  applyReconcileOps,
} from "../../../src/watch/reconcile.ts"
import { createMockFileSystem } from "./mock-fs.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the fuzzer
 */
export interface FuzzConfig {
  /** Random seed for reproducibility */
  seed: number
  /** Number of test iterations to run */
  iterations: number
  /** Maximum number of files to generate per scenario */
  maxFiles: number
  /** Maximum number of events to generate per scenario */
  maxEvents: number
  /** Pool of chaos scenarios to pick from */
  scenarios: ChaosScenario[]
  /** Maximum number of scenarios to combine per test */
  maxCombinedScenarios?: number
  /** Timeout per test in ms */
  timeout?: number
  /** Use in-memory MockFileSystem for faster testing */
  useMockFs?: boolean
}

/**
 * A generated test scenario
 */
export interface GeneratedScenario {
  /** The seed used to generate this specific scenario */
  seed: number
  /** Index within the fuzzer run */
  index: number
  /** Initial file setup */
  setup: Array<{ path: string; content: string }>
  /** Chaos scenarios applied */
  scenarios: ChaosScenario[]
  /** Raw events before scenario transformation */
  events: FsEvent[]
}

/**
 * An invariant violation found during verification
 */
export interface InvariantViolation {
  /** The invariant that was violated */
  invariant: string
  /** Description of what went wrong */
  message: string
  /** Additional context */
  details?: Record<string, unknown>
}

/**
 * Result of a single fuzz iteration
 */
export interface FuzzIterationResult {
  scenario: GeneratedScenario
  passed: boolean
  violations: InvariantViolation[]
  verification: VerificationResult
  duration: number
  eventsEmitted: number
  eventsDropped: number
}

/**
 * A failed fuzz test with reproduction information
 */
export interface FuzzFailure {
  seed: number
  scenario: GeneratedScenario
  violations: InvariantViolation[]
  reproduction: string
}

/**
 * Overall fuzzer run result
 */
export interface FuzzResult {
  iterations: number
  passed: number
  failed: number
  failures: FuzzFailure[]
  duration: number
}

/**
 * Bug report for a sync failure
 */
export interface SyncBugReport {
  seed: number
  scenario: GeneratedScenario
  invariantsViolated: string[]
  expectedState: { files: Map<string, string> }
  actualState: { files: Map<string, string>; nodes: unknown[] }
  diff: {
    missingInDb: string[]
    missingInFs: string[]
    contentMismatches: Array<{
      path: string
      fsContent: string
      dbContent: string
    }>
  }
  reproduction: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate test scenarios based on configuration
 */
export function* generateScenarios(
  config: FuzzConfig,
): Generator<GeneratedScenario> {
  const random = new SeededRandom(config.seed)
  const maxCombined = config.maxCombinedScenarios ?? 2

  for (let i = 0; i < config.iterations; i++) {
    const scenarioSeed = random.nextInt(0, 2 ** 31)

    // Generate random file setup
    const numFiles = random.nextInt(1, config.maxFiles + 1)
    const setup = generateFileSetup(random, numFiles)

    // Pick random scenarios to combine
    const numScenarios = random.nextInt(1, maxCombined + 1)
    const scenarios = pickScenarios(random, config.scenarios, numScenarios)

    // Generate random events targeting the setup files
    const numEvents = random.nextInt(1, config.maxEvents + 1)
    const events = generateEvents(
      random,
      setup.map((f) => f.path),
      numEvents,
    )

    yield {
      seed: scenarioSeed,
      index: i,
      setup,
      scenarios,
      events,
    }
  }
}

/**
 * Generate random file setup
 */
function generateFileSetup(
  random: SeededRandom,
  count: number,
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  const usedPaths = new Set<string>()

  for (let i = 0; i < count; i++) {
    const path = generateFilePath(random, usedPaths)
    usedPaths.add(path)
    const content = generateFileContent(random)
    files.push({ path, content })
  }

  return files
}

/**
 * Generate a random file path
 */
function generateFilePath(random: SeededRandom, existing: Set<string>): string {
  const maxAttempts = 100

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const depth = random.nextInt(0, 3) // 0-2 subdirectories
    const segments: string[] = []

    for (let d = 0; d < depth; d++) {
      segments.push(generateName(random, "dir"))
    }

    segments.push(generateName(random, "file") + ".md")
    const path = segments.join("/")

    if (!existing.has(path)) {
      return path
    }
  }

  // Fallback: use unique suffix
  return `file-${Date.now()}-${random.nextInt(0, 10000)}.md`
}

/**
 * Generate a random name for files/directories
 */
function generateName(random: SeededRandom, type: "file" | "dir"): string {
  const prefixes =
    type === "file"
      ? ["note", "task", "doc", "readme", "index", "inbox"]
      : ["notes", "tasks", "docs", "archive", "projects"]

  const prefix = random.pick(prefixes)
  const suffix = random.chance(0.5) ? `-${random.nextInt(1, 100)}` : ""

  return prefix + suffix
}

/**
 * Generate random markdown content
 */
function generateFileContent(random: SeededRandom): string {
  const lines: string[] = []

  // Header
  const title = `Test File ${random.nextInt(1, 1000)}`
  lines.push(`# ${title}`)
  lines.push("")

  // Random number of tasks
  const numTasks = random.nextInt(0, 10)
  for (let i = 0; i < numTasks; i++) {
    const status = random.pick(["[ ]", "[x]", "[/]", "[-]"])
    const priority = random.chance(0.3)
      ? `[#${random.pick(["A", "B", "C"])}] `
      : ""
    const taskText = `Task ${i + 1}`
    lines.push(`- ${status} ${priority}${taskText}`)
  }

  // Random paragraphs
  if (random.chance(0.5)) {
    lines.push("")
    lines.push(`Some text content ${random.nextInt(1, 1000)}`)
  }

  return lines.join("\n")
}

/**
 * Pick random scenarios from the pool
 */
function pickScenarios(
  random: SeededRandom,
  pool: ChaosScenario[],
  count: number,
): ChaosScenario[] {
  if (pool.length === 0) {
    return [NO_CHAOS]
  }

  const scenarios: ChaosScenario[] = []
  const shuffled = random.shuffle([...pool])

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    scenarios.push(shuffled[i]!)
  }

  return scenarios
}

/**
 * Generate random events targeting files
 */
function generateEvents(
  random: SeededRandom,
  filePaths: string[],
  count: number,
): FsEvent[] {
  const events: FsEvent[] = []
  const eventTypes: FsEventType[] = ["add", "change", "unlink"]

  for (let i = 0; i < count; i++) {
    const type = random.pick(eventTypes)
    const path = random.pick(filePaths)

    events.push({
      type,
      path,
      mtime: Date.now() + i * 100,
    })
  }

  return events
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzer Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the fuzzer with given configuration (sequential)
 */
export async function runFuzzer(config: FuzzConfig): Promise<FuzzResult> {
  const start = Date.now()
  const results: FuzzIterationResult[] = []
  const failures: FuzzFailure[] = []
  const { useMockFs = false } = config

  for (const scenario of generateScenarios(config)) {
    const result = useMockFs
      ? await runSingleIterationWithMockFs(scenario, config.timeout ?? 10)
      : await runSingleIteration(scenario, config.timeout ?? 1000)
    results.push(result)

    if (!result.passed) {
      failures.push({
        seed: scenario.seed,
        scenario,
        violations: result.violations,
        reproduction: generateReproductionCommand(scenario, config.seed),
      })
    }
  }

  return {
    iterations: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    failures,
    duration: Date.now() - start,
  }
}

/**
 * Parallel fuzzer configuration (extends FuzzConfig)
 */
export interface ParallelFuzzConfig extends FuzzConfig {
  /** Run iterations in parallel (default: true) */
  parallel?: boolean
  /** Progress callback */
  onIterationComplete?: (
    iteration: number,
    result: FuzzIterationResult,
    progress: { completed: number; total: number },
  ) => void
}

/**
 * Run the fuzzer with parallel execution for 10-100x speedup.
 *
 * @example
 * const results = await runFuzzerParallel({
 *   seed: 12345,
 *   iterations: 100,
 *   maxFiles: 10,
 *   maxEvents: 20,
 *   scenarios: Object.values(CHAOS_SCENARIOS),
 *   useMockFs: true, // Required for parallel (avoids SQLite conflicts)
 *   parallel: true,
 *   onIterationComplete: (i, result, progress) => {
 *     console.log(`[${progress.completed}/${progress.total}] ${result.passed ? 'PASS' : 'FAIL'}`);
 *   }
 * });
 */
export async function runFuzzerParallel(
  config: ParallelFuzzConfig,
): Promise<FuzzResult> {
  const start = Date.now()
  const { useMockFs = true, parallel = true, onIterationComplete } = config

  // Collect all scenarios first (generator → array)
  const scenarios = [...generateScenarios(config)]
  const total = scenarios.length
  let completed = 0

  const runSingleScenario = async (scenario: GeneratedScenario) => {
    const result = useMockFs
      ? await runSingleIterationWithMockFs(scenario, config.timeout ?? 10)
      : await runSingleIteration(scenario, config.timeout ?? 1000)

    completed++
    if (onIterationComplete) {
      onIterationComplete(scenario.index, result, { completed, total })
    }

    return { scenario, result }
  }

  let results: Array<{
    scenario: GeneratedScenario
    result: FuzzIterationResult
  }>

  if (parallel) {
    results = await Promise.all(scenarios.map(runSingleScenario))
  } else {
    results = []
    for (const scenario of scenarios) {
      results.push(await runSingleScenario(scenario))
    }
  }

  const failures: FuzzFailure[] = results
    .filter((r) => !r.result.passed)
    .map((r) => ({
      seed: r.scenario.seed,
      scenario: r.scenario,
      violations: r.result.violations,
      reproduction: generateReproductionCommand(r.scenario, config.seed),
    }))

  return {
    iterations: results.length,
    passed: results.filter((r) => r.result.passed).length,
    failed: results.filter((r) => !r.result.passed).length,
    failures,
    duration: Date.now() - start,
  }
}

/**
 * Run a single fuzz iteration
 */
async function runSingleIteration(
  scenario: GeneratedScenario,
  timeout: number,
): Promise<FuzzIterationResult> {
  const start = Date.now()
  const testDir = join(
    "/tmp",
    `kmtest-fuzz-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  const repoDir = join(testDir, "repo")
  const kmDir = join(testDir, ".km")

  // Setup
  mkdirSync(kmDir, { recursive: true })
  mkdirSync(repoDir, { recursive: true })

  // Wrap in runWithKmDir for context-local kmDir (enables parallel test isolation)
  return runWithKmDir(kmDir, async () => {
    let chaosWatcher: ChaosWatcher | null = null
    const violations: InvariantViolation[] = []

    try {
      resetDb()

      // Create files
      for (const file of scenario.setup) {
        const fullPath = join(repoDir, file.path)
        const fileDir = dirname(fullPath)
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true })
        }
        writeFileSync(fullPath, file.content)
      }

      // Initial reconciliation - use recursive to handle files in subdirectories
      const db = getDb()
      const emitter = createEmitter({ kmDir, db })
      const ops = reconcileDirectoryRecursive(db, repoDir, repoDir)
      applyReconcileOps(db, ops, repoDir, emitter)

      // Create watcher with combined scenarios
      const combinedScenario =
        scenario.scenarios.length === 1
          ? scenario.scenarios[0]
          : scenario.scenarios[0] // Use first; combineScenarios handles rest

      chaosWatcher = createChaosWatcher({
        debounceMs: 50,
        scenario: combinedScenario,
        seed: scenario.seed,
      })

      chaosWatcher.start(repoDir)

      // Wait for ready (init_gap scenarios need advanceTime)
      await new Promise<void>((resolve) => {
        if (combinedScenario?.type === "init_gap") {
          chaosWatcher!.once("ready", resolve)
          void chaosWatcher!.advanceTime(
            (combinedScenario.params.initDurationMs as number) ?? 2000,
          )
        } else {
          chaosWatcher!.once("ready", resolve)
        }
      })

      // Wire sync handler
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

      // Inject events
      const absoluteEvents = scenario.events.map((e) => ({
        ...e,
        path: join(repoDir, e.path),
      }))

      chaosWatcher.injectBatch(absoluteEvents)
      await chaosWatcher.flush()
      await new Promise((r) => setTimeout(r, timeout))

      // Verify invariants
      const verifier = new Verifier(db)

      // Check all invariants
      const duplicates = verifier.verifyNoDuplicates()
      if (!duplicates.passed) {
        violations.push({
          invariant: "no_duplicates",
          message: "Duplicate nodes found",
          details: { errors: duplicates.errors },
        })
      }

      const parentIntegrity = verifier.verifyParentIntegrity()
      if (!parentIntegrity.passed) {
        violations.push({
          invariant: "parent_integrity",
          message: "Invalid parent references",
          details: { errors: parentIntegrity.errors },
        })
      }

      const filePaths = verifier.verifyFilePaths()
      if (!filePaths.passed) {
        violations.push({
          invariant: "file_paths",
          message: "Missing file paths",
          details: { errors: filePaths.errors },
        })
      }

      const fsDbSync = verifier.verifyFsDbSync(repoDir)
      if (!fsDbSync.passed) {
        violations.push({
          invariant: "fs_db_sync",
          message: "Filesystem and database out of sync",
          details: { errors: fsDbSync.errors },
        })
      }

      const verification = verifier.verifyTreeConsistency()

      return {
        scenario,
        passed: violations.length === 0,
        violations,
        verification,
        duration: Date.now() - start,
        eventsEmitted: chaosWatcher.getEmittedEvents().length,
        eventsDropped: chaosWatcher.getDroppedEvents().length,
      }
    } catch (error) {
      violations.push({
        invariant: "no_crash",
        message: `Test crashed: ${error instanceof Error ? error.message : String(error)}`,
        details: {
          error: error instanceof Error ? error.stack : String(error),
        },
      })

      return {
        scenario,
        passed: false,
        violations,
        verification: {
          passed: false,
          errors: [String(error)],
          warnings: [],
          stats: {
            expectedFiles: 0,
            actualFiles: 0,
            duplicateNodes: 0,
            orphanedNodes: 0,
            missingParents: 0,
          },
        },
        duration: Date.now() - start,
        eventsEmitted: chaosWatcher?.getEmittedEvents().length ?? 0,
        eventsDropped: chaosWatcher?.getDroppedEvents().length ?? 0,
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

/**
 * Run a single fuzz iteration using MockFileSystem (fast, in-memory)
 */
async function runSingleIterationWithMockFs(
  scenario: GeneratedScenario,
  timeout: number,
): Promise<FuzzIterationResult> {
  const start = Date.now()
  const mockFs = createMockFileSystem()
  const repoDir = "/repo"
  const kmDir = "/repo/.km"

  // Use in-memory database for parallel isolation
  const db = new Database(":memory:")
  db.exec(SCHEMA)

  // Create emitter for event emission (skip persist since we're using mock fs)
  const emitter = createEmitter({ kmDir, db, skipPersist: true })

  // Setup - create virtual directories
  mockFs.mkdirSync(repoDir, { recursive: true })
  mockFs.mkdirSync(kmDir, { recursive: true })

  // Declare outside runWithDb so catch/finally can access
  const violations: InvariantViolation[] = []
  let chaosWatcher: ChaosWatcher | null = null

  // Use runWithDb for context-local database (parallel-safe)
  try {
    return await runWithDb(db, async () => {
      // Create files in mock filesystem
      for (const file of scenario.setup) {
        const fullPath = join(repoDir, file.path)
        const fileDir = dirname(fullPath)
        if (!mockFs.existsSync(fileDir)) {
          mockFs.mkdirSync(fileDir, { recursive: true })
        }
        mockFs.writeFileSync(fullPath, file.content)
      }

      // Initial reconciliation with mock scanner
      const scanner = mockFs.createScanner()
      const ops = reconcileDirectoryRecursive(
        db,
        repoDir,
        repoDir,
        undefined,
        scanner,
      )
      applyReconcileOps(db, ops, repoDir, emitter, mockFs)

      // Create watcher with combined scenarios
      const combinedScenario =
        scenario.scenarios.length === 1
          ? scenario.scenarios[0]
          : scenario.scenarios[0]

      chaosWatcher = createChaosWatcher({
        debounceMs: 50,
        scenario: combinedScenario,
        seed: scenario.seed,
      })

      chaosWatcher.start(repoDir)

      // Wait for ready (init_gap scenarios need advanceTime)
      await new Promise<void>((resolve) => {
        if (combinedScenario?.type === "init_gap") {
          chaosWatcher!.once("ready", resolve)
          void chaosWatcher!.advanceTime(
            (combinedScenario.params.initDurationMs as number) ?? 2000,
          )
        } else {
          chaosWatcher!.once("ready", resolve)
        }
      })

      // Wire sync handler with mock fs
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
      const absoluteEvents = scenario.events.map((e) => ({
        ...e,
        path: join(repoDir, e.path),
      }))

      chaosWatcher.injectBatch(absoluteEvents)
      await chaosWatcher.flush()
      await new Promise((r) => setTimeout(r, timeout))

      // Verify invariants with mock fs
      const verifier = new Verifier(db, mockFs)

      // Check all invariants
      const duplicates = verifier.verifyNoDuplicates()
      if (!duplicates.passed) {
        violations.push({
          invariant: "no_duplicates",
          message: "Duplicate nodes found",
          details: { errors: duplicates.errors },
        })
      }

      const parentIntegrity = verifier.verifyParentIntegrity()
      if (!parentIntegrity.passed) {
        violations.push({
          invariant: "parent_integrity",
          message: "Invalid parent references",
          details: { errors: parentIntegrity.errors },
        })
      }

      const filePaths = verifier.verifyFilePaths()
      if (!filePaths.passed) {
        violations.push({
          invariant: "file_paths",
          message: "Missing file paths",
          details: { errors: filePaths.errors },
        })
      }

      const fsDbSync = verifier.verifyFsDbSync(repoDir)
      if (!fsDbSync.passed) {
        violations.push({
          invariant: "fs_db_sync",
          message: "Filesystem and database out of sync",
          details: { errors: fsDbSync.errors },
        })
      }

      const verification = verifier.verifyTreeConsistency()

      return {
        scenario,
        passed: violations.length === 0,
        violations,
        verification,
        duration: Date.now() - start,
        eventsEmitted: chaosWatcher.getEmittedEvents().length,
        eventsDropped: chaosWatcher.getDroppedEvents().length,
      }
    }) // End runWithDb
  } catch (error: unknown) {
    violations.push({
      invariant: "no_crash",
      message: `Test crashed: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: error instanceof Error ? error.stack : String(error) },
    })

    return {
      scenario,
      passed: false,
      violations,
      verification: {
        passed: false,
        errors: [String(error)],
        warnings: [],
        stats: {
          expectedFiles: 0,
          actualFiles: 0,
          duplicateNodes: 0,
          orphanedNodes: 0,
          missingParents: 0,
        },
      },
      duration: Date.now() - start,
      eventsEmitted: chaosWatcher
        ? (chaosWatcher as ChaosWatcher).getEmittedEvents().length
        : 0,
      eventsDropped: chaosWatcher
        ? (chaosWatcher as ChaosWatcher).getDroppedEvents().length
        : 0,
    }
  } finally {
    if (chaosWatcher !== null) {
      await (chaosWatcher as ChaosWatcher).stop()
    }
    db.close()
  }
}

/**
 * Generate a command to reproduce a specific failure
 */
function generateReproductionCommand(
  scenario: GeneratedScenario,
  parentSeed: number,
): string {
  const scenarios = scenario.scenarios.map((s) => s.type).join(",")
  return (
    `# Reproduce with seed: ${scenario.seed}\n` +
    `# Parent seed: ${parentSeed}, iteration: ${scenario.index}\n` +
    `# Scenarios: ${scenarios}\n` +
    `# Files: ${scenario.setup.length}, Events: ${scenario.events.length}\n` +
    `bun test packages/km-storage/tests/sync/chaos/fuzzer.test.ts --test-name-pattern "seed ${scenario.seed}"`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bug Report Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a detailed bug report from a failure
 * @param failure - The fuzz failure to report
 * @param db - Database to read actual state from
 */
export function generateBugReport(
  failure: FuzzFailure,
  db: Database,
): SyncBugReport {
  // Reconstruct expected and actual state
  const expectedFiles = new Map<string, string>()
  for (const file of failure.scenario.setup) {
    expectedFiles.set(file.path, file.content)
  }

  // Get actual state from the provided db
  const actualFiles = new Map<string, string>()
  const nodes = getAllNodes(db)

  // Build diff
  const missingInDb: string[] = []
  const missingInFs: string[] = []
  const contentMismatches: Array<{
    path: string
    fsContent: string
    dbContent: string
  }> = []

  for (const [path] of expectedFiles) {
    if (!actualFiles.has(path)) {
      missingInDb.push(path)
    }
  }

  for (const [path] of actualFiles) {
    if (!expectedFiles.has(path)) {
      missingInFs.push(path)
    }
  }

  return {
    seed: failure.seed,
    scenario: failure.scenario,
    invariantsViolated: failure.violations.map((v) => v.invariant),
    expectedState: { files: expectedFiles },
    actualState: { files: actualFiles, nodes },
    diff: {
      missingInDb,
      missingInFs,
      contentMismatches,
    },
    reproduction: failure.reproduction,
  }
}

/**
 * Format a bug report as markdown
 */
export function formatBugReport(report: SyncBugReport): string {
  const lines: string[] = []

  lines.push("# Sync Bug Report")
  lines.push("")
  lines.push(`**Seed:** ${report.seed}`)
  lines.push("")
  lines.push("## Invariants Violated")
  for (const inv of report.invariantsViolated) {
    lines.push(`- ${inv}`)
  }
  lines.push("")

  lines.push("## Scenario")
  lines.push("")
  lines.push(`**Files:** ${report.scenario.setup.length}`)
  lines.push(`**Events:** ${report.scenario.events.length}`)
  lines.push(
    `**Chaos Scenarios:** ${report.scenario.scenarios.map((s) => s.type).join(", ")}`,
  )
  lines.push("")

  lines.push("### File Setup")
  lines.push("```")
  for (const file of report.scenario.setup) {
    lines.push(`${file.path}:`)
    lines.push(
      file.content.slice(0, 200) + (file.content.length > 200 ? "..." : ""),
    )
    lines.push("")
  }
  lines.push("```")
  lines.push("")

  lines.push("### Events")
  lines.push("```")
  for (const event of report.scenario.events.slice(0, 20)) {
    lines.push(`${event.type}: ${event.path}`)
  }
  if (report.scenario.events.length > 20) {
    lines.push(`... and ${report.scenario.events.length - 20} more`)
  }
  lines.push("```")
  lines.push("")

  lines.push("## Diff")
  lines.push("")
  if (report.diff.missingInDb.length > 0) {
    lines.push("### Missing in Database")
    for (const path of report.diff.missingInDb) {
      lines.push(`- ${path}`)
    }
    lines.push("")
  }
  if (report.diff.missingInFs.length > 0) {
    lines.push("### Missing in Filesystem")
    for (const path of report.diff.missingInFs) {
      lines.push(`- ${path}`)
    }
    lines.push("")
  }

  lines.push("## Reproduction")
  lines.push("```bash")
  lines.push(report.reproduction)
  lines.push("```")

  return lines.join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for Random Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random markdown file with specific characteristics
 */
export function generateRandomFile(
  random: SeededRandom,
  options: {
    minTasks?: number
    maxTasks?: number
    withSections?: boolean
    withLinks?: boolean
  } = {},
): string {
  const {
    minTasks = 0,
    maxTasks = 10,
    withSections = false,
    withLinks = false,
  } = options

  const lines: string[] = []

  // Title
  lines.push(`# Test Document ${random.nextInt(1, 10000)}`)
  lines.push("")

  // Optional sections
  if (withSections && random.chance(0.7)) {
    const numSections = random.nextInt(1, 4)
    for (let s = 0; s < numSections; s++) {
      lines.push(`## Section ${s + 1}`)
      lines.push("")

      // Tasks in section
      const sectionTasks = random.nextInt(0, 5)
      for (let t = 0; t < sectionTasks; t++) {
        lines.push(generateTaskLine(random, withLinks))
      }
      lines.push("")
    }
  }

  // Top-level tasks
  const numTasks = random.nextInt(minTasks, maxTasks + 1)
  for (let i = 0; i < numTasks; i++) {
    lines.push(generateTaskLine(random, withLinks))
  }

  return lines.join("\n")
}

/**
 * Generate a single task line
 */
function generateTaskLine(random: SeededRandom, withLinks: boolean): string {
  const status = random.pick(["[ ]", "[x]", "[/]", "[-]"])
  const priority = random.chance(0.2)
    ? `[#${random.pick(["A", "B", "C"])}] `
    : ""
  const due = random.chance(0.1) ? " @due(2024-12-31)" : ""
  const link =
    withLinks && random.chance(0.15)
      ? ` [[note-${random.nextInt(1, 100)}]]`
      : ""
  const text = `Task ${random.nextInt(1, 1000)}`

  return `- ${status} ${priority}${text}${due}${link}`
}

/**
 * Create a default fuzzer configuration
 */
export function createDefaultFuzzConfig(
  seed: number = Date.now(),
  iterations: number = 100,
): FuzzConfig {
  return {
    seed,
    iterations,
    maxFiles: 10,
    maxEvents: 20,
    scenarios: Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: 2,
    timeout: 500,
  }
}

/**
 * Print fuzzer results to console
 */
export function printFuzzResults(results: FuzzResult): void {
  console.log("\n=== Fuzzer Results ===\n")
  console.log(`Iterations: ${results.iterations}`)
  console.log(`Passed: ${results.passed}`)
  console.log(`Failed: ${results.failed}`)
  console.log(`Duration: ${results.duration}ms`)

  if (results.failures.length > 0) {
    console.log("\n=== Failures ===\n")
    for (const failure of results.failures) {
      console.log(`Seed: ${failure.seed}`)
      console.log(`Violations:`)
      for (const v of failure.violations) {
        console.log(`  - ${v.invariant}: ${v.message}`)
      }
      console.log(`Reproduction:`)
      console.log(failure.reproduction)
      console.log("")
    }
  }
}

/**
 * Replay a stored scenario directly (for regression testing)
 *
 * Unlike runFuzzer which regenerates from seed, this uses the exact
 * stored scenario data - making it immune to fuzzer code changes.
 */
export async function replayScenario(
  scenario: GeneratedScenario,
  timeout: number = 100,
): Promise<FuzzIterationResult> {
  return runSingleIterationWithMockFs(scenario, timeout)
}

/**
 * Generate a scenario from a seed (for saving to regression file)
 *
 * This allows capturing the exact scenario data from a failing seed
 * before saving it as a regression test.
 */
export function generateScenarioFromSeed(
  seed: number,
  config?: Partial<FuzzConfig>,
): GeneratedScenario {
  const random = new SeededRandom(seed)
  const fullConfig: FuzzConfig = {
    seed,
    iterations: 1,
    maxFiles: config?.maxFiles ?? 10,
    maxEvents: config?.maxEvents ?? 20,
    scenarios: config?.scenarios ?? Object.values(CHAOS_SCENARIOS),
    maxCombinedScenarios: config?.maxCombinedScenarios ?? 2,
    timeout: config?.timeout ?? 500,
  }

  // Generate a single scenario using the same logic as the fuzzer
  const scenarioSeed = random.nextInt(0, 2 ** 31)
  const scenarioRandom = new SeededRandom(scenarioSeed)

  // Generate files
  const numFiles = scenarioRandom.nextInt(1, fullConfig.maxFiles + 1)
  const setup: Array<{ path: string; content: string }> = []
  for (let i = 0; i < numFiles; i++) {
    const path = `file-${i}.md`
    const content = generateRandomFile(scenarioRandom)
    setup.push({ path, content })
  }

  // Pick scenarios
  const numScenarios = scenarioRandom.nextInt(
    1,
    (fullConfig.maxCombinedScenarios ?? 2) + 1,
  )
  const scenarios: ChaosScenario[] = []
  for (let i = 0; i < numScenarios; i++) {
    scenarios.push(scenarioRandom.pick(fullConfig.scenarios))
  }

  // Generate events
  const numEvents = scenarioRandom.nextInt(1, fullConfig.maxEvents + 1)
  const events: FsEvent[] = []
  const eventTypes: FsEventType[] = ["add", "change", "unlink"]
  for (let i = 0; i < numEvents; i++) {
    const targetFile = scenarioRandom.pick(setup)
    events.push({
      type: scenarioRandom.pick(eventTypes),
      path: targetFile.path,
      mtime: Date.now() + i * 100,
    })
  }

  return {
    seed: scenarioSeed,
    index: 0,
    setup,
    scenarios,
    events,
  }
}
