---
id: "@km/silvery/use-term"
aliases:
  - km-silvery.use-term
  - km-silvery-use-term
created_by: claude:73d7a332
created_at: 2026-03-11T19:31:03Z
---

# [ ] useTerm(selector): fine-grained reactive terminal state @km/silvery #feature #P2

Replace standalone hooks (useWindowSize, useTermState) with selector-based useTerm():

  const cols = useTerm(t => t.cols)  // only re-renders when cols changes  
  const rows = useTerm(t => t.rows)
  const { cols, rows } = useTerm(t => ({ cols: t.cols, rows: t.rows }), shallow)

useWindowSize becomes sugar: useTerm(t => ({ columns: t.cols, rows: t.rows }), shallow)

Reactive properties: cols, rows, hasFocus
Static properties: colorDepth, isKitty — stay on term directly

Requires making Term provider a proper zustand store with selector support.