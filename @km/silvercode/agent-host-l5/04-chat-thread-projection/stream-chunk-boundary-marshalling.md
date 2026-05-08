---
aliases:
  - km-silvercode.stream-chunk-boundary-marshalling
  - km-silvercode-stream-chunk-boundary-marshalling
created_at: 2026-05-08T04:05:31.356Z
closed_at: 2026-05-08T08:03:45.168Z
closeReason: "Shipped 15ec2bec6. ChatEvent normalization now coalesces adjacent
  provider text/thought deltas by message, block type, provider kind, and
  blockIndex; preserves rawRefs/eventIds; docs record the stream-normalization
  contract. Evidence: bun vitest run
  apps/silvercode/tests/chat-agent-event-normalization.test.ts
  apps/silvercode/tests/chat-message-summary.test.tsx --testNamePattern
  'Markdown links split across text ops' passed (1 focused regression, 57
  skipped by pattern); earlier focused chat normalization suite passed 5 files,
  35 pass, 1 skipped; npx tsc --noEmit passed."
---

# [x] Silvercode stream chunk boundaries corrupt Markdown links and chat blocks #bug #P1 @agent/3

## Problem

Streaming text chunks are currently treated inconsistently across Silvercode render paths:

- ChatTree normalization can expose provider `text-delta` packet boundaries as separate visible text blocks.
- The legacy `SessionUpdateList` renderer inferred `\n` or `\n\n` between adjacent text ops based on punctuation and capitalization.

This corrupts Markdown when a provider splits inside syntax. The screenshot example split a file link between the colon and line number:

```markdown
[parse.ts](/Users/beorn/Code/pim/km/apps/silvercode/packages/agent-harness/src/parse.ts:
572)
```

That must reconstruct exactly as:

```markdown
[parse.ts](/Users/beorn/Code/pim/km/apps/silvercode/packages/agent-harness/src/parse.ts:572)
```

## Contract

Provider chunks are bytes, not paragraphs, Markdown blocks, or UI blocks. Deltas concatenate exactly until a real semantic boundary appears. Markdown block and inline structure are parser output, not stream timing.

## Acceptance

- Adjacent `text-delta` events for the same message become one exact text block in ChatEvent normalization.
- Text deltas do not coalesce across intervening tool activity.
- Provider aggregate text blocks remain separate semantic blocks.
- Legacy adjacent text-delta ops concatenate without inferred whitespace before Markdown parsing.
- Legacy replayed aggregate text blocks render as separate semantic blocks instead of collapsing into one paragraph.
- A Markdown link split inside the href renders as a link label, not raw `[text](href)` syntax.
- The invariant is documented for future ACP/OpenACP/provider work.

## Evidence

- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts`
- `bun vitest run apps/silvercode/tests/chat-message-summary.test.tsx --testNamePattern "Markdown links split across text ops"`

