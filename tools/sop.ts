#!/usr/bin/env bun
/**
 * SOP — Standard Operating Procedure orchestrator
 *
 * Runs maintenance checks across domains, tracks cadence, renders dashboard.
 * Uses @silvery/commander for arg parsing with colorized help.
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
import { createLogger } from "loggily"

// ─── Logging ────────────────────────────────────────────────────────────────

const log = createLogger("sop", [
  { level: "debug" },
  { file: "/tmp/sop.log", format: "json" },
])

// ─── Paths ──────────────────────────────────────────────────────────────────

const REPO_ROOT = join(import.meta.dir, "..")
const STATE_PATH = join(
  REPO_ROOT,
  ".claude",
  "skills",
  "sop",
  "state.json",
)

// ─── Types ──────────────────────────────────────────────────────────────────

type Cadence = "session" | "weekly" | "monthly" | "quarterly"
type Approval = "auto" | "ask"
type Status = "pass" | "warn" | "error"

interface Finding {
  check: string
  domain: string
  status: Status
  summary: string
  details?: string
  durationMs: number
}

interface Check {
  id: string
  domain: string
  label: string
  command: string
  cadence: Cadence
  approval: Approval
  parse: (stdout: string, stderr: string, exitCode: number) => Finding
}

interface DomainDef {
  id: string
  label: string
  cadence: Cadence
  checks: Check[]
}

interface DomainTiming {
  durationMs: number
}

interface Trigger {
  source: { domain: string; check: string; status: Status }
  target: { domain: string; check?: string }  // check optional = run all domain checks
  label: string
}

interface FiredTrigger {
  trigger: Trigger
  sourceCheck: string
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
  if (!existsSync(STATE_PATH)) {
    return { lastRun: {}, lastFindings: {} }
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as State
  } catch {
    return { lastRun: {}, lastFindings: {} }
  }
}

function saveState(state: State): void {
  const dir = dirname(STATE_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n")
}

// ─── Cadence logic ──────────────────────────────────────────────────────────

const CADENCE_MS: Record<Cadence, number> = {
  session: 0, // always due
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
}

function isDue(domain: DomainDef, state: State): boolean {
  const last = state.lastRun[domain.id]
  if (!last) return true
  if (domain.cadence === "session") return true
  const elapsed = Date.now() - new Date(last).getTime()
  return elapsed >= CADENCE_MS[domain.cadence]
}

function nextDueDate(domain: DomainDef, state: State): string | null {
  const last = state.lastRun[domain.id]
  if (!last) return "now"
  if (domain.cadence === "session") return "every session"
  const dueAt = new Date(new Date(last).getTime() + CADENCE_MS[domain.cadence])
  if (dueAt.getTime() <= Date.now()) return "now"
  return dueAt.toISOString().split("T")[0]!
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Common parse helper ────────────────────────────────────────────────────

/**
 * Factory for parsers that follow the common pattern:
 * check exitCode, count matching lines, return pass/warn/error.
 */
function parseByCounting(opts: {
  check: string
  domain: string
  lineFilter: (line: string) => boolean
  passMessage: string
  warnTemplate: (count: number) => string
  errorThreshold?: number
  failMessage?: string
  skipPatterns?: string[]
}): (stdout: string, _: string, exitCode: number) => Finding {
  return (stdout, _, exitCode) => {
    // If exitCode indicates failure and no skip pattern matched, count lines
    if (exitCode !== 0) {
      const skipped = opts.skipPatterns?.some((p) => stdout.includes(p))
      if (skipped) {
        return { check: opts.check, domain: opts.domain, status: "pass", summary: opts.passMessage, durationMs: 0 }
      }
      if (opts.failMessage) {
        return { check: opts.check, domain: opts.domain, status: "warn", summary: opts.failMessage, details: stdout.slice(-300), durationMs: 0 }
      }
    }

    const lines = stdout.trim().split("\n").filter(opts.lineFilter)
    if (lines.length === 0) {
      return { check: opts.check, domain: opts.domain, status: "pass", summary: opts.passMessage, durationMs: 0 }
    }
    const threshold = opts.errorThreshold ?? Infinity
    return {
      check: opts.check,
      domain: opts.domain,
      status: lines.length >= threshold ? "error" : "warn",
      summary: opts.warnTemplate(lines.length),
      details: lines.slice(0, 10).join("\n"),
      durationMs: 0,
    }
  }
}

// ─── Check parsers ──────────────────────────────────────────────────────────

function parseTypecheck(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    const match = stdout.match(/OK \((\d+) errors/)
    const count = match?.[1] ?? "0"
    return {
      check: "typecheck",
      domain: "code",
      status: "pass",
      summary: `baseline clean (${count} known)`,
      durationMs: 0,
    }
  }
  const match = stdout.match(/(\d+) new type error/)
  const count = match?.[1] ?? "?"
  return {
    check: "typecheck",
    domain: "code",
    status: "error",
    summary: `${count} new type error(s) beyond baseline`,
    details: stdout.slice(-500),
    durationMs: 0,
  }
}

function parseLint(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    return { check: "lint", domain: "code", status: "pass", summary: "0 lint errors", durationMs: 0 }
  }
  return {
    check: "lint",
    domain: "code",
    status: "error",
    summary: "lint/format errors found",
    details: stdout.slice(-500),
    durationMs: 0,
  }
}

function parseTestFast(stdout: string, _: string, exitCode: number): Finding {
  // Vitest output: "Tests  N passed" or "Tests  N failed | M passed"
  const passMatch = stdout.match(/Tests\s+(\d+)\s+passed/)
  const failMatch = stdout.match(/(\d+)\s+failed/)
  const passed = passMatch?.[1] ?? "?"
  const failed = failMatch?.[1]

  if (exitCode === 0 && !failed) {
    return { check: "test-fast", domain: "code", status: "pass", summary: `${passed} tests pass`, durationMs: 0 }
  }
  return {
    check: "test-fast",
    domain: "code",
    status: "error",
    summary: `${failed ?? "?"} tests failed (${passed} passed)`,
    details: stdout.slice(-500),
    durationMs: 0,
  }
}

function parseVersionDrift(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0) {
    return {
      check: "version-drift",
      domain: "packages",
      status: "warn",
      summary: "version drift check failed to run",
      details: stdout.slice(-500),
      durationMs: 0,
    }
  }
  const driftLines = stdout
    .split("\n")
    .filter((l) => l.includes("behind") || l.includes("ahead") || l.includes("drift"))
  if (driftLines.length === 0) {
    return { check: "version-drift", domain: "packages", status: "pass", summary: "no version drift detected", durationMs: 0 }
  }
  return {
    check: "version-drift",
    domain: "packages",
    status: "warn",
    summary: `${driftLines.length} package(s) with version drift`,
    details: driftLines.join("\n"),
    durationMs: 0,
  }
}

