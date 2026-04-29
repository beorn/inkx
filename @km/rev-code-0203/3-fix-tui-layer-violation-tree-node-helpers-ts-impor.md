---
id: "@km/rev-code-0203/3-fix-tui-layer-violation-tree-node-helpers-ts-impor"
aliases:
  - km-rev-code-0203.3
  - km-rev-code-0203-3
  - "@km/rev-code-0203/3"
created_at: 2026-02-03T13:47:58Z
closed_at: 2026-02-03T14:20:07Z
---

# [x] Fix TUI layer violation: tree-node-helpers.ts imports @km/markdown @km/rev-code-0203 #bug #P2 @claude:b3478afd

## Problem

apps/@km/tui/src/tree-node-helpers.ts:8 imports from @km/markdown. Per architecture (App → Board → Tree → Storage → Parser → Filesystem), TUI (App layer) should not directly import Parser layer packages. It should go through Tree or Board.

## File
- apps/@km/tui/src/tree-node-helpers.ts:8

## Approach
1. Identify what tree-node-helpers needs from @km/markdown
2. Check if Board or Tree layer already exposes this functionality
3. If not, add the needed API to the appropriate intermediate layer
4. Update tree-node-helpers.ts to use the intermediate layer