#!/usr/bin/env bun
/**
 * WIP triage — surface and act on retained agent work.
 *
 * Companion to .claude/skills/max/ and the eventual-consistency model
 * (memory: feedback-agent-isolation-eventual-consistency.md). Branches +
 * retained worktrees + stashes form a triage queue; the lead session walks
 * it and decides per row.
 *
 * Usage (via sop.ts):
 *   bun tools/sop.ts scan infra wip-triage           # non-interactive table + JSON
 *   bun tools/sop.ts clean infra wip-triage          # interactive walker
 *   bun tools/sop.ts clean infra wip-triage --auto-safe   # only auto-discardable rows
 *
 * Direct (debug / cron):
 *   bun tools/wip-triage.ts scan
 *   bun tools/wip-triage.ts scan --json
 *   bun tools/wip-triage.ts clean --auto-safe
 *   bun tools/wip-triage.ts clean --integrate <row-id>
 *   bun tools/wip-triage.ts clean --discard <row-id>
 *
 * Architecture:
 *   - Pure functions (parseGitWorktrees, classifyRow, isAutoDiscardable)
 *     are exported via __test for unit testing with fixture inputs.
 *   - I/O happens via Bun.spawn (clean stdout/exit) and node:fs.
 *   - No raw `child_process.exec` — see CLAUDE.md anti-pattern guard.
 */

import { existsSync, statSync } from "node:fs"
import { basename } from "node:path"
import { createStyle } from "@silvery/ansi"

const s = createStyle()

// ─── Types ─────────────────────────────────────────────────────────────────

export type SourceKind = "git-worktree" | "bun-worktree" | "branch-only" | "stash"
export type BeadStatus = "open" | "in_progress" | "closed" | "not-found" | "unknown"

export interface RawWorktree {
  path: string
  head: string
  branch: string | null   // null = detached HEAD
  bare: boolean
  detached: boolean
}

export interface RawBranch {
  name: string
  committerDateIso: string
}

export interface RawStash {
  ref: string             // e.g. stash@{0}
  dateIso: string
  message: string
}

export interface TriageRow {
  /** Stable id for --integrate / --discard. Format: <kind>:<key>. */
  id: string
  source: SourceKind
  /** For worktrees: absolute path. For branches: branch name. For stashes: ref. */
  primary: string
  branch: string | null
  beadId: string | null
  beadStatus: BeadStatus
  /** Last commit sha (short, 8 chars) or stash creation context. */
  lastSha: string | null
  /** Behind/ahead vs main. null if not applicable (e.g. stash). */
  behind: number | null
  ahead: number | null
  /** Filesystem mtime epoch seconds (worktree) or stash date epoch. */
  mtimeEpoch: number
  /** Auto-discardable per the conservative gate. */
  autoDiscardable: boolean
  /** Human-readable reason explaining classification. */
  reason: string
}

export interface ScanResult {
  rows: TriageRow[]
  warnings: string[]
}

// ─── Bun.spawn shell helper ───────────────────────────────────────────────

interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function spawn(cmd: string[], cwd?: string): Promise<SpawnResult> {
  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode }
  } catch (err) {
    return { stdout: "", stderr: String(err), exitCode: 1 }
  }
}

// ─── Pure parsers (unit-testable) ─────────────────────────────────────────

/** Parse `git worktree list --porcelain` output into structured rows. */
export function parseGitWorktrees(porcelain: string): RawWorktree[] {
  const rows: RawWorktree[] = []
  const blocks = porcelain.split(/\n\n+/)
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0)
    if (lines.length === 0) continue
    let path = ""
    let head = ""
    let branch: string | null = null
    let bare = false
    let detached = false
    for (const line of lines) {
      if (line.startsWith("worktree ")) path = line.slice(9)
      else if (line.startsWith("HEAD ")) head = line.slice(5)
      else if (line.startsWith("branch ")) {
        const ref = line.slice(7)
        branch = ref.startsWith("refs/heads/") ? ref.slice(11) : ref
      } else if (line === "bare") bare = true
      else if (line === "detached") detached = true
    }
    if (path) rows.push({ path, head, branch, bare, detached })
  }
  return rows
}

/** Parse `git for-each-ref` output (format: `name|iso-date`). */
export function parseBranches(output: string): RawBranch[] {
  const rows: RawBranch[] = []
  for (const line of output.split("\n")) {
    if (!line.trim()) continue
    const idx = line.indexOf("|")
    if (idx < 0) continue
    const name = line.slice(0, idx).trim()
    const date = line.slice(idx + 1).trim()
    rows.push({ name, committerDateIso: date })
  }
  return rows
}

