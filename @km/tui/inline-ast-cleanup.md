---
mentions:
  - km
  - claude
id: "@km/tui/inline-ast-cleanup"
aliases:
  - km-tui.inline-ast-cleanup
  - km-tui-inline-ast-cleanup
created_by: claude:4c413aae
created_at: 2026-02-21T16:21:26Z
closed_at: 2026-02-21T16:39:08Z
owner: bjorn@stabell.org
assignee: claude:4c413aae
---

# [x] Inline AST cleanup: eliminate stripForDisplay and stripFgColor holdovers @km/tui #task #P2 @claude:4c413aae

## Goal

Complete the inline AST migration by eliminating remaining old-system holdovers.

## Tasks

### 1. Eliminate stripForDisplay() from views

`stripForDisplay()` (from @km/tree) pre-processes DB content before `<InlineText>`. The inline parser already handles block refs and fields, but:

- Fields render as styled `key:: value` instead of being stripped (card titles don't want this)
- Arrow refs `→ ^numericId` are partially handled (^id becomes blockref, but `→ ` stays)

**Fix**: The InlineRenderContext already has `stripRefs` — but we also need fields to render as empty in card title contexts. Either:

- Add field nodes to blockref-like "render empty" behavior when a context flag is set
- Or have stripForDisplay's work absorbed into the parser's @km/_orphan/syntax handling

Sites: TreeNode.tsx (2), NodeView.tsx (4), render.ts (1)

### 2. Eliminate stripFgColor() from views

`stripFgColor()` strips ANSI fg colors from `infoSuffix` and `dateBadge` — pre-formatted ANSI badge strings.

**Fix**: Convert badge rendering from ANSI string construction to React components. Then selection highlighting works via `noColor` context or parent `<Text color={...}>` inheritance.

Sites: TreeNode.tsx (2), NodeView.tsx (2)

### 3. Clean up rich.ts

After #1 and #2:

- `stripFgColor` may become unused → delete
- `displayLength` is a thin wrapper around `string-width` → evaluate if still needed or consolidate
- If rich.ts becomes empty, delete it and update index.ts

### 4. Asana re-fetch (manual step, not code)

Cached JSON still has old Turndown output. Re-fetch to get clean HTML→mdast conversions:

```
bun km import asana --workspace Stabell --fetch --fetch-restart
bun km import asana --workspace Stabell --import --force
```

