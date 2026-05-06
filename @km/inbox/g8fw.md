---
mentions:
  - km
id: "@km/inbox/g8fw"
aliases:
  - km-g8fw
  - "@km/_orphan/g8fw"
created_at: 2026-01-19T10:09:29Z
closed_at: 2026-01-19T14:00:27Z
---

# [x] Fix overflow clipping issues in cards and columns views @km/_orphan #bug #P2

## Problem

Content overflows into areas it shouldn't:

### Cards View

- Card content goes underneath overflow indicator
- Card content overflows into bottom status bar

### Columns View

- Content overflows into overflow indicator (indicator correctly positioned above status bar)

### List View (reference - working correctly)

- Overflow indicator and bottom bar have one blank line between them
- List content correctly stops above overflow indicator

## Implementation Guidance

### Check Constraint System Usage

Compare broken views against ListView (which works correctly):

Key files to review:

- `apps/km-tui/packages/km-ink/src/views/CardsView.tsx`
- `apps/km-tui/packages/km-ink/src/views/CardColumn.tsx`
- `apps/km-tui/packages/km-ink/src/views/ColumnsView.tsx`
- `apps/km-tui/packages/km-ink/src/views/ListView.tsx` (reference - working)
- `apps/km-tui/packages/km-ink/src/constraints/ScrollableList.tsx`
- `docs/dev/ink-patterns.md`

### Questions to Answer

1. Are cards/columns views setting explicit heights on containers?
2. Is overflowY="hidden" applied correctly?
3. Does the constraint context propagate correct heights?
4. Is there a mismatch between estimated and actual item heights?

### Ink Layout Gotchas (from ink-patterns.md)

- flexGrow without height constraint can cause overflow
- overflowY="hidden" only works with explicit height
- Content can bleed through if parent doesn't clip

## Reproduction Steps

1. Load a board with many items that overflow vertically
2. Switch to cards view - observe content bleeding into overflow indicator and status bar
3. Switch to columns view - observe content bleeding into overflow indicator

## Visual Acceptance Test

```bash
# Headless capture script:
ttyd -W -p 7681 bun km view -r /tmp/tst-repo @next.md &
sleep 5

# Cards view - scroll to see overflow
HEADLESS=true bun x playwright screenshot http://localhost:7681 /tmp/overflow-cards.png

# Columns view
# Press 'v' then capture
# Content should NOT overlap with overflow indicator or status bar
```

## Expected Behavior

- Content stops cleanly at overflow indicator boundary
- No content visible behind/underneath overflow indicators
- Status bar always has clean separation from content