const parseUnreleased = parseByCounting({
  check: "unreleased",
  domain: "packages",
  lineFilter: (l) => /\+\d+/.test(l) || l.includes("unreleased"),
  passMessage: "all packages released",
  warnTemplate: (n) => `${n} package(s) with unreleased changes`,
  failMessage: "release status check failed to run",
})

function parsePublishability(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    return { check: "publishability", domain: "packages", status: "pass", summary: "all packages publishable", durationMs: 0 }
  }
  const errorLines = stdout
    .split("\n")
    .filter((l) => l.includes("FAIL") || l.includes("WARN") || l.includes("ERROR"))
  return {
    check: "publishability",
    domain: "packages",
    status: errorLines.some((l) => l.includes("FAIL") || l.includes("ERROR"))
      ? "error"
      : "warn",
    summary: `${errorLines.length} publishability issue(s)`,
    details: errorLines.join("\n"),
    durationMs: 0,
  }
}

function parseUntriagedIssues(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0) {
    return {
      check: "untriaged-issues",
      domain: "inbound",
      status: "warn",
      summary: "could not fetch GitHub issues",
      details: stdout.slice(-500),
      durationMs: 0,
    }
  }
  try {
    const issues = JSON.parse(stdout) as Array<{
      number: number
      title: string
      labels: Array<{ name: string }>
    }>
    const untriaged = issues.filter(
      (i) => !i.labels.some((l) => l.name === "triaged"),
    )
    if (untriaged.length === 0) {
      return { check: "untriaged-issues", domain: "inbound", status: "pass", summary: "0 untriaged issues", durationMs: 0 }
    }
    return {
      check: "untriaged-issues",
      domain: "inbound",
      status: "warn",
      summary: `${untriaged.length} untriaged issue(s)`,
      details: untriaged.map((i) => `#${i.number} ${i.title}`).join("\n"),
      durationMs: 0,
    }
  } catch {
    if (stdout.trim() === "[]" || stdout.trim() === "") {
      return { check: "untriaged-issues", domain: "inbound", status: "pass", summary: "0 untriaged issues", durationMs: 0 }
    }
    return {
      check: "untriaged-issues",
      domain: "inbound",
      status: "warn",
      summary: "could not parse GitHub issues response",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
}

function parseNpmAudit(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    return { check: "unpatched-cves", domain: "inbound", status: "pass", summary: "0 CVEs", durationMs: 0 }
  }
  try {
    const audit = JSON.parse(stdout) as {
      metadata?: { vulnerabilities?: Record<string, number> }
    }
    const vulns = audit.metadata?.vulnerabilities
    if (!vulns) {
      return { check: "unpatched-cves", domain: "inbound", status: "pass", summary: "0 CVEs", durationMs: 0 }
    }
    const total = Object.values(vulns).reduce((a, b) => a + b, 0)
    if (total === 0) {
      return { check: "unpatched-cves", domain: "inbound", status: "pass", summary: "0 CVEs", durationMs: 0 }
    }
    const critHigh = (vulns["critical"] ?? 0) + (vulns["high"] ?? 0)
    return {
      check: "unpatched-cves",
      domain: "inbound",
      status: critHigh > 0 ? "error" : "warn",
      summary: `${total} CVE(s) (${critHigh} critical/high)`,
      details: Object.entries(vulns)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
      durationMs: 0,
    }
  } catch {
    return {
      check: "unpatched-cves",
      domain: "inbound",
      status: "warn",
      summary: "npm audit produced non-JSON output",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
}

const parseStaleBeads = parseByCounting({
  check: "stale-beads",
  domain: "backlog",
  lineFilter: (l) => l.trim().length > 0 && !l.includes("No stale"),
  passMessage: "0 stale beads",
  warnTemplate: (n) => `${n} stale bead(s)`,
  failMessage: "bd stale failed to run",
})

const parseOrphanDeps = parseByCounting({
  check: "orphan-deps",
  domain: "backlog",
  lineFilter: (l) => l.trim().length > 0 && !l.includes("No orphan"),
  passMessage: "0 orphan deps",
  warnTemplate: (n) => `${n} orphan dep(s)`,
  failMessage: "bd orphans failed to run",
})

function parsePriorityDrift(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0) {
    return {
      check: "priority-drift",
      domain: "backlog",
      status: "warn",
      summary: "bd list failed to run",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
  const lines = stdout.trim().split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { check: "priority-drift", domain: "backlog", status: "pass", summary: "0 P0/P1 beads", durationMs: 0 }
  }
  return {
    check: "priority-drift",
    domain: "backlog",
    status: lines.length > 5 ? "error" : "warn",
    summary: `${lines.length} open P0/P1 bead(s)`,
    details: lines.slice(0, 10).join("\n"),
    durationMs: 0,
  }
}

const parseLinkCheck = parseByCounting({
  check: "link-check",
  domain: "sites",
  lineFilter: (l) => l.includes("broken") || l.includes("404") || l.includes("FAIL"),
  passMessage: "links OK",
  warnTemplate: (n) => `${n} broken link(s)`,
  skipPatterns: ["not found", "No such"],
})

const parseFreshness = parseByCounting({
  check: "freshness",
  domain: "sites",
  lineFilter: (l) => l.includes("stale") || l.includes("outdated"),
  passMessage: "docs appear fresh",
  warnTemplate: (n) => `${n} stale doc(s)`,
  failMessage: "freshness check failed to run",
})

// ─── V2 check parsers ──────────────────────────────────────────────────────

function parseCveScan(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    return { check: "cve-scan", domain: "security", status: "pass", summary: "0 vulnerabilities", durationMs: 0 }
  }
  try {
    const audit = JSON.parse(stdout) as {
      metadata?: { vulnerabilities?: Record<string, number> }
    }
    const vulns = audit.metadata?.vulnerabilities
    if (!vulns) {
      return { check: "cve-scan", domain: "security", status: "pass", summary: "0 vulnerabilities", durationMs: 0 }
    }
    const critical = vulns["critical"] ?? 0
    const high = vulns["high"] ?? 0
    const moderate = vulns["moderate"] ?? 0
    const total = Object.values(vulns).reduce((a, b) => a + b, 0)
    if (total === 0) {
      return { check: "cve-scan", domain: "security", status: "pass", summary: "0 vulnerabilities", durationMs: 0 }
    }
    if (critical > 0 || high > 0) {
      return {
        check: "cve-scan",
        domain: "security",
        status: "error",
        summary: `${critical} critical, ${high} high, ${moderate} moderate`,
        details: Object.entries(vulns)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", "),
        durationMs: 0,
      }
    }
    return {
      check: "cve-scan",
      domain: "security",
      status: moderate > 0 ? "warn" : "pass",
      summary: `${moderate} moderate vulnerability(ies)`,
      details: Object.entries(vulns)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
      durationMs: 0,
    }
  } catch {
    return {
      check: "cve-scan",
      domain: "security",
      status: "warn",
      summary: "npm audit produced non-JSON output",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
}

const parseSecretScan = parseByCounting({
  check: "secret-scan",
  domain: "security",
  lineFilter: (l) => l.trim().length > 0,
  passMessage: "no secrets detected",
  warnTemplate: (n) => `${n} potential secret(s) found`,
  errorThreshold: 1,
})

function parseLockfileIntegrity(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode === 0) {
    return { check: "lockfile-integrity", domain: "security", status: "pass", summary: "lockfile in sync", durationMs: 0 }
  }
  return {
    check: "lockfile-integrity",
    domain: "security",
    status: "error",
    summary: "lockfile out of sync with package.json",
    details: stdout.slice(-300),
    durationMs: 0,
  }
}

function parseBundleSizes(stdout: string, _: string): Finding {
  const lines = stdout.trim().split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { check: "bundle-sizes", domain: "packaging", status: "pass", summary: "no dist/ directories found", durationMs: 0 }
  }
  const large = lines.filter((l) => {
    const match = l.match(/^([\d.]+)([KMGT]?)/)
    if (!match) return false
    const size = parseFloat(match[1]!)
    const unit = match[2] ?? ""
    if (unit === "M" || unit === "G" || unit === "T") return true
    if (unit === "K" && size > 500) return true
    return false
  })
  return {
    check: "bundle-sizes",
    domain: "packaging",
    status: large.length > 0 ? "warn" : "pass",
    summary: large.length > 0
      ? `${large.length} bundle(s) > 500KB`
      : `${lines.length} bundle(s), all under 500KB`,
    details: lines.join("\n"),
    durationMs: 0,
  }
}

