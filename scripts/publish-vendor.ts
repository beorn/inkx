#!/usr/bin/env bun
/**
 * Publish a vendor package and bump all downstream consumers.
 *
 * Handles the full release cycle for any vendor/* package that has
 * npm consumers within the monorepo:
 *
 *   1. Pre-flight checks (clean worktree, npm auth, builds pass)
 *   2. Run package-specific build (if `build` script exists)
 *   3. Bump version in package.json
 *   4. npm publish
 *   5. Find and bump all consumers in vendor/
 *   6. Commit + push the package repo
 *   7. Commit + push each consumer repo
 *   8. Trigger doc deploys for consumers with docs.yml workflows
 *
 * Usage:
 *   bun scripts/publish-vendor.ts vendor/bearly/packages/vitepress-enrich patch
 *   bun scripts/publish-vendor.ts vendor/loggily minor
 *   bun scripts/publish-vendor.ts vendor/vterm/packages/vt220 patch
 *   bun scripts/publish-vendor.ts vendor/flexily --dry
 *
 * Works with any package layout:
 *   - Simple vendor packages:  vendor/loggily/package.json
 *   - Monorepo sub-packages:   vendor/bearly/packages/vitepress-enrich/package.json
 *   - Multi-package repos:     vendor/vterm/packages/vt220/package.json
 */
import { $ } from "bun"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync } from "node:fs"
import { join, resolve, relative, dirname, basename } from "node:path"

// ── Config ──

const KM_ROOT = resolve(import.meta.dirname!, "..")
const VENDOR_DIR = join(KM_ROOT, "vendor")

// ── Helpers ──

function readPkg(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, any>
}

function writePkg(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n")
}

function bumpVersion(version: string, type: "patch" | "minor" | "major"): string {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number)
  switch (type) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

/** Caret range respecting 0.x semver (^0.3.0 = 0.3.x only) */
function caretRange(version: string): string {
  const [major, minor] = version.split(".").map(Number)
  if (major === 0) return `^${major}.${minor}.0`
  return `^${major}.0.0`
}

/** Find the git repo root for a path (may be a submodule) */
function gitRoot(path: string): string {
  const dir = statSync(path).isDirectory() ? path : dirname(path)
  let current = dir
  while (current !== "/") {
    if (existsSync(join(current, ".git"))) return current
    current = dirname(current)
  }
  return dir
}

/** Find all package.json files under vendor/ that depend on a given package */
function findConsumers(pkgName: string): Array<{ dir: string; pkgPath: string; field: string; current: string }> {
  const consumers: Array<{ dir: string; pkgPath: string; field: string; current: string }> = []

  function scanDir(dir: string) {
    const pkgPath = join(dir, "package.json")
    if (existsSync(pkgPath)) {
      try {
        const pkg = readPkg(pkgPath)
        for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
          if (pkg[field]?.[pkgName]) {
            consumers.push({ dir, pkgPath, field, current: pkg[field][pkgName] })
          }
        }
      } catch {}
    }

    // Recurse into subdirs (skip noise)
    try {
      for (const entry of readdirSync(dir)) {
        if (["node_modules", ".git", ".claude", ".direnv", "dist", ".vitepress"].includes(entry)) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) scanDir(full)
      }
    } catch {}
  }

  // Scan all vendor dirs
  for (const vendor of readdirSync(VENDOR_DIR)) {
    const vendorDir = join(VENDOR_DIR, vendor)
    if (statSync(vendorDir).isDirectory()) scanDir(vendorDir)
  }

  // Also check km root
  const kmPkg = join(KM_ROOT, "package.json")
  if (existsSync(kmPkg)) {
    try {
      const pkg = readPkg(kmPkg)
      for (const field of ["dependencies", "devDependencies", "overrides"]) {
        if (pkg[field]?.[pkgName]) {
          consumers.push({ dir: KM_ROOT, pkgPath: kmPkg, field, current: pkg[field][pkgName] })
        }
      }
    } catch {}
  }

  return consumers
}

