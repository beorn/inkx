# 50 Content Ideas for the Silvery Ecosystem

Generated 2026-04-02 based on content audit of 253 pages across 6 sites.

## Current Content Landscape

- silvery.dev: 158 pages (heavy on component docs, good comparisons)
- terminfo.dev: ~206 pages (data-driven, programmatic SEO)
- termless.dev: 48 pages (matcher docs, guides)
- flexily: 14 pages, loggily: 21 pages, mdspec: 10 pages

## What's Missing (themes to explore)

### AI & Agent TUIs (hot topic, high search volume)

1. How Claude Code's TUI works (reverse-engineering the architecture)
2. Streaming LLM output in the terminal — batching, backpressure, cancellation
3. Building a multi-agent dashboard in the terminal
4. Terminal vs browser for AI coding tools — why the terminal is winning
5. The rise of terminal-first AI tools (Claude Code, aider, cursor terminal mode)
6. Rendering markdown in the terminal — how agent UIs display formatted output
7. Tool call visualization patterns for agent TUIs
8. Building a terminal chat UI that doesn't suck (scroll, selection, search)

### Terminal Deep Dives (evergreen, educational)

9. Why your terminal is 80 characters wide (history of VT100)
10. The VT100 legacy: how 1978 hardware still shapes your terminal
11. ANSI escape sequences: the complete reference (canonical resource)
12. How terminal emulators actually work (parsing, state machines, rendering)
13. The xterm control sequence ecosystem — who adds what, and why
14. Terminal multiplexers vs modern terminals — do you still need tmux?
15. Unicode in the terminal: wide characters, emoji, ZWJ, variation selectors
16. Why terminal rendering is harder than you think (cell grid, reflow, wrapping)
17. The terminal color problem: 16, 256, truecolor, and theme detection
18. How SSH changes what your terminal can do (clipboard, graphics, keyboard)

### macOS Terminal Ecosystem

19. Ghostty deep dive: architecture, GPU rendering, and what makes it fast
20. Setting up the perfect macOS terminal in 2026
21. Terminal.app hidden features most developers don't know about
22. Kitty vs Ghostty: a developer's comparison (daily-driver perspective)
23. iTerm2 in 2026: still relevant? (honest assessment)

### TUI Development (developer education)

24. React in the terminal: how it actually works (reconciler, host config)
25. Building responsive terminal layouts (the CSS analogy)
26. State machines for terminal UIs (TEA architecture)
27. Testing terminal applications: the state of the art
28. Terminal input is broken — here's how to fix it (Kitty protocol deep dive)
29. Building a file manager TUI from scratch
30. How to handle terminal resize correctly
31. Focus management in terminal UIs (spatial navigation, focus scopes)
32. Theming terminal applications (semantic tokens, palette detection)
33. Building a terminal table component that handles real data
34. Virtualized lists in the terminal — why and how

### Performance & Architecture

35. Why most terminal renderers are slow (and how to make them fast)
36. The case against WASM in terminal tools (pure TypeScript advantages)
37. Flexbox in the terminal: how Flexily works
38. Incremental rendering explained: dirty flags, subtree tracking, minimal diffs
39. Benchmarking terminal frameworks: methodology that isn't cherry-picking

### Testing & Quality

40. Playwright for terminals: introduction to headless TUI testing
41. Snapshot testing terminal output (ANSI-aware, not stripped text)
42. Property-based testing for TUI frameworks
43. The testing pyramid for terminal applications

### Terminal Standards & Compatibility

44. The terminal compatibility problem: why feature detection matters
45. Sixel graphics in 2026: which terminals support it and does it matter?
46. The Kitty graphics protocol: inline images in the terminal
47. Synchronized output: the simple protocol that eliminates terminal flicker
48. OSC 52: the clipboard protocol that works over SSH
49. Semantic prompts (OSC 133): what they are and why shells use them

### Ecosystem & Community

50. Building a terminal development toolkit: lessons from building 5 packages

## Prioritization Notes

**Highest SEO value (search volume + low competition):**

- #1, #4, #5 (AI + terminal trend content)
- #9, #10 (terminal history — evergreen, highly shareable)
- #19, #22 (Ghostty content — new, high interest)
- #24, #40 (educational developer content)

**Best for terminfo.dev (data-driven):**

- #17, #44, #45, #46, #47, #48, #49 (protocol/compatibility)

**Best for silvery.dev (product-adjacent):**

- #2, #6, #7, #8, #24, #25, #28, #35, #38 (TUI development)

**Most shareable (HN/Reddit/X):**

- #9 (why 80 chars), #4 (terminal vs browser for AI), #16 (terminal rendering is hard)