function parseZeroDepCheck(stdout: string): Finding {
  const lines = stdout.trim().split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { check: "zero-dep-check", domain: "packaging", status: "pass", summary: "no vendor packages with dependencies", durationMs: 0 }
  }
  return {
    check: "zero-dep-check",
    domain: "packaging",
    status: "pass",
    summary: `${lines.length} vendor package(s) with dependencies`,
    details: lines.join("\n"),
    durationMs: 0,
  }
}

function parseCjsEsmCompat(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0 && (stdout.includes("not found") || stdout.includes("ERR!"))) {
    return {
      check: "cjs-esm-compat",
      domain: "packaging",
      status: "warn",
      summary: "attw tool not available",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
  const hasProblems = stdout.includes("\u2717") || stdout.includes("problem") || stdout.includes("error")
  return {
    check: "cjs-esm-compat",
    domain: "packaging",
    status: hasProblems ? "warn" : "pass",
    summary: hasProblems ? "CJS/ESM compat issues found" : "CJS/ESM compat OK",
    details: stdout.slice(-500),
    durationMs: 0,
  }
}

function parseCiHealth(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0) {
    return {
      check: "ci-health",
      domain: "infra",
      status: "warn",
      summary: "could not fetch CI runs",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
  try {
    const runs = JSON.parse(stdout) as Array<{
      status: string
      conclusion: string | null
      name: string
    }>
    if (runs.length === 0) {
      return { check: "ci-health", domain: "infra", status: "pass", summary: "no recent CI runs", durationMs: 0 }
    }
    const failed = runs.filter((r) => r.conclusion === "failure")
    const inProgress = runs.filter((r) => r.status === "in_progress")
    if (failed.length > 0) {
      return {
        check: "ci-health",
        domain: "infra",
        status: "error",
        summary: `${failed.length} failed CI run(s)`,
        details: failed.map((r) => `FAIL: ${r.name}`).join("\n"),
        durationMs: 0,
      }
    }
    if (inProgress.length > 0) {
      return {
        check: "ci-health",
        domain: "infra",
        status: "warn",
        summary: `${inProgress.length} CI run(s) in progress`,
        details: inProgress.map((r) => `IN_PROGRESS: ${r.name}`).join("\n"),
        durationMs: 0,
      }
    }
    return { check: "ci-health", domain: "infra", status: "pass", summary: `${runs.length} recent run(s) succeeded`, durationMs: 0 }
  } catch {
    return {
      check: "ci-health",
      domain: "infra",
      status: "warn",
      summary: "could not parse CI runs response",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
}

function parseHookIntegrity(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0) {
    return {
      check: "hook-integrity",
      domain: "infra",
      status: "warn",
      summary: "could not list hooks directory",
      details: stdout.slice(-300),
      durationMs: 0,
    }
  }
  const hasRunHook = stdout.includes("run-hook.sh")
  if (!hasRunHook) {
    return {
      check: "hook-integrity",
      domain: "infra",
      status: "warn",
      summary: "missing expected hook: run-hook.sh",
      details: stdout,
      durationMs: 0,
    }
  }
  const files = stdout.trim().split("\n").filter((l) => l.trim().length > 0)
  return {
    check: "hook-integrity",
    domain: "infra",
    status: "pass",
    summary: `${files.length} hook file(s) present`,
    details: stdout.trim(),
    durationMs: 0,
  }
}

function parseToolVersions(stdout: string): Finding {
  return {
    check: "tool-versions",
    domain: "infra",
    status: "pass",
    summary: "tool versions collected",
    details: stdout.trim().slice(-500),
    durationMs: 0,
  }
}

const parseLicenseFiles = parseByCounting({
  check: "license-files",
  domain: "legal",
  lineFilter: (l) => l.includes("MISSING"),
  passMessage: "all vendor packages have LICENSE files",
  warnTemplate: (n) => `${n} vendor package(s) missing LICENSE`,
})

function parseDepLicenses(stdout: string, _: string, exitCode: number): Finding {
  if (exitCode !== 0 && (stdout.includes("not found") || stdout.includes("ERR!") || stdout.includes("Cannot find"))) {
    return {
      check: "dep-licenses",
      domain: "legal",
      status: "warn",
      summary: "license-checker not installed",
      details: "install with: npx license-checker",
      durationMs: 0,
    }
  }
  const gplLines = stdout.split("\n").filter((l) => /\bGPL(?!.*LGPL)\b/i.test(l) && !/LGPL/i.test(l))
  if (gplLines.length > 0) {
    return {
      check: "dep-licenses",
      domain: "legal",
      status: "warn",
      summary: `GPL license found in ${gplLines.length} production dep(s)`,
      details: stdout.slice(-500),
      durationMs: 0,
    }
  }
  return {
    check: "dep-licenses",
    domain: "legal",
    status: "pass",
    summary: "license distribution OK",
    details: stdout.slice(-500),
    durationMs: 0,
  }
}

// ─── Domain definitions ─────────────────────────────────────────────────────

export const DOMAINS: DomainDef[] = [
  {
    id: "code",
    label: "code",
    cadence: "session",
    checks: [
      {
        id: "typecheck",
        domain: "code",
        label: "typecheck",
        command: "bash infra/typecheck/check.sh",
        cadence: "session",
        approval: "auto",
        parse: parseTypecheck,
      },
      {
        id: "lint",
        domain: "code",
        label: "lint",
        command: "bun fix 2>&1",
        cadence: "session",
        approval: "auto",
        parse: parseLint,
      },
      {
        id: "test-fast",
        domain: "code",
        label: "test-fast",
        command: "bun run test:fast 2>&1 | tail -30",
        cadence: "session",
        approval: "auto",
        parse: parseTestFast,
      },
    ],
  },
  {
    id: "packages",
    label: "packages",
    cadence: "monthly",
    checks: [
      {
        id: "version-drift",
        domain: "packages",
        label: "version drift",
        command: "bun npm-registry audit 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parseVersionDrift,
      },
      {
        id: "unreleased",
        domain: "packages",
        label: "unreleased",
        command: "bun release status 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parseUnreleased,
      },
      {
        id: "publishability",
        domain: "packages",
        label: "publishability",
        command: "bun infra/audit-packages.ts 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parsePublishability,
      },
    ],
  },
  {
    id: "inbound",
    label: "inbound",
    cadence: "weekly",
    checks: [
      {
        id: "untriaged-issues",
        domain: "inbound",
        label: "untriaged issues",
        command:
          "gh issue list --repo beorn/km --state open --json number,title,labels --limit 50 2>&1",
        cadence: "weekly",
        approval: "auto",
        parse: parseUntriagedIssues,
      },
      {
        id: "unpatched-cves",
        domain: "inbound",
        label: "unpatched CVEs",
        command: "bun pm audit --json 2>&1 || echo '{}'",
        cadence: "weekly",
        approval: "auto",
        parse: parseNpmAudit,
      },
    ],
  },
  {
    id: "backlog",
    label: "backlog",
    cadence: "weekly",
    checks: [
      {
        id: "stale-beads",
        domain: "backlog",
        label: "stale beads",
        command: "bd stale 2>&1",
        cadence: "weekly",
        approval: "auto",
        parse: parseStaleBeads,
      },
      {
        id: "orphan-deps",
        domain: "backlog",
        label: "orphan deps",
        command: "bd orphans 2>&1",
        cadence: "weekly",
        approval: "auto",
        parse: parseOrphanDeps,
      },
      {
        id: "priority-drift",
        domain: "backlog",
        label: "P0/P1 drift",
        command: "bd list --status=open --priority=0 --priority=1 2>&1",
        cadence: "weekly",
        approval: "auto",
        parse: parsePriorityDrift,
      },
    ],
  },
  {
    id: "sites",
    label: "sites",
    cadence: "monthly",
    checks: [
      {
        id: "link-check",
        domain: "sites",
        label: "link check",
        command:
          "ls scripts/check-site-links.sh 2>&1 && bash scripts/check-site-links.sh 2>&1 || echo 'not found'",
        cadence: "monthly",
        approval: "auto",
        parse: parseLinkCheck,
      },
      {
        id: "freshness",
        domain: "sites",
        label: "doc freshness",
        command: [
          "for pkg in vendor/silvery vendor/flexily vendor/vterm vendor/ansi vendor/mdspec; do",
          "  if [ -d \"$pkg\" ]; then",
          "    name=$(basename $pkg)",
          "    doc_date=$(git log -1 --format=%ci -- \"$pkg/docs\" \"$pkg/README.md\" 2>/dev/null || echo 'never')",
          "    pkg_date=$(git log -1 --format=%ci -- \"$pkg/package.json\" 2>/dev/null || echo 'never')",
          "    echo \"$name docs=$doc_date pkg=$pkg_date\"",
          "    if [ \"$pkg_date\" \\> \"$doc_date\" ] 2>/dev/null; then",
          "      echo \"  stale: $name docs older than package changes\"",
          "    fi",
          "  fi",
          "done",
        ].join("\n"),
        cadence: "monthly",
        approval: "auto",
        parse: parseFreshness,
      },
    ],
  },
  {
    id: "security",
    label: "security",
    cadence: "weekly",
    checks: [
      {
        id: "cve-scan",
        domain: "security",
        label: "CVE scan",
        command: "bun pm audit --json 2>&1 || echo '{}'",
        cadence: "weekly",
        approval: "auto",
        parse: parseCveScan,
      },
      {
        id: "secret-scan",
        domain: "security",
        label: "secret scan",
        command:
          'grep -rn "sk-[a-zA-Z0-9]\\{20,\\}\\|AKIA[A-Z0-9]\\{16\\}\\|ghp_[a-zA-Z0-9]\\{36\\}\\|gho_[a-zA-Z0-9]\\{36\\}\\|-----BEGIN.*PRIVATE KEY" --include="*.ts" --include="*.js" --include="*.json" --include="*.env" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.beads . 2>&1',
        cadence: "weekly",
        approval: "auto",
        parse: parseSecretScan,
      },
      {
        id: "lockfile-integrity",
        domain: "security",
        label: "lockfile integrity",
        command: "bun install --frozen-lockfile --dry-run 2>&1",
        cadence: "weekly",
        approval: "auto",
        parse: parseLockfileIntegrity,
      },
    ],
  },
  {
    id: "packaging",
    label: "packaging",
    cadence: "monthly",
    checks: [
      {
        id: "bundle-sizes",
        domain: "packaging",
        label: "bundle sizes",
        command: "for d in vendor/*/; do [ -f \"$d/package.json\" ] && grep -q '\"private\"' \"$d/package.json\" 2>/dev/null && continue; name=$(basename \"$d\"); js=$(find \"$d/dist\" -name '*.mjs' -o -name '*.js' 2>/dev/null | xargs cat 2>/dev/null | wc -c); echo \"$((js/1024))K\\t$name\"; done | sort -rn",
        cadence: "monthly",
        approval: "auto",
        parse: parseBundleSizes,
      },
      {
        id: "zero-dep-check",
        domain: "packaging",
        label: "zero-dep check",
        command: 'grep -l \'"dependencies"\' vendor/*/package.json 2>/dev/null',
        cadence: "monthly",
        approval: "auto",
        parse: parseZeroDepCheck,
      },
      {
        id: "cjs-esm-compat",
        domain: "packaging",
        label: "CJS/ESM compat",
        command: "bunx --bun @arethetypeswrong/cli --pack vendor/silvery 2>&1 | tail -20",
        cadence: "monthly",
        approval: "auto",
        parse: parseCjsEsmCompat,
      },
    ],
  },
  {
    id: "infra",
    label: "infra",
    cadence: "monthly",
    checks: [
      {
        id: "ci-health",
        domain: "infra",
        label: "CI health",
        command: "gh run list --repo beorn/km --limit 5 --json status,conclusion,name 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parseCiHealth,
      },
      {
        id: "hook-integrity",
        domain: "infra",
        label: "hook integrity",
        command: "ls .claude/hooks/ 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parseHookIntegrity,
      },
      {
        id: "tool-versions",
        domain: "infra",
        label: "tool versions",
        command: "echo '--- tsdown ---' && bunx tsdown --version 2>&1; echo '--- oxlint ---' && bunx oxlint --version 2>&1; echo '--- bun ---' && bun --version 2>&1",
        cadence: "monthly",
        approval: "auto",
        parse: parseToolVersions,
      },
    ],
  },
  {
    id: "legal",
    label: "legal",
    cadence: "quarterly",
    checks: [
      {
        id: "license-files",
        domain: "legal",
        label: "LICENSE files",
        command:
          'for d in vendor/*/; do [ -f "$d/LICENSE" ] || echo "MISSING: $d"; done 2>&1',
        cadence: "quarterly",
        approval: "auto",
        parse: parseLicenseFiles,
      },
      {
        id: "dep-licenses",
        domain: "legal",
        label: "dep licenses",
        command: "npx license-checker --production --summary 2>&1 | head -30",
        cadence: "quarterly",
        approval: "auto",
        parse: parseDepLicenses,
      },
    ],
  },
]

const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]))

