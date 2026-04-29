---
id: "@km/termless/tape"
aliases:
  - km-termless.tape
  - km-termless-tape
created_by: claude:4929065a
created_at: 2026-04-02T06:54:05Z
---

# [ ] VHS .tape format: parse, play, record, render, cross-terminal compare @km/termless #feature #P2 @claude:4929065a

Full .tape format support — parse VHS DSL, execute headlessly, produce visual output.

## CLI

```
termless tape play demo.tape                          # Execute headlessly (default: vterm)
termless tape play demo.tape -o out.png               # Screenshot final frame
termless tape play demo.tape -o out.gif               # Animated GIF (no ffmpeg)
termless tape play demo.tape -o out.cast              # Write asciicast v2
termless tape play demo.tape -o out.svg               # Animated SVG
termless tape record -o demo.tape                     # Record PTY session to .tape
cat demo.tape | termless tape play -                  # Stdin support

# Multi-backend comparison
termless tape play demo.tape --backend vterm,ghostty,xtermjs
  → out-vterm.png, out-ghostty.png, out-xtermjs.png

termless tape play demo.tape --backend all --compare side-by-side -o comparison.png
termless tape play demo.tape --backend all --compare grid -o comparison.png
termless tape play demo.tape --backend all --compare diff -o diff-report.png
```

## .tape DSL

Support all VHS commands:
- Type, Enter, Backspace, Ctrl+X, Alt+X, Tab, Escape, Space
- Sleep <duration>
- Screenshot (produces image via screenshotSvg/screenshotPng)
- Output <filename>
- Set Width/Height (→ terminal cols/rows)
- Set FontSize/FontFamily/Theme (→ SVG rendering options)
- Set TypingSpeed, Set Shell
- Hide/Show (toggle output recording)

## Compare modes

- **separate** (default) — one image per backend
- **side-by-side** — horizontally composed, backend names as headers
- **grid** — NxM grid for many backends
- **diff** — pixel differences highlighted (pixelmatch)

## Implementation

- Parser: simple line-by-line DSL, ~15 commands
- Execution: drive termless Terminal with encodeKey/feed
- Screenshot: existing screenshotSvg/screenshotPng
- GIF: sequence of PNG frames → animated GIF (sharp/gifenc, no binary deps)
- Compare: compose multiple screenshots with SVG or canvas
- Record: wrap PTY, emit .tape commands for keystrokes + timing

## Unique value

VHS requires ttyd + headless Chrome + ffmpeg. Termless is pure JS/TS, runs in CI without a display server, and can compare across 11 terminal backends — something no other tool can do.