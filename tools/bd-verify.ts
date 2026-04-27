#!/usr/bin/env bun
/**
 * bd-verify — execute a bead's acceptance criteria as commands, report pass/fail.
 *
 * Phase 1 (this file): parser + executor only. Does NOT integrate with `bd close`
 * (multi-session, separate bead). Wrapper script — does NOT modify the `bd` binary.
 *
 * Context: bead km-all.bd-verify-primitive. Plateau-90 sessions closed beads while
 * acceptance criteria failed at origin/main (e.g. km-silvery.feedback-trace-loggily
 * claimed `grep recordPassCause = 0` but origin had multiple hits). Root cause
 * (via /why): acceptance criteria are prose, not executable. This tool parses the
 * acceptance section as cmd → expectation pairs, runs each, and fails loudly when
 * reality disagrees with the close reason.
 *
 * Usage:
 *   bun tools/bd-verify.ts <bead-id>
 *
 * Exit:
 *   0 — all executable criteria passed
 *   1 — at least one criterion failed
 *   2 — no executable criteria found (prose-only acceptance)
 */

import { spawnSync } from "node:child_process"

// ─── ANSI colors (no deps) ──────────────────────────────────────────────────

const isTty = process.stdout.isTTY
const c = {
  reset: isTty ? "\x1b[0m" : "",
  dim: isTty ? "\x1b[2m" : "",
  bold: isTty ? "\x1b[1m" : "",
  red: isTty ? "\x1b[31m" : "",
  green: isTty ? "\x1b[32m" : "",
  yellow: isTty ? "\x1b[33m" : "",
  cyan: isTty ? "\x1b[36m" : "",
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Expectation =
  | { kind: "zeroHits" }
  | { kind: "nHits"; n: number }
  | { kind: "exitZero" }

interface Criterion {
  raw: string
  cmd: string
  expectation: Expectation
}

interface ProseLine {
  raw: string
  reason: string
}

interface Result {
  criterion: Criterion
  pass: boolean
  exitCode: number
  stdoutLines: number
  stdoutPreview: string
  stderrPreview: string
  detail: string
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Find an "Acceptance" or "/complete" header in the bead text and return the
 * lines that follow until the next ## header (or end of text).
 */
function extractAcceptanceSection(text: string): string[] {
  const lines = text.split("\n")
  // Match either `## Acceptance`, `### /complete`, or plain `Acceptance:` /
  // `/complete:` on its own line. Case-insensitive.
  const headerRe = /^\s*(?:#{1,6}\s*)?(?:acceptance|\/complete)\s*:?\s*$/i
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i] ?? "")) {
      start = i + 1
      break
    }
  }
  if (start === -1) return []
  // Stop conditions:
  //   (a) next markdown header (`## …` etc.)
  //   (b) common bead section keywords as plain headers
  //       (e.g. `Effort:`, `Reference:`, `Notes`, `Branch & timing`)
  const stopRe =
    /^\s*(?:#{1,6}\s+\w|(?:effort|reach|reference|references|notes?|branch|origin|out of scope|why|wins|migration|approach|sequence)\b\s*[:&]?)/i
  const out: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? ""
    if (stopRe.test(line)) break
    out.push(line)
  }
  return out
}

/**
 * Strip leading bullet markers (-, *, •) and surrounding whitespace.
 */
function stripBullet(line: string): string {
  return line.replace(/^\s*[-*•]\s+/, "").trim()
}

/**
 * Detect the expectation phrase at the END of a line (e.g. " → 0 hits",
 * " returns 0 hits", " = 0 matches"). Returns the parsed expectation and
 * the leading command portion, or null if no recognizable expectation.
 *
 * The trailing portion may include arbitrary trailing prose like
 * "(down from 13)" — we strip it off when matching the count.
 */
