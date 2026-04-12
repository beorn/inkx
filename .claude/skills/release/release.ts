#!/usr/bin/env bun
/**
 * Release CLI — assess, plan, and execute releases for all vendor packages.
 *
 * Usage:
 *   bun release status          # Release status table
 *   bun release plan            # What would happen (status + plan)
 *   bun release execute         # Full flow: fix tags, bump, build, publish
 *   bun release fix-tags        # Create missing tags only
 *   bun release execute silvery # Release silvery packages only
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { execSync } from "node:child_process"

const ROOT = join(import.meta.dir, "..", "..", "..")
const { Command } = await import(join(ROOT, "vendor/silvery/packages/commander/src/index.ts"))
const { style } = await import(join(ROOT, "vendor/silvery/packages/ansi/src/index.ts")) as { style: any }

// ─── Types ──────────────────────────────────────────────────────────────────

interface Repo {
  name: string
  dir: string
  absDir: string
  branch: string
  lastTag: string
  ci: string
}

interface PkgStatus {
  name: string
  version: string
  dir: string        // relative to repo
  repoName: string
  repoDir: string    // absolute
  npmVersion: string
  hasTag: boolean
  tagName: string
  delta: number       // commits since tag
  deltaCommits: string[]  // commit messages
  private: boolean
}

interface Plan {
  tagsToCreate: { repo: string; repoDir: string; tag: string; commit: string; pkg: string }[]
  releases: { repoName: string; repoDir: string; packages: PkgStatus[]; bumpType: string; summary: string }[]
  upToDate: string[]
}

// ─── Repo Discovery ─────────────────────────────────────────────────────────

// Tag schemes:
//   "shared": one tag per coordinated release covers all packages (e.g., v0.17.3)
//   "per-package": each package has its own tag (e.g., tribe-v0.8.1, vitepress-enrich-v0.4.1)
type TagScheme = "shared" | "per-package"

interface RepoConfig {
  dir: string
  monorepo: boolean
  tagScheme: TagScheme
}

const REPO_CONFIGS: RepoConfig[] = [
  { dir: "vendor/silvery", monorepo: true, tagScheme: "shared" },
  { dir: "vendor/loggily", monorepo: false, tagScheme: "shared" },
  { dir: "vendor/flexily", monorepo: false, tagScheme: "shared" },
  { dir: "vendor/bearly", monorepo: true, tagScheme: "per-package" },
  { dir: "vendor/termless", monorepo: true, tagScheme: "shared" },
  { dir: "vendor/vterm", monorepo: true, tagScheme: "shared" },
  { dir: "vendor/vimonkey", monorepo: false, tagScheme: "shared" },
  { dir: "vendor/watcher-chaos", monorepo: false, tagScheme: "shared" },
]

/**
 * Compute the git tag name for a package given its repo's tag scheme.
 * - "shared": v<version> (e.g., v0.17.3)
 * - "per-package": <shortName>-v<version> (e.g., tribe-v0.8.1)
 *   shortName strips scope: @bearly/tribe → tribe, @bearly/vitepress-enrich → vitepress-enrich
 */
function tagNameFor(pkgName: string, version: string, scheme: TagScheme): string {
  if (scheme === "shared") return `v${version}`
  const shortName = pkgName.includes("/") ? pkgName.split("/").pop()! : pkgName
  return `${shortName}-v${version}`
}

function git(cmd: string, cwd: string): string {
  try {
    return execSync(`git ${cmd} 2>/dev/null`, { cwd, encoding: "utf8", timeout: 10000 }).trim()
  } catch {
    return ""
  }
}

function npmView(name: string): string {
  try {
    return execSync(`npm view ${name} version 2>/dev/null`, { encoding: "utf8", timeout: 15000 }).trim()
  } catch {
    return ""
  }
}

// ─── Data Gathering ─────────────────────────────────────────────────────────

