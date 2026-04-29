---
id: "@km/inkx/scrollback-list"
aliases:
  - km-inkx.scrollback-list
  - km-inkx-scrollback-list
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:49:21Z
closed_at: 2026-02-26T08:10:47Z
owner: bjorn@stabell.org
assignee: claude:d1f60fb4
---

# [x] ScrollbackList — virtual screen with terminal scrollback overflow @km/inkx #feature #P1 @claude:d1f60fb4

A React component for inline-mode terminal apps that manages a scrolling list where completed items freeze into terminal scrollback, live items render in the viewport, and a footer (status bar) stays pinned at the bottom.

## Three Freeze Modes

### Mode 1: Voluntary Freeze
Component calls freeze() to signal it is done. Safe to remove from React tree.
Static render cached (tagged with terminal width). Item data/props kept for resize recovery.

### Mode 2: Requested Freeze
ScrollbackList signals component it is approaching the scrollback boundary (freezeAhead).
Component does cleanup (finish animation, flush streaming), then calls freeze().
Same outcome as Mode 1.

### Mode 3: Forcible Freeze (Shadow Rendering)
Component enters scrollback without calling freeze(). Legitimate design pattern
(e.g., a planning document that grows/revises while partially in scrollback).
- Snapshot taken via renderStringSync() and written to scrollback
- Component stays in React tree, renders to shadow buffer (not terminal)
- Shadow output compared against cached snapshot (only when component re-renders)
- If different -> corruption detected -> nuke-and-redraw

## DECSTBM Scroll Region for Pinned Footer
- Set scroll region to rows 1..(termRows-1), status bar at row termRows
- CRITICAL: Lines scrolled out of a DECSTBM region are DISCARDED, not saved to scrollback
- Therefore: frozen content must be written to stdout EXPLICITLY before region scroll
- The scroll region only handles footer pinning, not scrollback preservation

## Nuke-and-Redraw Recovery
Triggered when:
- Mode 3 component updates while in scrollback (corruption detected)
- Terminal resize (width changed) -- reflows ALL content at new width
- Explicit request (app wants full refresh)

Process:
1. CSI 3J -- clear terminal scrollback (widely supported: xterm, iTerm2, Kitty, Ghostty, WezTerm)
2. CSI 2J -- clear viewport
3. Re-render ALL items from data at current width
4. Frozen items: use cached static render if same width, else re-render from data
5. Items flow through scroll region again

## Storage Model
- Item data/props: always kept (needed for resize re-render)
- Static cache: kept for frozen items, tagged with terminal width
- React node: removed for Mode 1/2, kept for Mode 3

## Key Behaviors
- Bottom-aligned: content grows upward, no empty space at start
- DECSTBM pins footer outside scroll region
- Frozen items written to stdout with OSC 133 markers, then removed from React tree
- Mode 3 items render to shadow buffer, compared on re-render only
- Resize triggers full nuke-and-redraw with content reflow
- CSI 3J clears scrollback on nuke-and-redraw

## Replaces
- useScrollback hook
- height={termRows} pattern
- Manual scrollbackOffset coordination in output-phase

## Validated By
Deep research (O3): Design confirmed sound. DECSTBM caveat about discarded lines identified
and addressed. No other terminal framework does this -- unique approach.