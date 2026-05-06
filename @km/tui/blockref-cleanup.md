---
mentions:
  - km
  - claude
id: "@km/tui/blockref-cleanup"
aliases:
  - km-tui.blockref-cleanup
  - km-tui-blockref-cleanup
created_by: claude:d697f216
created_at: 2026-02-25T15:11:29Z
closed_at: 2026-03-10T15:36:58Z
close_reason: Removed <^ID> format, stopped strip-reinject cycle, bare ^ID
  parsed as field metadata, [[^ID]] for cross-refs, unresolved refs render red.
  Tests rewritten.
owner: bjorn@stabell.org
assignee: claude:55df8ef1
---

# [x] Blockref pipeline cleanup: reduce paths, DRY resolution, structured refs @km/tui #task #P2 @claude:55df8ef1

User review of blockref pipeline identified comprehensive cleanup needed:

## 1. Arrow refs should use structured data, not plain text

Current: `→ ^1203783492981970` as plain text in paragraph body.
Should use: structured property like `recur:: [[^1203783492981970]]` or a dedicated frontmatter/data field.
Research how others handle recurring task parent refs. Plain text notation pollutes the body.

## 2. Remove `<^ID>` format — only `[[^ID]]` for links

`<^ID>` angle brackets should NOT be a blockref format. `<>` is for URLs only.
Fix Asana importer to emit `[[^ID]]` instead of `<^ID>`.
Remove `<^ID>` pattern from inline parser.
Investigation needed: where does `<^ID>` come from? What Asana import path produces it?

## 3. Don't strip-and-reinject — parse KMAST directly

Currently @km/block-id/ts strips trailing `^ID` from paragraphs into `node.data.blockId`, then inline-parser.ts re-injects it as a blockref node. This is unnecessary complexity.
Instead: parse the KMAST directly and iterate on the AST nodes. The blockId is already on the AST — use it directly without round-tripping through text manipulation.

## 4. Single resolution path (DRY)

Two paths exist: TreeNode (with cache) and DetailPane (with smart resolver fallback).
Consolidate to ONE shared resolution function. Use caching. NO smart resolver fallback — if exact ID doesn't match, that's an error, not a fallback case.
Also: WHY isn't DetailPane using TreeNode for rendering? It should share the same render path.

## 5. Unresolved refs: warn + render red (not hidden)

Current: unresolved blockrefs return null (hidden). This hides data issues silently.
Fix: log a warning, render as red text showing the ID. Never silently hide content.

## 6. Reduce input formats from 6 to 3-4

Target formats:

- `^ID` at end of block = block identifier (metadata, not a link, not rendered)
- `[[^ID]]` = blockref link (resolved and rendered as green underline)
- `→ [[^ID]]` or structured property = recurring parent ref (to be redesigned per #1)
Remove: `<^ID>`, bare inline `^ID` as links, `![[^ID]]` embed (if unused)

## 7. Only `[[^ID]]` should render as a link

Bare `^ID` in text = block identifier. It designates the ID of the block, NOT a link.
`[[^ID]]` = explicit blockref link. This is the ONLY format that should resolve and render.
This simplifies the model: `^` = identifier, `[[ ]]` = link.

## 8. Block ID integrity

- `^ID` in text should be escapable: parsers/importers must \`\^\` if caret occurs naturally in text
- Only ONE `^ID` per block — throw if more than one found
- Deduplicate against the rest of the knowledge base — throw if duplicate IDs found across blocks
- Consider prefixing with source type to avoid cross-source conflicts: e.g., `^asana:1203783492981970` instead of bare `^1203783492981970`

## 9. DetailPane should use TreeNode for rendering

DetailPane has its own resolution path and rendering logic. It should reuse TreeNode (or a shared render component) instead of duplicating the inline parsing + resolution + rendering pipeline.

