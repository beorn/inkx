---
mentions:
  - km
id: "@km/inbox/psrg"
aliases:
  - km-psrg
  - "@km/_orphan/psrg"
created_at: 2026-01-16T10:49:14Z
closed_at: 2026-01-16T11:31:01Z
---

# [x] Verify Navigating actions match km-board-navigation.md spec @km/_orphan #task #P3

Verify that the existing navigating (zoom) implementation matches the spec AND that terminology is consistent throughout.

## Spec Requirements (from @km/board-navigation/md)

| Key     | Action                    |
| ------- | ------------------------- |
| u       | Zoom out (root → parent)  |
| Enter/o | Zoom in (root → selected) |
| [       | History back              |
| ]       | History forward           |

## CRITICAL: Terminology Consistency

The term 'navigating' has a SPECIFIC meaning in @km/board-navigation/md:

- **navigating** = changing board root (zoom in/out, history back/forward)
- **NOT** cursor movement (that's 'cursoring' or 'cursor-select')

Search for and fix any instances where:

- 'navigate' is used for cursor movement
- 'navigation' is used for anything other than zoom/root changes
- 'nav' actions are used for cursor movement (NAV_PREV_SIBLING, etc. are structural, not visual)

Correct terminology:

- CURSOR_* actions = 'cursor-select' or 'cursoring'
- ZOOM_*, NAV_BACK, NAV_FORWARD = 'navigating'
- NAV_PREV_SIBLING, etc. = 'structural navigation' (internal, not user-facing)

## Verification Checklist

- [ ] u triggers ZOOM_OUT
- [ ] Enter triggers ZOOM_IN with current node
- [ ] o triggers ZOOM_IN with current node (if implemented)
- [ ] [ triggers NAV_BACK
- [ ] ] triggers NAV_FORWARD
- [ ] Tests exist for all navigation keys
- [ ] Code comments use 'navigating' only for zoom/root changes
- [ ] Test descriptions use 'navigating' only for zoom/root changes
- [ ] Help text uses consistent terminology

## Files to Check

- packages/@km/_orphan/tui-core/src/shellExecutor.ts - Key mappings and comments
- packages/@km/_orphan/tui-core/src/commandParser.ts - Commands and comments
- packages/@km/_orphan/tui-core/src/types.ts - Action type comments
- apps/@km/_orphan/cli/tests/sh/keys.test.md - Test section names and descriptions
- Any help/documentation in the TUI

