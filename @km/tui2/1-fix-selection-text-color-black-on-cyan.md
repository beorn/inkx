---
id: "@km/tui2/1-fix-selection-text-color-black-on-cyan"
aliases:
  - km-tui2.1
  - km-tui2-1
  - "@km/tui2/1"
created_at: 2026-01-16T22:07:50Z
closed_at: 2026-01-17T00:07:25Z
---

# [x] Fix selection text color (black on cyan) @km/tui2 #bug #P0

Selected items show red/magenta text on cyan background. Should be black text on cyan background per docs/08-ui.md design system.

**Root cause**: OpenTUI rendering issue. The code correctly specifies color='black' (and we tried hex #000000), but OpenTUI renders it as red/magenta.

**BLOCKED**: By OpenTUI upstream issue 002 (text color ignored when backgroundColor is set)

**Workaround**: Use `inverse` styling instead of explicit colors (limited - doesn't solve colored icons in selection)

**Files**: apps/@km/tui/packages/@km/_orphan/opentui/src/components/TreeNode.tsx

See: vendor/opentui/issues/002-color-rendering.md