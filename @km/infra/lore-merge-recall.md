---
id: "@km/infra/lore-merge-recall"
aliases:
  - km-infra.lore-merge-recall
  - km-infra-lore-merge-recall
created_by: Bjørn Stabell
created_at: 2026-04-17T19:37:20Z
closed_at: 2026-04-17T21:00:09Z
close_reason: Phase 1+2 shipped (fold lore internals + extract @bearly/recall).
  123 tests pass. Step A of the final sweep added @bearly/llm; Step B eliminated
  the last dot-dot escape by copying tribe/timers.ts into lore.
  plugins/{lore,recall,llm}/src have zero dot-dot escapes.
---

# [x] Extract @bearly/recall + fold lore internals into plugins/lore/ @km/infra #task #P2

blocks:: [[@km/infra/tribe-rebrand]]

The @bearly/lore package (renamed from @bearly/bear) currently imports from ../../tools/recall/ and ../../tools/lib/history/ — a legacy of bear being carved out of the recall tool. Merge those libraries into the lore package so @bearly/lore is self-contained.

## Scope

Move into plugins/lore/src/:
- vendor/bearly/tools/recall/ → plugins/lore/src/recall/
- vendor/bearly/tools/lib/history/ → plugins/lore/src/history/
- vendor/bearly/tools/lib/lore/ → plugins/lore/src/daemon/ (or keep as lib/)
- vendor/bearly/tools/lore-daemon.ts → plugins/lore/src/daemon.ts
- vendor/bearly/tools/lore.ts (CLI) → plugins/lore/src/cli.ts
- vendor/bearly/tools/recall.ts (CLI) → merge into cli.ts as 'lore recall' subcommand, keep bun recall as thin alias

## Preserve

- /recall skill name unchanged (it's the verb / user-facing surface)
- bun recall 'query' CLI still works (thin alias)
- lore.* MCP methods unchanged
- @bearly/lore package name unchanged

## After

@bearly/lore is self-contained and could be published as a standalone npm package. No more dot-dot imports into sibling directories within the bearly monorepo.

## Acceptance

- grep -rln 'tools/recall\|tools/lib/history\|tools/lib/lore\|tools/lore-daemon\|tools/lore\.ts' vendor/bearly/plugins/lore | wc -l  # → 0 (all moved)
- plugins/lore/ imports resolve without dot-dot
- bun vitest run vendor/bearly/plugins/lore/tests/ passes (all 30 current tests)
- bun recall 'query' still works via alias
- .mcp.json + hooks still work