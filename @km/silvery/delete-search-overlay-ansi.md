---
id: "@km/silvery/delete-search-overlay-ansi"
aliases:
  - km-silvery.delete-search-overlay-ansi
  - km-silvery-delete-search-overlay-ansi
created_by: claude:5e447b66
created_at: 2026-04-24T21:42:31Z
closed_at: 2026-04-24T22:38:48Z
close_reason: "Both migrations landed and verified. Selection:
  vendor/silvery@5d8d8f9a (or equivalent 2494636b from parallel session) +
  trailing-cell fix at 18dc8845. Search highlight + bar:
  vendor/silvery@c4a0c9fd, d9d6bbaf, 7474f193. 124/124 selection+search tests
  pass with SILVERY_STRICT=1. km submodule pointer at d6dd9c8b6."
---

# [x] Migrate search overlay (renderSearchHighlights/renderSearchBarOverlay) off ANSI-past-buffer pattern @km/silvery #task #P3

blocks:: [[@km/silvery]]

Sibling of @km/silvery/delete-render-selection-overlay (closed 2026-04-24).

Same architectural anti-pattern, same latent bug class.

## Sites

vendor/silvery/packages/ag-term/src/runtime/create-app.tsx:2554-2555
  renderSearchHighlights()
  renderSearchBarOverlay()

vendor/silvery/packages/ag-term/src/runtime/renderer.ts:526 (renderSearchHighlights)
vendor/silvery/packages/ag-term/src/runtime/renderer.ts:563 (renderSearchBarOverlay)
  // both write inverse ANSI directly past the canonical buffer:
  target.write(`\\x1b[${dims.rows};1H${bar}`)

## Bug shape (same as the selection overlay was)

When highlights move/shrink (e.g., user edits search query, narrowing matches; or scrolls highlights off-screen), the previously-painted highlight cells stay inverse on the terminal because the buffer-diff has nothing to repaint — the buffer cells didn't change, only the overlay did.

## Fix pattern

Mirror the selection migration:
1. Define composeSearchHighlightCells(buffer, matches, theme?) returning SelectionCellChange[]-like
2. Apply changes to a paint clone of the buffer (NOT the canonical) before runtime.render — same paintFrame helper currently in create-app.tsx for selection
3. The status bar (dims.rows;1H) is genuinely a fullscreen-fixed overlay position — that one might still need to write past the buffer OR we cleanly fold it into the buffer's last row before output. Decide during implementation.

## Acceptance

- grep 'renderSearchHighlights\\|renderSearchBarOverlay' in src/ returns zero hits outside selection-renderer.ts deleted-on tombstone
- Termless test: edit search query to narrow matches → previously-highlighted cells repaint clean
- Termless test: scroll search highlights out of viewport → cells repaint clean
- SILVERY_STRICT=1 passes on search test suite
- @km/tui search functionality still works visually (bun km view ~vault, /, type, narrow)