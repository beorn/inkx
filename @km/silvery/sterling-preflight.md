---
mentions:
  - km
  - claude
id: "@km/silvery/sterling-preflight"
aliases:
  - km-silvery.sterling-preflight
  - km-silvery-sterling-preflight
created_by: claude:4274df30
created_at: 2026-04-19T21:42:36Z
closed_at: 2026-04-19T21:52:06Z
close_reason: D1-D6 locked in
  hub/silvery/design/v10-terminal/sterling-preflight.md (commit 9c24 pending).
  Unblocks sterling-2a-data-layer — implementation of Theme type + derivation
  can begin.
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-preflight
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T14:42:36Z
    created_by: claude:4274df30
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v4
---

# [x] Sterling: lock decisions D1-D6 (pre-flight) @km/silvery #task #P1 @claude:4274df30

blocks:: [[@km/silvery/theme-v4]]

Before any Phase 2 code is written, lock the 6 open implementation decisions from hub/silvery/design/v10-terminal/design-system.md.

Produce hub/silvery/design/v10-terminal/sterling-preflight.md that formally locks:

D1. destructive — component-layer prop only, NOT a Theme field
D2. info default value — independent derivation, same default hex as accent
D3. Contrast guardrails — build-time catalog test + runtime auto-lift for user schemes + author override
D4. Flat + nested — double-populate on same object (no Proxy)
D5. OSC 10/11 probe — reuse @silvery/theme-detect unchanged
D6. Breaking change — clean break at silvery 0.19.0, no deprecation window

Output: committed sterling-preflight.md + updated design-system.md removing these as 'open questions'.

BLOCKS: sterling-2a-data-layer

Parent: @km/silvery/theme-v4

