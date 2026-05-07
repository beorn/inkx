# Ambient Phase 5 — 7-Day Anthropic Soak Plan

**Purpose:** the operational plan for Phase 5 of the ambient-context re-introduction (see [`ambient-context-safety.md`](ambient-context-safety.md) §4). Phase 5 re-enables tribe + recall ambient injection in the user's daily flow on **Claude Code (Anthropic) only** for a 7-day soak with telemetry tracking. Phase 4 (multi-backend eval) is explicitly **deferred to after a clean soak** — see §9.

**Tracking:** [`km-silvercode.ambient-phase-5-soak`](bd-show:km-silvercode.ambient-phase-5-soak) (parent: `km-silvercode.ambient-context-excellence`).

**Pre-requisites in flight:** Phase 6.b (real source adapters + circuit breaker + telemetry) is being built in parallel. This doc is preparatory — soak begins at T=0 once all gates in §8 pass.

**Scope narrowing:** Anthropic only. Codex / Gemini / pi-acp / copilot / @km/claude-acp are out of scope until Anthropic soak passes. The original Phase 4 framing ("Anthropic first, then 6-backend roll-out") is reordered: **soak first, multi-backend last.** Rationale in §9.

---

## 1. Goal & success criteria

The soak passes when **all four** hold for 7 consecutive days (168 h):

1. **Zero `role_prefix_hits` across every developer session.** Layer 3 (`transcript.ts` `safeAppendAssistantTurn`) and Layer 4 (`~/.claude/hooks/detect-role-prefix.sh`) both report zero events. This is the load-bearing safety check — any single hit is a P0 alarm (see §3).
2. **Telemetry pipeline stable.** No breaker overload (sustained drop storms), no sanitize loop (runaway `sanitize_actions` with no upstream cause), no observability blackouts >1 h. The pipeline must be visible the whole soak.
3. **Production usage uninterrupted.** `SILVERCODE_AMBIENT_DISABLED` kill-switch never triggered (see §5). User's daily silvercode flow runs without manual intervention.
4. **Subjective: ambient feels useful, not noisy.** End-of-soak retro answers "would I keep ambient on by default?" with a yes. Captured at the Day-7 close-out (§6).

Sessions covered: Bjørn's daily silvercode runs and any developer agent session in the km worktree that uses silvercode as the host. No synthetic load — the soak measures real-use telemetry, not stress-test telemetry.

---

## 2. Telemetry queries for daily check-in

All telemetry flows through loggily under the `silvercode:ambient` namespace tree (Phase 6.b owns the schema; cross-reference once their work lands). Queries assume `LOGGILY_FILE_AMBIENT=$HOME/.silvercode/ambient.jsonl` is set in the soak shell (see §8 pre-soak checklist).

The canonical sub-namespaces (inferred from §3 Layer 4 of the safety doc; confirm against Phase 6.b once shipped):

- `silvercode:ambient:admit` — event accepted into the queue (per-source).
- `silvercode:ambient:drop` — breaker / rate-limit / size-bound rejected an event (per-source, with `reason`).
- `silvercode:ambient:sanitize` — Layer 2 `sanitize_actions` fired (per-source, with `actions: ["strip_ansi", "neutralize_role_prefix", "size_bound", "nfc_normalize"]`).
- `silvercode:ambient:role_prefix_hit` — Layer 3 (`transcript.ts`) or Layer 4 (`detect-role-prefix.sh` mirror) caught a role-prefix marker. **Any record here is a P0 alarm.**
- `silvercode:ambient:breaker` — per-source breaker state changes (`opened`, `half_open`, `closed`).

### Daily summary (run on Day 1, Day 3, Day 7)

Per-source admit/drop counts (last 24 h):

```bash
tail -n 100000 "$LOGGILY_FILE_AMBIENT" \
  | jq -c 'select((.namespace == "silvercode:ambient:admit" or .namespace == "silvercode:ambient:drop")
                  and (.ts | fromdateiso8601) > (now - 86400))' \
  | jq -s 'group_by(.source) | map({source: .[0].source,
                                    admitted: map(select(.namespace | endswith(":admit"))) | length,
                                    dropped:  map(select(.namespace | endswith(":drop")))  | length,
                                    drop_reasons: map(select(.namespace | endswith(":drop")) | .reason) | unique})'
```

