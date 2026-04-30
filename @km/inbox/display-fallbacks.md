---
id: "@km/inbox/display-fallbacks"
aliases:
  - km-display-fallbacks
  - "@km/_orphan/display-fallbacks"
created_at: 2026-01-23T09:43:46Z
closed_at: 2026-01-23T10:08:19Z
---

# [x] Audit display.ts fallback chain - throw on invariant violations @km/_orphan #chore #P2

## Background

`packages/km-tree/src/display.ts` has `getNodeDisplayName()` with a 6-level fallback chain:

1. `data.name` (frontmatter title)
2. `node.title` / `data.title` (pre-parsed title)
3. First section's title (for files)
4. `node.content` (for tasks)
5. `fs_path` filename
6. Short ID

## Analysis Needed

Per CLAUDE.md §14, determine for each node type:
- **folder**: Must have `fs_path`. Missing = bug
- **file**: Must have `fs_path`. Missing = bug
- **section**: Must have `title` or `content`. Missing = bug
- **task**: Must have `content`. Missing = bug

## Task

Replace the fallback chain with type-specific logic that throws on invariant violations:

```typescript
function getNodeDisplayName(node: Node): string {
  switch (node.type) {
    case "folder":
    case "file":
      if (!node.fs_path) throw new Error(`${node.type} ${node.id} missing fs_path`);
      // ... extract name from path
    case "section":
      if (!node.title && !node.content) throw new Error(`section ${node.id} missing title/content`);
      // ...
    case "task":
      if (!node.content) throw new Error(`task ${node.id} missing content`);
      // ...
  }
}
```

Keep legitimate fallbacks (frontmatter name > H1 > filename) but throw if the required field is missing entirely.