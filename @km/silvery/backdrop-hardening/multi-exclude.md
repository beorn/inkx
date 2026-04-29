---
id: "@km/silvery/backdrop-hardening/multi-exclude"
aliases:
  - km-silvery.backdrop-hardening.multi-exclude
  - km-silvery-backdrop-hardening-multi-exclude
created_by: claude:88c0e764
created_at: 2026-04-20T20:59:52Z
closed_at: 2026-04-20T21:16:11Z
close_reason: "Fixed region.ts to do single-pass scan over union of excludes
  (not per-rect iteration). 3 new tests added in
  vendor/silvery/tests/pipeline/backdrop-hardening.test.ts: disjoint excludes
  preserve both holes, overlapping excludes preserve union, includes+excludes
  correctly compose. All 83 backdrop tests pass. Commit ea8d0368."
---

# [x] region.ts: multiple exclude rects visits hole interiors (correctness bug) @km/silvery #bug #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P1.1. region.ts exclude logic currently computes outside(A) ∪ outside(B) ∪ …, but for N holes-that-stay-crisp, correct semantics is outside(A ∪ B ∪ …). These differ.

## Symptom

With two disjoint exclude rects, current code visits EVERY cell including both hole interiors (each iteration dedups via seen but still walks the outside of its own rect which covers the other hole).

- One modal hole works
- Two crisp holes do NOT — second hole gets faded

## Fix

Rasterize an excluded mask once, or scan buffer once with insideAnyExclude guard:

```ts
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (insideAnyInclude && !insideAnyInclude(x, y)) continue
    if (insideAnyExclude(x, y, excludes)) continue
    visit(x, y)
  }
}
```

## /complete criteria

- [ ] Failing test: two disjoint excludes + include — assert hole interior is crisp
- [ ] Failing test: two overlapping excludes — assert union region is crisp
- [ ] Failing test: include + multiple excludes combined
- [ ] Fix makes all three tests pass
- [ ] Existing 81 backdrop tests remain green at SILVERY_STRICT=2
- [ ] @km/tui showcase spec green

## Parent

@km/silvery/backdrop-hardening