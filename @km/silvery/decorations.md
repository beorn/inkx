---
mentions:
  - km
id: "@km/silvery/decorations"
aliases:
  - km-silvery.decorations
  - km-silvery-decorations
created_by: claude:28b14b32
created_at: 2026-02-23T22:19:35Z
closed_at: 2026-03-09T23:48:59Z
close_reason: "Already implemented: Decoration, DecorationStyle,
  splitIntoSegments, createSearchDecorations, adjustDecorations in
  packages/tea/src/text-decorations.ts. Barrel export added. 25 tests pass."
owner: bjorn@stabell.org
---

# [x] Text decorations API (SlateJS-style ranges) for search highlighting @km/silvery #feature #P3

Add a decoration/range API to hightea Text components, inspired by SlateJS's decorate pattern. Consumers provide character-level ranges with styling overrides; the rendering pipeline splits text at range boundaries and applies per-segment styles.

## Motivation

Search highlighting currently requires the caller (@km/tui TreeNode) to override the entire card's background and text color at the Box level. This is coarse-grained — it highlights the whole row, not just the matching text within it. A decoration API would allow highlighting specific character ranges within rendered text.

## SlateJS Pattern

SlateJS uses a `decorate([node, path]) → Range[]` callback at render time. Each Range has anchor/focus Points plus custom properties. Slate splits text into 'leaves' at range boundaries, each leaf inheriting decoration properties. Key insight: decorations are ephemeral (computed at render time, not stored in document state).

## Proposed hightea API

```tsx
// Option A: prop on Text
<Text decorations={[{ start: 5, end: 10, backgroundColor: 'white', color: 'black' }]}>
```

