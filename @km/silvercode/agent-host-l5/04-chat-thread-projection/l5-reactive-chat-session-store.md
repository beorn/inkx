---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-reactive-chat-se\
  ssion-store"
---

# [/] L5: reactive ChatSession store with accumulated state and projected ChatTree #P0

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

## Goal

Make `ChatSession` the live projected state for transcript rendering, not a type-only substrate beside legacy `MessageEntry[]`.

## Current Partial State

`createChatSessionProjectionStore(...)` exists and derives `events`, `tree`, `visibleLeaves`, and `session()` from the strict `SessionStore.events` log. It still sits beside the legacy renderer and does not yet own every UI state surface.

## Work

- Add/finish a single owner for canonical ChatEvents and accumulated ChatSession state.
- Accumulate messages, parts, tools, plan, queue, permissions, session metadata, status, and debug/history state.
- Preserve `ChatTreeState` disclosure/selection/raw-inspector state keyed by `ChatNodeId`.
- Ensure Debug/channel toggles re-filter projected leaves without reparsing provider records.
- Decide whether the public mutation entry point is `applyChatEvent(event)` or a projection-store subscription; avoid parallel mutation paths.

## Acceptance

- `ChatSession.tree` and accumulated `ChatSession` data derive from the same canonical ChatEvents.
- Toggling Debug changes visible projected leaves without mutating or reparsing retained events.
- Tests prove messages/tools/permissions/plan/session metadata accumulate from the canonical event stream.
- No component needs provider raw records to decide transcript visibility.

## Verification

- `bun vitest run apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts`

blocks:: [[@km/silvercode/parity-claude]]

