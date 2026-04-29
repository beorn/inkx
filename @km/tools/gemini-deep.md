---
id: "@km/tools/gemini-deep"
aliases:
  - km-tools.gemini-deep
  - km-tools-gemini-deep
created_by: claude:d3a7049b
created_at: 2026-02-21T00:50:06Z
closed_at: 2026-02-21T08:08:18Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Add Google Gemini 3.1 Pro deep research to llm tool @km/tools #feature #P3 @claude:d3a7049b

Add Google Gemini 3.1 Pro (Interactions API, deep-research-pro-preview model) as a deep research provider alongside OpenAI and Perplexity in the llm tool. Gemini's API uses a different pattern (Interactions API with polling). See vendor/beorn-tools/tools/lib/llm/ for current provider architecture.