---
id: "@km/silvery/scope-phase-4-docs-apps"
aliases:
  - km-silvery.scope-phase-4-docs-apps
  - km-silvery-scope-phase-4-docs-apps
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:47Z
closed_at: 2026-04-24T23:15:04Z
close_reason: "Audit complete (manually after worktree-spawn agents kept getting
  Hook cancelled under tribe CPU load). Findings: docs/api/term-signals.md had
  stale apps/km-tui/... km-specific path violating vendor boundary rule +
  missing scope-guide cross-link → fixed in silvery 85cb8ca6.
  .claude/skills/silverize/SKILL.md had stale 'useAppLifecycle gap' note →
  replaced with reference to the shipped Scope/withScope/useScopeEffect
  primitives. CLAUDE.md root: added Triage row for lifecycle/cleanup/SIGINT
  triggers pointing to hub/silvery/design/lifecycle-scope.md. hub/silvery/design
  and apps/*/CLAUDE.md: no stale references found. km 2e6a69a42."
---

# [x] Phase 4.E: Audit per-app CLAUDE.md + READMEs @km/silvery #task #P2 @claude:2aefb4b6

blocks:: [[@km/silvery/scope-phase-4]], [[@km/silvery/scope-phase-4-eslint]]

Sweep apps/@km/tui/CLAUDE.md, apps/silvercode/*, apps/@km/_orphan/cli/*, apps/@km/_orphan/repl/* for cleanup references. Update anti-patterns sections. Exit: grep clean across apps/*/CLAUDE.md + README.md.