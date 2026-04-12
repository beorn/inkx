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

const REPO_CONFIGS: { dir: string; monorepo: boolean }[] = [
  { dir: "vendor/silvery", monorepo: true },
  { dir: "vendor/loggily", monorepo: false },
  { dir: "vendor/flexily", monorepo: false },
  { dir: "vendor/bearly", monorepo: true },
  { dir: "vendor/termless", monorepo: true },
  { dir: "vendor/vterm", monorepo: true },
  { dir: "vendor/vimonkey", monorepo: false },
  { dir: "vendor/watcher-chaos", monorepo: false },
]

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
        const tagName = `v${pkg.version}`
        const hasTag = git(`rev-parse ${tagName}`, repo.absDir) !== ""

        // Delta: commits since last tag touching this package
        let delta = 0
        let deltaCommits: string[] = []
        if (repo.lastTag) {
          const logCmd = relDir === "."
            ? `log ${repo.lastTag}..HEAD --oneline -- . ":!packages" ":!examples" ":!node_modules" ":!dist"`
            : `log ${repo.lastTag}..HEAD --oneline -- "${relDir}"`
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

function buildPlan(packages: PkgStatus[], repos: Repo[], filter?: string): Plan {
  const tagsToCreate: Plan["tagsToCreate"] = []
  const releasesByRepo = new Map<string, PkgStatus[]>()
  const upToDate: string[] = []

  for (const pkg of packages) {
    // Missing tag: version matches npm but no git tag
    if (!pkg.hasTag && pkg.npmVersion && pkg.version === pkg.npmVersion) {
      // Find commit that set this version
      const grepCmd = `log --all --oneline -n1 --grep="v${pkg.version}" -- "${pkg.dir === "." ? "package.json" : pkg.dir + "/package.json"}"`
      let commit = git(grepCmd, pkg.repoDir).split(" ")[0]
      if (!commit) {
        const fallbackCmd = pkg.dir === "."
          ? "log --all --oneline -1 -- package.json"
          : `log --all --oneline -1 -- "${pkg.dir}/package.json"`
        commit = git(fallbackCmd, pkg.repoDir).split(" ")[0]
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

    // Releasable: has commits since tag
    if (pkg.delta > 0) {
      // Apply filter
      if (filter) {
        const f = filter.toLowerCase()
        if (f === "silvery" && pkg.repoName !== "silvery") continue
        if (f !== "silvery" && !pkg.name.includes(f) && !pkg.repoName.includes(f)) continue
      }
      const key = pkg.repoName
      if (!releasesByRepo.has(key)) releasesByRepo.set(key, [])
      releasesByRepo.get(key)!.push(pkg)
    } else if (pkg.delta === 0 && pkg.hasTag) {
      upToDate.push(pkg.name)
    }
  }

  const releases: Plan["releases"] = []
  for (const [repoName, pkgs] of releasesByRepo) {
    // Infer bump type from commits
    const allCommits = pkgs.flatMap(p => p.deltaCommits)
    const hasBreaking = allCommits.some(c => c.includes("BREAKING"))
    const hasFeat = allCommits.some(c => /\bfeat[:(]/.test(c))
    const bumpType = hasBreaking ? "major" : hasFeat ? "minor" : "patch"

    const commitSummary = allCommits
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

  console.log(`\nCreating ${plan.tagsToCreate.length} missing tags:\n`)
  const reposToPush = new Set<string>()

  for (const t of plan.tagsToCreate) {
    // Skip if tag already exists (multiple packages can share a version tag)
    if (git(`rev-parse ${t.tag}`, t.repoDir)) {
      console.log(`  ${t.pkg}: ${style.dim(t.tag + " already exists, skipping")}`)
      continue
    }
    console.log(`  ${t.pkg}: ${style.cyan(t.tag)} at ${style.dim(t.commit)}`)
    try {
      execSync(`git tag "${t.tag}" "${t.commit}"`, { cwd: t.repoDir })
      reposToPush.add(t.repoDir)
    } catch (e) {
      console.log(`  ${style.red("failed")}: ${e instanceof Error ? e.message : e}`)
    }
  }

  for (const repoDir of reposToPush) {
    console.log(`\n  pushing tags in ${relative(ROOT, repoDir)}...`)
    try {
      execSync("git push --tags", { cwd: repoDir, encoding: "utf8", timeout: 30000 })
      console.log(`  ${style.green("done")}`)
    } catch (e) {
      console.error(`  ${style.red("failed")}: ${e}`)
    }
  }
  console.log()
}

async function executeCmd(opts: { filter?: string }): Promise<void> {
  const repos = discoverRepos()
  const packages = discoverPackages(repos)
  printStatus(packages, repos)

  const plan = buildPlan(packages, repos, opts.filter)
  printPlan(plan)

  if (plan.tagsToCreate.length === 0 && plan.releases.length === 0) {
    return
  }

  // Fix tags first
  if (plan.tagsToCreate.length > 0) {
    console.log(style.bold("Fixing tags..."))
    const reposToPush = new Set<string>()
    for (const t of plan.tagsToCreate) {
      execSync(`git tag "${t.tag}" "${t.commit}"`, { cwd: t.repoDir })
      reposToPush.add(t.repoDir)
      console.log(`  ${style.green("+")} ${t.tag} at ${t.commit}`)
    }
    for (const repoDir of reposToPush) {
      execSync("git push --tags", { cwd: repoDir, encoding: "utf8", timeout: 30000 })
    }
    console.log()
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
  .command("execute")
  .description("Fix tags and prepare releases (tags are auto-applied, releases need /release skill)")
  .argument("[filter]", "Filter by repo or package name")
  .action((filter?: string) => executeCmd({ filter }))

// Default: show status
program.action(statusCmd)

program.parse()
