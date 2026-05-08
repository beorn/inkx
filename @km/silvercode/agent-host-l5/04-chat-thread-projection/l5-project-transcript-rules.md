---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-project-transcri\
  pt-rules"
---

# [/] L5: central projectChatTranscript rules for grouping summaries disclosure and widths #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

## Goal

Centralize all summarization and presentation defaults in `projectChatTranscript(...)`, so every future discussion of expanded/collapsed behavior has one rules table.

## Work

- Own these rules in projection, not scattered render components: ChatNode/ChatLeaf classification, prompt/assistant/work/debug interleaving, work grouping and summaries, default disclosure, width, detail affordance, and chronological placement.
- Produce summaries such as `Read N files`, `Edited N files`, and `Ran N commands` from projection output.
- Preserve order when expanded. Group only when collapsed summary saves space.
- Never group Debug by default; Debug leaves are chronological and filterable by track.
- Add snapshot-like tests for representative transcript trees.

## Acceptance

- Projection tests cover interleaved prompts/responses, dense work, single work item, Debug leaves, queue, permission, recap, errors, and unknown payloads.
- Summary strings are tested from projection output, not only final rendered text.
- Debug leaves never appear when Debug is hidden.

## Verification

- `bun vitest run apps/silvercode/tests/chat-transcript-projection.test.ts apps/silvercode/tests/chat-block-list.test.tsx`

blocks:: [[@km/silvercode/parity-claude]]
