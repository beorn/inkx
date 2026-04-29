---
id: "@km/silvery/backdrop-hardening"
aliases:
  - km-silvery.backdrop-hardening
  - km-silvery-backdrop-hardening
created_by: claude:88c0e764
created_at: 2026-04-20T20:59:18Z
closed_at: 2026-04-20T21:49:28Z
close_reason: "All 8 P0 sub-beads closed. 100 backdrop tests pass (started at
  81; +19 new tests). km-tui showcase still green. Commits: ea8d0368, 572c5f75,
  969ca994, d02e7604, 491a15de, 7172d5c4, 2ed6523a, 8b5db390 in vendor/silvery."
---

# [x] Backdrop module hardening — Pro review b335f1f6 followups @km/silvery #epic #P0 @claude:a1a0e667

blocks:: [[@km/silvery]]

Consolidated tracking for GPT 5.4 Pro review findings against backdrop module at silvery b335f1f6 (merciless API refactor). Pro's verdict: good refactor, not done yet. 0 P0 ship-blockers; 4 P1s + 5 P2s + 6 P3s.

See /tmp/pro-backdrop-review-result.txt (session 88c0e764, 2026-04-20 13:23-14:00) for the full review.

## P1 children (should-fix before next release)

- .multi-exclude — region.ts wrong for multiple exclude rects (correctness bug)
- .kitty-edge-cleanup — inactive Kitty cleanup edge-insensitive, fade={0} pays
- .realize-kitty-guard — realizeToKitty() doesn't honor plan.kittyEnabled
- .legacy-emoji-dim — no-scrim fallback doesn't fade emoji when Kitty unavailable

## P2 children (architecture / cross-platform)

- .split-core-plan — CorePlan vs TerminalPlan for realizeToDom/realizeToCanvas future
- .slim-barrel — forEachFadeRegionCell/mixSrgb/deemphasize* leaking from public
- .color-compat-hide — harden or privatize the publish-cycle shim
- .rename-final-pass — forEachFadeRegionCell→forEachBackdropCell, color-compat→color-shim, hasBackdropMarkers semantics

## Related (separate scope)

- @km/infra/llm-recover-ux — /pro tool recover UX (poll timeout, write-on-recover, quiet progress)

## Acceptance

- All 4 P1 criteria beads closed with new tests
- P2 beads have /complete criteria written
- Pro follow-up review (or Claude-side verification) confirms invariants hold