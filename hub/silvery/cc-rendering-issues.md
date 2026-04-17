# Claude Code Rendering Issues — Reference

Research date: 2026-04-05. Sources: GitHub issues, HN threads, chrislloyd's public comments.

## Summary

- **Total rendering-related issues found**: ~60+ (across flicker, scroll, blank, garbled, NO_FLICKER searches)
- **Pre-NO_FLICKER (inline mode) era**: ~25 issues (April 2025 – March 2026)
- **Post-NO_FLICKER (fullscreen mode) era**: ~35+ issues (April 2026 onward, after v2.1.89)
- **Top issue upvotes**: #3648 (694 upvotes), #1913 (315 upvotes), #769 (293 upvotes)
- **Issue categories**: Inline flicker/redraw, fullscreen blank areas, scrollback destruction, CJK/Unicode corruption, scroll interaction breakage, VS Code crashes, terminal multiplexer issues, concurrent agent corruption

## Timeline

| Date          | Event                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-04-08    | **#769 filed** — original flicker bug, inline full-buffer redraws during status updates                                                                                                           |
| 2025-05-08    | bcherny (Anthropic) comments "This should be feeling better in newer versions"                                                                                                                    |
| 2025-07-16    | **#3648 filed** — terminal scrolling uncontrollably in VS Code/Cursor (now 694 upvotes)                                                                                                           |
| 2025-10-20    | **#9935 filed** — measured 4,000–6,700 scroll events/second in tmux                                                                                                                               |
| 2025-11-25    | **#10794 filed** — VS Code crashes from flicker (43 upvotes)                                                                                                                                      |
| 2025-12-17    | **chrislloyd posts detailed rendering rewrite announcement** on #769 — cell-based diffing, double buffering, damage tracking, DEC 2026 sync. Enabled for 10% of users, targeting v2.0.72 default. |
| 2025-12-17    | **#3648 closed** (state_reason: completed)                                                                                                                                                        |
| 2025-12-19    | **#14632 filed/closed** — blank areas on Windows (closed as duplicate)                                                                                                                            |
| Late Dec 2025 | **chrislloyd rolls back the rendering rewrite** due to typing latency reports. "Won't re-land until after the new year."                                                                          |
| 2025-12-31    | Community analysis: Gemini CLI (Jacob's Ink fork) uses append-only rendering + alternate buffer; Claude Code (bcherny's Ink fork) uses DEC atomic updates                                         |
| ~2026-01-13   | VS Code 1.108 adds synchronized output support; some users report improvement                                                                                                                     |
| 2026-03-13    | F1LT3R user reports flickering in tmux is "making me feel very nauseous"                                                                                                                          |
| 2026-03-31    | **F1LT3R discovers `CLAUDE_CODE_NO_FLICKER` env var** in leaked source code — was set for Anthropic employees only                                                                                |
| 2026-04-01    | **v2.1.89 ships with NO_FLICKER (alternate screen) enabled by default**                                                                                                                           |
| 2026-04-01    | Immediate wave of new issues: scrollback destroyed, CJK text broken, keybindings swallowed                                                                                                        |
| 2026-04-03    | **#42010 filed** — community reverse-engineering of Ink rendering corruption (DECSTBM scroll contamination, style cache collision, emoji edge bugs)                                               |
| 2026-04-03–05 | 30+ new issues filed about NO_FLICKER problems (scrollback loss, rendering artifacts, broken input, multiplexer conflicts)                                                                        |

## Pre-NO_FLICKER Issues (inline mode, pre-v2.1.89)

