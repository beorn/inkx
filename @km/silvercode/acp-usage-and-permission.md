---
id: "@km/silvercode/acp-usage-and-permission"
aliases:
  - km-silvercode.acp-usage-and-permission
  - km-silvercode-acp-usage-and-permission
created_by: claude:cd034ca4
created_at: 2026-04-26T15:37:40Z
closed_at: 2026-04-26T21:34:19Z
close_reason: Closed
---

# [x] silvercode <UsageUpdate> meter + extended <RequestPermission> structured Q&A @km/silvercode #feature #P1 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvery/animation-counters]], [[@km/silvery/diff-code-accordion]]

Two ACP-adjacent surfaces in one bead: token/cost meter (UsageUpdate) and structured mid-turn Q&A (extension on RequestPermission).

## Part A — UsageUpdate (ACP-aligned)
Maps directly to ACP `SessionUpdate.usage_update`:
- `<UsageMeter>` — used/total context bar
- `<UsageBreakdown>` — popover with per-message/tool/system token attribution
- `<UsageMetrics>` — inline cost/latency chip

## Part B — Structured RequestPermission (silvercode extension)
Today `PermissionInbox.tsx` (93 LOC) handles binary allow/deny. This extends the same `RequestPermission` flow with structured input:
- `<RequestPermissionInbox>` — renamed from `PermissionInbox`
- `<StructuredQuestion>` — silvercode extension for free-text/multi-choice mid-turn questions
- `<StructuredAnswer>` — the user's answer rendered back inline

## Estimated LOC: ~1000-1500

## Deps
- @km/silvery/animation-counters (`<AnimatedNumber>` for token roll)
- @km/silvery/diff-code-accordion (`<Accordion>` for breakdown)