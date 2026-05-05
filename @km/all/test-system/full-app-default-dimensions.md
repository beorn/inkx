---
aliases:
  - km-all.test-system.full-app-default-dimensions
  - km-all-test-system-full-app-default-dimensions
created_at: 2026-05-05T21:23:09.713Z
---

# [x] Default full-app test dimensions to 360x120 (match user terminal, not 80x24) #feature #P2

## Resolution 2026-05-05 (silvery agent)

`apps/km-tui/tests/helpers/real-board.ts` now defaults to **360 × 120** for full-app fixtures via the new exported constants `FULL_APP_DEFAULT_COLS / FULL_APP_DEFAULT_ROWS`. The principle: narrow component helpers (TextInput / Spinner / single-column lists) keep their 80 × 24 defaults; full-app helpers use modern dev-workstation defaults where pipeline regressions actually surface (the cyan-strip incident reproduced at 352 × 117, hid at 80 × 24).

Documented in the helper's module docstring with a pointer to `feedback-km-view-test-dimensions.md`. The silvery-side canary (@km/silvery/render-degenerate-frame-canary) catches the related class of bugs structurally — any test helper that passes large dimensions to silvery but produces a degenerate frame trips the canary.

Future: when more full-app helpers (e.g. `createTestApp.fromVault`) gain real-vault paths, mirror this default. Tracked as a sub-bullet in @km/all/test-system if needed; not opening a separate bead.

createRenderer / createTermless / testBoard default to 80x24. Real user environment: 352x117 (full Ghostty + sidebar). Width-sensitive bugs (multi-column kanban, tabs, side panels) only manifest at user-realistic dims and pass at 80x24.

Today's incident: cyan strip residue in 13-column kanban only surfaced at 352x117. Default 80x24 fixtures hid it.

Proposal: split test-helper defaults into two tiers.
- Narrow components (TextInput, Spinner, Code, single-column lists): keep 80x24
- Full-app helpers (testBoard, run-defaults contract tests, end-to-end app fixtures): default to 360x120

Document the rule in vendor/silvery/CLAUDE.md (Testing section) and in km-tui's test docs. The recently-saved memory feedback-km-view-test-dimensions.md captures the principle.

Acceptance:
- testBoard signature: testBoard(vaultPath, { cols=360, rows=120 }={})
- Full-app fixtures in tests/contracts/ use 360x120 unless asserting narrow-terminal behavior
- silvery CLAUDE.md Testing section calls out the two-tier default
- existing tests adjusted to either pass new dims or stay at 80x24 if intentional
