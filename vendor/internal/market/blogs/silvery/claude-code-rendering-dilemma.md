---
title: "Claude Code's Rendering Dilemma"
description: "Why Claude Code flickers, why NO_FLICKER mode loses scrollback, and how a different rendering architecture solves both."
date: 2026-04-02
---

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

**Step 2: Atomic layout-first pipeline.** This is the fundamental architectural split — and the single most important one in this entire post.

The core property Silvery has and Ink doesn't is **frame atomicity**: a frame is either fully committed or not at all. There are no intermediate states between "old frame" and "new frame" that a user, a terminal, or a scroll event can observe.

Ink's pipeline is non-atomic at three levels simultaneously:

**1. Non-atomic in time.** React's fiber reconciler can interrupt and resume work across multiple microtasks. Between "start rendering this tree" and "finish rendering this tree," other work can run. Output can paint. Input can arrive. State can mutate. When the resume finally happens, the world has moved on — the tree you're committing no longer matches the state it was reading from.

**2. Non-atomic in space.** Render-first, layout-second means a parent computes its render output (at `width: 0`), passes props to children, children render, layout runs, parent re-renders with real width, children re-render — but these re-renders propagate one level at a time. At any given moment, some parts of the tree are at "pre-layout state" and others are at "post-layout state." A scroll container's header can show the new layout while its body still shows the old. A list's container can be the new width while its items are still at the old width.

**3. Non-atomic in content.** Output emission streams cells to the terminal without wrapping in a synchronized-output barrier. The terminal can paint mid-emission, showing half the new frame over the other half of the old frame. In inline mode this is flicker; in alt-screen mode it's stuttering, tearing, and blank cells that appear for one frame then vanish.

The render-first/layout-second dance is just **one visible symptom** of non-atomic space:

1. React renders component at `width: 0` — content collapses
2. Yoga measures
3. React re-renders with real width — content appears
4. Paint

If paint catches step 3 before its re-render completes, you see step 1's broken state. But even if you "fix" this one dance, non-atomicity in time and content will still leak. A pipeline that isn't atomic in all three dimensions will always have observable intermediate states.

This is why Claude Code's alt-screen NO_FLICKER mode still stutters. Alt-screen fixes the inline clear-and-redraw flicker, but it doesn't make rendering atomic. Components still flash in and out on scroll, half-update across frames, and reveal/hide inconsistently — because the underlying pipeline still violates all three atomicity dimensions. **This cannot be fixed with a renderer rewrite. It requires changing how the whole pipeline commits work.**

Silvery's pipeline is atomic in all three dimensions:

**Atomic in time:** `layout → render → diff → output` is a single synchronous transaction per frame. React's concurrent mode cannot interrupt it. When a frame starts committing, it completes committing before any other work runs.

