---
tags:
  - task
  - P0
mentions:
  - km
id: "@km/silvery/custom-protocol-implementation-review"
aliases:
  - km-silvery.custom-protocol-implementation-review
  - km-silvery-custom-protocol-implementation-review
created_by: Codex
created_at: 2026-04-30T06:28:00Z
---

# [ ] Review custom terminal protocol implementations @km/silvery #task #P0

Audit all custom terminal protocol implementations for correctness and test completeness, including Kitty graphics, OSC/DCS/CSI protocol serializers/parsers, terminal capability negotiation, and termless/silvery protocol adapters.

Acceptance:

- [ ] Inventory every custom protocol path.
- [ ] Compare implementations against primary specs.
- [ ] Add focused conformance tests for parser edge cases, serialization escaping, cursor preservation, scroll/clipping behavior, and unsupported-feature behavior.
- [ ] Document known gaps with follow-up beads.
- [ ] Fail loudly on unrecognized protocol variants instead of silently dropping them.