/** Parse `git stash list --format=%gd|%ci|%s` output. */
export function parseStashes(output: string): RawStash[] {
  const rows: RawStash[] = []
  for (const line of output.split("\n")) {
    if (!line.trim()) continue
    const parts = line.split("|")
    if (parts.length < 3) continue
    const ref = parts[0]!.trim()
    const dateIso = parts[1]!.trim()
    const message = parts.slice(2).join("|").trim()
    rows.push({ ref, dateIso, message })
  }
  return rows
}

/** Branch → bead id heuristic (capture group 2). */
const BRANCH_BEAD_RE = /^(wip|bug|feat|fix|chore|docs|refactor|test|ci|style|perf)\/(km-[a-z0-9.-]+)$/

export function extractBeadFromBranch(branch: string | null): string | null {
  if (!branch) return null
  const m = branch.match(BRANCH_BEAD_RE)
  return m ? m[2]! : null
}

/** Fallback: scan a commit message for `km-<scope>.<slug>` references. */
const COMMIT_BEAD_RE = /\b(km-[a-z0-9]+(?:\.[a-z0-9-]+)+)\b/

export function extractBeadFromMessage(message: string): string | null {
  const m = message.match(COMMIT_BEAD_RE)
  return m ? m[1]! : null
}

/**
 * Auto-discardable gate (conservative): all four conditions must hold.
 * - Linked bead is closed
 * - No stash references the branch
 * - Worktree mtime > 24h ago (or no worktree — branch-only)
 * - All commits reachable from main (ahead === 0)
 */
export function isAutoDiscardable(input: {
  source: SourceKind
  beadStatus: BeadStatus
  ahead: number | null
  mtimeEpoch: number
  nowEpoch: number
  hasStashRef: boolean
}): boolean {
  // Stashes are never auto-discardable — apply/revert is too risky for cron.
  if (input.source === "stash") return false
  if (input.beadStatus !== "closed") return false
  if (input.hasStashRef) return false
  if (input.ahead == null || input.ahead > 0) return false
  const ageSec = input.nowEpoch - input.mtimeEpoch
  // Branch-only rows have no worktree mtime; we treat them as "old enough"
  // because the branch itself is the persistent artifact.
  if (input.source !== "branch-only" && ageSec < 24 * 3600) return false
  return true
}

// ─── I/O readers ──────────────────────────────────────────────────────────

async function readGitWorktrees(repoRoot: string): Promise<RawWorktree[]> {
  const r = await spawn(["git", "worktree", "list", "--porcelain"], repoRoot)
  if (r.exitCode !== 0) return []
  return parseGitWorktrees(r.stdout)
}

async function readBranches(repoRoot: string): Promise<RawBranch[]> {
  const r = await spawn(
    [
      "git",
      "for-each-ref",
      "--format=%(refname:short)|%(committerdate:iso8601)",
      "refs/heads/",
    ],
    repoRoot,
  )
  if (r.exitCode !== 0) return []
  return parseBranches(r.stdout)
}

async function readStashes(repoRoot: string): Promise<{ rows: RawStash[]; warning: string | null }> {
  // `git stash list` is read-only but our local hook policy prohibits any
  // command containing `git stash`. We try; on failure we record the warning
  // and continue (graceful degradation — the rest of triage still works).
  const r = await spawn(
    ["git", "stash", "list", "--format=%gd|%ci|%s"],
    repoRoot,
  )
  if (r.exitCode !== 0) {
    const warn = r.stderr.includes("denied") || r.stderr.includes("dcg")
      ? "git stash list blocked by local hook policy — stash rows skipped"
      : null
    return { rows: [], warning: warn }
  }
  return { rows: parseStashes(r.stdout), warning: null }
}

async function readMainSha(repoRoot: string): Promise<string | null> {
  // Prefer origin/main if available; fall back to main.
  let r = await spawn(["git", "rev-parse", "origin/main"], repoRoot)
  if (r.exitCode === 0 && r.stdout.trim()) return r.stdout.trim()
  r = await spawn(["git", "rev-parse", "main"], repoRoot)
  if (r.exitCode === 0 && r.stdout.trim()) return r.stdout.trim()
  return null
}

