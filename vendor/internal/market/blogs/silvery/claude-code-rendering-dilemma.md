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

## How Silvery approaches this differently

Silvery gives you two rendering modes, and you can switch between them with one line:

```tsx
render(<App />, term, { mode: "inline" }) // scrollback mode
render(<App />, term) // fullscreen mode
```

Same components, one-line switch.

### Mode 1: Inline with dynamic scrollback

This is the mode that addresses the dilemma directly. I split the output into two zones: a small live region at the bottom that stays mutable, and completed content that graduates into native scrollback.

<!-- VISUAL: Three-zone diagram — top: "Native scrollback (terminal owns, Cmd+F works)", middle: "Tracked scrollback (app can re-emit on resize)", bottom: "Live screen (React components, incremental rendering)" -->

**Flickering → avoided by two-phase rendering.** This is the part I think was the root cause of Claude Code's inline flickering. In a standard React terminal pipeline (Ink/Yoga), components render first, then layout runs. If a component needs to know its width to decide what to render, it has to render once at `width: 0`, measure, then render again with real dimensions. That second render pass is visible as flicker — especially in inline mode where you can't suppress intermediate frames. Silvery's pipeline runs layout first, so components have their dimensions on the first pass via `useContentRect()`. One render, one paint, no intermediate flash.

On top of that: **incremental rendering** (only changed cells redraw), **content graduation** (completed exchanges become terminal-owned text — Cmd+F, selection, scroll all work natively), and **flat memory** (graduated items leave the React tree, so GC pressure stays low even in long sessions).

::: details How deep does the incremental rendering go?
It's not just "diff the screen buffer." The layout engine — [Flexily](https://beorn.codes/flexily), a pure TypeScript flexbox implementation — caches layout results and skips recalculation for unchanged subtrees. The text measurement layer (Pretext) caches grapheme widths and line-break results so re-wrapping only happens when content or width actually changes. The render phase tracks 7 indepenfor thdent dirty flags per node — a border color change doesn't cascade through 200 child nodes. The output phase writes only changed cells. A typical interactive update takes ~169 microseconds end-to-end.
:::

### Mode 2: Fullscreen

For apps that want full cell-level control — Silvery provides that too, with the same components and the same incremental rendering. Switch based on context: inline for conversation views, fullscreen for dashboards.

```tsx
<ScrollbackList items={items} isFrozen={(item) => item.done}>
  {(item) => <Text>{item.text}</Text>}
</ScrollbackList>
```

`isFrozen` is the key. Done items graduate to scrollback automatically.

## How the approaches compare

|                                    | Ink (Claude Code before)               | NO_FLICKER (Claude Code now) | Ratatui (Rust)                   | Silvery                            |
| ---------------------------------- | -------------------------------------- | ---------------------------- | -------------------------------- | ---------------------------------- |
| **Mode**                           | Inline (main buffer)                   | Fullscreen (alt buffer)      | Both (`Viewport::Inline` or alt) | Both (one-line switch)             |
| **Scrollback**                     | Native, but trashed by redraws         | None (reimplemented in-app)  | Native in inline mode            | Native (graduated content)         |
| **Diffing**                        | Line-level                             | Cell-level                   | Cell-level                       | Cell-level                         |
| **Layout timing**                  | Render → then layout (Yoga)            | Render → then layout (Yoga)  | Immediate (no component tree)    | Layout → then render               |
| **Width available during render?** | No (`width: 0` first paint)            | No                           | N/A (no components)              | Yes (`useContentRect()`)           |
| **Memory in long sessions**        | Grows (full tree mounted)              | Flat (only visible mounted)  | Flat (rebuilt each frame)        | Flat (graduated items are strings) |
| **Layout engine**                  | Yoga (WASM, 16MB)                      | Yoga (WASM, deferred)        | Manual layout (Rust)             | Flexily (pure TypeScript)          |
| **Cmd+F / text selection**         | Native (but flickers)                  | Reimplemented in-app         | Native in inline mode            | Native (graduated content)         |
| **GC pressure**                    | High (large tree, frequent re-renders) | Lower (only visible)         | None (Rust)                      | Low (small live tree)              |

<!-- VISUAL: VHS recording (.tape) of ScrollbackList in action — items streaming, completing, graduating to scrollback, user scrolling back through history -->

## Honest caveats

This isn't magic. Silvery faces the same terminal constraint — you can't incrementally update scrollback. The difference is _when_ redraws happen:

- **Without dynamic scrollback**: every state change triggers a full clear-and-redraw. Every keystroke, every streaming token.
- **With dynamic scrollback**: redraws happen on infrequent structural events — terminal resize, item graduation. The live screen handles the frequent updates incrementally.

In practice, users rarely see flickering. But on resize with thousands of graduated items, there's a brief pause while scrollback is re-emitted.

## The pattern

If you're building a terminal app that streams output — an AI agent, a test runner, a build tool — you'll hit this dilemma. The question is whether you:

1. Accept flickering (inline rendering, full redraw)
2. Give up scrollback (alternate screen, reimplement terminal features)
3. Use dynamic scrollback (inline + incremental + graduation)

This is the pattern I built into Silvery through `ScrollbackList` and `ScrollbackView`. The [scrollback example](https://silvery.dev/examples/scrollback) and [AI agent example](https://silvery.dev/examples/ai-chat) show it in practice.
