---
id: "@km/silvery/scrollbar"
aliases:
  - km-silvery.scrollbar
  - km-silvery-scrollbar
created_by: Bjørn Stabell
created_at: 2026-04-03T07:26:35Z
owner: bjorn@stabell.org
---

# [ ] Scrollbar — configurable, mouse-clickable, draggable (CC doesn't have) @km/silvery #feature #P2

Visual scrollbar for alt modes. Claude Code has no scrollbar — pure keyboard/wheel scrolling with no position indicator. Silvery should have one.

## Features
- Visual position indicator (where you are in content)
- Mouse-clickable: click a position to jump there
- Mouse-draggable: drag the thumb to scroll
- Configurable: show/hide, width (1 char default), style (block/line/dots)
- Shows proportion of visible content vs total

## Positioning
- Right edge of viewport by default
- Could be left edge (configurable)
- Rendered in overlay layer (doesn't affect layout)

## Interaction
- Click on track: jump to that position (page-up/down style or direct position)
- Drag thumb: smooth scroll to position
- Hover: show position info (line N of M, or percentage)

## Modes
- inline: N/A (terminal handles scrollbar)
- altInline: default (configurable off)
- altScreen: default (configurable off)

## Done when
- Scrollbar renders with correct proportional thumb
- Click-to-jump and drag-to-scroll work
- Configurable visibility and style