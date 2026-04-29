---
id: "@km/tribe/activity-log"
aliases:
  - km-tribe.activity-log
  - km-tribe-activity-log
created_by: claude:b6ff8550
created_at: 2026-04-21T21:09:24Z
---

# [/] Unified tribe session-activity log — tail -f across DMs + recall injections + gate decisions @km/tribe #feature #P1 @claude:b6ff8550

blocks:: [[@km/tribe]]

# Unified tribe session-activity log

Single append-only JSONL log capturing every cross-session signal — tribe messages, recall hook injections, PreToolUse gate decisions. Designed for `tail -f`. Catches today's phantom-chief class of incident in real time.

## Why

Today (2026-04-21) during Bjorn's lunch: vault-2's transcript showed a phantom "chief here. lunchtime. you want a prep list..." message arriving as a user-role turn. vault-2 accepted via tribe DM. chief (this session) was about to reciprocate with a $200k-decision checklist.

Forensics required direct sqlite queries on tribe.db to discover the offer never travelled through tribe. Origin in vault-2's prompt stream still unconfirmed — probably LLM confabulation from the "chief joined" broadcast + recall fragments, but without a unified log we can't tell.

Invisibility is the primary failure. A tail -f-able activity log would have shown both the absence-of-chief-offer and the presence-of-vault-2-acceptance live, and Bjorn would have intervened before the chain propagated.

## Design

- Location: `~/.local/share/tribe/activity.jsonl` (co-located with tribe.db)
- Daily rotation: `activity-YYYY-MM-DD.jsonl`, keep 30 days
- One JSON event per line: `{ ts, source, kind, session, peer, preview, id }`
- Preview capped at 200 chars; full content looked up by id only

## Sources

1. **tribe-daemon** — every direct message, broadcast, session join/leave, rename (`source: "tribe"`, `kind: "dm" | "broadcast" | "session" | "rename"`)
2. **recall hooks** — every UserPromptSubmit injection (`source: "recall"`, `kind: "inject"`, preview = first 200 chars of additionalContext)
3. **injection-gate** — every PreToolUse verdict (`source: "gate"`, `kind: "allow" | "block"`, preview = reason)

## Tail interface

```
bun tribe watch --activity             # new: unified stream, colored per source
bun tribe watch --activity --since 1h  # time-scoped
tail -f ~/.local/share/tribe/activity.jsonl | jq .
```

## Acceptance

- [ ] Tribe daemon writes every message event to activity.jsonl on emit
- [ ] Recall hook (accountly + bearly paths) writes one line per UserPromptSubmit injection
- [ ] injection-gate writes one line per PreToolUse decision
- [ ] `bun tribe watch --activity` tails the unified log with per-source coloring
- [ ] Daily rotation at midnight, no event loss across rollover
- [ ] **Phantom-chief replay test**: re-ingesting today's incident must produce a log where vault-2's "accepted offer" DM is present AND the absence of a corresponding chief→vault-2 DM is discoverable from the log alone (not requiring tribe.db introspection)

## Relation to other beads

- Implements the infrastructure side of the observability-first-class rule (MEMORY.md line 21)
- Complements `km-tribe.bg-recall-daemon` — bg-recall hint emissions must also write to this log
- Complements `km-tribe.event-classification` — log captures everything; classification decides what surfaces to sessions
- Informs `km-all.fiduciary-verify-claim` — today's incident is the inciting case; activity log is the instrumentation that would have caught it

## Priority

P1. Today's incident was only caught because Bjorn happened to glance at vault-2's transcript. Without the log, the next phantom-offer chain during user absence runs to completion invisibly.