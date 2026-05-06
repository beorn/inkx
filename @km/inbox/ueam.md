---
mentions:
  - km
  - km
  - km
id: "@km/inbox/ueam"
aliases:
  - km-ueam
  - "@km/_orphan/ueam"
created_at: 2026-01-16T15:30:22Z
closed_at: 2026-01-16T15:38:52Z
---

# [x] Refactor km-sh to use @km/tree instead of @km/board @km/_orphan #task #P3

@km/_orphan/sh currently depends on @km/board but only uses:

- nodes: TNode[]
- cursor: TPath
- getNodeAtPath, getSiblings queries

It doesn't use any Board-layer features:

- No ViewMode (always text output)
- No fold/collapse
- No selection
- No zoom stack
- No navigation history

@km/_orphan/sh should depend on @km/tree directly with minimal state:

```typescript
interface ShellState {
  nodes: TNode[];
  cursor: TPath;
  rootId: string | null;
  rootPath: string | null;
}
```

This aligns with the 5-layer architecture where @km/_orphan/sh works at Tree layer, not Board layer.

