---
id: "@km/tui/tree/v4/p8-type-safety"
aliases:
  - km-tui.tree.v4.p8-type-safety
  - km-tui-tree-v4-p8-type-safety
created_by: Bjørn Stabell
created_at: 2026-04-09T04:11:07Z
closed_at: 2026-04-09T04:46:26Z
close_reason: "14 as-any casts eliminated: 5 logger, 7 globalThis, 2 repo
  coercion. Typed globals in types.ts. 2 hidden type bugs fixed. Commit
  88005e39a."
owner: bjorn@stabell.org
---

# [x] Phase 8: Eliminate as-any casts — logger types + repo coercion @km/tui #task #P2

## What

Fix 17 \`as any\` casts in @km/tui/src/. Two categories:
1. Logger types: \`createLogger(...) as any\` (4 instances) — fix loggily return type
2. Repo coercion: \`repo as any\` in computeHiddenNodeIds (2 instances) — fix ViewLensRepo interface
3. GlobalThis diagnostics: \`(globalThis as any).__km_*\` (6 instances) — typed module or declare global

## /complete

\`\`\`bash
rg 'as any' apps/km-tui/src/ --glob '!*.test.*' --glob '!*.spec.*' -t ts -c | wc -l  # 0
bun tsc --noEmit  # 0 new errors
\`\`\`