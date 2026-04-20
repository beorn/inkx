/**
 * SOP clean — prune ephemeral repo state.
 *
 * Scope (v1): branches, worktrees, processes, caches. Coordination-aware:
 * preflight detects in-flight work via tribe + git + process scans and aborts
 * (or narrows) if someone else is active.
 *
 * NOT in scope: publish, test-fix, bead-close, uncommitted-WIP triage. Those
 * belong to existing domains (packages / code / backlog).
 *
 * Usage (via sop.ts):
 *   bun sop clean              # preflight + scan, no changes
 *   bun sop clean --execute    # auto-approve low-risk, ask for risky
 *   bun sop clean branches     # single target
 *   bun sop clean --force      # skip coordination guard (caller confirmed)
 */

import { execSync } from "node:child_process"
import { existsSync, readdirSync, statSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createStyle } from "@silvery/ansi"

const s = createStyle()

// ─── Types ─────────────────────────────────────────────────────────────────

export type Target = "branches" | "worktrees" | "procs" | "caches"

export const ALL_TARGETS: Target[] = ["branches", "worktrees", "procs", "caches"]

export interface ActiveWork {
  kind: "tribe" | "worktree-dirty" | "process" | "git-lock" | "stash"
  id: string // pid, branch, path, etc
  detail: string // human-readable
  startedAgo?: string // "3m ago" / "unknown"
}

export interface CleanItem {
  target: Target
  id: string // branch name, worktree path, pid, cache key
  detail: string // why it's a candidate
  risk: "low" | "ask" | "block" // low = auto in --execute; ask = prompt; block = refuse
}

export interface CleanPlan {
  preflight: ActiveWork[]
  items: CleanItem[]
}

export interface RunCleanOpts {
  target?: Target // limit to one target; omitted = all
  execute?: boolean // actually delete
  force?: boolean // skip preflight coordination gate
  activeSessions?: string[] // tribe sessions the caller already knows about
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string }
    const out = e.stdout?.toString() ?? ""
    return out.trim() || ""
  }
}

function agoFromEpoch(epoch: number): string {
  const deltaSec = Math.floor(Date.now() / 1000 - epoch)
  if (deltaSec < 60) return `${deltaSec}s ago`
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
  return `${Math.floor(deltaSec / 86400)}d ago`
}

function mtime(path: string): number {
  try { return Math.floor(statSync(path).mtimeMs / 1000) } catch { return 0 }
}

// ─── Preflight — detect active work ────────────────────────────────────────

function scanGitLocks(repoRoot: string): ActiveWork[] {
  const found: ActiveWork[] = []
  const locks = [
    [".git/index.lock", "git-lock", "git index locked — another process has exclusive access"],
    [".git/MERGE_HEAD", "git-lock", "merge in progress"],
    [".git/CHERRY_PICK_HEAD", "git-lock", "cherry-pick in progress"],
    [".git/rebase-apply", "git-lock", "rebase in progress"],
    [".git/rebase-merge", "git-lock", "rebase-merge in progress"],
  ] as const
  for (const [rel, kind, detail] of locks) {
    const p = join(repoRoot, rel)
    if (existsSync(p)) {
      const m = mtime(p)
      found.push({ kind, id: rel, detail, startedAgo: m ? agoFromEpoch(m) : undefined })
    }
  }
  return found
}

