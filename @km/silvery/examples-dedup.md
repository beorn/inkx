---
id: "@km/silvery/examples-dedup"
aliases:
  - km-silvery.examples-dedup
  - km-silvery-examples-dedup
created_by: Bjørn Stabell
created_at: 2026-04-10T21:46:54Z
closed_at: 2026-04-10T21:53:23Z
close_reason: examples/ is now the @silvery/examples package. Uncurated examples
  moved to vendor/internal/silvery/examples-wip/. Single source of truth, zero
  duplication.
---

# [x] Deduplicate examples — single location in packages/examples/examples/ @km/silvery #task #P3

Make examples/ the @silvery/examples package directly. Move package.json + bin/cli.ts from packages/examples/ into examples/. Delete packages/examples/. Result: bun examples/layout/text-layout.tsx works AND bunx @silvery/examples works. Zero duplication, shortest paths.