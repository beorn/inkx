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

  The user's screenshot may have actually been showing this wide-char displacement bug rather than a separate "cyan strip residue" — 🇺🇸bun and 🇺🇸 US overlapping with adjacent text could read visually as a horizontal stripe. Worth verifying with a fresh screenshot once the wide-char bug is fixed.

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

## Round 8 — Ghostty WASM probe localizes strip to popover residue (2026-05-05)

User captured real session at 82×75 against `~/Bear/Vault` via the new capture wiring (added to `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` because km goes through `createApp().run()`, not the scheduler — capture was previously dead code for km consumers).

Captured `/tmp/km-ansi.bin` (3.4MB, 4 sessions, 303 frames). Last session at 82×75 fed through `@termless/ghostty` WASM backend in 2KB chunks (works fine on large feeds — earlier "Ghostty WASM chokes" claim was stale). Final-frame cell readout:

- **Exactly 14 cells with bg=rgb(52,58,70), all on row 17, cols 65–78.**
- **No border characters** on rows 16 or 18 (no `╭`, `╮`, `│`, `╯`, `╰`).
- **No content characters** in the 14 cells (all spaces).
- **bg=rgb(52,58,70) = `$bg-surface-overlay`** — popover/dropdown surface token.

Strong shape match: a popover that was visible (likely hover-triggered) painted its 14×N region. When it unmounted, content + borders cleared on most rows — but row 17's bg fill persisted as residue.

### Bisect attempt — couldn't complete

Tried rolling vendor/silvery to `7a81275486` (parent of 168b4989, the clearExcessArea hasPrevBuffer guard). Result: km module-resolution failed with `Cannot find module '@silvery/ag-react/ui'`. The bare `./ui` export was removed from silvery's package.json sometime between Apr 12 (when it landed) and Apr 26 (when dfa27c08 added subpath exports without the bare ./ui). It was re-added on May 4 (`42b4ef19 fix(types): align source exports`).

This means **a clean silvery-only bisect against current km is impossible for any SHA between Apr 12 and May 4** — that interval covers most of the regression window. Bisecting requires either (a) rolling back km too, or (b) a one-off shim adding `./ui` back at the bisect SHA.

User confirmed: bisect at `7a812754` (which DID have `./ui` ironically, before its removal) didn't fix the strips — but that's a misleading data point because `7a812754` is even OLDER than `168b4989`, predating the full paint-clear series. Strips persisting there means the regression predates `168b4989`, OR it's not in the paint-clear refactor at all.

### Silvery agent's synthetic test passes — meaning?

`vendor/silvery/tests/regressions/popover-unmount-bg-residue.test.tsx` (committed in `acfa6c43`): mounts an absolute-positioned Box with `backgroundColor`, unmounts, asserts no bg residue. **Passes on current HEAD.** Synthetic ≠ real; the bug needs whatever real km hover/dwell/popover state machine + layout combination produces, which the synthetic test doesn't capture.

### Recommended next steps for whoever picks this up

1. **Find what km component paints `$bg-surface-overlay`** beyond Popover.tsx (which you can see at `apps/km-tui/src/views/Popover.tsx:325`). Grep for `$bg-surface-overlay` and `bg-surface-overlay`. Toast? Tooltip? Hover preview?
2. **Reproduce the exact interaction** — start km, hover items, walk cursor, watch for popover-shaped 14-cell-wide bg fills appearing then becoming residue. Does it correlate with mouse hover dwell timing? Card title hover? Link target hover?
3. **Run with `SILVERY_DEV=1 SILVERY_DEV_LOG=/tmp/dev.log SILVERY_INSTRUMENT=1`** to expose render pipeline stats. Look for incremental-render decisions on the popover container.
4. **Bisect path-of-least-resistance**: roll back vendor/silvery to a SHA between Apr 12 and Apr 26 AND temporarily patch its `package.json` to re-add `./ui` export. ~15 minutes of git checkout + patch + test cycle.

## Round 9 — full overlay-bg consumer grep + km-shape synthetic still passes (2026-05-05)

Full grep of `$bg-surface-overlay` consumers in km-tui:

- `Popover.tsx:325` — hover popover (canonical, suspected)
- `shared-components.tsx:536` — `NodeLine` (height=1) — used in SearchDialog, ItemPicker, Omnibox
- `OmniboxRow.tsx:70` — omnibox result row
- `NodeView.tsx:622` — full-node detail view
- `CommandBox.tsx:76, 103, 275` — FlashMessage + ChordHints
- `ToastStack.tsx:75` — auto-dismissing toasts (variable timing fits 1-2s lag)

**Intersection of `position="absolute"` + `$bg-surface-overlay`** (strongest residue candidates):

- `Popover.tsx` (line 317 absolute, line 325 bg)
- `ToastStack.tsx` (line 110 absolute, line 75 bg) — auto-dismiss matches the 1-2s timing variability

### km-shape synthetic test added — STILL PASSES

`vendor/silvery/tests/regressions/popover-unmount-bg-residue.test.tsx` (commit silvery `00d2bfaf`) now mirrors km-tui Popover.tsx exactly: `marginTop`/`marginLeft` (not `top`/`left`), `maxWidth`/`maxHeight`, `overflow="scroll"`, `userSelect="contain"`, plus a hover-chain churn test (anchor moves → content grows → dismiss).

**4/4 tests pass under `SILVERY_STRICT=2`.** Confirms: the bug needs the real km state machine (signal-store mount/unmount + mouse-hover dwell + real layout context), not just the shape of the props. **Synthetic reproductions are exhausted.**

### Cell-debug instrumentation in real TTY (82×75 via tty MCP, no mouse)

Drove `bun km view ~/Bear/Vault` with `SILVERY_CELL_DEBUG=68,17` + `SILVERY_CAPTURE_OUTPUT=/tmp/km-strip-tty.bin` + `SILVERY_STRICT=2`. Navigated with keys only (`j`/`l`/`/`/`Escape`) — tty MCP can't simulate hover dwell.

**71 frames captured. The only 1-row-tall box covering col 68 row 17:** `silvery-box@19 rect=42,17 37x1`. This is the `+N more` card footer at `apps/km-tui/src/views/CardColumn.tsx:675-681`:

```tsx
<Box width={width} height={1} flexShrink={0} backgroundColor={cardBg}>
  <Text wrap="truncate">…+{hiddenCount} more…</Text>
</Box>
```

**This is NOT the strip source.** `cardBg` is conditional (`$bg-selected` / `selectedBg(theme)=rgb(56,60,69)` / `multiSelectedBg(theme)` / undefined). None evaluate to `$bg-surface-overlay = rgb(52,58,70)`. Without mouse hover, no `Popover.tsx` mount happens, so the bug doesn't reproduce in keyboard-only sessions.

**`SILVERY_STRICT=2` did not throw** during 71 frames of keyboard-only navigation. Confirms: residue mechanism only fires on mouse-hover-driven popover mount/unmount.

### Conclusion + concrete next-step for user

The bug is **not synthetic-reproducible**. Synthetic + cell-debug-without-mouse have eliminated everything else. To localize further, the user must drive a real session with hover:

```bash
SILVERY_CELL_DEBUG=68,17 \
SILVERY_CAPTURE_OUTPUT=/tmp/km-strip.bin \
DEBUG=silvery:content:cell,silvery:render:phase \
DEBUG_LOG=/tmp/km-strip.log \
SILVERY_STRICT=2 \
bun km view ~/Bear/Vault
```

Then **hover wikilinks/URLs** in cards (mouse dwell) to mount popovers, move mouse away to dismiss, repeat ~30s. Quit (`q`).

Send `/tmp/km-strip.log` lines containing `popover` or `rect=6[5-9],17` or `rect=7[0-8],17` — the AgNode that painted at row 17 cols 65–78 with bg=`$bg-surface-overlay` is the smoking gun. If `SILVERY_STRICT=2` throws during the session, that's the residue gate firing — capture the throw stack.

The next move requires real-hover trace from the user's Ghostty/iTerm2.

## Round 10 — user confirms strip is COLD-START, no interaction needed (2026-05-05)

User ran the Round 9 cold-start command and reports: **"i didn't do the hover - sorry - i just opened it and closed it / the strip is always there"**.