function parseExpectation(
  line: string,
): { cmd: string; expectation: Expectation } | null {
  // Normalize: split on a separator that signals expectation.
  // Common: → (U+2192), -> (ASCII), =, "returns", "—"
  // Note: `--` is intentionally NOT a separator — it collides with
  // git/grep path delimiters (e.g. `git grep -- path`).
  // We prefer the LAST match so command-internal arrows/equals don't get
  // mistaken for the verdict marker, but we cap to forms that are followed
  // by an expectation phrase (digits + hits-word, "passes", etc.).
  const sepRe = /\s+(?:→|->|—|=)\s+/g
  const returnsRe = /\s+returns?\s+/gi

  let cmd: string
  let tail: string

  // Collect all candidate split points; pick the LAST one whose tail parses.
  const candidates: { idx: number; len: number }[] = []
  let m: RegExpExecArray | null
  while ((m = sepRe.exec(line)) !== null) candidates.push({ idx: m.index, len: m[0].length })
  while ((m = returnsRe.exec(line)) !== null) candidates.push({ idx: m.index, len: m[0].length })
  // Sort by position (last first).
  candidates.sort((a, b) => b.idx - a.idx)

  let chosen: { idx: number; len: number } | null = null
  for (const cand of candidates) {
    const tryTail = line.slice(cand.idx + cand.len).trim()
    if (parseTail(tryTail) !== null) {
      chosen = cand
      break
    }
  }

  if (chosen) {
    cmd = line.slice(0, chosen.idx).trim()
    tail = line.slice(chosen.idx + chosen.len).trim()
  } else {
    // No separator. Treat the whole line as a command (exit-zero expectation),
    // BUT only if it actually looks like a command (starts with a known
    // executable token). Otherwise it's prose.
    cmd = line.trim()
    tail = ""
  }

  // Strip backticks around the command if any.
  cmd = cmd.replace(/^`(.*)`$/, "$1").trim()

  // Strip surrounding quotes.
  cmd = cmd.replace(/^"(.*)"$/, "$1").trim()

  // Drop leading "verify that"/"check"/"ensure"/"shows" phrases.
  cmd = cmd.replace(/^(verify(?:\s+that)?|check|ensure|expect)\s+/i, "").trim()

  if (!cmd) return null

  // Heuristic: the command must start with a recognizable shell token to
  // count as executable. Otherwise prose-only.
  const firstToken = cmd.match(/^[\w./-]+/)?.[0] ?? ""
  const allowed = new Set([
    "grep",
    "rg",
    "git",
    "bun",
    "bd",
    "node",
    "npm",
    "pnpm",
    "yarn",
    "cat",
    "wc",
    "test",
    "find",
    "ls",
    "echo",
    "sh",
    "bash",
    "tsc",
    "npx",
    "bunx",
    "vitest",
    "playwright",
    "curl",
    "jq",
    "head",
    "tail",
    "awk",
    "sed",
  ])
  if (!allowed.has(firstToken)) return null

  // Parse the tail.
  const expectation = parseTail(tail)
  if (!expectation) return null

  return { cmd, expectation }
}

function parseTail(tail: string): Expectation | null {
  if (tail === "") {
    // No tail — bare command, expect exit 0.
    return { kind: "exitZero" }
  }

  const t = tail.toLowerCase()

  // "0 hits" / "0 matches" / "no hits" / "0" alone / "(down from N)" suffix
  // Strip parenthetical trailing prose "(down from 13)" etc.
  const cleaned = t.replace(/\(.*?\)/g, "").trim()

  if (/^(0|zero|no)\s+(hits?|matches|results?|lines?|occurrences?)\b/.test(cleaned))
    return { kind: "zeroHits" }
  if (/^0$/.test(cleaned)) return { kind: "zeroHits" }
  if (/^no\s+\w+/.test(cleaned)) return { kind: "zeroHits" }

  // "N hits" / "N matches" / "N results"
  const nMatch = /^(\d+)\s+(hits?|matches|results?|lines?|occurrences?|sites?)\b/.exec(cleaned)
  if (nMatch && nMatch[1]) return { kind: "nHits", n: parseInt(nMatch[1], 10) }
  const bareN = /^(\d+)$/.exec(cleaned)
  if (bareN && bareN[1]) return { kind: "nHits", n: parseInt(bareN[1], 10) }

  // "passes" / "pass" / "succeeds" / "ok"
  if (/^(passes?|pass(?:ing)?|succeeds?|ok|green)\b/.test(cleaned))
    return { kind: "exitZero" }

  // Otherwise: unrecognized expectation, treat as prose.
  return null
}

