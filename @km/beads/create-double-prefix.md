---
mentions:
  - km
id: "@km/beads/create-double-prefix"
aliases:
  - km-beads.create-double-prefix
  - km-beads-create-double-prefix
created_by: claude:da9990c5
created_at: 2026-04-28T08:24:40Z
closed_at: 2026-04-28T15:05:05Z
close_reason: >-
  Fixed in this session. generateCustomId() in
  packages/km-beads/src/short-ids.ts now normalizes 4 input forms to the
  canonical bd-form short_id:

  - km-beads.foo → km-beads.foo (idempotent — was the bug; previously produced
  km-km-beads.foo)

  - @km/beads/foo → km-beads.foo (sigil-prefixed canonical → bd-form)

  - beads/foo → km-beads.foo (path-form → bd-form, slashes become dots)

  - beads.foo → km-beads.foo (scope without prefix → prepend)


  Honors non-default prefix (--prefix configurable). Also fixed customIdScope
  derivation in apps/km-cli/src/commands/bd.ts (bd create handler) to extract
  scope from all 4 forms when deriving the parent ref.


  Tests: 7 new cases in packages/km-beads/tests/short-ids.test.ts covering
  idempotence, all 4 input forms, foreign sigil, and non-default prefix. All 397
  km-beads + km-cli tests pass.


  Smoke: 'bun km bd create' with each of the 4 input forms produces 'Created
  issue: km-beads.smoke-<slug>' — no doubling.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.create-double-prefix
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-28T01:24:43Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] km bd create double-prefixes the --id (km-beads.X → km-km-beads.X) @km/beads #bug #P2

blocks:: [[@km/beads]]

Reproduction:

$ bun km bd create 'Smoke' --type task --priority 4 --id @km/beads/smoke-1777364606
✓ Created issue: @km/km-beads/smoke-1777364606    ← extra 'km-' prepended
Title: Smoke
Type: task
Priority: 4

Then 'km bd show @km/beads/smoke-1777364606' returns 'Issue not found' (because the actual id is @km/km-beads/smoke-…).

Expected: when --id already starts with the configured prefix (km-), don't re-prepend it. The Go bd binary handles this idempotently.

Probably in apps/@km/_orphan/cli/src/commands/bd.ts (bd create handler) where it builds the canonical id from --id + prefix. Should detect when --id already has the prefix and pass through verbatim.

Acceptance:

- bun km bd create … --id @km/beads/foo → creates issue with id @km/beads/foo (not @km/km-beads/foo)
- bun km bd create … --id beads.foo → creates issue with id @km/beads/foo (current behavior of prepending preserved when prefix is missing)
- Test in packages/@km/beads/tests/

