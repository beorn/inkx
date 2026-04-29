---
id: "@km/silvery/ag-vue"
aliases:
  - km-silvery.ag-vue
  - km-silvery-ag-vue
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:00Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.ag-vue
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:00Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] [epic] @silvery/ag-vue — Vue 3 custom renderer @km/silvery #epic #P2

blocks:: [[@km/silvery/opentui-parity]]

Ship a Vue 3 renderer for silvery via createRenderer API. No production-grade Vue TUI exists — vue-termui dormant since 2022, @vizejs/fresco is the only active option. This would be the best Vue TUI instantly. See research/svelte-vue-tui-options.md.