---
id: "@km/_orphan/satisfies-commands"
aliases:
  - km-satisfies-commands
created_at: 2026-01-25T12:20:05Z
closed_at: 2026-01-25T12:30:21Z
assignee: unimac
---

# [x] Convert CommandDef exports to use satisfies pattern @km/_orphan #chore #P4 @unimac

50+ command definitions use explicit type annotation:
```typescript
export const cursorPrev: CommandDef = { ... }
```

Better pattern using satisfies:
```typescript  
export const cursorPrev = { ... } satisfies CommandDef
```

**Benefits**: Better inference of literal types, type validation without narrowing.

**Files**: packages/@km/_orphan/commands/src/commands/*.ts (navigation.ts, task.ts, edit.ts, view.ts, selection.ts, history.ts)