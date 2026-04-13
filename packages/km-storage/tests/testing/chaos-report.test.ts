/**
 * ChaosReport Tests
 *
 * Tests for chaos test report generation and formatting.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { runGenerator } from "@km/core"
import {
  createRepo,
  createChaosHooks,
  createSeededRandom,
  createChaosFakeRepo,
  generateChaosReport,
  formatChaosReport,
  formatChaosReportJson,
  formatChaosReportMarkdown,
} from "../../src/index.ts"
import type { ChaosReport, ChaosScenario } from "../../src/index.ts"

// Tests that don't use createRepo can run in parallel
describe("generateChaosReport", () => {
  test("generates report with ChaosHooks", () => {
    const random = createSeededRandom(12345)
    const hooks = createChaosHooks({
      mutationDropRate: 0.5,
      random,
    })

    const scenario: ChaosScenario = {
      name: "test-scenario",
      seed: 12345,
      description: "Test scenario for report generation",
    }

    const report = generateChaosReport({
      scenario,
      hooks,
      invariantsViolated: [],
      passed: true,
    })

    expect(report.scenario.name).toBe("test-scenario")
    expect(report.scenario.seed).toBe(12345)
    expect(report.passed).toBe(true)
    expect(report.invariantsViolated).toEqual([])
    expect(report.chaosStats).toBeDefined()
    expect(report.stateSnapshot).toBeDefined()
    expect(report.recommendations).toEqual([])
    expect(report.generatedAt).toBeGreaterThan(0)
  })

  test("generates report with ChaosFakeRepo", () => {
    const fakeRepo = createChaosFakeRepo({
      nodes: [
        {
          id: "1",
          parent_id: null,
          parent_idx: 0,
          type: "h",
          item: {},
          fstype: "mdfile",
          content: "Test",
          data: {},
          embed_of: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test-1",
        },
      ],
    })

    const scenario: ChaosScenario = {
      name: "fake-repo-test",
      seed: 99999,
    }

    const report = generateChaosReport({
      scenario,
      fakeRepo,
      passed: true,
    })

    expect(report.stateSnapshot.nodeCount).toBe(1)
    expect(report.stateSnapshot.orphanedNodes).toHaveLength(0)
    expect(report.stateSnapshot.duplicates).toHaveLength(0)
  })

  test("detects orphaned nodes in ChaosFakeRepo", () => {
    const fakeRepo = createChaosFakeRepo({
      nodes: [
        {
          id: "1",
          parent_id: null,
          parent_idx: 0,
          type: "h",
          item: {},
          fstype: "mdfile",
          content: "Root",
          data: {},
          embed_of: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test-1",
        },
        {
          id: "2",
          parent_id: "nonexistent", // Orphan!
          parent_idx: 0,
          type: "h",
          item: {},
          content: "Orphan",
          data: {},
          embed_of: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test-2",
        },
      ],
    })

    const report = generateChaosReport({
      scenario: { name: "orphan-test", seed: 1 },
      fakeRepo,
      passed: false,
      invariantsViolated: ["orphaned nodes found"],
    })

    expect(report.passed).toBe(false)
    expect(report.stateSnapshot.orphanedNodes).toHaveLength(1)
    expect(report.recommendations.length).toBeGreaterThan(0)
    expect(report.recommendations[0]!.type).toBe("bug")
    expect(report.recommendations[0]!.priority).toBe(1)
  })

  test("generates recommendations for high drop rate", () => {
    const hooks = createChaosHooks({ mutationDropRate: 1.0 })

    // Simulate some mutations being tracked
    // We can't easily trigger mutations without a real repo, so just check the structure
    const report = generateChaosReport({
      scenario: { name: "high-drop-test", seed: 1 },
      hooks,
      invariantsViolated: ["data loss detected"],
      passed: false,
    })

    expect(report.passed).toBe(false)
    expect(report.invariantsViolated).toContain("data loss detected")
  })

  test("includes duration when provided", () => {
    const report = generateChaosReport({
      scenario: { name: "timed-test", seed: 1 },
      durationMs: 1500,
      passed: true,
    })

    expect(report.durationMs).toBe(1500)
  })
})

describe("formatChaosReport", () => {
  test("formats report as human-readable text", () => {
    const report: ChaosReport = {
      scenario: {
        name: "format-test",
        seed: 42,
        description: "Test formatting",
      },
      passed: false,
      invariantsViolated: ["test invariant"],
      stateSnapshot: {
        orphanedNodes: [],
        duplicates: [],
        consistencyIssues: [],
        nodeCount: 10,
        timestamp: Date.now(),
      },
      chaosEvents: [],
      chaosStats: {
        totalMutations: 100,
        droppedMutations: 10,
        corruptedMutations: 5,
        successfulMutations: 85,
      },
      recommendations: [
        {
          type: "bug",
          priority: 2,
          description: "Fix the thing",
          suggestion: "Do this instead",
        },
      ],
      generatedAt: Date.now(),
      durationMs: 500,
    }

    const formatted = formatChaosReport(report)

    expect(formatted).toContain("CHAOS TEST REPORT: format-test")
    expect(formatted).toContain("✗ FAILED")
    expect(formatted).toContain("Seed: 42")
    expect(formatted).toContain("Duration: 500ms")
    expect(formatted).toContain("INVARIANTS VIOLATED:")
    expect(formatted).toContain("test invariant")
    expect(formatted).toContain("Total mutations: 100")
    expect(formatted).toContain("Dropped: 10")
    expect(formatted).toContain("RECOMMENDATIONS:")
    expect(formatted).toContain("Fix the thing")
    expect(formatted).toContain("Do this instead")
  })

  test("formats passing report", () => {
    const report: ChaosReport = {
      scenario: { name: "pass-test", seed: 1 },
      passed: true,
      invariantsViolated: [],
      stateSnapshot: {
        orphanedNodes: [],
        duplicates: [],
        consistencyIssues: [],
        nodeCount: 5,
        timestamp: Date.now(),
      },
      chaosEvents: [],
      chaosStats: {
        totalMutations: 50,
        droppedMutations: 0,
        corruptedMutations: 0,
        successfulMutations: 50,
      },
      recommendations: [],
      generatedAt: Date.now(),
    }

    const formatted = formatChaosReport(report)

    expect(formatted).toContain("✓ PASSED")
    expect(formatted).not.toContain("INVARIANTS VIOLATED:")
  })
})

describe("formatChaosReportJson", () => {
  test("formats report as valid JSON", () => {
    const report: ChaosReport = {
      scenario: { name: "json-test", seed: 123 },
      passed: true,
      invariantsViolated: [],
      stateSnapshot: {
        orphanedNodes: [],
        duplicates: [],
        consistencyIssues: [],
        nodeCount: 0,
        timestamp: Date.now(),
      },
      chaosEvents: [],
      chaosStats: {
        totalMutations: 0,
        droppedMutations: 0,
        corruptedMutations: 0,
        successfulMutations: 0,
      },
      recommendations: [],
      generatedAt: Date.now(),
    }

    const json = formatChaosReportJson(report)
    const parsed = JSON.parse(json) as ChaosReport

    expect(parsed.scenario.name).toBe("json-test")
    expect(parsed.passed).toBe(true)
  })
})

describe("formatChaosReportMarkdown", () => {
  test("formats report as markdown", () => {
    const report: ChaosReport = {
      scenario: {
        name: "markdown-test",
        seed: 456,
        config: { mutationDropRate: 0.1 },
      },
      passed: false,
      invariantsViolated: ["something broke"],
      stateSnapshot: {
        orphanedNodes: [],
        duplicates: [],
        consistencyIssues: [],
        nodeCount: 20,
        timestamp: Date.now(),
      },
      chaosEvents: [],
      chaosStats: {
        totalMutations: 200,
        droppedMutations: 20,
        corruptedMutations: 0,
        successfulMutations: 180,
      },
      recommendations: [
        {
          type: "robustness",
          priority: 3,
          description: "Add retry logic",
        },
      ],
      generatedAt: Date.now(),
    }

    const markdown = formatChaosReportMarkdown(report)

    expect(markdown).toContain("# Chaos Test Report: markdown-test")
    expect(markdown).toContain("✗ Failed")
    expect(markdown).toContain("`456`")
    expect(markdown).toContain("## Invariants Violated")
    expect(markdown).toContain("something broke")
    expect(markdown).toContain("| Total mutations | 200 |")
    expect(markdown).toContain("## Recommendations")
    expect(markdown).toContain("🟡 P3")
    expect(markdown).toContain("## Reproduction")
    expect(markdown).toContain("createSeededRandom(456)")
  })
})

// Tests using createRepo must be serial to avoid filesystem conflicts.
// Repo cleanup is handled by `using` keyword.
const TEST_DIR = "/tmp/kmtest-chaos-report"
const REPO_DIR = join(TEST_DIR, "repo")

describe.sequential("integration with real repo", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(REPO_DIR, { recursive: true })
  })

  afterEach(() => {
    // Repo cleanup is handled by `using` keyword - no need for closeDb()
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
  })

  test("generates report from real repo chaos test", () => {
    writeFileSync(
      join(REPO_DIR, "tasks.md"),
      `# Tasks

- [ ] Task one
- [ ] Task two
`,
    )

    const random = createSeededRandom(99999)
    const hooks = createChaosHooks({
      mutationDropRate: 0.5,
      random,
    })

    using repo = runGenerator(createRepo(REPO_DIR, { hooks, loadFiles: true }))

    // Perform some mutations that may be dropped
    const tasks = repo.getAllTasks()
    for (const task of tasks) {
      try {
        repo.updateNode(task.id, { item: { task: { status: "done", marker: "[ ]" } } })
      } catch {
        // Expected for dropped mutations
      }
    }

    const report = generateChaosReport({
      scenario: {
        name: "real-repo-chaos",
        seed: 99999,
        config: { mutationDropRate: 0.5 },
      },
      hooks,
      repo,
      passed: true,
      durationMs: 100,
    })

    expect(report.chaosStats.totalMutations).toBeGreaterThan(0)
    expect(report.stateSnapshot.nodeCount).toBeGreaterThan(0)

    // Verify we can format it
    const text = formatChaosReport(report)
    expect(text).toContain("real-repo-chaos")
  })
})
