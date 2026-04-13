#!/usr/bin/env bun
/**
 * SOP — Standard Operating Procedure orchestrator
 *
 * Domain-aware layer over sop-runner.ts. Adds cadence, triggers, and dashboard.
 * Tool execution and caching are handled by sop-runner.ts + sop-tools.ts.
 *
 * Usage:
 *   bun sop scan              # Run due domains
 *   bun sop scan --all        # Run all regardless of cadence
 *   bun sop scan code         # Just one domain
 *   bun sop scan code backlog # Multiple domains
 *   bun sop status            # What's due, last run times
 *   bun sop dashboard         # Render last scan results
 *   bun sop update            # Propose SOP improvements
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { Command } from "@silvery/commander"
import { createStyle } from "@silvery/ansi"
import { createLogger } from "loggily"
import { DOMAIN_TOOLS, TASK_MAP } from "./sop-tools.ts"
import { readCachedMeta } from "./sop-runner.ts"

// ─── Styles & Logging ──────────────────────────────────────────────────────

const s = createStyle()

const log = createLogger("sop", [
  { level: "debug" },
  { file: "/tmp/sop.log", format: "json" },
])

// ─── Paths ──────────────────────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dir, "..")
const STATE_PATH = join(REPO_ROOT, ".claude", "skills", "sop", "state.json")

// ─── Types ──────────────────────────────────────────────────────────────────

type Cadence = "session" | "weekly" | "monthly" | "quarterly"
type Status = "pass" | "warn" | "error"

interface Finding {
  tool: string
  domain: string
  status: Status
  label: string
  durationMs: number
  cached: boolean
}

interface DomainDef {
  id: string
  label: string
  cadence: Cadence
}

interface DomainTiming {
  durationMs: number
}

interface Trigger {
  source: { domain: string; status: Status }
  target: { domain: string }
  label: string
}

interface FiredTrigger {
  trigger: Trigger
  sourceDomain: string
}

interface State {
  lastRun: Record<string, string>
  lastFindings: Record<string, Finding[]>
  lastDomainTimings?: Record<string, DomainTiming>
  lastScanDurationMs?: number
  lastFiredTriggers?: FiredTrigger[]
}

// ─── State persistence ──────────────────────────────────────────────────────

function loadState(): State {
  if (!existsSync(STATE_PATH)) return { lastRun: {}, lastFindings: {} }
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as State
  } catch {
    return { lastRun: {}, lastFindings: {} }
  }
}

function saveState(state: State): void {
  const dir = dirname(STATE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n")
}

// ─── Cadence logic ──────────────────────────────────────────────────────────

const CADENCE_MS: Record<Cadence, number> = {
  session: 0,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
}

function isDue(domain: DomainDef, state: State): boolean {
  const last = state.lastRun[domain.id]
  if (!last) return true
  if (domain.cadence === "session") return true
  return Date.now() - new Date(last).getTime() >= CADENCE_MS[domain.cadence]
}

function nextDueDate(domain: DomainDef, state: State): string {
  const last = state.lastRun[domain.id]
  if (!last) return "now"
  if (domain.cadence === "session") return "every session"
  const dueAt = new Date(new Date(last).getTime() + CADENCE_MS[domain.cadence])
  return dueAt.getTime() <= Date.now() ? "now" : dueAt.toISOString().split("T")[0]!
}

// ─── Domain definitions ─────────────────────────────────────────────────────

export const DOMAINS: DomainDef[] = [
  { id: "code", label: "code", cadence: "session" },
  { id: "packages", label: "packages", cadence: "monthly" },
  { id: "inbound", label: "inbound", cadence: "weekly" },
  { id: "backlog", label: "backlog", cadence: "weekly" },
  { id: "sites", label: "sites", cadence: "monthly" },
  { id: "security", label: "security", cadence: "weekly" },
  { id: "packaging", label: "packaging", cadence: "monthly" },
  { id: "infra", label: "infra", cadence: "monthly" },
  { id: "legal", label: "legal", cadence: "quarterly" },
]

const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]))

// ─── Cross-domain triggers ─────────────────────────────────────────────────

const TRIGGERS: Trigger[] = [
  { source: { domain: "code", status: "error" }, target: { domain: "packages" }, label: "code errors may affect publishability" },
  { source: { domain: "security", status: "error" }, target: { domain: "packages" }, label: "CVEs may need patch releases" },
  { source: { domain: "backlog", status: "error" }, target: { domain: "inbound" }, label: "P0/P1 drift may indicate untriaged issues" },
  { source: { domain: "packages", status: "warn" }, target: { domain: "sites" }, label: "unreleased changes may make docs stale" },
]

function evaluateTriggers(allFindings: Finding[]): FiredTrigger[] {
  const fired: FiredTrigger[] = []
  for (const trigger of TRIGGERS) {
    const domainFindings = allFindings.filter((f) => f.domain === trigger.source.domain)
    const hasStatus = domainFindings.some((f) => f.status === trigger.source.status)
    if (hasStatus) {
      fired.push({ trigger, sourceDomain: trigger.source.domain })
    }
  }
  return fired
}

// ─── Run tools via sop-runner ───────────────────────────────────────────────

async function runToolsForDomains(domainIds: string[], force: boolean): Promise<void> {
  const args = ["bun", "tools/sop-runner.ts", "--domains", ...domainIds]
  if (force) args.push("--force")

  const proc = Bun.spawn(args, {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
}

/** Read tool results from .sop-cache/ and map to domain findings */
function readDomainFindings(domainId: string): Finding[] {
  const toolIds = DOMAIN_TOOLS[domainId]
  if (!toolIds) return []

  const findings: Finding[] = []
  for (const toolId of toolIds) {
    const meta = readCachedMeta(toolId)
    const task = TASK_MAP.get(toolId)
    if (!task) continue
    if (!meta) {
      findings.push({
        tool: toolId,
        domain: domainId,
        status: "warn",
        label: `${task.label} (not run)`,
        durationMs: 0,
        cached: false,
      })
      continue
    }

    findings.push({
      tool: toolId,
      domain: domainId,
      status: meta.exitCode === 0 ? "pass" : "warn",
      label: task.label,
      durationMs: meta.durationMs,
      cached: false,
    })
  }
  return findings
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function statusIcon(status: Status): string {
  switch (status) {
    case "pass": return s.green("\u2713")
    case "warn": return s.yellow("\u26A0")
    case "error": return s.red("\u2717")
  }
}

function statusLabel(status: Status): string {
  switch (status) {
    case "pass": return s.green(" ok")
    case "warn": return s.yellow(" warn")
    case "error": return s.red.bold(" FAIL")
  }
}

// ─── Dashboard rendering ────────────────────────────────────────────────────

function renderDashboard(state: State): void {
  const dateStr = new Date().toISOString().split("T")[0]
  console.log()
  console.log(s.bold.yellow(`SOP Report \u2014 ${dateStr}`))
  console.log()

  for (const domain of DOMAINS) {
    const findings = state.lastFindings[domain.id]
    const hasFindings = findings && findings.length > 0
    const hasIssues = hasFindings && findings.some((f) => f.status !== "pass")
    const domainLabel = hasIssues ? s.bold(domain.id) : hasFindings ? domain.id : s.dim(domain.id)

    if (!hasFindings) {
      const lastRun = state.lastRun[domain.id]
      const label = lastRun ? s.dim(`last run ${lastRun.split("T")[0]}`) : s.dim("never run")
      console.log(`  ${domainLabel} \u2014 ${label}`)
      continue
    }

    const worst: Status = findings.some((f) => f.status === "error")
      ? "error"
      : findings.some((f) => f.status === "warn")
        ? "warn"
        : "pass"

    const icon = statusIcon(worst)
    const taskLabels = findings.map((f) => {
      return f.status === "pass" ? s.dim(f.label) : s.yellow(f.label)
    }).join(", ")

    const timing = state.lastDomainTimings?.[domain.id]
    const dur = timing ? s.dim(`  [${formatDuration(timing.durationMs)}]`) : ""
    console.log(`  ${domainLabel} ${icon} ${taskLabels}${dur}`)
  }

  // Totals
  const allFindings = Object.values(state.lastFindings).flat()
  const warns = allFindings.filter((f) => f.status === "warn").length
  const errors = allFindings.filter((f) => f.status === "error").length

  console.log()
  const warnStr = warns > 0 ? s.yellow(`${warns} warn`) : `${warns} warn`
  const errorStr = errors > 0 ? s.red(`${errors} error`) : `${errors} error`
  console.log(`  Findings: ${warnStr}, ${errorStr}`)

  if (state.lastScanDurationMs != null) {
    console.log(s.dim(`  Total scan time: ${formatDuration(state.lastScanDurationMs)}`))
  }

  // Triggered cross-domain checks
  if (state.lastFiredTriggers && state.lastFiredTriggers.length > 0) {
    console.log()
    console.log(s.bold.blueBright("  Triggers fired:"))
    for (const ft of state.lastFiredTriggers) {
      console.log(
        `    ${s.dim(ft.sourceDomain)} ${statusLabel(ft.trigger.source.status).trim()} -> ${ft.trigger.target.domain} ${s.dim(`(${ft.trigger.label})`)}`,
      )
    }
  }

  // Next due
  const dueDomains = DOMAINS.filter((d) => !isDue(d, state))
    .map((d) => ({ id: d.id, next: nextDueDate(d, state) }))
    .filter((d) => d.next !== "now" && d.next !== "every session")
    .sort((a, b) => (a.next < b.next ? -1 : 1))

  if (dueDomains.length > 0) {
    const nextStr = dueDomains
      .slice(0, 3)
      .map((d) => `${d.id} ${s.dim(`(${d.next})`)}`)
      .join(", ")
    console.log(`  ${s.bold.blueBright("Next due:")} ${nextStr}`)
  }

  console.log()
}

// ─── Status command ─────────────────────────────────────────────────────────

function renderStatus(state: State): void {
  console.log()
  console.log(s.bold.yellow("SOP Domain Status"))
  console.log()

  for (const domain of DOMAINS) {
    const due = isDue(domain, state)
    const lastRun = state.lastRun[domain.id]
    const lastStr = lastRun ? lastRun.split("T")[0]! : s.dim("never")
    const next = nextDueDate(domain, state)
    const dueTag = due ? s.yellow.bold(" [DUE]") : ""
    const toolCount = DOMAIN_TOOLS[domain.id]?.length ?? 0

    console.log(
      `  ${domain.id} ${s.dim(domain.cadence)} last=${lastStr} next=${next}${dueTag} ${s.dim(`(${toolCount} tools)`)}`,
    )
  }

  console.log()
}

// ─── Domain resolution ──────────────────────────────────────────────────────

const DOMAIN_NAMES = DOMAINS.map((d) => d.id).join(", ")

function resolveDomains(args: string[], all: boolean, state: State): DomainDef[] {
  if (args.length > 0) {
    const resolved: DomainDef[] = []
    for (const arg of args) {
      const domain = DOMAIN_MAP.get(arg)
      if (!domain) {
        throw new Error(`Unknown domain: ${arg}\nAvailable: ${DOMAIN_NAMES}`)
      }
      resolved.push(domain)
    }
    return resolved
  }
  if (all) return DOMAINS
  return DOMAINS.filter((d) => isDue(d, state))
}

// ─── Scan command ───────────────────────────────────────────────────────────

async function runScan(domainsToRun: DomainDef[], state: State, force: boolean): Promise<void> {
  if (domainsToRun.length === 0) {
    console.log(s.green("No domains due for scanning."))
    renderStatus(state)
    return
  }

  const scanStart = performance.now()
  const domainIds = domainsToRun.map((d) => d.id)

  // Run tools via sop-runner
  await runToolsForDomains(domainIds, force)

  // Read results from cache
  state.lastDomainTimings ??= {}
  for (const domain of domainsToRun) {
    const domainStart = performance.now()
    const findings = readDomainFindings(domain.id)
    state.lastRun[domain.id] = new Date().toISOString()
    state.lastFindings[domain.id] = findings
    state.lastDomainTimings[domain.id] = { durationMs: performance.now() - domainStart }
  }

  // Cross-domain triggers (depth = 1, no cascading)
  const scannedDomains = new Set(domainIds)
  const allFindings = domainsToRun.flatMap((d) => state.lastFindings[d.id] ?? [])
  const firedTriggers = evaluateTriggers(allFindings)

  if (firedTriggers.length > 0) {
    for (const ft of firedTriggers) {
      const targetId = ft.trigger.target.domain
      if (scannedDomains.has(targetId)) continue

      scannedDomains.add(targetId)
      console.error(s.dim(`  [triggered: ${ft.sourceDomain} -> ${targetId}] ${ft.trigger.label}`))

      // Run tools for triggered domain
      await runToolsForDomains([targetId], force)
      const findings = readDomainFindings(targetId)
      state.lastRun[targetId] = new Date().toISOString()
      state.lastFindings[targetId] = findings
    }
  }

  state.lastFiredTriggers = firedTriggers.length > 0 ? firedTriggers : undefined
  state.lastScanDurationMs = performance.now() - scanStart
  saveState(state)
  renderDashboard(state)
}

// ─── Update analysis ───────────────────────────────────────────────────────

async function runUpdate(state: State): Promise<void> {
  const dateStr = new Date().toISOString().split("T")[0]

  const [gitLogResult, beadsResult, rulesContent] = await Promise.all([
    runShell("git log --oneline -20"),
    runShell("bd list --status=open --limit 20 2>&1"),
    Promise.resolve(readFileSafe(join(REPO_ROOT, ".claude", "skills", "sop", "_sop-rules.md"))),
  ])

  const commitPatterns = analyzeCommitPatterns(gitLogResult.stdout)
  const stateInsights = analyzeStateFindings(state)
  const antiPatternCandidates = analyzeAntiPatterns(gitLogResult.stdout, beadsResult.stdout, rulesContent)

  console.log()
  console.log(s.bold.yellow(`SOP Update Analysis \u2014 ${dateStr}`))

  if (commitPatterns.length > 0) {
    console.log()
    console.log(s.bold.blueBright("  Recent maintenance patterns:"))
    for (const p of commitPatterns) console.log(`    - ${p}`)
  }

  if (antiPatternCandidates.length > 0) {
    console.log()
    console.log(s.bold.blueBright("  Anti-pattern candidates:"))
    for (const a of antiPatternCandidates) console.log(`    - ${s.red(a)}`)
  }

  if (stateInsights.length > 0) {
    console.log()
    console.log(s.bold.blueBright("  State insights:"))
    for (const si of stateInsights) console.log(`    - ${si}`)
  }

  if (commitPatterns.length === 0 && antiPatternCandidates.length === 0 && stateInsights.length === 0) {
    console.log()
    console.log(s.green("  No improvements identified. SOP checks look healthy."))
  }

  console.log()
}

async function runShell(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const proc = Bun.spawn(["bash", "-c", cmd], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode }
  } catch {
    return { stdout: "", stderr: "", exitCode: 1 }
  }
}