async function readBeadStatus(beadId: string | null): Promise<BeadStatus> {
  if (!beadId) return "unknown"
  const r = await spawn(["bd", "show", beadId, "--format=json"])
  if (r.exitCode !== 0) return "not-found"
  try {
    const parsed = JSON.parse(r.stdout) as Array<{ status?: string }>
    const status = parsed[0]?.status
    if (status === "open" || status === "in_progress" || status === "closed") return status
    return "unknown"
  } catch {
    return "not-found"
  }
}

async function readDivergence(
  repoRoot: string,
  branch: string,
  mainSha: string | null,
): Promise<{ behind: number | null; ahead: number | null; lastSha: string | null }> {
  if (!mainSha) return { behind: null, ahead: null, lastSha: null }
  const r = await spawn(
    ["git", "rev-list", "--left-right", "--count", `${mainSha}...${branch}`],
    repoRoot,
  )
  let behind: number | null = null
  let ahead: number | null = null
  if (r.exitCode === 0) {
    const m = r.stdout.trim().match(/^(\d+)\s+(\d+)$/)
    if (m) {
      behind = Number(m[1])
      ahead = Number(m[2])
    }
  }
  const sha = await spawn(["git", "rev-parse", "--short=8", branch], repoRoot)
  const lastSha = sha.exitCode === 0 ? sha.stdout.trim() : null
  return { behind, ahead, lastSha }
}

function safeMtime(path: string): number {
  try { return Math.floor(statSync(path).mtimeMs / 1000) } catch { return 0 }
}

