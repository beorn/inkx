---
mentions:
  - km
  - claude
id: "@km/inkx/scrollback-analysis"
aliases:
  - km-inkx.scrollback-analysis
  - km-inkx-scrollback-analysis
created_by: claude:d1f60fb4
created_at: 2026-02-25T14:50:16Z
closed_at: 2026-02-25T15:14:49Z
owner: bjorn@stabell.org
assignee: claude:d1f60fb4
---

# [x] Analyze inline mode scrollback behavior — edge cases, limitations, and improvements @km/inkx #task #P2 @claude:d1f60fb4

Deep analysis of inline mode + useScrollback behavior in inkx.

## Key Findings

1. useScrollback provides CLEAN scrollback (vs Claude Code's stale frame pollution) — this is its primary value
2. No scroll detection possible — fundamental terminal limitation (no escape sequence exists)
3. Content cap at termRows prevents scrollback corruption
4. Layout engine correctly constrains to terminal width (verified at 40-120 cols)
5. Ghostty default: viewport stays pinned when user scrolls up, keystroke scrolls back

## Artifacts

- Analysis doc: vendor/beorn-inkx/docs/deep-dives/scrollback-analysis.md
- Tests: vendor/beorn-inkx/tests/scrollback-inline.test.tsx (11 tests, all passing)
- Demo: vendor/beorn-inkx/examples/interactive/static-scrollback.tsx

## Box Width Issue

Diagnostic testing shows no overflow in renderStringSync or inline layout. May be Ghostty-specific (full-width lines + deferred wrap). Needs TTY verification.

## Remaining

- TTY-based interactive testing (need TTY MCP tools reconnected)
- Deep research second opinion completed — confirmed findings

