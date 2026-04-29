---
id: "@km/silvery/examples-cleanup"
aliases:
  - km-silvery.examples-cleanup
  - km-silvery-examples-cleanup
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:45Z
---

# [ ] Examples cleanup: move thin demos to docs, delete web/showcases/ @km/silvery #task #P2

Examples cleanup: move thin demos to docs, delete web/showcases/ standalone files

## What This Is
Final cleanup after the 9 flagship examples are built and web infrastructure is unified. Removes redundant files and moves thin demos to docs.

## Prerequisite
ALL other example beads must be complete (infra, gallery, explorer, terminal, components, dashboard).

## Steps

1. Delete web-only showcases that have terminal equivalents:
   - web/showcases/layout-feedback.tsx (replaced by components example or layout/live-resize.tsx)
   - web/showcases/focus.tsx (replaced by components example, Tab 2)
   - web/showcases/text-input.tsx (replaced by components example, Tab 2)
   - web/showcases/theme-explorer.tsx (replaced by new theme example)
   - web/showcases/shared.tsx (dead code — emitMouse/setTermFocused no longer needed with input:true)

2. Evaluate thin terminal examples for docs migration:
   - interactive/outline.tsx (single concept — better as docs embed)
   - interactive/layout-ref.tsx (single concept — better as docs embed)
   - interactive/transform.tsx (single concept — better as docs embed)
   - runtime/hello-runtime.tsx, runtime/elm-counter.tsx, etc. (API demos — docs embeds)
   - inline/inline-simple.tsx, inline/inline-progress.tsx (single concept — docs)

3. Update viewer auto-discovery to only scan the 9 flagship examples (or keep all and mark flagship ones as featured)

4. Update docs references (VitePress config, showcase.html demo= URLs)

5. Final cleanup: remove any dead imports, unused test helpers, stale comments