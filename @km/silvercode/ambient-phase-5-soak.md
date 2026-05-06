---
mentions:
  - km
id: "@km/silvercode/ambient-phase-5-soak"
aliases:
  - km-silvercode.ambient-phase-5-soak
  - km-silvercode-ambient-phase-5-soak
created_by: claude:4de4a3ab
created_at: 2026-04-27T21:21:01Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.ambient-phase-5-soak
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T14:21:20Z
    created_by: claude:4de4a3ab
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode.ambient-context-excellence
---

# [ ] Phase 5 — 7-day Anthropic-only soak for ambient context @km/silvercode #task #P1

blocks:: [[@km/silvercode/ambient-context-excellence]]

Operational plan: hub/silvercode/design/ambient-phase-5-soak.md.

7-day soak of re-enabled tribe + recall ambient injection, **Anthropic only** (Claude Code). Phase 4 multi-backend eval is deferred to AFTER soak passes — see §9 of the design doc for the explicit reordering rationale.

PRE-REQS (gates before T=0, see §8):

- Phase 6.b adapters live + dogfooded ≥48h.
- Phase 6.b breaker + telemetry verified flowing through silvercode:ambient:* loggily namespace.
- SILVERCODE_AMBIENT_DISABLED=1 kill-switch smoke-tested.
- Tribe broadcast announcing T=0 + soak channel for odd-behavior reports.

SUCCESS CRITERIA (all four for 7 consecutive days):

1. Zero role_prefix_hits across all developer sessions.
2. Telemetry pipeline stable — no breaker overload, no sanitize loop, no >1h observability blackout.
3. Production usage uninterrupted — kill-switch never flipped.
4. Subjective: ambient feels useful, not noisy.

CHECKPOINTS:

- Day 1 (T+24h): smoke + record baseline → $HOME/.silvercode/ambient-soak-baseline.json.
- Day 3 (T+72h): mid-soak review + pattern analysis vs baseline.
- Day 7 (T+168h): close-out retro → ship-stable / extend-soak / rollback decision.

ALARMS (see §3 of doc):

- P0: ≥1 role_prefix_hit in any 24h window — stop, investigate, consider rollback.
- P1: >100 dropped events/hour sustained ≥30min — breaker too tight or runaway source.
- P1: telemetry silent >1h — fix observability before continuing.
- P2: sanitize_actions >10× baseline sustained — investigate, not auto-rollback.

ROLLBACK MECHANISM (see §5):

- SILVERCODE_AMBIENT_DISABLED=1 short-circuits all adapters in registerAllAmbientAdapters; no restart, per-event check.

FOLLOW-UPS:

- @km/silvercode/ambient-soak-reporter — implement the §7 reporter spec (deferred to follow-up bead).

REFERENCES:

- Design: hub/silvercode/design/ambient-phase-5-soak.md
- Parent: hub/silvercode/design/ambient-context-safety.md §4 Phase 5.
- Phase 1 baseline: docs/ambient-thesis-proof-2026-04-27.md (Anthropic 0/300 on Variant B).
- Layer sources: apps/silvercode/src/ambient-sanitize.ts, apps/silvercode/src/transcript.ts.
- Layer 4 hook: ~/.claude/hooks/detect-role-prefix.sh.