| #     | Title                                        | Date       | Upvotes | Symptoms                                                      | Environment                             |
| ----- | -------------------------------------------- | ---------- | ------- | ------------------------------------------------------------- | --------------------------------------- |
| 769   | In-progress call causes screen flickering    | 2025-04-08 | 293     | Full buffer redraws on spinner update, accessibility hazard   | Windows Terminal, Ubuntu, all terminals |
| 1913  | Terminal Flickering                          | 2025-04-20 | 315     | Extreme flicker during planning/code writing                  | Multiple platforms                      |
| 3648  | Terminal scrolling uncontrollably            | 2025-07-16 | 694     | Uncontrollable fast scrolling, can't type, must kill terminal | VS Code, Cursor (macOS)                 |
| 9935  | Excessive scroll events (4,000–6,700/sec)    | 2025-10-20 | 49      | 423K scroll events in 106s, 189KB/s ANSI overhead, UI jitter  | tmux/smux (Linux)                       |
| 10794 | VS Code crashes from flickering              | 2025-11-25 | 43      | Complete VS Code crash after 10-20 min, all unsaved work lost | VS Code (macOS, Apple Silicon)          |
| 12335 | Flickering in the CLI                        | 2025-12-01 | 3       | Extreme flicker during planning, unreadable                   | Windows                                 |
| 14632 | Large blank areas where text should display  | 2025-12-19 | 7       | Large blank areas in rendered output                          | PyCharm (Windows)                       |
| 30842 | Status line flickers when pasting text       | 2026-02-14 | 0       | Status line flicker on paste                                  | macOS                                   |
| 33814 | Forces scroll to top when outputting code    | 2026-03-07 | dup     | Scroll-to-top during code output                              | macOS                                   |
| 34242 | CLI crazy scrolling                          | 2026-03-10 | dup     | Uncontrolled scrolling                                        | VS Code (macOS)                         |
| 34298 | Full screen redraw on Tailscale SSH          | 2026-03-10 | 0       | Full redraw on interaction over SSH                           | macOS                                   |
| 34587 | Blank line gaps after resize                 | 2026-03-12 | 0       | Blank gaps in diff/edit blocks after resize                   | macOS                                   |
| 37283 | TUI flickers in tmux (missing DECSET 2026)   | 2026-03-22 | 0       | Cursor jumps, visible repositioning during render             | tmux on WSL2                            |
| 39294 | TUI rendering artifacts remain after /exit   | 2026-03-26 | 3       | Artifacts left in terminal after exit                         | Linux                                   |
| 39312 | Startup welcome box flickers then disappears | 2026-03-26 | 0       | Welcome box flashes and vanishes                              | iTerm2, Apple Terminal                  |

## Post-NO_FLICKER Issues (fullscreen mode, v2.1.89+)

### Scrollback Destruction (the dominant category)

| #     | Title                                                               | Date       | Upvotes | Environment      |
| ----- | ------------------------------------------------------------------- | ---------- | ------- | ---------------- |
| 41965 | Flicker-free rendering destroys terminal scrollback                 | 2026-04-01 | 20      | iTerm2, xterm.js |
| 42002 | Scrollback not working in long sessions                             | 2026-04-01 | 8       | Multiple         |
| 42024 | Scrollback history lost (Ghostty)                                   | 2026-04-01 | 15      | Ghostty          |
| 42180 | Scrollback lost in tmux sessions                                    | 2026-04-01 | 7       | tmux             |
| 42340 | Scrollback wiped on redraw                                          | 2026-04-02 | 10      | macOS            |
| 42667 | Scrollback cleared at random                                        | 2026-04-02 | 0       | macOS            |
| 42670 | No way to access conversation history (alt screen kills scrollback) | 2026-04-03 | 9       | Apple Terminal   |
| 42761 | Scrollback lost on WSL2 + Windows Terminal                          | 2026-04-02 | 0       | WSL2             |
| 43418 | Alt-screen breaks scrollback on Ghostty                             | 2026-04-04 | 0       | Ghostty          |
| 43643 | Scrollback erased during long sessions                              | 2026-04-04 | 0       | macOS            |

### CJK / Unicode Corruption

| #     | Title                                 | Date       | Upvotes | Environment      |
| ----- | ------------------------------------- | ---------- | ------- | ---------------- |
| 42406 | NO_FLICKER garbles Japanese text      | 2026-04-04 | 0       | Windows          |
| 42482 | Korean text corrupted on copy         | 2026-04-05 | 0       | Windows          |
| 42703 | Duplicated output and garbled Unicode | 2026-04-04 | 0       | Windows          |
| 42899 | Korean text paste broken              | 2026-04-03 | 0       | Windows          |
| 42954 | Korean CJK text copy broken           | 2026-04-03 | 0       | Windows Terminal |

### Scroll / Mouse Interaction Breakage

| #     | Title                                             | Date       | Upvotes | Environment      |
| ----- | ------------------------------------------------- | ---------- | ------- | ---------------- |
| 42725 | Slow mouse scroll, no scrollbar                   | 2026-04-02 | 0       | Windows          |
| 42891 | Mouse click-to-position not working               | 2026-04-03 | 0       | Windows Terminal |
| 43209 | Click-and-drag scrolling broken on remote desktop | 2026-04-03 | 0       | Android remote   |
| 43373 | Mouse scrolling collapses input window            | 2026-04-04 | 0       | macOS            |
| 43767 | Text selection broken while scrolling in iTerm2   | 2026-04-05 | 0       | iTerm2 (macOS)   |

### Rendering Artifacts / Garbled Output

