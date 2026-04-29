---
id: "@km/tui/tree/p4-factory"
aliases:
  - km-tui.tree.p4-factory
  - km-tui-tree-p4-factory
created_by: Bjørn Stabell
created_at: 2026-04-08T23:59:11Z
closed_at: 2026-04-09T00:35:08Z
close_reason: ReactiveNodeStore class converted to createNodeStore() factory.
  NodeStore type alias exported. 4 consumers updated. Commit 11422cefa.
---

# [x] Phase 4: Convert ReactiveNodeStore class to createNodeStore() factory @km/tui #task #P2

## What

Convert ReactiveNodeStore from a class to a factory function (createNodeStore). Aligns with principles.md: factories not classes.

After Phases 2-3, the class should be significantly simpler — sync methods and bridges gone. What remains is the reduced engine wrapper + signal accessors.

## Changes

- \`reactive.ts\` — rewrite \`class ReactiveNodeStore\` as \`function createNodeStore()\` returning a plain object with the same API surface
- All consumers — update type annotations (ReactiveNodeStore → NodeStore or inferred)

## Delete

- \`class ReactiveNodeStore\` declaration
- \`new ReactiveNodeStore()\` construction

## /complete

\`\`\`bash
rg 'class ReactiveNodeStore' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
rg 'new ReactiveNodeStore' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
bun run test:fast  # all pass
\`\`\`