---
mentions:
  - km
id: "@km/tribe/plugin-v2"
aliases:
  - km-tribe.plugin-v2
  - km-tribe-plugin-v2
created_by: claude:19080504
created_at: 2026-03-26T07:45:29Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.plugin-v2
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-18T11:00:14Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [ ] TribePlugin v2: pipe() composition + provides/requires (SlateJS/TEA pattern) @km/tribe #feature #P3

blocks:: [[@km/tribe]]

Upgrade TribePlugin interface from callback-based to composition-based, following silvery's TEA/SlateJS patterns.

## Current (v1)

`{ name, available(), start(ctx), instructions() }` — simple but no dependency declaration, no interception, no typed context evolution.

## Proposed (v2)

`{ name, provides?, requires?, available(), enhance?(surface), start?(surface), instructions?() }`

Key additions:

1. **provides/requires**: declare dependencies, loader does topological sort
2. **enhance(surface)**: SlateJS-style — plugin wraps/extends the context object (intercept sendMessage, add methods)
3. **pipe() composition**: `pipe(baseSurface, withBeads(), withGit(), withRouting())`

## Research

Full analysis at /tmp/llm-19080504-local-multimodal-vision-models-xeov.txt (TEA/SlateJS patterns section).
See also: vendor/silvery/packages/create/src/pipe.ts, vendor/silvery-internal/design/era2/era2b/app.md

## When needed

When implementing hub-spoke routing (@km/tribe/hub), telemetry plugins, or third-party tribe plugins that need to intercept core operations.

