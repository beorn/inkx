# Testing Escape Hatches: Two Rendering Bugs That Evaded Detection

Two rendering bugs persisted for weeks despite SILVERY_STRICT (including vt100 output verification), 43 wide-char matrix tests, PTY integration tests, fuzz tests, and three terminal emulator backends. This document analyzes why the testing infrastructure failed to catch them and what systemic changes prevent recurrence.

## The Bugs

### Bug 1: OSC 66 Swallowing Emoji in Ghostty

`wrapTextSizing()` wraps wide characters in `ESC]66;w=2;<char>BEL` to declare width to the terminal. A widechar refactoring changed it to wrap ALL wide characters (was previously PUA/nerdfont only). Ghostty was assumed to support OSC 66 via heuristic (`termProgram === "ghostty"`). In reality, Ghostty v1.3.0 parses OSC 66 but does NOT render it — it silently swallows the wrapped content. All emoji disappeared from the TUI.

This bug had already occurred and been fixed once (bead `km-inkx.text-sizing-osc66`, 2026-02-28), then was re-introduced by the widechar refactoring two weeks later.

### Bug 2: Buffer Overflow Causing Scroll Desync (Zoom Garble)

In fullscreen mode, `bufferToAnsi` writes all buffer rows to the terminal. During zoom on a large vault, the buffer can temporarily exceed terminal height (e.g., 50 rows for a 40-row terminal). Writing past the last row causes the alternate screen to scroll, desynchronizing `prevBuffer` from actual terminal state. The next incremental render's diff skips "unchanged" cells that are actually different — ghost pixels.

The user reported zoom garble many times across multiple sessions. Each session investigated, sometimes shipped "fixes" that passed tests but didn't fix the real bug.

## 5-Why Analysis

### Bug 1: Why did OSC 66 emoji loss escape detection?

1. **Why wasn't it caught?** Tests reported the output as correct.
2. **Why did tests report it as correct?** The output oracle (`replayAnsiWithStyles`) interprets OSC 66 the same way as the generator — they share the same assumptions. The xterm.js backend actually supports OSC 66.
3. **Why was there no failing contradiction?** No test exercises a terminal profile where OSC 66 is unsupported or partially supported. The Ghostty WASM backend DID log "unsupported OSC: 66" warnings, but console output is suppressed in tests.
4. **Why was there no unsupported-profile test?** Text sizing support was decided by a heuristic allowlist (`termProgram === "ghostty"`) instead of runtime capability probing. `detectTextSizingSupport()` (async detection via cursor position reports) existed but was never wired up.
5. **Why did the heuristic survive?** The architecture treated capability detection as optional convenience rather than a correctness dependency for a private protocol that carries visible content.

**Root cause**: Self-referential output verification plus optimistic feature enablement of a private sequence, without fail-closed capability probing.

**Key insight from GPT 5.4 Pro**: "Never put the only copy of user-visible content inside a private control sequence unless support is proven." OSC payloads are consumed as command data — if unsupported, the terminal discards the payload, not renders it as text. This is by design in ECMA-48.

### Bug 2: Why did buffer overflow/scroll desync escape detection?

1. **Why wasn't it caught?** SILVERY_STRICT verified incremental buffer == fresh buffer — both agreed.
2. **Why did that pass?** Both render paths produced the same virtual buffer. The bug occurred later, when bytes were written to a real terminal with finite height.
3. **Why wasn't the output-stage bug exercised?** Test fixtures use small node trees (5-20 nodes) that always fit in test terminals. No test used a fixture that exceeded terminal height during zoom.
4. **Why didn't the code guard against it?** `bufferToAnsi` already had `maxRows` clamping for inline mode (to prevent scrollback corruption), but fullscreen mode was assumed safe ("alternate screen can't scroll" — wrong).
5. **Why was that assumption allowed to persist?** The API/model treated the virtual render buffer as authoritative. Terminal dimensions were not encoded as a non-negotiable output invariant in fullscreen mode.

**Root cause**: No explicit physical-screen invariant in fullscreen output, plus missing boundary tests around viewport height. `prevBuffer` tracked the desired virtual frame, not the last physically committed frame.

### Why was the user's repeated report not prioritized?

1. **Why wasn't it prioritized?** Each investigation found green tests and no easy local repro.
2. **Why did green tests outweigh user reports?** The team implicitly trusted automated evidence more than field evidence.
3. **Why was that trust misplaced?** The automation was not sampling the failing dimensions: terminal capability variance and oversize viewport scenarios.
4. **Why didn't repeated reports force escalation?** No durable triage mechanism required issue ownership, reproduction artifact capture, or a regression test before closure.
5. **Why is this especially likely across AI-assisted sessions?** AI sessions are stateless and locally optimizing: "tests pass → patch merged → conversation over" — without durable memory, ownership, or escalation policy.

**Root cause**: Process lacked a rule that repeated user-visible rendering corruption overrides green but non-representative tests.

## The Deeper Pattern

Both bugs sit in the gap between **internal model correctness** and **external terminal behavior**:

> The suite validated Silvery's internal rendering model more thoroughly than it validated real terminal behavior under adverse capability and boundary conditions.

The test suite had breadth but not orthogonality. Many tests were correlated: same parser assumptions, same feature assumptions, same nominal-size fixtures, same notion of correctness (buffer equality). This creates a **coverage illusion** — many green tests, all blind in the same direction.

### Warning Signs of Self-Referential Testing

1. Implementation and oracle share the same parser/tables
2. The same capability assumptions are used in code and tests
3. Tests assert transformed internal state, not user-visible state
4. Unsupported-sequence warnings are ignored
5. All fixtures are nominal-size and "happy path"
6. Real user bugs contradict green CI repeatedly
7. Backends are diverse in brand name but not in behavioral disagreement