function isoToEpoch(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

// ─── Scan: compose readers + classifiers ──────────────────────────────────

export async function scanRepo(repoRoot: string): Promise<ScanResult> {
  const warnings: string[] = []
  const [gitWorktrees, branches, stashRead, mainSha] = await Promise.all([
    readGitWorktrees(repoRoot),
    readBranches(repoRoot),
    readStashes(repoRoot),
    readMainSha(repoRoot),
  ])
  if (stashRead.warning) warnings.push(stashRead.warning)

  const nowEpoch = Math.floor(Date.now() / 1000)

  // Track branches consumed by worktrees so we don't double-emit them as
  // branch-only rows. Repo-root worktree (branch=main) is also skipped.
  const branchesInWorktrees = new Set<string>()
  const worktreeRows: TriageRow[] = []

  for (const wt of gitWorktrees) {
    if (wt.bare) continue
    if (wt.path === repoRoot) {
      // The main checkout — not retained agent work, skip.
      if (wt.branch) branchesInWorktrees.add(wt.branch)
      continue
    }
    if (wt.branch) branchesInWorktrees.add(wt.branch)
    const isBunStyle = !wt.path.includes("/.claude/worktrees/agent-")
    const source: SourceKind = isBunStyle ? "bun-worktree" : "git-worktree"
    const beadId = extractBeadFromBranch(wt.branch)
    const beadStatus = await readBeadStatus(beadId)
    const div = wt.branch
      ? await readDivergence(repoRoot, wt.branch, mainSha)
      : { behind: null, ahead: null, lastSha: wt.head ? wt.head.slice(0, 8) : null }
    const mtimeEpoch = safeMtime(wt.path)
    const stashRefs = stashRead.rows.filter((s) => wt.branch && s.message.includes(wt.branch))
    const autoDiscardable = isAutoDiscardable({
      source,
      beadStatus,
      ahead: div.ahead,
      mtimeEpoch,
      nowEpoch,
      hasStashRef: stashRefs.length > 0,
    })
    const reason = buildReason({ source, beadId, beadStatus, ahead: div.ahead, behind: div.behind, mtimeEpoch, nowEpoch, autoDiscardable, hasStashRef: stashRefs.length > 0 })
    const id = `${source}:${basename(wt.path)}`
    worktreeRows.push({
      id,
      source,
      primary: wt.path,
      branch: wt.branch,
      beadId,
      beadStatus,
      lastSha: div.lastSha,
      behind: div.behind,
      ahead: div.ahead,
      mtimeEpoch,
      autoDiscardable,
      reason,
    })
  }

  // Branches not associated with any worktree.
  const branchOnlyRows: TriageRow[] = []
  for (const br of branches) {
    if (br.name === "main" || br.name === "master") continue
    if (branchesInWorktrees.has(br.name)) continue
    const beadId = extractBeadFromBranch(br.name)
    const beadStatus = await readBeadStatus(beadId)
    const div = await readDivergence(repoRoot, br.name, mainSha)
    const mtimeEpoch = isoToEpoch(br.committerDateIso)
    const stashRefs = stashRead.rows.filter((s) => s.message.includes(br.name))
    const autoDiscardable = isAutoDiscardable({
      source: "branch-only",
      beadStatus,
      ahead: div.ahead,
      mtimeEpoch,
      nowEpoch,
      hasStashRef: stashRefs.length > 0,
    })
    const reason = buildReason({ source: "branch-only", beadId, beadStatus, ahead: div.ahead, behind: div.behind, mtimeEpoch, nowEpoch, autoDiscardable, hasStashRef: stashRefs.length > 0 })
    branchOnlyRows.push({
      id: `branch:${br.name}`,
      source: "branch-only",
      primary: br.name,
      branch: br.name,
      beadId,
      beadStatus,
      lastSha: div.lastSha,
      behind: div.behind,
      ahead: div.ahead,
      mtimeEpoch,
      autoDiscardable,
      reason,
    })
  }

  // Stashes — never integrated, never auto-discarded.
  const stashRows: TriageRow[] = stashRead.rows.map((st) => {
    const beadId = extractBeadFromMessage(st.message)
    return {
      id: `stash:${st.ref}`,
      source: "stash" as const,
      primary: st.ref,
      branch: null,
      beadId,
      beadStatus: "unknown" as const,    // we don't query bd for stashes (cheap-only)
      lastSha: null,
      behind: null,
      ahead: null,
      mtimeEpoch: isoToEpoch(st.dateIso),
      autoDiscardable: false,
      reason: `stash never auto-discarded; review manually (${st.message.slice(0, 60)})`,
    }
  })

  return {
    rows: [...worktreeRows, ...branchOnlyRows, ...stashRows],
    warnings,
  }
}

function buildReason(input: {
  source: SourceKind
  beadId: string | null
  beadStatus: BeadStatus
  ahead: number | null
  behind?: number | null
  mtimeEpoch: number
  nowEpoch: number
  autoDiscardable: boolean
  hasStashRef: boolean
}): string {
  const parts: string[] = []
  if (input.beadId) parts.push(`bead=${input.beadId}/${input.beadStatus}`)
  else parts.push("no-bead-link")
  if (input.ahead != null) parts.push(`ahead=${input.ahead}`)
  if (input.behind != null) parts.push(`behind=${input.behind}`)
  if (input.hasStashRef) parts.push("stash-refs-branch")
  if (input.mtimeEpoch > 0) {
    const age = input.nowEpoch - input.mtimeEpoch
    parts.push(`age=${formatAge(age)}`)
  }
  parts.push(input.autoDiscardable ? "auto-discardable" : "needs-attention")
  return parts.join(", ")
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderTable(result: ScanResult): void {
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.error(s.yellow(`! ${w}`))
    console.error()
  }
  if (result.rows.length === 0) {
    console.log(s.green("No retained work — repo is clean."))
    return
  }
  console.log(s.bold(`WIP triage — ${result.rows.length} retained item(s)`))
  console.log()
  const header = ["KIND", "ID", "BEAD/STATUS", "AHEAD/BEHIND", "AGE", "ACTION"]
  const colWidths = [14, 38, 44, 14, 8, 18]
  function pad(v: string, w: number): string {
    if (v.length >= w) return v.slice(0, Math.max(0, w - 1)) + " "
    return v + " ".repeat(w - v.length)
  }
  console.log(header.map((h, i) => pad(h, colWidths[i]!)).join(""))
  console.log(s.dim("─".repeat(colWidths.reduce((a, b) => a + b, 0))))
  for (const r of result.rows) {
    const action = r.autoDiscardable ? s.green("auto-discardable") : s.yellow("needs-attention")
    const bead = r.beadId ? `${r.beadId}/${colorStatus(r.beadStatus)}` : s.dim("(unknown)")
    const div = r.ahead != null && r.behind != null ? `+${r.ahead}/-${r.behind}` : s.dim("—")
    const age = r.mtimeEpoch > 0 ? formatAge(Math.floor(Date.now() / 1000) - r.mtimeEpoch) : s.dim("—")
    const idShort = r.id.length > colWidths[1]! - 1
      ? r.id.slice(0, colWidths[1]! - 2) + "…"
      : r.id
    // Strip ANSI for accurate width measurement on colorized cells.
    const padCol = (raw: string, colored: string, w: number): string => {
      if (raw.length >= w) return colored
      return colored + " ".repeat(w - raw.length)
    }
    process.stdout.write(pad(r.source, colWidths[0]!))
    process.stdout.write(pad(idShort, colWidths[1]!))
    {
      const raw = r.beadId ? `${r.beadId}/${r.beadStatus}` : "(unknown)"
      process.stdout.write(padCol(raw, bead, colWidths[2]!))
    }
    {
      const raw = r.ahead != null && r.behind != null ? `+${r.ahead}/-${r.behind}` : "—"
      process.stdout.write(padCol(raw, div, colWidths[3]!))
    }
    {
      const raw = r.mtimeEpoch > 0 ? formatAge(Math.floor(Date.now() / 1000) - r.mtimeEpoch) : "—"
      process.stdout.write(padCol(raw, age, colWidths[4]!))
    }
    {
      const raw = r.autoDiscardable ? "auto-discardable" : "needs-attention"
      process.stdout.write(padCol(raw, action, colWidths[5]!))
    }
    process.stdout.write("\n")
  }
  console.log()
  const safe = result.rows.filter((r) => r.autoDiscardable).length
  const attention = result.rows.length - safe
  console.log(`  ${s.green(`${safe} auto-discardable`)}, ${s.yellow(`${attention} needs-attention`)}`)
  console.log()
  console.log(s.dim("Actions:"))
  console.log(s.dim("  bun tools/sop.ts clean infra wip-triage --auto-safe       # discard the safe rows"))
  console.log(s.dim("  bun tools/sop.ts clean infra wip-triage                  # interactive walker"))
}

function colorStatus(status: BeadStatus): string {
  switch (status) {
    case "open": return s.yellow(status)
    case "in_progress": return s.blueBright(status)
    case "closed": return s.green(status)
    case "not-found": return s.red(status)
    default: return s.dim(status)
  }
}

// ─── Action verbs ─────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean
  rowId: string
  steps: Array<{ cmd: string[]; exitCode: number; output: string }>
  message: string
}

