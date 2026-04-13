#!/usr/bin/env bun
/**
 * SOP Runner — cached DAG executor for maintenance tools.
 *
 * Runs shell commands, caches outputs in .sop-cache/, skips unchanged.
 * Zero library deps beyond Bun builtins.
 *
 * Usage:
 *   bun tools/sop-runner.ts                 # Run all tasks
 *   bun tools/sop-runner.ts tsc lint knip   # Run specific tasks
 *   bun tools/sop-runner.ts --all           # Same as no args (all tasks)
 *   bun tools/sop-runner.ts --force         # Bypass cache
 *   bun tools/sop-runner.ts --json          # Machine-readable output
 *   bun tools/sop-runner.ts --domains code packages  # Run tools for domains
 *   bun tools/sop-runner.ts --status        # Show cache state
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createStyle } from "@silvery/ansi"
import { TASKS, TASK_MAP, DOMAIN_TOOLS, type SopTask } from "./sop-tools.ts"

const s = createStyle()
const REPO_ROOT = join(import.meta.dir, "..")
const CACHE_DIR = join(REPO_ROOT, ".sop-cache")

// ─── Types ─────────────────────────────────────────────────────────────────

interface CacheMeta {
  key: string
  exitCode: number
  timestamp: string
  durationMs: number
}

export interface TaskResult {
  id: string
  label: string
  exitCode: number
  durationMs: number
  cached: boolean
}

// ─── Git cache key ─────────────────────────────────────────────────────────

async function getGitKey(): Promise<string> {
  const headProc = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" })
  const head = (await new Response(headProc.stdout).text()).trim()
  await headProc.exited

  const diffProc = Bun.spawn(["git", "diff", "--stat", "HEAD"], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" })
  const diff = (await new Response(diffProc.stdout).text()).trim()
  await diffProc.exited

  return `${head}:${diff ? Bun.hash(diff).toString(16) : "clean"}`
}

// ─── Cache operations ──────────────────────────────────────────────────────

function readMeta(taskId: string): CacheMeta | null {
  const path = join(CACHE_DIR, `${taskId}.meta`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CacheMeta
  } catch {
    return null
  }
}

function isCached(task: SopTask, gitKey: string): boolean {
  const meta = readMeta(task.id)
  if (!meta) return false

  if (task.cache === "git") {
    return meta.key === gitKey
  }
  if (typeof task.cache === "number") {
    const ageSeconds = (Date.now() - new Date(meta.timestamp).getTime()) / 1000
    return ageSeconds < task.cache
  }
  return false // no cache = always run
}

function writeMeta(taskId: string, meta: CacheMeta): void {
  writeFileSync(join(CACHE_DIR, `${taskId}.meta`), JSON.stringify(meta, null, 2) + "\n")
}

function writeOutput(taskId: string, stdout: string, stderr: string): void {
  let content = stdout
  if (stderr.trim()) content += `\n---STDERR---\n${stderr}`
  writeFileSync(join(CACHE_DIR, `${taskId}.out`), content)
}

/** Read cached output for a task. Returns null if not cached. */
export function readCachedOutput(taskId: string): string | null {
  const path = join(CACHE_DIR, `${taskId}.out`)
  if (!existsSync(path)) return null
  return readFileSync(path, "utf-8")
}

/** Read cached metadata for a task. Returns null if not cached. */
export function readCachedMeta(taskId: string): CacheMeta | null {
  return readMeta(taskId)
}

// ─── Toposort ──────────────────────────────────────────────────────────────

function toposort(tasks: SopTask[]): SopTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]))
  const sorted: SopTask[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(id: string): void {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`Circular dependency: ${id}`)
    visiting.add(id)
    const task = taskMap.get(id)
    if (task) {
      for (const dep of task.deps ?? []) {
        // Only visit dep if it's in our task set
        if (taskMap.has(dep)) visit(dep)
      }
      sorted.push(task)
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const task of tasks) visit(task.id)
  return sorted
}

// ─── Run a single task ─────────────────────────────────────────────────────

