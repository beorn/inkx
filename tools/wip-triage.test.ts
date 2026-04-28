/**
 * Unit tests for tools/wip-triage.ts.
 *
 * Covers the pure-function classifiers — parsers for git/branch/stash output
 * and the auto-discardable conservative gate. These are the core of the
 * tool: every shell-side decision flows through them.
 *
 * The bead acceptance criteria call out:
 * - One row per retained-work item across all 4 sources.
 * - Auto-discardable gate is conservative — work loss is not allowed.
 *
 * I/O paths (Bun.spawn callers) are not tested here; they are thin wrappers
 * around the shell with no business logic.
 */

import { describe, test, expect } from "vitest"
import { __test } from "./wip-triage.ts"

const {
  parseGitWorktrees,
  parseBranches,
  parseStashes,
  extractBeadFromBranch,
  extractBeadFromMessage,
  isAutoDiscardable,
  formatAge,
} = __test

// ─── Parsers ──────────────────────────────────────────────────────────────

describe("parseGitWorktrees", () => {
  test("parses main worktree + agent worktrees", () => {
    const fixture = `worktree /Users/beorn/Code/pim/km
HEAD 4429c3da60678483ca13d28210cbb9c2e3cbc735
branch refs/heads/main

worktree /Users/beorn/Code/pim/km/.claude/worktrees/agent-af96acf8b809eb84e
HEAD 4429c3da60678483ca13d28210cbb9c2e3cbc735
branch refs/heads/wip/km-infra.orphan-branch-audit

worktree /tmp/bare-clone
HEAD 4429c3da60678483ca13d28210cbb9c2e3cbc735
bare
`
    const rows = parseGitWorktrees(fixture)
    expect(rows).toHaveLength(3)
    expect(rows[0]!.path).toBe("/Users/beorn/Code/pim/km")
    expect(rows[0]!.branch).toBe("main")
    expect(rows[1]!.branch).toBe("wip/km-infra.orphan-branch-audit")
    expect(rows[2]!.bare).toBe(true)
  })

  test("handles detached HEAD blocks", () => {
    const fixture = `worktree /tmp/detached
HEAD 0123456789abcdef
detached
`
    const rows = parseGitWorktrees(fixture)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.detached).toBe(true)
    expect(rows[0]!.branch).toBeNull()
  })

  test("returns empty array for empty input", () => {
    expect(parseGitWorktrees("")).toEqual([])
    expect(parseGitWorktrees("\n\n\n")).toEqual([])
  })
})

describe("parseBranches", () => {
  test("parses pipe-separated name+date", () => {
    const fixture = `main|2026-04-28 15:20:44 -0700
wip/km-infra.orphan-branch-audit|2026-04-28 15:20:44 -0700
wip/km-tui.omnibox-trio|2026-04-28 15:21:46 -0700
`
    const rows = parseBranches(fixture)
    expect(rows).toHaveLength(3)
    expect(rows[1]!.name).toBe("wip/km-infra.orphan-branch-audit")
    expect(rows[1]!.committerDateIso).toBe("2026-04-28 15:20:44 -0700")
  })

  test("ignores blank and malformed lines", () => {
    const fixture = `\nmain|2026-04-28 15:20:44 -0700\nmalformed-no-pipe\n`
    const rows = parseBranches(fixture)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe("main")
  })
})

describe("parseStashes", () => {
  test("parses stash@{N}|date|message format", () => {
    const fixture = `stash@{0}|2026-04-25 10:11:12 -0700|WIP on wip/km-storage.frontmatter: oops
stash@{1}|2026-04-20 09:08:07 -0700|emergency-preserve: lost-work scenario
`
    const rows = parseStashes(fixture)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.ref).toBe("stash@{0}")
    expect(rows[0]!.message).toBe("WIP on wip/km-storage.frontmatter: oops")
    expect(rows[1]!.message).toBe("emergency-preserve: lost-work scenario")
  })

  test("preserves pipe characters in message via slice-rejoin", () => {
    const fixture = `stash@{0}|2026-04-25 10:11:12 -0700|message with | pipe inside
`
    const rows = parseStashes(fixture)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.message).toBe("message with | pipe inside")
  })

  test("returns empty array for empty input", () => {
    expect(parseStashes("")).toEqual([])
  })
})

