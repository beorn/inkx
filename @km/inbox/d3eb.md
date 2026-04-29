---
id: "@km/_orphan/d3eb"
aliases:
  - km-d3eb
created_at: 2026-01-22T23:03:46Z
closed_at: 2026-01-22T23:10:06Z
assignee: c9572d71
---

# [x] Review codebase for verbose debug() simplification @km/_orphan #task #P3 @c9572d71

Scan the codebase for verbose multi-line debug() calls using format specifiers like:

```typescript
debug(
  "resolved: vaultRoot=%s, nodeRef=%s",
  resolved.vaultRoot,
  resolved.nodeRef,
);
```

And simplify to concise object form:

```typescript
debug("resolved", resolved);
```

Files to check:
- apps/@km/_orphan/cli/src/commands/*.ts
- packages/*/src/**/*.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/**/*.ts

Pattern to grep: `debug(` followed by multi-line content

See CLAUDE.md section 12 for the new debug logging style guide.