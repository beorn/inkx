---
id: "@km/_orphan/hfpf"
aliases:
  - km-hfpf
created_at: 2026-01-19T10:10:01Z
closed_at: 2026-01-19T14:00:33Z
---

# [x] List view: Fix parent context display for embedded tasks @km/_orphan #bug #P2

## Problem
In list view, embedded tasks show parent context in TWO places:
1. On a separate line above the task (current behavior)
2. To the right of the task inline (also current behavior)

This is redundant and wastes vertical space. In list view where everything is one-liner format, only the inline parent context should be shown.

Additionally, there's artificial line length cropping that shouldn't exist - lines should only be truncated at screen width, not before.

## Current Behavior
```
    T010 - Share Transfer              <- separate parent line
  ✓ Review current status < T010...    <- inline context (redundant)
```

## Expected Behavior  
```
  ✓ Review current status of transfer < T010 - Share Transfer
```
- Single line per task
- Parent context only shown inline to the right
- Line truncation only at screen edge, not artificial cropping

## Implementation Guidance

### Check TreeNode and ListView Configuration
The parent context display is controlled in TreeNode. ListView should configure TreeNode differently than other views.

Key files to review:
- `apps/km-tui/packages/km-ink/src/views/TreeNode.tsx` - showSeparateContext logic
- `apps/km-tui/packages/km-ink/src/views/ListView.tsx` - how it renders TreeNode
- `apps/km-tui/packages/km-ink/src/views/tree-node-helpers.ts` - truncateContext

### Questions to Answer
1. Can TreeNode be configured to NOT show separate context line?
2. Is there a variant prop or config that controls this?
3. Where is the artificial line width truncation happening?
4. Is constrainText being called with wrong width?

### Relevant Code Sections
In TreeNode.tsx:
```tsx
// Multi-line context handling
const isMultiLine = additionalLines.length > 0;
const showInlineContext = !isMultiLine && truncatedContext;
const showSeparateContext = isEmbedded && parentContext;  // <- This always shows for embedded
```

The `showSeparateContext` logic may need a variant-aware check for list view.

## Visual Acceptance Test
```bash
ttyd -W -p 7681 bun km view -r /tmp/tst-repo @next.md &
sleep 5
# Navigate to list view (press 'v' twice)
# Capture screenshot
# Verify: no duplicate parent context, no premature truncation
```

## Acceptance Criteria
1. Embedded tasks show parent context ONLY inline (to the right)
2. No separate parent context line above embedded tasks in list view
3. Lines extend to full screen width before truncation
4. Visual test confirms single-line format with inline context only