This eliminates ALL hypotheses involving popover, hover, mouse, dwell timing, ChordHints, or auto-dismiss. **The strip is in the FIRST frame** of `bun km view ~/Bear/Vault` at 82×75.

### Captured evidence (`/tmp/km-strip.bin`, 33 frames)

bg-color SGR frequency across all frames:

- 123× `[48;2;46;52;64m]` = `$bg-surface-default` (rgb 46,52,64) — Nord canvas
- 15× `[48;2;56;60;69m]` = `selectedBg(theme) = blend(canvas, accent, 0.06)` — cursorInDescendant tint
- **3× `[48;2;52;58;70m]` = THE STRIP color** (rgb 52,58,70)

**All 3 strip-color SGRs are in Frame 1 (cold start).**

### Color identification — NOT $bg-surface-overlay

Math for Nord (bg=rgb 46,52,64; fg=rgb 216,222,233):

- `$bg-surface-overlay = blend(bg, fg, 0.12)` ≈ rgb(66,72,84) ✗
- `$bg-surface-subtle = blend(bg, fg, 0.03)` ≈ rgb(51,57,69) ≈ rgb(52,58,70) ✓

**Round 8 misattributed the color.** The strip is `$bg-surface-subtle` (or a 0.03-blend equivalent in the user's actual scheme), not `$bg-surface-overlay`. Search space shifts entirely:

`$bg-surface-subtle` consumers in km-tui: **none**. Only silvercode uses it (irrelevant for `bun km view`). So whatever paints rgb(52,58,70) in km-tui is computing it via blend — possibly Sterling's `code` variant in this scheme, or a math-derived bg from a tint helper.

### Frame 1 byte-level evidence — three distinct paint sites

Found 3 strip-color SGRs in Frame 1, with surrounding bytes:

**Occurrence 1** (inline content — bold + bg-tint):

```
…[1mUse [48;2;52;58;70m/inbox[22;48;2;46;52;64m to pull fresh captur…
```

`/inbox` (6 chars) painted with bg=strip-color, inside bold context. Markdown `**…\`/inbox\`…**` rendering. Inline code chip inside bold? Or a sigil/path resolver?

**Occurrence 2** (inline content — bg-tint sandwiched in selectedBg row):

```
…[1mTaxes[22m ([48;2;52;58;70m]Finance/Taxes/[48;2;56;60;69m]):…
```

`Finance/Taxes/` painted with bg=strip-color, surrounded by `selectedBg(theme)` cells. Inline code/path inside a card with `cursorInDescendant=true`.

**Occurrence 3** (trailing-space STRIP — no characters):

```
…thing[22;39m  [38;2;46;52;64m│[39m [48;2;46;52;64m                 [48;2;52;58;70m              [48;2;46;52;64m  [38;2;157;163;175m …
```

~14 cells of bg=strip-color in trailing whitespace, between bg=default regions. **No characters.** This is the visible cyan strip.

### Cell-debug confirmed only one node covers (68,17)

`SILVERY_CELL_DEBUG=68,17` filtered render walk: only `silvery-box@19 rect=42,17 37x1` covers col 68 row 17. That's CardColumn.tsx:675-681 — the `+N more` card footer. Its children are pure `<Text color={borderColor}>` (no bg props). cardBg conditional cannot evaluate to rgb(52,58,70) under any branch.

### Hypotheses (untestable from synthetic — need pipeline tracing)

H1. **bg-cell paint cascade across siblings**: an inline element in a SIBLING card (a card to the LEFT in the resolver column) paints its bg, then the kanban row layout's horizontal flow leaves cells beyond the sibling-card's right edge with that bg. The trailing-space cells at row 17 cols 65-78 (which fall in the GAP between left-column content and right-column content) inherit the leaked bg.

H2. **`<Text variant="code">` bg leaks past content**: silvery's `code` variant emits SGR for bg + content but doesn't reset bg correctly at content end, so trailing whitespace in the same Text run carries the bg.

H3. **A Sterling token resolved on cold-start without proper canvas-bg fill**: an ancestor Box has bg=undefined and silvery's pipeline doesn't fill its rect with parent bg, leaving a tiny region painted from the most-recent ancestor with bg.

### Concrete next step for fix-finder

Run the existing cross-backend test against `/tmp/km-strip.bin` (the real cold-start capture):

```bash
bun vitest run apps/km-tui/tests/render-cyan-strip-cross-backend.slow.spec.ts
```

Or write a focused test that loads `/tmp/km-strip.bin`, feeds Frame 1 to `@termless/xtermjs`, then asserts no cells with bg=rgb(52,58,70) lack a corresponding character within their painted run. The 14 trailing-space cells with bg=$bg-surface-subtle are the smoking gun.

The bug is in silvery's pipeline at the boundary between an inline bg-painting element and the surrounding trailing-whitespace flow. NOT a popover. NOT mouse. NOT residue from prior frame. **Inline content bg → trailing whitespace bg-leak on the very first render.**

## Round 11 — exact strip location + token identification (2026-05-05)

Decoded `/tmp/km-strip.bin` Frame 1 through `@silvery/test` createTermless (xterm-headless). Three regions with bg=rgb(52,58,70):

| termless row | cols  | content           | source                             |
| ------------ | ----- | ----------------- | ---------------------------------- |
| 15           | 51-56 | /inbox            | inline code in @inbox card content |
| 37           | 14-27 | Finance/Taxes/    | inline code in resolver § 2.2      |
| 71           | 66-79 | (14 empty spaces) | THE STRIP                          |

**Token = `$mutedbg`** (legacy theme, blend(bg, fg, 0.04) = rgb(52,58,70) for Nord). Confirmed via `vendor/silvery/packages/ansi/src/theme/derive.ts:183` + `derived.ts:35`:

```ts
code: { backgroundColor: "$mutedbg" }
```

Sterling's `bg-muted` uses 0.08 blend = rgb(60,66,78). The user's theme is using LEGACY `theme/derive.ts` (not Sterling), giving the 0.04 blend. The `code` variant of `<Text variant="code">` paints this.

### Strip persists across all captured frames

Tracked strip status across all 33 frames in `/tmp/km-strip.bin`:

- F1 (cold-start full paint, 19262 bytes): 14/14 strip cells at row 71 cols 66-79
- F2, F3 (`ESC[?25l` only, cursor hide): 14/14 strip cells (unchanged)
- F4 (status-bar update at row 75): cells STILL there but content scrolled up by 1, strip moves to row 70
- F5–F33: strip persists at row 70 throughout

**The strip does NOT clear.** It's painted at cold-start and never repainted with default bg.

### Frame 1 byte-level emit at row 72 (ANSI-1-indexed; = termless row 71)

```
[72;1H[48;2;46;52;64m [38;2;46;52;64;48;2;56;60;69m│[39m [38;2;143;149;161m·[38;2;216;222;233m If you walk the tree and [1mnothing[22;39m  [38;2;46;52;64m│[39m [48;2;46;52;64m                        [48;2;52;58;70m              [48;2;46;52;64m  [38;2;157;163;175m
```

Row layout decomposed:

- col 1: bg-default space
- col 2: left card border `│` (with selectedBg tint — cursorInDescendant)
- cols 3-38: "· If you walk the tree and **nothing**" (left card content, wrap=truncate)
- col 39: 2 spaces + right border `│` (invisible — fg=bg-default)
- cols 40-64: 25 spaces with bg=default (gap between left and right column)
- **cols 65-78: 14 spaces with bg=$mutedbg ← THE STRIP** (in the right-column area)
- cols 79-80: 2 spaces with bg=default
- col 81: scroll indicator `▸` (fg=muted)

### What's NOT the strip source

- **Wrap-truncate inline-code bg-leak**: synthetic test mirrors `<Text wrap="truncate"><Text variant="code">…` correctly truncates bg with content. NO leak past visible boundary.
- **`+N more` card footer (CardColumn.tsx:675)**: cardBg conditional, none evaluate to $mutedbg.
- **NodeLine/Popover/Toast/CommandBox**: all use $bg-surface-overlay (rgb 66,72,84), not strip color.
- **Skeleton cards**: use $muted fg, no bg.
- **Right column (@inbox) cards**: end at row ~30; row 71 is in empty column area below cards.

### Strongest remaining hypothesis: an off-screen card or wrapped content emits inline-code bg at this position

The strip cols 65-78 width 14 matches `~vault/@inbox/` (14 chars) — an inline-code element in `RESOLVER.md` line:

> If you walk the tree and nothing matches, the item stays in ~vault/@inbox/ (for markdown)…

Hypothesis: the resolver card's content extends beyond the visible portion. The wrap-truncate cuts at "nothing" (col 38). But silvery's incremental render OR layout cascade emits bg-paint for the inline-code segment at the position it WOULD have rendered if the card were wider — projecting into the right-column area at cols 65-78.

This isn't reproducible synthetically (the simple wrap-truncate test passes). It requires real km card layout + real markdown content + real layout-feedback measure cycle. The bug is somewhere between:

1. `apps/km-tui/src/views/TreeNode.tsx` line 869 (card-child Text wrap=truncate)
2. silvery's text wrapper measuring inline `<Text variant="code">` segments
3. silvery's render-phase cell-paint for clipped/truncated inline segments

### Concrete next step

Spawn the silvery agent on the localized site:

- Set up `bun km view ~/Bear/Vault` at 82×75 with `SILVERY_INSTRUMENT=1 SILVERY_DEV=1 SILVERY_DEV_LOG=/tmp/dev.log SILVERY_CELL_DEBUG=72,71`
- Trace what AgNode is responsible for the cell paints at (72, 71) cols 65-78 (1-indexed col 66+)
- Once the AgNode is named, look at its render-phase emit path for trailing-whitespace bg
- Or write a test that loads `RESOLVER.md`'s exact line in a 38-wide truncated card with `~vault/@inbox/` inline code, asserts no bg paints outside the card's right border

## Round 12 — RESOLVED (2026-05-05)

**Root cause**: `applyBgSegmentsToLine` in `vendor/silvery/packages/ag-term/src/pipeline/render-text.ts` walked every grapheme of the line and emitted bg paint at displayOffset positions within the segment range, **without clipping to the parent's visible region**. When a Text node's natural-flow width exceeds its visible parent (e.g. `<Text wrap=wrap>` in a body card narrower than the text's natural width), `renderGraphemes` correctly clipped chars at `rightEdge = min(maxCol, sink.width)`, but `applyBgSegmentsToLine` had no analogous clip — leaving bg-only cells past the parent's right border.

**Fix**: Added `maxCol` and `minCol` parameters to `applyBgSegmentsToLine`. Skip cells outside `[leftClip, rightClip)`. Same clip semantics for chars and bg paint is now the invariant. Call site passes the existing `maxCol`/`minCol` already computed for `renderTextLineReturn`.

**Verification**:

- `vendor/silvery/tests/regressions/applybg-clip-to-visible-region.test.tsx` — synthetic regression (2 tests). Catches bug on baseline (4 leak cells), passes with fix.
- `apps/km-tui/tests/render-cyan-strip-cold-start-82.slow.spec.ts` — real-vault regression. Loads `~/Bear/Vault` at 82×75 with Nord theme via `testBoard({ theme: nordTheme, parseDeferred: true })`. Catches the bug on baseline (14 leak cells at row 71 cols 65-78), passes with fix.
- Silvery features (2139 tests) + regressions (12 tests) — green.
- km-tui default (2596) + slow (1179) — only pre-existing failures (verified by re-running on baseline).

**Why testBoard didn't reproduce earlier**: defaults to `ansi16DarkTheme` (`mutedbg = #2e3440 = canvas bg, indistinguishable`); user's sessions use Nord (`mutedbg = #343a46, distinct`). Added `theme?: Theme` option to testBoard. When synthetic + testBoard probes both miss a user-visible bug, **first check theme-path parity**.

**Files**:

- `vendor/silvery/packages/ag-term/src/pipeline/render-text.ts` — fix
- `vendor/silvery/tests/regressions/applybg-clip-to-visible-region.test.tsx` — synthetic test
- `apps/km-tui/tests/render-cyan-strip-cold-start-82.slow.spec.ts` — real-vault test
- `apps/km-tui/tests/helpers/real-board.ts` — `theme?: Theme` option added
- `.claude/agents/expert/silvery-knowledge.md` — Round 12 lesson

