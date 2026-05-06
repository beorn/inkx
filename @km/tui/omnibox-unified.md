---
mentions:
  - km
id: "@km/tui/omnibox-unified"
aliases:
  - km-tui.omnibox-unified
  - km-tui-omnibox-unified
created_by: Bjørn Stabell
created_at: 2026-04-14T20:30:10Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-unified
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T13:30:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] Unified omnibox: command palette + all pickers as one component @km/tui #feature #P1

blocks:: [[@km/tui]]

[EPIC / META] Umbrella bead tracking the unified omnibox design. Implementation work is in the child beads (@km/tui/omnibox-*). This bead is design-only and closes when all v1 children are closed.

Design doc: docs/design/omnibox.md

v1 scope: dialog form replacing Omnibox/ItemPicker/FavoritesDialog with one sigil-dispatched single-buffer component. Sigil-routed modes (`:` commands, `@` contexts, `#` tags, `+` projects, `[` nodes, `/` local-find), sticky defaultCommand + selectedArgument memory, cursor unification via focus, bracket task filters (`[x]` / `[ ]`), prop::value syntax, Google + fzf query operators.

Post-v1: omnibox.pop_out pane form (@km/tui/omnibox-pop-out).

