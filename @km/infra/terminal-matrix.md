---
mentions:
  - km
id: "@km/infra/terminal-matrix"
aliases:
  - km-infra.terminal-matrix
  - km-infra-terminal-matrix
created_by: claude:d697f216
created_at: 2026-02-26T12:36:45Z
owner: bjorn@stabell.org
---

# [ ] Cross-terminal testing matrix: automated visual verification across terminals and platforms @km/infra #task #P4

Build a caniuse-style database of terminal capabilities and discrepancies, tested via termless cross-backend tests.

## Vision

Run the same ANSI sequences through multiple termless backends (xterm.js, ghostty WASM, vt100, alacritty, wezterm) and compare cell-by-cell. Discrepancies become the database: "ghostty treats flag emoji as 2×width-1, xterm.js treats as 1×width-2" etc.

## Why

The flag emoji garble bug (@km/silvery/flag-emoji-garble) exposed that our test infrastructure only tests against xterm.js, which agrees with our width assumptions. The bug only manifests in terminals that disagree. We have 9 termless backends but only use 1 in most tests.

## Concrete deliverables

1. Cross-backend conformance suite: same buffer → ANSI → feed to N backends → compare cells
2. Discrepancy database: structured data about which terminals disagree on what (emoji width, OSC support, cursor behavior)
3. STRICT mode integration: when running with multiple backends, detect drift between them and flag as invariant violations
4. CI integration: run cross-backend tests in CI, fail on new discrepancies

## Existing foundation

- 9 termless backends in vendor/termless/packages/
- 36 cross-backend tests in vendor/termless/tests/cross-backend.test.ts
- output-phase-wide-char-matrix.test.ts (43 tests) — seed for the conformance suite
- OSC 66 support detection in text-sizing.ts

## Key insight

CUP cursor re-sync hides errors — it silently corrects drift. The matrix should detect drift WITHOUT the CUP fix, then verify the CUP fix corrects it. That makes drift a testable invariant instead of a hidden correction.

