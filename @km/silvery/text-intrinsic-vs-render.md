---
mentions:
  - km
  - claude
id: "@km/silvery/text-intrinsic-vs-render"
aliases:
  - km-silvery.text-intrinsic-vs-render
  - km-silvery-text-intrinsic-vs-render
created_by: claude:53042a7f
created_at: 2026-04-26T05:24:39Z
closed_at: 2026-04-26T07:52:36Z
started_at: 2026-04-26T05:26:07Z
owner: bjorn@stabell.org
assignee: claude:53042a7f
dependencies:
  - issue_id: km-silvery.text-intrinsic-vs-render
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-25T22:24:43Z
    created_by: claude:53042a7f
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Separate intrinsic measurement from render-time clipping in silvery Text + flexily min-content @km/silvery #feature #P2 @claude:53042a7f

blocks:: [[@km/silvery]]

Per /pro review (GPT-5.4 Pro + Kimi K2.6 dual-pro, 2026-04-26):

The flexily auto-min-size approximation (max-content vs spec-correct min-content) is treating a symptom of a deeper bug: silvery's Text measureFunc conflates intrinsic content sizing with render-time viewport clipping. Browsers don't do this. Multi-target (DOM) parity will be painful if we don't fix it.

## Architectural fix (Phase 1)

1. **silvery Text**: separate intrinsic measurement from render-time clipping
  - measureFunc for wrap=truncate/clip/false should return naturalWidth for both min-content and max-content (these are equivalent for non-wrappable text per CSS)
  - Truncation is a paint-phase concern; render reads layout.width and clips text to that
  - Add intrinsic size API: minContentWidth() + maxContentWidth() separate from measure(constraints)
2. **flexily**: switch auto-min-size to spec-correct min-content (revert max-content approximation in layout-zero.ts)
  - Currently uses baseSize as content-min proxy
  - With Text fix above, min-content == max-content for non-wrappable text → dashboards keep working
  - For wrappable text, items shrink to longest-unbreakable-word (CSS-correct)
3. **silvery TextProps**: extend FlexboxProps so Text accepts flexShrink/flexGrow/flexBasis/minWidth
  - Escape hatch + canonical CSS pattern for sizing leaf items
  - Currently the API hole that forced Box wrapper in dashboard fix attempt
4. **silvery whiteSpace / textWrap inheritance**: one prop at row level instead of per-child
  - whiteSpace='pre' for preformatted padded columns
  - whiteSpace='normal' for prose
  - Inherited through component tree

## Tests that need updating

5 ink-compat tests + 1 silvery clipping test currently codify the old conflation behavior. They expect Text to report constrained/rendered width as its layout width. After the fix: Text reports natural width; layout allocates min(naturalWidth, available); render truncates at the allocated width.

Per pro: 'shim Ink at the reconciler layer, not in the layout engine's intrinsic measurement'.

## Files

- vendor/silvery/packages/ag-react/src/reconciler/nodes.ts:140-220 (Text measureFunc — the conflation site)
- vendor/silvery/packages/ag/src/types.ts:625 (TextProps — needs FlexboxProps extension)
- vendor/flexily/src/layout-zero.ts:455-720 (auto-min-size — switch from max-content proxy to true min-content)
- vendor/silvery/tests/compat/ink/generated/components.test.tsx (5 truncate tests — update expectations)
- vendor/silvery/tests/features/render-phase-adapter-clipping.test.tsx (1 truncate test — update)
- /tmp/llm-53042a7f-review-the-auto-min-size-implementation-0e0i.txt (full pro response with API sketch offer)

## Multi-target implication

DOM target requires CSS-correct min-content for flex auto-min-size. Without this fix, components 'looking fine' in terminal/canvas would lay out differently in DOM. The fix is the load-bearing piece for honest multi-target parity.

## Acceptance

- flexily auto-min-size uses min-content, not max-content
- silvery Text reports naturalWidth for non-wrappable, longest-unbreakable-word for wrappable
- silvery dashboard keeps working without per-cell flexShrink={0} wrappers
- Ink-compat tests updated to test new (correct) semantics
- silvercode + @km/tui smoke tests pass
- Add flex item props to Text + whiteSpace inheritance

## Status

OPEN — architectural refactor estimated at multi-session, requires pro sign-off on specific API shapes (pro offered to sketch them)

