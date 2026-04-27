/**
 * Unit tests for tools/bd-verify.ts hardening fixes (dual-pro review 2026-04-27,
 * parent bead km-all.bd-verify-primitive). Covers the four sub-beads:
 *
 *   km-tools.bd-verify-find-repo-root   — fs.existsSync, no per-level subprocess
 *   km-tools.bd-verify-quote-stripping  — real shell tokenizer, nested quotes
 *   km-tools.bd-verify-allowlist-skip   — third "skipped" status + exit code 2
 *   km-tools.bd-verify-nhits-exit-code  — count-match must AND with grep exit ≤ 1
 */

import { describe, test, expect } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { __test } from "./bd-verify.ts"

const {
  parseExpectation,
  stripOuterQuotes,
  hasUnescapedQuote,
  commandHead,
  parseAcceptance,
  executeCriterion,
  report,
  findRepoRoot,
} = __test

// ---------------------------------------------------------------------------
// Fix #2 — quote stripping with shell-quote tokenizer
// (km-tools.bd-verify-quote-stripping)
// ---------------------------------------------------------------------------

describe("stripOuterQuotes", () => {
  test("peels matching double-quote pair", () => {
    expect(stripOuterQuotes('"foo bar"')).toBe("foo bar")
  })

  test("peels matching single-quote pair", () => {
    expect(stripOuterQuotes("'foo bar'")).toBe("foo bar")
  })

  test("peels matching backtick pair", () => {
    expect(stripOuterQuotes("`grep foo`")).toBe("grep foo")
  })

  test("leaves nested-different-quote inner content intact", () => {
    // Single-quote wrap around inner double-quote string.
    expect(stripOuterQuotes(`'a "b" c'`)).toBe(`a "b" c`)
  })

  test("does NOT strip when no outer pair", () => {
    expect(stripOuterQuotes('grep "foo bar"')).toBe('grep "foo bar"')
  })

  test("does NOT strip when outer pair is asymmetric", () => {
    expect(stripOuterQuotes(`'foo"`)).toBe(`'foo"`)
  })

  test("does NOT strip when inner contains an unescaped same-quote", () => {
    // `'foo'bar'` is two adjacent quoted regions, not one wrapped string.
    expect(stripOuterQuotes(`'foo'bar'`)).toBe(`'foo'bar'`)
  })

  test("preserves escaped quote inside the wrapped slice", () => {
    // Escaped inner quote should NOT count as a closing pair.
    expect(stripOuterQuotes(`"a\\"b"`)).toBe(`a\\"b`)
  })

  test("handles 1-char and empty input safely", () => {
    expect(stripOuterQuotes("")).toBe("")
    expect(stripOuterQuotes(`"`)).toBe(`"`)
  })
})

describe("hasUnescapedQuote", () => {
  test("finds unescaped quote", () => {
    expect(hasUnescapedQuote(`a"b`, `"`)).toBe(true)
  })

  test("ignores escaped quote", () => {
    expect(hasUnescapedQuote(`a\\"b`, `"`)).toBe(false)
  })

  test("handles trailing backslash without crashing", () => {
    expect(hasUnescapedQuote(`a\\`, `"`)).toBe(false)
  })
})

describe("commandHead — shell-quote tokenizer", () => {
  test("extracts head from simple command", () => {
    expect(commandHead("grep foo")).toBe("grep")
  })

  test("recognizes git grep as compound head", () => {
    expect(commandHead("git grep -n foo")).toBe("git-grep")
  })

  test("normal git stays as git", () => {
    expect(commandHead("git log --oneline")).toBe("git")
  })

  test('handles double-quoted argument: grep "foo bar"', () => {
    expect(commandHead('grep "foo bar"')).toBe("grep")
  })

  test(`handles single-quoted with nested double: grep 'a "b" c'`, () => {
    expect(commandHead(`grep 'a "b" c'`)).toBe("grep")
  })

  test(`handles git grep -n "ab\\"cd"`, () => {
    // The outer arg has a literally-escaped inner quote. shell-quote should
    // still pull `git` and `grep` cleanly as the first two tokens.
    expect(commandHead(`git grep -n "ab\\"cd"`)).toBe("git-grep")
  })

  test("returns empty string for unparseable input", () => {
    expect(commandHead("")).toBe("")
  })
})

describe("parseExpectation — quote handling end-to-end", () => {
  test('strips outer double-quotes around the cmd: "grep foo" → 0 hits', () => {
    const parsed = parseExpectation(`"grep foo" → 0 hits`)
    expect(parsed?.cmd).toBe("grep foo")
    expect(parsed?.expectation).toEqual({ kind: "zeroHits" })
  })

  test('keeps nested quotes intact: grep "foo bar" → 0 hits', () => {
    const parsed = parseExpectation(`grep "foo bar" → 0 hits`)
    expect(parsed?.cmd).toBe(`grep "foo bar"`)
    expect(parsed?.expectation).toEqual({ kind: "zeroHits" })
  })

  test(`single-quote wrapper with nested double: 'grep "x"' → passes`, () => {
    const parsed = parseExpectation(`'grep "x"' → passes`)
    // After stripping outer single-quote pair, inner `grep "x"` is preserved.
    expect(parsed?.cmd).toBe(`grep "x"`)
    expect(parsed?.expectation).toEqual({ kind: "exitZero" })
  })

  test(`escaped inner quote survives: git grep -n "ab\\"cd" → 0 hits`, () => {
    const parsed = parseExpectation(`git grep -n "ab\\"cd" → 0 hits`)
    expect(parsed?.cmd).toBe(`git grep -n "ab\\"cd"`)
    expect(parsed?.expectation).toEqual({ kind: "zeroHits" })
  })
})