**Atomic in space:** [Flexily](https://beorn.codes/flexily) computes the full layout tree before React renders anything. When a component renders, `useBoxRect()` returns the same layout values for every component in the tree, sampled at the same moment. No part of the tree is ever at a different layout state than another part. Children always see consistent parent dimensions because the layout was computed once, up front, for the whole tree.

**Atomic in content:** Every frame emission is wrapped in DEC mode 2026 (synchronized output bracketing). The terminal either sees the full new frame or the full old frame — never a half-drawn mixture. Cell-level diffing + relative cursor addressing means the emission is small enough to fit inside a single sync barrier without tearing.

The consequence: **no symptom class that stems from non-atomic rendering can occur in Silvery.** Not flicker during streaming. Not component dropout on scroll. Not stuttering in alt-screen. Not half-updated trees. Not tearing. These are not bugs Silvery needs to fix — they are bugs Silvery's architecture makes impossible to experience.

This is why Claude Code's team, despite six months of work and real engineering talent, keeps shipping regressions like #41965. They are fighting a non-atomic pipeline inside the alt-screen — the renderer got better, but the commit model is still non-atomic, and non-atomic commit models always find new ways to leak intermediate state.

### A concrete example: scrolling while streaming

Let's walk through a specific scenario that exposes all three atomicity failures in a single user interaction. This is the kind of thing you see constantly in Claude Code and never see in Silvery.

**Scenario:** You're chatting with an AI agent. Your terminal is 40 lines tall. The conversation has 200 completed messages; you're scrolled 60 lines up from the bottom to re-read an earlier exchange. Meanwhile, the AI is streaming a new response — a 30-line code block — at the bottom. You gently scroll up by one more line with the mouse wheel to see one more word of the earlier message.

**What happens in a non-atomic pipeline (Ink / Claude Code):**

1. Scroll event arrives. Viewport offset changes by 1 line. React gets notified.
2. Scroll container component re-renders with new offset. Its child list needs to compute which children are now visible.
3. The list's memoized child window shifts by 1. One new child enters the top of the viewport; one leaves the bottom. The entering child hasn't been rendered yet — it was in the virtualization skip zone.
4. React fiber starts rendering the entering child. First pass: `width: 0` because Yoga hasn't run yet for the new child's subtree.
5. Fiber yields control. Meanwhile, the streaming token from the AI arrives — another state update. React schedules a second render.
6. Terminal paints. What's on screen right now?
   - Scroll container is at the **new** offset (from step 1)
   - The entering child is at **width: 0** (from step 4) — it's a blank gap
   - The streaming code block is at its **old** content (the new token hasn't rendered yet)
   - The leaving child is still visible because it hasn't been unmounted yet
7. Fiber resumes. Re-renders the entering child with real width. Re-renders the streaming block with the new token. Layout runs. Commit.
8. Terminal paints. Now everything is correct.

**Between steps 6 and 8, the user sees a broken frame:** a blank gap where the entering child should be, the streaming code block frozen one token behind, and an orphaned "leaving" child still ghosted at the bottom. If scroll events are fast (trackpad inertia scrolling, multiple wheel ticks), steps 4-6 happen over and over, and the user sees **a cascade of broken intermediate frames** — components blinking in and out, the streaming block stuttering one token behind, ghosted duplicates at the edges of the viewport.

This is exactly what you see in Claude Code's NO_FLICKER mode: "sometimes components are shown sometimes not, and subtle scrolling makes some components show and others not." It is not a bug. It is the observable consequence of three simultaneous atomicity violations:

- **Time violation:** fiber yielded between steps 4 and 7, letting paint occur in step 6
- **Space violation:** entering child was at `width: 0` while scroll container was at new offset
- **Content violation:** terminal painted a mixed frame without sync-barrier protection

**What happens in an atomic pipeline (Silvery):**

1. Scroll event arrives. Viewport offset changes.
2. Flexily re-runs layout for the entire subtree synchronously. Every component in the new window has its real dimensions computed before any component renders.
3. React renders. `useBoxRect()` returns real dimensions for every component on the first pass. No `width: 0`. No second pass.
4. Output phase diffs new buffer vs old. Identifies changed cells (the scroll-revealed region + the streaming block's new token).
5. Output emits all changed cells, wrapped in DEC mode 2026 bracketing.
6. Terminal paints the full new frame atomically.

Six steps, all synchronous, one commit point. The terminal only ever sees the old frame or the new frame — never a half-constructed mixture. Scroll is smooth. The streaming code block updates in place without stutter. The entering child appears fully-formed. No cascade of broken frames.

The "more you scroll, the more breakage you see" property of Claude Code is the signature of a non-atomic pipeline — each scroll event is a new opportunity for the pipeline to expose a different intermediate state. In Silvery, scrolling is "free": there are no intermediate states to expose, so scrolling a thousand lines per second looks exactly like scrolling one line per second.

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

|                                    | Ink 7.0                       | NO_FLICKER (Claude Code)     | Ratatui (Rust)                   | Silvery                            |
| ---------------------------------- | ----------------------------- | ---------------------------- | -------------------------------- | ---------------------------------- |
| **Mode**                           | Inline (main buffer)          | Fullscreen (alt buffer)      | Both (`Viewport::Inline` or alt) | Both (one-line switch)             |
| **Scrollback quality**             | Native, but trashed by redraws| None; reimplemented in-app   | Native in inline mode            | Native (graduated content)         |
| **Output efficiency**              | Line-level; full redraw       | Cell-level; v2.1.89 flickering| Cell-level                       | Cell-level; 28-192x less output    |
| **Diffing strategy**               | log-update (line-level)       | Cell-level buffer             | Cell-level                       | Cell-level buffer + incremental    |
| **Layout timing**                  | Render → layout (Yoga)        | Render → layout (Yoga)       | Immediate (no components)        | Layout → render                    |
| **Width available during render?** | No (`width: 0` then real)     | No                           | N/A (no components)              | Yes (`useBoxRect()` first pass)     |
| **Memory in long sessions**        | Grows (full tree)             | Flat (visible only)          | Flat (rebuilt/frame)             | Flat (graduated = strings)         |
| **Layout engine**                  | Yoga (WASM, ~45KB gzipped)    | Yoga (WASM, ~45KB)           | Manual (Rust)                    | Flexily (pure TS, ~2KB)            |
| **Total gzipped size**             | ~116.6 KB (Ink + Yoga)        | Same as Ink                  | Compiled binary (N/A)            | ~114.9 KB (runtime; parity)        |
| **Cmd+F in inline**                | Native (but flickers)         | Alt-screen only; reimpl Cmd+O| Native                           | Native (graduated content)         |
| **Text selection native**          | Yes (flickers)                | Alt-screen only; reimpl      | Yes                              | Yes (graduated content)            |
| **GC pressure**                    | High (full tree)              | Medium (visible + alt)       | None (Rust)                      | Low (small live tree)              |
| **Flicker in inline mode**         | ~1/3 of sessions still flicker| Fixed in alt-screen; v2.1.89 regressions| None                          | None (layout-first pipeline)       |

<!-- VISUAL: VHS recording (.tape) of ScrollbackList in action — items streaming, completing, graduating to scrollback, user scrolling back through history -->

## Honest caveats

Silvery faces the same terminal constraints — you can't incrementally update scrollback once it scrolls up. The architecture mitigates this by segregating concerns:

- **Live zone** (bottom): incremental renders, no redraws
- **Scrollback zone** (top): terminal-owned, re-emitted only on structural changes (resize, graduation)

This means:
- **Frequent updates** (99% of user interactions): no flicker. Incremental output, local cursor positioning.
- **Infrequent updates** (resize, new items): brief pause while scrollback re-emits. Cost is O(completed items), not O(all items + live).

On large sessions (1000+ graduated exchanges), resize will pause briefly. This is the tradeoff — you get scrollback + incremental rendering; the cost is occasional O(n) work on resize. Without graduated scrollback, every keystroke pays that cost.

### Why NO_FLICKER still flickers — the two-pass dance

Claude Code's v2.1.89 regression (#41965) shows components appearing and disappearing during scroll, blank cells in the middle of the conversation, and flicker even in alt-screen mode. The symptoms don't match reconciler latency (which would show uniform slowness) — they match **the two-pass render dance from Step 2 above**.

Walk through what happens when you scroll in Claude Code's NO_FLICKER mode:

1. User scrolls. Terminal reports new viewport height.
2. React schedules a re-render of the scroll container.
3. Scroll container re-renders with old height metadata → children get wrong width/height props.
4. Yoga runs layout → computes real dimensions.
5. React re-renders children with real dimensions.
6. Terminal paint — if this happens between step 3 and step 5, **you see step 3's broken state on screen**.

In step 3, any component that decides "how many items to show" or "should I truncate" computes from `width: 0` (or stale dimensions). Lists collapse. Text disappears. Entire components render to nothing. Then step 5 fixes it — but if paint happens first, you see the collapsed state.

Scrolling triggers this cycle **continuously**, which is why "subtle scrolling makes some components show and others not" — you're catching different components at different points in their two-pass cycle.

Silvery's layout-first pipeline eliminates this entirely. Layout runs before render, so `useBoxRect()` always returns real dimensions on the first pass. There is no step 3. There is no broken-intermediate-state to paint. Scrolling re-runs layout → children re-render with correct dimensions → paint. One pass, one frame, always correct.

This is architectural, not optimization. Claude Code cannot fix it without abandoning their render-first pipeline — which would mean rewriting how their entire component tree interacts with layout. It's the same class of retrofit as moving from line-level to cell-level diffing, except this one goes even deeper: it changes when every component in the tree learns its own dimensions.

## The pattern

If you're building a terminal app that streams output — an AI agent, a test runner, a build tool — you'll hit this dilemma. The question is whether you:

1. Accept flickering (inline rendering, full redraw)
2. Give up scrollback (alternate screen, reimplement terminal features)
3. Use dynamic scrollback (inline + incremental + graduation)

This is the pattern I built into Silvery through `ScrollbackList` and `ScrollbackView`. The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.
