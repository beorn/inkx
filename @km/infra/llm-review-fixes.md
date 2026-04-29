---
id: "@km/infra/llm-review-fixes"
aliases:
  - km-infra.llm-review-fixes
  - km-infra-llm-review-fixes
created_by: claude:0590a583
created_at: 2026-04-21T00:26:39Z
closed_at: 2026-04-21T01:09:44Z
close_reason: "K2.6 + GPT-5.4 Pro dual review addressed across 3 commits (bearly
  c3abb10 + 9b74e26 + ff657b2). Blockers resolved: non-TTY
  confirmOrExit/checkAndRecoverPartials hang, dual-pro imagePath drop, Gemini
  recovery routing (partials with Gemini IDs were getting polled via OpenAI
  retrieveResponse). Majors resolved: dual-pro cost confirmation, per-leg
  timeout+abort, unified reasoning config, OpenRouter arbitrary IDs, --image in
  VALUE_FLAGS, empty-content normalization, non-zero exit on both-failed, poll
  ceilings unified at 600, gemini-deep SSE parser force-polling, initCli()
  pattern, consensus.totalCost now correct, stale haiku ref fixed, research
  filename collisions, --deep<keyword> error. Minors: A/B log schema version,
  --name=value, LLM_NO_AUTO_PRICING opt-out, pricing sanity bounds, stale-timer
  not reset on failure, dead code
  (REFINEMENT_PROMPT/deepConsensus/handleStreamDisconnect/queryWithStreaming),
  main() returns command, typed PROVIDER_ROWS, runRecover responseId on failure,
  --verbose documented, duplicate output line dedup. Deferred as taste (not
  blocking): full ProviderAdapter refactor, multimodal path unification,
  types.ts concern split, SIGINT wiring from CLI, per-mode hard budgets,
  openai-deep scaffolding cleanup. Reconciliation: K2.6 caught 14 items; Pro
  additionally caught 8 (including the Gemini recovery blocker). Both reviews
  delivered real value — strong evidence the /pro dual-mode is worth keeping."
---

# [x] Address K2.6 review findings on @bearly/llm (blockers + majors + minors) @km/infra #task #P2 @claude:0590a583

blocks:: [[@km/infra]]

Tracking bead for all fixes surfaced by the 2026-04-20 K2.6 architecture review of @bearly/llm. Full report: /tmp/llm-0590a583-architecture-correctness-review-of-jcn9.txt.

## Blockers
- [ ] 1.4 confirmOrExit / checkAndRecoverPartials hang forever on non-TTY stdin (CI/Docker/bg-task hazard). Add TTY check + timeout + EOF guard.
- [ ] 2.1 runProDual silently drops imagePath. Forward to both ask() calls.

## Majors
- [ ] 1.1 cli.ts runs argv parsing + initializePricing() + tempfile cleanup at module scope. Hoist into initFromArgv(), keep module scope pure.
- [ ] 1.2 let outputFile at module scope is race hazard. Make local to main(), thread through dispatch.
- [ ] 2.2 + 5.3 runProDual has no cost confirmation. Add skipConfirm + confirmOrExit gate.
- [ ] 2.3 parallel ask() calls have no timeout/abort. Plumb AbortController with 5min timeout through ask → queryModel.
- [ ] 4.2 Arbitrary OpenRouter model IDs rejected. Synthesize transient Model when id contains '/' and openrouter available.
- [ ] 3.1 No unified reasoning config (OpenAI reasoning_effort, Anthropic thinking, Gemini thinking). Discriminated union on Model.reasoning.
- [ ] 6.5 gemini-deep SSE parser uses speculative event shapes. Verify against real API or force polling path.

## Minors
- [ ] 1.3 tools/llm.ts passes argv[2] to maybeAutoUpdatePricing (fragile). Have main() return command string.
- [ ] 2.5 A/B log schema lacks version. Inject schema: 'ab-pro/v1' on every line.
- [ ] 3.2 Reasoning text capture inconsistent between providers. Extract in openai-deep + gemini-deep.
- [ ] 4.1 No ProviderAdapter interface (taste — defer)
- [ ] 4.3 Multimodal bifurcated between Vercel-SDK and Ollama-native paths (taste — defer)
- [ ] 5.1 Auto pricing update can't be disabled. Honor LLM_NO_AUTO_PRICING or --no-pricing-update.
- [ ] 5.2 Pricing auto-update has no sanity bounds. Reject >10x delta.
- [ ] 6.1 REFINEMENT_PROMPT orphaned — delete.
- [ ] 6.2 deepConsensus never invoked — delete or wire.
- [ ] 6.3 handleStreamDisconnect dead code — delete.
- [ ] 6.4 usage() uses 'as any' casts — type properly.
- [ ] 7.1 fire-and-forget doesn't write file immediately, contradicts invariant comment — update comment.
- [ ] 7.2 --deep pro 'topic' silently absorbs pro — error out.
- [ ] 7.3 --flag=value not supported — document or support.
- [ ] 7.4 runRecover error output missing responseId — add.

## Already fixed (in 415b43d)
- 2.4 minCompletionTokens naming — renamed to defaultMaxOutputTokens.

## Pro comparison pending
GPT-5.4 Pro deep review still running (resp_0aca91cbe719359a0069e6c063258c81909d691bd4b658bbef). Reconcile findings when it returns.