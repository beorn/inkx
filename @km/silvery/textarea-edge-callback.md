---
id: "@km/silvery/textarea-edge-callback"
aliases:
  - km-silvery.textarea-edge-callback
  - km-silvery-textarea-edge-callback
created_by: claude:0940ca20
created_at: 2026-04-24T23:16:26Z
closed_at: 2026-04-24T23:31:30Z
close_reason: "Implemented TextArea onEdge callback. Silvery commits: 2b03f6ba
  (feat: prop+wire-up), c0ffeeda (test: 8 contract tests), 4d46c3b0 (docs).
  Tests: 53/53 pass (45 pre-existing + 8 new). Files:
  vendor/silvery/packages/ag-react/src/ui/components/{TextArea.tsx,useTextArea.\
  ts}, vendor/silvery/docs/components/TextArea.md,
  vendor/silvery/tests/features/textarea-onedge.test.tsx"
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.textarea-edge-callback
    depends_on_id: km-silvercode.queue-option-b
    type: parent-child
    created_at: 2026-04-24T16:16:26Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] TextArea: onEdge callback fires when arrow hits buffer boundary (enables focus handoff) @km/silvery #feature #P1

blocks:: [[@km/silvercode/queue-option-b]]

## Goal

Silvery's `<TextArea>` clamps the cursor at boundaries (up at first line stays at first line; down at last line stays at last line). Consumers who want to HAND OFF focus to a neighboring widget at those boundaries have no signal — they have to intercept Up/Down in their own useInput and read the cursor position via a ref, which is fragile.

## Proposed API

```tsx
<TextArea
  value={...}
  onChange={...}
  onEdge={(edge: 'top' | 'bottom' | 'left' | 'right') => boolean}
/>
```

Fires when an arrow key is pressed AT the buffer boundary (i.e., the key would otherwise clamp). If the handler returns `true`, silvery treats the key as consumed (cursor doesn't move). Return `false` or no handler → silvery does its normal clamp-to-boundary.

## Consumer

`km-silvercode.queue-option-b` needs this for the two-TextArea queue/command focus handoff design.

## Acceptance

- `onEdge` prop documented in docs/components/TextArea.md
- Contract test in `tests/features/textarea-onedge.test.tsx` — 3 sibling TextAreas, Up/Down at boundaries, handler returns true in the middle one → cursor doesn't clamp; false → cursor clamps normally
- Left/right edges fire on horizontal arrow boundaries (for future single-line focus handoff designs)
- Existing TextArea tests + silvercode tests still pass