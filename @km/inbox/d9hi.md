---
id: "@km/inbox/d9hi"
aliases:
  - km-d9hi
  - "@km/_orphan/d9hi"
created_at: 2026-01-16T15:12:43Z
closed_at: 2026-01-16T15:21:04Z
---

# [x] Refactor data model: add 'name' field, rename 'content' to 'body' @km/_orphan #task #P2

## Goal
Add `name` field at ALL layers for consistent identity:
- **DBNode** (storage): `name` derived from filename/md_slug
- **TNode** (tree): propagated from DBNode
- **NodeViewModel** (board): propagated from TNode

Also rename `content` → `body` in UI layers (TNode/NodeViewModel) for semantic clarity.

## Field Semantics After Refactoring

| Concept | DBNode (storage) | TNode/NodeViewModel (UI) |
|---------|------------------|--------------------------|
| **Name** | `name` (NEW) | `name` |
| **Title** | `title` | `title` |
| **Body** | `content` | `body` |

- `name`: stable identifier (filename without .md, or slugified heading)
- `title`: display text (from H1 or explicit)  
- `body`/`content`: text content below the title

---

## Implementation Steps

### Step 1: Core Types ✅
- [x] Add `name?: string` to DBNode in packages/@km/_orphan/core/src/types.ts
- [x] Add `name?: string` to NodeCreatedData
- [x] Mark `md_slug` as DEPRECATED (use `name` instead)

### Step 2: Markdown Parser
- [ ] Set `name` during parsing in packages/@km/markdown/src/ast2nodes.ts
  - File nodes: filename without .md
  - Section nodes: same as md_slug

### Step 3: Storage Layer
- [ ] Add `name TEXT` column to DB schema in:
  - packages/@km/storage/src/store.ts
  - packages/@km/storage/src/db.ts
- [ ] Update `rowToNode()` to extract `name`
- [ ] Update INSERT statements to include `name`
- [ ] Set `name` for folder nodes during vault scan

### Step 4: Tree/UI Transformation ✅  
- [x] Update `nodeToTNode()` in apps/@km/_orphan/cli/src/commands/sh.ts
  - Changed `slug` → `name`
  - Added `body: node.content`
- [x] Update `getPromptPath()` in apps/@km/_orphan/sh/src/shellExecutor.ts
  - Changed `node.slug` → `node.name`

### Step 5: Clean Up Property Access
- [ ] Remove `getNodeSlug()` helper (use `node.name` directly)
- [ ] Simplify `getNodeName()` to just return `node.name`
- [ ] Update display.ts to use `node.name` when available

### Step 6: Tests
- [ ] Update test schemas in packages/@km/storage/tests/query.test.ts
- [ ] Add test cases verifying name/title separation

---

## Verification
\`\`\`bash
bun run test:fast   # Quick iteration (~4s)
bun fix             # Lint + format
bun run test:all    # Full test suite before commit
\`\`\`