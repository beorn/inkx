---
id: "@km/tui/omnibox-pop-out"
aliases:
  - km-tui.omnibox-pop-out
  - km-tui-omnibox-pop-out
created_by: Bjørn Stabell
created_at: 2026-04-14T23:26:07Z
---

# [ ] omnibox.pop_out — dialog → pane transition (Phase 11, post-v1) @km/tui #feature #P1

blocks:: [[@km/tui/omnibox-interactions]], [[@km/tui/omnibox-unified]]

Post-v1: turn the ephemeral overlay pane into a persistent docked pane.

Add omnibox.pop_out command: moves the OmniboxPane from workspace.overlayPane into a new entry in workspace.panes (keyed by a new pane id, with layout='dock' and ephemeral=false), then nulls workspace.overlayPane. The pane form is persistent — OMNIBOX_CONFIRM clears the buffer but keeps the pane open.

Workspace pane manager already handles splits, resize, focus cycling. The new pane type 'omnibox' just needs to register a view-mode renderer that delegates to the omnibox component.

Users get a permanent triage / navigator surface — e.g., a docked 'manage_favorites' omnibox for keyboard-driven navigation, or a docked 'move' omnibox for bulk organization. Not urgent for v1.

Acceptance:
(a) omnibox.pop_out is a registered command
(b) invoking it while overlayPane is an omnibox moves the pane to workspace.panes and nulls overlayPane
(c) the new pane renders the same component with layout='dock'
(d) OMNIBOX_CONFIRM clears buffer but keeps pane open
(e) standard pane ops (split, resize, focus) work on the omnibox pane