function discoverRepos(): Repo[] {
  const repos: Repo[] = []
  for (const cfg of REPO_CONFIGS) {
    const absDir = join(ROOT, cfg.dir)
    if (!existsSync(join(absDir, ".git")) && !existsSync(join(absDir, "package.json"))) continue
    repos.push({
      name: cfg.dir.split("/").pop()!,
      dir: cfg.dir,
      absDir,
      branch: git("branch --show-current", absDir),
      lastTag: git("describe --tags --abbrev=0", absDir),
      ci: git('log -1 --format="%ar"', absDir).replace(/"/g, ""),
    })
  }
  return repos
}

function discoverPackages(repos: Repo[]): PkgStatus[] {
  const packages: PkgStatus[] = []

  for (const repo of repos) {
    const cfg = REPO_CONFIGS.find(c => c.dir === repo.dir)!
    const pkgJsonPaths: string[] = []

    // Root package
    pkgJsonPaths.push(join(repo.absDir, "package.json"))

    // Sub-packages in monorepos
    if (cfg.monorepo) {
      for (const subdir of ["packages", "plugins", "examples"]) {
        const dir = join(repo.absDir, subdir)
        if (!existsSync(dir)) continue
        if (subdir === "examples" && existsSync(join(dir, "package.json"))) {
          pkgJsonPaths.push(join(dir, "package.json"))
        } else {
          try {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
              if (entry.isDirectory()) {
                const p = join(dir, entry.name, "package.json")
                if (existsSync(p)) pkgJsonPaths.push(p)
              }
            }
          } catch {}
        }
      }
    }

    for (const pkgPath of pkgJsonPaths) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
        if (pkg.private) continue

        const pkgDir = dirname(pkgPath)
        const relDir = relative(repo.absDir, pkgDir) || "."
        const tagName = tagNameFor(pkg.name, pkg.version, cfg.tagScheme)
        const hasTag = git(`rev-parse ${tagName}`, repo.absDir) !== ""

        // Delta: commits since this package's *own* tag (per-package) or repo's last tag (shared)
        // For per-package schemes, use this package's most recent tag, not the repo's latest tag.
        let baseTag = repo.lastTag
        if (cfg.tagScheme === "per-package") {
          const shortName = pkg.name.includes("/") ? pkg.name.split("/").pop()! : pkg.name
          // Find the most recent <shortName>-v* tag
          const ownTag = git(`describe --tags --abbrev=0 --match "${shortName}-v*"`, repo.absDir)
          if (ownTag) baseTag = ownTag
        }

        let delta = 0
        let deltaCommits: string[] = []
        if (baseTag) {
          const logCmd = relDir === "."
            ? `log ${baseTag}..HEAD --oneline -- . ":!packages" ":!plugins" ":!examples" ":!node_modules" ":!dist"`
            : `log ${baseTag}..HEAD --oneline -- "${relDir}"`
          const log = git(logCmd, repo.absDir)
          if (log) {
            deltaCommits = log.split("\n").filter(Boolean)
            delta = deltaCommits.length
          }
        }

        packages.push({
          name: pkg.name,
          version: pkg.version,
          dir: relDir,
          repoName: repo.name,
          repoDir: repo.absDir,
          npmVersion: npmView(pkg.name),
          hasTag,
          tagName,
          delta,
          deltaCommits,
          private: false,
        })
      } catch {}
    }
  }

  return packages
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function matchesFilter(pkg: PkgStatus, filter?: string): boolean {
  if (!filter) return true
  const f = filter.toLowerCase()
  // "silvery" filter matches the silvery repo (not packages with silvery in the name)
  if (f === "silvery") return pkg.repoName === "silvery"
  return pkg.name.toLowerCase().includes(f) || pkg.repoName.toLowerCase().includes(f)
}