interface ParseResult {
  criteria: Criterion[]
  prose: ProseLine[]
}

function parseAcceptance(lines: string[]): ParseResult {
  const criteria: Criterion[] = []
  const prose: ProseLine[] = []
  for (const rawLine of lines) {
    const line = stripBullet(rawLine)
    if (!line) continue

    const parsed = parseExpectation(line)
    if (parsed) {
      criteria.push({
        raw: rawLine.trim(),
        cmd: parsed.cmd,
        expectation: parsed.expectation,
      })
    } else {
      prose.push({ raw: rawLine.trim(), reason: "no recognizable command/expectation" })
    }
  }
  return { criteria, prose }
}

// ─── Executor ───────────────────────────────────────────────────────────────

function executeCriterion(criterion: Criterion, cwd: string): Result {
  // Run via shell so pipes/redirects in the cmd work.
  const proc = spawnSync("/bin/sh", ["-c", criterion.cmd], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    // Capture stderr/stdout separately.
  })

  const stdout = proc.stdout ?? ""
  const stderr = proc.stderr ?? ""
  const exitCode = proc.status ?? -1

  const stdoutLines = stdout === "" ? 0 : stdout.split("\n").filter((l) => l !== "").length
  const stdoutPreview = stdout.split("\n").slice(0, 3).join("\n")
  const stderrPreview = stderr.split("\n").slice(0, 3).join("\n")

  let pass = false
  let detail = ""

  switch (criterion.expectation.kind) {
    case "zeroHits": {
      // grep convention: zero hits = exit 1, no stdout; matches = exit 0.
      // Other exit codes (e.g. grep's exit 2 = syntax/path error) mean the
      // command is BROKEN, not "zero hits" — flag as fail so we don't
      // silently green-light a malformed criterion.
      const okExit = exitCode === 0 || exitCode === 1
      pass = stdoutLines === 0 && okExit
      detail = pass
        ? `0 stdout lines (exit ${exitCode})`
        : !okExit
          ? `command errored (exit ${exitCode}); stderr: ${stderrPreview.slice(0, 120) || "(empty)"}`
          : `expected 0, got ${stdoutLines} line(s) (exit ${exitCode})`
      break
    }
    case "nHits": {
      const want = criterion.expectation.n
      pass = stdoutLines === want
      detail = pass
        ? `${want} stdout lines (exit ${exitCode})`
        : `expected ${want}, got ${stdoutLines} line(s) (exit ${exitCode})`
      break
    }
    case "exitZero": {
      pass = exitCode === 0
      detail = pass ? `exit 0` : `expected exit 0, got ${exitCode}`
      break
    }
  }

  return {
    criterion,
    pass,
    exitCode,
    stdoutLines,
    stdoutPreview,
    stderrPreview,
    detail,
  }
}

// ─── Bead loader ────────────────────────────────────────────────────────────

function loadBead(beadId: string): { text: string; closeReason: string } {
  const proc = spawnSync("bd", ["show", beadId], { encoding: "utf8" })
  if (proc.status !== 0) {
    console.error(`${c.red}error: bd show ${beadId} failed${c.reset}`)
    if (proc.stderr) console.error(proc.stderr)
    process.exit(1)
  }
  const text = proc.stdout ?? ""

  // Extract close-reason if present (single line under "Close reason:").
  const m = /^Close reason:\s+(.+?)$/m.exec(text)
  const closeReason = m && m[1] ? m[1] : ""
  return { text, closeReason }
}

// ─── Reporter ───────────────────────────────────────────────────────────────

