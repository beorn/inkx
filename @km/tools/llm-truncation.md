---
id: "@km/tools/llm-truncation"
aliases:
  - km-tools.llm-truncation
  - km-tools-llm-truncation
created_by: claude:dffe6eeb
created_at: 2026-02-09T13:48:19Z
closed_at: 2026-02-09T13:48:24Z
---

# [x] LLM tool: background task output truncation loses file path @km/tools #bug #P1

When running LLM tool in background, Claude Code captures both stderr (streaming tokens) and stdout (JSON with file path). Deep research streaming tokens exceed Claude Code 30KB tool result limit, losing the JSON file path. Fixed: (1) removed --output - mode, (2) suppress streaming tokens in non-TTY mode, (3) print file path on stderr, (4) updated all skills with correct retrieval instructions.