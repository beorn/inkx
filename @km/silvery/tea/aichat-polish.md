---
mentions:
  - km
id: "@km/silvery/tea/aichat-polish"
aliases:
  - km-silvery.tea.aichat-polish
  - km-silvery-tea-aichat-polish
created_by: claude:73d7a332
created_at: 2026-03-12T16:46:23Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea.aichat-polish
    depends_on_id: km-silvery.design-review
    type: blocks
    created_at: 2026-04-16T12:48:09Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-review
---

# [ ] Polish AI Chat example for CLI — flagship demo quality @km/silvery #task #P2

blocks:: [[@km/silvery/design-review]]

Polish the AI Chat example for CLI — the flagship demo of silvery

## What This Is

ai-chat (examples/interactive/ai-chat.tsx) is the primary showcase. It must be excellent standalone and in the viewer/bundle. This bead covers CLI-specific polish.

## Current State

- File: examples/interactive/ai-chat.tsx (TEA state machine via useTea)
- Supporting modules: examples/interactive/scrollback/ (types.ts, script.ts, state.ts, components.tsx)
- Tests: tests/examples/ai-chat*.test.tsx (4 files), tests/features/inline-scrollback-promotion.test.tsx, tests/features/scrollback-*.test.tsx
- Uses ScrollbackList with isFrozen + markers for rich terminal scrollback
- Supports --auto, --fast, --stress, --fullscreen flags
- Running modes: inline (default) and fullscreen

## Known Issues (from @km/silvery/inline-bugs bead)

- Inline mode: content can jump up after Enter (cursor-up overshoots into shell prompt area)
- Inline mode: exit behavior may not restore terminal properly
- Border rendering issues in some terminal widths
- IncrementalRenderMismatchError at (77,45) in tests — pre-existing pipeline bug

## Polish Items

1. Verify all controls work smoothly: Enter (advance), Tab (auto mode toggle), Ctrl+L (compact), Ctrl+D (exit), Esc (exit)
2. Streaming animation timing — thinking spinner (1-2s), word-by-word reveal (50ms intervals), tool call spinner
3. Script content quality — the SCRIPT entries should tell a compelling story
4. Status bar layout — one line, clean: context bar, elapsed, cost, key hints
5. Intro text — shown before first exchange, hidden once content appears
6. Session complete message — clear and useful
7. Test at 80 and 120 column widths
8. Test in both inline and fullscreen modes
9. Verify scrollback preservation — colors, borders, hyperlinks should survive in terminal scrollback

## Architecture

TEA state machine: INIT_STATE + createDemoUpdate() produces [state, effects]. Effects are timer-based (fx.delay, fx.interval, fx.cancel). State includes exchanges[], scriptIdx, streamPhase, revealFraction, done, compacting, pulse, autoTyping.

## Key Files

- examples/interactive/ai-chat.tsx — main component (CodingAgent)
- examples/interactive/scrollback/types.ts — Exchange, ScriptEntry, ToolCall types
- examples/interactive/scrollback/script.ts — SCRIPT data, CONTEXT_WINDOW, generateStressScript
- examples/interactive/scrollback/state.ts — INIT_STATE, createDemoUpdate, TEA update function
- examples/interactive/scrollback/components.tsx — ExchangeItem, DemoFooter, ToolCallBlock

