---
mentions:
  - km
id: "@km/bearly/llm-dispatch-shatter"
aliases:
  - km-bearly.llm-dispatch-shatter
  - km-bearly-llm-dispatch-shatter
created_by: claude:2405c72e
created_at: 2026-04-27T06:58:45Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.llm-dispatch-shatter
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-26T23:59:18Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [ ] Shatter llm dispatch.ts (1593 LOC) into per-command modules @km/bearly #task #P2

blocks:: [[@km/bearly]]

## Problem

`vendor/bearly/plugins/llm/src/lib/dispatch.ts` is 1593 lines spanning
unrelated concerns: TTY raw-mode prompts (process.stdin.setRawMode),
HTTP fetch() for pricing pages, LLM-based pricing extraction,
deep-research dispatch, debate dispatch, dual-pro A/B JSONL logging,
partial response recovery, polling loops, signal handling, and context
file building.

A module that does TTY input should not also be doing HTTP fetches and
appending JSONL.

Discovered via /pro review of the llm tool (Kimi K2.6, 2026-04-26):
finding 2.1.

## Plus related architectural findings (same review)

- 2.4: queryModel in research.ts is a 150-line knot of provider switches +
  retry + image encoding. Extract ProviderStrategy interface; ContextLimitRetry
  middleware.
- 2.5: queryOpenAIDeepResearch and queryOpenAIBackground in openai-deep.ts
  are 70% identical. Collapse into queryOpenAIResponses(opts) with tools[].
- 2.6: Module-scope `let` provider clients reading process.env.OPENAI_API_KEY
  directly. Convert to createProviders(env) factory.

## Goal

Split into:

- `cmd/ask.ts` — single-model ask + finish
- `cmd/deep.ts` — deep-research dispatch
- `cmd/dual-pro.ts` — A/B parallel logic + JSONL logging
- `cmd/debate.ts` — consensus
- `cmd/recover.ts` — partial recovery + polling
- `pricing/updater.ts` — LLM-based extraction + cache write
- `ui/confirm.ts` — TTY raw-mode prompts (sole owner of process.stdin.setRawMode)
- `strategies/{openai-deep,gemini-deep,vercel,ollama}.ts` — provider strategies
- `middleware/context-limit-retry.ts` — generic wrapper

Keep `dispatch.ts` as a thin router (or delete it).

## Acceptance

- dispatch.ts < 200 LOC (or removed)
- ProviderStrategy interface + concrete implementations
- queryOpenAIResponses unified with tools[] parameter
- createProviders(env) factory; no module-scope process.env reads
- All existing tests pass; new unit tests cover at least 3 strategies

## Reference

Review at /tmp/llm-2405c72e-adversarial-review-of-the-292y.txt

