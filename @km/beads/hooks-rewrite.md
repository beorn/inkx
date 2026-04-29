---
id: "@km/beads/hooks-rewrite"
aliases:
  - km-beads.hooks-rewrite
  - km-beads-hooks-rewrite
created_by: claude:da9990c5
created_at: 2026-04-28T06:12:32Z
closed_at: 2026-04-28T08:14:22Z
close_reason: "Shipped in fa1858976. New .claude/hooks/bd-prime.sh wrapper
  installed for SessionStart/PreCompact: prefers Go bd while installed (50ms vs
  km bd's 180ms), falls back to bun km bd prime in environments without the bd
  binary (post-dolt-archive cutover state). .claude/settings.json updated to
  invoke the wrapper. .claude/hooks/pre-compact.sh refactored to use $BD
  variable with same fallback pattern. apps/km-cli/src/commands/bd-memory.ts: km
  bd prime is now a superset of bd prime — emits PRIME.md (vault root or
  .beads/) followed by recent mem/ entries, so the wrapper's fallback emits
  equivalent priming text. Smoke-tested: bd-prime.sh emits 110 lines of workflow
  context + memories."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.hooks-rewrite
    depends_on_id: km-beads.cutover
    type: parent-child
    created_at: 2026-04-27T23:12:42Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Update Claude Code hooks to use km bd instead of bd binary @km/beads #task #P2

blocks:: [[@km/beads/cutover]]

Hooks under .claude/hooks/ (SessionStart, PreToolUse, etc.) call 'bd prime', 'bd ready', 'bd export', etc. They should call km bd so the hook contract works without the Go binary.

## Scope
- Audit .claude/hooks/*.sh for bd invocations
- Replace with 'bun km bd ...' (or a guarded fallback that prefers km bd)
- Validate the SessionStart context-injection (bd prime equivalent) still emits the priming context
- Validate the export hook now reflects the path-relative bug fix from @km/beads/export-path-relative

## Acceptance
- New session opens with priming context emitted by km bd prime
- Hooks function on a vault where bd binary is uninstalled