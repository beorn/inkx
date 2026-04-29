---
id: "@km/bearly/llm-quota-tracking"
aliases:
  - km-bearly.llm-quota-tracking
  - km-bearly-llm-quota-tracking
created_by: claude:2405c72e
created_at: 2026-04-27T14:44:35Z
closed_at: 2026-04-27T18:08:46Z
close_reason: "Implemented `bun llm quota` subcommand + `--quota` flag on
  existing commands. Two layers: one-shot snapshot (live OpenRouter
  /api/v1/auth/key + cached x-ratelimit headers fallback for Anthropic + 'no
  quota API' graceful for Google/xAI) and per-call envelope inclusion. Atomic
  cache at ~/.cache/bearly-llm/last-quota-by-provider.json. 26 new tests. Live
  verified: bun llm 'ping' --json --quota returns rate-limit envelope. bearly
  main 19f8640. Bumped 0.3.0 → 0.4.0."
---

# [x] Quota + balance tracking — surface remaining credit/rate-limit per provider after each call @km/bearly #feature #P1 @claude:2405c72e

blocks:: [[@km/bearly]]

## Problem

User just discovered \$700 of OpenAI spend this month with no in-tool surface for "how much do I have left" or "am I about to blow through the rate limit." Today the only signal is a hard \`insufficient_quota\` error AFTER the call fails. By that point we've already paid for everything that landed.

\`bun llm pro\` is especially expensive (single call ~\$5-15 with GPT-5.4 Pro + judge). A typical session can fire 5-20 of these. Knowing balance + month-to-date spend before the next call lets the user (and the agent) make cost-aware decisions.

## Goal

Two layers, both opt-in by default (don't fire extra HTTP per call):

### Layer 1: \`bun llm quota\` subcommand (one-shot, on-demand)

Hits each provider's quota/balance endpoint and prints a unified table:

\`\`\`
Provider         Balance / Used     Rate Limit         Last Used
---------------------------------------------------------------
OpenAI           \$300 / \$700/mo    50K TPM, 500 RPM   2026-04-27 07:43
OpenRouter       \$48 credit         100 RPM            2026-04-27 06:12
Anthropic        (header-only)      100K TPM           2026-04-27 02:30
Google Gemini    (no quota API)     -                  2026-04-27 01:14
xAI              (no quota API)     -                  -
\`\`\`

\`--json\` flag emits structured envelope.

### Layer 2: \`--quota\` flag on existing commands

When set, the JSON envelope includes the rate-limit headers from THE call you just made (not a separate HTTP):

\`\`\`json
{
  "model": "GPT-5.4 Pro",
  "cost": 4.85,
  "quota": {
    "remainingRequests": 487,
    "remainingTokens": 145000,
    "resetRequestsAt": "2026-04-27T08:00:00Z",
    "resetTokensAt": "2026-04-27T07:45:00Z"
  }
}
\`\`\`

Always emit when the response carries \`x-ratelimit-*\` headers; gate on a config flag if it bloats stdout for users who don't want it.

## Provider mapping

| Provider | Balance/spend | Rate-limit headers | Notes |
|---|---|---|---|
| OpenAI | \`GET /v1/organization/usage/completions\` (Admin key) or \`GET /dashboard/billing/usage\` (legacy) | \`x-ratelimit-{requests,tokens}-{remaining,limit,reset}\` | Highest-leverage — implement first |
| OpenRouter | \`GET /api/v1/auth/key\` returns \`{ data: { limit_remaining, ... } }\` | \`x-ratelimit-*\` | Has credits balance |
| Anthropic | No quota endpoint | \`anthropic-ratelimit-{requests,tokens}-{remaining,limit,reset}\` | Headers only |
| Google Gemini | No public quota API | None standardized | Skip or query Google Cloud quotas (out of scope) |
| xAI | No public quota API | TBD — investigate | |
| Perplexity | TBD | TBD | |
| Ollama | Local | None | Skip — infinite |

## Implementation hints

- Provider-strategy interface (related to deferred @km/bearly/llm-dispatch-shatter): each provider exposes \`getQuota(): Promise<QuotaSnapshot | null>\`.
- Capture rate-limit headers in the \`research.ts\` queryModel path; pipe through to the OutputMeta envelope.
- \`bun llm quota\` calls each \`getQuota()\` in parallel; \`null\` → "not supported" row.
- Persist last-fetched quota to \`~/.cache/bearly-llm/quota.json\` so calls without \`--quota\` can still show "last known" in the leaderboard / promote-review screens.

## Acceptance

- \`bun llm quota\` runs without crashing; prints table for at least OpenAI + OpenRouter
- \`bun llm quota --json\` emits structured envelope
- \`--quota\` flag on existing commands surfaces rate-limit headers in the JSON envelope
- Tests cover (a) header parsing, (b) graceful fallback when provider doesn't expose quota, (c) JSON envelope shape
- Documented in \`vendor/bearly/plugins/llm/README.md\`
- README mentions opt-in vs always-on policy

## Why P1

User's \$700/month spend without visibility = trust risk. This is the smallest meaningful feature that converts that into a managed signal. Should land before the next /pro-heavy session.

## Related

- @km/bearly/llm-registry-split — capabilities flag could include \`hasQuotaApi\` (later)
- @km/bearly/llm-dispatch-shatter — ProviderStrategy interface lands cleanly with \`getQuota()\` method