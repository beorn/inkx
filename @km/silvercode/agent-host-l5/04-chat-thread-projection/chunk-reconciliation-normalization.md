---
aliases:
  - km-silvercode.agent-host-l5.04-chat-thread-projection.chunk-reconciliation-normalization
  - km-silvercode-agent-host-l5-04-chat-thread-projection-chunk-reconciliation-normalization
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Canonical chunk reconciliation and stream normalization #feature #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/04-chat-thread-projection]]

Provider chunks are transport deltas, not UI blocks. Build one normalization layer that reconciles provider text/thought/tool deltas into canonical `Message`, `Block`, `Thought`, `Tool`, `Plan`, `Job`, and lifecycle events before ChatTree projection.

## Work

- Define the normalized stream event contract and id/stitching rules.
- Reconcile split markdown links, code fences, tables, OSC8 links, thought deltas, tool updates, duplicate ids, late completions, replay rows, and provider-specific aggregate blocks.
- Preserve raw event provenance for the traffic log viewer.
- Delete renderer-owned chunk stitching once ChatTree projection owns it.

## Complete Criteria

- Focused tests cover pathological chunk boundaries across Claude, Codex, ACP/opencode, and fake providers.
- `stream-chunk-boundary-marshalling` is either closed as a symptom fixed by this substrate or linked as a regression fixture source.
- `rg -n "chunk.*SessionUpdateList|ContentBlock.*chunk|assistant-text|\\breasoning\\b" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` has zero live projection hits except provider-boundary/raw fixture text.