function readFileSafe(path: string): string {
  try { return readFileSync(path, "utf-8") } catch { return "" }
}

function analyzeCommitPatterns(gitLog: string): string[] {
  const patterns: string[] = []
  const lines = gitLog.trim().split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) return patterns
  const messages = lines.map((l) => l.replace(/^[a-f0-9]+\s+/, ""))

  const keywordPatterns: Array<{ regex: RegExp; label: string; suggestion: string }> = [
    { regex: /\btypecheck\s*baseline\b/i, label: "typecheck baseline", suggestion: "auto-baseline check in code domain" },
    { regex: /\bbaseline\b/i, label: "baseline update", suggestion: "baseline-reset anti-pattern detection" },
    { regex: /\bfix\(.*\):/i, label: "bug fix", suggestion: "regression detection for repeated fixes in same scope" },
    { regex: /\brevert\b/i, label: "revert", suggestion: "revert frequency tracking" },
  ]

  const keywordCounts = new Map<string, number>()
  for (const msg of messages) {
    for (const kp of keywordPatterns) {
      if (kp.regex.test(msg)) keywordCounts.set(kp.label, (keywordCounts.get(kp.label) ?? 0) + 1)
    }
  }
  for (const kp of keywordPatterns) {
    const count = keywordCounts.get(kp.label) ?? 0
    if (count >= 2) patterns.push(`"${kp.label}" appeared in ${count} of last ${messages.length} commits \u2192 Consider: ${kp.suggestion}`)
  }

  const fixScopes = new Map<string, number>()
  for (const msg of messages) {
    const match = msg.match(/^fix\(([^)]+)\):/)
    if (match) fixScopes.set(match[1]!, (fixScopes.get(match[1]!) ?? 0) + 1)
  }
  for (const [scope, count] of fixScopes) {
    if (count >= 2) patterns.push(`fix(${scope}) committed ${count}x \u2192 Repeated fixes in same scope suggest underlying issue`)
  }

  return patterns
}

