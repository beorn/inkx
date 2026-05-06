---
projects:
  - char
aliases:
  - km-silvery.clip-parity-invariant
  - km-silvery-clip-parity-invariant
created_at: 2026-05-06T06:07:02.906Z
---

# Clip-parity STRICT check: assert bg+char paint share the same clip #P2

Add a STRICT-mode invariant that asserts every cell painted with bg via applyBgSegmentsToLine has a corresponding char emit from renderGraphemes within the same clip [minCol, maxCol). Catches the cyan-strip bug class structurally so future bg/char emit asymmetries fail loudly. See bead @km/silvery/render-light-blue-bg-strip-residue Round 12 for the original bug; the silvery patch added clip params but a parallel-walker asymmetry could re-introduce the class. STRICT-mode check is the guard.

