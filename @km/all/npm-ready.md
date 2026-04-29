---
id: "@km/all/npm-ready"
aliases:
  - km-all.npm-ready
  - km-all-npm-ready
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:14:18Z
closed_at: 2026-03-09T22:07:21Z
close_reason: "Grooming: superseded — flexily published, silvery tracked by
  km-silvery.publish-1.0"
---

# [x] npm-ready: publish flexture and hightea for public adoption @km/all #epic #P4

Umbrella epic for making flexture and hightea ready for public npm adoption.

## Context
Competitive evaluation (Feb 2026) found neither package is on npm — the #1 adoption blocker. Both are v0.1.0 with no public GitHub presence, no community signals, and no engines field.

## Key metrics (current)
- Flexture: 181KB raw / 35KB gzip, 1 runtime dep, 1368 tests, 0 `any` types
- hightea: 2.2MB dist, 7 runtime deps, 149 source files, 161 exports from single entry, 24 components

## Competitive landscape
- Yoga: 3.2M npm downloads/wk, WASM, 38KB gzip — flexture is 5x smaller, pure TS
- ink: 35K stars, 2.1M downloads/wk, 4 components — hightea has 24 components, 30+ hooks
- Bubble Tea (Go): 39.8K stars; Textual (Python): 34.4K; Ratatui (Rust): 18.6K

## Children
- @km/flexture/npm-publish, @km/flexture/bundle-audit, @km/flexture/contributing
- @km/silvery-legacy/npm-publish, @km/silvery-legacy/ci-strict, @km/silvery-legacy/layered-arch, @km/silvery-legacy/bundle-audit, @km/silvery-legacy/engines
- @km/all/v1-roadmap, @km/all/announce