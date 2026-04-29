---
id: "@km/silvery/terminal-profile-plateau"
aliases:
  - km-silvery.terminal-profile-plateau
  - km-silvery-terminal-profile-plateau
created_by: claude:c6244087
created_at: 2026-04-23T06:53:21Z
closed_at: 2026-04-23T09:38:14Z
close_reason: >-
  All four phases complete.


  Phase 1 (ab6ce644): ColorTier canonicalized. One enum
  (mono|ansi16|256|truecolor), `ColorLevel`/null spellings mapped to ColorTier
  alias.


  Phase 2 (af7d8b28): Term.caps made non-optional. All three constructors
  populate caps; the `term.caps ?? detectTerminalCaps()` convention is gone.


  Phase 3 (fbd76097): createTerminalProfile() introduced as single source of
  truth. Collapsed detectColor + detectTerminalCaps + resolveColorTier into one
  function with a documented precedence chain (env > override > caller-caps >
  auto). 46 profile tests pin every rung; `detectTerminalCaps` is now a thin
  delegate.


  Phase 4 (2fff14c6): Entry points unified through TerminalProfile.

  - `RunOptions.profile` added to `run()` — pre-built profile bypasses detection
  on both Term-path and options-path.

  - `AppRunOptions.profile` added to `createApp().run()` — same bypass for the
  lower-level entry point.

  - `TerminalProfile.source` field records which precedence rung won ("env" |
  "override" | "caller-caps" | "auto").

  - The old tier-comparison hack (`termProfile.colorTier !==
  term.caps.colorLevel`) + triple env-var re-read are replaced by one
  `profile.source === "env" || "override"` read in both paths. Same behaviour,
  one source of truth.

  - Resolved profile is threaded through `run() → app.run()` so nothing
  downstream has to re-detect.


  ## Verification (Phase 4)

  - ansi + contracts: 232 → 245 passed (+10 source tests, +3 RunOptions.profile
  contracts).

  - Profile tests: 46 → 56 (+10 source attribution tests).

  - Full silvery vendor: 5877 → 5890 passed; same 14 pre-existing compat
  failures (Ink compat, unrelated).

  - km-tui + km-logview: 2552 passed, unchanged from baseline.

  - `npx tsc --noEmit | grep 'error TS' | grep -v vendor/` stays at 56.


  ## What this fixes (from the original three smells)

  - Silent mono fallback when FORCE_COLOR is needed — every entry point now goes
  through a profile whose precedence chain pins env first.

  - Test/prod divergence (the km-logview blank-screen root cause) — every entry
  point uses the same detection function.

  - detectColor vs detectTerminalCaps duplication — detectTerminalCaps is now a
  shim over createTerminalProfile.

  - The convention-only "is caps populated here?" rule — Term.caps is typed
  non-optional.


  Follow-ups (out of scope): the lower-level test-harness `render()` in
  renderer.ts does not participate in caps/color detection and was intentionally
  not modified. If ever refactored to use the pipeline's caps, threading
  `profile` through RenderOptions is the natural shape.
---

# [x] Terminal setup/detection is fragmented — off the quality plateau @km/silvery #feature #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Silvery terminal detection violates 'one way to do things' on every axis. Surfaced when @km/logview hit FORCE_COLOR not propagating, Term.caps being undefined in emulator/alt constructors, and tests (hardcoded truecolor) passing while production (dynamic detection) rendered blank.

## Three smells
1. **Three enum spellings of the same 4-state color level:**
   - `@silvery/ansi` `ColorLevel` = `null | 'basic' | '256' | 'truecolor'`
   - `TerminalCaps.colorLevel` = `'none' | 'basic' | '256' | 'truecolor'`
   - `ag-term/runtime/run.tsx` `ColorTier` = `'mono' | 'ansi16' | '256' | 'truecolor'`
   Every edge is a coercion site.

2. **Two redundant detection functions.** `detectColor()` (ansi/detection.ts) honors FORCE_COLOR + TERM_PROGRAM=Ghostty/iTerm/WezTerm. `detectTerminalCaps()` didn't. Both are callable; different paths call different ones. Recent fix (commit 48143ef0) had `detectTerminalCaps` delegate to `detectColor` — a patch, not a design.

3. **`Term.caps` optional, populated in 1 of 3 constructors.** `term.ts:655` (main) populates; `term.ts:855` (alt) and `:935` (emulator) set `caps: undefined`. Callers read `term.caps ?? detectTerminalCaps()` — an invariant enforced by convention. `createTermless()` hardcodes `colorLevel: 'truecolor'` + `caps: undefined`. Real path detects. Tests pass while production breaks.

## Reframe: TerminalProfile as the single source of truth

One `TerminalProfile { caps, theme, colorTier }`, built by one function, required on every Term.

### Phases
1. **ColorTier canonicalization** — rename/remove duplicates so there's ONE enum. Mechanical, low-risk. ~2h.
2. **`Term.caps` required** — populate in all three constructors. Typed invariant.
3. **Collapse detection** — `createTerminalProfile(env, stdout)` replaces `detectColor` + `detectTerminalCaps` + `resolveColorTier`. Net LOC deletion.
4. **Unify entry points** — `run()` / `createApp().run()` / `render()` all go through the profile.

### What this fixes beyond the immediate bug
- Silent mono fallback when FORCE_COLOR is needed
- Test/prod divergence (root cause of @km/logview blank screen)
- `detectColor` vs `detectTerminalCaps` duplication
- The convention-only 'is caps populated here?' rule

### First step
Phase 1 (ColorTier canonicalization) — independent, mechanical, sets up the larger refactor.

### Reference
Source files to touch:
- `vendor/silvery/packages/ansi/src/detection.ts` (detectColor, detectTerminalCaps, TerminalCaps, ColorLevel)
- `vendor/silvery/packages/ansi/src/color-maps.ts` (ColorTier)
- `vendor/silvery/packages/ag-term/src/runtime/run.tsx` (resolveColorTier, tierToCapsLevel, capsLevelToTier)
- `vendor/silvery/packages/ag-term/src/ansi/term.ts` (three constructors, caps population)