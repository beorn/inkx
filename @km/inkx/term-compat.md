---
id: "@km/inkx/term-compat"
aliases:
  - km-inkx.term-compat
  - km-inkx-term-compat
created_by: claude:ee8efc0f
created_at: 2026-02-23T11:16:18Z
closed_at: 2026-02-23T11:42:09Z
owner: bjorn@stabell.org
assignee: claude:ee8efc0f
---

# [x] Terminal compatibility test suite for inkx @km/inkx #task #P2 @claude:ee8efc0f

Build a terminal compatibility test suite that verifies inkx works across terminals, emulators, and protocol combinations.

## Why
Adopters evaluating inkx need confidence it works in their environment. ink has been battle-tested across thousands of terminals over years. inkx needs a structured way to verify and document compatibility.

## Proposed test dimensions

### Terminals / Emulators
- [ ] Ghostty (primary dev terminal)
- [ ] iTerm2 (macOS dominant)
- [ ] Terminal.app (macOS default)
- [ ] kitty
- [ ] Alacritty
- [ ] WezTerm
- [ ] Windows Terminal
- [ ] VS Code integrated terminal
- [ ] tmux / screen (multiplexer layer)
- [ ] SSH sessions (remote)
- [ ] CI environments (headless — GitHub Actions, etc.)

### Protocol features to test
- [ ] Basic rendering (ANSI colors, bold, italic, underline)
- [ ] 256-color and truecolor support
- [ ] Unicode: CJK characters, emoji, combining marks, wide chars
- [ ] Kitty keyboard protocol (disambiguate, report events)
- [ ] SGR mouse protocol (click, drag, scroll, hover)
- [ ] Bracketed paste
- [ ] Alternate screen buffer
- [ ] DECSTBM scroll regions
- [ ] Clipboard (OSC 52)
- [ ] Hyperlinks (OSC 8)
- [ ] Images: Kitty protocol, Sixel
- [ ] Extended underlines (curly, dotted, dashed)
- [ ] Terminal resize handling

### Test approaches
1. **Automated capability detection tests** — run in CI, verify cap detection logic works correctly even without a real terminal (mock terminfo/env)
2. **Semi-automated visual tests** — script that runs through each feature, takes screenshots (via TTY MCP or similar), human reviews
3. **Compatibility matrix generator** — script that probes terminal capabilities and outputs a markdown table for docs
4. **Regression suite** — specific known-broken terminal combinations get permanent test cases

### Documentation output
- docs/terminal-compatibility.md — matrix showing which features work in which terminals
- Automated: generate from test results, not manually maintained

## Prior art
- Textual has a comprehensive terminal compatibility page
- chalk-level and supports-color handle capability detection
- terminfo database provides baseline but misses modern protocols

## Depends on
- inkx terminal capability detection code (src/terminal-capabilities.ts or similar)