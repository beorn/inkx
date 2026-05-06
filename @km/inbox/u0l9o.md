---
mentions:
  - km
  - claude
id: "@km/inbox/u0l9o"
aliases:
  - km-u0l9o
  - "@km/_orphan/u0l9o"
created_at: 2026-01-27T13:54:29Z
closed_at: 2026-01-27T14:05:22Z
assignee: claude:77f7a68e
---

# [x] Add inline mode to inkx for progress indicators @km/_orphan #feature #P2 @claude:77f7a68e

Currently inkx assumes it controls a rectangular area and uses absolute cursor positioning ([H to home), which clears the screen even with alternateScreen: false.

**Goal**: Make inkx support inline rendering (start from current cursor, use cursorUp() to update in place) like MultiProgress does.

**Use cases**:

- @beorn/tap parallel TUI (currently using manual ANSI codes)
- MultiProgress in @beorn/inkx-ui (consolidate on inkx)
- Any progress indicator that should render inline

**Requirements**:

- Preserve all inkx benefits (layout calculations, component composition, layout feedback)
- Support both modes: alternate screen (fullscreen TUI) and inline (progress bars)
- API: render(<Component />, { mode: 'inline' | 'fullscreen' })

**Design considerations**:

- Inline mode tracks initial cursor position, renders relative from there
- Uses cursorUp(lines) instead of absolute positioning
- May need separate layout strategy (no absolute coords)

**Files to modify**:

- vendor/beorn-inkx/src/render.tsx - add inline mode support
- vendor/beorn-tap/src/parallel-tui.ts - migrate back to inkx
- vendor/beorn-inkx-ui/src/cli/multi-progress.ts - migrate to inkx

