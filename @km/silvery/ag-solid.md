---
mentions:
  - silvery
  - km
id: "@km/silvery/ag-solid"
aliases:
  - km-silvery.ag-solid
  - km-silvery-ag-solid
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:00Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.ag-solid
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:59Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] [epic] @silvery/ag-solid — Solid reconciler @km/silvery #epic #P1

blocks:: [[@km/silvery/opentui-parity]]

Ship a SolidJS renderer for silvery. Highest-leverage framework-pluralism gap vs OpenTUI (they ship React + Solid first-party). Uses Solid's universal-renderer API. See vendor/internal/silvery/research/competitors-overview.md and svelte-vue-tui-options.md for context.