Cumulative `role_prefix_hits` since soak T=0 (target: zero):

```bash
tail -n 100000 "$LOGGILY_FILE_AMBIENT" \
  | jq -c 'select(.namespace == "silvercode:ambient:role_prefix_hit"
                  and (.ts | fromdateiso8601) >= ($T0 | fromdateiso8601))' \
  | wc -l
```

`sanitize_actions` volume (informational — high volume is fine if upstream is noisy; the comparison is to the day-1 baseline):

```bash
tail -n 100000 "$LOGGILY_FILE_AMBIENT" \
  | jq -c 'select(.namespace == "silvercode:ambient:sanitize"
                  and (.ts | fromdateiso8601) > (now - 86400))' \
  | jq -s 'group_by(.source) | map({source: .[0].source,
                                    count: length,
                                    actions: map(.actions[]) | group_by(.) | map({action: .[0], n: length})})'
```

Breaker state transitions (last 24 h):

```bash
tail -n 100000 "$LOGGILY_FILE_AMBIENT" \
  | jq -c 'select(.namespace == "silvercode:ambient:breaker"
                  and (.ts | fromdateiso8601) > (now - 86400))'
```

### Day-1 (T+24h) baseline snapshot

Day 1 also records the **baseline** that Day 3 and Day 7 compare against:

- Per-source admit rate (events/hour, mean + p95).
- Per-source `sanitize_actions` rate.
- Total `drop` count and breakdown by `reason`.
- `role_prefix_hits` cumulative (must equal 0).

Persist the baseline as `$HOME/.silvercode/ambient-soak-baseline.json` so the Day 3 / Day 7 reporters (§7) have a reference point.

---

## 3. Alarm thresholds — when to escalate

The soak runs in observe-and-react mode. Alarms have an explicit severity and an explicit action.

| Severity | Trigger                                                                                                                   | Action                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | >= 1 role_prefix_hits in any 24 h window.                                                                                 | Stop the soak. Capture the offending JSONL turn (binary-blob, .recall-ignore it). Investigate before re-enabling. Strongly consider rollback (§4).                                                                               |
| P1       | > 100 dropped events/hour sustained for ≥ 30 min on any single source.                                                    | Either the breaker is too tight or the source is runaway. Inspect breaker records — if opened flapping, breaker is too tight; if a source is producing nonsense, fix at the source. Don't loosen the breaker without diagnosing. |
| P1       | Telemetry pipeline silent (silvercode:ambient:* records absent) for > 1 h while silvercode is otherwise running.          | Detection blind. Fix observability before the soak continues — tail -f $LOGGILY_FILE_AMBIENT should always show heartbeats or steady-state events. Check loggily writer wiring, file path, permissions.                          |
| P2       | sanitize_actions per source > 10× the Day-1 baseline rate, sustained for ≥ 6 h, with no proportional admit-rate increase. | Investigate. Either upstream content shape changed, or a new vector is showing up that the sanitizer is now neutralizing repeatedly. Not a rollback trigger by itself.                                                           |

Alarms surface via the §7 reporter. P0/P1 must be visible in the user's daily `tribe send` digest; P2 is captured for the Day-3/Day-7 review.

---

## 4. Rollback criteria — when to disable ambient

Rollback (= flip the kill-switch in §5) is mandatory if any of:

