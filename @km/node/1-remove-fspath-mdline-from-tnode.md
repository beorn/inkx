---
mentions:
  - km
id: "@km/node/1-remove-fspath-mdline-from-tnode"
aliases:
  - km-node.1
  - km-node-1
  - "@km/node/1"
created_at: 2026-01-16T22:22:02Z
closed_at: 2026-01-17T00:14:28Z
---

# [x] Remove fsPath/mdLine from TNode @km/node #task #P1

## Phase 0: Warmup cleanup

Remove storage-layer properties from TNode that leak across layers.

### Changes

1. Remove from TNode type (packages/@km/tree/src/types.ts):
  - Delete `fsPath?: string`
  - Delete `mdLine?: number`
2. Update nodeToTNode() in apps to stop copying these properties
3. Simplify @km/_orphan/opentui/App.tsx to always use storage query path

### Files

- packages/@km/tree/src/types.ts
- apps/@km/_orphan/cli/src/tui2/tui2.tsx
- apps/@km/tui/packages/@km/_orphan/opentui/src/App.tsx

### Verification

- `bun run typecheck` passes
- `bun run test:fast` passes
- Press 'e' in TUI still opens editor at correct line

