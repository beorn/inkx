---
aliases:
  - km-silvercode.context-compacted-raw-hover
  - km-silvercode-context-compacted-raw-hover
created_at: 2026-05-08T03:51:01.068Z
---

# [/] Context compacted chat block lacks raw cmd-hover #bug #P2

TDD: added failing cmd-hover regression for Compact summary raw payload, then wrapped the compact-summary system row in RawInspector. Test: bun vitest run apps/silvercode/tests/message-list-scroll.test.tsx (passes). Awaiting user confirmation before close.

Additional verification: npx tsc --noEmit currently fails on pre-existing unrelated silvercode test WIP: apps/silvercode/tests/process/live-visual-stream.test.tsx RenderedScenario cast, and apps/silvercode/tests/session-prompt-composer.test.tsx TermlessTerm.getCursor.

Follow-up refactor: added shared BlockInteraction/useBlockInspection trait for block raw/detail popovers plus expansion, migrated ChatBlockList detail disclosure and SessionUpdateList RawInspector/Compact summary to it, and covered user hidden-context cmd-hover. Tests: bun vitest run apps/silvercode/tests/message-list-scroll.test.tsx apps/silvercode/tests/chat-block-list.test.tsx (passes). Typecheck still blocked by unrelated existing silvercode test WIP.

Final verification after wrapping background/user/system rows: bun vitest run apps/silvercode/tests/message-list-scroll.test.tsx apps/silvercode/tests/chat-block-list.test.tsx passes. npx tsc --noEmit still reports only the existing unrelated live-visual-stream/session-prompt-composer errors.

Completeness audit: migrated Chat.AgentsDrawer row to BlockInteraction; restored activity-summary raw payload shape and summary predicate so cmd-hover activity tests pass. Focused tests pass. Full apps/silvercode/tests/content-layout.test.tsx still has one unrelated markdown code-block lane failure; npx tsc still blocked by existing unrelated test type errors; did not run bun fix/test:fast due dirty worktree and known blockers.