function analyzeStateFindings(state: State): string[] {
  const insights: string[] = []
  const allFindings = Object.values(state.lastFindings).flat()
  if (allFindings.length === 0) {
    insights.push("No scan results in state.json \u2014 run `bun sop scan --all` first")
    return insights
  }

  // Group by tool, check for always-failing
  const byTool = new Map<string, Finding[]>()
  for (const f of allFindings) {
    const key = `${f.domain}.${f.tool}`
    const list = byTool.get(key) ?? []
    list.push(f)
    byTool.set(key, list)
  }

  for (const [key, findings] of byTool) {
    if (findings.every((f) => f.status === "warn" || f.status === "error")) {
      insights.push(`${key} always fails \u2192 May be misconfigured or permanently broken`)
    }
  }

  return insights
}

function analyzeAntiPatterns(gitLog: string, beadsOutput: string, rulesContent: string): string[] {
  const candidates: string[] = []

  const baselineCount = (gitLog.match(/baseline/gi) ?? []).length
  if (baselineCount >= 3 && !rulesContent.includes("Baseline reset as")) {
    candidates.push(`Baseline reset appeared ${baselineCount}x in recent commits \u2192 Document the baseline-reset anti-pattern`)
  }

  if (beadsOutput.includes("claimed") || beadsOutput.includes("in_progress")) {
    const claimedLines = beadsOutput.split("\n").filter((l) => /claimed|in.progress/i.test(l))
    if (claimedLines.length > 5) {
      candidates.push(`${claimedLines.length} beads in claimed/in-progress state \u2192 Consider stale-claim detection`)
    }
  }

  return candidates
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const program = new Command()
program
  .name("sop")
  .description("SOP \u2014 Standard Operating Procedure orchestrator")
  .addHelpSection("Domains:", DOMAIN_NAMES)
  .addHelpSection("Tools:", `Run 'bun tools/sop-runner.ts --help' for tool list`)
  .addHelpSection("Examples:", [
    ["$ sop scan", "Run due domains"],
    ["$ sop scan --all", "Run all regardless of cadence"],
    ["$ sop scan code", "Just one domain"],
    ["$ sop scan code backlog", "Multiple domains"],
    ["$ sop status", "What's due, last run times"],
    ["$ sop dashboard", "Render last scan results"],
    ["$ sop update", "Propose SOP improvements"],
  ])

program
  .command("scan")
  .description("Run checks for specified domains (or all due)")
  .argument("[domains...]", `Domain(s) to scan (${DOMAIN_NAMES})`)
  .option("--all", "Run all domains regardless of cadence")
  .option("--force", "Bypass tool cache")
  .action(async (domains: string[], opts: { all?: boolean; force?: boolean }) => {
    const state = loadState()
    const domainsToRun = resolveDomains(domains, opts.all ?? false, state)
    await runScan(domainsToRun, state, opts.force ?? false)
  })

program
  .command("status")
  .description("Show what's due, last run times")
  .action(() => {
    renderStatus(loadState())
  })

program
  .command("dashboard")
  .description("Render last scan results")
  .action(() => {
    const state = loadState()
    if (Object.keys(state.lastFindings).length === 0) {
      console.log(`No scan results yet. Run: ${s.bold("bun sop scan")}`)
      return
    }
    renderDashboard(state)
  })

program
  .command("update")
  .description("Analyze session context and propose SOP improvements")
  .action(async () => {
    const state = loadState()
    await runUpdate(state)
  })

program
  .command("help")
  .description("Show help")
  .action(() => {
    program.outputHelp()
  })

if (import.meta.main) {
  program.parseAsync().catch((err: unknown) => {
    log.error?.(err instanceof Error ? err : new Error(String(err)), "fatal error")
    process.exitCode = 1
  })
}
