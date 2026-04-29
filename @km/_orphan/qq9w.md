---
id: "@km/_orphan/qq9w"
aliases:
  - km-qq9w
created_at: 2026-01-21T14:21:21Z
closed_at: 2026-01-22T11:41:46Z
---

# [x] Experiment: Unified marker styling - single fold/empty indicator with task status in title @km/_orphan #task #P2

Interactive experiment with user to implement new 'cards' styling for TreeNode markers.

## Changes Implemented

### 1. Unified Fold Markers (icons.ts)
- `●` (U+25CF) - FOLDED: has children, they're hidden (BIG)
- `•` (U+2022) - UNFOLDED: has children, they're visible (MEDIUM)
- `·` (U+00B7) - EMPTY: no children (TINY)
- Marker inherits node's color if set

### 2. Task Status Icons - Ballot Box Style (icons.ts)
- `☐` (U+2610) - todo (white)
- `☐` (U+2610) - wip (yellow)
- `☒` (U+2612) - blocked (red)
- `☑` (U+2611) - done (green)
- `☒` (U+2612) - dropped (gray)

### 3. TreeNode Layout
- Marker + space + [status icon + space if task] + content
- Status icon prepended to content, not separate marker slot

### 4. Terminal Cleanup (render.ts)
- Added escape sequences to fix scroll behavior after exit

### 5. Storybook Cleanup (storybook.tsx)
- Fixed trailing blank lines from 500-row buffer

## Known Issue: Background Color Bleeding

Yellow selection background bleeds across wrapped lines in multiline/cards mode.
This is likely an issue in inkx or flexx, not km code.

Need to investigate:
- vendor/beorn-inkx - rendering layer
- How Text with backgroundColor handles wrapped content

## Files Modified
- apps/@km/tui/packages/@km/_orphan/ink/src/icons.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/views/TreeNode.tsx
- apps/@km/tui/packages/@km/_orphan/ink/src/views/tree-node-helpers.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/engines/inkx/render.ts
- apps/@km/tui/packages/@km/_orphan/ink/tests/storybook.tsx
- apps/@km/tui/packages/@km/_orphan/ink/tests/text/icons.test.ts