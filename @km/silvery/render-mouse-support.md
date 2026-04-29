---
id: "@km/silvery/render-mouse-support"
aliases:
  - km-silvery.render-mouse-support
  - km-silvery-render-mouse-support
created_by: claude:c56dc5d6
created_at: 2026-04-23T18:23:42Z
owner: bjorn@stabell.org
assignee: claude:c56dc5d6
---

# [/] render() should enable SGR mouse tracking like run() does @km/silvery #bug #P2 @claude:c56dc5d6

silvery has two public entry points for interactive apps:

- \`run()\` — defaults \`mouse: true\`, wires full SGR mouse + DOM-style event dispatch (processMouseEvent, hit testing, onWheel/onClick bubbling).
- \`render()\` — no mouse plumbing AT ALL. grep for "mouse" in \`packages/ag-react/src/render.tsx\` returns zero hits. SilveryInstance enables Kitty keyboard + bracketed paste on startup but never touches mouse tracking.

Consequence: apps that use \`render(<App />, term)\` silently lack wheel/click/drag. Trackpad scroll in the terminal falls back to whatever the terminal synthesizes for "no mouse reporting" — typically arrow keys, which get routed to the focused pane via useInput. User sees "the wheel always scrolls the picker, not the pane I am hovering" — because the picker is focused and the trackpad is emitting arrow keys.

Discovered while fixing `bun example:storybook` — the storybook App has three panes (SchemeList / ComponentPreview / TokenTree), each with its own kinetic-scroll handler via \`useKineticScroll\`, but none fired because wheel events never reached them.

## Fix

Add mouse support to \`render()\`:

1. New \`RenderOptions.mouse?: boolean\` — default \`true\` to match \`run()\`. Explicit \`false\` opts out (for apps that want native terminal selection).
2. \`SilveryInstance\` on interactive mount: write SGR 1006 + 1000/1003 enable sequences. On cleanup: write the disable sequences. Same pattern as Kitty keyboard enable on lines 524-527.
3. Parse SGR mouse bytes from stdin (same parser \`run()\` uses — \`parseMouse\` from \`@silvery/ag-term/mouse\`).
4. Dispatch via \`createMouseEventProcessor\` + \`processMouseEvent\` against the root AgNode — same as \`run()\`.
5. Include hit-testing for \`onWheel\` / \`onClick\` / drag so Box/ListView mouse handlers fire as consumers expect.

## Acceptance

- \`rg "mouse" vendor/silvery/packages/ag-react/src/render.tsx\` returns ≥ 3 hits (option, enable, dispatch).
- Storybook can revert from \`run()\` back to \`render()\` and trackpad scrolling still works on all three panes.
- \`useKineticScroll\`-using consumers that call \`render()\` get wheel events routed to the hovered target.
- Kitty keyboard / bracketed paste still work (no regression on existing protocols).
- Explicit \`mouse: false\` disables tracking — native terminal copy/paste works as today.

## Out of scope

- Rewriting \`render()\` on top of \`run()\` / \`createApp\`. The two entry points have diverged intentionally; this bead just brings mouse to render.
- Selection / drag-to-copy (\`selection: true\`). Could land in a follow-up.

## Context

- Fixed on the consumer side by switching storybook to \`run()\` (commit in vendor/silvery — "chore(silvery): bump — storybook example finishing touch").
- Related: @km/silvery/consolidate-design-demos (the demo consolidation this issue surfaced during).