function scanProcesses(_repoRoot: string): ActiveWork[] {
  const found: ActiveWork[] = []
  const FRESH_SEC = 10 * 60 // only flag procs that started < 10 min ago
  // Only short-lived workers that would actually be disrupted by a branch/worktree change.
  // Excludes ambient daemons: tribe server, accountly, km-cli view, vitepress dev.
  const IS_WORKER = /\b(vitest|tsc|bun\s+fix|bun\s+run\s+test|bun\s+build|bun\s+release|git)\b/
  const IS_DAEMON = /(tribe\/server|accountly|vitepress|km-cli\/src\/index\.ts\s+view)/
  const raw = sh(`ps -eo pid,lstart,command | grep -E '(bun|node|vitest|tsc)' | grep -v grep || true`)
  if (!raw) return found
  for (const line of raw.split("\n")) {
    if (IS_DAEMON.test(line)) continue
    if (!IS_WORKER.test(line)) continue
    const m = line.trim().match(/^(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/)
    if (!m) continue
    const [, pid, lstart, cmd] = m
    if (!pid || !cmd) continue
    const started = Date.parse(lstart ?? "") / 1000
    if (!started || Date.now() / 1000 - started > FRESH_SEC) continue
    const shortCmd = cmd.length > 80 ? cmd.slice(0, 77) + "..." : cmd
    found.push({
      kind: "process",
      id: pid,
      detail: shortCmd,
      startedAgo: agoFromEpoch(started),
    })
  }
  return found
}

function scanWorktreeActivity(repoRoot: string, freshWithinSec: number): ActiveWork[] {
  const found: ActiveWork[] = []
  const raw = sh("git worktree list --porcelain")
  let currentPath: string | undefined
  let currentBranch: string | undefined
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) { currentPath = line.slice("worktree ".length) }
    else if (line.startsWith("branch ")) { currentBranch = line.slice("branch refs/heads/".length) }
    else if (line === "" && currentPath) {
      const p = currentPath
      const br = currentBranch ?? "(detached)"
      currentPath = undefined
      currentBranch = undefined
      if (!existsSync(p)) continue
      const head = join(p, ".git")
      const recentMs = mtime(head)
      if (recentMs && Date.now() / 1000 - recentMs < freshWithinSec && p !== repoRoot) {
        found.push({
          kind: "worktree-dirty",
          id: p,
          detail: `${br} (HEAD ref touched)`,
          startedAgo: agoFromEpoch(recentMs),
        })
      }
    }
  }
  return found
}

function scanTribe(activeSessions: string[] | undefined): ActiveWork[] {
  if (!activeSessions || activeSessions.length === 0) return []
  return activeSessions.map((name) => ({
    kind: "tribe" as const,
    id: name,
    detail: `tribe session '${name}' joined`,
    startedAgo: "per caller",
  }))
}

export function preflight(repoRoot: string, opts: RunCleanOpts): ActiveWork[] {
  const freshWithinSec = 5 * 60 // 5 min
  return [
    ...scanGitLocks(repoRoot),
    ...scanProcesses(repoRoot),
    ...scanWorktreeActivity(repoRoot, freshWithinSec),
    ...scanTribe(opts.activeSessions),
  ]
}

// ─── Scanners — find cleanup candidates ────────────────────────────────────

function listMergedBranches(): CleanItem[] {
  const raw = sh("git branch --merged main")
  const items: CleanItem[] = []
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim()
    if (!line || line.startsWith("*") || line.endsWith("/main") || line === "main") continue
    if (line.startsWith("+")) continue // checked out elsewhere
    items.push({
      target: "branches",
      id: line,
      detail: "merged into main",
      risk: "low",
    })
  }
  return items
}

function listUnmergedAgentBranches(): CleanItem[] {
  const raw = sh("git branch --no-merged main")
  const items: CleanItem[] = []
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/^[*+]\s*/, "").trim()
    if (!line || !line.startsWith("worktree-agent-")) continue
    items.push({
      target: "branches",
      id: line,
      detail: "orphan agent branch (unmerged — work likely abandoned)",
      risk: "ask",
    })
  }
  return items
}

