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
2. Move app logic off `MessageEntry`: clipboard, activity snapshots, notifications, subagent activity, and App scroll bindings consume canonical `ChatSession` / `ChatLeaf` data.
3. Delete legacy renderer/projection source: remove `SessionUpdateList.tsx`, `chat/session-update-projection.ts`, and `chat-model.ts` after their last live consumers are migrated.
4. Rewrite tests and stories to construct `ChatEvent` / `ChatTree` fixtures instead of `MessageEntry[]`.
5. Remove app-scope `ContentBlock` literals from live paths or quarantine them as raw/provider-boundary inspector terms.

## Progress Notes

- 2026-05-08: Phase 1 landed in the app path. `ChatPane` renders projected `ChatBlockList` leaves in production, with projected event activity snapshots, notification timeline merge, replay-only transcript display, debug permission-mode leaves, and a no-event-log `MessageEntry` compatibility fallback in `ChatSessionProjectionStore`. Evidence: `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped), `npx tsc --noEmit`, and focused ChatPane/projection suites passed.
- 2026-05-08: Phase 2a removed `ChatPane`'s direct `state.messages` reads for notification suppression and replay-only detection. Subagent notification hiding now has a `ChatEvent` path, and `ChatPane` uses projected message counts for replay display gating. Evidence: `bun run test:silvercode:l5` (35 files, 260 passed, 1 skipped), `npx tsc --noEmit`, notification/subagent tests, and ChatPane-heavy suites passed.
- 2026-05-08: Phase 2b removed App/PaneGrid live references to `MessageEntry` / `SessionUpdateList` for composer placement and scroll-list naming. App now derives "conversation started" from normalized `ChatEvent` blocks. Evidence: `bun run test:silvercode:l5`, `npx tsc --noEmit`, and App-facing welcome/keyboard/queue tests passed.

## Complete Criteria

- `rg -n "SessionUpdateList|MessageEntry|ContentBlock" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero live-path hits or only explicitly quarantined raw inspector fixtures.
- ChatPane renders from ChatTree/ChatTrack in tests and production.
