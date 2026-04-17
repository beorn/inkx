---
title: "Claude Code's Rendering Dilemma"
description: "Why Claude Code flickers, why NO_FLICKER mode loses scrollback, and how a different rendering architecture solves both."
date: 2026-04-02
---

> **⚠️ DRAFT — NEEDS FACT-CHECK BEFORE PUBLISHING**
>
> GPT-5.4 Pro review (2026-04-09) identified overclaims in the original "three axes of atomicity" framing. Key corrections applied:
>
> - ~~"Ink doesn't use synchronized output"~~ → Ink 7 DOES use DEC 2026
> - ~~"React fiber yields between Yoga and commit"~~ → Ink's commit IS synchronous
> - ~~"Ink renders at width:0 for all components"~~ → only for measurement-dependent components (useBoxMetrics)
> - Claude Code's missing-component issue is likely their custom incremental renderer, not Ink's pipeline
>
> What IS defensible: layout-first (useBoxRect vs useBoxMetrics two-pass) + direct-to-buffer rendering (no string→cell reconstruction).
>
> See bead `km-silvery.positioning` for full analysis. Pro review output at `/tmp/pro-blog-review-v2.md`.

# Claude Code's Rendering Dilemma

Claude Code just [shipped NO_FLICKER mode](https://x.com/bcherny/status/2039421575422980329) — an experimental renderer that switches to the alternate screen buffer to eliminate terminal flickering. It's the latest move in a long engineering effort:

- The terminal [flickers while responses stream](https://github.com/anthropics/claude-code/issues/1913) — screen flashes, scroll position jumps
- In tmux, streaming generates [4,000-6,700 scroll events per second](https://github.com/anthropics/claude-code/issues/9935)
- In VS Code, the flickering was [bad enough to crash the editor](https://github.com/anthropics/claude-code/issues/10794)
- They [rewrote the renderer from scratch](https://x.com/trq212/status/2001439019713073626), reducing flicker by 85% — but [~1/3 of sessions still flickered](https://news.ycombinator.com/item?id=46701013)
- NO_FLICKER largely sidesteps this by switching to the alternate screen — but now [Cmd+F, text selection, and scrollback don't work natively](https://code.claude.com/docs/en/fullscreen)

I'm not picking on Claude Code here. I'm using it as the example because Anthropic has shared more about this renderer tradeoff in public than almost anyone else. The underlying problem isn't unique to them — any terminal app that wants rich interactivity, native scrollback, and stable streaming updates runs into some version of the same constraint.

## How terminals actually work

A terminal has two screen buffers, and understanding them is key to the problem:

<!-- VISUAL: Side-by-side terminal anatomy diagram:

LEFT: "Main buffer (inline mode)"
┌─────────────────────────┐
│ $ git status            │ ← scrollback (history)
│ On branch main          │   - Cmd+F searches this
│ $ bun test              │   - text selection works
│ 42 tests passed         │   - persists after app exits
│─────────────────────────│
│ > Current prompt         │ ← visible screen
│ [streaming response...]  │   - app can redraw this
│ [status bar]             │   - BUT: can't update scrollback
└─────────────────────────┘     without clearing & reprinting

RIGHT: "Alternate buffer (fullscreen mode)"
┌─────────────────────────┐
│                          │ ← no scrollback at all
│  ┌─ Conversation ──────┐│   - Cmd+F doesn't work
│  │ User: fix the bug   ││   - no terminal history
│  │ Claude: Looking...   ││   - vanishes on exit
│  │ [streaming...]       ││
│  └──────────────────────┘│
│  > input prompt          │ ← full screen control
│  [status bar]            │   - cell-level updates
└─────────────────────────┘   - no repainting needed
-->

**Main buffer** has scrollback — output accumulates, Cmd+F searches it, text selection works across history, content persists after the app exits.

**Alternate buffer** is a blank canvas the app takes over, like vim. Full cell-level control, no repainting needed for updates. But there's no scrollback — when the app exits, everything vanishes.

## Walk through the problem

Let's say you're building an AI agent TUI. You choose the main buffer because you want scrollback — users should be able to scroll up through past exchanges and Cmd+F to find things.

Your app renders an input prompt at the bottom and the current response above it. The first few exchanges work great. Content scrolls up naturally, just like `echo` output.

Then a response gets long. The AI is drafting a plan — 80 lines, taller than the terminal. The response is still streaming, so it's live content that changes every frame. But it's also taller than the screen, which means part of it has scrolled into the scrollback region above the visible viewport.

Now the AI sends the next token. You need to redraw the live content. But some of it is in scrollback. And here's the problem: **there's no terminal API to update a specific line in scrollback.** You can't say "replace line 47 in the scrollback with this new text." The only option is to clear your entire output region — everything your app has drawn, including what's scrolled up — and reprint it from scratch.

Every token, you clear and reprint. That's the flicker.

It gets worse. If your app has 50 completed exchanges above the live one, you're reprinting all of them too — not because they changed, but because the clear operation is all-or-nothing for your output region. The more history, the more data you're pushing to the terminal on every update. In tmux, this generates [4,000-6,700 scroll events per second](https://github.com/anthropics/claude-code/issues/9935). In VS Code's terminal, it's [enough to crash the editor](https://github.com/anthropics/claude-code/issues/10794).

And there's one more problem that makes inline rendering almost unusable: **most terminals auto-scroll to the bottom on any output.** If the user scrolls up to re-read an earlier exchange while the AI is still streaming, the next token write yanks them back to the bottom. Scroll up, get yanked back. Scroll up again, yanked back again. The terminal is working as designed — new output means "you probably want to see this" — but for a streaming app it means the user can't review history while content is being produced. This alone drives users to demand fullscreen mode, even if they'd prefer scrollback.

This is why teams eventually give up and switch to the alternate buffer. It's not that they don't want scrollback. It's that live, mutable UI and native scrollback don't coexist well in the same buffer.

## The dilemma

So you have two options, and both are bad:

- **Stay inline, accept flickering.** You keep scrollback, but every update clears and redraws.
- **Switch to alternate screen, lose scrollback.** No flickering, but Cmd+F, text selection, and terminal history are gone. You have to reimplement all of them inside your app.

## What Claude Code had to reimplement

When they moved to alternate screen (NO_FLICKER), they lost everything the terminal provides for free and had to [rebuild it inside the app](https://code.claude.com/docs/en/fullscreen):

- **Search**: `Ctrl+o` then `/` instead of Cmd+F
- **Text selection**: custom click-and-drag handler
- **Scrolling**: PgUp/PgDn/Ctrl+Home/End, mouse wheel capture
- **Clipboard**: OSC 52 fallbacks for SSH, tmux paste buffer
- **URL opening**: custom click handler (special-cased for VS Code)
- **View history**: `Ctrl+o` → transcript mode with less-style navigation
- **Get scrollback back**: `Ctrl+o` → `[` dumps conversation to native scrollback temporarily

That `Ctrl+o` → `[` escape hatch — dumping the conversation back to native scrollback — shows the team knows users want scrollback. They just can't provide it directly in fullscreen mode.

## Why incremental inline rendering is hard

The core issue: terminals have no API to update a single character mid-scrollback. Ink prints strings; the terminal interprets them. Once a line scrolls up into history, it's beyond the app's reach.

Ink's solution: accept this and reprint everything (flicker + jank). Claude Code's solution: switch to alternate screen (no scrollback + losing Cmd+F). Both are valid, but both leave something on the table.

The third option — incremental scrollback + streaming content — requires **architectural changes below the component level.** This is why it's hard, and why Claude Code's 6-month retrofit produced visible regressions (#41965).

## How Silvery approaches this differently

Silvery has this architecture ready from day 1. It rests on a four-step dependency chain:

### The four-step chain

**Step 1: Cell-level buffer.** Instead of building strings, Silvery maintains a 2D grid where each cell tracks: character, foreground color, background color, attributes (bold, underline, etc.), and wide-character flags. This is the same model a terminal emulator uses internally — it gives us parity with terminal capabilities.

**Step 2: Layout-first rendering.** This is the most important architectural difference.

Ink's measurement APIs — `measureElement()` and `useBoxMetrics()` — are post-layout. They return `{width: 0, height: 0}` during render and only provide real values after the first layout pass completes, updated via `useEffect`. Components that need their dimensions to decide what to render (truncating text, choosing a compact layout, fitting columns) must render twice: once with zeros, then again with real values. Each render produces a separate frame to the terminal.

This matters most during scroll, when the virtualization window changes. Newly visible components enter the viewport, each going through the two-pass cycle. The first frame for each has wrong dimensions. Under rapid scrolling, many components cycle through this simultaneously, producing visible layout shift.

Silvery inverts the order: [Flexily](https://beorn.codes/flexily) (pure TypeScript flexbox) computes the full layout tree **before** React renders anything. When a component calls `useBoxRect()`, it gets final dimensions on the first pass. One render, one frame, correct layout. No second pass needed.

```tsx
// Ink: useBoxMetrics returns 0×0 on first render, updates via effect
function Card() {
  const ref = useRef(null)
  const { width, hasMeasured } = useBoxMetrics(ref)
  if (!hasMeasured)
    return (
      <Box ref={ref}>
        <Text>Loading...</Text>
      </Box>
    )
  return (
    <Box ref={ref}>
      <Text>{truncate(title, width)}</Text>
    </Box>
  )
}

// Silvery: useBoxRect returns actual dimensions immediately
function Card() {
  const { width } = useBoxRect()
  return <Text>{truncate(title, width)}</Text>
}
```

### Why Claude Code's NO_FLICKER mode still has rendering issues

Claude Code's v2.1.89 introduced inline scrollback support alongside the alt-screen NO_FLICKER mode. Users report components appearing and disappearing during scroll, and blank cells in the middle of conversations (#41965, 1000+ upvotes).

The two-pass measurement issue above is one factor — any measurement-dependent component briefly renders with wrong dimensions. But the more likely culprit for **components being completely missing** is Claude Code's custom incremental rendering system.

Claude Code forked Ink and built a cell-level buffer + diff engine on top. The pipeline is roughly: React renders → Ink generates string output → custom layer reconstructs a cell buffer from those strings → diffs new buffer vs previous → emits only changed cells.

That reconstruction step is where things can go wrong under scroll. When the viewport shifts, every cell changes position. The diff compares the new buffer against the previous one, but if the reconstruction or position mapping is even slightly off — an off-by-one in the scrolled region, a stale reference after a resize, a mismatch between what Ink rendered and what the buffer parser sees — the diff concludes "these cells haven't changed" and doesn't emit them. The component is there in React's tree, but it never reaches the terminal.

This is a hard class of bugs to fix because the diff and the renderer are separate systems with separate models of what's on screen. Any disagreement between them produces missing or duplicated content.

### How Silvery avoids this

Silvery renders **directly to the cell buffer** — there's no string intermediate, no reconstruction step, no second model of what's on screen. The pipeline is:

1. Flexily computes layout (all positions and dimensions).
2. React renders. Components write cells directly to the buffer via the content render phase. `useBoxRect()` returns real dimensions on first pass.
3. Output phase diffs new buffer vs previous buffer at cell granularity.
4. Emit only changed cells, wrapped in DEC mode 2026 (synchronized output).

The buffer IS the render output. The diff compares the actual render output, not a reconstruction. There is no gap between "what was rendered" and "what the diff sees" — they are the same data structure. This eliminates the class of bugs where the diff and the renderer disagree about what's on screen.

**Step 3: Cell-level diff.** After render, Silvery compares the new buffer against the previous one at **cell granularity**. Not line-by-line (Ink via log-update). Not global clear-and-redraw. Just the cells that actually changed.

**Step 4: Relative cursor addressing.** Instead of reprinting changed lines in full, Silvery uses raw ANSI cursor positioning (CSI NA/NB/CR/NC) to move the cursor and emit only the modified cells. Result: 28-192x less output vs full redraw when updating inline scrollback.

### Why Claude Code needed 6 months to retrofit this

The team recognized these same architectural gaps in October 2025, forked Ink, and built a cell-level buffer + diff engine. By March 2026, they shipped NO_FLICKER mode using the alternate screen (which avoids the scrollback problem entirely). By April 2026, they tried to keep inline scrollback in v2.1.89 — and hit regressions (#41965, 1000+ upvotes): screen fills with blanks, flicker persists despite the new architecture. The 6-month timeline and visible regressions validate that this architecture is **non-trivial to retrofit** into a string-based framework.

Silvery's advantage: this pipeline existed from the start. No fork. No visible regressions. The architecture is orthogonal to component design — upgrades to the rendering engine don't break existing code.

### The user experience

Inline mode with dynamic scrollback:

```tsx
render(<App />, term, { mode: "inline" }) // scrollback mode
```

Split into two zones: a small live region at the bottom (React components, incremental rendering), and completed content that graduates into native scrollback (terminal-owned, Cmd+F works natively).

- **No flicker:** Layout runs first, one render pass, only changed cells emit
- **Scrollback works:** Completed exchanges graduate to terminal history, searchable via Cmd+F
- **Memory efficient:** Graduated items leave the React tree, GC pressure stays low
- **Two modes, one switch:** Use inline for chat/REPL, fullscreen for dashboards

```tsx
<ScrollbackList items={items} isFrozen={(item) => item.done}>
  {(item) => <Text>{item.text}</Text>}
</ScrollbackList>
```

`isFrozen` marks items for graduation. Automatic, zero overhead.

## How the approaches compare

|                               | Ink 7.0                        | NO_FLICKER (Claude Code)                  | Ratatui (Rust)                   | Silvery                              |
| ----------------------------- | ------------------------------ | ----------------------------------------- | -------------------------------- | ------------------------------------ |
| **Mode**                      | Inline (main buffer)           | Fullscreen (alt buffer)                   | Both (`Viewport::Inline` or alt) | Both (one-line switch)               |
| **Scrollback quality**        | Native, but trashed by redraws | None; reimplemented in-app                | Native in inline mode            | Native (graduated content)           |
| **Output efficiency**         | Line-level; full redraw        | Cell-level; v2.1.89 flickering            | Cell-level                       | Cell-level; 28-192x less output      |
| **Diffing strategy**          | log-update (line-level)        | Cell-level buffer                         | Cell-level                       | Cell-level buffer + incremental      |
| **Layout timing**             | Render → layout (Yoga)         | Render → layout (Yoga)                    | Immediate (no components)        | Layout → render                      |
| **Dimensions during render?** | Post-layout via useEffect      | Post-layout via useEffect                 | N/A (no components)              | Yes (`useBoxRect()` first pass)      |
| **Memory in long sessions**   | Grows (full tree)              | Flat (visible only)                       | Flat (rebuilt/frame)             | Flat (graduated = strings)           |
| **Layout engine**             | Yoga (WASM, ~45KB gzipped)     | Yoga (WASM, ~45KB)                        | Manual (Rust)                    | Flexily (pure TS, ~2KB)              |
| **Total gzipped size**        | ~116.6 KB (Ink + Yoga)         | Same as Ink                               | Compiled binary (N/A)            | ~114.9 KB (runtime; parity)          |
| **Cmd+F in inline**           | Native (but flickers)          | Alt-screen only; reimpl Cmd+O             | Native                           | Native (graduated content)           |
| **Text selection native**     | Yes (flickers)                 | Alt-screen only; reimpl                   | Yes                              | Yes (graduated content)              |
| **GC pressure**               | High (full tree)               | Medium (visible + alt)                    | None (Rust)                      | Low (small live tree)                |
| **Rendering stability**       | ~1/3 of sessions still flicker | v2.1.89 has missing-component regressions | N/A                              | Direct-to-buffer (no reconstruction) |

<!-- VISUAL: VHS recording (.tape) of ScrollbackList in action — items streaming, completing, graduating to scrollback, user scrolling back through history -->

## Honest caveats

Silvery faces the same terminal constraints — you can't incrementally update scrollback once it scrolls up. The architecture mitigates this by segregating concerns:

- **Live zone** (bottom): incremental renders, no redraws
- **Scrollback zone** (top): terminal-owned, re-emitted only on structural changes (resize, graduation)

This means:

- **Frequent updates** (99% of user interactions): no flicker. Incremental output, local cursor positioning.
- **Infrequent updates** (resize, new items): brief pause while scrollback re-emits. Cost is O(completed items), not O(all items + live).

On large sessions (1000+ graduated exchanges), resize will pause briefly. This is the tradeoff — you get scrollback + incremental rendering; the cost is occasional O(n) work on resize. Without graduated scrollback, every keystroke pays that cost.

## The pattern

If you're building a terminal app that streams output — an AI agent, a test runner, a build tool — you'll hit this dilemma. The question is whether you:

1. Accept flickering (inline rendering, full redraw)
2. Give up scrollback (alternate screen, reimplement terminal features)
3. Use dynamic scrollback (inline + incremental + graduation)

This is the pattern I built into Silvery through `ScrollbackList` and `ScrollbackView`. The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.