async function runTask(task: SopTask): Promise<{ exitCode: number; durationMs: number; stdout: string; stderr: string }> {
  const start = performance.now()
  const proc = Bun.spawn(["bash", "-c", task.command], {
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0" },
  })

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  const durationMs = performance.now() - start

  return { exitCode, durationMs, stdout, stderr }
}

// ─── Formatting ────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function statusIcon(exitCode: number, cached: boolean): string {
  if (cached) return s.dim("\u2713")
  return exitCode === 0 ? s.green("\u2713") : s.red("\u2717")
}

// ─── Resolve tasks from CLI args ───────────────────────────────────────────

function resolveTasks(args: string[], domains: string[]): SopTask[] {
  const taskIds = new Set<string>()

  // Explicit task IDs
  for (const arg of args) {
    if (!TASK_MAP.has(arg)) {
      console.error(s.red(`Unknown task: ${arg}`))
      console.error(`Available: ${TASKS.map((t) => t.id).join(", ")}`)
      process.exit(1)
    }
    taskIds.add(arg)
  }

  // Domain-based resolution
  for (const domain of domains) {
    const tools = DOMAIN_TOOLS[domain]
    if (!tools) {
      console.error(s.red(`Unknown domain: ${domain}`))
      console.error(`Available: ${Object.keys(DOMAIN_TOOLS).join(", ")}`)
      process.exit(1)
    }
    for (const id of tools) taskIds.add(id)
  }

  // If nothing specified, run all
  if (taskIds.size === 0) return [...TASKS]

  // Collect tasks + their transitive deps
  const result = new Set<string>()
  function addWithDeps(id: string): void {
    if (result.has(id)) return
    const task = TASK_MAP.get(id)
    if (!task) return
    for (const dep of task.deps ?? []) addWithDeps(dep)
    result.add(id)
  }
  for (const id of taskIds) addWithDeps(id)

  return [...result].map((id) => TASK_MAP.get(id)!).filter(Boolean)
}

// ─── Main executor ─────────────────────────────────────────────────────────

async function execute(tasks: SopTask[], force: boolean, json: boolean): Promise<TaskResult[]> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const sorted = toposort(tasks)
  const results: TaskResult[] = []

  // Phase 0: run mutating tasks (no cache) to get working tree stable
  const mutating = sorted.filter((t) => t.cache === undefined)
  const cacheable = sorted.filter((t) => t.cache !== undefined)

  for (const task of mutating) {
    if (!json) process.stderr.write(`  ${s.dim(task.id)}...`)
    const { exitCode, durationMs, stdout, stderr } = await runTask(task)
    writeOutput(task.id, stdout, stderr)
    writeMeta(task.id, { key: "none", exitCode, timestamp: new Date().toISOString(), durationMs })
    results.push({ id: task.id, label: task.label, exitCode, durationMs, cached: false })
    if (!json) process.stderr.write(` ${statusIcon(exitCode, false)} ${s.dim(formatDuration(durationMs))}\n`)
  }

  // Compute git key AFTER mutating tasks (they may have changed files)
  const gitKey = await getGitKey()

  // Phase 1: run remaining tasks in dependency-wave parallel
  // Group by depth level for parallel execution
  const completed = new Set(mutating.map((t) => t.id))
  const remaining = [...cacheable]

  while (remaining.length > 0) {
    // Find tasks whose deps are all completed
    const ready = remaining.filter((t) =>
      (t.deps ?? []).every((d) => completed.has(d) || !tasks.some((tt) => tt.id === d)),
    )

    if (ready.length === 0) {
      // All remaining tasks have unmet deps — shouldn't happen after toposort
      console.error(s.red("Stuck: remaining tasks have unmet dependencies"))
      break
    }

    // Remove ready tasks from remaining
    for (const t of ready) {
      const idx = remaining.indexOf(t)
      if (idx >= 0) remaining.splice(idx, 1)
    }

    // Run ready tasks in parallel, collect results, print after wave completes
    const wave = ready.map(async (task): Promise<TaskResult> => {
      if (!force && isCached(task, gitKey)) {
        const meta = readMeta(task.id)!
        return { id: task.id, label: task.label, exitCode: meta.exitCode, durationMs: 0, cached: true }
      }

      const { exitCode, durationMs, stdout, stderr } = await runTask(task)
      const key = task.cache === "git" ? gitKey : "ttl"
      writeOutput(task.id, stdout, stderr)
      writeMeta(task.id, { key, exitCode, timestamp: new Date().toISOString(), durationMs })
      return { id: task.id, label: task.label, exitCode, durationMs, cached: false }
    })

    const waveResults = await Promise.all(wave)

    // Print results after wave completes (serialized output)
    if (!json) {
      for (const r of waveResults) {
        const icon = statusIcon(r.exitCode, r.cached)
        const dur = r.cached ? s.dim("cached") : s.dim(formatDuration(r.durationMs))
        process.stderr.write(`  ${s.dim(r.id)} ${icon} ${dur}\n`)
      }
    }

    results.push(...waveResults)
    for (const t of ready) completed.add(t.id)
  }

  return results
}