function listOrphanWorktrees(repoRoot: string): CleanItem[] {
  const items: CleanItem[] = []
  const raw = sh("git worktree list --porcelain")
  let cur: { path?: string; branch?: string; locked?: boolean; reason?: string } = {}
  const flush = () => {
    if (!cur.path || cur.path === repoRoot) { cur = {}; return }
    if (cur.locked) {
      // Try to extract pid from lock reason: "claude agent agent-xyz (pid 12345)"
      const pidMatch = cur.reason?.match(/pid (\d+)/)
      const pid = pidMatch?.[1]
      if (pid && sh(`ps -p ${pid} -o pid= 2>/dev/null`) === "") {
        items.push({
          target: "worktrees",
          id: cur.path,
          detail: `locked to dead pid ${pid} (${cur.branch ?? "?"})`,
          risk: "low",
        })
      }
    }
    cur = {}
  }
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) { flush(); cur.path = line.slice("worktree ".length) }
    else if (line.startsWith("branch ")) cur.branch = line.slice("branch refs/heads/".length)
    else if (line.startsWith("locked")) { cur.locked = true; cur.reason = line.slice("locked".length).trim() }
    else if (line === "") flush()
  }
  flush()
  return items
}

function listZombieProcesses(repoRoot: string): CleanItem[] {
  // Defer to preflight — it already reports processes. The "clean procs" target
  // only touches orphans: long-idle vitests with no parent, not active work.
  // v1: empty list; refine later based on real observations.
  const _unused = repoRoot
  return []
}

function listStaleCaches(repoRoot: string, staleDays: number): CleanItem[] {
  const items: CleanItem[] = []
  const cacheDir = join(repoRoot, ".sop-cache")
  if (!existsSync(cacheDir)) return items
  const cutoff = Date.now() / 1000 - staleDays * 86400
  for (const name of readdirSync(cacheDir)) {
    const p = join(cacheDir, name)
    const m = mtime(p)
    if (m && m < cutoff) {
      items.push({
        target: "caches",
        id: p,
        detail: `.sop-cache entry untouched ${agoFromEpoch(m)}`,
        risk: "low",
      })
    }
  }
  return items
}

export function scan(repoRoot: string, target?: Target): CleanItem[] {
  const items: CleanItem[] = []
  if (!target || target === "branches") {
    items.push(...listMergedBranches(), ...listUnmergedAgentBranches())
  }
  if (!target || target === "worktrees") items.push(...listOrphanWorktrees(repoRoot))
  if (!target || target === "procs") items.push(...listZombieProcesses(repoRoot))
  if (!target || target === "caches") items.push(...listStaleCaches(repoRoot, 14))
  return items
}

// ─── Executors ─────────────────────────────────────────────────────────────

function deleteBranch(name: string, force: boolean): { ok: boolean; msg: string } {
  const flag = force ? "-D" : "-d"
  try {
    const out = sh(`git branch ${flag} "${name}" 2>&1`)
    return { ok: true, msg: out }
  } catch (e) {
    return { ok: false, msg: String(e) }
  }
}

function removeWorktree(path: string): { ok: boolean; msg: string } {
  sh(`git worktree unlock "${path}" 2>&1 || true`)
  const out = sh(`git worktree remove --force "${path}" 2>&1`)
  if (out.includes("fatal")) return { ok: false, msg: out }
  sh(`git worktree prune 2>&1`)
  return { ok: true, msg: "removed" }
}

function removeCache(path: string): { ok: boolean; msg: string } {
  try {
    rmSync(path, { recursive: true, force: true })
    return { ok: true, msg: "removed" }
  } catch (e) {
    return { ok: false, msg: String(e) }
  }
}