function buildPlan(packages: PkgStatus[], _repos: Repo[], filter?: string): Plan {
  const tagsToCreate: Plan["tagsToCreate"] = []
  const releasesByRepo = new Map<string, PkgStatus[]>()
  const upToDate: string[] = []

  for (const pkg of packages) {
    // Apply filter early — affects BOTH tags and releases (filter must scope housekeeping too)
    if (!matchesFilter(pkg, filter)) continue

    // Missing tag: version matches npm but no git tag
    if (!pkg.hasTag && pkg.npmVersion && pkg.version === pkg.npmVersion) {
      // Find commit that set this version. Search by short name for per-package schemes
      // to disambiguate when multiple packages share a version number.
      const shortName = pkg.name.includes("/") ? pkg.name.split("/").pop()! : pkg.name
      const grepPatterns = [`${shortName}.*v${pkg.version}`, `v${pkg.version}`]
      let commit = ""
      for (const pattern of grepPatterns) {
        const grepCmd = `log --all --oneline -n1 --grep="${pattern}" -- "${pkg.dir === "." ? "package.json" : pkg.dir + "/package.json"}"`
        commit = git(grepCmd, pkg.repoDir).split(" ")[0] ?? ""
        if (commit) break
      }
      if (!commit) {
        // Fallback: last commit touching this package's package.json
        const fallbackCmd = pkg.dir === "."
          ? "log --all --oneline -1 -- package.json"
          : `log --all --oneline -1 -- "${pkg.dir}/package.json"`
        commit = git(fallbackCmd, pkg.repoDir).split(" ")[0] ?? ""
      }
      if (commit) {
        tagsToCreate.push({
          repo: pkg.repoName,
          repoDir: pkg.repoDir,
          tag: pkg.tagName,
          commit,
          pkg: pkg.name,
        })
      }
    }

    // Releasable states (Pro feedback: not just delta > 0):
    // - delta > 0: has new commits since tag
    // - local > npm: bumped but not published yet
    // - unpublished: never on npm
    const localGtNpm = pkg.npmVersion && pkg.version !== pkg.npmVersion && !pkg.hasTag
    const unpublished = !pkg.npmVersion
    const needsRelease = pkg.delta > 0 || localGtNpm || unpublished

    if (needsRelease) {
      const key = pkg.repoName
      if (!releasesByRepo.has(key)) releasesByRepo.set(key, [])
      releasesByRepo.get(key)!.push(pkg)
    } else if (pkg.delta === 0 && pkg.hasTag) {
      upToDate.push(pkg.name)
    }
  }

  const releases: Plan["releases"] = []
  for (const [repoName, pkgs] of releasesByRepo) {
    // Dedup commits across packages (one commit touching N pkgs = one entry)
    const seen = new Set<string>()
    const dedupedCommits: string[] = []
    for (const c of pkgs.flatMap(p => p.deltaCommits)) {
      const hash = c.split(" ")[0] ?? ""
      if (hash && !seen.has(hash)) {
        seen.add(hash)
        dedupedCommits.push(c)
      }
    }

    // Infer bump type from conventional commit subjects (Pro: handle ! suffix)
    const hasBreaking = dedupedCommits.some(c => c.includes("BREAKING") || /\b(feat|fix|refactor|perf)!:/.test(c))
    const hasFeat = dedupedCommits.some(c => /\bfeat[:(]/.test(c))
    const bumpType = hasBreaking ? "major" : hasFeat ? "minor" : "patch"

    const commitSummary = dedupedCommits
      .map(c => c.replace(/^[a-f0-9]+ /, ""))
      .filter(c => !c.startsWith("chore") && !c.startsWith("ci:") && !c.startsWith("test:"))
      .slice(0, 5)
      .join(", ") || "housekeeping only"

    releases.push({
      repoName,
      repoDir: pkgs[0]!.repoDir,
      packages: pkgs,
      bumpType,
      summary: commitSummary,
    })
  }

  return { tagsToCreate, releases, upToDate }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function printStatus(packages: PkgStatus[], repos: Repo[], verbose = false): void {
  console.log(`\n${style.bold("Release Status")}\n`)

  const byRepo = new Map<string, PkgStatus[]>()
  for (const pkg of packages) {
    if (!byRepo.has(pkg.repoName)) byRepo.set(pkg.repoName, [])
    byRepo.get(pkg.repoName)!.push(pkg)
  }

  for (const repo of repos) {
    const pkgs = byRepo.get(repo.name)
    if (!pkgs || pkgs.length === 0) continue

    const ciStatus = getCIStatus(repo.absDir)
    const parts = [`CI=${ciStatus}`]
    if (repo.lastTag) parts.push(`last tag=${repo.lastTag}`)
    console.log(style.bold(`[${repo.name}]`) + ` ${style.dim(parts.join("  "))}`)

    for (const pkg of pkgs) {
      const flags: string[] = []

      if (!pkg.npmVersion) {
        flags.push(style.yellow("UNPUBLISHED"))
      } else if (pkg.version !== pkg.npmVersion) {
        flags.push(style.yellow(`DRIFT(npm=${pkg.npmVersion})`))
      }
      if (!pkg.hasTag && pkg.npmVersion) {
        flags.push(style.red("NOTAG"))
      }
      if (pkg.delta > 0) {
        flags.push(style.cyan(`${pkg.delta} new`))
      }

      const status = flags.length > 0 ? flags.join("  ") : style.dim("up to date")
      console.log(`  ${pkg.name.padEnd(30)}  v${pkg.version.padEnd(8)}  npm=${(pkg.npmVersion || "—").padEnd(8)}  ${status}`)

      // Verbose: show commit messages for packages with changes
      if (verbose && pkg.delta > 0 && pkg.deltaCommits.length > 0) {
        const msgs = pkg.deltaCommits
          .map(c => c.replace(/^[a-f0-9]+ /, ""))
          .slice(0, 8)
        for (const msg of msgs) {
          console.log(`    ${style.dim("- " + msg)}`)
        }
        if (pkg.deltaCommits.length > 8) {
          console.log(`    ${style.dim(`... and ${pkg.deltaCommits.length - 8} more`)}`)
        }
      }
    }
    console.log()
  }
}

function getCIStatus(repoDir: string): string {
  try {
    const result = execSync(
      `gh run list --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null`,
      { cwd: repoDir, encoding: "utf8", timeout: 10000 },
    ).trim()
    return result === "success" ? style.green("success") : result === "failure" ? style.red("failure") : result || "—"
  } catch {
    return "—"
  }
}

function printPlan(plan: Plan): void {
  if (plan.tagsToCreate.length === 0 && plan.releases.length === 0) {
    console.log(style.green("Everything is up to date.") + " Nothing to release.\n")
    return
  }

  console.log(style.bold("Plan") + "\n")

  if (plan.tagsToCreate.length > 0) {
    console.log(`  ${style.bold("Housekeeping")} (${plan.tagsToCreate.length} missing tags):`)
    for (const t of plan.tagsToCreate) {
      console.log(`    ${t.pkg}: create ${style.cyan(t.tag)} at ${style.dim(t.commit)}`)
    }
    console.log()
  }

  if (plan.releases.length > 0) {
    console.log(`  ${style.bold("Releases")}:`)
    for (const r of plan.releases) {
      const totalDelta = r.packages.reduce((sum, p) => sum + p.delta, 0)
      const currentVersion = r.packages[0]!.version
      console.log(`    ${style.bold(r.repoName)} ${currentVersion} → ${style.green(`${r.bumpType} bump`)} (${totalDelta} commits)`)
      console.log(`      ${style.dim(r.summary)}`)

      if (r.packages.length > 1) {
        console.log(`      packages: ${r.packages.map(p => p.name).join(", ")}`)
      }
    }
    console.log()
  }

  if (plan.upToDate.length > 0) {
    console.log(`  ${style.dim("Up to date:")} ${style.dim(plan.upToDate.join(", "))}\n`)
  }
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function statusCmd(opts: { verbose?: boolean }): Promise<void> {
  const repos = discoverRepos()
  const packages = discoverPackages(repos)
  printStatus(packages, repos, opts.verbose)
}

async function planCmd(opts: { filter?: string; verbose?: boolean }): Promise<void> {
  const repos = discoverRepos()
  const packages = discoverPackages(repos)
  printStatus(packages, repos, opts.verbose)

  const plan = buildPlan(packages, repos, opts.filter)
  printPlan(plan)
}

async function fixTagsCmd(): Promise<void> {
  const repos = discoverRepos()
  const packages = discoverPackages(repos)
  const plan = buildPlan(packages, repos)

  if (plan.tagsToCreate.length === 0) {
    console.log(style.green("\nAll tags present.") + " Nothing to fix.\n")
    return
  }

  applyTagFixes(plan.tagsToCreate)
}

/**
 * Apply tag fixes idempotently. Skips tags that already exist (shared version tags
 * are common in coordinated repos). Pushes only the tags we created, not all tags.
 */
function applyTagFixes(tagsToCreate: Plan["tagsToCreate"]): void {
  if (tagsToCreate.length === 0) return
  console.log(`\nCreating ${tagsToCreate.length} missing tags:\n`)

  // Track tags we created per repo (NOT the existing ones, NOT all repo tags)
  const createdByRepo = new Map<string, string[]>()

  for (const t of tagsToCreate) {
    // Skip if tag already exists (coordinated repos share tag names across packages)
    if (git(`rev-parse ${t.tag}`, t.repoDir)) {
      console.log(`  ${t.pkg}: ${style.dim(t.tag + " already exists, skipping")}`)
      continue
    }
    console.log(`  ${t.pkg}: ${style.cyan(t.tag)} at ${style.dim(t.commit)}`)
    try {
      execSync(`git tag "${t.tag}" "${t.commit}"`, { cwd: t.repoDir })
      if (!createdByRepo.has(t.repoDir)) createdByRepo.set(t.repoDir, [])
      createdByRepo.get(t.repoDir)!.push(t.tag)
    } catch (e) {
      console.log(`  ${style.red("failed")}: ${e instanceof Error ? e.message : e}`)
    }
  }

  // Push ONLY the tags we created (avoid leaking unrelated local tags)
  for (const [repoDir, tags] of createdByRepo) {
    console.log(`\n  pushing ${tags.length} tags in ${relative(ROOT, repoDir)}...`)
    try {
      const refspecs = tags.map(t => `refs/tags/${t}`).join(" ")
      execSync(`git push origin ${refspecs}`, { cwd: repoDir, encoding: "utf8", timeout: 30000 })
      console.log(`  ${style.green("done")}`)
    } catch (e) {
      console.error(`  ${style.red("failed")}: ${e}`)
    }
  }
  console.log()
}

async function executeCmd(opts: { filter?: string }): Promise<void> {
  const repos = discoverRepos()
  let packages = discoverPackages(repos)
  printStatus(packages, repos)

  let plan = buildPlan(packages, repos, opts.filter)
  printPlan(plan)

  if (plan.tagsToCreate.length === 0 && plan.releases.length === 0) {
    return
  }

  // Phase 1: Fix tags (housekeeping). Uses idempotent helper that skips
  // existing tags and only pushes the tags we created.
  if (plan.tagsToCreate.length > 0) {
    applyTagFixes(plan.tagsToCreate)

    // Re-gather state after tag changes — deltas computed against new tags
    // may differ significantly. Without this, the release plan is stale.
    console.log(style.dim("Recomputing state after tag fixes..."))
    packages = discoverPackages(repos)
    plan = buildPlan(packages, repos, opts.filter)
    printPlan(plan)

    if (plan.releases.length === 0) {
      console.log(style.green("Nothing left to release after tag housekeeping."))
      return
    }
  }

  // Releases
  if (plan.releases.length > 0) {
    console.log(style.bold("Releases require manual confirmation."))
    console.log("Run this tool from /release skill to proceed with publishing.\n")
    console.log("The /release skill will:")
    console.log("  1. Confirm the plan with you")
    console.log("  2. Build (npx tsdown)")
    console.log("  3. Version bump")
    console.log("  4. Publish (pnpm publish)")
    console.log("  5. Tag + push")
    console.log("  6. Smoke test")
    console.log()
  }
}

// ─── Verify (npm pack + install + run) ─────────────────────────────────────

interface VerifyResult {
  pkg: string
  version: string
  ok: boolean
  errors: string[]
  warnings: string[]
}

async function verifyPackage(pkgDir: string): Promise<VerifyResult> {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join: pjoin } = await import("node:path")

  const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))
  const result: VerifyResult = {
    pkg: pkgJson.name,
    version: pkgJson.version,
    ok: true,
    errors: [],
    warnings: [],
  }

  console.log(`\n${style.bold(`verifying ${pkgJson.name}@${pkgJson.version}`)}`)

  let tempDir: string | null = null
  try {
    // 1. pnpm pack — create a real tarball with publishConfig applied
    // (npm pack does NOT apply publishConfig — only npm publish does. pnpm pack does.)
    console.log(`  ${style.dim("→")} pnpm pack`)
    const packOutput = execSync("pnpm pack 2>&1", { cwd: pkgDir, encoding: "utf8", timeout: 60000 })
    // pnpm pack prints the tarball filename on the last line
    const lines = packOutput.trim().split("\n")
    const tarballName = lines[lines.length - 1]?.trim()
    if (!tarballName || !tarballName.endsWith(".tgz")) {
      result.ok = false
      result.errors.push(`pnpm pack did not produce a tarball: ${packOutput}`)
      return result
    }
    const tarballPath = join(pkgDir, tarballName)
    if (!existsSync(tarballPath)) {
      result.ok = false
      result.errors.push(`tarball not found: ${tarballPath}`)
      return result
    }

    // 2. Create temp dir, init, install tarball with fresh npm cache
    // Fresh cache is critical: stale ~/.npm cache may serve old tarballs
    tempDir = mkdtempSync(pjoin(tmpdir(), "release-verify-"))
    const cacheDir = pjoin(tempDir, ".npm-cache")
    console.log(`  ${style.dim("→")} install in ${tempDir}`)
    writeFileSync(pjoin(tempDir, "package.json"), JSON.stringify({ name: "verify", version: "0.0.0", private: true }, null, 2))
    execSync(`npm install "${tarballPath}" --no-save --silent`, {
      cwd: tempDir,
      encoding: "utf8",
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NPM_CONFIG_CACHE: cacheDir },
    })

    // Cleanup tarball
    rmSync(tarballPath, { force: true })

    // 3. Verify installed package
    const installedDir = pjoin(tempDir, "node_modules", pkgJson.name)
    if (!existsSync(installedDir)) {
      result.ok = false
      result.errors.push(`installed package not found at ${installedDir}`)
      return result
    }

    const installedPkg = JSON.parse(readFileSync(pjoin(installedDir, "package.json"), "utf8"))

    // 4. Test imports — try if package declares any importable entry point.
    // Supports: object exports (`exports["."]`), string exports, main field.
    // Skip for CLI-only packages (bin only, no library entry).
    const exports = installedPkg.exports
    const main = installedPkg.main
    const hasObjectExportsRoot = exports && typeof exports === "object" && !Array.isArray(exports) && exports["."]
    const hasStringExports = typeof exports === "string"
    const hasMain = !!main
    const importable = hasObjectExportsRoot || hasStringExports || hasMain

    if (importable) {
      try {
        execSync(
          `node -e "import('${pkgJson.name}').then(m => { const k = Object.keys(m); console.log('OK:', k.length, 'exports') }).catch(e => { console.error(e.message); process.exit(1) })"`,
          { cwd: tempDir, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
        )
        console.log(`  ${style.green("✓")} import works`)
      } catch (e) {
        const stderr = (e as { stderr?: string }).stderr || String(e)
        result.ok = false
        result.errors.push(`import failed: ${stderr.split("\n").slice(0, 3).join(" ")}`)
        console.log(`  ${style.red("✗")} import failed`)
      }

      // Also test subpath exports if they exist
      if (exports && typeof exports === "object" && !Array.isArray(exports)) {
        const subpaths = Object.keys(exports).filter(k => k !== "." && !k.includes("*"))
        for (const subpath of subpaths.slice(0, 5)) {
          try {
            execSync(
              `node -e "import('${pkgJson.name}${subpath.slice(1)}').then(m => console.log('OK')).catch(e => { console.error(e.message); process.exit(1) })"`,
              { cwd: tempDir, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
            )
            console.log(`  ${style.green("✓")} subpath ${subpath}`)
          } catch (e) {
            const stderr = (e as { stderr?: string }).stderr || String(e)
            result.ok = false
            result.errors.push(`subpath ${subpath}: ${stderr.split("\n").slice(0, 2).join(" ")}`)
            console.log(`  ${style.red("✗")} subpath ${subpath}`)
          }
        }
      }
    }

    // 5. Test bin (CLI) — run --help, expect exit code 0
    // For string bin, npm uses the unscoped package name (@termless/cli → cli)
    const bin = installedPkg.bin
    if (bin) {
      const unscopedName = pkgJson.name.includes("/") ? pkgJson.name.split("/").pop()! : pkgJson.name
      const binEntries: Array<[string, string]> = typeof bin === "string"
        ? [[unscopedName, bin]]
        : Object.entries(bin) as Array<[string, string]>

      for (const [binName] of binEntries) {
        const binPath = pjoin(tempDir, "node_modules", ".bin", binName)
        if (!existsSync(binPath)) {
          // Missing .bin symlink for a published CLI is a real failure, not a warning
          result.ok = false
          result.errors.push(`bin ${binName} not symlinked at ${binPath}`)
          console.log(`  ${style.red("✗")} ${binName} not symlinked`)
          continue
        }
        try {
          execSync(`"${binPath}" --help`, {
            cwd: tempDir,
            encoding: "utf8",
            timeout: 30000,
            stdio: ["ignore", "pipe", "pipe"],
          })
          console.log(`  ${style.green("✓")} ${binName} --help`)
        } catch (e) {
          const err = e as { stderr?: string; status?: number }
          // --help unknown? try --version
          try {
            execSync(`"${binPath}" --version`, {
              cwd: tempDir,
              encoding: "utf8",
              timeout: 30000,
              stdio: ["ignore", "pipe", "pipe"],
            })
            console.log(`  ${style.green("✓")} ${binName} --version`)
          } catch {
            result.ok = false
            const stderr = err.stderr || String(e)
            result.errors.push(`${binName}: ${stderr.split("\n").slice(0, 3).join(" ")}`)
            console.log(`  ${style.red("✗")} ${binName} crashed`)
          }
        }
      }
    }

    if (result.ok) {
      console.log(`  ${style.green("✓ verified")}`)
    } else {
      console.log(`  ${style.red("✗ verification failed")}`)
      for (const err of result.errors) console.log(`    ${style.red(err)}`)
    }
  } catch (e) {
    result.ok = false
    result.errors.push(`verify crashed: ${e instanceof Error ? e.message : e}`)
    console.log(`  ${style.red("✗ crashed")}: ${e}`)
  } finally {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    }
  }

  return result
}

