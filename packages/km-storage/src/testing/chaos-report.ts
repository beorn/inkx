/**
 * ChaosReport - Automated diagnostic reports for chaos testing
 *
 * Generates structured reports from chaos test failures to aid debugging
 * and create actionable bug reports.
 *
 * @example
 * ```typescript
 * const hooks = createChaosHooks({ mutationDropRate: 0.1 });
 * using repo = runGenerator(createRepo(path, { hooks }));
 *
 * // Run test scenario...
 *
 * // Generate report from test results
 * const report = generateChaosReport({
 *   scenario: { name: "concurrent-updates", seed: 12345 },
 *   hooks,
 *   repo,
 *   invariantsViolated: ["orphaned nodes found"],
 * });
 *
 * console.log(formatChaosReport(report));
 * ```
 */

import type { KNode } from "@km/core"
import type { ChaosHooks, ChaosEvent, ChaosStats } from "./chaos-hooks.ts"
import type { ChaosFakeRepo, ConsistencyIssue } from "./chaos-fake-repo.ts"
import type { Repo } from "../repo/repo.ts"

/**
 * Scenario configuration for chaos testing
 */
export interface ChaosScenario {
  /** Human-readable name for the scenario */
  name: string
  /** Random seed for reproducibility */
  seed: number
  /** Description of what the scenario tests */
  description?: string
  /** Configuration used (drop rates, etc.) */
  config?: Record<string, unknown>
}

/**
 * State snapshot captured during chaos testing
 */
export interface ChaosStateSnapshot {
  /** Nodes with missing parents */
  orphanedNodes: KNode[]
  /** Duplicate IDs found */
  duplicates: Array<{ id: string; count: number }>
  /** Consistency issues from validation */
  consistencyIssues: ConsistencyIssue[]
  /** Total node count at snapshot time */
  nodeCount: number
  /** Timestamp of snapshot */
  timestamp: number
}

/**
 * Recommendation for fixing issues found
 */
export interface ChaosRecommendation {
  /** Type of issue */
  type: "bug" | "robustness" | "test-gap" | "documentation"
  /** Priority (1 = critical, 2 = high, 3 = medium, 4 = low) */
  priority: 1 | 2 | 3 | 4
  /** Description of the recommendation */
  description: string
  /** Suggested fix or next step */
  suggestion?: string
  /** Related code location if known */
  location?: string
}

/**
 * Complete chaos test report
 */
export interface ChaosReport {
  /** Scenario that was tested */
  scenario: ChaosScenario
  /** Whether the test passed or failed */
  passed: boolean
  /** Invariants that were violated */
  invariantsViolated: string[]
  /** State snapshot at failure/completion */
  stateSnapshot: ChaosStateSnapshot
  /** Chaos events that occurred (mutations dropped, corrupted, etc.) */
  chaosEvents: ChaosEvent[]
  /** Statistics about chaos injection */
  chaosStats: ChaosStats
  /** Automated recommendations */
  recommendations: ChaosRecommendation[]
  /** Report generation timestamp */
  generatedAt: number
  /** Duration of the test in milliseconds */
  durationMs?: number
}

/**
 * Options for generating a chaos report
 */
export interface GenerateReportOptions {
  /** The chaos scenario being tested */
  scenario: ChaosScenario
  /** ChaosHooks instance (if using real Repo) */
  hooks?: ChaosHooks
  /** ChaosFakeRepo instance (if using FakeRepo) */
  fakeRepo?: ChaosFakeRepo
  /** Real Repo instance (for state inspection) */
  repo?: Repo
  /** List of invariants that were violated */
  invariantsViolated?: string[]
  /** Whether the test passed */
  passed?: boolean
  /** Test duration in milliseconds */
  durationMs?: number
}

/**
 * Generate a chaos report from test results.
 *
 * Can work with either:
 * - ChaosHooks + real Repo (application-level chaos)
 * - ChaosFakeRepo (in-memory chaos testing)
 *
 * @param options - Report generation options
 * @returns Complete chaos report
 */
