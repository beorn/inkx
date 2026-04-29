---
id: "@km/all/v1-roadmap"
aliases:
  - km-all.v1-roadmap
  - km-all-v1-roadmap
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:25Z
closed_at: 2026-02-23T11:38:20Z
---

# [x] Define 1.0 criteria for flexx and inkx @km/all #task #P2 @claude:ee8efc0f

Define what "1.0" means for flexx and inkx. Both are currently v0.1.0.

## Why this matters
v0.x signals "not ready for production." Companies evaluating dependencies often skip anything pre-1.0. But shipping 1.0 is a commitment to API stability.

## Flexx 1.0 criteria (proposed)
- [ ] All Yoga compatibility tests pass (currently 41/41)
- [ ] Re-layout fuzz tests pass (currently 1200+)
- [ ] Published on npm with stable API
- [ ] Bundle size documented and CI-guarded
- [ ] No known layout correctness bugs
- [ ] Performance claims verified and documented with provenance
- [ ] Breaking changes from Yoga compatibility documented

## inkx 1.0 criteria (proposed)
- [ ] Ink API compatibility verified (drop-in replacement)
- [ ] Layered architecture implemented
- [ ] Published on npm
- [ ] Core API stable (Box, Text, render, useInput, useContentRect)
- [ ] No memory leaks (verified over long-running sessions)
- [ ] Testing API stable (createRenderer, locator)
- [ ] Migration guide from Ink complete and tested
- [ ] Performance claims verified

## Discussion needed
- Ship flexx 1.0 before inkx 1.0? (flexx is more mature)
- Semver policy: what constitutes a breaking change?
- Support policy: what Node/Bun versions?