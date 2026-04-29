---
id: "@km/silvery/engine"
aliases:
  - km-silvery.engine
  - km-silvery-engine
created_by: claude:fed8de9e
created_at: 2026-03-29T23:15:00Z
closed_at: 2026-04-06T08:23:46Z
close_reason: "Grooming: 100% children closed, bd epic status marked eligible"
owner: bjorn@stabell.org
---

# [x] Silvery engine (v2.0+): multi-surface rendering, display list, projections @km/silvery #epic #P3

Silvery helps teams build keyboard-first, data-dense apps that work in terminal and browser from one React-oriented stack, with owned layout/text and interaction primitives where browser defaults break down.

Architecture and vision documented in vendor/silvery-internal/design/:
- silvery-roadmap.md — positioning, phasing, prior art
- silvery-packages.md — complete package inventory
- silvery-architecture.md — full engine stack, three projections
- pretext-integration.md — TextLayoutService API, Flexily integration, caching

Phasing (dogfood is parallel with phase 1, not phase 7):
0. Dogfood app + contracts (parallel with everything)
1. Text subsystem (TextLayoutService, measurers, conformance)
2. Browser input bridge spike (hidden textarea, focus, keyboard routing)
3. Display list (save/restore, metadata, canvas-first)
4. Semantics + interaction basics (minimal, for actual shipped widgets)
5. Signals optimization (only with profiling data)
6. Export surfaces (SVG/image/snapshot)
7. Second framework binding (only after real pressure)

The stack is modular — @silvery/headless, silvery-tea, Pretext are independently useful. But the primary story is the full-stack experience, not individual pieces. The individual pieces grow organically as the stack matures.

Near-term: TextLayoutService + Pretext integration (see @km/silvery/engine/text).
Mid-term: display list abstraction, ag-layout package, browser input spike.
Long-term: interaction index, multi-framework bindings, docily/textily editing.

Reviewed by GPT 5.4 Pro ($6.57 + $4.62 + $1.76). Architecture is sound. Biggest risk: editable text + accessibility. Best wedge: keyboard-first, data-dense tools that work in browser and over SSH.