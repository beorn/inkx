---
mentions:
  - km
id: "@km/inbox/silvery-legacy"
aliases:
  - km-silvery-legacy
  - "@km/_orphan/silvery-legacy"
created_at: 2026-02-04T11:18:52Z
closed_at: 2026-03-09T22:07:53Z
close_reason: "Grooming: 96% complete, remaining children moved to km-silvery.
  hightea is silvery now."
---

# [x] hightea: React terminal UI framework @km/_orphan #epic #P2

hightea — React-based terminal UI framework with two-phase layout, synchronous layout feedback, and progressive terminal enhancement.

## Open Work

- **@km/hightea/live-docs** (P3) — Web-based docs site with xterm.js + canvas example viewer

## Implemented Features (103 beads closed)

### Rendering Pipeline

- Two-phase rendering with synchronous layout feedback
- Style transition cache (minimal SGR diff between style pairs)
- Incremental contentPhase rendering with dirty flags
- Wide char atomic diff optimization (cell-level, not full-row fallback)
- Damage rects evaluation — row ranges confirmed sufficient (85-166x faster than rectangles)
- Slow frame warnings (configurable threshold, zero-overhead when disabled)
- Buffer performance: batch fill, pre-allocated diffBuffers, reduced getCell allocations
- Diff micro-optimizations: bounding box, relative cursor, row slice compare

### Terminal Protocols

- Kitty keyboard protocol (full: disambiguate, events, alternate keys, text codepoints, lock modifiers)
- SGR mouse events (click, drag, scroll, DOM-style bubbling, click-to-focus)
- Bracketed paste mode (ESC[?2004h, usePaste hook, onPaste in useInput)
- OSC 52 clipboard (copy/paste across SSH)
- Terminal notifications: OSC 9 (iTerm2) + OSC 99 (Kitty)
- Synchronized Update Mode (DEC)

### Components & Hooks

- Box, Text, VirtualList, Static, Console, TextInput, ReadlineInput, TextArea, Link
- Transform component (Ink-compatible, per-line string transform)
- Image component (Kitty graphics + Sixel protocol, auto-detection, text fallback)
- Outline prop on Box (CSS outline equiv — border without layout impact)
- useFocusable / useFocusWithin (tree-based focus system)
- usePaste (runtime paste events)
- useContentRect / useScreenRect (layout feedback)
- InputLayerProvider / useInputLayer (dialog input isolation)
- SplitView / PaneManager (generic pane tiling)
- VirtualColumns (horizontal + vertical virtualization)

### Architecture

- Plugin composition: withCommands, withKeybindings, withDiagnostics
- Driver pattern for testing/AI automation
- CC (Claude Code) compatibility: Transform + useFocus shim
- DOM-like render API with nested mounting
- Render barrier for mode-changing events
- Multiple layout engines (Flexture default, Yoga optional)

### Documentation & Tooling

- FOSS-ready docs overhaul (plugins.md, troubleshooting.md, CONTRIBUTING.md)
- Ink comparison document with head-to-head benchmarks
- Examples: clipboard, paste, outline, transform, image, kitty, mouse
- Migration guides (Ink→hightea, legacy hightea→hightea/runtime)

