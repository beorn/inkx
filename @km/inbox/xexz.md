---
id: "@km/inbox/xexz"
aliases:
  - km-xexz
  - "@km/_orphan/xexz"
created_at: 2026-01-14T19:51:30Z
closed_at: 2026-01-24T01:06:12Z
---

# [x] Implement wiki link embeddings (![[...]]) with transclusion support @km/_orphan #feature #P2

## Summary

Wiki link embeddings (`![[...]]`) transclude content from the target. The embedding becomes a link node pointing to the target.

## Implementation Status (2026-01-23)

### ✅ COMPLETE

**Phase 1: Parser**
- Parser detects `![[...]]` vs `[[...]]` ✅
- `embedded: boolean` in WikiLink interface ✅
- Tests for embedding detection ✅

**Phase 2: Target Resolution** (completed in vault-loader.ts)
- Embeddings resolved during vault loading ✅
- `link_to` set to target node ID ✅
- `link_alias` extracted and stored ✅
- Optimized with file index for O(1) lookup ✅

**Phase 4: Serialization** (completed in nodes2md.ts)
- Reconstructs `![[path|alias]]` from `link_to` + `link_alias` ✅
- Fallback to content if target not found ✅
- Tests for resolved embedding serialization ✅

### ⏳ PARTIAL - Display

**TUI Display** (TreeNode.tsx)
- Resolves target node for display properties ✅
- Shows target's content, task_status, metadata ✅
- Parent context shows original location ✅

### ❓ OPEN QUESTION - Phase 3: Tree Transclusion

The bead originally specified "Pull children from target into link node" but current behavior is:
- Embedding shows TARGET's metadata
- But children come from EMBEDDING node (which is empty for paragraphs)

For visual transclusion:
- Should `getChildren(embeddingNode.id)` return target's children?
- Or only transclude when "zoomed into" the embedding?

This affects navigation semantics and should be a separate decision.

## Architecture Decision (2026-01-17)

### KNode Fields

```typescript
interface KNode {
  link_to: string | null;      // Target node ID for embeddings
  link_alias?: string;         // Optional display alias from |alias syntax
}
```

### Visual Indicator

The parent node showing IS the visual indicator. When zoomed into an embedding, you see transcluded content. No special TUI styling needed.
