# Terminal Rendering Research — Deep Research Findings

Date: 2026-04-02
Source: GPT 5.4 Pro deep research ($4.79, 24K tokens)

## The Universal Pattern

Every framework that successfully combines inline rendering + native scrollback + smooth updates uses the same architecture:

```
immutable transcript above (native scrollback)
+
small mutable live region below (diffed redraws)
```

This isn't a Silvery invention — it's the "best available compromise" given terminal constraints. What differs across frameworks is how well they execute it.

## Framework Comparison

### Ratatui (Rust) — the closest architectural parallel

Ratatui has `Viewport::Inline(height)` — reserve a fixed-height live region at the bottom of the main buffer, with native scrollback above. Plus `insert_before()` to push content above the live viewport — the Rust equivalent of Silvery's content graduation.

**How Silvery compares:**

- Silvery's `ScrollbackList` with `isFrozen` is conceptually the same as Ratatui's inline viewport + `insert_before`
- Ratatui diffs at the cell level (curses-style front/back buffer)
- Silvery also diffs at the cell level (TerminalBuffer prev/next)
- Ratatui is immediate-mode (rebuild UI every frame from state), Silvery is retained-mode (React reconciliation)
- Both keep the live region small and the transcript immutable

**Takeaway:** We're aligned with the Rust ecosystem's best practice. The API shape (`isFrozen` + graduation) is arguably more ergonomic than manual `insert_before()` calls.

### Ink (Node/React) — what Claude Code started with

Ink has `<Static>` for content that won't be re-rendered. This is conceptually similar to graduation — static content becomes normal terminal output, live area below updates.

**Why it still flickers:**

- Ink's render pipeline: React render → Yoga layout → stringify → line diff
- The line diff is coarse-grained (whole lines, not cells)
- The Yoga layout step is render-then-measure (components render before knowing width)
- GC pressure from the large component tree causes frame drops

**Where Silvery differs from Ink:**

1. Cell-level diffing (not line-level)
2. Layout-first (components know width before rendering content)
3. Graduation removes items from the React tree entirely (not just Static)
4. Pure TypeScript layout (no Yoga WASM overhead)

### prompt_toolkit (Python) — mature inline rendering

One of the oldest correct implementations. Non-full-screen mode keeps normal scrollback, interactive widgets live near the bottom, renderer diffs screens.

**Takeaway:** The pattern has been proven in Python for years. Terminal developers expect this behavior.

### fzf --height — the simplest correct implementation

Uses a bounded bottom block in the primary screen, keeps shell scrollback intact. Feels smooth because it only updates its own region.

**Takeaway:** Even simple tools get this right when they limit what's mutable.

## How Ghostty Sees Scrollback (emulator perspective)

This is important for understanding WHY certain approaches fail.

**Scrollback is created when lines scroll off the top of the primary screen.** It happens on linefeed/newline when the cursor is at the bottom margin. The terminal scrolls the region up, and the top line moves into history.

**Scrollback is NOT created by cursor-up/rewrite-line.** If your framework does cursor-up → rewrite → cursor-up → rewrite to update visible content, the terminal sees escape sequences, not semantic updates. The scrollback gets garbage intermediate states — half-rendered lines, cursor artifacts.

**The terminal has no concept of your widget tree.** It only sees a stream of bytes. If you clear and reprint 500 lines every frame, the emulator processes every byte — even though 490 of those lines haven't changed.

**Implications for Silvery:**

- Graduated content should be emitted via natural line feeds (scroll-up) not cursor manipulation
- The live region should use cursor positioning for updates (the terminal handles this efficiently)
- Avoid clearing scrollback and reprinting — each byte costs emulator processing time

## Key Recommendation: Structural Diffing

The deep research identified this as the biggest optimization opportunity for Silvery.

### Current: Cell diffing

Silvery's diff compares prev buffer and next buffer cell-by-cell. Changed cells get ANSI sequences to update them. This is good — it's what Ratatui and terminui do.

### Better: Structural diffing (on top of cell diffing)

Detect higher-level changes:

- **Inserted lines** — emit Insert Line (`IL`) instead of rewriting everything below
- **Deleted lines** — emit Delete Line (`DL`) instead of rewriting everything below
- **Vertical shifts** — emit Scroll Up (`SU`) / Scroll Down (`SD`)
- **Scroll regions** — use DECSTBM to constrain which region scrolls

This reduces output dramatically. Instead of rewriting 50 cells when a line is inserted, you emit one `IL` sequence and the terminal shifts everything down.

**Example:**

```
User adds a new list item in the middle of a 20-item list.

Cell diff: rewrite 19 lines × 80 cols = 1520 cell updates
Structural diff: insert_line(pos) + write 1 line = ~80 bytes
```

### Where this matters most

- **ScrollbackList graduation** — when an item freezes, the live region shrinks by one item. Currently every line below shifts. With structural diffing, emit `DL` for the graduated item and `IL` at the bottom for the new live content.
- **Streaming** — when a streaming response adds a line and pushes the input prompt down, emit `IL` above the prompt instead of rewriting everything.
- **Resize** — structural operations can handle some resize cases without full repaint.

### Implementation notes

Ratatui doesn't do this (pure cell diff). This would be a Silvery advantage.

Terminals that support these operations: all modern ones (Ghostty, Kitty, iTerm2, WezTerm, Terminal.app). The sequences are VT220-era, universally supported.

The detection algorithm:

1. Compare new buffer height vs old buffer height
2. If lines were inserted/deleted, find the insertion/deletion point
3. Emit IL/DL operations
4. Then cell-diff the remaining changes

## Silvery's Architecture Mapped to the Research

```
Research pattern          → Silvery implementation
─────────────────────────────────────────────────
Immutable transcript      → ScrollbackList isFrozen graduation
Small mutable live region → Live screen (React components)
Cell-level diffing        → TerminalBuffer prev/next diff (output-phase.ts)
Synchronized output       → CSI ? 2026 h/l wrapping (already supported)
Layout before content     → Flexily layout → React render (layout-phase.ts)
No WASM                   → Flexily (pure TypeScript)
Scroll regions            → RULED OUT — DECSTBM discards lines scrolled out, breaks scrollback
Footer pinning            → Flex layout (not DECSTBM) — preserves scrollback integrity
Content capping           → Output phase caps at termRows to prevent scrollback corruption
Structural diffing        → NOT YET — biggest optimization opportunity
```

## Next Steps

### Must do (for the blog article to be credible)

1. **Fix inline mode bugs** (km-silvery.inline-bugs) — the demo can't look broken
2. **Wire selection → clipboard** (km-silvery.selection-clipboard) — readers will try copy-on-select
3. **Build the AI agent demo** (km-silvery.trilemma-example) — both modes, one app

### Should do (competitive advantage)

4. **Structural diffing** — detect IL/DL opportunities in the output phase. This would make Silvery measurably faster than Ratatui for common operations.

~~5. Scroll region optimization~~ — **RULED OUT.** DECSTBM discards lines scrolled out of the region — they never enter terminal scrollback. This was investigated across 5+ sessions and definitively rejected. Silvery uses flex layout for footer pinning and caps output at termRows to preserve scrollback integrity.

### Nice to have

6. **Benchmark against Ratatui** — cell diff bytes vs structural diff bytes for common operations. Data for a future blog post.
7. **Verify with Ghostty/terminfo.dev** — confirm IL/DL/SU/SD support across terminals
