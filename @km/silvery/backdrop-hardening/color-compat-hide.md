---
id: "@km/silvery/backdrop-hardening/color-compat-hide"
aliases:
  - km-silvery.backdrop-hardening.color-compat-hide
  - km-silvery-backdrop-hardening-color-compat-hide
created_by: claude:88c0e764
created_at: 2026-04-20T21:01:08Z
closed_at: 2026-04-20T21:41:36Z
close_reason: Deleted color-compat.ts. mixSrgb imported from @silvery/color
  directly. Polarity-aware deemphasizeOklchToward moved to color-shim.ts
  (deletion-pending until upstream exports it). 100 backdrop tests pass. rg
  color-compat returns 0 hits outside the bead's own header comment. Commit
  2ed6523a.
owner: bjorn@stabell.org
assignee: claude:a1a0e667
dependencies:
  - issue_id: km-silvery.backdrop-hardening.color-compat-hide
    depends_on_id: km-silvery.backdrop-hardening
    type: parent-child
    created_at: 2026-04-20T14:01:25Z
    created_by: claude:88c0e764
    metadata: "{}"
---

# [x] Harden or hide color-compat.ts — publish-cycle shim shouldn't be long-term @km/silvery #task #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P2.3 + P3.2. **User directive 2026-04-20: "we don't want smell" — this isn't optional deferral.**

color-compat.ts was shipped as a publish-lag shim when @silvery/color 0.18.x didn't yet export mixSrgb. The shim is defensible short-term but will ossify if left in place.

## Problems

- "Byte-identical to upstream" is asserted, not proven — no parity tests
- Publicly re-exported from pipeline/backdrop/index.ts → consumers may start depending on it → deletion blocked
- Assumes hexToOklch/oklchToHex upstream presence (undeclared dependency)

## Resolution (not optional)

Blocker condition: @silvery/color 0.19.0 publishes mixSrgb + deemphasizeOklch + deemphasizeOklchToward.
(@km/_orphan/sterling-2e is driving 0.19.0 — ref km-2 tribe hint 2026-04-20: "@silvery/ansi@0.19.0 tarball wants @silvery/color@0.19.0, only 0.18.2 on npm — tag v0.19.0 + push")

Once 0.19.0 ships:
1. Add parity tests: sampled (color × amount) corpus, tolerance 1e-6, vs upstream exports
2. Confirm upstream-fallback shim no longer needs fallback at runtime
3. Delete color-compat.ts entirely — OR — rename to color-shim.ts if a rump persists, make private (not in barrel)
4. Remove all imports from pipeline/backdrop/* — import directly from @silvery/color

If 0.19.0 blocked on other work: add parity tests + privatize from barrel NOW (so when upstream lands, deletion is trivial).

## /complete criteria

- [ ] Parity test: 50+ (hex × amount) samples — mixSrgb(localShim, upstream) delta ≤ 1e-6, deemphasize same
- [ ] color-compat.ts is NOT exported from pipeline/backdrop/index.ts
- [ ] Explicit deletion condition in file docstring: "DELETE when @silvery/color@0.19.0 is in overrides of this monorepo"
- [ ] If 0.19.0 landed: color-compat.ts deleted entirely, backdrop imports mixSrgb/deemphasize from @silvery/color
- [ ] All 81 backdrop tests green at SILVERY_STRICT=2
- [ ] No consumer outside backdrop/ imports from color-compat (grep confirms)

## Blocked by

@km/_orphan/sterling-2e silvery 0.19.0 publish — per km-2 CI hint 2026-04-20 17:xx.

## Parent

@km/silvery/backdrop-hardening