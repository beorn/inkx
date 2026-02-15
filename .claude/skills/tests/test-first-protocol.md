---
description: Shared test-first protocol referenced by all skills
---

# Test-First Protocol

Every bug fix, feature, and refactor follows this protocol:

1. **Write a failing test FIRST** — before any fix/implementation code
2. **Verify it fails for the right reason** — the test must demonstrate the actual bug/missing feature
3. **Implement the minimal change** — fix only what's broken, no extras
4. **Verify the test passes** — run `bun run test:fast`
5. **Run full suite** — `bun run test:fast` must stay green (no regressions)

For visual/rendering bugs, use **visual assertions** (not just state assertions):
- `board.expectNodeColor()`, `board.expectRow()`, `board.screen.cell()` — see [tui.md](tui.md#visual-assertions)

**Never**: theorize without a test, skip the failing-test step, guess at fixes, or close a bead without a test that specifically targets the issue.