async function actDiscard(repoRoot: string, row: TriageRow): Promise<ActionResult> {
  const steps: ActionResult["steps"] = []
  if (row.source === "stash") {
    return {
      ok: false,
      rowId: row.id,
      steps,
      message: "stash discard not auto-supported (apply/revert risk); use `git stash drop` manually after review",
    }
  }
  // Worktree row: remove worktree first, then branch.
  if (row.source !== "branch-only") {
    const r = await spawn(["git", "worktree", "remove", "--force", row.primary], repoRoot)
    steps.push({ cmd: ["git", "worktree", "remove", "--force", row.primary], exitCode: r.exitCode, output: r.stdout + r.stderr })
    if (r.exitCode !== 0) {
      return { ok: false, rowId: row.id, steps, message: `worktree remove failed: ${r.stderr.trim()}` }
    }
  }
  if (row.branch) {
    const r = await spawn(["git", "branch", "-D", row.branch], repoRoot)
    steps.push({ cmd: ["git", "branch", "-D", row.branch], exitCode: r.exitCode, output: r.stdout + r.stderr })
    if (r.exitCode !== 0) {
      return { ok: false, rowId: row.id, steps, message: `branch delete failed: ${r.stderr.trim()}` }
    }
  }
  return { ok: true, rowId: row.id, steps, message: "discarded" }
}