| #     | Title                                              | Date       | Upvotes | Environment            |
| ----- | -------------------------------------------------- | ---------- | ------- | ---------------------- |
| 42930 | Rendering artifacts with zellij                    | 2026-04-03 | 1       | Kitty + zellij (macOS) |
| 42987 | Terminal window size / rendering calculation bug   | 2026-04-03 | 0       | macOS                  |
| 43223 | Half-screen layout bug                             | 2026-04-04 | 0       | VS Code (Linux)        |
| 43340 | Status bar and response duplicate on scroll/resize | 2026-04-04 | 0       | macOS                  |
| 43571 | Rendering corruption with concurrent agents        | 2026-04-04 | 0       | macOS                  |
| 43838 | Intermittent dashed line glitch in tmux            | 2026-04-05 | 0       | macOS tmux             |

### Input / Keybinding Breakage

| #     | Title                                      | Date       | Upvotes | Environment      |
| ----- | ------------------------------------------ | ---------- | ------- | ---------------- |
| 42275 | Token count hidden from footer             | 2026-04-01 | 0       | macOS            |
| 42501 | Shift+Enter multiline ignored in Warp      | 2026-04-02 | 0       | Warp (macOS)     |
| 42594 | Text input not displayed after clearing    | 2026-04-02 | 0       | macOS            |
| 42710 | Status line disabled in IntelliJ terminal  | 2026-04-02 | 0       | IntelliJ (macOS) |
| 42821 | Ctrl+J swallowed in tmux                   | 2026-04-04 | 0       | tmux (Linux)     |
| 41539 | Pixelated mouse cursor                     | 2026-04-01 | 0       | macOS            |
| 42908 | Right-click context menu broken in Ghostty | 2026-04-03 | 0       | Ghostty          |

### Other

| #     | Title                                                 | Date       | Upvotes | Environment          |
| ----- | ----------------------------------------------------- | ---------- | ------- | -------------------- |
| 41745 | PowerShell regression: dirty exit with residual text  | 2026-04-02 | 0       | PowerShell (Windows) |
| 41862 | Exit message rendering garbled                        | 2026-04-01 | 0       | Multiple             |
| 42787 | CLI keeps clearing screen                             | 2026-04-02 | 0       | Cursor IDE (macOS)   |
| 43273 | No redraw after KVM switch resize                     | 2026-04-03 | 0       | macOS                |
| 42907 | No-flick mode occasionally fails to display responses | 2026-04-03 | 0       | macOS                |

## Key Technical Details (from public sources)

### chrislloyd's Rendering Rewrite Announcement (2025-12-17, #769)

The Anthropic team's own description of the problem and their approach:

**Root cause of inline flicker**: "When content scrolls into scrollback and we need to update it, scrollback is immutable so we have to re-render." Also: "We track what we think is on screen and where we think the cursor is... but many things can cause that to diverge from reality."

**Rewrite approach** (v2.0.72 era, later rolled back):

- Cell-based diffing (not line-based) — minimal escape sequences
- Double buffering — blit to offscreen buffer, diff against previous frame
- Damage tracking — track regions that need clearing when elements shrink/move
- Native CJK and emoji support with explicit spacer cells
- Pending wrap resolution with space-backspace
- DEC 2026 synchronized update sequences

**Why they initially rejected alternate screen**: "The tradeoff is the native terminal experience. With our current approach, you get Cmd+F search, text selection, and copy/paste that work exactly like the rest of your terminal. In alternate screen mode, we'd have to reimplement all of that."

**Rollback**: The rewrite was rolled back in late December 2025 due to typing latency reports.

### HN Comment by chrislloyd (item 46701013)

Described the pipeline as "a small game engine": React -> layout elements -> rasterize to 2d screen -> diff against previous screen -> generate ANSI sequences. Target: ~16ms frame budget with ~5ms for React-to-ANSI conversion. Later moved to "packed TypedArrays" for the screen buffer to reduce GC pressure.

### Community Reverse-Engineering (#42010, 2026-04-03)

fruitriin analyzed the v2.1.88 rendering internals (96 source modules) and identified:

1. **DECSTBM scroll contamination** (most likely cause): The scroll optimization mutates the previous frame buffer in-place by shifting rows. The mutated screen moves to the back buffer position and is reused as the write target for the next render. Contamination accumulates during streaming (10-50 SSE events/sec). Resize is the only code path that replaces both frame buffers with fresh screens.

2. **Style transition cache key collision** (latent bug): Style pool's transition cache uses packed numeric keys. When unique styles exceed ~524K, keys overflow and different style pairs collide. The style pool is never reset during a session.

