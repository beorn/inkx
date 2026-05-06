---
aliases:
  - km-silvery.strict-output-flag-emoji-width-divergence
  - km-silvery-strict-output-flag-emoji-width-divergence
created_at: 2026-05-05T22:42:00.000Z
---

# [x] render: STRICT_OUTPUT mismatch on regional-indicator flag emoji #bug #P2

closed:: 2026-05-05
closed_by:: silvery agent (wt1)

## Resolution 2026-05-05 (silvery agent / wt1)

Root cause was in silvery's vt100 emulator (`replayAnsiWithStyles` in `packages/ag-term/src/pipeline/output-verify.ts`) — NOT in the output emitter.

The grapheme-cluster collector greedily absorbed regional-indicator codepoints (U+1F1E6..U+1F1FF) onto **any** preceding grapheme. Per UAX #29 GB12/GB13 a regional indicator may only pair with another adjacent regional indicator (forming a flag), starting from a non-RI boundary. So when the ANSI stream emitted ` 🇺🇸 US` at column N, the collector built ` 🇺🇸` as a single 3-wide grapheme at column N, then rendered the flag at column N (instead of column N+1), leaving stale prev pixels at N+1 and N+2.

Fix: gate RI absorption on (`firstCp` is itself an RI) AND (we have not yet absorbed an RI in the current grapheme — at most one extra RI per UAX #29). Also tightened variation-selector / skin-tone / tag-sequence absorption to emoji-capable bases (the same defect class would have inflated `" ️"` clusters etc.).

Verification: new test file `vendor/silvery/tests/output-verify-flag-emoji.test.ts` (5 tests) reproducing the bead repro at row width 80 + the original 352-wide vault scenario; all pass. Pre-existing `output-phase-wide-char-matrix`, `cross-backend-output`, and `unicode/` suites remain green (95 tests).

`SILVERY_STRICT_OUTPUT` (vt100 backend) reports `STRICT_OUTPUT char mismatch` when text containing a regional-indicator flag emoji (e.g. `🇺🇸` U+1F1FA U+1F1F8) replaces narrow text in the same row across frames. The buffer-level state is correct (wide=true at col N, continuation=true at col N+1) and the silvery measurer reports `graphemeWidth("🇺🇸") === 2`. Both incremental and fresh ANSI streams correctly emit only the main wide cell and rely on the terminal to render it 2 columns wide.

The incremental render's vt100 emulator state diverges from the fresh render's vt100 state at col N+1: incremental retains the previous narrow char ('b' from prior "bun" text); fresh shows ' '. Likely cause: the vt100 backend used by STRICT_OUTPUT counts the regional-indicator pair as a single-column grapheme (or does not honor wide=true for emoji that don't have explicit OSC 66 / VS16 wrapping), while the silvery buffer model + cursor-resync logic assume wide=2.

## Reproduction

`apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` against `~/Bear/Vault` at 352×117 trips the failure during the cursor-walk + edit-toggle sequence around the `· bun km doctor ~vault` / `🇺🇸 US 1040` row. STRICT_OUTPUT logs the column-by-column diagnostic:

```
col 321: prev='b' next='🇺🇸' incr='b' fresh=' ' wide=true cont=false  <<<
col 322: prev='u' next=''   incr='u' fresh=' ' wide=false cont=true  !!!
```

`Wide/cont cells on row 31 (next buffer): W@321:U+1F1FA,U+1F1F8(gw=2) C@322` — so silvery's render walk DOES produce a wide cell + continuation in the next buffer. The divergence is in how the vt100 emulator parses the ANSI emit.

## Why this is P2 not P1

This bug is NOT what the user reported as the cyan-strip residue (the user-reported bug remains under investigation in @km/silvery/render-light-blue-bg-strip-residue). The STRICT_OUTPUT divergence is a vt100 emulator + flag-emoji measurement issue that surfaces only when running through the strict comparator, not in normal rendering.

## Suggested fixes

1. **Match vt100 width handling to silvery's measurer** — when silvery says wide=2, force vt100 to advance 2 cells. This keeps silvery's buffer model authoritative.
2. **Emit explicit width-2 escape (OSC 66) for ALL flag emoji** — would close the gap by telling all conforming terminals to treat these as 2 cells.
3. **Add post-emit cursor reposition for wide flag emoji specifically** — narrower fix, similar to the existing cursor re-sync at output-phase.ts:2387.

## Acceptance

- `apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` passes under `SILVERY_STRICT=1` (currently fails on the wide-char divergence after the harness fix exposed it).
- A focused silvery test that does narrow→wide flag-emoji transitions in incremental render passes STRICT_OUTPUT against vt100.