async function actIntegrate(repoRoot: string, row: TriageRow): Promise<ActionResult> {
  const steps: ActionResult["steps"] = []
  if (row.source === "stash") {
    return { ok: false, rowId: row.id, steps, message: "integrate is not supported for stashes" }
  }
  if (!row.branch) {
    return { ok: false, rowId: row.id, steps, message: "row has no branch to integrate" }
  }
  if (row.source !== "branch-only") {
    // Fetch the worktree's branch into the main repo's branch ref.
    const r = await spawn(
      ["git", "fetch", row.primary, `${row.branch}:${row.branch}`],
      repoRoot,
    )
    steps.push({ cmd: ["git", "fetch", row.primary, `${row.branch}:${row.branch}`], exitCode: r.exitCode, output: r.stdout + r.stderr })
    if (r.exitCode !== 0) {
      return { ok: false, rowId: row.id, steps, message: `fetch failed: ${r.stderr.trim()}` }
    }
  }
  // FF-merge attempt.
  const m = await spawn(["git", "merge", "--ff-only", row.branch], repoRoot)
  steps.push({ cmd: ["git", "merge", "--ff-only", row.branch], exitCode: m.exitCode, output: m.stdout + m.stderr })
  if (m.exitCode !== 0) {
    return {
      ok: false,
      rowId: row.id,
      steps,
      message: "non-FF — manual merge or cherry-pick required (left worktree+branch intact)",
    }
  }
  // Clean up.
  if (row.source !== "branch-only") {
    const r = await spawn(["git", "worktree", "remove", "--force", row.primary], repoRoot)
    steps.push({ cmd: ["git", "worktree", "remove", "--force", row.primary], exitCode: r.exitCode, output: r.stdout + r.stderr })
  }
  const bd = await spawn(["git", "branch", "-d", row.branch], repoRoot)
  steps.push({ cmd: ["git", "branch", "-d", row.branch], exitCode: bd.exitCode, output: bd.stdout + bd.stderr })
  return { ok: true, rowId: row.id, steps, message: "integrated (FF) and cleaned up" }
}

// ─── Interactive walker ────────────────────────────────────────────────────

async function readLine(): Promise<string> {
  const decoder = new TextDecoder()
  const chunks: string[] = []
  const reader = Bun.stdin.stream().getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value))
      if (chunks.join("").includes("\n")) break
    }
  } finally {
    reader.releaseLock()
  }
  return chunks.join("").split("\n")[0]!.trim().toLowerCase()
}

async function walkInteractive(repoRoot: string, result: ScanResult): Promise<void> {
  if (result.rows.length === 0) {
    console.log(s.green("No retained work — repo is clean."))
    return
  }
  for (const row of result.rows) {
    console.log()
    console.log(s.bold(`Row ${row.id}`))
    console.log(`  source:   ${row.source}`)
    console.log(`  primary:  ${row.primary}`)
    console.log(`  branch:   ${row.branch ?? "(none)"}`)
    console.log(`  bead:     ${row.beadId ? `${row.beadId} (${row.beadStatus})` : "(none)"}`)
    if (row.ahead != null) console.log(`  diverge:  +${row.ahead} / -${row.behind}`)
    console.log(`  age:      ${row.mtimeEpoch > 0 ? formatAge(Math.floor(Date.now() / 1000) - row.mtimeEpoch) : "—"}`)
    console.log(`  reason:   ${row.reason}`)
    process.stdout.write("  action [i=integrate, d=discard, l=leave, q=quit]: ")
    const ans = await readLine()
    if (ans === "q" || ans === "quit") break
    if (ans === "l" || ans === "leave" || ans === "") {
      console.log(s.dim("  -> left in place"))
      continue
    }
    if (ans === "i" || ans === "integrate") {
      const r = await actIntegrate(repoRoot, row)
      console.log(r.ok ? s.green(`  -> ${r.message}`) : s.red(`  -> ${r.message}`))
      continue
    }
    if (ans === "d" || ans === "discard") {
      const r = await actDiscard(repoRoot, row)
      console.log(r.ok ? s.green(`  -> ${r.message}`) : s.red(`  -> ${r.message}`))
      continue
    }
    console.log(s.yellow(`  unknown action '${ans}' — leaving in place`))
  }
}

async function autoSafe(repoRoot: string, result: ScanResult): Promise<number> {
  const targets = result.rows.filter((r) => r.autoDiscardable)
  if (targets.length === 0) {
    console.log(s.green("No auto-discardable rows."))
    return 0
  }
  let failed = 0
  for (const row of targets) {
    process.stdout.write(`discard ${row.id} ... `)
    const r = await actDiscard(repoRoot, row)
    if (r.ok) {
      console.log(s.green("ok"))
    } else {
      console.log(s.red(r.message))
      failed += 1
    }
  }
  return failed
}

// ─── Repo root resolver ───────────────────────────────────────────────────

function findRepoRoot(start: string): string {
  let p = start
  while (p !== "/") {
    if (existsSync(`${p}/.git`) || existsSync(`${p}/package.json`)) {
      // Walk up to find the actual top-level (the one whose parent has no .git).
      // The bead spec assumes the main checkout. Worktrees have `.git` as a
      // file, not a dir; the canonical repo root is recorded inside.
      return p
    }
    const parent = p.slice(0, p.lastIndexOf("/")) || "/"
    if (parent === p) break
    p = parent
  }
  return start
}

