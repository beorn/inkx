---
id: "@km/silvery/examples-gallery"
aliases:
  - km-silvery.examples-gallery
  - km-silvery-examples-gallery
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:38Z
owner: bjorn@stabell.org
---

# [ ] Example: gallery (Kitty images, pixel art, drawing, truecolor) @km/silvery #task #P3

Example: gallery — Kitty images, pixel art, truecolor showcase

## What It Demonstrates
- Kitty graphics protocol (Image component with auto-detection)
- Half-block pixel art rendering
- Truecolor gradients and palettes
- Image browsing with keyboard navigation

## Status: NEW (build from existing kitty/ examples)

## Source Material
Combine features from existing kitty/ examples:
- kitty/images.tsx (Image Viewer — browse + display with Kitty protocol)
- kitty/paint.tsx (Photo Paint — draw over images with half-block overlay)
- kitty/canvas.tsx (Char Draw — click-drag pixel art with RGB color picker)
- kitty/image-component.tsx (declarative Image component with protocol detection)

## Tabs
1. Images — browse/display images (from kitty/images.tsx)
2. Paint — draw on canvas with pixel art (from kitty/canvas.tsx + paint.tsx)
3. Truecolor — gradient display, 256-color + truecolor palettes

## Key Components
- Image component (declarative, protocol auto-detection)
- Half-block rendering (Unicode half-block chars for pixel art)
- Mouse input (parseMouseSequence, enableMouse)
- HSL color picker

## Implementation Notes
- ExampleMeta: name="Gallery", description="Kitty images, pixel art, and truecolor rendering"
- features: ["Image", "Kitty graphics", "half-block", "truecolor", "mouse input"]
- File: examples/interactive/gallery.tsx
- For web: Kitty protocol won't work in xterm.js, so show fallback text mode or static display
- Tab switching via number keys (1/2/3) or Tab