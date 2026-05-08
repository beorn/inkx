---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-sessionupdatelist-messageentry-routing
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-sessionupdatelist-messageentry-routing
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Delete SessionUpdateList and MessageEntry routing #task #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 04 cuts ChatPane over to ChatTree/ChatTrack, delete the legacy transcript routing path and renderer-owned inference.

## Current State

Measured 2026-05-08:

- Bead-scope gate has 47 files / 300 hits for `SessionUpdateList|MessageEntry|ContentBlock`.
- Production `ChatPane` already builds a `ChatSessionProjectionStore` and projected `ChatLeaf[]`, but still renders `SessionUpdateList`; `ChatBlockList` is only a debug comparison panel.
- `SessionUpdateList`, `chat/session-update-projection.ts`, and `chat-model.ts` still own legacy `MessageEntry[]` routing, renderer-owned inference, and many tests.
- `/arch` is required before deleting or renaming public `@km/agent-harness` surfaces such as `MessageEntry`, `SessionState.messages`, root exports, or package `ContentBlock` names.

## Refactor Phases

1. [x] Production cutover: render `ChatPane` from `ChatTree` / `ChatBlockList`; delete the `SessionUpdateList` import, `legacyMessages`, and the debug comparison path.
2. [x] Move app logic off `MessageEntry`: clipboard, activity snapshots, notifications, subagent activity, and App scroll bindings consume canonical `ChatSession` / `ChatLeaf` data.
3. [x] Delete legacy renderer/projection source: remove `SessionUpdateList.tsx`, `chat/session-update-projection.ts`, and `chat-model.ts` after their last live consumers are migrated.
4. [x] Rewrite tests and stories to construct `ChatEvent` / `ChatTree` fixtures instead of `MessageEntry[]`.
5. [x] Reviewed app-scope `ContentBlock` references and left them only in provider/ACP prompt, transcript, ToolCall, and raw-normalization boundary terms; renderer-owned legacy routing is gone.

## Progress Notes

- 2026-05-08: Phase 1 landed in the app path. `ChatPane` renders projected `ChatBlockList` leaves in production, with projected event activity snapshots, notification timeline merge, replay-only transcript display, debug permission-mode leaves, and a no-event-log `MessageEntry` compatibility fallback in `ChatSessionProjectionStore`. Evidence: `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped), `npx tsc --noEmit`, and focused ChatPane/projection suites passed.
- 2026-05-08: Phase 2a removed `ChatPane`'s direct `state.messages` reads for notification suppression and replay-only detection. Subagent notification hiding now has a `ChatEvent` path, and `ChatPane` uses projected message counts for replay display gating. Evidence: `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped), `npx tsc --noEmit`, notification/subagent tests, and ChatPane-heavy suites passed.
- 2026-05-08: Phase 2b removed App/PaneGrid live references to `MessageEntry` / `SessionUpdateList` for composer placement and scroll-list naming. App now derives "conversation started" from normalized `ChatEvent` blocks. Evidence: `bun run test:silvercode:l5`, `npx tsc --noEmit`, and App-facing welcome/keyboard/queue tests passed.
- 2026-05-08: Phase 2c removed the transcript clipboard serializer's `MessageEntry` / `SessionState.messages` dependency. Clipboard export now reads a short-lived `ChatSessionProjectionStore` and serializes canonical `ChatMessage`, `ChatBlock`, and `ChatTool` state, with a direct regression for text/thought/tool-ref output. Evidence: `bun vitest run apps/silvercode/tests/session-clipboard.test.ts apps/silvercode/tests/side-panel-multi-account.test.tsx` (15 passed), `npx tsc --noEmit`, and `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped).
- 2026-05-08: Phase 2d moved the resumed-session test helper off `SessionUpdateList` / `MessageEntry` and onto `ChatSessionProjectionStore` + `ChatBlockList`. The cutover exposed and fixed a canonical replay edge: uniquified duplicate `queue.updated` / `plan.updated` events now rewrite nested payload `eventIds`, and projected tool leaves carry real tool names/command/output summaries instead of `tool-ref` / `tool done` placeholders. Evidence: `bun vitest run apps/silvercode/tests/chat-block-list.test.tsx apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/render-resumed-session-helper.test.tsx apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-session-store.test.ts` (35 passed), `npx tsc --noEmit`, and `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped).
- 2026-05-08: Phase 2e removed controller live `state.messages` reads and stale `SessionUpdateList` comments from background/interrupt handling. Active-turn detection and interrupt snippets now scan `store.events` directly, including sessionless-event guards. Evidence: `bun vitest run apps/silvercode/tests/background-jobs.test.tsx apps/silvercode/tests/visual/ctrl-b-background.test.tsx apps/silvercode/tests/esc-parity.test.tsx` (11 passed), `npx tsc --noEmit`, `rg -n "state\\.messages|SessionUpdateList" apps/silvercode/src/controller.ts` (0 hits), and `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped).

## Complete Criteria

- `rg -n "SessionUpdateList|MessageEntry" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs apps/silvercode/scripts/l5-suite.ts apps/silvercode/storybook` returns zero hits.
- `ContentBlock` references are explicitly provider/ACP boundary usage, not renderer-owned chat routing.
- ChatPane renders from ChatTree/ChatTrack in tests and production.

## Completion Note

- 2026-05-08: L5 cleanup completed. The production projection store no longer falls back from normalized ChatEvents to session-state message snapshots; legacy renderer/projection modules are quarantined as one-line tombstones; old renderer-heavy tests/stories are replaced or skipped in favor of canonical ChatBlockList / ChatMessageSummary coverage; and the L5 suite now includes the canonical block-list projection test. Evidence: `rg -n "SessionUpdateList|MessageEntry|session-update-projection|chat-model|filterVisibleNotificationEntriesFromChatEvents|projectCurrentSubagentActivitiesFromMessages|representedSubagentNotificationIdsFromMessages|chatActivitySnapshotFromMessages|chatActivityCountsFromMessages" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs apps/silvercode/scripts/l5-suite.ts apps/silvercode/storybook` returned 0 hits; `bun vitest run apps/silvercode/tests/notification-block.test.tsx apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-message-summary.test.tsx apps/silvercode/tests/content-layout-chat.test.tsx apps/silvercode/tests/chat-block-list.test.tsx` passed 35 tests; `npx tsc --noEmit` passed; `bun run test:silvercode:l5` passed 34 files / 206 tests.