// ─── Cross-domain triggers ─────────────────────────────────────────────────

const TRIGGERS: Trigger[] = [
  { source: { domain: "code", check: "typecheck", status: "error" }, target: { domain: "packages", check: "publishability" }, label: "type errors may affect publishability" },
  { source: { domain: "code", check: "test-fast", status: "error" }, target: { domain: "backlog" }, label: "test failures may need beads" },
  { source: { domain: "packages", check: "unreleased", status: "warn" }, target: { domain: "sites", check: "freshness" }, label: "unreleased changes may make docs stale" },
  { source: { domain: "security", check: "cve-scan", status: "error" }, target: { domain: "packages" }, label: "CVEs may need patch releases" },
  { source: { domain: "backlog", check: "priority-drift", status: "error" }, target: { domain: "inbound" }, label: "P0/P1 drift may indicate untriaged issues" },
]

function evaluateTriggers(allFindings: Finding[]): FiredTrigger[] {
  const fired: FiredTrigger[] = []
  for (const trigger of TRIGGERS) {
    const match = allFindings.find(
      (f) =>
        f.domain === trigger.source.domain &&
        f.check === trigger.source.check &&
        f.status === trigger.source.status,
    )
    if (match) {
      fired.push({
        trigger,
        sourceCheck: match.check,
        sourceDomain: match.domain,
      })
    }
  }
  return fired
}

