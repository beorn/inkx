---
id: "@km/silvercode/claude-code-transcript-parity/l5-duplicate-message-coalescing"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-duplicate-message-coalescing
  - km-silvercode-claude-code-transcript-parity-l5-duplicate-message-coalescing
created_at: 2026-05-07T01:19:59.613Z
type: bug
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: duplicate message IDs must coalesce instead of crashing projected transcript #bug #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Screenshot

`/Users/beorn/Desktop/Screenshot 2026-05-06 at 18.18.25.png` shows:

```text
ERROR normalizeAgentEventsToChatEvents duplicate message msg_01GE15xRAqBbnxU9ihrxhHFk
apps/silvercode/src/chat/normalize-agent-event.ts:106:21
```

The crash happens in Debug compare mode while computing projected leaves for `ChatPane`.

## Root Shape

Claude/Codex resume streams can contain both incremental message events and later aggregate `assistant-message` events with the same message id / turn id. The projected path currently treats any second `message.started` as fatal.

Strictness is still required for malformed data. The fix is not to tolerate arbitrary duplicate state; it is to classify known aggregate duplicates as a redundant replay/summary source and retain their raw detail in Debug.

## Acceptance

- A failing regression test reproduces the screenshot sequence.
- Incremental stream plus aggregate assistant message for the same message id does not throw.
- The transcript keeps one canonical message.
- The aggregate duplicate is retained as a Debug-channel event with full raw detail.
- True conflicting duplicates still fail loudly.
- `ChatPane` Debug compare surface cannot crash the whole pane for this known provider duplicate pattern.

## Verification

- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-session-store.test.ts`

## Progress

- Implemented duplicate assistant `turn-start` coalescing for the screenshot shape.
- Repeated same-role `turn-start` records now emit `debug.recorded` with label `Duplicate message start`.
- Conflicting duplicate message starts still throw.
- Regression coverage:
  - `apps/silvercode/tests/chat-agent-event-normalization.test.ts`
  - `apps/silvercode/tests/chat-session-store.test.ts`

Latest verification:

- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts` — 4 tests passed.
- `bun vitest run apps/silvercode/tests/chat-session-store.test.ts` — 4 tests passed.
