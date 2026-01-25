/**
 * Chaos Regression Tests
 *
 * Loads stored scenarios from regressions/ directory and replays them.
 * Each scenario file is a markdown file with YAML frontmatter containing
 * the complete test data (setup, events, scenarios), making them immune
 * to changes in the fuzzer generation code.
 *
 * File format:
 * ```markdown
 * ---
 * beadId: km-xxxx
 * fixedIn: abc1234
 * ... (scenario data in YAML)
 * ---
 *
 * # Human-readable description
 *
 * Explanation of the bug and root cause.
 * ```
 *
 * Usage:
 * 1. Chaos test discovers bug with seed 12345
 * 2. Save scenario: bun ./scripts/chaos.ts save-regression -s 12345 -b km-xxxx
 * 3. Fix the bug
 * 4. Test passes = bug stays fixed
 *
 * See regressions/README.md for file format details.
 */

import { describe, test, expect } from "bun:test"
import { readdirSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { parse as parseYaml } from "yaml"
import { replayScenario } from "./fuzzer.ts"
import type { GeneratedScenario, RegressionMetadata } from "./types.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RegressionFile {
  metadata: RegressionMetadata
  scenario: GeneratedScenario
  /** Markdown body (human-readable description) */
  description: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Regression Scenarios
// ─────────────────────────────────────────────────────────────────────────────

const REGRESSIONS_DIR = join(import.meta.dir, "regressions")

/**
 * Parse a markdown file with YAML frontmatter
 */
function parseRegressionFile(
  content: string,
  filename: string,
): RegressionFile {
  // Extract frontmatter
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error(
      `Invalid regression file format: ${filename} (missing frontmatter)`,
    )
  }

  const frontmatter = parseYaml(match[1]!) as Record<string, unknown>
  const description = match[2]?.trim() ?? ""

  // Validate type
  if (frontmatter.type !== "chaos-test") {
    throw new Error(
      `Invalid regression file: ${filename} (expected type: chaos-test, got: ${String(frontmatter.type)})`,
    )
  }

  // Extract metadata
  const metadata: RegressionMetadata = {
    beadId: frontmatter.beadId as string,
    description: description.split("\n")[0]?.replace(/^#\s*/, "") || "",
    fixedIn: frontmatter.fixedIn as string | undefined,
    createdAt: frontmatter.createdAt as string,
    invariantsViolated: (frontmatter.invariantsViolated as string[]) || [],
  }

  // Extract scenario
  const scenario: GeneratedScenario = {
    seed: frontmatter.seed as number,
    index: (frontmatter.index as number) ?? 0,
    setup: frontmatter.setup as GeneratedScenario["setup"],
    scenarios: frontmatter.scenarios as GeneratedScenario["scenarios"],
    events: frontmatter.events as GeneratedScenario["events"],
  }

  return { metadata, scenario, description }
}

function loadRegressionScenarios(): RegressionFile[] {
  if (!existsSync(REGRESSIONS_DIR)) {
    return []
  }

  const files = readdirSync(REGRESSIONS_DIR).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  )
  return files.map((f) => {
    const content = readFileSync(join(REGRESSIONS_DIR, f), "utf-8")
    return parseRegressionFile(content, f)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Chaos Regression Tests", () => {
  const scenarios = loadRegressionScenarios()

  if (scenarios.length === 0) {
    test.skip("no regression scenarios defined yet", () => {})
    return
  }

  for (const { metadata, scenario } of scenarios) {
    test(
      `${metadata.beadId}: ${metadata.description}`,
      async () => {
        // Replay the exact stored scenario (not regenerate from seed)
        const result = await replayScenario(scenario, 100)

        // The test passes if the scenario no longer triggers a failure
        expect(result.passed).toBe(true)

        if (!result.passed) {
          console.log(`\nRegression detected for ${metadata.beadId}:`)
          for (const v of result.violations) {
            console.log(`  - ${v.invariant}: ${v.message}`)
          }
          console.log(`\nScenario seed: ${scenario.seed}`)
          if (metadata.fixedIn) {
            console.log(`Fixed in commit: ${metadata.fixedIn}`)
          }
        }
      },
      { timeout: 5000 },
    )
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all loaded regression scenarios (useful for debugging)
 */
export function listRegressionScenarios(): Array<{
  beadId: string
  description: string
  seed: number
}> {
  return loadRegressionScenarios().map(({ metadata, scenario }) => ({
    beadId: metadata.beadId,
    description: metadata.description,
    seed: scenario.seed,
  }))
}
