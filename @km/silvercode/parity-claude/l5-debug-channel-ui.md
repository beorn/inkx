---
closed_at: 2026-05-07T21:47:09.576Z
closeReason: "Verified complete in working tree: debug side-panel label is
  exactly 'debug'; Debug toggle drives projected visibility and legacy raw-row
  hiding. Tests: bun vitest run apps/silvercode/tests/chat-session-store.test.ts
  apps/silvercode/tests/chat-block-list.test.tsx
  apps/silvercode/tests/content-layout.test.tsx
  apps/silvercode/tests/side-panel-multi-account.test.tsx -t
  'Debug|debug|single-session zero-state chrome' -> 4 files passed, 4 tests
  passed."
---

# [x] L5: Debug notification channel toggle controls projected Debug leaves #feature #P0

blocks:: [[@km/silvercode/parity-claude]]

## Goal

Show `debug` as a real channel under Notifications in the side panel, with a toggle that controls projected Debug leaves.

## Work

- Add `debug` to the Notifications/channel list, not as `Debug channel`.
- Toggle updates `ChatChannelState.debug.visible/muted`.
- Normal transcript hides `event.channel === "debug"`.
- Debug on shows chronological Debug leaves in transcript context, each inspectable by expand or cmd-hover.
- Keep notification source muting separate from chat channel visibility, or explicitly bridge them through the projected model.

## Acceptance

- Toggling Debug changes projected visibility immediately.
- Legacy raw/system rows do not leak when projected Debug is hidden.
- Debug on exposes complete raw detail for unknown/control records.
- Side-panel label is exactly `debug`.

## Verification

- `bun vitest run apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-block-list.test.tsx`
- UI/termless or story coverage for the side-panel toggle.

## Progress

- Side panel lists `debug` under Notifications.
- User decision after close: keep the visible channel name lowercase as `debug`.
- `ChatPane` forwards the Debug toggle into the projected channel state and into legacy raw-row filtering.
- Added regression coverage proving legacy raw control rows are hidden until Debug is visible:
  - `bun vitest run apps/silvercode/tests/content-layout.test.tsx` — 45 tests passed.
- Added projection-store coverage proving Debug visibility changes projected leaves without mutating retained ChatEvents:
  - `bun vitest run apps/silvercode/tests/chat-session-store.test.ts` — 4 tests passed.
