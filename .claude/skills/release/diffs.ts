#!/usr/bin/env bun
/**
 * Gather unreleased commit diffs across all vendor repos for AI-native release proposing.
 *
 * Usage:
 *   bun .claude/skills/release/diffs.ts                    # All repos
 *   bun .claude/skills/release/diffs.ts vendor/loggily     # One repo
 *   bun .claude/skills/release/diffs.ts --json             # Structured output for programmatic use
 *
 * Output: for each repo with unreleased commits:
 *   - Repo + last tag + current HEAD
 *   - For each unreleased commit: hash, author, subject, body, full diff
 *   - Cross-repo dep graph (which packages depend on which)
 *
 * The intent: feed this to an LLM (including Claude via /release propose) who reads
 * the actual code changes and writes changeset proposals. No commit-message parsing,
 * no keyword heuristics — the AI reads what actually changed.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { execSync } from "node:child_process"

const ROOT = join(import.meta.dir, "..", "..", "..")

const REPOS = [
  "vendor/silvery",
  "vendor/loggily",
  "vendor/flexily",
  "vendor/bearly",
  "vendor/termless",
  "vendor/vterm",
  "vendor/vimonkey",
  "vendor/watcher-chaos",
]

interface Commit {
  hash: string
  short: string
  author: string
  date: string
  subject: string
  body: string
  diffStat: string  // "N files changed, X insertions, Y deletions"
  diff: string       // full unified diff
}

interface RepoDiffs {
  repo: string
  absDir: string
  lastTag: string
  head: string
  commits: Commit[]
  publicPackages: { name: string; dir: string; version: string; npmVersion: string }[]
  crossDeps: Record<string, string[]>  // package → deps it has on other packages we publish
}

function git(cmd: string, cwd: string, maxSize = 500000): string {
  try {
    return execSync(`git ${cmd} 2>/dev/null`, { cwd, encoding: "utf8", timeout: 30000, maxBuffer: maxSize }).trim()
  } catch {
    return ""
  }
}

function gatherRepoDiffs(repoDir: string, filter?: string): RepoDiffs | null {
  const absDir = join(ROOT, repoDir)
  if (!existsSync(join(absDir, ".git")) && !existsSync(join(absDir, "package.json"))) return null

  if (filter && !repoDir.includes(filter)) return null

  const lastTag = git("describe --tags --abbrev=0", absDir)
  const head = git("rev-parse HEAD", absDir)
  if (!lastTag) return null

  // Collect commit hashes
  const log = git(`log ${lastTag}..HEAD --format=%H`, absDir)
  if (!log) return null

  const hashes = log.split("\n").filter(Boolean)
  const commits: Commit[] = []

  for (const hash of hashes) {
    const meta = git(`log -1 --format='%h|%an|%ai|%s' ${hash}`, absDir)
    const [short, author, date, ...subjectParts] = meta.split("|")
    const subject = subjectParts.join("|")
    const body = git(`log -1 --format=%b ${hash}`, absDir)
    const diffStat = git(`diff --shortstat ${hash}^ ${hash}`, absDir)
    // Limit diff to 100KB to keep prompt size sane
    const diff = git(`diff ${hash}^ ${hash} -- . ':!*.lock' ':!*.tgz' ':!node_modules' ':!dist'`, absDir, 100000)

    commits.push({
      hash,
      short: short ?? hash.slice(0, 7),
      author: author ?? "",
      date: date ?? "",
      subject: subject ?? "",
      body,
      diffStat,
      diff: diff.length > 80000 ? diff.slice(0, 80000) + "\n\n... (diff truncated)" : diff,
    })
  }

  // Discover public packages
  const pkgs: RepoDiffs["publicPackages"] = []
  const crossDeps: RepoDiffs["crossDeps"] = {}

  const pkgJsonPaths = [join(absDir, "package.json")]
  for (const sub of ["packages", "plugins", "examples"]) {
    const d = join(absDir, sub)
    if (!existsSync(d)) continue
    if (sub === "examples" && existsSync(join(d, "package.json"))) {
      pkgJsonPaths.push(join(d, "package.json"))
      continue
    }
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const p = join(d, entry.name, "package.json")
          if (existsSync(p)) pkgJsonPaths.push(p)
        }
      }
    } catch {}
  }

  for (const pkgPath of pkgJsonPaths) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
      if (pkg.private) continue
      let npmVersion = ""
      try {
        npmVersion = execSync(`npm view "${pkg.name}" version 2>/dev/null`, { encoding: "utf8", timeout: 10000 }).trim()
      } catch {}
      pkgs.push({
        name: pkg.name,
        dir: relative(absDir, dirname(pkgPath)) || ".",
        version: pkg.version,
        npmVersion,
      })
      // Cross-deps: other packages we publish that this depends on
      const deps = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) }
      const cross: string[] = []
      for (const d of Object.keys(deps)) {
        if (d.startsWith("@silvery/") || d === "silvery" || d === "loggily" || d === "flexily" ||
            d.startsWith("@termless/") || d.startsWith("@bearly/") || d === "vimonkey" ||
            d === "vt100.js" || d === "vt220.js" || d === "vterm.js") {
          cross.push(d)
        }
      }
      if (cross.length > 0) crossDeps[pkg.name] = cross
    } catch {}
  }

  return { repo: repoDir, absDir, lastTag, head, commits, publicPackages: pkgs, crossDeps }
}

function formatMarkdown(repos: RepoDiffs[]): string {
  const lines: string[] = []
  lines.push("# Unreleased Changes (for AI release proposal)\n")

  for (const r of repos) {
    lines.push(`## ${r.repo}`)
    lines.push(``)
    lines.push(`- **Last tag**: ${r.lastTag}`)
    lines.push(`- **HEAD**: ${r.head.slice(0, 7)}`)
    lines.push(`- **Commits**: ${r.commits.length}`)
    lines.push(``)
    lines.push(`### Public packages`)
    for (const pkg of r.publicPackages) {
      const crossStr = r.crossDeps[pkg.name] ? ` — deps: ${r.crossDeps[pkg.name].join(", ")}` : ""
      lines.push(`- \`${pkg.name}\` v${pkg.version} (npm=${pkg.npmVersion || "—"}) at \`${pkg.dir}\`${crossStr}`)
    }
    lines.push(``)
    lines.push(`### Unreleased commits`)
    for (const c of r.commits) {
      lines.push(`#### ${c.short} ${c.subject}`)
      lines.push(`*${c.author} — ${c.date}*`)
      lines.push(``)
      if (c.body.trim()) {
        lines.push(`> ${c.body.trim().replace(/\n/g, "\n> ")}`)
        lines.push(``)
      }
      lines.push(`**${c.diffStat}**`)
      lines.push(``)
      if (c.diff) {
        lines.push("```diff")
        lines.push(c.diff)
        lines.push("```")
        lines.push(``)
      }
    }
    lines.push(`---\n`)
  }

  return lines.join("\n")
}

// ─── Main ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const jsonMode = args.includes("--json")
const filter = args.find(a => !a.startsWith("--"))

const results: RepoDiffs[] = []
for (const repoDir of REPOS) {
  const d = gatherRepoDiffs(repoDir, filter)
  if (d && d.commits.length > 0) results.push(d)
}

if (results.length === 0) {
  console.log("No unreleased commits across any repo. Nothing to propose.")
  process.exit(0)
}

if (jsonMode) {
  console.log(JSON.stringify(results, null, 2))
} else {
  console.log(formatMarkdown(results))
}