Our case exhibited signs 1, 2, 4, 5, and 6.

## Specific Questions Answered

### Is vt100 output verification (via SILVERY_STRICT) useful?

**Yes, but not as primary correctness oracle.** It is useful for fast deterministic regression checks, serializer/parser round-trip sanity, debugging ANSI generation, and style/cursor expectations within the semantic model. It is NOT sufficient for terminal compatibility, private escape sequence support, scroll/wrap side effects, or stateful physical-screen correctness.

**Its role**: internal output consistency, not ground truth. `STRICT_TERMINAL` feeds output into an independent terminal emulator and compares visible cell grid + cursor position + scroll state for real-world correctness.

### Why wasn't `detectTextSizingSupport()` wired up?

Integration friction: async probe vs sync pipeline mismatch. The heuristic was easier (one-line terminal-name check vs capability state machine + redraw path). Tests didn't punish the shortcut since CI ran on supportive backends. The feature was seen as enhancement, not correctness dependency — but once visible content depends on it, it IS a correctness dependency.

**Architecture**: Use progressive enhancement. Start with `osc66 = false`, render safely without it, asynchronously probe support, enable + full redraw on success, cache by terminal fingerprint. Allow user override (`always` / `auto` / `never`).

### Belt-and-suspenders: Should OSC 66 and CUP re-sync be either-or?

**Not either-or conceptually — they solve different problems.** OSC 66 asks the terminal to treat glyph width a certain way. CUP re-sync repositions cursor after possible width disagreement. They are complementary.

But operationally: CUP is standard and generally safe. OSC 66 is private and unsafe if unsupported. So: **safe baseline = plain text + CUP re-sync. Optional enhancement = OSC 66 only after positive support detection.** The risky one must be gated independently. CUP cannot rescue swallowed content — once text is consumed inside an OSC payload, it never reaches the rendering path.

### Console output suppression

Suppressing console output in tests is normal. The mistake is treating all console output as equal noise. `"unsupported OSC: 66"` was the emulator saying "your portability assumption is false" — that is **oracle output**, not logging.

**Fix**: Capture diagnostics structurally (`warning.code = UNSUPPORTED_OSC`). In tests: unexpected warnings fail, expected warnings require explicit allowlist.

### Parameter threading: Should `termRows`/`maxRows` use a context bag?

**Yes, but the deeper win is architectural.** Separate: (1) virtual render — can be larger than viewport, (2) physical frame materialization — clipped to viewport, (3) ANSI emission — only from physical frame. If you do this, `termRows` is only needed at the virtual-to-physical boundary, not threaded through 8 functions.

Use typed context objects: `Viewport { cols, rows }`, `TerminalCapabilities { osc66, cpr, truecolor, ... }`, `OutputContext { viewport, caps, mode, prevPhysicalFrame }`.

## How Other Frameworks Handle This

**ratatui/tui-rs**: Widgets render into a `Rect`/buffer bounded by terminal size — overflow is clipped by design.

**Bubble Tea**: Apps receive window-size updates. Large content is handled by viewport components, not raw extra rows.

**Blessed/Ink**: Screen/element hierarchy with coordinates, scrollable regions, and clipping at the screen/widget layer.

**Common pattern**: Separate logical content size, viewport size, and physical emission. Our overflow bug came from conflating these at output time.

## Action Plan

### Immediate (fixes applied this session)

- [x] Remove Ghostty from OSC 66 heuristic in `text-sizing.ts` and `detection.ts`
- [x] Always pass `termRows` to cap fullscreen output in `output-phase.ts` and `create-runtime.ts`
- [x] Filter diff changes beyond `termRows` in incremental render path
- [x] Verify inline mode scrollback refresh still works (capping shows bottom of content)

### Near-term (beads created)

1. **Wire `detectTextSizingSupport()`** — default `osc66 = false`, async probe, enable + full redraw on success, cache by terminal fingerprint. Allow user override.
2. **Add `STRICT_TERMINAL` mode** — feed output into independent emulator (xterm.js or vt100), compare visible cell grid + cursor position. This catches both bug classes.
3. **Add boundary tests** for height-sensitive rendering: `rows-1`, `rows`, `rows+1`, `2*rows`, and zoom/resize transitions with large vaults.
4. **Add capability matrix tests** — test with `osc66: supported`, `osc66: unsupported`, `osc66: parse-but-swallow` profiles.
5. **Route emulator warnings to test failures** — `"unsupported OSC"` from Ghostty WASM should fail tests unless explicitly expected.
6. **Introduce `OutputContext` type** — consolidate `termRows`, `mode`, `caps` into typed context objects instead of threading through 8 functions.

### Process

7. **Bug triage escalation rule**: 1st report = open issue + env fingerprint. 2nd report = severity bump + assigned owner. 3rd report or multi-session recurrence = require regression test or concrete disproof before closure.
8. **AI session handoff**: rendering bugs may NOT be closed without (a) new failing test targeting the specific bug, AND (b) user verification in the actual terminal. "Tests pass" is necessary but not sufficient.

## References

- ECMA-48 / ISO 6429 — Control Functions for Coded Character Sets
- xterm Control Sequences (Thomas Dickey / Invisible-Island)
- Unicode Standard Annex #11: East Asian Width
- McKeeman, "Differential Testing for Software" (1998) — using independent implementations when a perfect oracle is unavailable
- vttest — classic terminal behavior validation suite
- Ratatui, Bubble Tea, Blessed, Ink — framework patterns for viewport/clipping