async function verifyCmd(opts: { filter?: string }): Promise<void> {
  const repos = discoverRepos()
  const packages = discoverPackages(repos)

  const targets = opts.filter
    ? packages.filter(p => {
        const f = opts.filter!.toLowerCase()
        return p.name.toLowerCase().includes(f) || p.repoName.toLowerCase().includes(f)
      })
    : packages

  if (targets.length === 0) {
    console.log(style.yellow("No packages match filter."))
    return
  }

  console.log(`Verifying ${targets.length} packages from npm pack tarballs...\n`)

  const results: VerifyResult[] = []
  for (const pkg of targets) {
    const pkgDir = join(pkg.repoDir, pkg.dir)
    const result = await verifyPackage(pkgDir)
    results.push(result)
  }

  // Summary
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok)

  console.log(`\n${style.bold("Verify Summary")}`)
  console.log(`  ${style.green(`${passed}/${results.length} passed`)}`)

  if (failed.length > 0) {
    console.log(`\n${style.red("Failed:")}`)
    for (const r of failed) {
      console.log(`  ${style.red(r.pkg)}@${r.version}`)
      for (const err of r.errors) console.log(`    ${err}`)
    }
    process.exit(1)
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const program = new Command()
  .name("release")
  .description("Release status, planning, and execution for km vendor packages")
  .version("0.1.0")

program
  .command("status")
  .description("Show release status for all publishable packages")
  .option("-v, --verbose", "Show commit messages for packages with changes")
  .action((opts: { verbose?: boolean }) => statusCmd(opts))

program
  .command("plan")
  .description("Show status + plan (what would happen)")
  .argument("[filter]", "Filter by repo or package name (e.g., silvery, loggily)")
  .option("-v, --verbose", "Show commit messages for packages with changes")
  .action((filter: string | undefined, opts: { verbose?: boolean }) => planCmd({ filter, verbose: opts.verbose }))

program
  .command("fix-tags")
  .description("Create missing git tags for already-published versions")
  .action(fixTagsCmd)

program
  .command("verify")
  .description("Verify packages by npm pack + install in temp dir + run CLI/import")
  .argument("[filter]", "Filter by repo or package name")
  .action((filter: string | undefined) => verifyCmd({ filter }))

program
  .command("execute")
  .description("Fix tags and prepare releases (tags are auto-applied, releases need /release skill)")
  .argument("[filter]", "Filter by repo or package name")
  .action((filter?: string) => executeCmd({ filter }))

// Default: show status
program.action(statusCmd)

program.parse()
