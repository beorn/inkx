---
mentions:
  - km
id: "@km/tui/omnibox-when"
aliases:
  - km-tui.omnibox-when
  - km-tui-omnibox-when
created_by: Bjørn Stabell
created_at: 2026-04-14T23:24:56Z
closed_at: 2026-04-17T15:27:57Z
close_reason: "Already shipped in commit 0d79abcc7 'feat(km-commands,km-tui):
  when?: WhenPredicate on CommandDef + highlightMatches helper'. Verified
  2026-04-17: (1) CommandDef.when?: WhenPredicate exists in
  packages/km-commands/src/types.ts:83; (2) gate wired via isCommandAvailable()
  in packages/km-commands/src/availability.ts:38 — both modes? and when? must
  pass; (3) tests in packages/km-commands/tests/availability.test.ts cover
  viewMode gating, hasCursor, not(inMoveMode), and(hasCursor,
  not(textInputFocused)), and both-gate composition (550 tests pass); (4) tsc
  stays at 0 non-vendor errors; (5) no migration of existing commands (scope
  preserved)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-when
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:24:56Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui.omnibox-unified
---

# [x] Predicate-function availability — when?: (ctx) => boolean (Phase 4) @km/tui #task #P1

blocks:: [[@km/tui/omnibox-unified]]

Add optional when?: (ctx: CommandContext) => boolean field to CommandDef. No string DSL, no parser. Maps 1:1 to TEA's signal-based when(). No migration of existing commands — leave modes?: CommandMode[] as current gating mechanism. Add 'when' only where modes is insufficient. Tests: a command with when: (ctx) => ctx.viewMode === 'detail' appears only when a detail pane is active.

