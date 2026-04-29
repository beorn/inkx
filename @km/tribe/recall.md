---
id: "@km/tribe/recall"
aliases:
  - km-tribe.recall
  - km-tribe-recall
created_by: claude:4de4a3ab
created_at: 2026-04-27T23:10:29Z
---

# [ ] Recall: four-tier memory architecture (lookup / inject / thought / dream) @km/tribe #epic #P1

blocks:: [[@km/tribe]]

# Recall — four-tier memory architecture

Umbrella tracking bead for the recall system that serves silvercode (and any other ACP-host) via the bearly tribe MCP.

The biological framing — each tier maps to a real cognitive mode:

- **Tier 1 — mem lookup** (@km/tribe/recall-lookup) — active recall. Agent calls tribe.ask MCP tool when it knows it doesn't know. ✅ ships.
- **Tier 2 — mem inject** (@km/tribe/recall-inject) — priming. UserPromptSubmit hook auto-injects on prompt. ⚠️ ships with known issues; rebuild deferred.
- **Tier 3 — mem thought** (@km/tribe/recall-thought) — reflection / mind-wandering. Long-running sub-agent with compiled knowledge that emits deltas as events arrive. ❌ primary work for this epic.
- **Tier 4 — mem dream** (@km/tribe/recall-dream) — offline consolidation. Nightly batch reorganizes corpus. ❌ separate sub-bead.

State (2026-04-27):

- Tier 1 ships as tribe.ask / tribe.brief / tribe.plan MCP tools (vendor/bearly/plugins/tribe). Optional polish only.
- Tier 2 ships as UserPromptSubmit recall hook with documented issues (cache-hostility, redundancy, latency). Rebuild deferred.
- Tier 3 doesn't exist — primary work for this epic. Final design = persistent in-session sub-agent (claude-haiku-4-5, prompt-cached) reactive to all session events, maintains compiled-knowledge state, emits deltas to foreground.
- Tier 4 doesn't exist — separate sub-bead pending Tier 3 dogfooding.

## Design docs

- hub/tribe/design/recall-architecture.md — four-tier overview
- hub/tribe/design/recall-prior-art.md — ChatGPT/Mem0/Letta/Cursor/Aider/Self-RAG/Reflexion survey
- hub/tribe/design/recall-thought.md — full Tier 3 design with iteration history
- hub/tribe/design/recall-pro-review-architecture-{1,2}.md — initial /pro reviews
- hub/tribe/design/recall-pro-review-thought.md — Tier 3 specific /pro review

## Roadmap

| Phase | Tier | Scope | Status |
|-------|------|-------|--------|
| 1 | Tier 3 v1 | Sub-agent skeleton + recall_search tool + delta/full emit | Ready to implement |
| 2 | Tier 3 v2 | qmd_query as second substrate | Deferred |
| 3 | Tier 1 polish | Improve tribe.ask MCP tool descriptions | P3 follow-up |
| 4 | Tier 4 mem dream | Offline atomic-fact extraction + dedup + status reconciliation | Pending Tier 3 data |
| 5 | Tier 2 v2 | Rebuild UserPromptSubmit hook with skip-on-no-salience + outcome-aware ranking | Pending Tier 3 data |