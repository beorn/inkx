---
mentions:
  - km
  - claude
id: "@km/bearly/llm-registry-split"
aliases:
  - km-bearly.llm-registry-split
  - km-bearly-llm-registry-split
created_by: claude:2405c72e
created_at: 2026-04-27T06:58:03Z
closed_at: 2026-04-27T07:32:54Z
close_reason: >-
  Split Model registry → SkuConfig + ProviderEndpoint + capabilities. Routing
  now driven by endpoint.capabilities (webSearch, backgroundApi, vision,
  deepResearch) instead of provider name comparisons.


  km commit:    89043f7037770dafb8c0c741e49c780f9bc972f2

  bearly commit: f4b5d67546e0bfa00b93aba63c69e04299aa7c37


  Acceptance evidence:

    $ grep -n 'model.provider === "openai"' vendor/bearly/plugins/llm/src/lib/
    research.ts:222: Vercel AI SDK providerOptions namespace key (literal API parameter naming, not dispatch routing)
    research.ts:487: comment line referencing the prior pattern
    -> 0 dispatch/routing hits.

    $ grep -nE 'model\.(input|output)PricePerM\s*=' vendor/bearly/plugins/llm/src/
    -> 0 matches (zero in-place mutations of pricing).

    $ grep -n 'isOpenAIBackgroundCapable' vendor/bearly/plugins/llm/src/lib/
    -> Capability-driven: getEndpoint(model.modelId)?.capabilities.backgroundApi.

    $ bun vitest run --project vendor vendor/bearly/plugins/llm/
    Test Files  9 passed (9)
    Tests  44 passed (44)

    $ cd vendor/bearly && bun run typecheck   (llm-only, ignoring missing optional deps)
    -> 0 new errors

    Smoke: bun llm "ping" --model gpt-5-nano  → reaches OpenAI API (returns insufficient_quota — code path correct, billing issue unrelated).

  Refactor highlights:

    - SKUS (readonly SkuConfig[]) — frozen identity table.
    - PROVIDER_ENDPOINTS (Readonly<Record<string, ProviderEndpoint>>) — { provider, apiModelId?, capabilities }.
    - Legacy MODELS preserved as flattened SKU+endpoint facade with getter-backed pricing properties (consult runtime overlay; no mutation).
    - Pricing: performPricingUpdate now writes a snapshot via buildPricingSnapshot/savePricingCache, then refreshes the runtime overlay via applyCachedPricing (no in-place mutation of MODELS).
    - Synthetic OpenRouter SKUs require --force; mint with costTier "very-high" + "[unverified]" displayName so requiresConfirmation always fires and the unknown is explicit.
    - getLanguageModel + responses.create call sites resolve API id via endpoint.apiModelId ?? legacy field ?? modelId.

  Tests updated:
    - tests/pro-fire-and-forget.test.ts: corrected expectation for createArgs.model (gpt-5-pro, not gpt-5.4-pro — reflects the apiModelId resolution that was already in the code but untested).
    - tests/cli-argv.test.ts: synthetic OpenRouter test now uses --force; added a no-force-→-error case.

  Adding a new SKU = single SkuConfig entry + single ProviderEndpoint entry.

  Adding a new provider = new file in providers.ts pattern + endpoint entries;
  no edits to research.ts/dispatch.ts routing.


  Out of scope (separate beads): /pro and /deep skill updates, --json flag,
  dispatch.ts shatter, dual-pro shadow-test.
started_at: 2026-04-27T07:12:06Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-bearly.llm-registry-split
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-26T23:58:21Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [x] Split llm Model registry: SKUs + ProviderEndpoints + capabilities @km/bearly #feature #P1 @claude:2405c72e

blocks:: [[@km/bearly]]

## Problem

The Model schema in `vendor/bearly/plugins/llm/src/lib/types.ts` is a god-type
mixing three concerns: (a) user-facing SKU name (modelId like "gpt-5.4-pro"),
(b) provider API contract (apiModelId added today, like "gpt-5-pro"), and
(c) runtime classification (isDeepResearch, costTier, pricing, latency).

`MODELS` is also mutable global state — `performPricingUpdate` writes
`model.inputPricePerM = u.inputPricePerM` in place (dispatch.ts:176), which
changes behavior of later calls in the same process and makes the registry
impossible to snapshot for tests.

Today's `apiModelId` patch (vendor/bearly a6c645c) papered over symptom 1
without fixing the underlying SKU/API conflation.

Discovered via /pro review of the llm tool (Kimi K2.6, 2026-04-26):
findings 1.1, 1.2, 1.3, 1.5.

## Goal

Split the registry into two frozen tables:

```ts
// SKUs — user-facing, stable identity, pricing, latency, classification
const SKUS: readonly SkuConfig[] = [
  { id: "gpt-5.4-pro", displayName: "GPT-5.4 Pro", costTier: "very-high",
    inputPricePerM: 25, outputPricePerM: 200, ... },
  ...
]

// Provider endpoints — how each SKU is dispatched, and what it can do
const PROVIDER_ENDPOINTS: Record<string, ProviderEndpoint> = {
  "gpt-5.4-pro": {
    provider: "openai",
    apiModelId: "gpt-5-pro",
    capabilities: { webSearch: true, backgroundApi: true, vision: true },
  },
  ...
}
```

`getModel(id)` resolves the SKU. `getLanguageModel(sku)` looks up the endpoint.

## Routing changes

- `research.ts:95` (`if (model.provider === "openai")`) → route by
  `endpoint.capabilities.webSearch`
- `openai-deep.ts:240` (`isOpenAIBackgroundCapable`) → route by
  `endpoint.capabilities.backgroundApi`
- Provider name comparisons disappear

## Pricing

- `MODELS` becomes `readonly`. No in-place mutation.
- Pricing-update writes a JSON cache (`~/.cache/bearly-llm/pricing.json`).
- Cache loaded once at process start, merged with frozen SKU defaults.
- `performPricingUpdate` returns a snapshot the caller can write; it does
  NOT mutate the registry.

## Synthetic OpenRouter models

Today, IDs containing slashes are minted on the fly with costTier "medium"
and unknown pricing (cli.ts:156-185). This defeats requiresConfirmation
and cost estimation.

Fix: if a slash-ID is not in the registry, look up via `listModels()` at
runtime, or require `--force` flag. Don't silently mint untyped entries.

## Acceptance

- ModelSchema split into SkuSchema + ProviderEndpointSchema
- MODELS readonly; performPricingUpdate writes to cache, not in-place
- Capability-based routing in research.ts and openai-deep.ts
- apiModelId field deprecated (lookup via endpoint instead)
- All existing CLI invocations still work (no public-API regression)
- Adding a new SKU is a one-line entry in SKUS + one entry in PROVIDER_ENDPOINTS
- Adding a new provider doesn't require editing dispatch.ts

## Reference

Review at /tmp/llm-2405c72e-adversarial-review-of-the-292y.txt

