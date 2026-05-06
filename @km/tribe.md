---
mentions:
  - km
id: "@km/tribe"
aliases:
  - km-tribe
  - "@km/_orphan/tribe"
created_by: claude:19080504
created_at: 2026-03-26T17:05:43Z
owner: bjorn@stabell.org
---

# [ ] Tribe: cross-session coordination system @km/tribe #epic #P2

All tribe coordination work — MCP server, plugins, CLI, daemon, recall integration, observability. Tribe is the cross-session coordination layer: multiple Claude Code sessions joined to a single daemon, exchanging DMs, broadcasts, and recall-driven hints.

## Now — fix/improve recall + observability (P1)

Today's phantom-chief incident (2026-04-21, during Bjorn's lunch) exposed that cross-session coordination can run invisibly: no single log captures tribe messages + recall hook injections + gate decisions together. Two Claude sessions coordinated on a $200k wire decision without user involvement, and reconstruction required direct sqlite queries.

| Priority | Bead                          | What                                                                                                                        |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| P1       | km-tribe.recall-quality-gate  | Reject corrupted/decayed/stuck-loop recall docs at index + query time; one-shot purge of existing bad docs                  |
| P1       | km-tribe.activity-log         | Unified JSONL log for tribe DMs + recall injections + gate decisions. tail -f-able. Catches phantom-offer chains live.      |
| P2       | km-tribe.bg-recall-daemon     | Async just-in-time recall daemon, observability-first-class per MEMORY.md line 21. Blocked by km-tribe.recall-quality-gate. |
| P2       | km-tribe.event-classification | Actionable-vs-ambient delivery filter for events (stops ambient broadcasts from looking like requests)                      |

**Ship order**: quality-gate → activity-log (parallel) → bg-recall-daemon → event-classification. Quality-gate first because bg-recall depends on it; activity-log is independent infrastructure that catches incidents regardless.

## Later — correctness, identity, extensibility

| Priority | Bead                      | What                                                                         |
| -------- | ------------------------- | ---------------------------------------------------------------------------- |
| P3       | km-tribe.session-identity | Stable session identity across Claude Code restarts (currently tied to PID)  |
| P3       | km-tribe.plugin-v2        | TribePlugin v2: pipe() composition + provides/requires (SlateJS/TEA pattern) |
| P2       | km-tribe.testing          | Simulated multi-session test harness with fake resources                     |
| P4       | km-tribe.hub              | Phase 4: bridge tribe with km agent system                                   |
| P4       | km-tribe.watcher-bridge   | Forward km watcher events to tribe broadcast                                 |

## Cross-scope sibling

`km-all.fiduciary-verify-claim` (P2 feature, cross-cutting) tracks the behavioral side of today's incident — verify_claim tool, quote-then-paraphrase default, high-stakes mode, autonomous-coordination-during-absence failure pattern. Activity-log is the infrastructure; fiduciary-verify-claim is the discipline.

## Related closed work (context)

29 previously completed beads under this epic established the current tribe architecture: single daemon per machine, dotted namespace (tribe.*), stable session identity by ID, event bus with journal, message durability across daemon restarts, broadcast loopback filter, plugin extraction, delivery correctness, plateau refactor. See `bd show km-tribe` for full child list.

## Design rules (permanent — MEMORY.md)

- **Observability is first-class** (feedback-observability-first-class.md): any hook/daemon/background process needs debug-log env var + status command + why-this-decision explainability from v1, not bolted on later. Template: `INJECTION_DEBUG_LOG=/tmp/injection.log` + `tail -f | jq .`.
- **Silence default during user absence** (from today's incident): coordinator roles during user absence should be *less* proactive, not more. No advisory-work initiation on finance/legal/medical topics without user present.

