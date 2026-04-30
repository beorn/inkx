---
id: "@km/inbox/flexx-plan"
aliases:
  - km-flexx-plan
  - "@km/_orphan/flexx-plan"
created_at: 2026-01-31T07:47:25Z
closed_at: 2026-01-31T17:34:52Z
---

# [x] Flexx Strategy & Roadmap @km/_orphan #epic #P0

# Flexx Strategy & Roadmap

**Goal: Drop-in Yoga replacement** ✅ ACHIEVED

## Final State (Jan 31, 2026)

- Zero-alloc is default export (`@beorn/flexx`)
- Classic available at `@beorn/flexx/classic`
- **All 524 tests passing** (including 41/41 Yoga comparison)
- **Faster than Yoga on ALL benchmarks** (including deep nesting)
- **Full RTL support** with EDGE_START/END resolution

## Completed Work

### FOSS Publication
- ✅ Zero-alloc as default export
- ✅ Classic at /classic for debugging  
- ✅ GitHub Actions CI (Bun matrix)
- ✅ README with transparent perf docs

### Feature Parity
- ✅ RTL support with EDGE_START/END
- ✅ baselineFunc API
- ✅ overflow-no-shrink auto-height
- ✅ All edge cases fixed

### Testing
- ✅ 66 layout tests
- ✅ 41 yoga comparison tests
- ✅ 15 cache stress tests
- ✅ 401 differential fuzz tests

## Key Files
- src/index.ts - Default export (zero-alloc)
- src/index-classic.ts - Classic export
- src/layout-zero.ts - Zero-alloc algorithm (with RTL)
- src/node-zero.ts - Zero-alloc node
- .github/workflows/ci.yml - CI configuration