// ---------------------------------------------------------------------------
// Fix #3 — allowlist skip status (km-tools.bd-verify-allowlist-skip)
// ---------------------------------------------------------------------------

describe("executeCriterion — allowlist & skipped status", () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "bd-verify-test-"))

  test("emits status='skipped' when head is not in allowlist", () => {
    const result = executeCriterion(
      {
        raw: "fakecli check → 0 hits",
        cmd: "fakecli check",
        expectation: { kind: "zeroHits" },
      },
      tmpRoot,
    )
    expect(result.status).toBe("skipped")
    expect(result.detail).toContain("not in allowlist")
  })

  test("allowlisted command runs and yields pass/fail (not skipped)", () => {
    const result = executeCriterion(
      {
        raw: "echo hello → exit 0",
        cmd: "echo hello",
        expectation: { kind: "exitZero" },
      },
      tmpRoot,
    )
    expect(result.status).toBe("pass")
  })

  test("git-grep compound is treated as allowlisted", () => {
    // No matches — should pass for zeroHits expectation. Run inside a tiny
    // throwaway directory so we don't hit the surrounding repo's ignore rules.
    const subdir = join(tmpRoot, "git-grep-test")
    mkdirSync(subdir, { recursive: true })
    // Need a git repo for `git grep` to function.
    require("node:child_process").spawnSync("git", ["init", "-q"], { cwd: subdir })
    writeFileSync(join(subdir, "README.md"), "hello\n")
    require("node:child_process").spawnSync("git", ["add", "."], { cwd: subdir })
    require("node:child_process").spawnSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"],
      { cwd: subdir },
    )
    const result = executeCriterion(
      {
        raw: "git grep nonexistent-token → 0 hits",
        cmd: "git grep nonexistent-token",
        expectation: { kind: "zeroHits" },
      },
      subdir,
    )
    expect(result.status).toBe("pass")
  })
})