// ─── Run a check ────────────────────────────────────────────────────────────

async function runCheck(check: Check): Promise<Finding> {
  const start = performance.now()
  try {
    using checkSpan = log.span!("check", { id: check.id })

    const proc = Bun.spawn(["bash", "-c", check.command], {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    const durationMs = performance.now() - start
    const finding = { ...check.parse(stdout, stderr, exitCode), durationMs }

    log.debug?.("check complete", { check: check.id, status: finding.status, summary: finding.summary })
    checkSpan.spanData.status = finding.status

    return finding
  } catch (err) {
    const durationMs = performance.now() - start
    log.error?.(err instanceof Error ? err : new Error(String(err)), "check execution failed", { check: check.id })
    return {
      check: check.id,
      domain: check.domain,
      status: "error",
      summary: `failed to execute: ${err instanceof Error ? err.message : String(err)}`,
      durationMs,
    }
  }
}

// ─── Run a domain ───────────────────────────────────────────────────────────

async function runDomain(domain: DomainDef): Promise<{ findings: Finding[]; durationMs: number }> {
  const domainStart = performance.now()
  using domainSpan = log.span!("domain", { id: domain.id })

  const findings: Finding[] = []
  for (const check of domain.checks) {
    process.stderr.write(`  running ${domain.id}.${check.id}...`)
    const finding = await runCheck(check)
    process.stderr.write(`${statusLabel(finding.status)} (${formatDuration(finding.durationMs)})\n`)
    findings.push(finding)
  }

  const domainDurationMs = performance.now() - domainStart
  domainSpan.spanData.checkCount = findings.length

  return { findings, durationMs: domainDurationMs }
}

// ─── Dashboard rendering ────────────────────────────────────────────────────

/** Unicode icon for dashboard output */
function statusIcon(status: Status): string {
  switch (status) {
    case "pass":
      return "\u2713"
    case "warn":
      return "\u26A0"
    case "error":
      return "\u2717"
  }
}

/** Plain-text label for progress output (stderr) */
function statusLabel(status: Status): string {
  switch (status) {
    case "pass":
      return " ok"
    case "warn":
      return " warn"
    case "error":
      return " FAIL"
  }
}

function domainSummary(domainId: string, findings: Finding[], domainTiming?: DomainTiming): string {
  if (findings.length === 0) return "\u2014 no results"

  const worst: Status = findings.some((f) => f.status === "error")
    ? "error"
    : findings.some((f) => f.status === "warn")
      ? "warn"
      : "pass"

  const icon = statusIcon(worst)
  const summaries = findings
    .map((f) => {
      const dur = f.durationMs > 0 ? ` (${formatDuration(f.durationMs)})` : ""
      return `${f.summary}${dur}`
    })
    .join(", ")
  const domainDur = domainTiming ? `  [${formatDuration(domainTiming.durationMs)}]` : ""
  return `${icon} ${summaries}${domainDur}`
}

function renderDashboard(state: State): void {
  const now = new Date()
  const dateStr = now.toISOString().split("T")[0]

  console.log()
  console.log(`SOP Report \u2014 ${dateStr}`)
  console.log()

  // Determine column width for domain names
  const maxLen = Math.max(...DOMAINS.map((d) => d.id.length))

  for (const domain of DOMAINS) {
    const padded = domain.id.padEnd(maxLen)
    const findings = state.lastFindings[domain.id]
    if (!findings || findings.length === 0) {
      const lastRun = state.lastRun[domain.id]
      if (lastRun) {
        console.log(`  ${padded}    \u2014 last run ${lastRun.split("T")[0]}`)
      } else {
        console.log(`  ${padded}    \u2014 never run`)
      }
    } else {
      const domainTiming = state.lastDomainTimings?.[domain.id]
      const summary = domainSummary(domain.id, findings, domainTiming)
      console.log(`  ${padded}    ${summary}`)
    }
  }

  // Totals
  const allFindings = Object.values(state.lastFindings).flat()
  const warns = allFindings.filter((f) => f.status === "warn").length
  const errors = allFindings.filter((f) => f.status === "error").length

  console.log()
  console.log(`  Findings: ${warns} warn, ${errors} error`)

  if (state.lastScanDurationMs != null) {
    console.log(`  Total scan time: ${formatDuration(state.lastScanDurationMs)}`)
  }

  // Triggered cross-domain checks
  if (state.lastFiredTriggers && state.lastFiredTriggers.length > 0) {
    console.log()
    console.log("  Triggers fired:")
    for (const ft of state.lastFiredTriggers) {
      const targetStr = ft.trigger.target.check
        ? `${ft.trigger.target.domain}.${ft.trigger.target.check}`
        : ft.trigger.target.domain
      console.log(
        `    ${ft.sourceDomain}.${ft.sourceCheck} ${ft.trigger.source.status} -> ${targetStr} (${ft.trigger.label})`,
      )
    }
  }

  // Next due
  const dueDomains = DOMAINS.filter((d) => !isDue(d, state))
    .map((d) => {
      const next = nextDueDate(d, state)
      return { id: d.id, next }
    })
    .filter((d) => d.next && d.next !== "now" && d.next !== "every session")
    .sort((a, b) => (a.next! < b.next! ? -1 : 1))

  if (dueDomains.length > 0) {
    const nextStr = dueDomains
      .slice(0, 3)
      .map((d) => `${d.id} (${d.next})`)
      .join(", ")
    console.log(`  Next due: ${nextStr}`)
  }

  console.log()

  // Details for non-pass findings
  const nonPass = allFindings.filter((f) => f.status !== "pass" && f.details)
  if (nonPass.length > 0) {
    console.log("  Details:")
    for (const f of nonPass) {
      console.log(`    ${f.domain}.${f.check}: ${f.details?.split("\n").slice(0, 3).join("\n      ")}`)
    }
    console.log()
  }
}

// ─── Status command ─────────────────────────────────────────────────────────

function renderStatus(state: State): void {
  console.log()
  console.log("SOP Domain Status")
  console.log()

  const maxLen = Math.max(...DOMAINS.map((d) => d.id.length))

  for (const domain of DOMAINS) {
    const padded = domain.id.padEnd(maxLen)
    const due = isDue(domain, state)
    const lastRun = state.lastRun[domain.id]
    const lastStr = lastRun ? lastRun.split("T")[0] : "never"
    const next = nextDueDate(domain, state)
    const dueTag = due ? " [DUE]" : ""

    console.log(
      `  ${padded}    cadence=${domain.cadence.padEnd(9)}  last=${lastStr!}  next=${next!}${dueTag}`,
    )
  }

  console.log()
}

// ─── Update analysis ───────────────────────────────────────────────────────

interface UpdateProposal {
  file: string
  description: string
}

/**
 * Gather context from git log, beads, state, and _sop-rules.md,
 * then heuristically analyze for improvement opportunities.
 */
async function runUpdate(state: State, _apply: boolean): Promise<void> {
  const dateStr = new Date().toISOString().split("T")[0]

  // 1. Gather context in parallel
  const [gitLogResult, beadsResult, rulesContent] = await Promise.all([
    runShell("git log --oneline -20"),
    runShell("bd list --status=open --limit 20 2>&1"),
    Promise.resolve(readFileSafe(join(REPO_ROOT, ".claude", "skills", "sop", "_sop-rules.md"))),
  ])

  // 2. Analyze git log for maintenance patterns
  const commitPatterns = analyzeCommitPatterns(gitLogResult.stdout)

  // 3. Analyze state.json findings for false positives, always-pass, always-fail
  const stateInsights = analyzeStateFindings(state)

  // 4. Analyze anti-pattern table coverage
  const antiPatternCandidates = analyzeAntiPatterns(
    gitLogResult.stdout,
    beadsResult.stdout,
    rulesContent,
  )

  // 5. Analyze for missing checks
  const missingChecks = analyzeMissingChecks(gitLogResult.stdout, state)

  // 6. Produce structured report
  console.log()
  console.log(`SOP Update Analysis \u2014 ${dateStr}`)

  if (commitPatterns.length > 0) {
    console.log()
    console.log("  Recent maintenance patterns:")
    for (const p of commitPatterns) {
      console.log(`    - ${p}`)
    }
  }

  if (antiPatternCandidates.length > 0) {
    console.log()
    console.log("  Anti-pattern candidates:")
    for (const a of antiPatternCandidates) {
      console.log(`    - ${a}`)
    }
  }

  if (stateInsights.length > 0) {
    console.log()
    console.log("  State insights:")
    for (const s of stateInsights) {
      console.log(`    - ${s}`)
    }
  }

  if (missingChecks.length > 0) {
    console.log()
    console.log("  Missing checks:")
    for (const m of missingChecks) {
      console.log(`    - ${m}`)
    }
  }

  // Collect all proposals
  const proposals: UpdateProposal[] = []

  for (const a of antiPatternCandidates) {
    proposals.push({ file: "_sop-rules.md", description: `Add anti-pattern: ${a}` })
  }
  for (const m of missingChecks) {
    proposals.push({ file: "tools/sop.ts", description: `Add check: ${m}` })
  }
  for (const s of stateInsights) {
    if (s.includes("always fail") || s.includes("always error")) {
      proposals.push({ file: "tools/sop.ts", description: `Review: ${s}` })
    }
  }

  if (proposals.length > 0) {
    console.log()
    console.log("  Proposed changes:")
    for (let i = 0; i < proposals.length; i++) {
      console.log(`    ${i + 1}. [${proposals[i]!.file}] ${proposals[i]!.description}`)
    }
  }

  if (
    commitPatterns.length === 0 &&
    antiPatternCandidates.length === 0 &&
    stateInsights.length === 0 &&
    missingChecks.length === 0
  ) {
    console.log()
    console.log("  No improvements identified. SOP checks look healthy.")
  }

  if (_apply) {
    console.log()
    console.log("  --apply is reserved for future use (auto-writing proposed changes).")
    console.log("  For now, apply proposed changes manually.")
  }

  console.log()
}

/** Run a shell command and capture output */
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

/** Read a file, return empty string if missing */
function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return ""
  }
}

