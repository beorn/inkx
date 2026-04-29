---
id: "@km/silvery/demo-refactor"
aliases:
  - km-silvery.demo-refactor
  - km-silvery-demo-refactor
created_by: claude:73d7a332
created_at: 2026-03-12T08:53:18Z
closed_at: 2026-03-12T15:00:10Z
close_reason: "Split 1515-line static-scrollback.tsx into 4 modules: types.ts
  (interfaces), script.ts (data+constants), state.ts (TEA state machine),
  components.tsx (UI). Main file is 208 lines. Also simplified FooterControl
  from {setText,getText,getPlaceholder} to {submit()}."
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] Refactor ai-chat demo: lift footer state into TEA, make showcase-ready @km/silvery #task #P2 @claude:73d7a332

The static-scrollback demo (our AI chat showcase for silvery.dev) has DemoFooter with local React state (inputText, elapsed, randomIdx) and imperative controlRef bridging to parent. Should be pure TEA: lift all footer state into DemoState, remove refs, compute placeholder in update function. Also: this is the primary website demo — needs to be exemplary code.