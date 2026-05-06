---
mentions:
  - km
  - Bjørn
id: "@km/silvery/theme-v4-ansi16-hex"
aliases:
  - km-silvery.theme-v4-ansi16-hex
  - km-silvery-theme-v4-ansi16-hex
created_by: Bjørn Stabell
created_at: 2026-04-19T17:59:03Z
closed_at: 2026-04-19T18:17:43Z
close_reason: "Shipped silvery 738c3ba7 + km add60e811. deriveAnsi16Theme now
  exported from @silvery/ansi and returns hex only. ANSI16_SLOT_HEX mapping
  added. Tests: 145/145 package, 14/14 storybook, 10/10 new regression. 0
  slot-name assertions remain in vendor/silvery. Phase 2 kebab-rename now
  unblocked."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.theme-v4-ansi16-hex
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-19T10:59:02Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.theme-v4
---

# [x] Phase 1: deriveAnsi16Theme returns hex, not ANSI slot names @km/silvery #task #P2 @Bjørn Stabell

blocks:: [[@km/silvery/theme-v4]]

Theme objects must be pure hex across all tiers. Today deriveAnsi16Theme returns strings like {primary:'yellow',accent:'blueBright'} — breaks web/canvas consumers and prevents Theme-as-inspiration-library. Move ANSI-slot quantization entirely into the output phase (already handles 256 tier; extend to ansi16). Acceptance: rg slot-name-assertions in vendor/silvery → 0; existing tests still pass.

