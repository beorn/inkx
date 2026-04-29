---
id: "@km/silvercode/ambient-inline-display"
aliases:
  - km-silvercode.ambient-inline-display
  - km-silvercode-ambient-inline-display
created_by: claude:4de4a3ab
created_at: 2026-04-27T20:23:20Z
closed_at: 2026-04-27T20:38:13Z
close_reason: "Phase 6.a complete. Storybook stories:
  AmbientEventRow/all-sources (one row per source:
  tribe/CI/recall/sub-agent/file-watch/telegram) +
  AmbientEventRow/inline-sequence (full chat sequence with ambient rows
  interleaved between turns at their actual timestamps). Both stories render via
  createRenderer smoke-test in storybook/tests/stories.test.tsx — 54 tests
  passed including the 2 new stories. Verification: typecheck zero errors
  (vendor/test-only errors are pre-existing). Components/wiring:
  apps/silvercode/src/components/AmbientEventRow.tsx (pure presentational,
  canonical silvery components, semantic tokens),
  apps/silvercode/src/ambient-stream.ts (per-session bounded ring buffer),
  apps/silvercode/src/mute-state.ts (visual filter, structural separation from
  prompt-assembly), apps/silvercode/src/hooks/use-ambient-stream.ts (filtered
  stream + mute hooks), SessionUpdateList interleaves by timestamp, SessionCard
  threads controller+filter, SidePanel exposes per-source toggles. Design doc:
  hub/silvercode/design/ambient-inline-display.md. Commits: 153982678 (design),
  03d29f78f (component+stories), f230fc88f (wiring), c2abfc1a3 (side panel mute
  toggles)."
started_at: 2026-04-27T20:23:27Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.ambient-inline-display
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T13:23:26Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] Phase 6.a: inline AmbientEventRow in chat scrollback @km/silvercode #feature #P1 @claude:4de4a3ab

blocks:: [[@km/silvercode/ambient-context-excellence]]

See hub/silvercode/design/ambient-context-safety.md (auto-deliver posture) + hub/silvercode/design/ambient-inline-display.md (this design)