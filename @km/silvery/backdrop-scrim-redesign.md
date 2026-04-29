---
id: "@km/silvery/backdrop-scrim-redesign"
aliases:
  - km-silvery.backdrop-scrim-redesign
  - km-silvery-backdrop-scrim-redesign
created_by: claude:88c0e764
created_at: 2026-04-19T22:30:53Z
closed_at: 2026-04-19T22:42:52Z
close_reason: >-
  Shipped in silvery 66e56d17. Acceptance grep results:

  - grep oklab|blend( in backdrop-phase.ts → 0 (was 6+)

  - grep deriveBlendTarget|DARK_NEUTRAL_L|BG_FADE_RATIO → 0

  - mixSrgb exported from @silvery/color → yes

  All 20 backdrop-fade tests pass at SILVERY_STRICT=2. Pre-existing unrelated
  failures in use-ag-node/click-to-position/focus-compat remain (same as
  f84ed9fc baseline). Net -170 LOC. Industry-standard model: source-over alpha
  toward pure black/white scrim, sRGB space. User's perceptual observation
  (blue-more-saturated-when-darkened) is resolved because sRGB source-over
  scales all channels uniformly — r:g:b ratios preserved.
---

# [x] Backdrop fade: industry-standard source-over sRGB alpha compositing @km/silvery #task #P2 @claude:88c0e764

blocks:: [[@km/silvery]]

Replace 3D OKLab blend with source-over alpha compositing in sRGB. Deep research confirmed industry practice (CSS filter brightness, Apple modal dimming, Material 3 scrim, Flutter modal barrier, Figma/Sketch/Adobe, Quartz/Cairo/Skia) is all source-over alpha — not OKLCH L-shift. Even Ottosson (OKLab author) recommends linear-sRGB for compositing.

## Why
Current impl does OKLab blend toward a compromise target (desaturated gray at rootBg.L-0.15). This:
- Violates OKLCH's perceptual contract (drags C and H, not just L) — user-observed regression
- Uses OKLab for transparency (Ottosson explicitly recommends against)
- Has had 6+ consecutive fix commits tuning the target

## What
1. Add `mixSrgb(a, b, t)` to @silvery/color — simple sRGB linear mix
2. Rewrite backdrop-phase.ts fadeCell: `cell.fg = mixSrgb(fg, scrimColor, amount)`, same for bg (null bg resolved to rootBg first)
3. Remove deriveBlendTarget + DARK_NEUTRAL_L_OFFSET machinery
4. Keep emoji dim stamp + Kitty scrim (orthogonal terminal-specific compensations)
5. Update backdrop-fade.test.tsx — assertions will change (different hex values)

## Acceptance
- Source-over alpha model: `out = cell * (1 - α) + scrim * α`
- Scrim color: pure black for dark themes, pure white for light (or a configurable token later)
- Uniform fg/bg amounts (already true)
- Null bg resolved to rootBg before mix
- No references to `deriveBlendTarget`, `DARK_NEUTRAL_L_OFFSET`, or OKLab `blend()` in backdrop-phase.ts
- `grep -rn 'oklab\|blend(' packages/ag-term/src/pipeline/backdrop-phase.ts` → 0
- All backdrop-fade tests pass at SILVERY_STRICT=2
- `bun fix` passes

## Context
- Deep research file: /Users/beorn/.config/claude-profiles/d@delei.org/projects/-Users-beorn-Code-pim-km/88c0e764-e13d-4e0e-9286-0aebe78453f6/tool-results/bks6yrnm6.txt
- Prior bead: @km/silvery/backdrop-fade (closed, shipped v0.18.0)