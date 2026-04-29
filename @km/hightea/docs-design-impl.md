---
id: "@km/hightea/docs-design-impl"
aliases:
  - km-hightea.docs-design-impl
  - km-hightea-docs-design-impl
created_by: claude:fbad9cb1
created_at: 2026-03-06T09:19:15Z
closed_at: 2026-03-06T09:45:00Z
owner: bjorn@stabell.org
---

# [x] Update design doc pages on hightea.dev to reflect implemented status @km/hightea #task #P2

Three design doc pages on hightea.dev describe features as future/planned that are mostly or fully implemented. Audit results:

## Kitty Protocol (kitty-protocol.md) — 100% IMPLEMENTED
All 9 design doc features are fully implemented with 1,144 lines of tests. The doc just needs rewriting from design doc to reference doc.

## Cursor API (cursor-api.md) — ~80% IMPLEMENTED  
Core useCursor() works but with simpler API than proposed. Missing:
- DECSCUSR terminal cursor styles (ESC[0-6 q) — currently uses rendered cursor only
- Blink rate control — relies on native terminal blinking
- Selection ranges — explicitly marked future
- Multiple cursors — explicitly marked future  
- Cursor animation — explicitly marked future

## TextArea (textarea-design.md) — ~70% IMPLEMENTED
Key missing features (NOT marked future in design doc):
- Text selection (Shift+Arrow, Ctrl+A, delete selection)
- disabled prop
- maxLength prop  
- meta+enter submit key variant
- Ctrl+Home/End (document start/end navigation)
- Scroll margin (cursor context padding)
- useTextArea hook for reuse

## Input Limitations (input-limitations.md) — ALL SHIPPED
Future Improvements section lists 4 features that are all fully implemented:
1. Kitty keyboard protocol ✓
2. Bracketed paste mode ✓
3. Mouse input ✓
4. Focus events ✓

## Also fix
- react-19.md: StrictMode example uses old API order
- api/render.md: Inconsistent API signatures