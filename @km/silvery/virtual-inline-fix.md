---
id: "@km/silvery/virtual-inline-fix"
aliases:
  - km-silvery.virtual-inline-fix
  - km-silvery-virtual-inline-fix
created_by: claude:def7f8a1
created_at: 2026-03-17T05:45:12Z
closed_at: 2026-03-18T18:56:29Z
close_reason: "Grooming: All 5 children closed. VirtualScrollback, ListDocument,
  TextSurface, ListView implemented with tests. Design validated by
  pro-review-6."
owner: bjorn@stabell.org
assignee: claude:def7f8a1
---

# [x] Fix virtual inline mode architecture — semantic scrollback, not frame snapshots @km/silvery #task #P1 @claude:def7f8a1

## Problem

Silvery's virtual inline mode was implemented but has fundamental architecture issues that make it unusable as a real altscreen solution.

### The real problem: inline mode's UX failures

The primary motivation isn't zero flicker — it's **scroll stability and history preservation**. Inline mode has three fundamental UX failures:

1. **Scroll fighting** — reading history, new output arrives, viewport snaps to bottom. Scroll up again, more output, snapped again. Maddening during streaming.
2. **Compaction destroys history** — ScrollbackList clears and re-emits frozen items. Everything above the frozen prefix is gone. Users lose context.
3. **Can't read while streaming** — assistant is typing, you want to read earlier context. Impossible because viewport follows new output.

These are **inherent to inline mode** because the terminal owns the viewport. The app can't say "keep the user's scroll position stable while I append at the bottom."

**Altscreen solves all three** because the app controls the viewport:
- Scrolled up? Stay there. New content goes to virtual buffer but viewport doesn't move.
- No compaction — circular buffer with configurable capacity.
- Read while streaming — scroll position is app-controlled, independent of output.

### What altscreen breaks (complete list)

| Feature | Status in silvery |
|---------|------------------|
| Text selection (mouse drag) | **Done** — selection.ts, mode-independent |
| Copy to clipboard | **Done** — OSC 52, mode-independent |
| Scrollback history | **Broken** — virtual-scrollback stores frame snapshots, not semantic content |
| Search (Cmd+F equivalent) | **Partially done** — search-overlay.ts exists but searches frame snapshots |
| Scroll up through history | **Broken** — wheel/keyboard scroll shows frame snapshots |
| URL/hyperlink clicking | Not implemented |
| Screen reader accessibility | Not addressed |
| Multiplexer clipboard conflicts | Not addressed (terminal-level issue) |
| Bracketed paste cleanup on crash | Not addressed |

### What's wrong with current implementation

1. **code-agent.tsx demo** doesn't use virtualInline mode — broken, deleted
2. **Virtual scrollback stores rendered frame rows** (screen snapshots) not semantic content — scrolling up shows old screen states, not a continuous document
3. **No integration with ScrollbackList** — the two are incompatible rather than composable
4. **No integration with VirtualList** — another missed composition point

## Component Taxonomy (target architecture)

Three axes: Storage × Content Model × Screen Mode

| Component | Storage | Content | Screen Mode | Exists? |
|-----------|---------|---------|-------------|---------|
| ScrollbackList | Terminal scrollback | List | Inline | **Yes** |
| ScrollbackView | Terminal scrollback | Viewport | Inline | **Yes** |
| VirtualList | React tree | List | Either | **Yes** |
| VirtualScrollbackList | Virtual buffer | List | Altscreen | **No — needed** |
| VirtualScrollbackView | Virtual buffer | Viewport | Altscreen | **No — needed** |

VirtualScrollbackList/View = altscreen equivalents of ScrollbackList/View. Same API, same freeze semantics, but frozen content goes to an in-app virtual buffer instead of terminal scrollback.

### Key design principles

1. **Same API** — switching between ScrollbackList and VirtualScrollbackList should be a component swap (or prop), not a rewrite
2. **Semantic content** — virtual buffer stores rendered item content (ANSI strings), not screen frame snapshots
3. **Freeze composability** — frozen items leave the React tree and go to the virtual buffer, just like ScrollbackList pushes to terminal scrollback
4. **Search over semantic content** — search-overlay searches the virtual buffer items, not raw screen rows
5. **Don't touch useScrollback internals** — the scrollback code is fragile. Extend via the existing StdoutContext interface

## Why Gemini CLI Failed (lessons learned)

Gemini CLI tried altscreen, reverted to inline by default (v0.17.1). Root causes:
1. **Copy required Ctrl+S modal** — users expected native drag-to-select
2. **Scroll wheel sluggish** — some terminals report fewer scroll events
3. **No terminal detection** — activated on incompatible terminals
4. **Resize corruption** — visual glitches when resizing in altscreen
5. **Can't toggle dynamically** — required app restart to switch modes

What silvery already does better: Buffer-level selection (no Ctrl+S mode), OSC 52 clipboard, incremental diff rendering. Our selection.ts is closer to Gemini's planned fix than their current implementation.

## Requirements

- Terminal detection (graceful degradation to inline when altscreen unsupported)
- aichat demo should be the showcase (add `--virtual` flag)
- Scrollback code is fragile — extend via StdoutContext, don't modify internals
- Get /pro-review feedback on design before implementing