---
mentions:
  - km
id: "@km/silvery/examples-terminal"
aliases:
  - km-silvery.examples-terminal
  - km-silvery-examples-terminal
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:36Z
owner: bjorn@stabell.org
---

# [ ] Example: terminal kitchensink (clipboard, paste, mouse, keys, focus, truecolor) @km/silvery #task #P3

Example: terminal — Kitchensink for terminal interaction features

## What It Demonstrates

- Clipboard (OSC 52 copy/paste)
- Bracketed paste mode
- Mouse input (click, drag, scroll)
- Keyboard events with modifier display
- Focus tracking (terminal focus/blur)
- Truecolor rendering
- Cursor styles

## Status: NEW (combine existing interaction examples)

## Source Material

- interactive/clipboard.tsx (OSC 52 copy/paste)
- interactive/paste-demo.tsx (bracketed paste as single event)
- kitty/input.tsx (combined keyboard + mouse showcase)
- kitty/keys.tsx (key chord tester with modifier symbols)

## Tabs

1. Keys — key event tester showing modifiers, chords, special keys (from kitty/keys.tsx + input.tsx)
2. Mouse — mouse position, button state, scroll events (from kitty/input.tsx)
3. Clipboard — OSC 52 copy/paste demo (from clipboard.tsx + paste-demo.tsx)
4. Focus — terminal focus/blur tracking, cursor style changes

## Key Components

- useInput (keyboard events)
- useMouse (mouse events)
- useTerminalFocused (focus tracking)
- copyToClipboard() / requestClipboard() (OSC 52)
- Kitty keyboard protocol detection

## Implementation Notes

- ExampleMeta: name="Terminal", description="Keyboard, mouse, clipboard, focus, and terminal capabilities"
- features: ["useInput", "useMouse", "clipboard", "focus", "Kitty protocol"]
- File: examples/interactive/terminal.tsx
- Each tab is self-contained, demonstrates one interaction category
- Show raw event data (key codes, mouse coords, clipboard content)
- Web: clipboard works differently (navigator.clipboard), mouse/keyboard work via xterm.js

