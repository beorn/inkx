---
mentions:
  - km
id: "@km/infra/llm-pro-silent-fail"
aliases:
  - km-infra.llm-pro-silent-fail
  - km-infra-llm-pro-silent-fail
created_by: Bjørn Stabell
created_at: 2026-04-12T19:25:47Z
closed_at: 2026-04-12T19:29:13Z
close_reason: "Fixed: finishResponse now writes error details to the output file
  (markdown with model, tokens, duration, query, possible causes) and emits JSON
  metadata to stdout with error:'empty_response' before exit(1). Also fixed
  runDeep to route genuine failures (no responseId + no content) through
  finishResponse instead of silently returning. Background callers can now find
  the output file and see what happened."
owner: bjorn@stabell.org
---

# [x] LLM Pro silent failure — empty response exits without visible error @km/infra #bug #P2

GPT 5.4 Pro occasionally returns empty content. format.ts catches it and exits(1) with an error to stderr, but when run via background command the stderr is swallowed. Multiple Pro calls have failed silently this session. Fix: write error to a file, or retry once, or surface the error more visibly.