/** Analyze git log for repeated maintenance patterns */
function analyzeCommitPatterns(gitLog: string): string[] {
  const patterns: string[] = []
  const lines = gitLog.trim().split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) return patterns

  // Extract commit messages (strip leading hash)
  const messages = lines.map((l) => l.replace(/^[a-f0-9]+\s+/, ""))

  // Count keyword frequencies
  const keywordCounts = new Map<string, number>()
  const keywordPatterns: Array<{ regex: RegExp; label: string; suggestion: string }> = [
    { regex: /\btypecheck\s*baseline\b/i, label: "typecheck baseline", suggestion: "auto-baseline check in code domain" },
    { regex: /\bnpm\s+publish\b/i, label: "npm publish", suggestion: "unreleased packages check (packages domain)" },
    { regex: /\bbaseline\b/i, label: "baseline update", suggestion: "baseline-reset anti-pattern detection" },
    { regex: /\bbun\.lock\b/i, label: "bun.lock update", suggestion: "lockfile consistency check" },
    { regex: /\bvendor\b/i, label: "vendor update", suggestion: "submodule state tracking" },
    { regex: /\bfix\(.*\):/i, label: "bug fix", suggestion: "regression detection for repeated fixes in same scope" },
    { regex: /\bhotfix\b/i, label: "hotfix", suggestion: "hot-fix frequency tracking" },
    { regex: /\brevert\b/i, label: "revert", suggestion: "revert frequency tracking" },
    { regex: /\bskip\b/i, label: "skip", suggestion: "skipped check tracking" },
  ]

  for (const msg of messages) {
    for (const kp of keywordPatterns) {
      if (kp.regex.test(msg)) {
        keywordCounts.set(kp.label, (keywordCounts.get(kp.label) ?? 0) + 1)
      }
    }
  }

  // Report patterns appearing 2+ times
  for (const kp of keywordPatterns) {
    const count = keywordCounts.get(kp.label) ?? 0
    if (count >= 2) {
      patterns.push(
        `"${kp.label}" appeared in ${count} of last ${messages.length} commits \u2192 Consider: ${kp.suggestion}`,
      )
    }
  }

  // Check for npm commands in a bun project
  const npmUsage = messages.filter((m) => /\bnpm\s+(install|audit|run|test)\b/i.test(m))
  if (npmUsage.length > 0) {
    patterns.push(
      `npm commands found in ${npmUsage.length} commit message(s) \u2192 This is a bun project; ensure bun equivalents are used`,
    )
  }

  // Check for repeated scopes in fix() commits
  const fixScopes = new Map<string, number>()
  for (const msg of messages) {
    const match = msg.match(/^fix\(([^)]+)\):/)
    if (match) {
      const scope = match[1]!
      fixScopes.set(scope, (fixScopes.get(scope) ?? 0) + 1)
    }
  }
  for (const [scope, count] of fixScopes) {
    if (count >= 2) {
      patterns.push(
        `fix(${scope}) committed ${count}x \u2192 Repeated fixes in same scope suggest underlying issue`,
      )
    }
  }

  return patterns
}

