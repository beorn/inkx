---
aliases:
  - km-silvery.render-stateless-pipeline-audit
  - km-silvery-render-stateless-pipeline-audit
created_at: 2026-05-05T22:40:00.000Z
---

# Audit cross-frame state in silvery render pipeline (Phase 0 of stateless-pipeline reframe) #task #P2

Phase 0 of `@km/silvery/render-stateless-pipeline-reframe` (P1 epic). Pre-requisite for Phase 1 (move caches to per-frame scope) and Phase 2 (rebuild buffer from scratch each frame).

## Goal

Produce a single-table catalogue of every place mutable state survives a frame in silvery's render pipeline. For each entry: owner, purpose, what would break if rebuilt fresh, perf cost of rebuild, recommended phase to migrate.

This is a no-code-change audit. Output: a table in this bead, plus a 1-page architectural diagram showing the current state-flow and the target state-flow.

## Targets to inspect

Start here, in priority order (most-to-least likely to be the cyan-strip class root cause):

| Location                                                                                                        | Hypothesis                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| packages/ag-term/src/ag.ts — RenderPostState carrier                                                            | Explicit cross-frame state container; every field is a candidate               |
| packages/ag-term/src/pipeline/decoration-phase.ts — outlineSnapshots (hoisted onto RenderPostState in 78c63075) | Outline rectangles painted last frame, used to clear stale outlines this frame |
| packages/ag-term/src/pipeline/render-phase.ts — ExcessClearGate accumulators (c7cf9390)                         | Structural invariant for excess-area clears                                    |
| packages/ag-term/src/pipeline/clear-region.ts — clearNodeRegion / clearExcessArea (5c3a266c)                    | Region-clear coordinator state                                                 |
| packages/ag-term/src/buffer.ts — TerminalBuffer mutation methods                                                | Incremental setCell/fill/scrollRegion mutate prev-frame buffer in place        |
| packages/ag-term/src/renderer.ts — instance.prevBuffer, instance.prevPostState                                  | The actual cross-frame surface in render()                                     |
| Any pipeline-phase module's top-level let / useRef / closure-captured mutable                                   | Hidden state that bypasses React's per-render scope                            |

## Output table format

```
| Cache                  | Owner                | Purpose                          | Perf cost if fresh | Hidden-state risk | Phase |
|------------------------|----------------------|----------------------------------|--------------------|-------------------|-------|
| outlineSnapshots       | RenderPostState      | clear stale outline rects        | O(visible_outlines) | High (origin of  cyan-strip suspect) | 1 |
| ...                    | ...                  | ...                              | ...                | ...               | ...   |
```

## Acceptance

- All targets in the table above have an entry
- Each entry has a 1-2 sentence "what breaks if rebuilt fresh" answer (verify by grepping consumers, not by guessing)
- Each entry has a recommended phase (1, 2, or 3 of the parent epic)
- An architectural diagram (markdown box-art or mermaid) showing current state-flow and the target stateless flow
- Filed as updates to this bead (close on completion, link to the parent epic)

## Method

Read-only investigation. Use Read + grep, no code changes. Outputs:

- `vendor/silvery/hub/silvery/audits/state-survives-frame-2026-05-05.md` (or similar location in hub) — full audit doc
- This bead's resolution section — table + summary + recommendation

Recommended for: silvery agent (it has full pipeline context).

Time budget: 4-8 hours of focused inspection. May surface secondary findings (e.g., specific fields on `TerminalBuffer` that should already be per-frame but aren't) that get filed as P3 cleanup beads.

## Why this comes first

The reframe (`@km/silvery/render-stateless-pipeline-reframe`) is 2-4 weeks of focused work and risks regressing 7+ existing fixes if approached blindly. The audit forces us to enumerate exactly what we're migrating before changing anything, which:

1. Surfaces hidden state we forgot about
2. Gives us a per-cache phase plan instead of "just rewrite it"
3. Lets us measure progress (N caches migrated of M total)
4. Documents the rationale for each migration in case we need to roll back individual phases

