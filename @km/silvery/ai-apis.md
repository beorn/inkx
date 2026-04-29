---
id: "@km/silvery/ai-apis"
aliases:
  - km-silvery.ai-apis
  - km-silvery-ai-apis
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:07Z
---

# [ ] AI-first APIs: screen model queries and command surface @km/silvery #feature #P3

Refine and formalize the AI-native APIs that make Silvery the go-to framework for AI agent interfaces:

1. **Screen model queries**: Standardized way to get UI elements in machine-readable form (like DOM queries but for TUI). AI can reason about what's on screen.
2. **Command surface exposure**: Easy programmatic listing of all available commands with metadata (name, description, keybindings, parameters)
3. **State query API**: Read model state programmatically from outside the app
4. **Action replay**: Feed serialized update streams (from AI, websocket, test) via handle.apply()

Document use cases: AI coding agents (Claude Code, Cursor, Aider), automated testing, remote control, accessibility.

No other TUI framework advertises AI-ready capabilities. This is the category-defining feature.