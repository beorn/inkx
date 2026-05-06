---
mentions:
  - km
  - claude
id: "@km/bearly/llm-registry-auto-update"
aliases:
  - km-bearly.llm-registry-auto-update
  - km-bearly-llm-registry-auto-update
created_by: claude:2405c72e
created_at: 2026-04-27T17:37:32Z
closed_at: 2026-04-27T18:08:59Z
close_reason: "Implemented two-stage pipeline: discovery side-effect on `bun llm
  update-pricing` writes ~/.cache/bearly-llm/new-models.json; `bun llm pro
  --discover-models [--apply]` runs gpt-5-nano classifier per candidate, prints
  markdown decision table, optionally writes /tmp/llm-new-models.patch (unified
  diff for human review — never auto-applies). Cost ~$0.02 per 30-candidate
  scan. 39 new tests. Wired into /sop packages domain. bearly main 911c87f."
started_at: 2026-04-27T17:51:05Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
---

# [x] Auto-discover new models from provider docs + LLM gating before adding to registry @km/bearly #feature #P2 @claude:2405c72e

## Why

Models ship constantly (GPT-5.5 announced 2026-04-23, gpt-5.4-pro lands, deprecated old gpt-4-32k disappears). The MODELS registry in vendor/bearly/plugins/llm/src/lib/types.ts is hand-maintained: new entries are added when the user happens to notice. Stale entries linger.

The existing pricing-update flow (\`performPricingUpdate\` in pricing.ts) already discovers new models — the recent \`bun llm pro --leaderboard\` output showed 31 new models including \`gpt-5.5-pro-2026-04-23\`, \`gpt-5-pro-2025-10-06\`, \`o4-mini-deep-research\`, etc., flagged with: "Add to MODELS in plugins/llm/src/lib/types.ts". But that's a manual TODO.

## Goal

Two-stage pipeline:

### Stage 1: Auto-discovery (already exists, broaden)

\`bun llm update-pricing\` already scrapes provider docs for pricing updates. Extend to also produce a \`new-models.json\` artifact listing newly-detected SKUs not in the registry, with:

- Provider
- ID (the API alias the provider uses)
- Pricing (input/output per M tokens)
- Capabilities heuristics (does the doc mention web_search, vision, deep_research, reasoning_effort?)
- Source URL

### Stage 2: LLM-gated promotion

\`bun llm pro --discover-models [--apply]\`:

- Reads new-models.json
- For each candidate, fires a cheap (\`gpt-5-nano\`) classifier prompt:
  > "Should this model be added to the @bearly/llm registry? Provider: X. Pricing: $Y/$Z per M. Doc snippet: ... Decide: yes / no / needs-review. Reason briefly."
- Outputs a markdown table for human review
- \`--apply\` writes a draft commit adding the approved entries to types.ts
- \`--apply\` does NOT auto-merge — produces a draft PR-shaped diff for the user to review

## Why LLM-gated and not auto-add

Provider docs lie. Some IDs are dated snapshots (\`gpt-5-pro-2025-10-06\`) that should map to existing aliases via apiModelId, not new SKUs. Some are deprecated. Some are private beta. Auto-adding would pollute the registry. The cheap classifier filters obvious noise; human reviews edge cases.

## Cost

Discovery: free (already runs in pricing-update).
Classifier: ~31 candidates × \$0.0005 (gpt-5-nano) = ~\$0.02 per scan.
Run weekly via cron / SOP / sop infra.

## Implementation hints

- Reuse pricing.ts scraper output
- Extend discovery scope to include capability hints (regex for "web search" / "vision" / "deep research" in provider doc text)
- Write classifier prompt with strict JSON output (winner-style)
- Output draft as a unified diff for \`git apply\`

## Acceptance

- \`bun llm update-pricing\` produces \`~/.cache/bearly-llm/new-models.json\` alongside pricing cache
- \`bun llm pro --discover-models\` runs classifier, outputs markdown table
- \`--apply\` writes a unified diff to stdout (or to \`/tmp/llm-new-models.patch\`)
- Tests cover: classifier prompt building, parsing classifier output, diff generation
- Documented in README and a \`/sop infra\` task