// ─── Bead-id heuristics ───────────────────────────────────────────────────

describe("extractBeadFromBranch", () => {
  test("matches all type prefixes", () => {
    expect(extractBeadFromBranch("wip/km-infra.orphan-branch-audit"))
      .toBe("km-infra.orphan-branch-audit")
    expect(extractBeadFromBranch("bug/km-tui.cursor-loss")).toBe("km-tui.cursor-loss")
    expect(extractBeadFromBranch("feat/km-storage.link-model")).toBe("km-storage.link-model")
    expect(extractBeadFromBranch("fix/km-board.layout")).toBe("km-board.layout")
    expect(extractBeadFromBranch("chore/km-infra.bump-deps")).toBe("km-infra.bump-deps")
    expect(extractBeadFromBranch("refactor/km-core.extract")).toBe("km-core.extract")
    expect(extractBeadFromBranch("test/km-tui.add-spec")).toBe("km-tui.add-spec")
    expect(extractBeadFromBranch("docs/km-infra.readme")).toBe("km-infra.readme")
  })

  test("returns null for non-matching branches", () => {
    expect(extractBeadFromBranch("main")).toBeNull()
    expect(extractBeadFromBranch("feature/random-thing")).toBeNull()
    expect(extractBeadFromBranch("wip/no-prefix")).toBeNull()    // missing km-
    expect(extractBeadFromBranch(null)).toBeNull()
  })
})

describe("extractBeadFromMessage", () => {
  test("extracts km-scope.slug from commit messages", () => {
    expect(extractBeadFromMessage("fix(tui): cursor loss\n\nRefs km-tui.cursor-loss"))
      .toBe("km-tui.cursor-loss")
    expect(extractBeadFromMessage("feat: implement km-storage.link-model"))
      .toBe("km-storage.link-model")
  })

  test("returns null when no bead id present", () => {
    expect(extractBeadFromMessage("just a commit message")).toBeNull()
    expect(extractBeadFromMessage("km-noscope")).toBeNull()    // needs the dot
  })
})

// ─── Auto-discardable gate ────────────────────────────────────────────────

describe("isAutoDiscardable — passing cases", () => {
  const NOW = 1_700_000_000
  const DAY = 24 * 3600

  test("git-worktree: closed bead, no stash ref, ahead=0, mtime > 24h", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "closed",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(true)
  })

  test("branch-only: closed bead, no stash, ahead=0 — passes regardless of mtime", () => {
    expect(isAutoDiscardable({
      source: "branch-only",
      beadStatus: "closed",
      ahead: 0,
      mtimeEpoch: NOW - 60,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(true)
  })
})

describe("isAutoDiscardable — failing cases (work-loss prevention)", () => {
  const NOW = 1_700_000_000
  const DAY = 24 * 3600

  test("rejects when bead status is open", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "open",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("rejects when bead is in_progress (someone is working on it)", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "in_progress",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("rejects when bead is not-found (we cannot verify safety)", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "not-found",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("rejects when ahead > 0 (unique commits would be lost)", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "closed",
      ahead: 3,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("rejects when ahead is null (unknown divergence)", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "closed",
      ahead: null,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("rejects when a stash references the branch", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "closed",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 2,
      nowEpoch: NOW,
      hasStashRef: true,
    })).toBe(false)
  })

  test("rejects worktree mtime <= 24h (recently active)", () => {
    expect(isAutoDiscardable({
      source: "git-worktree",
      beadStatus: "closed",
      ahead: 0,
      mtimeEpoch: NOW - 23 * 3600,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })

  test("never auto-discards stashes", () => {
    expect(isAutoDiscardable({
      source: "stash",
      beadStatus: "closed",
      ahead: 0,
      mtimeEpoch: NOW - DAY * 30,
      nowEpoch: NOW,
      hasStashRef: false,
    })).toBe(false)
  })
})

// ─── Cosmetics ────────────────────────────────────────────────────────────

describe("formatAge", () => {
  test("formats seconds, minutes, hours, days", () => {
    expect(formatAge(45)).toBe("45s")
    expect(formatAge(120)).toBe("2m")
    expect(formatAge(3 * 3600 + 10)).toBe("3h")
    expect(formatAge(2 * 24 * 3600)).toBe("2d")
  })
})
