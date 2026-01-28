/**
 * Vitest configuration factory for km monorepo.
 *
 * Usage:
 *   import { createVitestConfig } from "@km/infra/vitest"
 *   export default createVitestConfig({ ... })
 */

import type { UserConfig, UserConfigFnObject, Plugin } from "vitest/config"
import { defineConfig, mergeConfig } from "vitest/config"
import { availableParallelism } from "node:os"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import tsconfigPaths from "vite-tsconfig-paths"

// Get the directory where this file lives (for resolving setup file)
const __dirname = dirname(fileURLToPath(import.meta.url))

export interface VitestConfigOptions {
  /**
   * Additional Vite/Vitest plugins (e.g., mdtest)
   */
  plugins?: Plugin[]

  /**
   * Test include patterns. Defaults to ["**\/*.{test,spec}.{ts,tsx,md}"]
   */
  include?: string[]

  /**
   * Test exclude patterns. Defaults to node_modules, dist, vendor, .direnv
   */
  exclude?: string[]

  /**
   * Benchmark include patterns
   */
  benchmarkInclude?: string[]

  /**
   * Additional test configuration to merge
   */
  test?: Partial<UserConfig["test"]>

  /**
   * Skip the default setup file (console/stdout enforcement)
   */
  skipSetup?: boolean

  /**
   * Packages to inline for SSR (avoids import issues)
   */
  inlineDeps?: string[]
}

/**
 * Creates a Vitest configuration with sensible defaults for km monorepo.
 *
 * Features:
 * - Automatic tsconfig paths resolution
 * - Test quality enforcement (fail on console output)
 * - Parallel execution with smart worker count
 * - Standard exclude patterns
 */
export function createVitestConfig(
  options: VitestConfigOptions = {},
): UserConfigFnObject {
  const {
    plugins = [],
    include = ["**/*.{test,spec}.{ts,tsx,md}"],
    exclude = [
      "**/node_modules/**",
      "**/dist/**",
      "**/vendor/**",
      "**/.direnv/**",
    ],
    benchmarkInclude = ["**/*.bench.{ts,tsx}"],
    test = {},
    skipSetup = false,
    inlineDeps = ["zod"],
  } = options

  const setupFiles = skipSetup ? [] : [join(__dirname, "setup.ts")]

  const baseConfig: UserConfig = {
    plugins: [tsconfigPaths(), ...plugins],
    test: {
      setupFiles,
      server: {
        deps: {
          inline: inlineDeps,
        },
      },
      include,
      exclude,
      benchmark: {
        include: benchmarkInclude,
        exclude,
      },
      maxWorkers: process.env.VITEST_MAX_WORKERS
        ? Number.parseInt(process.env.VITEST_MAX_WORKERS)
        : Math.max(availableParallelism() - 1, 1),
      minWorkers: 1,
      fileParallelism: true,
    },
  }

  return defineConfig(() => {
    if (test && Object.keys(test).length > 0) {
      return mergeConfig(baseConfig, { test })
    }
    return baseConfig
  })
}

// Re-export for convenience
export { tsconfigPaths }
export { defineConfig, mergeConfig } from "vitest/config"