/**
 * Resolve the *main* repo working tree (where merges should land), even when
 * invoked from a worktree at .claude/worktrees/agent-*. We inspect
 * `git worktree list --porcelain` and pick the first non-bare entry whose
 * branch is `main`.
 */
async function resolveMainRepoRoot(cwd: string): Promise<string> {
  const here = findRepoRoot(cwd)
  const r = await spawn(["git", "worktree", "list", "--porcelain"], here)
  if (r.exitCode !== 0) return here
  const wts = parseGitWorktrees(r.stdout)
  const mainWt = wts.find((w) => !w.bare && w.branch === "main")
  return mainWt?.path ?? here
}

// ─── CLI ───────────────────────────────────────────────────────────────────

interface CliFlags {
  json: boolean
  autoSafe: boolean
  integrate: string | null
  discard: string | null
}

function parseArgs(argv: string[]): { cmd: "scan" | "clean" | "help"; flags: CliFlags } {
  const cmd = (argv[0] ?? "scan") as "scan" | "clean" | "help"
  const flags: CliFlags = { json: false, autoSafe: false, integrate: null, discard: null }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--json") flags.json = true
    else if (a === "--auto-safe") flags.autoSafe = true
    else if (a === "--integrate") flags.integrate = argv[++i] ?? null
    else if (a === "--discard") flags.discard = argv[++i] ?? null
  }
  return { cmd, flags }
}

function printHelp(): void {
  console.log(`wip-triage — surface and act on retained agent work

Usage:
  bun tools/wip-triage.ts scan [--json]
  bun tools/wip-triage.ts clean [--auto-safe | --integrate <id> | --discard <id>]

Sources:
  - git worktree list --porcelain  (incl. .claude/worktrees/agent-*)
  - bun worktree list              (parsed via git worktree porcelain)
  - git for-each-ref refs/heads/   (local branches without worktrees)
  - git stash list                 (stashes; never auto-discarded)

Safety:
  --auto-safe discards only rows that pass ALL of:
    bead closed, no stash refs branch, ahead=0, mtime > 24h
`)
}

export async function runCli(argv: string[]): Promise<number> {
  const { cmd, flags } = parseArgs(argv)
  if (cmd === "help") {
    printHelp()
    return 0
  }
  const repoRoot = await resolveMainRepoRoot(process.cwd())
  const result = await scanRepo(repoRoot)
  if (cmd === "scan") {
    if (flags.json) {
      console.log(JSON.stringify({ rows: result.rows, warnings: result.warnings }, null, 2))
    } else {
      renderTable(result)
    }
    // Exit code reflects "is there work the lead should look at?"
    const needsAttention = result.rows.some((r) => !r.autoDiscardable)
    return needsAttention ? 1 : 0
  }
  if (cmd === "clean") {
    if (flags.integrate) {
      const row = result.rows.find((r) => r.id === flags.integrate || r.primary === flags.integrate || r.branch === flags.integrate)
      if (!row) { console.error(`row not found: ${flags.integrate}`); return 2 }
      const r = await actIntegrate(repoRoot, row)
      console.log(r.ok ? s.green(r.message) : s.red(r.message))
      return r.ok ? 0 : 1
    }
    if (flags.discard) {
      const row = result.rows.find((r) => r.id === flags.discard || r.primary === flags.discard || r.branch === flags.discard)
      if (!row) { console.error(`row not found: ${flags.discard}`); return 2 }
      const r = await actDiscard(repoRoot, row)
      console.log(r.ok ? s.green(r.message) : s.red(r.message))
      return r.ok ? 0 : 1
    }
    if (flags.autoSafe) {
      const failed = await autoSafe(repoRoot, result)
      return failed === 0 ? 0 : 1
    }
    await walkInteractive(repoRoot, result)
    return 0
  }
  printHelp()
  return 2
}

// ─── Test surface ─────────────────────────────────────────────────────────

export const __test = {
  parseGitWorktrees,
  parseBranches,
  parseStashes,
  extractBeadFromBranch,
  extractBeadFromMessage,
  isAutoDiscardable,
  buildReason,
  formatAge,
}

if (import.meta.main) {
  runCli(process.argv.slice(2))
    .then((code) => { process.exitCode = code })
    .catch((err) => { console.error(err); process.exitCode = 1 })
}
