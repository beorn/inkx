---
mentions:
  - km
id: "@km/silvery/showcase-procedures"
aliases:
  - km-silvery.showcase-procedures
  - km-silvery-showcase-procedures
created_by: Bjørn Stabell
created_at: 2026-04-03T17:25:13Z
owner: bjorn@stabell.org
---

# [ ] Silvery Runbook — showcase process, release, testing, docs, operational procedures @km/silvery #task #P2

Silvery Runbook — Showcase Process. Internal operational procedures at vendor/internal/silvery/runbook/.

## Deliverable

vendor/internal/silvery/runbook/showcase.md — DONE (written)

## The Grinder — run all 55 examples through quality gate

### Phase 1: Triage

Run each example, screenshot at 80x24 and 120x40, classify as PASS/FAIL/FIX.
Use TTY MCP for screenshots, termless for smoke tests.

### Phase 2: Move

Move FAIL examples to vendor/internal/silvery/all-examples/. Update references.

### Phase 3: Fix

Per-example beads for each FIX item. Fix highest-impact first (docs-linked demos).

### Phase 4: Promote

Fixed examples go back to examples/ after passing all 4 testing layers.

### Phase 5: Golden Baseline

Generate golden screenshots for all showcase examples. Set up CI regression.

## Runbook sections

1. Showcase Process (done) — quality tiers, grading rubric, 4 testing layers, grinder procedure, promotion/demotion workflows, CI integration
2. Release Process (future)
3. Testing Procedures (future)
4. Docs Updates (future)

## Done when

- showcase.md written and reviewed ✓
- Grinder Phase 1 complete (all examples triaged)
- FAIL examples moved to internal
- Golden screenshots generated
- Referenced from silvery-internal CLAUDE.md

