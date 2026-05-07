---
mentions:
  - km
  - claude
id: "@km/inkx/mouse-events"
aliases:
  - km-inkx.mouse-events
  - km-inkx-mouse-events
created_by: claude:d3a7049b
created_at: 2026-02-20T15:57:19Z
closed_at: 2026-02-21T08:11:54Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] DOM-level mouse events: scroll, click, double-click on components @km/inkx #feature #P2 @claude:d3a7049b

DOM-level mouse events for inkx — React DOM parity.

## Phases

### Phase 1: Mouse Events Core (inkx)

1. Add mouse event props to BoxProps/TextProps (onClick, onDoubleClick, onMouseDown/Up, onMouseMove, onMouseEnter/Leave, onWheel)
2. Tree-based hit testing (DFS walk of InkxNode screenRect, last-sibling-wins, overflow:hidden clipping)
3. Synthetic event dispatch (InkxMouseEvent mirroring React.MouseEvent, bubbling from target to root)
4. Double-click detection (300ms/2-cell default, configurable)
5. Scroll container default behavior (VirtualList + overflow:scroll handle onWheel, auto-stopPropagation when scrolled)
6. mouseenter/mouseleave (no bubble, track hover transitions)
7. Testing API (app.click(x,y), app.wheel(x,y,delta), app.doubleClick(x,y))

### Phase 2: Link Component (inkx)

1. 
  <Link href="..."> component (wraps Text + sets OSC 8 hyperlink + registers onClick)
2. LinkHandlerProvider context (scheme → handler registry, like Electron protocol)
3. Default onClick dispatches to scheme handler (preventDefault skips navigation)
4. Unknown scheme handling (warn in dev, no-op in prod)
5. Mouse cursor shape on hover (OSC 22 for Kitty terminals)

### Phase 3: Semantic Entity Components (@km/tui)

1. <Tag name="..."> — renders #name with tag color, links to km://tag/name
2. <User name="..."> — renders @name with user color, links to km://user/name
3. <Project id name> — renders +name with project style, links to km://node/id
4. <NodeRef id title> — renders title as link, links to km://node/id
5. <ExternalLink href> — renders with url style, links externally
6. km:// scheme handler registration at app startup
7. Storybook entries for all entity components
8. Markdown renderer integration (auto-convert @mentions, #tags, [links] to entity components)

### Phase 4: Keyboard Events (future, deferred)

- onKeyDown/onKeyUp on components
- FocusProvider for focus-based key routing
- Click-to-focus (clicking focusable element gives it focus)
- Backwards-compatible with useInput/useInputLayer

## Design doc

vendor/beorn-inkx/docs/mouse-events-design.md

## Deep research review

/tmp/llm-d3a7049b-1771632281179-mpxg.txt

- Confirmed: event model correctly mirrors React DOM
- Confirmed: tree-based hit testing is sound
- Action: clip hit tests to parent overflow:hidden
- Action: auto-stopPropagation in scroll containers when scrolled
- Action: handle unknown URL schemes gracefully