/** Analyze state.json findings for issues */
function analyzeStateFindings(state: State): string[] {
  const insights: string[] = []

  // Check for checks that always pass across all domains
  const allFindings = Object.values(state.lastFindings).flat()
  if (allFindings.length === 0) {
    insights.push("No scan results in state.json \u2014 run `bun sop scan --all` first")
    return insights
  }

  // Group findings by check id
  const byCheck = new Map<string, Finding[]>()
  for (const f of allFindings) {
    const key = `${f.domain}.${f.check}`
    const list = byCheck.get(key) ?? []
    list.push(f)
    byCheck.set(key, list)
  }

  // Look for checks that always error (may be misconfigured)
  for (const [key, findings] of byCheck) {
    if (findings.every((f) => f.status === "error")) {
      const summary = findings[0]?.summary ?? ""
      insights.push(
        `${key} always fails ("${summary}") \u2192 May be misconfigured or permanently broken`,
      )
    }
  }

  // Look for findings with "skipped" or "not found" in summary (false pass)
  for (const f of allFindings) {
    if (
      f.status === "pass" &&
      (/\bskip/i.test(f.summary) || /\bnot found\b/i.test(f.summary) || /\bnot available\b/i.test(f.summary))
    ) {
      insights.push(
        `${f.domain}.${f.check} reported pass but summary says "${f.summary}" \u2192 Distinguish skipped from passed`,
      )
    }
  }

  // Look for checks with "failed to run" in summary
  for (const f of allFindings) {
    if (/failed to run/i.test(f.summary)) {
      insights.push(
        `${f.domain}.${f.check}: "${f.summary}" \u2192 Check command may need updating`,
      )
    }
  }

  return insights
}

/** Analyze for potential new anti-patterns */
function analyzeAntiPatterns(
  gitLog: string,
  beadsOutput: string,
  rulesContent: string,
): string[] {
  const candidates: string[] = []

  // Check if npm audit is being used in a bun project without noting it
  if (
    gitLog.includes("npm audit") &&
    !rulesContent.includes("npm audit in non-npm project") &&
    !rulesContent.includes("npm audit in bun")
  ) {
    candidates.push(
      'npm audit used in bun project \u2192 Add to _sop-rules.md anti-pattern table',
    )
  }

  // Check if "baseline" appears heavily in git log (baseline-reset pattern)
  const baselineCount = (gitLog.match(/baseline/gi) ?? []).length
  if (baselineCount >= 3) {
    const alreadyDocumented = rulesContent.includes("Baseline reset as")
    if (!alreadyDocumented) {
      candidates.push(
        `Baseline reset appeared ${baselineCount}x in recent commits \u2192 Document the baseline-reset anti-pattern`,
      )
    }
  }

  // Check if beads output shows stale claimed beads (claimed but no activity)
  if (beadsOutput.includes("claimed") || beadsOutput.includes("in_progress")) {
    const claimedLines = beadsOutput
      .split("\n")
      .filter((l) => /claimed|in.progress/i.test(l))
    if (claimedLines.length > 5) {
      candidates.push(
        `${claimedLines.length} beads in claimed/in-progress state \u2192 Consider stale-claim detection`,
      )
    }
  }

  return candidates
}

