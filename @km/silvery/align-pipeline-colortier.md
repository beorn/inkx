---
id: "@km/silvery/align-pipeline-colortier"
aliases:
  - km-silvery.align-pipeline-colortier
  - km-silvery-align-pipeline-colortier
created_by: claude:c6244087
created_at: 2026-04-23T19:40:40Z
closed_at: 2026-04-23T19:59:19Z
close_reason: Closed
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.align-pipeline-colortier
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T12:40:53Z
    created_by: claude:c6244087
    metadata: "{}"
---

# [x] Rename pipeline ColorLevel → ColorTier (drop local alias) @km/silvery #task #P3

blocks:: [[@km/silvery]]

Post-plateau alignment: pipeline layer uses `type ColorLevel = ColorTier` as a local alias. Same concept under two names creates drift risk — when caps renamed `colorLevel` → `colorTier` in Phase 7, the pipeline's local `ColorLevel` didn't cascade.

## Current state
- `vendor/silvery/packages/ag-term/src/pipeline/backdrop/plan.ts:79` defines `type ColorLevel = ColorTier`
- `vendor/silvery/packages/ag-term/src/pipeline/index.ts:68` re-exports `ColorLevel`
- `vendor/silvery/packages/ag-term/src/pipeline/backdrop/index.ts:102` re-exports
- `vendor/silvery/packages/ag-term/src/ag.ts:47` imports as `BackdropColorLevel` (another alias layer)
- Call-sites use `colorLevel: BackdropColorLevel` field (ag.ts:80, 179, 273, 443)
- plan.ts uses `colorLevel: ColorLevel` in its options + internal vars (~20 hits)

## Renames
- `type ColorLevel = ColorTier` → deleted; pipeline imports `ColorTier` directly
- `BackdropColorLevel` alias → deleted
- `options.colorLevel` → `options.colorTier` across plan.ts, ag.ts
- Internal var `const colorLevel` → `const colorTier`

## Why
Alignment principle (docs/principles.md): aliased types create drift surface. The pipeline doesn't earn its own color-tier vocabulary; it's applying caps's decision. One name per concept across the stack.

## Scope
Silvery-only, internal. No external consumers of `ColorLevel` type (would grep in km otherwise). ~5 files, ~25 references.

## Acceptance
- rg 'BackdropColorLevel' vendor/silvery → 0 hits
- rg '\bColorLevel\b' vendor/silvery → 0 hits (except the retired-name migration note)
- pipeline typechecks + tests pass