3. **Multi-codepoint emoji viewport edge miscalculation**: Flag emoji/ZWJ sequences use a stricter boundary check than CJK, causing valid cells at viewport edge to be skipped.

4. **Style segment desync in wrapped text**: Whitespace-skipping heuristic for character index synchronization after wrapping has edge cases.

5. **Character cache cliff-edge eviction**: Full cache clear at ~16K entries causes CPU spike and frame timing disruption.

### F1LT3R's Discovery (2026-03-31)

Discovered `CLAUDE_CODE_NO_FLICKER` env var in leaked source code. Was being used internally by Anthropic employees. This was made public approximately 1 day before v2.1.89 shipped it as default.

## What's Been Fixed (confirmed)

1. **v2.0.72 rendering rewrite (Dec 2025)**: Shipped briefly, reduced offscreen flickers by 85% per chrislloyd. Rolled back due to typing latency.
2. **#3648 closed** (Dec 2025): Terminal scrolling uncontrollably — marked as completed.
3. **DEC 2026 synchronized output**: Claude Code emits these sequences; terminals that support them (Ghostty, iTerm2, Windows Terminal preview) see reduced tearing.
4. **v2.1.89 NO_FLICKER mode**: Moved to alternate screen buffer, eliminating inline flicker. But introduced a new class of problems.
5. **v2.1.92 partial fix**: Changelog mentions "Fixed an issue where the same message could appear at two positions when scrolling up in fullscreen mode" — user reports it reduced duplication from 2x to 3x (not fully fixed).

## What's Still Open

As of 2026-04-05:

