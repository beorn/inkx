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
 *   2 — no executable criteria found, OR criteria were skipped (advisory)
 */

import { spawnSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
import { parse as shellParse } from "shell-quote"

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

type Status = "pass" | "fail" | "skipped"

interface Result {
  criterion: Criterion
  status: Status
  exitCode: number
  stdoutLines: number
  stdoutPreview: string
  stderrPreview: string
  detail: string
}

/**
 * The set of command head-tokens we will execute. Anything else is reported
 * as a `"skipped"` status (NOT silently dropped) so a future Phase 2 close-gate
 * can fail-closed on unrecognized commands rather than green-light them.
 */
const ALLOWED_HEADS = new Set([
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

/** Heads in the grep family — exit 1 means "no matches" and is benign. */
const GREP_FAMILY = new Set(["grep", "rg", "git-grep"])

// ─── Shell tokenizer helpers ────────────────────────────────────────────────

/**
 * Tokenize a shell command and return the head executable.
 * Recognizes `git grep` as the compound head `git-grep`.
 * Returns "" if the command is empty or unparseable.
 */
function commandHead(cmd: string): string {
  const tokens = shellParse(cmd)
  // shell-quote may yield strings or operator/glob/comment objects; we want
  // the first plain string token (the executable).
  const first = tokens.find((t): t is string => typeof t === "string")
  if (!first) return ""
  if (first === "git") {
    const second = tokens
      .slice(tokens.indexOf(first) + 1)
      .find((t): t is string => typeof t === "string")
    if (second === "grep") return "git-grep"
  }
  return first
}

/**
 * Strip a single layer of matching outer quote characters from a string.
 * Recognizes backtick, single-quote, and double-quote pairs. Asymmetric or
 * nested constructs are left untouched so the shell tokenizer can handle them.
 *
 *   stripOuterQuotes('"foo bar"')          → 'foo bar'
 *   stripOuterQuotes("'a \"b\" c'")        → 'a "b" c'
 *   stripOuterQuotes('grep "foo bar"')      → 'grep "foo bar"'   (no outer pair)
 *   stripOuterQuotes('git grep -n "ab\\"cd"') → 'git grep -n "ab\\"cd"'
 */
function stripOuterQuotes(s: string): string {
  if (s.length < 2) return s
  const first = s[0]
  const last = s[s.length - 1]
  if ((first === "`" || first === "'" || first === '"') && first === last) {
    // Only strip if the pair encloses the full string and the inner segment
    // doesn't itself contain an unescaped occurrence of the same quote
    // character — in that case, e.g. `'foo'bar'`, the outer pair is two
    // adjacent quoted regions, not a single wrapped string.
    const inner = s.slice(1, -1)
    if (!hasUnescapedQuote(inner, first)) return inner.trim()
  }
  return s
}

function hasUnescapedQuote(s: string, q: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i++
      continue
    }
    if (s[i] === q) return true
  }
  return false
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

  const hadSeparator = chosen !== null
  if (chosen) {
    cmd = line.slice(0, chosen.idx).trim()
    tail = line.slice(chosen.idx + chosen.len).trim()
  } else {
    // No separator. Treat the whole line as a command (exit-zero expectation),
    // BUT only if it actually looks like a command (head is in the allowlist
    // below). Otherwise it's prose. Lines that DO have a `→`/`returns`/`=`
    // separator are recognized as "criteria" regardless of head — the
    // executor reports unsupported heads as status="skipped" so they're not
    // silently dropped.
    cmd = line.trim()
    tail = ""
  }

  // Strip a single layer of surrounding quotes/backticks. We only peel ONE
  // matching outer pair — the command inside may legitimately contain nested
  // quotes (e.g. `grep 'a "b" c'` → keep the inner `"b"` intact). Hand-rolled
  // greedy regex stripping (`/^"(.*)"$/`, `/^`(.*)`$/`) leaks quote chars
  // into argv on mismatched pairs and doesn't handle single-quote wrappers
  // at all. shell-quote tokenizes the result, so the intent here is just to
  // peel a markdown-bullet wrapper, not to perform full shell dequoting.
  cmd = stripOuterQuotes(cmd)

  // Drop leading "verify that"/"check"/"ensure"/"shows" phrases.
  cmd = cmd.replace(/^(verify(?:\s+that)?|check|ensure|expect)\s+/i, "").trim()

  if (!cmd) return null

  // Tokenize the head. Empty head (unparseable) → not a command.
  const head = commandHead(cmd)
  if (!head) return null

  // For lines WITHOUT an expectation separator, require the head to be on the
  // allowlist — otherwise we'd misclassify free-form prose ("Path A confirmed
  // by team-lead") as exit-zero criteria. Lines WITH an explicit separator
  // are unambiguously "command + expectation" shape, so we let them through
  // and the executor reports head-not-allowlisted as status="skipped".
  if (!hadSeparator && !ALLOWED_HEADS.has(head) && head !== "git-grep") return null

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
  // Allowlist gate: if the command's head executable isn't in ALLOWED_HEADS,
  // emit a "skipped" result with a reason rather than silently dropping or
  // running it. A future Phase 2 bd-close gate can fail-closed on this status.
  const head = commandHead(criterion.cmd)
  if (!ALLOWED_HEADS.has(head) && head !== "git-grep") {
    return {
      criterion,
      status: "skipped",
      exitCode: 0,
      stdoutLines: 0,
      stdoutPreview: "",
      stderrPreview: "",
      detail: head
        ? `head '${head}' not in allowlist (${[...ALLOWED_HEADS].sort().join(", ")})`
        : `command did not tokenize to a recognizable head`,
    }
  }

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

  let status: Status = "fail"
  let detail = ""
  const isGrepFamily = GREP_FAMILY.has(head)

  switch (criterion.expectation.kind) {
    case "zeroHits": {
      // grep convention: zero hits = exit 1, no stdout; matches = exit 0.
      // Other exit codes (e.g. grep's exit 2 = syntax/path error) mean the
      // command is BROKEN, not "zero hits" — flag as fail so we don't
      // silently green-light a malformed criterion.
      const okExit = exitCode === 0 || exitCode === 1
      const pass = stdoutLines === 0 && okExit
      status = pass ? "pass" : "fail"
      detail = pass
        ? `0 stdout lines (exit ${exitCode})`
        : !okExit
          ? `command errored (exit ${exitCode}); stderr: ${stderrPreview.slice(0, 120) || "(empty)"}`
          : `expected 0, got ${stdoutLines} line(s) (exit ${exitCode})`
      break
    }
    case "nHits": {
      const want = criterion.expectation.n
      // For grep-family commands: exit 0 = matches found, exit 1 = no matches
      // (both benign — count tells us which we got). Exit 2+ = real error
      // (invalid regex, bad path) → must NOT pass even if count happens to
      // match. For non-grep commands, require strict exit 0 since they don't
      // share the "1 = no match" convention.
      const exitOk = isGrepFamily ? exitCode <= 1 : exitCode === 0
      const pass = stdoutLines === want && exitOk
      status = pass ? "pass" : "fail"
      detail = pass
        ? `${want} stdout lines (exit ${exitCode})`
        : !exitOk
          ? `command errored (exit ${exitCode}); stderr: ${stderrPreview.slice(0, 120) || "(empty)"}`
          : `expected ${want}, got ${stdoutLines} line(s) (exit ${exitCode})`
      break
    }
    case "exitZero": {
      const pass = exitCode === 0
      status = pass ? "pass" : "fail"
      detail = pass ? `exit 0` : `expected exit 0, got ${exitCode}`
      break
    }
  }

  return {
    criterion,
    status,
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
  const passes = results.filter((r) => r.status === "pass").length
  const fails = results.filter((r) => r.status === "fail").length
  const skipped = results.filter((r) => r.status === "skipped").length
  const total = results.length

  console.log(`${c.bold}bd-verify ${beadId}${c.reset}`)
  console.log(`${c.dim}─────────────────────────────────────────────────────${c.reset}`)

  if (total === 0 && prose.length === 0) {
    console.log(`${c.yellow}⚠ no acceptance section found${c.reset}`)
    return 2
  }

  for (const r of results) {
    const mark =
      r.status === "pass"
        ? `${c.green}✓${c.reset}`
        : r.status === "fail"
          ? `${c.red}✗${c.reset}`
          : `${c.yellow}⊘${c.reset}`
    console.log(`${mark} ${r.criterion.cmd}`)
    console.log(`  ${c.dim}${r.detail}${c.reset}`)
    if (r.status === "fail" && r.stdoutPreview) {
      const preview = r.stdoutPreview.split("\n").map((l) => `    ${l}`).join("\n")
      console.log(`${c.dim}  stdout:\n${preview}${c.reset}`)
    }
  }

  for (const p of prose) {
    console.log(`${c.yellow}? ${p.raw}${c.reset}`)
    console.log(`  ${c.dim}prose-only: ${p.reason}${c.reset}`)
  }

  console.log(`${c.dim}─────────────────────────────────────────────────────${c.reset}`)

  if (total === 0) {
    console.log(
      `${c.yellow}⚠ no executable criteria (${prose.length} prose-only line(s)) — manual review needed${c.reset}`,
    )
    return 2
  }

  // Build a summary string covering pass / fail / skipped / prose.
  const parts: string[] = []
  parts.push(`${passes} pass`)
  if (fails > 0) parts.push(`${c.red}${fails} fail${c.reset}`)
  if (skipped > 0) parts.push(`${c.yellow}${skipped} skipped (allowlist)${c.reset}`)
  if (prose.length > 0) parts.push(`${c.yellow}${prose.length} prose-only${c.reset}`)
  const summary = parts.join(", ")

  // Exit code semantics:
  //   any "fail"               → 1
  //   any "skipped" (no fail)  → 2  (advisory; a future bd-close gate may
  //                                  reject closures with skipped criteria)
  //   all "pass"               → 0
  if (fails > 0) {
    console.log(`${c.red}✗ ${fails}/${total} criteria FAIL${c.reset} — ${summary}`)
    return 1
  }
  if (skipped > 0) {
    console.log(
      `${c.yellow}⊘ ${skipped}/${total} criteria skipped (advisory)${c.reset} — ${summary}`,
    )
    return 2
  }
  console.log(`${c.green}✓ ${passes}/${total} criteria pass${c.reset}` + (prose.length > 0 ? ` — ${summary}` : ""))
  return 0
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
    console.log("    2 — advisory: no executable criteria, OR criteria skipped (head not in allowlist)")
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

// ─── Test exports ──────────────────────────────────────────────────────────
//
// Internals exported via `__test` for unit tests. Keeping them off the named
// surface makes it explicit they are not stable API.

export const __test = {
  parseExpectation,
  parseTail,
  stripOuterQuotes,
  hasUnescapedQuote,
  commandHead,
  parseAcceptance,
  extractAcceptanceSection,
  executeCriterion,
  report,
  findRepoRoot,
  ALLOWED_HEADS,
  GREP_FAMILY,
}

export type { Criterion, Result, Status, Expectation, ProseLine }

function findRepoRoot(): string {
  // Walk up from this file's directory looking for a `.beads/` directory.
  // Use fs (no per-level subprocess; `test` isn't guaranteed as a separate
  // binary on every platform, and execSync per directory level is wasteful).
  // `import.meta.dir` is bun-specific; under vitest/node it can be empty, so
  // fall back to deriving from `import.meta.url` and ultimately to cwd.
  let dir = import.meta.dir
  if (!dir) {
    try {
      const url = import.meta.url
      if (url?.startsWith("file://")) {
        const path = new URL(url).pathname
        dir = path.replace(/\/[^/]+$/, "")
      }
    } catch {
      // Ignore — fall through to cwd.
    }
  }
  if (!dir) dir = process.cwd()

  for (let i = 0; i < 10; i++) {
    const candidate = `${dir}/.beads`
    if (existsSync(candidate)) {
      try {
        if (statSync(candidate).isDirectory()) return dir
      } catch {
        // Fall through — broken symlink, race, etc.
      }
    }
    const parent = dir.replace(/\/[^/]+$/, "")
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

// Only execute when invoked directly (not during test imports).
if (import.meta.main) main()
