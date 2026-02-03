#!/usr/bin/env bun
/**
 * Generate Knip configuration from workspace packages.
 *
 * Reads workspace patterns from root package.json and generates knip.json
 * with entry points and project patterns for each package.
 *
 * Usage:
 *   bun packages/km-infra/knip/generate.ts
 *   bun packages/km-infra/knip/generate.ts --write
 */

import { Glob } from "bun"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"

interface PackageJson {
  name?: string
  workspaces?: string[]
}

interface KnipWorkspaceConfig {
  entry?: string[]
  project?: string[]
}

interface KnipConfig {
  $schema?: string
  ignore?: string[]
  bun?: boolean
  workspaces: Record<string, KnipWorkspaceConfig>
}

// Find the monorepo root
function findMonorepoRoot(startDir: string): string {
  let dir = startDir
  while (dir !== "/") {
    const pkgPath = join(dir, "package.json")
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageJson
      if (pkg.workspaces) {
        return dir
      }
    }
    dir = dirname(dir)
  }
  throw new Error("Could not find monorepo root with workspaces")
}

// Get all workspace package directories
async function getWorkspacePackages(
  root: string,
  patterns: string[],
): Promise<string[]> {
  const packages: string[] = []

  for (const pattern of patterns) {
    const glob = new Glob(pattern)
    for await (const match of glob.scan({ cwd: root, onlyFiles: false })) {
      const pkgJsonPath = join(root, match, "package.json")
      if (existsSync(pkgJsonPath)) {
        packages.push(match)
      }
    }
  }

  return packages.sort()
}

// Check if a directory has files matching a pattern
function hasFiles(root: string, pkgDir: string, pattern: string): boolean {
  const glob = new Glob(pattern)
  const fullPath = join(root, pkgDir)
  for (const _match of glob.scanSync({ cwd: fullPath })) {
    return true
  }
  return false
}

// Generate Knip config for a package
function generateKnipConfig(
  pkgDir: string,
  root: string,
): KnipWorkspaceConfig | null {
  const srcDir = join(root, pkgDir, "src")
  const testsDir = join(root, pkgDir, "tests")

  // Skip packages without src directory
  if (!existsSync(srcDir)) {
    return null
  }

  const entry: string[] = ["src/index.ts"]
  const project: string[] = ["src/**/*.ts"]

  // Check for tests
  if (existsSync(testsDir)) {
    entry.push("tests/**/*.test.ts")

    // Check for slow tests
    if (hasFiles(root, pkgDir, "tests/**/*.slow.test.ts")) {
      entry.push("tests/**/*.slow.test.ts")
    }

    project.push("tests/**/*.ts")
  }

  // Check for tsx files
  if (hasFiles(root, pkgDir, "src/**/*.tsx")) {
    project.push("src/**/*.tsx")

    if (existsSync(testsDir)) {
      entry.push("tests/**/*.test.tsx")
      project.push("tests/**/*.tsx")
    }
  }

  // Check for storybook
  if (hasFiles(root, pkgDir, "tests/storybook.tsx")) {
    entry.push("tests/storybook.tsx")
  }

  // Check for additional entry points
  const tuiEntry = join(root, pkgDir, "src", "tui.ts")
  if (existsSync(tuiEntry)) {
    entry.unshift("src/tui.ts")
  }

  return { entry, project }
}

async function main() {
  const args = process.argv.slice(2)
  const shouldWrite = args.includes("--write")

  const root = findMonorepoRoot(process.cwd())
  const rootPkgJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf-8"),
  ) as PackageJson

  if (!rootPkgJson.workspaces) {
    console.error("No workspaces found in package.json")
    process.exit(1)
  }

  const packages = await getWorkspacePackages(root, rootPkgJson.workspaces)

  // Generate config
  const config: KnipConfig = {
    $schema: "https://unpkg.com/knip@5/schema.json",
    ignore: [".claude/**", "archive/**"],
    bun: true,
    workspaces: {
      ".": {
        entry: ["scripts/*.ts"],
      },
    },
  }

  for (const pkgDir of packages) {
    const pkgConfig = generateKnipConfig(pkgDir, root)
    if (pkgConfig) {
      config.workspaces[pkgDir] = pkgConfig
    }
  }

  const output = JSON.stringify(config, null, 2) + "\n"

  if (shouldWrite) {
    const knipPath = join(root, "knip.json")
    writeFileSync(knipPath, output)
    console.log(`Updated ${relative(process.cwd(), knipPath)}`)
    console.log(
      `Generated config for ${Object.keys(config.workspaces).length} workspaces`,
    )
  } else {
    console.log(output)
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
