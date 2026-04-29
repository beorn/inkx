---
id: "@km/silvery/backdrop-hardening/kitty-edge-cleanup"
aliases:
  - km-silvery.backdrop-hardening.kitty-edge-cleanup
  - km-silvery-backdrop-hardening-kitty-edge-cleanup
created_by: claude:88c0e764
created_at: 2026-04-20T20:59:52Z
closed_at: 2026-04-20T21:20:11Z
close_reason: applyBackdrop returns EMPTY_RESULT for inactive plan regardless of
  kittyGraphics. Edge-triggered cleanup moved to ag.ts (handles both 'markers
  removed' and 'plan inactive with markers' cases). 4 new tests in
  backdrop-hardening.test.ts (active overlay still emits, inactive silent in
  both kittyGraphics modes). Commit 572c5f75. 83→87 backdrop tests pass.
---

# [x] Inactive Kitty cleanup fires every frame when fade={0} + kittyGraphics @km/silvery #bug #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P1.2. applyBackdrop() in index.ts emits KITTY_CLEANUP_OVERLAY every inactive frame whenever options.kittyGraphics === true. Combined with:
- hasBackdropMarkers() is syntactic presence check
- parseFade(0) prunes marker → buildPlan() inactive
- ModalDialog defaults to fade=0 in many places

→ Default modal on Kitty/Ghostty/WezTerm triggers backdrop pass + delete-all Kitty output EVERY FRAME even with backdrop disabled.

## Internal inconsistency

- Active overlay gated by plan.kittyEnabled
- Inactive cleanup gated by raw options.kittyGraphics
- ag.ts still keeps _kittyActive tracker

Not fully on plan, not fully at orchestrator.

## Fix — Option A (Pro's recommendation)

Keep deactivation cleanup in ag.ts edge-triggered by _kittyActive; make inactive applyBackdrop() return EMPTY_RESULT. Stop claiming _kittyActive is redundant in docs — it isn't.

## /complete criteria

- [ ] Failing test: fade={0} + kittyGraphics=true → 0 overlay bytes per frame (not cleanup spam)
- [ ] Failing test: inactive no-scrim plan + kittyGraphics=true → 0 overlay bytes
- [ ] Failing test: active→inactive transition emits cleanup ONCE (not every frame)
- [ ] Fix passes all three
- [ ] Existing 81 backdrop tests green

## Parent

@km/silvery/backdrop-hardening