---
mentions:
  - km
id: "@km/beads/split-backend"
aliases:
  - km-beads.split-backend
  - km-beads-split-backend
created_by: claude:da9990c5
created_at: 2026-04-28T08:25:03Z
closeReason: "Resolved: by migrating .beads/issues.jsonl into root @km/ scope,
  both backends are now one. km bd reads markdown; markdown is canonical. No
  live sync needed."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-beads.split-backend
    depends_on_id: km-beads
    type: parent-child
    created_at: 2026-04-28T01:25:03Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-beads
---

# [x] km bd and Go bd use separate storage backends — beads created in one are invisible to the other @km/beads #bug #P1

blocks:: [[@km/beads]]

## Root cause

km bd reads/writes .km/state.db (km SQLite store, built from markdown files in scope dirs).
Go bd reads/writes .beads/issues.jsonl + .beads/dolt/ (bd's MySQL-on-Dolt store).

The two are populated only by:

- a one-time 'km bd migrate --source .beads' import (jsonl → markdown)
- and 'km bd export --target .beads' (markdown → jsonl), which the Go bd hook then reads

Live writes don't sync between them. A bead created via 'bun km bd create X' is invisible to 'bd list / bd show'. A bead closed via 'bd close Y' is invisible to 'km bd show Y'. They diverge silently.

## Reproduction

$ bun km bd create 'Smoke' --type task --priority 4 --id @km/test/smoke
✓ Created issue: @km/km-test/smoke
$ bd show @km/test/smoke
Error: no issue found
$ bd show @km/km-test/smoke
Error: no issue found    ← Go bd doesn't see it at all

## Implications for the cutover

This is the fundamental blocker for @km/beads/dolt-archive. The km bd / Go bd switch isn't a 'pick one CLI, both speak to the same storage' situation — it's a backend choice. Until either (a) live sync, or (b) commitment to one backend, hooks/skills that prefer Go bd will read Dolt and users running km bd will see/touch markdown. They will diverge.

## Acceptance options (pick one)

A. **Live sync** — every km bd write also appends to .beads/issues.jsonl (and triggers bd's import); every bd write also runs km bd migrate on changed range. Heavy, error-prone.
B. **Single backend** — pick markdown (km bd's domain) as the source of truth; Go bd's read commands query .km/state.db too (via SQL, since Dolt = MySQL). Means Go bd binary writes via km bd internals.
C. **Cut over fully** — port the missing subcommands to km bd, run 'km bd migrate' on the live vault to populate scope dirs, then deprecate Go bd. Accept the migration cost.

Recommendation: C. The cutover plan already pointed here; this bead just makes the implication explicit.

## Why this matters NOW

The hooks-rewrite bead added a fallback ('use km bd if bd not installed'), assuming km bd would see the same beads. It won't. Anyone using the fallback (post-uninstall, or in a fresh checkout) sees a different bead set than someone using bd. Document this clearly OR fix before the fallback path is exercised in the wild.

