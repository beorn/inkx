---
mentions:
  - km
id: "@km/flexily/type-safety-loose"
aliases:
  - km-flexily.type-safety-loose
  - km-flexily-type-safety-loose
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:38Z
closed_at: 2026-03-13T05:38:39Z
close_reason: "Investigated. Value.unit takes 4 values (UNIT_UNDEFINED=0,
  UNIT_POINT=1, UNIT_PERCENT=2, UNIT_AUTO=3). A literal union type (0|1|2|3) or
  branded type would catch compile-time mistakes. However: (1) No bugs have been
  caused by wrong unit values — the constants are well-named and consistently
  used. (2) Branded types add ceremony to every Value creation (createValue(),
  style defaults, edge arrays) for minimal safety gain. (3) A literal union
  'type Unit = 0 | 1 | 2 | 3' would work but the numeric constants already
  enforce correct usage at call sites. (4) The unit field is only compared
  against constants, never passed as a raw number — the abstraction already
  works. This is cosmetic type refinement, not a correctness issue. Low priority
  relative to the ceremony it introduces across types.ts, constants.ts, and
  every Value creation site."
owner: bjorn@stabell.org
---

# [x] Quality: Value.unit is plain number — should use literal unions or branded types @km/flexily #task #P2

