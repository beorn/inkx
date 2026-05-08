---
closed_at: 2026-05-07T21:47:17.488Z
closeReason: "Verified complete in working tree: duplicate assistant
  starts/aggregates/orphan completions coalesce into Debug or canonical state
  without crashing; conflicting duplicates still fail. Tests: bun vitest run
  apps/silvercode/tests/chat-agent-event-normalization.test.ts
  apps/silvercode/tests/chat-session-store.test.ts -t
  'duplicate|aggregate|orphan|conflicting|f9eb64dc' -> 2 files passed, 4 tests
  passed; plateau focused suite -> 9 files passed, 100 tests passed."
---

# [x] L5: duplicate message IDs must coalesce instead of crashing projected transcript #bug #P0

blocks:: [[@km/silvercode/parity-claude]]

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

Claude/Codex resume streams can contain both incremental message events and later aggregate `assistant-message` events with the same message id / turn id. The projected path previously treated any second `message.started` as fatal.

The May 7 strict replay of `claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f` exposed three concrete Claude JSONL shapes:

- Split assistant aggregate rows: several top-level `type:"assistant"` JSONL rows share the same `message.id`, with different content blocks (`thinking`, `text`, `tool_use`). These must merge into one canonical `ChatMessage`; dropping later rows would lose transcript content and tools.
- Split aggregate rows can each carry `stop_reason:"end_turn"`. The parser emits a `turn-end` after each row, but the projected transcript must defer completion until the final split row so later parts do not append to a completed message.
- Historical `tool_result` rows can appear before the matching assistant row containing the `tool_use` id. The projection must reorder the completion after the tool start when the start exists later, while preserving truly orphaned tool results in Debug.
- Real strict replay of `claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f` does not report React render errors for duplicate messages, completed-message appends, or unknown tool completions.
- Split assistant aggregate rows with the same message id now merge into one canonical message and contribute additional text/reasoning/tool-ref parts without emitting duplicate `message.started`.
- Intermediate `turn-end` records inside a split assistant aggregate are deferred; only the final completion is projected.
- Out-of-order `tool-result` records are held until their matching `tool.started` event is projected. True unmatched completions become `debug.recorded` with label `Orphan tool result`.
- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-session-store.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-event-handling.test.ts apps/silvercode/tests/chat-block-list.test.tsx` — 5 files passed, 16 tests passed.
- `npx tsc --noEmit --pretty false` from `apps/silvercode` — passed.
- `npx oxfmt --check src/chat/normalize-agent-event.ts src/chat/project-transcript.ts tests/chat-agent-event-normalization.test.ts tests/chat-session-store.test.ts` — passed.
- `git diff --check` on the scoped files — passed.
- `SILVERY_STRICT=1 DEBUG='silvery:*,silvercode:*' DEBUG_LOG=/tmp/silvercode-strict4-after3.log bun run ./apps/silvercode/src/bootstrap.ts --resume claude:f9eb64dc-d982-4a46-9a8e-da5fd882ac5f` — ran for 12 seconds; no React render error for duplicate message, completed message append, or unknown tool completion. Existing strict layout-overflow warnings remain a separate UI/layout issue.
