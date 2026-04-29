---
id: "@km/silvery/authoring-elegance"
aliases:
  - km-silvery.authoring-elegance
  - km-silvery-authoring-elegance
created_by: claude:8b5b9e1c
created_at: 2026-04-21T07:43:38Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.authoring-elegance
    depends_on_id: km-all.plateau
    type: parent-child
    created_at: 2026-04-21T00:43:38Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [ ] Authoring elegance — framework-adoption bar for silvery plugin API @km/silvery #feature #P0

blocks:: [[@km/all/plateau]]

For silvery to succeed as a framework for developers OTHER than km, the plugin authoring API must be beautifully elegant — not just functional. Measurable by:

1. Minimum viable plugin in ≤50 LOC for simple cases (currently HelpOverlay mini-cutover: ~300 across 4 files)
2. Types flow end-to-end without manual string namespacing (effect types, op types, state types)
3. Precedence bugs caught at pipe()-time as type errors, not runtime
4. One-file authoring for simple plugins (not factory + store + bridge + hook)
5. Consumer API requires no type assertions or casts
6. Pattern subjectively comparable to Solid Signals / Zustand / SwiftUI for ergonomics

## Target API sketch (from 2026-04-21 session):

  const helpOverlay = definePlugin({
    name: 'helpOverlay',
    role: 'global',              // enforces pipe ordering at type level
    state: { visible: false, scrollOffset: 0 },
    ops: {
      show: (s) => ({ ...s, visible: true, scrollOffset: 0 }),
      hide: (s) => ({ ...s, visible: false }),
    },
    keys: { '?': 'show', 'Escape': 'hide' },
  })

Compare to current HelpOverlay implementation — same semantics, 1/6th the code.

## Prerequisites

- @km/tui/tea-searchdialog-cutover must land first. Designing the elegance API in the abstract without a real hard-case validator is architectural astronautics (both dual-pro reviews agree).

## Process

- After SearchDialog cutover: /pro dedicated review on elegance
- Monthly /pro elegance check-ins until 1.0
- No claiming of 'done' without at least one external developer successfully building a plugin from docs alone

## NOT this bead's work

- Type-routing composite ops, state_delta, role lanes — those are Phase 6 prep, not authoring elegance
- Runtime optimizations — this is about API shape, not performance