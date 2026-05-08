---
mentions:
  - km
id: "@km/all/plateau"
aliases:
  - km-all.plateau
  - km-all-plateau
created_by: claude:8b5b9e1c
created_at: 2026-04-21T05:22:59Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.plateau
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-20T22:23:18Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Quality Plateau — full-stack roadmap to architectural completeness @km/all #epic #P1 ^plateau

blocks:: [[@km/all]]

Consolidated roadmap to quality plateau across km. This epic tracks the strategic arc from the current ~82% plateau (post 2026-04-20 scroll + rendering push) to 95%+ where the whole system is architecturally closed.

## Current plateau scores by subsystem (2026-04-20 baseline)

| Subsystem               | % Plateau | Status                                                         |
| ----------------------- | --------- | -------------------------------------------------------------- |
| Scroll / virtualization | ~95%      | INV-5 fuzz, read-don't-walk, phantom-▼1 fix, bootstrap cleanup |
| Rendering pipeline      | ~95%      | Geometry hit-test for absolute, 16ms resize coalesce           |
| Test infra              | ~90%      | Termless disposal via using, WeakRef leak detector             |
| @km/tui (cards/columns) | ~90%      | Column primitive unified, zoom iterative DFS                   |
| Selection / Focus       | ~60%      | P0 epic @km/silvery/selection-focus-plateau explicitly exists  |
| TEA / apply-chain       | ~55%      | P0 epics @km/silvery/tea, @km/tui/tea, @km/all/tea-discuss     |
| Storage                 | ~50%      | P1 @km/storage/vault-node-explosion (549K nodes)               |
| Startup perf            | ~40%      | P2 @km/tui/cold-startup-block (17s event-loop block)           |

Weighted overall: ~82% → target 95%+.

## Plateau criteria per subsystem (formalization)

For a subsystem to be "at plateau", it must satisfy:

1. **Invariants coverage** — runtime STRICT-mode invariants for every action (e.g. INV-1..5 for scroll)
2. **Property fuzz verification** — fast-check or equivalent across parameter space (cols × rows × data shape)
3. **Regression tests** — every fixed bug has a test that would catch its return
4. **No workaround sites** — grep should find zero "workaround", "TODO", "HACK" comments without tracking beads
5. **Single source of truth** — no parallel derivation of the same quantity (see docs/principles.md No-Parallel-Derivation)
6. **Documentation currency** — public docs describe current state, not plans; no stale API references
7. **Deprecation cleanup** — every @deprecated has a deletion plan in a bead
8. **Industry prior-art review** — for foundational features, 3-5 implementations studied before coding

## Strategic work streams

### Stream A: Selection/Focus plateau (links @km/silvery/selection-focus-plateau, @km/silvery/focus-ink-parity)

- Apply INV-style fuzz to selection actions
- STRICT-mode invariants for selection validity
- Unified focus-scope model
- Eliminate seam fragility between focus + selection + navigation

### Stream B: TEA migration (links @km/silvery/tea, @km/tui/tea, @km/all/tea-discuss)

- Unify (action, state) → [state, effects] across subsystems
- Replace imperative handlers with dispatch/apply chain
- Plugin composition via apply-chain substrate
- Enables serializable replay, time-travel debugging, portability (TUI + web)

### Stream C: Storage plateau (links @km/storage/vault-node-explosion, @km/storage/link-model-canonical)

- Diagnose 549K nodes in real vault (schema vs event-sourcing vs CRDT)
- Decide CRDT direction — defer or commit
- Event-sourcing-lite as CRDT-compatible foundation

### Stream D: Performance plateau (links @km/tui/cold-startup-block)

- Phase-attributed startup profiling
- 17s event-loop block → <2s target
- SILVERY_INSTRUMENT coverage per major code path

### Stream E: Cross-cutting plateau hygiene

- @deprecated sweep (~10 annotations in silvery without deletion plans)
- Old-API elimination in tests (@km/all/test-system/plateau-enforcement P1)
- Doc audit: current state only, no plans/narrative

## Sequencing — operational plan (2026-05-06)

The current operational view of "what to do, in what order" lives in **[[@km/BACKLOG]]** as a phased queue with planning notes. Reproduced here as the authoritative cross-track sequence:

### Phase 0 — In flight (don't disturb)

- `@km/infra/test-system` (wip Bjørn) — feat/test-system branch rebase + merge
- `@km/bearly/injection-framing` (wip claude:6552f1e9) — unblocker for Phase 4 ambient track

### Phase 1 — Silvercode runtime defense (stops bug recurrence)

- `@km/silvercode/session-store-trace` — Phase A: ship the status logger first
- `@km/silvercode/queue-stuck-thinking-l4` — Phase B: Turn owner module + derived status

### Phase 2 — Silvery foundation (parallel-safe)

- `@km/silvery/focus-ink-parity` — unify two parallel focus systems
- `@km/silvery/custom-protocol-implementation-review` — protocol audit (finite scope)
- `@km/silvery/authoring-elegance` — framework-adoption bar (≤50 LOC plugins)

### Phase 3 — TEA migration (sequential)

- `@km/silvery/tea` — Phases 2-4; depends on `@km/silvery/tea-useinput` (P1) unblocker
- `@km/tui/tea` — domain-plugin migration; downstream of silvery/tea Phase 4

### Phase 4 — Silvercode UX completeness

- `@km/silvercode/ambient-context-excellence` — depends on Phase 0 injection-framing
- `@km/silvercode/claude-code-transcript-parity/canonical-agent-plan-model`
- `@km/silvercode/claude-code-transcript-parity/chat-turn-projection-refactor`
- `@km/silvercode/claude-code-transcript-parity/markdown-table-render` — depends on `@km/silvercode/text-render-package` (P1)

### Phase 5 — Plateau closure

- `@km/tui/detail-unify-real` — `[!]` blocked by `@km/silvery/surface-freeze`; unblocks when omnibox + selection plateau close
- This bead (`@km/all/plateau`) closes when the children do

### Side track (not phased)

- `@km/all/shared-substrate-review` — overdue decision (was 2026-05-05); decide-or-close

This sequencing supersedes the earlier "Stream A → B → C → D → E" framing — those streams are still real architectural threads, but the BACKLOG-style phased plan is what we work from day-to-day.

## Success metrics

- All 8 criteria above pass for each subsystem
- Overall weighted plateau score ≥ 95%
- Regression rate (new bugs per week) trending to zero
- Bead close velocity > create velocity (backlog shrinks)

## Related

- Captures the /big analysis from session 2026-04-20 after scroll + rendering push
- Coordinates with but does NOT replace existing P0 epics — this epic links them into a single strategic narrative