describe("report — exit codes for status mix", () => {
  // We capture stdout via a sink-y trick: redirect console.log to no-op for
  // the test, restore after. We only assert the exit code.
  const silentReport = (
    results: Parameters<typeof report>[1],
    prose: Parameters<typeof report>[2],
  ): number => {
    const orig = console.log
    console.log = () => {}
    try {
      return report("test-bead", results, prose)
    } finally {
      console.log = orig
    }
  }

  const passResult = (cmd: string) => ({
    criterion: { raw: cmd, cmd, expectation: { kind: "exitZero" as const } },
    status: "pass" as const,
    exitCode: 0,
    stdoutLines: 0,
    stdoutPreview: "",
    stderrPreview: "",
    detail: "exit 0",
  })

  const failResult = (cmd: string) => ({
    criterion: { raw: cmd, cmd, expectation: { kind: "exitZero" as const } },
    status: "fail" as const,
    exitCode: 1,
    stdoutLines: 0,
    stdoutPreview: "",
    stderrPreview: "",
    detail: "expected exit 0, got 1",
  })

  const skippedResult = (cmd: string) => ({
    criterion: { raw: cmd, cmd, expectation: { kind: "exitZero" as const } },
    status: "skipped" as const,
    exitCode: 0,
    stdoutLines: 0,
    stdoutPreview: "",
    stderrPreview: "",
    detail: "head 'foo' not in allowlist",
  })

  test("all pass → exit 0", () => {
    expect(silentReport([passResult("echo a"), passResult("echo b")], [])).toBe(0)
  })

  test("any fail → exit 1 (even with skipped)", () => {
    expect(
      silentReport(
        [passResult("echo a"), failResult("false"), skippedResult("foo")],
        [],
      ),
    ).toBe(1)
  })

  test("only skipped (no fail, no pass) → exit 2 advisory", () => {
    expect(silentReport([skippedResult("foo"), skippedResult("bar")], [])).toBe(2)
  })

  test("pass + skipped (no fail) → exit 2 advisory", () => {
    expect(silentReport([passResult("echo a"), skippedResult("foo")], [])).toBe(2)
  })

  test("no criteria, no prose → exit 2 (no acceptance section)", () => {
    expect(silentReport([], [])).toBe(2)
  })

  test("only prose (no criteria) → exit 2 (manual review)", () => {
    expect(silentReport([], [{ raw: "some prose", reason: "no separator" }])).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Fix #4 — nHits AND with grep exit ≤ 1 (km-tools.bd-verify-nhits-exit-code)
// ---------------------------------------------------------------------------

describe("executeCriterion — nHits AND exitCode ≤ 1 for grep family", () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "bd-verify-nhits-"))

  test("grep with valid pattern, count matches → pass", () => {
    // 'echo "a\nb" | grep -c x' returns 0 hits and exit 1 (no match).
    // For nHits=0 expectation, grep exit 1 is benign.
    const result = executeCriterion(
      {
        raw: "grep nomatch /dev/null → 0 hits",
        cmd: "grep nomatch /dev/null",
        expectation: { kind: "nHits", n: 0 },
      },
      tmpRoot,
    )
    expect(result.status).toBe("pass")
    expect(result.exitCode).toBe(1)
  })

  test("grep with INVALID regex (exit 2) but 0 stdout lines → MUST fail (not pass)", () => {
    // The whole point of fix #4: bad regex exits 2 with no stdout. Without
    // the AND-check, this would spuriously satisfy expected=0.
    const result = executeCriterion(
      {
        raw: "grep -E '[' /dev/null → 0 hits",
        cmd: "grep -E '[' /dev/null",
        expectation: { kind: "nHits", n: 0 },
      },
      tmpRoot,
    )
    expect(result.status).toBe("fail")
    expect(result.exitCode).toBe(2)
    expect(result.detail).toContain("errored")
  })

  test("non-grep command (e.g. cat) requires strict exit 0 for nHits", () => {
    // cat of a missing file exits 1; no grep-family leniency for this head.
    const result = executeCriterion(
      {
        raw: "cat /this/does/not/exist → 0 lines",
        cmd: "cat /this/does/not/exist",
        expectation: { kind: "nHits", n: 0 },
      },
      tmpRoot,
    )
    expect(result.status).toBe("fail")
  })

  test("rg with valid pattern returning expected count passes", () => {
    // rg behaves like grep family — exit 1 = no match.
    const result = executeCriterion(
      {
        raw: "rg nomatch /dev/null → 0 lines",
        cmd: "rg nomatch /dev/null",
        expectation: { kind: "nHits", n: 0 },
      },
      tmpRoot,
    )
    // rg exits 1 on no match; either pass (status=pass) or fail (if rg not
    // installed in the test environment). Accept either, but verify NO
    // spurious status=skipped (rg is allowlisted).
    expect(result.status).not.toBe("skipped")
  })
})

describe("executeCriterion — zeroHits exit code policy (existing behavior, regression check)", () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "bd-verify-zerohits-"))

  test("grep no-match (exit 1, 0 lines) passes zeroHits", () => {
    const result = executeCriterion(
      {
        raw: "grep nomatch /dev/null → 0 hits",
        cmd: "grep nomatch /dev/null",
        expectation: { kind: "zeroHits" },
      },
      tmpRoot,
    )
    expect(result.status).toBe("pass")
  })

  test("grep with bad regex (exit 2) fails zeroHits regardless of empty stdout", () => {
    const result = executeCriterion(
      {
        raw: "grep -E '[' /dev/null → 0 hits",
        cmd: "grep -E '[' /dev/null",
        expectation: { kind: "zeroHits" },
      },
      tmpRoot,
    )
    expect(result.status).toBe("fail")
  })
})

// ---------------------------------------------------------------------------
// Fix #1 — findRepoRoot uses fs (km-tools.bd-verify-find-repo-root)
// ---------------------------------------------------------------------------

describe("findRepoRoot", () => {
  test("returns a directory that contains .beads when run from the repo", () => {
    // The test process runs inside the worktree, which has .beads/.
    const root = findRepoRoot()
    expect(root.length).toBeGreaterThan(0)
    // Verify by stat'ing — without spawning subprocesses.
    expect(require("node:fs").existsSync(`${root}/.beads`)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// parseAcceptance integration — prose vs criteria classification
// ---------------------------------------------------------------------------

describe("parseAcceptance — close-reason prose does not become spurious criteria", () => {
  test("free-form sentences without separator are prose, not exitZero criteria", () => {
    const lines = [
      "- Path A confirmed by team-lead",
      "- Shipped state is canonical",
      "- grep recordPassCause → 0 hits",
    ]
    const { criteria, prose } = parseAcceptance(lines)
    // Only the third line is a real criterion.
    expect(criteria.length).toBe(1)
    expect(criteria[0]?.cmd).toBe("grep recordPassCause")
    expect(prose.length).toBe(2)
  })

  test("explicit cmd → expectation lines with non-allowlisted heads ARE recognized (handed to executor as 'skipped')", () => {
    const lines = ["- make test → passes"]
    const { criteria, prose } = parseAcceptance(lines)
    expect(criteria.length).toBe(1)
    expect(prose.length).toBe(0)
    // Then the executor will report this as status="skipped".
  })
})

// Cleanup — best effort.
process.on("exit", () => {
  try {
    rmSync(join(tmpdir(), "bd-verify-test-"), { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})
