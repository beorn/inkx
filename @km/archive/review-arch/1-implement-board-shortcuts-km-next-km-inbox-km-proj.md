---
mentions:
  - next
  - inbox
  - km
projects:
  - project
id: "@km/review-arch/1-implement-board-shortcuts-km-next-km-inbox-km-proj"
aliases:
  - km-review-arch.1
  - km-review-arch-1
  - "@km/review-arch/1"
created_at: 2026-01-23T09:11:25Z
closed_at: 2026-01-23T09:20:14Z
---

# [x] Implement board shortcuts: km @next, km @inbox, km +project @km/review-arch #feature #P2

## @km/review-arch/1-implement-board-shortcuts-km-next-km-inbox-km-proj: Implement Board Shortcuts

**Scope:** ~50 lines of code

### Changes

1. **apps/@km/_orphan/cli/src/index.ts** - Add sigil detection
- Add `isBoardShortcut(arg)` function
- Add command* event handler to transform `km @next` → `km view @next`
5. **packages/@km/storage/src/db-queries.ts** - Add sigil resolution
- In `resolveNode()`, add step 0: sigil detection
- Match `@name` → `@name.md` filename

### Implementation

```typescript
// index.ts - after command registration, before parse()
function isBoardShortcut(arg: string): boolean {
  return /^[@+#]/.test(arg) && !arg.startsWith('/') && !arg.startsWith('.');
}

const args = process.argv.slice(2);
if (args.length === 1 && isBoardShortcut(args[0])) {
  process.argv.splice(2, 0, 'view');
}
```

### Test

```bash
km @next     # Opens @next board
km @inbox    # Opens @inbox board
km +project  # Opens +project board
```

