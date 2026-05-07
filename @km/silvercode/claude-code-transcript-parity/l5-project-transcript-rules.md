---
id: "@km/silvercode/claude-code-transcript-parity/l5-project-transcript-rules"
aliases:
  - km-silvercode.claude-code-transcript-parity.l5-project-transcript-rules
  - km-silvercode-claude-code-transcript-parity-l5-project-transcript-rules
created_at: 2026-05-07T01:20:04.414Z
type: task
priority: P0
status: open
parent: "@km/silvercode/claude-code-transcript-parity"
---

# L5: central projectChatTranscript rules for grouping summaries disclosure and widths #P0

blocks:: [[@km/silvercode/claude-code-transcript-parity]]

## Goal

Centralize all summarization and presentation defaults in `projectChatTranscript(...)`, so every future discussion of expanded/collapsed behavior has one rules table.

## Work

- Own these rules in projection, not scattered render components: ChatNode/ChatLeaf classification, prompt/assistant/work/debug interleaving, work grouping and summaries, default disclosure, width, detail affordance, and chronological placement.
- Produce summaries such as `Read N files`, `Edited N files`, and `Ran N commands` from projection output.
- Preserve order when expanded. Group only when collapsed summary saves space.
- Never group Debug by default; Debug leaves are chronological and filterable by channel.
- Add snapshot-like tests for representative transcript trees.

## Acceptance

- Projection tests cover interleaved prompts/responses, dense work, single work item, Debug leaves, queue, permission, recap, errors, and unknown payloads.
- Summary strings are tested from projection output, not only final rendered text.
- Debug leaves never appear when Debug is hidden.

## Verification

- `bun vitest run apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-block-list.test.tsx`
