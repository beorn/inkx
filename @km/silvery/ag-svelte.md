---
mentions:
  - silvery
  - km
id: "@km/silvery/ag-svelte"
aliases:
  - km-silvery.ag-svelte
  - km-silvery-ag-svelte
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:01Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.ag-svelte
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:01Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] [epic] @silvery/ag-svelte — Svelte renderer @km/silvery #epic #P2

blocks:: [[@km/silvery/opentui-parity]]

Ship a Svelte renderer for silvery. Harder than Vue — Svelte's compile-time model requires more invasive work, likely via a custom element adapter. No production-grade Svelte TUI exists today. See research/svelte-vue-tui-options.md.

