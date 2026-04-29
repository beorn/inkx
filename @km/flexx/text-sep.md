---
id: "@km/flexx/text-sep"
aliases:
  - km-flexx.text-sep
  - km-flexx-text-sep
created_by: claude:b509d761
created_at: 2026-02-10T13:51:54Z
closed_at: 2026-02-12T14:19:42Z
---

# [x] Separate TUI/text-specific parts from flexx core @km/flexx #task #P3 @claude:586bad48

Flexx currently has TUI/text-specific logic mixed into the core layout engine (e.g., displayWidth for text measurement, text-specific node properties). Ideally flexx should work with both text and non-text layouts (e.g., pixel-based, SVG). Separate the text-measurement layer so the core engine is layout-system-agnostic, with text support as an optional adapter/plugin.