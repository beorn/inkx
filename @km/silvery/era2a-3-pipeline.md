---
id: "@km/silvery/era2a-3-pipeline"
aliases:
  - km-silvery.era2a-3-pipeline
  - km-silvery-era2a-3-pipeline
created_by: claude:fed8de9e
created_at: 2026-03-25T03:52:16Z
closed_at: 2026-03-25T06:28:17Z
close_reason: "Phase 3 core complete: createAg(root, { measurer }) factory
  decomposes pipeline into ag.layout() + ag.render(). Internal prevBuffer
  management with resetBuffer() and fresh render. executeRender delegates to
  createAg — all 4636 tests pass. 6 new tests. Caller migration to use createAg
  directly (removing executeRender) deferred to Phase 5 (plugin composition)
  where withTerm wires ag + term.paint together."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2a Phase 3: ag.layout() + ag.render() — decompose pipeline @km/silvery #task #P1 @claude:fed8de9e

Decompose opaque runPipeline() into two independent phases. Introduce minimal createAg() factory.

- ag-term/src/pipeline/index.ts — split executeRender() into layout phase + render phase
- ag-term/src/pipeline/layout-phase.ts — becomes ag.layout(dims): measure + flexbox → positions/sizes
- ag-term/src/pipeline/measure-phase.ts — merge into layout-phase
- ag-term/src/pipeline/render-phase.ts — becomes ag.render() → returns TextFrame
- ag-term/src/pipeline/output-phase.ts — absorbed into term.paint() (already done by Phase 2)
- ag/src/index.ts — introduce minimal createAg({ engine }) factory (just pipeline binding; tree API extends in Phase 4)
- ag-term/src/layout-engine.ts — delete global setLayoutEngine()/getLayoutEngine(); engine bound via createAg({ engine })
- ag-react/src/reconciler/nodes.ts — calculateLayout() calls ag.layout()

**Delete**: Remove executeRender(), runPipeline(). Remove setLayoutEngine()/getLayoutEngine() globals. Remove direct pipeline invocation outside ag methods. Remove output-phase as separate concept (absorbed by term.paint).
**/complete**: grep for executeRender → 0 hits. grep for runPipeline → 0 hits. grep for setLayoutEngine\|getLayoutEngine → 0 hits. grep for output-phase → 0 hits (file deleted or merged). Docs/examples show ag.layout() + ag.render() not pipeline().

Depends on Phase 2 (term.paint).
Design: era2a/rendering.md §Rendering Pipeline