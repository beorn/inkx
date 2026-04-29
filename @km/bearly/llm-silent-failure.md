---
id: "@km/bearly/llm-silent-failure"
aliases:
  - km-bearly.llm-silent-failure
  - km-bearly-llm-silent-failure
created_by: claude:19080504
created_at: 2026-03-30T20:01:18Z
closed_at: 2026-03-30T20:11:42Z
close_reason: "Fixed: finishResponse() now exits 1 on empty content,
  finalizeOutput() awaits Bun.write() and exits 1 on failure, deep research
  error path exits 1 when no content. Broader robustness work tracked in
  km-bearly.llm-robustness."
---

# [x] LLM tool exits 0 but produces no output file — silent failure @km/bearly #bug #P2

bun llm.ts --deep --model gpt-5.4-pro launched with --context-file, exited 0, but no /tmp/llm-*.txt output was written. The task completed successfully from Claude Code's perspective but the review was lost. Need: (1) check if the API call actually returned data, (2) always write output even if empty (with error message), (3) exit non-zero on empty response.