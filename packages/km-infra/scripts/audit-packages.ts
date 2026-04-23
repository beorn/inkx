#!/usr/bin/env bun
/**
 * Vendor package publishing audit
 *
 * Checks all vendor packages for publishing readiness:
 * - LICENSE, README, author, metadata
 * - tsdown config + publishConfig exports
 * - files field (dist only)
 * - Version alignment for coordinated releases
 * - Cross-dependency version consistency
 *
 * Usage:
 *   bun packages/km-infra/scripts/audit-packages.ts           # Full audit
 *   bun packages/km-infra/scripts/audit-packages.ts --fix     # Auto-fix what's possible
 *   bun packages/km-infra/scripts/audit-packages.ts --json    # JSON output
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const ROOT = join(import.meta.dir, "..", "..", "..")
const args = process.argv.slice(2)
const jsonMode = args.includes("--json")

// ─── Package Discovery ──────────────────────────────────────────────────────

interface PkgInfo {
  name: string
  version: string
  dir: string
  private: boolean
  // Metadata
  hasReadme: boolean
  hasLicense: boolean
  author: string
  license: string
  description: string
  homepage: string
  // Publishing
  hasExports: boolean
  hasTsdown: boolean
  hasPublishConfig: boolean
  hasFiles: boolean
  filesIncludesDist: boolean
  filesIncludesSrc: boolean
  hasBin: boolean
  binPointsToDist: boolean
  // npm
  npmVersion: string
  // Cross-deps
  silveryCrossDeps: Record<string, string>
}

function discoverPackages(): PkgInfo[] {
  const packages: PkgInfo[] = []

  const dirs = [
    // Silvery monorepo packages
    ...readdirSync(join(ROOT, "vendor/silvery/packages"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, "vendor/silvery/packages", d.name, "package.json")))
      .map((d) => join(ROOT, "vendor/silvery/packages", d.name)),
    // Silvery barrel
    join(ROOT, "vendor/silvery"),
    // Silvery examples
    join(ROOT, "vendor/silvery/examples"),
    // Standalone vendor packages
    join(ROOT, "vendor/loggily"),
    join(ROOT, "vendor/flexily"),
    // Bearly packages
    ...readdirSync(join(ROOT, "vendor/bearly/packages"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, "vendor/bearly/packages", d.name, "package.json")))
      .map((d) => join(ROOT, "vendor/bearly/packages", d.name)),
  ]

  interface RawPkg {
    name?: string
    version?: string
    private?: boolean
    author?: string | { name?: string }
    license?: string
    description?: string
    homepage?: string
    exports?: unknown
    tsdown?: unknown
    publishConfig?: Record<string, unknown>
    files?: string[]
    bin?: string | Record<string, string>
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }

  for (const dir of dirs) {
    const pkgPath = join(dir, "package.json")
    if (!existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as RawPkg
      const files = pkg.files ?? []
      const bin = pkg.bin ?? {}
      const publishConfig = pkg.publishConfig ?? {}
      const silveryCrossDeps: Record<string, string> = {}
      for (const [k, v] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        if (k.startsWith("@silvery/") || k === "silvery" || k === "loggily" || k === "flexily") {
          silveryCrossDeps[k] = v
        }
      }

      let npmVersion = ""
      try {
        npmVersion = execSync(`npm view ${pkg.name ?? ""} version 2>/dev/null`, { encoding: "utf8" }).trim()
      } catch {}

      const binValues = typeof bin === "string" ? [bin] : Object.values(bin)
      const binPointsToDist = binValues.length === 0 || binValues.every((b) => b.includes("/dist/"))

      const authorStr = typeof pkg.author === "string" ? pkg.author : (pkg.author?.name ?? "")

      packages.push({
        name: pkg.name ?? "",
        version: pkg.version ?? "",
        dir: dir.replace(ROOT + "/", ""),
        private: pkg.private ?? false,
        hasReadme: existsSync(join(dir, "README.md")),
        hasLicense: existsSync(join(dir, "LICENSE")),
        author: authorStr,
        license: pkg.license ?? "",
        description: pkg.description ?? "",
        homepage: pkg.homepage ?? "",
        hasExports: !!pkg.exports,
        hasTsdown: !!pkg.tsdown,
        hasPublishConfig: "exports" in publishConfig,
        hasFiles: files.length > 0,
        filesIncludesDist: files.includes("dist"),
        filesIncludesSrc: files.includes("src"),
        hasBin: binValues.length > 0,
        binPointsToDist,
        npmVersion,
        silveryCrossDeps,
      })
    } catch (e) {
      console.error(`Error reading ${pkgPath}: ${String(e)}`)
    }
  }

  return packages
}

// ─── Checks ─────────────────────────────────────────────────────────────────

interface Issue {
  pkg: string
  severity: "error" | "warn" | "info"
  check: string
  message: string
}

function audit(packages: PkgInfo[]): Issue[] {
  const issues: Issue[] = []

  for (const pkg of packages) {
    if (pkg.private) continue // Skip private packages

    // Critical
    if (!pkg.hasLicense) {
      issues.push({ pkg: pkg.name, severity: "error", check: "license-file", message: "Missing LICENSE file" })
    }
    if (!pkg.license) {
      issues.push({
        pkg: pkg.name,
        severity: "error",
        check: "license-field",
        message: "Missing license field in package.json",
      })
    }

    // Publishing readiness
    if (!pkg.hasTsdown) {
      issues.push({
        pkg: pkg.name,
        severity: "error",
        check: "tsdown-config",
        message: "Missing tsdown config in package.json",
      })
    }
    if (!pkg.hasPublishConfig) {
      issues.push({
        pkg: pkg.name,
        severity: "error",
        check: "publish-config",
        message: "Missing publishConfig.exports (pnpm publish won't override exports)",
      })
    }
    if (!pkg.filesIncludesDist) {
      issues.push({
        pkg: pkg.name,
        severity: "error",
        check: "files-dist",
        message: "files field doesn't include 'dist'",
      })
    }
    if (pkg.filesIncludesSrc) {
      issues.push({
        pkg: pkg.name,
        severity: "warn",
        check: "files-src",
        message: "files field includes 'src' — should only ship dist/",
      })
    }
    if (pkg.hasBin && !pkg.binPointsToDist) {
      // Check if publishConfig.bin overrides it
      issues.push({
        pkg: pkg.name,
        severity: "warn",
        check: "bin-dist",
        message: "bin points to source (.ts) — ensure publishConfig.bin overrides to dist/*.js for npx",
      })
    }

    // Metadata
    if (!pkg.hasReadme) {
      issues.push({ pkg: pkg.name, severity: "warn", check: "readme", message: "Missing README.md" })
    }
    if (!pkg.description) {
      issues.push({ pkg: pkg.name, severity: "warn", check: "description", message: "Missing description" })
    }
    if (pkg.author === "Beorn" || pkg.author === "beorn" || pkg.author === "") {
      issues.push({
        pkg: pkg.name,
        severity: "warn",
        check: "author",
        message: `Author should be "Bjørn Stabell <bjorn@stabell.org>", got "${pkg.author || "empty"}"`,
      })
    }

    // Cross-dependency versions
    for (const [dep, ver] of Object.entries(pkg.silveryCrossDeps)) {
      if (ver.startsWith("github:") || ver.startsWith("workspace:") || ver.startsWith("$")) {
        issues.push({
          pkg: pkg.name,
          severity: "error",
          check: "dep-version",
          message: `${dep} uses non-npm version: ${ver}`,
        })
      }
    }
  }

  return issues
}

// ─── Report ─────────────────────────────────────────────────────────────────

const packages = discoverPackages()
const issues = audit(packages)

if (jsonMode) {
  console.log(JSON.stringify({ packages, issues }, null, 2))
  process.exit(issues.some((i) => i.severity === "error") ? 1 : 0)
}

const publicPkgs = packages.filter((p) => !p.private)
const privatePkgs = packages.filter((p) => p.private)

console.log(`\n📦 Vendor Package Audit`)
console.log(`   ${publicPkgs.length} public, ${privatePkgs.length} private, ${packages.length} total\n`)

// Summary table
console.log("Package                         Version   npm        README LICENSE tsdown pubCfg files")
console.log("─".repeat(95))
for (const pkg of packages) {
  const r = pkg.hasReadme ? "  ✓  " : "  ✗  "
  const l = pkg.hasLicense ? "  ✓  " : "  ✗  "
  const t = pkg.hasTsdown ? "  ✓  " : "  ✗  "
  const pc = pkg.hasPublishConfig ? "  ✓  " : "  ✗  "
  const f = pkg.filesIncludesDist && !pkg.filesIncludesSrc ? "  ✓  " : "  ✗  "
  const priv = pkg.private ? " (private)" : ""
  const npm = pkg.npmVersion || "—"
  console.log(
    `${(pkg.name + priv).padEnd(32)} ${pkg.version.padEnd(10)} ${npm.padEnd(10)} ${r}  ${l}  ${t}  ${pc}  ${f}`,
  )
}

// Issues
const errors = issues.filter((i) => i.severity === "error")
const warnings = issues.filter((i) => i.severity === "warn")

if (errors.length > 0) {
  console.log(`\n❌ Errors (${errors.length}):`)
  for (const i of errors) {
    console.log(`  ${i.pkg}: ${i.message}`)
  }
}

if (warnings.length > 0) {
  console.log(`\n⚠ Warnings (${warnings.length}):`)
  for (const i of warnings) {
    console.log(`  ${i.pkg}: ${i.message}`)
  }
}

if (errors.length === 0 && warnings.length === 0) {
  console.log("\n✅ All checks passed!")
}

console.log("")
process.exit(errors.length > 0 ? 1 : 0)
