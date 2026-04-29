---
id: "@km/tribe/recall-dream"
aliases:
  - km-tribe.recall-dream
  - km-tribe-recall-dream
created_by: claude:4de4a3ab
created_at: 2026-04-27T23:06:11Z
---

# [ ] Mem dream: offline corpus consolidation (atomic facts, dedup, conflict resolution, generalization) @km/tribe #feature #P3

blocks:: [[@km/tribe/recall]]

# Tier 4 — mem dream

Offline batch consolidation. Runs while the agent isn't (nightly cron, on-demand CLI, or post-session). Reorganizes the corpus so Tiers 1–3 query against a cleaner store.

See hub/silvercode/design/recall-trigger-design.md "Tier 4 — mem dream" section for full design. Land after Tier 3 (@km/tribe/recall-thought) is dogfooded and we have data on what the corpus actually needs.

## What it does

- Atomic-fact extraction (Mem0-style)
- Embedding-based deduplication
- Conflict resolution between contradicting facts
- Generalization across N≥3 facts sharing a pattern
- Bead status reconciliation (OPEN beads with shipped evidence, CLOSED beads later reopened, etc.)

## Cost & cadence

- ~30–60 min wall-clock per nightly run
- ~$1–5 per run (haiku for extraction, sonnet for reconciliation)
- ~$30/month at daily cadence

## Acceptance

- bun mem dream CLI works (or scheduled cron alternative)
- Atomic-fact store schema defined and populated
- Tiers 1–3 query both raw chunks AND atomic facts
- Reconciliation report surfaces in next session as ONE ambient event

## Defer reasoning

Mem-dream is a maintenance pipeline, not a trigger. Different shape, different infra, different stakes. Land mem-thought (Tier 3) first; let it run for weeks; then design mem-dream based on what the corpus actually looks like.