export function generateChaosReport(options: GenerateReportOptions): ChaosReport {
  const {
    scenario,
    hooks,
    fakeRepo,
    repo,
    invariantsViolated = [],
    passed = invariantsViolated.length === 0,
    durationMs,
  } = options

  // Gather chaos events and stats
  const chaosEvents = hooks?.getChaosEvents() ?? []
  const chaosStats = hooks?.getStats() ?? {
    totalMutations: 0,
    droppedMutations: 0,
    corruptedMutations: 0,
    successfulMutations: 0,
  }

  // Capture state snapshot
  const stateSnapshot = captureStateSnapshot(fakeRepo, repo)

  // Generate recommendations
  const recommendations = generateRecommendations(invariantsViolated, stateSnapshot, chaosEvents, chaosStats)

  return {
    scenario,
    passed,
    invariantsViolated,
    stateSnapshot,
    chaosEvents,
    chaosStats,
    recommendations,
    generatedAt: Date.now(),
    durationMs,
  }
}

/**
 * Capture current state snapshot from repo
 */
function captureStateSnapshot(fakeRepo?: ChaosFakeRepo, repo?: Repo): ChaosStateSnapshot {
  const timestamp = Date.now()

  if (fakeRepo) {
    // Use ChaosFakeRepo's built-in inspection methods
    const orphanedNodes = fakeRepo.getOrphanedNodes()
    const duplicateMap = fakeRepo.getDuplicateIds()
    const duplicates = Array.from(duplicateMap.entries()).map(([id, count]) => ({
      id,
      count,
    }))
    const consistencyIssues = fakeRepo.validateConsistency()
    const allNodes = fakeRepo.getAllNodes()

    return {
      orphanedNodes,
      duplicates,
      consistencyIssues,
      nodeCount: allNodes.length,
      timestamp,
    }
  }

  if (repo) {
    // For real repos, we have limited inspection capabilities
    // Try to get root children to estimate node count
    const rootChildren = repo.getChildren(null)
    return {
      orphanedNodes: [], // Can't detect without full scan
      duplicates: [], // Can't detect in real repo
      consistencyIssues: [], // Would need validation pass
      nodeCount: rootChildren.length, // Approximation
      timestamp,
    }
  }

  // No repo available
  return {
    orphanedNodes: [],
    duplicates: [],
    consistencyIssues: [],
    nodeCount: 0,
    timestamp,
  }
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(
  invariantsViolated: string[],
  stateSnapshot: ChaosStateSnapshot,
  chaosEvents: ChaosEvent[],
  chaosStats: ChaosStats,
): ChaosRecommendation[] {
  const recommendations: ChaosRecommendation[] = []

  // Check for orphaned nodes
  if (stateSnapshot.orphanedNodes.length > 0) {
    recommendations.push({
      type: "bug",
      priority: 1,
      description: `Found ${stateSnapshot.orphanedNodes.length} orphaned node(s) with missing parents`,
      suggestion: "Add parent existence validation before node creation",
      location: "packages/km-storage/src/db.ts:addNode",
    })
  }

  // Check for duplicates
  if (stateSnapshot.duplicates.length > 0) {
    recommendations.push({
      type: "bug",
      priority: 1,
      description: `Found ${stateSnapshot.duplicates.length} duplicate ID(s)`,
      suggestion: "Ensure ID uniqueness constraint is enforced",
      location: "packages/km-storage/src/db.ts:addNode",
    })
  }

  // Check consistency issues
  for (const issue of stateSnapshot.consistencyIssues) {
    const priority = issue.type === "circular_parent" ? 1 : 2
    recommendations.push({
      type: "bug",
      priority,
      description: `Consistency issue: ${issue.message}`,
      suggestion: `Fix ${issue.type} for node ${issue.nodeId}`,
    })
  }

  // Check for high mutation drop rate impact
  if (chaosStats.droppedMutations > 0 && invariantsViolated.length > 0) {
    const dropRate = chaosStats.droppedMutations / chaosStats.totalMutations
    if (dropRate > 0.5) {
      recommendations.push({
        type: "robustness",
        priority: 2,
        description: `System failed with ${Math.round(dropRate * 100)}% mutation drop rate`,
        suggestion: "Consider adding retry logic or graceful degradation",
      })
    }
  }

  // Check for corruption-induced failures
  const corruptionEvents = chaosEvents.filter((e) => e.type === "corrupt")
  if (corruptionEvents.length > 0 && invariantsViolated.length > 0) {
    recommendations.push({
      type: "robustness",
      priority: 2,
      description: `System failed after ${corruptionEvents.length} corrupted mutation(s)`,
      suggestion: "Add input validation to detect and reject corrupted data",
    })
  }

  // Add invariant-specific recommendations
  for (const invariant of invariantsViolated) {
    if (invariant.includes("orphan")) {
      // Already covered above
      continue
    }
    recommendations.push({
      type: "test-gap",
      priority: 3,
      description: `Invariant violated: ${invariant}`,
      suggestion: "Add specific test case for this invariant",
    })
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority)

  return recommendations
}

/**
 * Format a chaos report as human-readable text.
 *
 * @param report - The chaos report to format
 * @returns Formatted string suitable for console output or bug reports
 */
export function formatChaosReport(report: ChaosReport): string {
  const lines: string[] = []

  // Header
  lines.push("═".repeat(60))
  lines.push(`CHAOS TEST REPORT: ${report.scenario.name}`)
  lines.push("═".repeat(60))
  lines.push("")

  // Status
  const status = report.passed ? "✓ PASSED" : "✗ FAILED"
  lines.push(`Status: ${status}`)
  lines.push(`Seed: ${report.scenario.seed} (use this seed to reproduce)`)
  if (report.durationMs) {
    lines.push(`Duration: ${report.durationMs}ms`)
  }
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`)
  lines.push("")

  // Scenario details
  if (report.scenario.description) {
    lines.push(`Description: ${report.scenario.description}`)
    lines.push("")
  }

  // Invariants violated
  if (report.invariantsViolated.length > 0) {
    lines.push("─".repeat(40))
    lines.push("INVARIANTS VIOLATED:")
    for (const inv of report.invariantsViolated) {
      lines.push(`  • ${inv}`)
    }
    lines.push("")
  }

  // Chaos statistics
  lines.push("─".repeat(40))
  lines.push("CHAOS STATISTICS:")
  lines.push(`  Total mutations: ${report.chaosStats.totalMutations}`)
  lines.push(`  Dropped: ${report.chaosStats.droppedMutations}`)
  lines.push(`  Corrupted: ${report.chaosStats.corruptedMutations}`)
  lines.push(`  Successful: ${report.chaosStats.successfulMutations}`)
  lines.push("")

  // State snapshot
  lines.push("─".repeat(40))
  lines.push("STATE SNAPSHOT:")
  lines.push(`  Node count: ${report.stateSnapshot.nodeCount}`)
  lines.push(`  Orphaned nodes: ${report.stateSnapshot.orphanedNodes.length}`)
  lines.push(`  Duplicate IDs: ${report.stateSnapshot.duplicates.length}`)
  lines.push(`  Consistency issues: ${report.stateSnapshot.consistencyIssues.length}`)
  lines.push("")

  // Chaos events (last 10)
  if (report.chaosEvents.length > 0) {
    lines.push("─".repeat(40))
    lines.push(`CHAOS EVENTS (last ${Math.min(10, report.chaosEvents.length)} of ${report.chaosEvents.length}):`)
    const recentEvents = report.chaosEvents.slice(-10)
    for (const event of recentEvents) {
      const time = new Date(event.timestamp).toISOString().slice(11, 23)
      lines.push(`  [${time}] ${event.type}: ${event.mutation.type} ${event.mutation.nodeId}`)
    }
    lines.push("")
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("─".repeat(40))
    lines.push("RECOMMENDATIONS:")
    for (const rec of report.recommendations) {
      const priority = ["", "P1-CRITICAL", "P2-HIGH", "P3-MEDIUM", "P4-LOW"][rec.priority]
      lines.push(`  [${priority}] [${rec.type}] ${rec.description}`)
      if (rec.suggestion) {
        lines.push(`    → ${rec.suggestion}`)
      }
      if (rec.location) {
        lines.push(`    @ ${rec.location}`)
      }
    }
    lines.push("")
  }

  // Reproduction command
  lines.push("─".repeat(40))
  lines.push("TO REPRODUCE:")
  lines.push(`  Use seed ${report.scenario.seed} with the same scenario configuration`)
  lines.push("")

  lines.push("═".repeat(60))

  return lines.join("\n")
}

/**
 * Format a chaos report as JSON for machine processing.
 *
 * @param report - The chaos report to format
 * @returns JSON string
 */
export function formatChaosReportJson(report: ChaosReport): string {
  return JSON.stringify(report, null, 2)
}

/**
 * Format a chaos report as a markdown bug report.
 *
 * @param report - The chaos report to format
 * @returns Markdown string suitable for issue trackers
 */
export function formatChaosReportMarkdown(report: ChaosReport): string {
  const lines: string[] = []

  // Title
  const status = report.passed ? "passed" : "failed"
  lines.push(`# Chaos Test Report: ${report.scenario.name} (${status})`)
  lines.push("")

  // Summary
  lines.push("## Summary")
  lines.push("")
  lines.push(`- **Status**: ${report.passed ? "✓ Passed" : "✗ Failed"}`)
  lines.push(`- **Seed**: \`${report.scenario.seed}\``)
  if (report.durationMs) {
    lines.push(`- **Duration**: ${report.durationMs}ms`)
  }
  lines.push(`- **Generated**: ${new Date(report.generatedAt).toISOString()}`)
  lines.push("")

  // Invariants violated
  if (report.invariantsViolated.length > 0) {
    lines.push("## Invariants Violated")
    lines.push("")
    for (const inv of report.invariantsViolated) {
      lines.push(`- ${inv}`)
    }
    lines.push("")
  }

  // Chaos statistics
  lines.push("## Chaos Statistics")
  lines.push("")
  lines.push("| Metric | Value |")
  lines.push("|--------|-------|")
  lines.push(`| Total mutations | ${report.chaosStats.totalMutations} |`)
  lines.push(`| Dropped | ${report.chaosStats.droppedMutations} |`)
  lines.push(`| Corrupted | ${report.chaosStats.corruptedMutations} |`)
  lines.push(`| Successful | ${report.chaosStats.successfulMutations} |`)
  lines.push("")

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("## Recommendations")
    lines.push("")
    for (const rec of report.recommendations) {
      const priority = ["", "🔴 P1", "🟠 P2", "🟡 P3", "🟢 P4"][rec.priority]
      lines.push(`### ${priority} [${rec.type}] ${rec.description}`)
      lines.push("")
      if (rec.suggestion) {
        lines.push(`**Suggestion**: ${rec.suggestion}`)
        lines.push("")
      }
      if (rec.location) {
        lines.push(`**Location**: \`${rec.location}\``)
        lines.push("")
      }
    }
  }

  // Reproduction
  lines.push("## Reproduction")
  lines.push("")
  lines.push("```typescript")
  lines.push(`const random = createSeededRandom(${report.scenario.seed});`)
  lines.push("const hooks = createChaosHooks({")
  if (report.scenario.config) {
    for (const [key, value] of Object.entries(report.scenario.config)) {
      lines.push(`  ${key}: ${JSON.stringify(value)},`)
    }
  }
  lines.push("  random,")
  lines.push("});")
  lines.push("```")
  lines.push("")

  return lines.join("\n")
}
