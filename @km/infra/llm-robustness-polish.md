---
id: "@km/infra/llm-robustness-polish"
aliases:
  - km-infra.llm-robustness-polish
  - km-infra-llm-robustness-polish
created_by: claude:0590a583
created_at: 2026-04-21T01:18:52Z
closed_at: 2026-04-21T03:04:58Z
close_reason: "Landed in bearly@e0702ae + km@6a2ab98b. 12 regression tests pass
  in 293ms (cli-single-fire, dual-pro-failure-modes, recovery-routing, cli-argv,
  pricing-sanity — all covering the K2.6+Pro review fixes). DRY wins:
  openai-deep −88 LOC (resumeStream deleted, fake-streaming collapsed),
  getProviderEnvVar deduplicated, consensus totalCost unified through
  format.totalResponseCost. Robustness: SIGINT/SIGTERM bound to runProDual
  AbortController. Deferred as documented in the bead: full SIGINT across
  runDeep/runDebate, partial-recovery ladder unification, let outputFile →
  main() local, types.ts 830-line concern split, Anthropic/o-series reasoning
  plumbing. Test agent hit rate limit mid-session and left a deliberate
  regression in dispatch.ts (cacheCurrentPricing on pricing failure); caught +
  reverted before commit. Net source LOC DOWN; test LOC UP from 52 → 777."
owner: bjorn@stabell.org
assignee: claude:0590a583
dependencies:
  - issue_id: km-infra.llm-robustness-polish
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T18:19:12Z
    created_by: claude:0590a583
    metadata: "{}"
---

# [x] @bearly/llm robustness, DRY, and elegance polish @km/infra #task #P1 @claude:0590a583

blocks:: [[@km/infra]]

Single session to close the deterministic quality gap on @bearly/llm after the K2.6 + GPT-5.4 Pro review cycle (@km/infra/llm-review-fixes). The code is ~75% to plateau; this bead is the remaining investment before we drop into usage-bound discovery.

Rationale: two strong reviews caught 22+ items. The dollar-costly lesson (Apr 17–20 double-fire billing regression, ~$10-30 wasted) had zero regression test. Every fix we just landed is one copy-paste regression away from recurring. Locking them in with tests is the single highest-ROI remaining investment.

## Robustness — regression tests (highest ROI, ~200 LOC)

Add a smoke/integration test suite at vendor/bearly/plugins/llm/tests/:

- [ ] **Single-fire invariant**: stub all provider SDKs, invoke main() once, assert exactly one output file + one A/B log line + one stderr header. This is the test the double-fire bug would have failed.
- [ ] **Dual-pro empty-content normalization**: mock one leg to return content='', assert the run reports that leg as failed in progress line AND combined report AND JSONL (today matches; test prevents regression).
- [ ] **Dual-pro both-fail exit code**: mock both legs to fail, assert process.exit(1).
- [ ] **Gemini recovery routing**: write a partial with modelId='gemini-*' + responseId, call pollResponseToCompletion, assert pollForGeminiCompletion was invoked and retrieveResponse (OpenAI) was NOT.
- [ ] **Non-TTY hang guard**: with a closed stdin pipe, confirmOrExit without -y exits fast with clear message (not hang).
- [ ] **VALUE_FLAGS extraction**: invoke with --image foo.png '…', assert 'foo.png' does NOT appear in the prompt extractText sees.
- [ ] **getArg --name=value**: invoke with --model=gpt-5.4 and --model gpt-5.4, assert both resolve identically.
- [ ] **Pricing sanity bounds**: feed an LLM response with 100× price delta, assert MODELS registry is unchanged and warning is logged.
- [ ] **Arbitrary OpenRouter IDs**: --model owner/model-name, assert Model synthesized with provider=openrouter when key is set.

## Robustness — CLI abort wiring

- [ ] **SIGINT/SIGTERM propagation**: create an AbortController at runCli() top, wire signals to abort(), thread abortSignal through ask()/research()/consensus()/runProDual() (runProDual already has its own 5-min timeout — signal-driven abort composes with that). Today Ctrl-C during a long Pro call leaves the provider request hanging server-side.

## DRY / elegance

- [ ] **Unify partial-recovery logic**: checkAndRecoverPartials and runRecover each have their own 'if completed / if failed / if in_progress' ladder. Extract a shared handleRecoveryResult(partial, result) helper. Removes ~40 LOC of near-duplicate code and makes the Gemini routing fix apply to both paths in one place instead of two.
- [ ] **Consolidate getProviderEnvVar**: currently duplicated in providers.ts and types.ts with identical bodies. Export from providers.ts and import in types.ts (requires breaking a circular import carefully — may need a shared env-map constant in a leaf module).
- [ ] **Unify cost aggregation**: format.ts totalResponseCost and consensus.ts totalCost do the same math. Move to a single helper.
- [ ] **Remove openai-deep legacy scaffolding**: handleStreamingResponse + resumeStream still exist but don't really stream anymore (background-create + poll path is the only real flow). Collapse to a single createAndPoll() path.
- [ ] **let outputFile → local state**: push from module-scope into main(), thread through dispatch options. Completes the 1.2 cleanup we only half-did.
- [ ] **types.ts concern split** (Pro's 6.1): 830 lines mixing schemas + MODELS catalog + selection policy + pricing + prompt templates. Split into schemas.ts / catalog/index.ts (re-exports per-provider catalogs) / selection.ts. Keep the file count small — 3-4 files, not 10.

## Elegance — defer to YAGNI (do NOT do in this bead)

These came up in the review but don't have a forcing function today. Revisit when triggered:

- ProviderAdapter registry (Pro's 4.1): defer until the 2nd non-OpenAI-compatible provider actually lands. Premature now — we'd design for provider shapes we haven't seen.
- Multimodal input normalization (Pro's 4.3): only bifurcates across Vercel-SDK vs Ollama native today. Revisit when a third multimodal path (local MLX, Gemini vision inline, etc.) gets added.
- Per-mode hard budgets (Pro's 5.4): the three cost tripwires we already have (confirm gate on pro/debate/deep, LLM_NO_AUTO_PRICING, pricing sanity bounds) cover the known-bad cases. Absolute caps are a belt-and-suspenders improvement; add when a real overrun incident demands it.
- Anthropic thinking / OpenAI reasoning_effort plumbing: schema slots already exist in Model.reasoning. Implement when an actual o-series / thinking-enabled Claude model is added to MODELS.

## Done criteria

- [ ] Tests above all pass against current code.
- [ ] A DELIBERATE regression that reintroduces the double-fire pattern OR the Gemini-routing bug OR the --image leak FAILS the suite.
- [ ] bun run typecheck clean.
- [ ] bun fix clean.
- [ ] Smoke 'bun llm pro' one-liner with -y, verify one output + one A/B log line.
- [ ] Net LOC lower than today (DRY is real, not theatre).

## Scope boundary

One session. If the tests start sprawling, trim — focus on the regressions we've actually seen, not speculative coverage. The review-deferred 'taste' items (above) stay deferred.