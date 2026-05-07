---
id: "@km/silvercode/claude-code-transcript-parity/l5-debug-channel-ui"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-debug-channel-ui
  - km-silvercode-claude-code-transcript-parity-l5-debug-channel-ui
created_at: 2026-05-07T01:20:07.609Z
type: feature
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: Debug notification channel toggle controls projected Debug leaves #feature #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Goal

Show `Debug` as a real channel under Notifications in the side panel, with a toggle that controls projected Debug leaves.

## Work

- Add `Debug` to the Notifications/channel list, not as `Debug channel`.
- Toggle updates `ChatChannelState.debug.visible/muted`.
- Normal transcript hides `event.channel === "debug"`.
- Debug on shows chronological Debug leaves in transcript context, each inspectable by expand or cmd-hover.
- Keep notification source muting separate from chat channel visibility, or explicitly bridge them through the projected model.

## Acceptance

- Toggling Debug changes projected visibility immediately.
- Legacy raw/system rows do not leak when projected Debug is hidden.
- Debug on exposes complete raw detail for unknown/control records.
- Side-panel label is exactly `Debug`.

## Verification

- `bun vitest run apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-block-list.test.tsx`
- UI/termless or story coverage for the side-panel toggle.

## Progress

- Side panel already lists `Debug` under Notifications.
- `ChatPane` forwards the Debug toggle into the projected channel state and into legacy raw-row filtering.
- Added regression coverage proving legacy raw control rows are hidden until Debug is visible:
  - `bun vitest run apps/silvercode/tests/content-layout.test.tsx` — 45 tests passed.
- Added projection-store coverage proving Debug visibility changes projected leaves without mutating retained ChatEvents:
  - `bun vitest run apps/silvercode/tests/chat-session-store.test.ts` — 4 tests passed.
