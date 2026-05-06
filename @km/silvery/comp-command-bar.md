---
mentions:
  - km
projects:
  - hint
id: "@km/silvery/comp-command-bar"
aliases:
  - km-silvery.comp-command-bar
  - km-silvery-comp-command-bar
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.comp-command-bar
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:47Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Component: CommandBar (bottom-anchored status+hint line) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Canonical CommandBar component — bottom-of-screen hint/status/action line, used by lazygit, helix, k9s, etc. Dynamic per-mode hints.