export function execute(
  items: CleanItem[],
  opts: { askOverride?: (item: CleanItem) => boolean; forceDeleteBranches?: boolean },
): { done: CleanItem[]; skipped: CleanItem[]; failed: Array<{ item: CleanItem; msg: string }> } {
  const done: CleanItem[] = []
  const skipped: CleanItem[] = []
  const failed: Array<{ item: CleanItem; msg: string }> = []
  for (const item of items) {
    if (item.risk === "block") { skipped.push(item); continue }
    if (item.risk === "ask" && !opts.askOverride?.(item)) { skipped.push(item); continue }
    let result: { ok: boolean; msg: string }
    switch (item.target) {
      case "branches":
        result = deleteBranch(item.id, opts.forceDeleteBranches ?? item.risk === "ask")
        break
      case "worktrees":
        result = removeWorktree(item.id)
        break
      case "caches":
        result = removeCache(item.id)
        break
      case "procs":
        result = { ok: false, msg: "proc killing not implemented in v1" }
        break
    }
    if (result.ok) done.push(item)
    else failed.push({ item, msg: result.msg })
  }
  return { done, skipped, failed }
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export function renderPreflight(active: ActiveWork[]): string {
  if (active.length === 0) return s.green("preflight: no active work detected.")
  const lines = [s.yellow.bold("⚠ preflight — active work detected:")]
  for (const a of active) {
    lines.push(`  ${s.dim(a.kind.padEnd(14))} ${s.bold(a.id)}  ${a.detail}${a.startedAgo ? s.dim(` (${a.startedAgo})`) : ""}`)
  }
  return lines.join("\n")
}

export function renderPlan(plan: CleanPlan): string {
  const lines: string[] = []
  lines.push(renderPreflight(plan.preflight))
  if (plan.items.length === 0) {
    lines.push(s.green("scan: nothing to clean."))
    return lines.join("\n")
  }
  const byTarget = new Map<Target, CleanItem[]>()
  for (const it of plan.items) {
    const arr = byTarget.get(it.target) ?? []
    arr.push(it)
    byTarget.set(it.target, arr)
  }
  lines.push("")
  lines.push(s.bold(`scan: ${plan.items.length} candidate(s)`))
  for (const [target, arr] of byTarget) {
    const lowN = arr.filter((i) => i.risk === "low").length
    const askN = arr.filter((i) => i.risk === "ask").length
    lines.push(`  ${s.bold(target.padEnd(10))} ${arr.length} item(s)  ${s.green(`${lowN} auto`)}  ${s.yellow(`${askN} ask`)}`)
    for (const it of arr.slice(0, 8)) {
      const risk = it.risk === "low" ? s.green("low") : s.yellow("ask")
      lines.push(`    [${risk}] ${it.id}  ${s.dim(it.detail)}`)
    }
    if (arr.length > 8) lines.push(s.dim(`    ...and ${arr.length - 8} more`))
  }
  return lines.join("\n")
}

export async function runClean(repoRoot: string, opts: RunCleanOpts): Promise<void> {
  const active = preflight(repoRoot, opts)
  const items = scan(repoRoot, opts.target)
  const plan: CleanPlan = { preflight: active, items }
  console.log(renderPlan(plan))

  if (!opts.execute) {
    console.log("")
    console.log(s.dim("re-run with --execute to apply. --force skips the preflight gate."))
    return
  }

  if (active.length > 0 && !opts.force) {
    console.log("")
    console.log(s.yellow("execute aborted: active work present. Coordinate with active sessions or re-run with --force."))
    process.exitCode = 1
    return
  }

  const { done, skipped, failed } = execute(items, {
    // --execute alone handles only low-risk. --force also promotes 'ask' items
    // (used after the caller has coordinated + confirmed).
    askOverride: () => opts.force === true,
    forceDeleteBranches: opts.force === true,
  })
  console.log("")
  console.log(s.bold(`execute: ${done.length} done, ${skipped.length} skipped, ${failed.length} failed`))
  for (const it of done) console.log(`  ${s.green("✓")} ${it.target.padEnd(10)} ${it.id}`)
  for (const it of skipped) console.log(`  ${s.dim("—")} ${it.target.padEnd(10)} ${it.id}  ${s.dim("(risk=" + it.risk + ", deferred)")}`)
  for (const f of failed) console.log(`  ${s.red("✗")} ${f.item.target.padEnd(10)} ${f.item.id}  ${s.red(f.msg)}`)
}
