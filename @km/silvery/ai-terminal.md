---
mentions:
  - km
id: "@km/silvery/ai-terminal"
aliases:
  - km-silvery.ai-terminal
  - km-silvery-ai-terminal
created_by: claude:c56dc5d6
created_at: 2026-04-24T07:17:56Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.ai-terminal
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T00:18:21Z
    created_by: claude:c56dc5d6
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [ ] AI-era terminal — thesis parked until silvery is mature + wedge validated @km/silvery #epic #P3

blocks:: [[@km/silvery]]

## AI-era terminal — the thesis parked until silvery is mature

**Status**: PARKED. Not a product plan. Not a validated hypothesis. Not scheduled.

**Priority**: P3. Below quality-plateau (@km/all/plateau) and framework-platform work. Revisit when (a) silvery framework is quality-plateau-complete and (b) we have a validated wedge and market signal.

## The thesis (shortest form)

Silvery ships the building blocks for a new kind of terminal — a structured, multi-target, agent-friendly workspace that's not "a better shell" and not "a better tmux" but an **agent workstation** where:

- Activity is a tree of typed, searchable blocks (not an opaque byte stream)
- Every session is replayable, shareable, forkable
- Every CLI can be wrapped in a structured capability manifest (CAP) — commander routes intents, gates actions by policy, renders structured output
- Agents (Claude Code, Codex, etc.) integrate as first-class session participants in structured-output mode (JSONL tailing, hooks, statusline) — we don't replace them, we host them better
- Silvery's multi-target renderer means the same session renders identically in terminal, browser, and native app

This thesis is credible. The **current scope is not** — pro-review-2026-04-24 says so directly: "too wide, six product costumes in one thesis, collapse it."

## Why parked (not killed)

1. **Killer app validation first.** We need to know this solves a problem users have, with a wedge worth paying to cross. Haven't done that work.
2. **Framework maturity first.** Silvery has architectural debt (input boundary, theme shape, virtualization edge cases). Fix that before building products on top.
3. **Competitive window is shrinking but not shut.** 2025-2026 moved fast — Claude Code exposes headless/structured output, hooks, subagents, experimental agent teams; Codex has CLI/app/server/SDK/MCP; Warp has local/cloud agents; cmux launched Feb 2026 with socket API. Our combination is distinctive but "nobody else has this" is overstated now.
4. **This is also a dogfood vehicle.** See @km/silvery/ai-terminal/dogfood — using silvery to build an ai-terminal stress-tests every primitive we ship. That work can start sooner and feeds back into framework quality even before the product thesis is validated.

## Components of the thesis (all parked, sub-beads below)

- **Dogfood vehicle** — use silvery to build an interactive terminal + ai-repl; finds framework bugs before users do. Most actionable near-term.
- **Observability as first-class** — blocks are trace spans, sessions are trace roots. Feasibility unclear; loggily gives us plumbing.
- **Collaboration / shared sessions** — multi-human + multi-agent in one session, Figma-for-terminals, handoff, fly-on-the-wall mode. Most exciting idea in the set. Single-user must work first.
- **The one missing primitive** — `@silvery/pty`. Critical path if we ever commit; node-pty wrapper is the v0 answer.
- **Killer-app / business narrative** — compile later when there's a real product to pitch. Not yet.

## What informed this parking decision

- `hub/silvery/future/ai-terminal/*.md` — 2845 lines of ideation (8 layered design docs, /big lens, feasibility doc)
- `hub/silvery/future/ai-terminal/pro-review-2026-04-24.md` — GPT-5.4 Pro review with P0-P3 concerns. Headline: "the thesis is credible, the current scope is not, the minimum proof should be an agent workstation, not a public protocol and not a login-shell replacement"
- This bead consolidates and supersedes the hub docs — hub content can be archived or deleted once these beads are complete. Provenance of original five P4 beads: @km/silvery/agent-harness, @km/silvery/multiplex, @km/silvery/shell, @km/silvery/commander-protocol, @km/silvery/sessions (all closed 2026-04-23 pointing to hub docs; now superseded by this tree)

## Key constraint if/when we come back

Collapse to one product, not six. Pro's explicit recommendation: minimum proof = local-first **agent workstation** that hosts existing coding agents in structured mode, normalizes activity into one session/event model, replays + searches everything, gates risky actions. NOT a protocol launch, NOT a login-shell replacement, NOT a public CAP registry on day 1.

## Acceptance for un-parking

Before moving any sub-bead from P3/P4 to P0/P1:

- [ ] `km-all.plateau` + framework-platform epics substantially complete (no acute silvery architectural bugs)
- [ ] Validated wedge: a user segment with a pain we can measurably reduce
- [ ] Daily-driver dogfood: we use the ai-terminal ourselves for weeks before pitching it to anyone
- [ ] Pricing/distribution story, even rough