1. **Scrollback destruction** — the dominant post-NO_FLICKER complaint. 10+ open issues. No env var to opt out of alternate screen. `CLAUDE_CODE_NO_FLICKER=0` restores inline mode but re-enables flicker.
2. **CJK/Unicode corruption** — 5+ open issues, all on Windows.
3. **Rendering artifacts in multiplexers** — zellij, tmux both affected.
4. **Mouse/scroll interaction breakage** — 5+ open issues across platforms.
5. **Concurrent agent corruption** — #43571, byte-level interleaving on shared TTY.
6. **Original flicker (#769)** — still open with 293 upvotes and 303 comments. The inline renderer was never fully fixed; users were moved to fullscreen instead.

The core architectural tension remains: inline mode has flicker (can't mutate scrollback), fullscreen mode loses scrollback and introduces its own rendering bugs.

## Blog Article Fact-Check

Reference: `vendor/silvery/docs/blog/claude-code-rendering-dilemma.md`

### Claim: "12+ open GitHub issues"

**Source**: The blog links to #42670, which itself lists "12+ open issues about the same root cause" (scrollback destruction specifically). The broader rendering issue space has 60+ issues across all categories. The claim is specifically about scrollback-related issues and is accurate — #42670's body lists 12 specific issue numbers, all confirmed open.
**Verdict**: ACCURATE for the narrow scrollback claim. Could be MORE if counting all rendering issues.

### Claim: "700+ upvote"

**Actual data**: #3648 has 694 upvotes (thumbs-up reactions). #769 has 293. #1913 has 315.
**Verdict**: SLIGHTLY INACCURATE — the highest single issue is 694, not 700+. The blog likely refers to #3648. Could say "nearly 700 upvotes" or "694 upvotes." Alternatively, #3648's total reactions (all types) = 837, so "700+ reactions" would be accurate but "700+ upvote" is not. Suggest changing to "694-upvote" or "nearly 700-upvote".

### Claim: "4,000–6,700 scroll events per second"

**Source**: Issue #9935, titled "Excessive scroll events causing UI jitter in terminal multiplexers (4,000-6,700 scrolls/second)." The issue contains detailed instrumentation data: 423,575 scroll events in 106 seconds = 4,002-6,764 scrolls/second, 94.7% in sub-millisecond bursts.
**Blog attribution**: The blog attributes this to a HN thread (item 46699072). The HN thread fetch did not surface this specific number. The data originates from GitHub issue #9935. The blog's HN link may be wrong, or the HN thread may reference #9935.
**Verdict**: NUMBERS ARE ACCURATE. SOURCE ATTRIBUTION may need correction — the primary source is GitHub #9935, not the HN thread. Verify whether the HN thread links to #9935 or independently reports these numbers.

### Claim: "crash VS Code"

**Source**: Issue #10794 titled "Critical: Terminal Flickering Causes Complete VSCode Crashes on macOS." Reports "Complete VSCode crashes after 10-20 minutes of use" and "Loss of all unsaved work." Has 43 upvotes and 24 comments.
**Verdict**: ACCURATE — this is a real, confirmed report with multiple users corroborating.

### Claim: Community analysis at #42010

**Actual content**: #42010 by fruitriin is a detailed reverse-engineering analysis of v2.1.88's rendering internals (~96 source modules). It identifies 5 specific bugs: DECSTBM scroll buffer contamination (primary), style cache key collision (latent), emoji viewport edge miscalculation, style segment desync in wrapped text, and character cache cliff-edge eviction. It includes methodology (3-axis investigation), reproduction data, and proposed fixes.
**Blog description**: "contributors proposed several plausible failure modes: previous-frame corruption during scroll region optimization, a style-cache edge case, and missing full-repaint recovery after terminal state disturbances"
**Verdict**: MOSTLY ACCURATE. The blog correctly identifies the DECSTBM scroll corruption and style cache issues. The "missing full-repaint recovery" is the blog's framing of the resize-as-only-reset finding. The blog omits the emoji edge bug, wrapped text desync, and cache eviction spike findings, which is fine for brevity. One note: #42010 has 0 upvotes and 1 comment, so "community analysis" might overstate engagement — it's a single skilled contributor's analysis.

### Claim: NO_FLICKER mode shipping date

**Evidence**: v2.1.89 is the version that enabled alternate screen / NO_FLICKER by default. Based on issue filing dates, this shipped around 2026-04-01 (issues #41965, #42002, #42024 all filed April 1-2). The `CLAUDE_CODE_NO_FLICKER` env var was discovered in leaked source on 2026-03-31 (F1LT3R's comment on #769). bcherny's X post (referenced in the blog as `x.com/bcherny/status/2039421575422980329`) would be the official announcement.
**Verdict**: Consistent with ~April 1, 2026. The blog is dated 2026-04-04, so this is current.

### Claim about chrislloyd's HN description: "differential renderer with TypedArray double-buffering"

**Source**: HN item 46701013 — chrislloyd described converting "the screen buffer to packed TypedArrays" and the pipeline as a "small game engine" with React -> layout -> rasterize -> diff -> ANSI output.
**Verdict**: ACCURATE characterization. "TypedArray double-buffering" is a fair summary of the packed TypedArrays + front/back buffer approach.

### Additional note for blog accuracy

The blog states: "Claude Code has spent months rewriting its renderer." chrislloyd's Dec 2025 comment confirms "we've been working on it for months" and "we've rewritten our rendering system from scratch." The rewrite was then rolled back, and a different approach (alternate screen) was shipped in April 2026. So Claude Code has been through at least two major rendering approaches: (1) cell-based inline diff renderer (Dec 2025, rolled back), (2) alternate screen fullscreen mode (April 2026, current). The blog's characterization is accurate.

## Issue Category Summary

### 1. Inline flicker / redraw (pre-NO_FLICKER)

The original and longest-running category. Full-buffer redraws on every status update. Scrollback immutability forces clear+reprint. #769 (293 upvotes), #3648 (694 upvotes), #1913 (315 upvotes). Combined 1,300+ upvotes across top 3 issues.

### 2. Fullscreen blank areas / stale content

Post-NO_FLICKER: content regions show blank areas, stale content persists. Tied to DECSTBM scroll buffer contamination per #42010 analysis. #42907, #42598, #43223.

### 3. Scrollback destruction

The dominant post-NO_FLICKER complaint. Alternate screen buffer kills native scrollback. 15+ open issues. Users can't scroll up, Cmd+F doesn't work, tmux copy mode broken. #42670 catalogs 12 related issues.

### 4. Scroll / multiplexer interaction

Mouse scroll captured incorrectly, scroll position jumps, scrollbar behavior broken. Affects tmux, zellij, remote desktop. #42725, #43209, #43373, #43767.

### 5. VS Code / IDE specific

VS Code crashes from rendering load. IntelliJ status line disabled. Cursor IDE screen clearing. #10794, #42710, #42787.

### 6. CJK / Unicode corruption

Japanese/Korean text garbled, copy broken, paste broken. All on Windows. 5+ issues. #42406, #42482, #42703, #42899, #42954.

### 7. Concurrent agent corruption

Multiple agents writing to same TTY causes byte-level interleaving. #43571.

### 8. Input / keybinding swallowed

NO_FLICKER mode consuming or breaking keybindings. Ctrl+J in tmux, Shift+Enter in Warp, right-click in Ghostty. #42821, #42501, #42908.