function report(beadId: string, results: Result[], prose: ProseLine[]): number {
  const passes = results.filter((r) => r.pass).length
  const fails = results.filter((r) => !r.pass).length
  const total = results.length

  console.log(`${c.bold}bd-verify ${beadId}${c.reset}`)
  console.log(`${c.dim}─────────────────────────────────────────────────────${c.reset}`)

  if (total === 0 && prose.length === 0) {
    console.log(`${c.yellow}⚠ no acceptance section found${c.reset}`)
    return 2
  }

  for (const r of results) {
    const mark = r.pass ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`
    console.log(`${mark} ${r.criterion.cmd}`)
    console.log(`  ${c.dim}${r.detail}${c.reset}`)
    if (!r.pass && r.stdoutPreview) {
      const preview = r.stdoutPreview.split("\n").map((l) => `    ${l}`).join("\n")
      console.log(`${c.dim}  stdout:\n${preview}${c.reset}`)
    }
  }

  for (const p of prose) {
    console.log(`${c.yellow}? ${p.raw}${c.reset}`)
    console.log(`  ${c.dim}skipped: ${p.reason}${c.reset}`)
  }

  console.log(`${c.dim}─────────────────────────────────────────────────────${c.reset}`)

  if (total === 0) {
    console.log(
      `${c.yellow}⚠ no executable criteria (${prose.length} prose-only line(s)) — manual review needed${c.reset}`,
    )
    return 2
  }

  if (fails === 0) {
    console.log(`${c.green}✓ ${passes}/${total} criteria pass${c.reset}` + (prose.length > 0 ? `${c.yellow} (${prose.length} prose-only skipped)${c.reset}` : ""))
    return 0
  } else {
    console.log(
      `${c.red}✗ ${fails}/${total} criteria FAIL${c.reset} (${passes} pass)` +
        (prose.length > 0 ? `${c.yellow} + ${prose.length} prose-only skipped${c.reset}` : ""),
    )
    return 1
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("usage: bun tools/bd-verify.ts <bead-id>")
    console.log("")
    console.log("  Parses the bead's Acceptance / /complete section as cmd → expectation")
    console.log("  pairs, executes each, and reports pass/fail.")
    console.log("")
    console.log("  Exit codes:")
    console.log("    0 — all executable criteria passed")
    console.log("    1 — at least one criterion failed")
    console.log("    2 — no executable criteria found (prose-only)")
    process.exit(args.length === 0 ? 2 : 0)
  }

  const beadId = args[0]
  if (!beadId) {
    console.error("error: missing bead id")
    process.exit(2)
  }
  const repoRoot = findRepoRoot()
  const { text, closeReason } = loadBead(beadId)

  const lines = extractAcceptanceSection(text)
  const { criteria, prose } = parseAcceptance(lines)

  // Also scan the close-reason for verification claims. These often
  // contain the actual `grep X = 0 hits` claim that we want to verify
  // against current reality. Format: "Acceptance verified: <cmd> → 0 hits".
  // Split close-reason on `; ` and `. ` to get atomic claims.
  if (closeReason) {
    const claimChunks = closeReason
      .split(/[;.]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const chunk of claimChunks) {
      // Strip leading "Acceptance verified:" / "Acceptance:" prefix.
      const stripped = chunk.replace(/^(?:acceptance(?:\s+verified)?:\s*)/i, "").trim()
      const parsed = parseExpectation(stripped)
      if (parsed) {
        criteria.push({
          raw: `(close-reason) ${chunk}`,
          cmd: parsed.cmd,
          expectation: parsed.expectation,
        })
      }
    }
  }

  const results = criteria.map((cr) => executeCriterion(cr, repoRoot))
  const exit = report(beadId, results, prose)
  process.exit(exit)
}

function findRepoRoot(): string {
  // Walk up from import.meta.dir looking for a `.beads/` directory.
  let dir = import.meta.dir
  for (let i = 0; i < 10; i++) {
    const proc = spawnSync("test", ["-d", `${dir}/.beads`], { encoding: "utf8" })
    if (proc.status === 0) return dir
    const parent = dir.replace(/\/[^/]+$/, "")
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

main()