// ─── Status command ────────────────────────────────────────────────────────

function showStatus(): void {
  console.log()
  console.log(s.bold.yellow("SOP Runner Cache Status"))
  console.log()

  for (const task of TASKS) {
    const meta = readMeta(task.id)
    if (!meta) {
      console.log(`  ${s.dim(task.id)} — never run`)
      continue
    }
    const age = Math.round((Date.now() - new Date(meta.timestamp).getTime()) / 1000)
    const ageStr = age < 60 ? `${age}s ago` : age < 3600 ? `${Math.round(age / 60)}m ago` : `${Math.round(age / 3600)}h ago`
    const icon = meta.exitCode === 0 ? s.green("\u2713") : s.red("\u2717")
    const cacheType = task.cache === "git" ? "git" : typeof task.cache === "number" ? `${task.cache}s TTL` : "none"
    console.log(`  ${icon} ${task.id} ${s.dim(`(${cacheType})`)} — ${ageStr}, exit ${meta.exitCode}, ${formatDuration(meta.durationMs)}`)
  }
  console.log()
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(): { tasks: string[]; domains: string[]; force: boolean; json: boolean; status: boolean } {
  const args = process.argv.slice(2)
  const tasks: string[] = []
  const domains: string[] = []
  let force = false
  let json = false
  let status = false
  let parsingDomains = false

  for (const arg of args) {
    if (arg === "--force") { force = true; continue }
    if (arg === "--json") { json = true; continue }
    if (arg === "--all") { continue } // explicit no-op, same as default
    if (arg === "--status") { status = true; continue }
    if (arg === "--domains") { parsingDomains = true; continue }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun tools/sop-runner.ts [tasks...] [--all] [--force] [--json] [--domains <domain>...] [--status]")
      console.log()
      console.log("Tasks:", TASKS.map((t) => t.id).join(", "))
      console.log("Domains:", Object.keys(DOMAIN_TOOLS).join(", "))
      process.exit(0)
    }
    if (parsingDomains) {
      domains.push(arg)
    } else {
      tasks.push(arg)
    }
  }

  return { tasks, domains, force, json, status }
}

async function main(): Promise<void> {
  const { tasks: taskArgs, domains, force, json, status } = parseArgs()

  if (status) {
    showStatus()
    return
  }

  const tasks = resolveTasks(taskArgs, domains)
  const totalStart = performance.now()

  if (!json) {
    console.error(s.bold.yellow(`SOP Runner — ${tasks.length} task(s)`))
    console.error()
  }

  const results = await execute(tasks, force, json)
  const totalMs = performance.now() - totalStart

  if (json) {
    console.log(JSON.stringify({ results, totalMs }, null, 2))
    return
  }

  // Summary
  const ran = results.filter((r) => !r.cached)
  const cached = results.filter((r) => r.cached)
  const failed = results.filter((r) => r.exitCode !== 0)

  console.error()
  console.error(
    s.dim(`  ${ran.length} ran, ${cached.length} cached, ${failed.length} failed — ${formatDuration(totalMs)} total`),
  )

  if (failed.length > 0) {
    console.error()
    console.error(s.bold.red("  Failed:"))
    for (const f of failed) {
      console.error(`    ${s.red("\u2717")} ${f.id} (exit ${f.exitCode})`)
    }
  }

  console.error()
  process.exitCode = failed.length > 0 ? 1 : 0
}

if (import.meta.main) main()
