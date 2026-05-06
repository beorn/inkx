---
aliases:
  - km-silvery.render-light-blue-bg-strip-residue
  - km-silvery-render-light-blue-bg-strip-residue
created_at: 2026-05-05T20:48:14.796Z
---

# render: light-blue/cyan background strips appear in cards #bug #P1

User reports random pale-cyan ~1-row-tall horizontal strips appearing inside cards across the kanban board in km view. Pipeline territory — strongly suspect outline incremental clear, postState carrier survives Ag recycle, or ExcessClearGate. Screenshot at ~/Desktop/Screenshot 2026-05-05 at 13.44.35.png. Repro: DEBUG=silvery:render DEBUG_LOG=/tmp/silvery-bug.log SILVERY_INSTRUMENT=1 SILVERY_STRICT=1 bun km view ~/Bear/Vault

## Investigation 2026-05-05 (silvery agent)

**Status: cannot reproduce. Kept P1.**

### Likely color source

`$border-focus = scheme.accentBg` in Sterling. In Nord (the user's likely theme) accent is teal/cyan. km-tui only paints `$border-focus` on the editing card's outline (`apps/km-tui/src/views/shared-components.tsx:104`). `$bg-cursor` and `$bg-selected` are also cyan-ish in Nord but only land on popover `NodeLine` (`shared-components.tsx:536`) and the cursor card head row.

### Reproduction attempts (all failed to trip STRICT)

1. Synthetic STRICT test: `vendor/silvery/tests/features/outline-in-flex-row.test.tsx` — 3 tests, kanban-shaped 30-card layout, cursor + edit-toggle + view-mode cycles, including adjacent-card outline-corner overlap. PASSES under `SILVERY_STRICT=1`.
2. Real-vault test: `apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` — `testBoard(/Users/beorn/Bear/Vault)` + ~80 presses (cursor walk × 12, edit toggle × 5, fold/unfold, view-mode cycle, edit-after-view-change). PASSES under `SILVERY_STRICT=1`, `=2`, and `SILVERY_STRICT_TERMINAL=vt100`.
3. Live binary: `SILVERY_STRICT=2 SILVERY_STRICT_TERMINAL=vt100 timeout 8 bun km view ~/Bear/Vault`. Empty STRICT log, exit 0, no divergence.
4. Initial frame buffer dump (`DEBUG=silvery:render`) — only 4 distinct background RGB values, all dark blue-grey (`46,52,64`, `52,58,70`, `56,60,69`, `67,76,94`). NO cyan in the static first frame.

### Suspect zones inspected (all clean against the symptom)

- `3adc242b` postState carrier survives per-frame Ag recycle: tests cover parent-edge geometry, 20 toggle cycles, sibling outline migration. `clearPreviousOutlines` → content render → `renderDecorationPass` order is snapshot-then-overwrite.
- `78c63075` outlineSnapshots hoisted off `TerminalBuffer` onto `RenderPostState`: plumbing refactor only.
- `c7cf9390` `ExcessClearGate`: structural invariant — typed witness, miscalls unrepresentable.
- `5c3a266c` `clearNodeRegion` / `clearExcessArea` decoupling: single-coordinator pattern in `executeRegionClearing`. Both gates fire independently.
- `decoration-phase.ts` walk: scroll-container visibility filter excludes off-screen children, but kanban columns don't use `overflow=scroll` (they use `+N more` truncation), so this gate doesn't apply to the screenshot scenario.

### Artefacts kept

- `vendor/silvery/tests/features/outline-in-flex-row.test.tsx` — 3 STRICT regression tests for kanban-shape outline interactions (closes a coverage gap: existing outline tests use simple Box columns, not kanban-shape flex rows).
- `apps/km-tui/tests/helpers/real-board.ts` — `testBoard` now wraps with `ServicesProvider` so interactive `press()`-based real-vault tests run (was crashing with "useServices: not inside ServicesProvider"; also unlocks the asana-vault tests beyond their `.skip`).
- `apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` — long-action real-vault test (`skipIf` no `/Users/beorn/Bear/Vault`). Future regression net.

No silvery-side code changes. Nothing was branched or pushed.

### What's needed to make progress

1. A fresh screenshot of the same bug, ideally captured during/after a specific action sequence the user can describe.
2. Buffer dump of the bad frame: `DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log bun km view ~/Bear/Vault`, reproduce, then `tail /tmp/silvery.log`.
3. If the strips are mouse-hover-related: wikilink hover paints `#404050` via `apps/km-tui/src/text/link-interaction.ts:127` — check whether the strips align with wikilink positions.
4. Worth adding a `SILVERY_STRICT_TERMINAL=ghostty` profile to catch ghostty-specific OSC / wide-cell artefacts that the vt100 backend misses.

## Investigation 2026-05-05 round 2 (silvery agent, after fresh 352×117 screenshot)

**Status: still cannot reproduce. Test harness blocker discovered.**

User confirmed bug reproduces at terminal size 352 × 117 (13 columns visible). Updated `render-light-blue-strip-residue.slow.spec.ts` to drive the real vault at exactly that geometry and added a per-frame strip detector that scans `app.cell(col, row).bg` for blue-grey runs (Nord `selectionBackground = #4C566A` ≈ rgb(76,86,106) and broader cyan envelope).

**Test harness blocker.** While confirming the detector worked end-to-end, dumped the bg-color histogram of a fully-driven testBoard render:

```
Frame size: 352x117, total cells = 41184
Cells with non-null bg: 352   ← all on row 0 (title bar only)
Top bg colors: 197,203,215: 352
fg histogram total: ~100 cells
```

The headless test renderer collapses the entire board to ~1 row of content. `vendor/silvery/CLAUDE.md` warns: "Pin root width/height when testing full-app layouts — `createRenderer({cols, rows})` does NOT set `root.style.width/height`." `apps/km-tui/tests/helpers/real-board.ts` renders `<Board />` directly without a `<Box width={cols} height={rows}>` wrapper. Production uses `<Screen>` which pins both.

Consequence: the existing real-vault STRICT test passes because virtually nothing is being rendered. The pipeline cascade paths exercised in production at full size (13 columns × 117 rows of content with deep flex nesting) are never touched by the test. STRICT, the strip detector, and any other invariant — all green by default.

**Tried at 352×117** with both WIP `layout-phase.ts` (Math.round on scrollOffset) applied AND `SILVERY_STRICT=2 SILVERY_STRICT_TERMINAL=vt100`: zero hits. Same reason — empty frame.

### Next concrete step (P1 unblocker)

Fix `apps/km-tui/tests/helpers/real-board.ts` so `testBoard()` actually renders full-app content. Tried wrapping `<Board />` in `<Box width={columns} height={rows} flexDirection="column">` — frame still degenerate (only the title bar paints). The fix is deeper than a width/height pin: probably need a real `<Screen>` (or equivalent term-aware wrapper) at the root, plus whatever signals/context Board reads to know its viewport. Until this is fixed, every `.slow.spec.ts` using `testBoard` is silently no-op'ing — STRICT, the strip detector, and any other invariant check are vacuous.

This finding is independent of the cyan-strip bug. File a separate bead under `@km/all/test-system` for the harness defect.

### Artefacts kept (round 2)

- `apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` — updated to 352×117, added strip-bg detector via `app.cell()`. Passes today (false negative due to harness blocker above), but will catch the bug once the harness is fixed.

## Investigation 2026-05-05 round 3 (silvery agent, after harness fix)

**Status: cyan-strip residue not reproduced. Wide-char STRICT divergence found instead.**

After fixing @km/all/test-system/test-board-empty-frame (testBoard now renders a real 352×117 frame), reran the strip detector. Findings:

1. The strip detector has been refined to:
   - Group strip-color runs into vertically-contiguous **rectangles** (not individual rows). The cursor card's full body is a tall (>= 3 rows) rectangle and gets filtered out as legitimate.
   - Exempt rows that contain the current cursor (the cursor sub-item paints a 1-row-tall stripe of `$bg-selected`, also legitimate).
   - Only flag short (1-2 row) bg-selected rectangles in non-cursor areas — the actual residue signature.

2. With these refinements, **zero residue strips reproduce** through ~280 presses (cursor walks, edit toggles, fold/unfold, view-mode cycles, post-view-mode edit toggles, scrub passes). The cyan-strip the user saw in the screenshot may be a different visual artefact than what the detector targets, or the specific action sequence to reproduce remains elusive.

3. **Wide-character STRICT regression discovered.** The new harness exposed a real STRICT_OUTPUT divergence: regional-indicator flag emoji (e.g. `🇺🇸`) replacing narrow text in the same row leaves stale chars at the continuation cell. silvery's render walk produces correct buffer state (wide=true at col N, cont=true at col N+1) but the vt100 emulator used by STRICT counts the emoji as 1 column, so the prior frame's narrow char survives at col N+1. Filed as @km/silvery/strict-output-flag-emoji-width-divergence (P2).

   The user's screenshot may have actually been showing this wide-char displacement bug rather than a separate "cyan strip residue" — `🇺🇸bun` and `🇺🇸 US` overlapping with adjacent text could read visually as a horizontal stripe. Worth verifying with a fresh screenshot once the wide-char bug is fixed.

### Next concrete step

If the user reports the strip again: ask whether it correlates with rows containing flag emoji or other wide graphemes. If yes, the user-visible bug is the wide-char STRICT divergence (already filed). If no, we need a different reproduction.

## Resolution gate (2026-05-05, round 4 framing)

This bead remains open as a **gate** on the flag-emoji fix landing. Plan:

1. Once `@km/silvery/strict-output-flag-emoji-width-divergence` lands (silvery agent in flight in pool slot wt1 as of 22:35), run km against the real vault again and confirm the strips are gone.
2. If gone → close this bead. The user-visible "cyan strip" was the wide-char displacement all along.
3. If still present → reopen with a fresh screenshot at known terminal dims, capture `DEBUG=silvery:* DEBUG_LOG=/tmp/silvery.log` of the bad frame, and escalate. Possible alternate causes: ghostty-specific OSC artefacts (the vt100 STRICT backend doesn't catch these), a slow-cadence outline-snapshot leak that hasn't surfaced in 280 presses, or selection-cluster bg leak through view-mode transitions not yet covered by `outline-in-flex-row.test.tsx`.
4. The architectural reframe `@km/silvery/render-stateless-pipeline-reframe` (P1 epic) eventually retires this entire bug class — once landed, this bead is moot.

## Round 5 — narrowed to ANSI-emit / Ghostty layer (2026-05-05)

Post-flag-emoji + post-residue-invariant. Three pieces of evidence converge:

1. **`SILVERY_STRICT=residue` does NOT throw** on the user's real vault at cold-start — the sentinel-compare residue check passes, meaning no stale prev-cell carry-over and no pipeline-state contamination.
2. **Headless buffer probe (vendor/silvery@2c5bb672 driving testBoard at 360×120)** found exactly ONE card with non-default bg at cold-start — the cursor card painted with `selectedBg` (cyan-tinted). Every other cell in the buffer matched canvas-bg or specific known tokens (title bar, status bar, accounted for).
3. **User screenshot at cold-start with zero interaction** still shows the strips across many cards.

**Conclusion: the strips exist in the rendered terminal but NOT in the silvery buffer.** They are introduced at the output-phase ANSI emit OR by Ghostty's interpretation of the emitted ANSI. The silvery render pipeline is correct; the ANSI delivery / terminal painting layer is where the strips appear.

This is the same SHAPE as `@km/silvery/strict-output-flag-emoji-width-divergence` (vt100 rendering disagreed with the buffer model) but a different content.

### Next concrete step

Capture the actual ANSI output and replay through silvery's vt100 backend:

```bash
SILVERY_CAPTURE_OUTPUT=/tmp/km-ansi.bin SILVERY_STRICT=residue bun km view ~vault
# render kanban, exit
```

Then replay `/tmp/km-ansi.bin` through xterm.js / vt100 / Ghostty WASM and compare the parsed terminal state against the silvery buffer model. Two outcomes:

- **vt100 also paints the strips**: silvery emits wrong ANSI — likely a missed background-reset before transitioning between cells with different bg, or a partial line-clear that leaves stale bg. Fix in `packages/ag-term/src/pipeline/output-phase.ts`.
- **vt100 doesn't paint strips, only Ghostty does**: Ghostty-specific terminal interpretation bug. File at the Ghostty boundary; `SILVERY_STRICT_TERMINAL=ghostty` would need to catch it.

The architectural reframe (`@km/silvery/render-stateless-pipeline-reframe`) does NOT retire this class — that's a buffer-model concern, and this bug is downstream of the buffer.

## Round 6 — cross-backend test result + iTerm2 reproduction (2026-05-05)

Silvery agent landed `apps/km-tui/tests/render-cyan-strip-cross-backend.slow.spec.ts` — feeds silvery's emitted bytes (48,931 bytes from real km-tui kanban at 360×120) into both xterm and Ghostty WASM backends. Result:

- **xterm**: parses bytes correctly. Card body bgs paint as `rgb(67,76,94)` (Nord `polar-night-3`), breadcrumb header as `rgb(197,203,215)`. **Bytes are well-formed.**
- **Ghostty WASM**: returns `bg=null` for ~30+ cells where xterm has correct RGB. Likely a `@termless/ghostty` cell-readout-API quirk, not a real-paint bug. WASM and native share the parser core but expose cells differently.
- **Falsified**: "silvery emits malformed ANSI". xterm interprets the bytes correctly.

**iTerm2 reproduction (user, 2026-05-05)**: Same strips appear in iTerm2. **Not Ghostty-specific.** Timing varies: sometimes 1-2s after launch, sometimes immediately on cold-start. Variable timing → **race condition**, not a deterministic post-event transition.

### What the iTerm2 + variable-timing evidence shifts

- **Rules out** terminal-emulator interpretation bugs (iTerm2 + Ghostty agree → silvery's emit is the same in both).
- **Rules in** a silvery emit issue that xterm.js parses forgivingly but real terminals (iTerm2 + Ghostty) paint as visible artifacts. xterm.js's tolerant parser may be hiding it.
- **Variable timing → race**: candidates include skeleton render → deferred parse re-render, scrollback-anchor recompute, layout-feedback re-pin, sticky-pass on cold-start, OR something paint-order-sensitive that depends on which task wins the first event-loop tick.
- **Skeleton→full-parse transition** is the strongest hypothesis: km's `discoverOnly` path renders skeleton cards immediately, then full parse re-renders. The transition is exactly where bg-painted cells could get orphaned if the dirty-flag cascade has a gap.
- testBoard probe at 360×120 ran with `parseDeferred:true` — would NOT capture the skeleton frame. Need a probe that snapshots BEFORE and AFTER the deferred parse, AND that captures all intermediate frames during the race window.

### Next probes (in priority order)

1. **Snapshot the skeleton frame**: extend `render-cyan-strip-cross-backend.slow.spec.ts` to render with `parseDeferred:false`, snapshot bytes for skeleton frame, advance the parse, snapshot bytes for full-parse frame, compare cell grids in xterm + vterm + Ghostty backends side-by-side. If strips appear in any backend's mid-transition snapshot → bug localized to silvery's repaint cascade during shape change.
2. **vterm as third reference leg**: extend test to use `@termless/vterm` (full-coverage emulator). If vterm matches xterm but disagrees with what real terminals paint, narrow further.
3. **Capture real ANSI from `bun km view`**: previous capture command produced no file. Re-run with explicit absolute path: `env SILVERY_CAPTURE_OUTPUT=/tmp/km-ansi.bin bun km view ~/Bear/Vault` (zsh `~vault` alias may have eaten the env). Then grep the bytes for: SGR-state edge cases, `\x1b[K` (EL) emissions while bg-color SGR active, CUP/CUF without preceding `\x1b[0m`.
4. **Run `bun km view` with `SILVERY_STRICT=2 SILVERY_STRICT_ACCUMULATE=1`** in iTerm2 — replays accumulated frames, catches drift that per-frame STRICT misses.