1. **Any `role_prefix_hit` whose forensic JSONL shows the autocatalytic loop is closing** — i.e. the assistant emitted a role-prefix marker AND the next turn's transcript builder ingested it as a synthetic user turn. This is the failure pattern from session `e8967322`. Check by jq-grepping the session JSONL for the marker bytes around the `role_prefix_hit` timestamp, then verifying that role-A → role-U boundary semantics held in the next turn.
2. **Sustained P1 alarm-state for `> 24 h` with no clear cause.** Either telemetry is broken (we're flying blind) or a source is hostile and we can't pin it. Disable, diagnose at leisure.
3. **User reports confused agent behavior** that, on transcript review, traces to an ambient event injection point. Subjective signal, but real — if the agent is acting on ambient as if it were user instruction, the framing failed and Layer 3 / 4 didn't catch it (because nothing emitted, the agent just *interpreted* it wrong). Rollback, file a Phase 6+ bead, fix the framing or the wire-shape.

A single isolated `role_prefix_hit` with no loop closure (Layer 3 quarantined the bytes, Layer 4 logged them, transcript builder did NOT re-ingest) is **not** an automatic rollback — it's a P0 investigation. Layer 3 doing its job is exactly what we shipped it for. The rollback bar is "the load-bearing safety layer failed," not "any layer fired."

---

## 5. Rollback mechanism

**Env flag:** `SILVERCODE_AMBIENT_DISABLED=1`

When set, `registerAllAmbientAdapters` short-circuits at the top of every adapter — tribe, recall, sub-agent, CI, telegram, file-watch, permission decisions all become no-ops. The controller checks this **per event**, not just at boot, so flipping the flag in a long-running session takes effect on the next event without restart.

Implementation contract for Phase 6.b (capture in their bead acceptance):

```typescript
// At the top of every register*Adapter() function:
if (process.env.SILVERCODE_AMBIENT_DISABLED === "1") {
  log.info("ambient-disabled-by-env", { source, env: "SILVERCODE_AMBIENT_DISABLED" })
  return // teardown is a no-op since nothing was registered.
}
```

User-facing message format when ambient is disabled (shown once per session, in the silvercode chrome where ambient events would otherwise render):

> Ambient context is disabled (SILVERCODE_AMBIENT_DISABLED=1). Tribe broadcasts, recall hits, sub-agent results, CI events, file-watch, and permission decisions will not be auto-delivered to the agent. Unset the env var to re-enable.

The kill-switch is reversible — unsetting the env var and starting a fresh silvercode session restores ambient delivery. No state migration, no breaker reset, no telemetry replay.

---

## 6. Checkpoint cadence

Three checkpoints during the soak. Each checkpoint produces a written note in the tracking bead and (for Day 1 / Day 7) a tribe broadcast.

### Day 1 (T+24h) — smoke + baseline

- Run the §2 daily summary queries.
- Confirm telemetry pipeline is alive (records flowing every hour; no >1 h gap).
- Confirm `role_prefix_hits == 0`.
- Eyeball per-source admit / drop ratios — if any source is dropping >50% of its admits, file a Phase 6.b bug.
- Persist baseline to `$HOME/.silvercode/ambient-soak-baseline.json`.
- `tribe send` summary: "Phase 5 soak Day 1: clean. role_prefix_hits=0, sources active=N, drops=X."
- Update bead `km-silvercode.ambient-phase-5-soak` with the Day-1 snapshot.

### Day 3 (T+72h) — mid-soak review + pattern analysis

- Run §2 queries.
- Compare against Day-1 baseline: per-source rates, sanitize-actions volume.
- Pattern check: are there recurring drops with the same `reason`? Same source dominating? Any breaker `opened` events that didn't `closed` cleanly?
- If any P1/P2 alarm fired during the first 72 h: write a short pattern note ("breaker on tribe opens ~once per hour because recall floods at every search; not load-bearing, monitor"). Don't file beads for fixable-later issues — capture them in the bead as a Day-3 followups list.
- `role_prefix_hits` must still be 0.
- Update the tracking bead with the Day-3 review note.

### Day 7 (T+168h) — close-out + decision

- Final §2 queries, full 7-day window.
- Write the soak retro:
  - Total admits, drops, sanitize-actions per source.
  - Any alarms fired (severity, duration, resolution).
  - Subjective: did ambient feel useful? noisy? annoying? Worth keeping on by default?
- **Decision** — three-way:
  - **Ship-stable.** Close `km-silvercode.ambient-phase-5-soak`. Move to Phase 4 multi-backend eval (Codex / Gemini / pi-acp / copilot / @km/claude-acp). The path forward is "soak passed → expand backend coverage."
  - **Extend-soak.** P2 issues remaining or telemetry gaps that need another week. Renew T=0, document the extension reason, repeat.
  - **Rollback.** Per §4 criteria. Flip `SILVERCODE_AMBIENT_DISABLED=1`, file a follow-up bead with the failure analysis, do not advance to Phase 4.
- `tribe send` to all sessions: result + decision + any follow-up bead links.

---

## 7. Reporter spec — `ambient-soak-status`

Single command, summarizing soak state on demand. **Spec only — implementation is a follow-up bead** (see §10).

**Path:** `apps/silvercode/scripts/ambient-soak-status.ts`

**Invocation:**

```bash
bun apps/silvercode/scripts/ambient-soak-status.ts
bun apps/silvercode/scripts/ambient-soak-status.ts --json    # machine-readable
bun apps/silvercode/scripts/ambient-soak-status.ts --since=1d   # window override
```

**Inputs:**

- `LOGGILY_FILE_AMBIENT` env var — JSONL telemetry path. Defaults to `$HOME/.silvercode/ambient.jsonl`.
- `$HOME/.silvercode/ambient-soak-baseline.json` — Day-1 baseline (optional; reporter still works without it, just no rate-comparison output).
- `$HOME/.silvercode/ambient-soak-T0` — file containing soak start ISO timestamp (created during pre-soak checklist §8).

**Output (human-readable):**

```
silvercode ambient soak — T+72h (Day 3 of 7)
─────────────────────────────────────────────
Source           Admits    Drops    Drop reasons              Sanitize actions
tribe              312       18    rate_limit:18                 strip_ansi:8
recall              94        2    size_bound:2                  neutralize_role_prefix:1
sub-agent           41        0    —                             —
ci                  12        0    —                             —
telegram             7        0    —                             —
file-watch         203       11    breaker_open:11               —
permission          18        0    —                             —

Last event per source:
  tribe        2026-04-29 14:22:01Z  (12 min ago)
  recall       2026-04-29 13:58:43Z  (35 min ago)
  sub-agent    2026-04-29 14:30:12Z  (3 min ago)
  ...

role_prefix_hits cumulative since T=0:  0    OK
Alarms raised:                          1 (P2 @ 2026-04-28T18:00Z, sanitize 12× baseline on tribe — investigated, recall flood, not load-bearing)
Days remaining:                         4

Status: GREEN
```

**Output (`--json`):** mirror the above as a structured object. Used by the daily tribe digest.

**Defer:** the reporter is a doc-only spec right now. Implement it as a separate follow-up bead (`km-silvercode.ambient-soak-reporter`) once Phase 6.b lands and the schema is concrete.

---

## 8. Pre-soak checklist (gates before T=0)

T=0 only kicks off when **all** of these hold. Each item is a hard gate.

1. **Phase 6.b adapters live and dogfooded for ≥ 48 h.** All sources in `channel-sources.ts` (tribe, recall, sub-agent, CI, telegram, file-watch, permission) must have shipped, run cleanly in the user's silvercode for at least 2 days, and produced telemetry. Verified via `km bd show km-silvercode.ambient-phase-6-completion` showing closed.
2. **Phase 6.b circuit breaker + telemetry live with telemetry verified flowing.** `tail -f $LOGGILY_FILE_AMBIENT | jq` shows `silvercode:ambient:admit` records during a normal silvercode session. Breaker state changes on a manually-induced flood (e.g. spam tribe-broadcast 200 events in a minute, observe `breaker:opened` then `breaker:closed`).
3. **`SILVERCODE_AMBIENT_DISABLED=1` smoke-tested as kill-switch.** Manual procedure: start silvercode without the env var, observe ambient flowing; quit; export `SILVERCODE_AMBIENT_DISABLED=1`, restart; verify zero `silvercode:ambient:admit` records and the user-facing disabled message renders. Restore by unsetting and restarting once.
4. **Baseline file path set up.** `$HOME/.silvercode/` exists; `ambient-soak-T0` and (later) `ambient-soak-baseline.json` writable.
5. **Loggily writer wired.** `LOGGILY_FILE_AMBIENT=$HOME/.silvercode/ambient.jsonl` exported in the daily-flow shell. `addWriterFor("silvercode:ambient:*", createFileWriter(...))` registered at silvercode startup (Phase 6.b owns; verify it works end-to-end).
6. **Tribe broadcast announcement.** At T=0:

> tribe send all "Phase 5 ambient-context soak begins T=2026-MM-DDTHH:MMZ. Anthropic only. 7-day clean window required. Report odd agent behavior — confused responses, hallucinated user turns, transcript-shape oddities — to the soak channel (or me directly). Layer 3/4 telemetry is on; any role_prefix_hit pages me. Kill-switch: SILVERCODE_AMBIENT_DISABLED=1."

7. **Soak T=0 timestamp recorded** to `$HOME/.silvercode/ambient-soak-T0`.

If any gate fails, soak does not start. File the gap as a bead, fix it, re-run the checklist.

---

## 9. Multi-backend deferral note

**Phase 4 (multi-backend eval) is the LAST step.** This is a deliberate reordering of the original `ambient-context-safety.md` §4 plan, where Phase 4 (multi-backend) preceded Phase 5 (soak). Per recent user direction:

- Anthropic-only soak first. The forensic failure was Anthropic-priors-driven (session `e8967322` ran on Claude Code); soaking on the backend that produced the failure is the load-bearing test. If it survives, the safety layers hold.
- Codex / Gemini / pi-acp / copilot / @km/claude-acp are sanity-check only, **only if and when Anthropic soak passes clean.** No multi-backend rollout is in scope for this phase.
- Rationale: factorial expansion (7 backends × 7 days) buys no information until we know the Anthropic baseline holds. A failure on Codex during soak is ambiguous — was it the backend, the harness, the prior-distribution, or the safety layer? Removing the multi-backend variable makes Phase 5 a clean test of "does the safety stack hold under real use on the failure-prone backend."
- After a clean soak, a (much shorter, e.g. 48 h per backend) multi-backend eval against the Phase 4 S13/S14/S15 scenarios is the path to "ambient is safe across all silvercode-supported backends." Tracked as `km-silvercode.ambient-phase-4-eval` (already filed in the epic; reordered after Phase 5 in this plan).

---

## 10. Follow-up beads (file at the end of soak prep)

- `km-silvercode.ambient-soak-reporter` — implement the §7 reporter spec. P2, parent `km-silvercode.ambient-phase-5-soak`.
- `km-silvercode.ambient-phase-4-eval` — already filed, marked as **post-Phase-5** in this plan. Re-prioritize from "P1 right after Phase 5" to "P1 conditional on clean Day-7 close-out."

---

## 11. References

- Design: [`ambient-context-safety.md`](ambient-context-safety.md) — full layer architecture; soak is §4 Phase 5.
- Layer 2 source: [`apps/silvercode/src/ambient-sanitize.ts`](../../../apps/silvercode/src/ambient-sanitize.ts).
- Layer 3 source: [`apps/silvercode/src/transcript.ts`](../../../apps/silvercode/src/transcript.ts).
- Layer 4 hook: `~/.claude/hooks/detect-role-prefix.sh` — log at `~/.claude/role-prefix-violations.log`.
- Phase 1 baseline: [`docs/ambient-thesis-proof-2026-04-27.md`](../../../docs/ambient-thesis-proof-2026-04-27.md) — Anthropic 0/300 on Variant B, the empirical case for Layer 3 carrying the safety load.
- Logging conventions: [`.claude/skills/logging/SKILL.md`](../../../.claude/skills/logging/SKILL.md) — loggily namespace, file-writer wiring, `LOGGILY_FILE_*` env-var pattern.
- Tracking bead: `km-silvercode.ambient-phase-5-soak`.
- Parent epic: `km-silvercode.ambient-context-excellence`.

