#!/usr/bin/env bun
/**
 * SOP — Standard Operating Procedure orchestrator
 *
 * Runs maintenance checks across domains, tracks cadence, renders dashboard.
 *
 * Usage:
 *   bun sop scan              # Run due domains
 *   bun sop scan --all        # Run all regardless of cadence
 *   bun sop scan code         # Just one domain
 *   bun sop scan code backlog # Multiple domains
 *   bun sop status            # What's due, last run times
 *   bun sop dashboard         # Render last scan results
 */

import { parseArgs } from "node:util"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
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

interface State {
  lastRun: Record<string, string>
  lastFindings: Record<string, Finding[]>
  lastDomainTimings?: Record<string, DomainTiming>
  lastScanDurationMs?: number
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
    const icon =
      finding.status === "pass"
        ? " ok"
        : finding.status === "warn"
          ? " warn"
          : " FAIL"
    process.stderr.write(`${icon} (${formatDuration(finding.durationMs)})\n`)
    findings.push(finding)
  }

  const domainDurationMs = performance.now() - domainStart
  domainSpan.spanData.checkCount = findings.length

  return { findings, durationMs: domainDurationMs }
}

// ─── Dashboard rendering ────────────────────────────────────────────────────

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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      all: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  })

  const command = positionals[0] ?? "help"
  const domainArgs = positionals.slice(1)

  if (values.help || command === "help") {
    console.log(`Usage: bun sop <command> [domains...] [options]

Commands:
  scan [domain...]   Run checks for specified domains (or all due)
  scan --all         Run all domains regardless of cadence
  status             Show what's due, last run times
  dashboard          Render last scan results
  help               Show this help

Domains: ${DOMAINS.map((d) => d.id).join(", ")}

Examples:
  bun sop scan              # Run due domains
  bun sop scan --all        # Run all
  bun sop scan code         # Just code domain
  bun sop scan code backlog # Multiple domains
  bun sop status            # What's due
  bun sop dashboard         # Last results`)
    return
  }

  const state = loadState()

  switch (command) {
    case "scan": {
      let domainsToRun: DomainDef[]

      if (domainArgs.length > 0) {
        // Specific domains requested
        domainsToRun = []
        for (const arg of domainArgs) {
          const domain = DOMAIN_MAP.get(arg)
          if (!domain) {
            console.error(`Unknown domain: ${arg}`)
            console.error(
              `Available: ${DOMAINS.map((d) => d.id).join(", ")}`,
            )
            process.exit(1)
          }
          domainsToRun.push(domain)
        }
      } else if (values.all) {
        domainsToRun = DOMAINS
      } else {
        // Only due domains
        domainsToRun = DOMAINS.filter((d) => isDue(d, state))
      }

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

      state.lastScanDurationMs = performance.now() - scanStart
      saveState(state)
      renderDashboard(state)
      break
    }

    case "status": {
      renderStatus(state)
      break
    }

    case "dashboard": {
      if (Object.keys(state.lastFindings).length === 0) {
        console.log("No scan results yet. Run: bun sop scan")
        return
      }
      renderDashboard(state)
      break
    }

    default: {
      console.error(`Unknown command: ${command}`)
      console.error("Run: bun sop help")
      process.exit(1)
    }
  }
}

main().catch((err: unknown) => {
  console.error("Fatal:", err)
  process.exit(1)
})
