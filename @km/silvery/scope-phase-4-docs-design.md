---
id: "@km/silvery/scope-phase-4-docs-design"
aliases:
  - km-silvery.scope-phase-4-docs-design
  - km-silvery-scope-phase-4-docs-design
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:43Z
closed_at: 2026-04-24T23:15:00Z
close_reason: "Audit complete (manually after worktree-spawn agents kept getting
  Hook cancelled under tribe CPU load). Findings: docs/api/term-signals.md had
  stale apps/km-tui/... km-specific path violating vendor boundary rule +
  missing scope-guide cross-link → fixed in silvery 85cb8ca6.
  .claude/skills/silverize/SKILL.md had stale 'useAppLifecycle gap' note →
  replaced with reference to the shipped Scope/withScope/useScopeEffect
  primitives. CLAUDE.md root: added Triage row for lifecycle/cleanup/SIGINT
  triggers pointing to hub/silvery/design/lifecycle-scope.md. hub/silvery/design
  and apps/*/CLAUDE.md: no stale references found. km 2e6a69a42."
started_at: 2026-04-24T22:43:45Z
owner: bjorn@stabell.org
assignee: claude:2aefb4b6
dependencies:
  - issue_id: km-silvery.scope-phase-4-docs-design
    depends_on_id: km-silvery.scope-phase-4
    type: parent-child
    created_at: 2026-04-24T13:40:43Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-4-docs-design
    depends_on_id: km-silvery.scope-phase-4-eslint
    type: blocks
    created_at: 2026-04-24T13:40:43Z
    created_by: claude:2aefb4b6
    metadata: "{}"
---

# [x] Phase 4.B: Audit hub/silvery/design/* @km/silvery #task #P2 @claude:2aefb4b6

blocks:: [[@km/silvery/scope-phase-4]], [[@km/silvery/scope-phase-4-eslint]]

Sweep hub/silvery/design/*.md for cleanup examples showing old patterns; replace with scope-based examples. Keep lifecycle-scope.md as canonical reference. Exit: grep for useDispose|term.signals.on|useExit|new AbortController|fs.watch|setTimeout in hub/silvery/design/ returns zero.