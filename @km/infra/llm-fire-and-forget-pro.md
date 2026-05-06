---
mentions:
  - km
  - claude
id: "@km/infra/llm-fire-and-forget-pro"
aliases:
  - km-infra.llm-fire-and-forget-pro
  - km-infra-llm-fire-and-forget-pro
created_by: claude:8b5b9e1c
created_at: 2026-04-21T05:34:55Z
closed_at: 2026-04-21T05:48:13Z
close_reason: >-
  Pro calls now route through OpenAI Responses API with background:true,
  persisting a responseId before polling. Dual-pro GPT leg + single-model pro
  fallback both use queryOpenAIBackground; K2.6 stays on generateText
  (OpenRouter has no Responses API — documented constraint).


  Implementation:

  - vendor/bearly/plugins/llm/src/lib/openai-deep.ts: new
  queryOpenAIBackground() + isOpenAIBackgroundCapable()

  - vendor/bearly/plugins/llm/src/lib/dispatch.ts: runProDual routes GPT leg
  through queryOpenAIBackground; askAndFinish routes pro-mode OpenAI calls
  similarly

  - imagePath disables the background path (queryOpenAIBackground is text-only
  today; Responses API input_image plumbing is future work)

  - --no-recover flag semantics unchanged


  Verified end-to-end:

  - bun llm pro --model gpt-5-nano 'say hi' -> completed inline in 6.8s (happy
  path, /bin/zsh.0001)

  - SIGINT'd a gpt-5-mini pro call at 2s -> responseId persisted, partial on
  disk

  - bun llm recover <id> -> polled OpenAI, reattached, wrote 1946 chars


  Tests: 42/42 pass (8 new in pro-fire-and-forget.test.ts; 2 updated for new
  transport)

  Typecheck: 0 errors


  Commits:

  - 66e78b5 feat(llm): add queryOpenAIBackground for recoverable non-research
  calls

  - 87dc40b feat(llm): route pro through Responses API for recoverable
  fire-and-forget

  - 5111a78 test(llm): recoverable pro calls — responseId persistence + recover
  path

  - km 3721a2830: bump bearly submodule
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-infra.llm-fire-and-forget-pro
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T22:35:15Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Standard pro calls should be fire-and-forget + recoverable like --deep @km/infra #feature #P2 @claude:8b5b9e1c

blocks:: [[@km/infra]]

Today --deep uses OpenAI's responses API → fire-and-forget + \`bun llm recover <id>\`. Standard pro uses synchronous generateText → no recovery. If a pro call is aborted (wall-clock, SIGINT, network hiccup), the work is lost.

Fix: route standard pro through the same responses API as --deep so every pro call persists a responseId and can be recovered. No user-visible behavior change in the happy path; massive UX improvement on failure.

Context:

- Filed 2026-04-21 after removing the dual-pro wall-clock timeout (which was killing legitimate long-context queries). Removal is safe because user can SIGINT + providers have their own timeouts — but that means 30+ min pro calls lose work on any interruption.
- Today's responses API path lives in vendor/bearly/plugins/llm/src/lib/openai-deep.ts and research.ts (deep branch).
- Blast radius: dispatch.ts dual-pro path, ask() with "standard" level, queryModel in research.ts.

Acceptance criteria:

1. \`bun llm pro "..."\` returns a responseId and writes /tmp/llm-*.txt with "in_progress" immediately, OR returns the answer if it completes fast
2. \`bun llm recover <id>\` works for pro-mode call IDs
3. Dual-pro still races both legs and returns combined report
4. Existing tests still green

