---
_stub: true
---

# #P3 ^aside-single-tree

## Update 2026-05-06 — second attempt regressed too; reverted

Re-attempted always-mount AsideLayout (display="none" for hidden, position="absolute" for overlay, single React tree across modes) on top of the silvery 100 ms trailing-edge debounce + Content `useTerm`-based available. Stability tests still passed 11/11 but the local PTY repro went from 255 (without #2) to 271 (with #2) STRICT overflows — bigger regression than #1 alone.

Combined with the prior regression (5974b4c89 → 5fc8ee5 reverted in 35157ac37), this is now two separate attempts at always-mount, both regressing. Strong evidence that flexily's `display: none` handling isn't fully zero-cost — the always-mounted aside subtree contributes to layout in some way the new contract doesn't capture, even when display:none.

Reverted to the original three-mode AsideLayout in commit `0acf89bc7`. Path forward (deferred):

1. Instrument flexily's `display: none` code path: add a STRICT check that asserts a display:none Box contributes 0 to its row's intrinsic min-content / max-content width. If not, fix flexily.
2. Verify that the SidePanel React subtree's *internal* rendering doesn't have a useBoxRect-driven cascade of its own that fires while display:none.
3. Once flexily verified clean, retry always-mount with this bead's design.

Until then: the three-mode structural branch is the lesser evil. Mode flips happen rarely (only at panel.zone hysteresis boundaries — 250 ms debounced) and the 32-col sidebar mount/unmount is one structural change rather than a continuous loop.

