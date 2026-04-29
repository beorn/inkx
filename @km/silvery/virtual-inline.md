---
id: "@km/silvery/virtual-inline"
aliases:
  - km-silvery.virtual-inline
  - km-silvery-virtual-inline
created_by: claude:def7f8a1
created_at: 2026-03-16T22:19:09Z
closed_at: 2026-03-17T01:49:48Z
close_reason: "Implemented: virtual-scrollback.ts (circular buffer 10K lines),
  search-overlay.ts (TEA search), virtualInline mode in create-app.tsx + run.tsx
  (altscreen + scroll + Ctrl+F search + scroll indicators). code-agent.tsx demo
  app. 40 tests pass."
owner: bjorn@stabell.org
assignee: claude:def7f8a1
---

# [x] Virtual inline mode: altscreen with native terminal features (Cmd+F, selection, copy/paste) @km/silvery #feature #P2 @claude:def7f8a1

## Problem

Terminal TUI apps face a fundamental trade-off between rendering quality and native terminal UX:

- **Normal scrollback mode** (what Claude Code / silvery inline mode uses): The app redraws the viewport dozens of times per second. When content exceeds viewport height, rows push into scrollback. Rendering offscreen or resizing requires clearing scrollback → causes flickering. Claude Code rewrote their renderer to diff cells and emit minimal escape sequences, reducing flicker ~85%, but it's still imperfect.

- **Alternate screen mode** (what vim/emacs use): The terminal switches to a separate buffer where the app has full control over scrolling, rendering, and cursor. Eliminates flickering entirely. But you lose native terminal features: **Cmd+F search**, **text selection**, **copy/paste**, and **scrollback history**.

Boris Cherny (Claude Code creator) on this trade-off ([Threads, 2026-03](https://www.threads.com/@boris_cherny/post/DSZbe5nCLkg/)):
> "However, you no longer get native terminal experiences for things like Cmd+F search, text selection, and copy/paste. We value this native experience a lot. We may explore alternate screen mode in the future, but our bar is quite high."

## Proposal

Build a **virtual inline mode** in silvery that uses altscreen but **replicates all the native features** you'd lose:

1. **Text selection** — App-level mouse drag highlighting with visual feedback (already tracked: @km/silvery/text-selection)
2. **Copy/paste** — OSC 52 clipboard integration for selected text; paste via bracketed paste mode
3. **Search (Cmd+F equivalent)** — Built-in incremental search overlay (like vim's `/` but discoverable)
4. **Scrollback history** — Virtual scrollback buffer the app maintains; mouse wheel / keyboard scroll through conversation history
5. **Scroll position indicators** — Show where you are in the history (scrollbar, line count, "N more above")

The goal: users should not be able to tell the difference from native terminal behavior, except that flickering is gone and the app has pixel-perfect control of rendering.

## Why silvery (not km)

This is a general-purpose TUI framework feature. Any silvery app (not just km) would benefit from flicker-free rendering with native-feeling UX. Claude Code uses Ink today; if silvery solves this, it's a compelling reason to switch.

## Prior art

- Vim/Neovim: altscreen + own selection/search/scrollback — but keyboard-centric, not mouse-native
- Zellij/tmux: terminal multiplexers that virtualize scrollback in altscreen
- WezTerm/Kitty: terminals with extended protocols (OSC 52, mouse reporting) that make app-level features feel native
- Claude Code's approach: stay in normal mode, minimize flicker via diff rendering

## Open questions

- Can OSC 52 clipboard reliably replace native Cmd+C across terminals? (Works in Ghostty, iTerm2, WezTerm, Kitty; broken in Apple Terminal, some SSH)
- Should this be opt-in (`alternateScreen + virtualInline`) or the new default for fullscreen apps?
- How to handle terminal emulators that don't support required protocols (graceful degradation to current inline mode?)