/** Check if a repo has a GitHub workflow file */
function hasWorkflow(repoDir: string, name: string): boolean {
  return existsSync(join(repoDir, ".github", "workflows", name))
}

/** Get GitHub repo slug from git remote */
async function getRepoSlug(dir: string): Promise<string | null> {
  try {
    const remote = await $`git remote get-url origin`.cwd(dir).text()
    const match = remote.trim().match(/github\.com[:/](.+?)(?:\.git)?$/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

// ── Main ──

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const filteredArgs = args.filter((a) => a !== "--dry")
const pkgPath = filteredArgs[0]
const bumpType = (filteredArgs[1] as "patch" | "minor" | "major") ?? "patch"

if (!pkgPath) {
  console.log(`
Usage: bun scripts/publish-vendor.ts <package-path> [patch|minor|major] [--dry]

Examples:
  bun scripts/publish-vendor.ts vendor/bearly/packages/vitepress-enrich patch
  bun scripts/publish-vendor.ts vendor/loggily minor
  bun scripts/publish-vendor.ts vendor/vterm/packages/vt220 patch --dry
`)
  process.exit(1)
}

const pkgDir = resolve(KM_ROOT, pkgPath)
const pkgJsonPath = join(pkgDir, "package.json")

if (!existsSync(pkgJsonPath)) {
  console.error(`❌ No package.json at ${pkgPath}`)
  process.exit(1)
}

const pkg = readPkg(pkgJsonPath)
const pkgName = pkg.name
const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, bumpType)
const newRange = caretRange(newVersion)
const repoDir = gitRoot(pkgDir)
const relPath = relative(KM_ROOT, pkgDir)

console.log(`
📦 ${pkgName} ${oldVersion} → ${newVersion} (${bumpType})
   Path: ${relPath}
   Repo: ${relative(KM_ROOT, repoDir)}
   Consumer range: ${newRange}${dry ? "\n   (dry run)" : ""}
`)

// Step 1: Pre-flight
console.log("1. Pre-flight checks")
const status = await $`git status --porcelain`.cwd(repoDir).text()
if (status.trim() && !dry) {
  console.log("   ⚠ Uncommitted changes in repo — committing first")
  await $`git add -A`.cwd(repoDir).quiet()
  await $`git commit -m ${"chore: pre-release cleanup for " + pkgName}`.cwd(repoDir).quiet()
  console.log("   ✓ Committed")
} else {
  console.log("   ✓ Working tree clean")
}

// Step 2: Build (if build script exists)
if (pkg.scripts?.build) {
  console.log("\n2. Build")
  if (!dry) {
    // Snapshot terminfo glossary if this is vitepress-enrich
    const glossarySource = join(KM_ROOT, "vendor/terminfo.dev/content/glossary.json")
    const glossaryDest = join(pkgDir, "src/terminal-glossary-data.json")
    if (existsSync(glossarySource) && existsSync(glossaryDest)) {
      copyFileSync(glossarySource, glossaryDest)
      console.log("   ✓ Glossary snapshot updated")
    }
    await $`bun run build`.cwd(pkgDir).quiet()
    console.log("   ✓ Built")
  } else {
    console.log("   → Would run bun run build")
  }
} else {
  console.log("\n2. No build script (raw TypeScript)")
}

// Step 3: Bump version
console.log(`\n3. Version ${oldVersion} → ${newVersion}`)
if (!dry) {
  pkg.version = newVersion
  writePkg(pkgJsonPath, pkg)
  console.log("   ✓ Updated")
}

// Step 4: Publish
console.log("\n4. npm publish")
if (!dry) {
  await $`npm publish --access public`.cwd(pkgDir).quiet()
  console.log(`   ✓ ${pkgName}@${newVersion}`)
} else {
  console.log(`   → Would publish ${pkgName}@${newVersion}`)
}

// Step 5: Find and bump consumers
const consumers = findConsumers(pkgName)
if (consumers.length > 0) {
  console.log(`\n5. Bump ${consumers.length} consumer(s)`)
  for (const consumer of consumers) {
    const consumerRel = relative(KM_ROOT, consumer.dir)
    if (consumer.current === newRange) {
      console.log(`   ✓ ${consumerRel}: already ${newRange}`)
      continue
    }
    // Skip non-semver refs (workspace, file, github, link)
    if (/^(\$|file:|github:|workspace:|link:)/.test(consumer.current)) {
      console.log(`   · ${consumerRel}: ${consumer.current} (non-semver — skip)`)
      continue
    }
    if (!dry) {
      const cpkg = readPkg(consumer.pkgPath)
      cpkg[consumer.field][pkgName] = newRange
      writePkg(consumer.pkgPath, cpkg)
      console.log(`   ✓ ${consumerRel}: ${consumer.current} → ${newRange}`)
    } else {
      console.log(`   → ${consumerRel}: ${consumer.current} → ${newRange}`)
    }
  }
} else {
  console.log("\n5. No consumers found")
}

// Step 6: Commit + push source repo
console.log("\n6. Commit + push source")
if (!dry) {
  await $`git add -A`.cwd(repoDir).quiet()
  const commitMsg = `chore: release ${pkgName}@${newVersion}`
  try {
    await $`git commit -m ${commitMsg}`.cwd(repoDir).quiet()
    await $`git push`.cwd(repoDir).quiet()
    console.log(`   ✓ ${relative(KM_ROOT, repoDir)}: committed + pushed`)
  } catch {
    console.log(`   · ${relative(KM_ROOT, repoDir)}: nothing to commit`)
  }
} else {
  console.log(`   → Would commit + push ${relative(KM_ROOT, repoDir)}`)
}

// Step 7: Commit + push consumer repos (dedup by git root)
const consumerRepos = new Map<string, { dir: string; slug: string | null; deploy: string | null }>()
for (const consumer of consumers) {
  if (consumer.current === newRange) continue
  if (/^(\$|file:|github:|workspace:|link:)/.test(consumer.current)) continue
  const cRepoDir = gitRoot(consumer.dir)
  if (cRepoDir === repoDir) continue // Same repo as source
  if (!consumerRepos.has(cRepoDir)) {
    const slug = await getRepoSlug(cRepoDir)
    const deploy = hasWorkflow(cRepoDir, "docs.yml") ? "docs.yml" : null
    consumerRepos.set(cRepoDir, { dir: cRepoDir, slug, deploy })
  }
}

if (consumerRepos.size > 0) {
  console.log(`\n7. Commit + push ${consumerRepos.size} consumer repo(s)`)
  for (const [, repo] of consumerRepos) {
    const repoRel = relative(KM_ROOT, repo.dir)
    if (!dry) {
      await $`git add -A`.cwd(repo.dir).quiet()
      try {
        await $`git commit -m ${"chore: bump " + pkgName + " to " + newVersion}`.cwd(repo.dir).quiet()
        await $`git push`.cwd(repo.dir).quiet()
        console.log(`   ✓ ${repoRel}: committed + pushed`)
      } catch {
        console.log(`   · ${repoRel}: nothing to commit`)
      }
    } else {
      console.log(`   → ${repoRel}: would commit + push`)
    }
  }

  // Step 8: Trigger deploys
  console.log("\n8. Trigger deploys")
  for (const [, repo] of consumerRepos) {
    if (!repo.slug) continue
    if (repo.deploy) {
      if (!dry) {
        try {
          await $`gh workflow run ${repo.deploy} --repo ${repo.slug} --ref main`.quiet()
          console.log(`   ✓ ${repo.slug}: triggered ${repo.deploy}`)
        } catch {
          console.log(`   ⚠ ${repo.slug}: trigger failed (push may auto-trigger)`)
        }
      } else {
        console.log(`   → ${repo.slug}: would trigger ${repo.deploy}`)
      }
    } else {
      console.log(`   · ${repo.slug}: auto-deploys on push`)
    }
  }
} else {
  console.log("\n7. No consumer repos to update")
}

console.log(`\n✅ Released ${pkgName}@${newVersion}\n`)
