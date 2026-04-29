---
id: "@km/silvery/ai-chat"
aliases:
  - km-silvery.ai-chat
  - km-silvery-ai-chat
created_by: claude:e4e70c9a
created_at: 2026-03-11T20:56:26Z
---

# [ ] AIChat component: embedded AI with command + code mode integration @km/silvery #feature #P3

A Silvery component that makes it easy to embed AI chat in any app. Integrates with the command registry (cmd.all(), cmd.search(), cmd.execute()) and the REPL kernel (sandboxed code execution). The AI gets cmd, state, screen globals automatically. Handles the LLM conversation loop, tool/code execution, and result display. See vendor/silvery-internal/design/command-surfaces.md for the design context.