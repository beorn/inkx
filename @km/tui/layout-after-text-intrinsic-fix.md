---
id: "@km/tui/layout-after-text-intrinsic-fix"
aliases:
  - km-tui.layout-after-text-intrinsic-fix
  - km-tui-layout-after-text-intrinsic-fix
created_by: claude:53042a7f
created_at: 2026-04-26T07:55:01Z
closed_at: 2026-04-26T08:11:20Z
close_reason: Fixed in commit e16090dfc — minWidth={0} on TreeNode content Box
  and NodeView column header inner row Box. 6/7 originally-failing tests now
  pass. 1 remaining (card-bg-inheritance) reclassified as separate concern
  (CardColumn theme-cascade) — tracked as km-tui.cardbg-cascade-broken.
started_at: 2026-04-26T08:00:32Z
owner: bjorn@stabell.org
assignee: claude:53042a7f
dependencies:
  - issue_id: km-tui.layout-after-text-intrinsic-fix
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-26T00:55:18Z
    created_by: claude:53042a7f
    metadata: "{}"
---

# [x] km-tui tests fail after text-intrinsic-vs-render fix — codified old conflation behavior @km/tui #bug #P2 @claude:53042a7f

blocks:: [[@km/tui]]

After @km/silvery/text-intrinsic-vs-render landed (silvery fce71edd + 5c94ba78 + flexily 1af45b8), 7 @km/tui tests fail because they codified the OLD Text-conflation behavior (where measureFunc returned constrained width instead of natural width).

## Failing tests

- apps/@km/tui/tests/date.test.ts (×4)
- apps/@km/tui/tests/column-rendering.test.ts (×1)
- apps/@km/tui/tests/text-cursor-bugs.spec.ts (×2)
- apps/@km/tui/tests/card-bg-inheritance.test.ts (×1)

## Why

These tests asserted layout widths that depended on Text reporting the constrained/clipped width as its layout width. After the fix, Text reports natural width and the layout engine clips at render time. The tests' width expectations no longer match.

Verified pre-existing by silvery agent (a09171a67be90ade0) — they fail at flexily a96db5c (before Phase 2 pointer bump), so they're caused by silvery fce71edd (Phase 1, the measureFunc split). Not caused by Phase 2 (flexily min-content switch).

## Disposition options

Per pro's 'shim Ink at the reconciler layer' recommendation:

1. **Update tests to new (correct) semantics** — walk through each, recompute expected widths assuming Text now reports natural width. Lowest risk, encodes the right behavior. Recommended for tests that assert geometry.
2. **Add overflow=hidden / minWidth=0 hints in @km/tui component code** where the components expected the old conflation. Required only if the component itself was relying on the conflation, not just the test.

Most likely a mix: tests need updating; some components may need explicit minWidth=0 to opt back into shrinking past natural width (the canonical CSS escape hatch).

## Acceptance

- All 7 failing tests pass
- No new test failures
- Document the migration pattern in apps/@km/tui/tests/CLAUDE.md if multiple tests share the same fix shape