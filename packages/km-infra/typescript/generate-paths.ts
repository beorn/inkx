#!/usr/bin/env bun
/**
 * Generate TypeScript paths from workspace packages.
 *
 * Reads workspace patterns from root package.json and generates a paths
 * mapping for use in tsconfig.json. Run this after adding new packages.
 *
 * Usage:
 *   bun packages/km-infra/typescript/generate-paths.ts
 *   bun packages/km-infra/typescript/generate-paths.ts --write
 */

import { Glob } from "bun"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname, relative } from "node:path"

// Strip JSON comments (// and /* */) while preserving strings
function stripJsonComments(json: string): string {
  let result = ""
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let i = 0

  while (i < json.length) {
    const char = json[i]
    const next = json[i + 1]

    if (inString) {
      result += char
      if (char === '"' && json[i - 1] !== "\\") {
        inString = false
      }
      i++
    } else if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        result += char
      }
      i++
    } else if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        i += 2
      } else {
        i++
      }
    } else if (char === '"') {
      inString = true
      result += char
      i++
    } else if (char === "/" && next === "/") {
      inLineComment = true
      i += 2
    } else if (char === "/" && next === "*") {
      inBlockComment = true
      i += 2
    } else {
      result += char
      i++
    }
  }

  return result
}

interface PackageJson {
  name?: string
  workspaces?: string[]
  exports?: Record<string, string> | string
}

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string
    paths?: Record<string, string[]>
  }
  extends?: string
  exclude?: string[]
}

// Find the monorepo root (where root package.json lives)
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

// Resolve an export target to a file path
function resolveExportTarget(
  target: string | Record<string, unknown>,
): string | null {
  if (typeof target === "string") {
    return target
  }
  if (typeof target === "object" && target !== null) {
    // Nested export: { "import": "./src/index.ts", "types": "./src/index.ts" }
    // Prefer "import" or "types" that point to .ts files
    const nested = target as Record<string, unknown>
    for (const key of ["import", "types", "default", "require"]) {
      const value = nested[key]
      if (typeof value === "string" && value.endsWith(".ts")) {
        return value
      }
    }
    // Fall back to first string value
    for (const value of Object.values(nested)) {
      if (typeof value === "string") {
        return value
      }
    }
  }
  return null
}

// Generate paths entry for a package
function generatePathsForPackage(
  pkgDir: string,
  root: string,
): Record<string, string[]> {
  const pkgJsonPath = join(root, pkgDir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as PackageJson

  if (!pkg.name) return {}

  const paths: Record<string, string[]> = {}

  // Handle exports field
  if (pkg.exports) {
    if (typeof pkg.exports === "string") {
      // Simple export: "exports": "./src/index.ts"
      paths[pkg.name] = [`${pkgDir}/${pkg.exports.replace(/^\.\//, "")}`]
    } else {
      // Object exports
      for (const [exportPath, target] of Object.entries(pkg.exports)) {
        const resolved = resolveExportTarget(
          target as string | Record<string, unknown>,
        )
        if (!resolved) continue

        // Skip non-.ts files (like .js or .d.ts only)
        if (!resolved.endsWith(".ts") && !resolved.endsWith(".tsx")) continue

        const targetPath = `${pkgDir}/${resolved.replace(/^\.\//, "")}`

        if (exportPath === ".") {
          // Main export
          paths[pkg.name] = [targetPath]
        } else {
          // Subpath export: "./foo" -> "@pkg/foo"
          const subpath = exportPath.replace(/^\.\//, "")
          paths[`${pkg.name}/${subpath}`] = [targetPath]
        }
      }
    }
  } else {
    // No exports field - try common entry points
    const srcIndex = join(root, pkgDir, "src/index.ts")
    const srcIndexTsx = join(root, pkgDir, "src/index.tsx")

    if (existsSync(srcIndex)) {
      paths[pkg.name] = [`${pkgDir}/src/index.ts`]
    } else if (existsSync(srcIndexTsx)) {
      paths[pkg.name] = [`${pkgDir}/src/index.tsx`]
    }
  }

  return paths
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

  // Generate paths for all packages
  const allPaths: Record<string, string[]> = {}
  for (const pkgDir of packages) {
    const paths = generatePathsForPackage(pkgDir, root)
    Object.assign(allPaths, paths)
  }

  if (shouldWrite) {
    // Read existing tsconfig.json (supports JSONC with comments)
    const tsconfigPath = join(root, "tsconfig.json")
    const tsconfig = JSON.parse(
      stripJsonComments(readFileSync(tsconfigPath, "utf-8")),
    ) as TsConfig

    // Update paths
    if (!tsconfig.compilerOptions) {
      tsconfig.compilerOptions = {}
    }
    tsconfig.compilerOptions.paths = allPaths

    // Write back with formatting
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n")
    console.log(`Updated ${relative(process.cwd(), tsconfigPath)}`)
    console.log(`Generated ${Object.keys(allPaths).length} path mappings`)
  } else {
    // Output JSON to stdout
    console.log(JSON.stringify(allPaths, null, 2))
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
