/**
 * Centralized test discovery patterns for km project
 *
 * Single source of truth for test file patterns across:
 * - package.json scripts
 * - scripts/test-all.ts
 * - scripts/run-tests.ts (future CLI wrapper)
 */

import { Glob } from "bun"

/**
 * Test pattern configuration for each test type
 */
export const TEST_PATTERNS = {
  fast: {
    // All packages now use Vitest (migration complete)
    include: [
      "packages/**/tests/**/*.test.ts",
      "packages/**/tests/**/*.spec.ts",
      "apps/**/tests/**/*.test.ts",
      "apps/**/tests/**/*.spec.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "**/*.slow.test.ts",
      // Exclude mdtest wrapper files (they're in the mdtest suite)
      "tests/km.test.ts",
      "tests/agent.test.ts",
      "apps/km-cli/tests/km-repl.test.ts",
      "apps/km-cli/tests/sh/sh-tests.test.ts",
    ],
  },
  slow: {
    // All slow tests across all packages
    include: [
      "packages/**/tests/**/*.slow.test.ts",
      "apps/**/tests/**/*.slow.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  mdtest: {
    // All mdtest wrapper files (which load .test.md files)
    // Note: These are .test.ts files that import from @beorn/mdtest/vitest
    include: [
      "tests/km.test.ts",
      "tests/agent.test.ts",
      "apps/km-cli/tests/km-repl.test.ts",
      "apps/km-cli/tests/sh/sh-tests.test.ts",
      "vendor/mdtest/tests/mdtest-e2e.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
} as const

export type TestType = keyof typeof TEST_PATTERNS

/**
 * Discovers test files matching the specified test type patterns
 *
 * @param type - Test type to discover (fast, slow, mdtest)
 * @returns Array of file paths matching the patterns
 */
export async function discoverTests(type: TestType): Promise<string[]> {
  const { include, exclude } = TEST_PATTERNS[type]
  const files: string[] = []

  for (const pattern of include) {
    const glob = new Glob(pattern)
    for await (const file of glob.scan({ cwd: ".", onlyFiles: true })) {
      const shouldExclude = exclude.some((pattern) => {
        // Simple pattern matching for node_modules and .slow.test.ts
        if (pattern === "**/node_modules/**") {
          return file.includes("node_modules")
        }
        if (pattern === "**/*.slow.test.ts") {
          return file.includes(".slow.test.ts")
        }
        // Exact file path matching
        if (pattern === file) {
          return true
        }
        return false
      })

      if (!shouldExclude) {
        files.push(file)
      }
    }
  }

  return files
}
