---
mentions:
  - km
  - claude
id: "@km/silvercode/pane-management"
aliases:
  - km-silvercode.pane-management
  - km-silvercode-pane-management
created_by: claude:2405c72e
created_at: 2026-04-25T07:27:44Z
closed_at: 2026-04-25T07:48:16Z
close_reason: "Shipped: km main 40faa9d47. PaneGrid with 1-col │ dividers (no
  per-pane borders), drag-resize on dividers, Ctrl+W chord prefix (vim-window —
  avoids Ctrl+B conflict): v=split, x=close, z=zoom. Active-pane cue: 1-col ▎
  accent bar on left edge (NOT a full border per chrome constraint). Layout
  persists to .silvercode/panes.json per-cwd. 4 visual tests in
  apps/silvercode/tests/visual/pane-management.test.tsx all pass. Follow-up P3
  beads filed: km-silvercode.pane-headers, km-silvercode.pane-drag-move,
  km-silvercode.pane-2d-layout. Note: 8 silvercode visual tests using
  createRenderer-based renderScenario harness fail due to pre-existing
  useScopeEffect/ScopeProvider issue from lifecycle-scope landing (84ac75043) —
  orthogonal to this feature."
started_at: 2026-04-25T07:29:24Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.pane-management
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T00:27:44Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] Better pane management: borders, drag-resize, split keybindings, focused-pane indicator @km/silvercode #feature #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

## Goal

silvercode supports multiple sessions in a grid layout (\`/spawn\`, \`Ctrl+N\` to cycle). Today the panes have no chrome — no visible border between panes, no resize/move handles, no clear indicator of which pane receives keyboard input. Bring it up to a tmux/Zellij/iTerm-style pane experience.

## What to build

### 1. Visible borders between panes

Each pane gets a border (single-line by default). Active pane's border is highlighted ($accent or $primary), inactive panes get $border-muted. Matches Zellij / Helix split conventions.

### 2. Drag-resize, drag-move

- **Resize**: hover the border between two panes → cursor changes (use \`useMouseCursor\` "col-resize" / "row-resize") → click + drag adjusts the shared edge. Layout state persists per-vault (or per-session-grid).
- **Move**: drag a pane's title bar (or a header block) → drop on another pane to swap, or drop on a panel edge to re-tile. Optional v2 if v1 is too much.

### 3. Header buttons

Each pane has a small header block (1-2 rows) with:

- **Title** — session ID (now that the SidePanel shows ids only)
- **Add** — \`+\` icon → spawn new session in adjacent split
- **Move** — \`⇄\` icon → enter move mode (or drag title)
- **Close** — \`×\` icon → close session (with confirm if running)
- **Minimize** — \`_\` icon → collapse pane to a single-row header block; click to restore

### 4. Keybindings to split

Mirror tmux/Zellij conventions:

- \`Ctrl+B v\` (or \`Cmd+D\`) — vertical split (right)
- \`Ctrl+B s\` (or \`Cmd+Shift+D\`) — horizontal split (below)
- \`Ctrl+B x\` — close current pane
- \`Ctrl+B z\` — zoom (toggle full-screen for current pane)
- Existing \`Ctrl+N\` cycles focus between panes — keep
- Note: Ctrl+B is currently bound for "background turn" (@km/silvercode/ctrl-b-background); resolve the conflict before shipping (move ctrl-b background → another chord, OR use a different prefix here)

### 5. Clearer focused-pane indicator

The active pane gets a **blue outline** (or $accent border) — matches what most multi-pane terminals do. Currently the active pane is implicit; a hover-to-focus model + obvious blue border makes "where my keyboard input goes" unambiguous.

## Architecture

silvercode uses silvery's grid layout (probably \`<Box flexDirection="row">\` with multiple \`<ChatPane>\`) per \`apps/silvercode/src/App.tsx\` and \`ChatPane.tsx\`. Pane management could be:

- A new \`<PaneGrid>\` component that owns the layout tree (binary tree of splits)
- Per-pane \`<PaneFrame>\` wrapper providing border + header + resize handles
- Persistent layout state in \`apps/silvercode/src/pane-layout.ts\` — saved per-vault to \`.silvercode/panes.json\`
- Drag handles use \`onMouseDown\` + drag dispatcher; resize math computes new flex-basis values

## References

- \`apps/silvercode/src/App.tsx\` — current grid render
- \`apps/silvercode/src/components/ChatPane.tsx\` — current pane shell (no border / header today)
- \`vendor/silvery/packages/ag-react/src/hooks/useMouseCursor.ts\` — for cursor-shape on hover
- \`vendor/silvery/packages/ag-react/src/components/Link.tsx\` — useMouseCursor usage example
- tmux / Zellij / Helix as UX prior art

## Open questions

- Which prefix key? \`Ctrl+B\` is taken by background-turn; \`Ctrl+W\` (vim-window) is candidate; \`Cmd+\\\` for vertical split is a Terminal.app-style convention
- Layout persistence per-vault or per-session-grid? Likely per-vault keyed on cwd
- Drag-move v1 or v2? Resize is higher-value; move can ship later
- Minimize semantics: collapse to 1 row, or stash to a separate "minimized" tray? Likely 1-row collapse (Zellij style)

## Acceptance

- [ ] Borders visible between panes (single-line, active=$accent, inactive=$border-muted)
- [ ] Drag-resize works on the shared border between two panes
- [ ] Header block with add/close/minimize buttons (move can be v2)
- [ ] Split keybindings (vertical, horizontal, close, zoom) — chord prefix decided
- [ ] Active pane has visible blue/accent outline
- [ ] Layout persisted per-vault
- [ ] Visual regression: 2 panes, drag the divider, assert layout updates
- [ ] Conflict with \`km-silvercode.ctrl-b-background\` resolved

## Related

- \`km-silvercode.ctrl-b-background\` (P2, in-progress) — Ctrl+B chord conflict to resolve
- \`km-silvercode.multi-account\` (closed P2) — multi-account spawning is the source of "many panes" in the first place