/** Analyze for missing checks */
function analyzeMissingChecks(gitLog: string, state: State): string[] {
  const missing: string[] = []

  // Check if we have submodule checks
  const hasSubmoduleCheck = DOMAINS.some((d) =>
    d.checks.some((c) => c.id.includes("submodule") || c.command.includes("submodule")),
  )
  if (!hasSubmoduleCheck && gitLog.includes("vendor")) {
    missing.push(
      "No check for submodule state (vendor/* clean/dirty)",
    )
  }

  // Check if we track bun.lock consistency beyond lockfile-integrity
  const hasLockConsistency = DOMAINS.some((d) =>
    d.checks.some((c) => c.command.includes("bun.lock") || c.id === "lockfile-integrity"),
  )
  if (!hasLockConsistency) {
    missing.push(
      "No check for bun.lock consistency (lockfile matches package.json)",
    )
  }

  // Check for git worktree state check
  const hasWorktreeCheck = DOMAINS.some((d) =>
    d.checks.some((c) => c.id.includes("worktree") || c.command.includes("worktree")),
  )
  if (!hasWorktreeCheck) {
    missing.push(
      "No check for leftover git worktrees",
    )
  }

  // Check if any domain in state had findings with "non-JSON output" (suggests wrong tool)
  const allFindings = Object.values(state.lastFindings).flat()
  const jsonParseFailures = allFindings.filter((f) =>
    /non-JSON/i.test(f.summary) || /could not parse/i.test(f.summary),
  )
  if (jsonParseFailures.length > 0) {
    for (const f of jsonParseFailures) {
      missing.push(
        `${f.domain}.${f.check} produces unparseable output \u2192 Fix parser or switch to structured output`,
      )
    }
  }

  return missing
}

// ─── CLI ────────────────────────────────────────────────────────────────────

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

async function runScan(domainsToRun: DomainDef[], state: State): Promise<void> {
  if (domainsToRun.length === 0) {
    console.log("No domains due for scanning.")
    renderStatus(state)
    return
  }

  console.error(
    `Scanning ${domainsToRun.length} domain(s): ${domainsToRun.map((d) => d.id).join(", ")}`,
  )
  console.error()

  const scanStart = performance.now()
  state.lastDomainTimings ??= {}

  for (const domain of domainsToRun) {
    console.error(`[${domain.id}]`)
    const { findings, durationMs } = await runDomain(domain)
    state.lastRun[domain.id] = new Date().toISOString()
    state.lastFindings[domain.id] = findings
    state.lastDomainTimings[domain.id] = { durationMs }
  }

  // ── Cross-domain triggers (depth = 1, no cascading) ──
  const scannedDomains = new Set(domainsToRun.map((d) => d.id))
  const allFindings = domainsToRun.flatMap((d) => state.lastFindings[d.id] ?? [])
  const firedTriggers = evaluateTriggers(allFindings)

  if (firedTriggers.length > 0) {
    console.error()
    console.error("Cross-domain triggers:")

    for (const ft of firedTriggers) {
      const targetDomainId = ft.trigger.target.domain
      const targetCheck = ft.trigger.target.check
      const tag = targetCheck
        ? `${ft.sourceDomain}.${ft.sourceCheck} ${ft.trigger.source.status} -> ${targetDomainId}.${targetCheck}`
        : `${ft.sourceDomain}.${ft.sourceCheck} ${ft.trigger.source.status} -> ${targetDomainId}`
      console.error(`  [triggered: ${tag}] ${ft.trigger.label}`)

      if (scannedDomains.has(targetDomainId)) continue // already scanned, skip

      const targetDomain = DOMAIN_MAP.get(targetDomainId)
      if (!targetDomain) continue

      scannedDomains.add(targetDomainId)

      if (targetCheck) {
        // Run only the specific triggered check
        const check = targetDomain.checks.find((c) => c.id === targetCheck)
        if (check) {
          console.error(`[${targetDomainId} (triggered)]`)
          process.stderr.write(`  running ${targetDomainId}.${check.id}...`)
          const checkStart = performance.now()
          const finding = await runCheck(check)
          const icon = statusLabel(finding.status)
          process.stderr.write(`${icon} (${formatDuration(finding.durationMs)})\n`)
          const durationMs = performance.now() - checkStart
          state.lastRun[targetDomainId] = new Date().toISOString()
          state.lastFindings[targetDomainId] = [
            ...(state.lastFindings[targetDomainId] ?? []).filter((f) => f.check !== targetCheck),
            finding,
          ]
          state.lastDomainTimings[targetDomainId] = { durationMs }
        }
      } else {
        // Run all checks in the target domain
        console.error(`[${targetDomainId} (triggered)]`)
        const { findings, durationMs } = await runDomain(targetDomain)
        state.lastRun[targetDomainId] = new Date().toISOString()
        state.lastFindings[targetDomainId] = findings
        state.lastDomainTimings[targetDomainId] = { durationMs }
      }
    }
  }

  state.lastFiredTriggers = firedTriggers.length > 0 ? firedTriggers : undefined
  state.lastScanDurationMs = performance.now() - scanStart
  saveState(state)
  renderDashboard(state)
}

const program = new Command()
program
  .name("sop")
  .description("SOP — Standard Operating Procedure orchestrator")
  .addHelpSection("Domains", DOMAIN_NAMES)
  .addHelpSection("Examples", `
  $ bun sop scan              Run due domains
  $ bun sop scan --all        Run all regardless of cadence
  $ bun sop scan code         Just one domain
  $ bun sop scan code backlog Multiple domains
  $ bun sop status            What's due, last run times
  $ bun sop dashboard         Render last scan results
  $ bun sop update            Propose SOP improvements`)

program
  .command("scan")
  .description("Run checks for specified domains (or all due)")
  .argument("[domains...]", `Domain(s) to scan (${DOMAIN_NAMES})`)
  .option("--all", "Run all domains regardless of cadence")
  .action(async (domains: string[], opts: { all?: boolean }) => {
    const state = loadState()
    const domainsToRun = resolveDomains(domains, opts.all ?? false, state)
    await runScan(domainsToRun, state)
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
      console.log("No scan results yet. Run: bun sop scan")
      return
    }
    renderDashboard(state)
  })

program
  .command("update")
  .description("Analyze session context and propose SOP improvements")
  .option("--apply", "(future) Auto-write proposed changes")
  .action(async (opts: { apply?: boolean }) => {
    const state = loadState()
    await runUpdate(state, opts.apply ?? false)
  })

program.parseAsync().catch((err: unknown) => {
  log.error?.(err instanceof Error ? err : new Error(String(err)), "fatal error")
  process.exitCode = 1
})
