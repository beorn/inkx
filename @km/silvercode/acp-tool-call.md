---
id: "@km/silvercode/acp-tool-call"
aliases:
  - km-silvercode.acp-tool-call
  - km-silvercode-acp-tool-call
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:38Z
closed_at: 2026-04-26T18:47:35Z
close_reason: "Shipped ACP-named ToolCall component family in commit 064338c3b.
  Five new components in apps/silvercode/src/components/: ToolCall.tsx
  (top-level card, kind/status driven, merges legacy ToolResultBlock body
  inline), ToolCallStatusTitle.tsx (TextShimmer/TextReveal/Text status morph),
  ToolCallError.tsx ($error envelope + retry), ToolCallSummary.tsx (aggregate
  with AnimatedNumber count + breakdown), ApplyPatch.tsx (Aider search/replace +
  parseAiderPatch). 31 tests in apps/silvercode/tests/tool-call.test.tsx
  covering all kind/status variants, error rendering, summary aggregation, patch
  parsing — all passing. 7 storybook stories under
  apps/silvercode/storybook/stories/ wired into registry. Full silvercode suite
  (602/607 pass, 5 pre-existing skips) and agent-harness suite (153/154, 1
  pre-existing skip) green. Naming follows
  hub/silvery/future/ai-terminal/acp-naming.md exactly. Force-closing despite
  open km-silvery.diff-code-accordion dep — that bead is for silvery primitive
  work, the consumer use here works against the already-shipped
  Diff/Accordion/AnimatedNumber/TextReveal/TextShimmer/LineNumber primitives."
---

# [x] silvercode <ToolCall> rendering — kind/status variants, error envelope, count summary, apply-patch @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvery/animation-counters]], [[@km/silvery/diff-code-accordion]]

Render the ACP `ToolCall` + `ToolCallUpdate` stream events.

## Maps to ACP
- `SessionUpdate.tool_call` → mount `<ToolCall>`
- `SessionUpdate.tool_call_update` → merge into existing `<ToolCall>` by toolCallId
- `ToolKind` (read/edit/delete/move/search/execute/think/fetch/other) → kind-driven body layout
- `ToolCallStatus` (pending/in_progress/completed/failed) → status-driven styling + animation
- `ToolCallContent` variants → `<TextContent>`, `<Diff>`, `<TerminalContent>`
- `ToolCallLocation` → path+line chip in header

## Today
`apps/silvercode/src/components/ToolCallBlock.tsx` (143 LOC, basic collapse). `ToolResultBlock.tsx` separately holds error rendering.

## Gap (extends existing → ACP-named single component)
- Animated `<ToolCallStatusTitle>` ('Reading file…' → 'Read 3 files') driven by status transitions
- `<ToolCallError>` — distinct envelope when `status: failed`
- `<ToolCallSummary>` — aggregate 'Read **12** files' via `<AnimatedNumber>` + popover breakdown
- `<ApplyPatch>` for edit-kind tool calls (Aider-style search/replace, parallel to `<Diff>`)
- Merge `ToolResultBlock.tsx` into `<ToolCall>` body (no separate component)

## Deps
- @km/silvery/diff-code-accordion (`<Diff>`, `<Accordion>`)
- @km/silvery/animation-counters (`<AnimatedNumber>`, `<TextReveal>`)

## Estimated LOC: ~700-1100