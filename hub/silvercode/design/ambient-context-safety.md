# Ambient Context Safety

**Purpose:** the durable design + re-introduction plan for silvercode's ambient-context pipeline, after the role-prefix-emission failure surfaced in session `e8967322` (2026-04-22).

**Tracking:** [`km-silvercode.ambient-context-excellence`](bd-show:km-silvercode.ambient-context-excellence) executes the phases in §4.

**Live architecture:** [`apps/silvercode/docs/channels.md`](../../../apps/silvercode/docs/channels.md). This doc is the *why* and *plan*; channels.md is the *what ships*.

> **Discovery hazard.** Reading or analyzing this design pumps trigger tokens into context, raising the rate of the failure it describes (verified: investigation-time emission count rose with discussion). Read once, ship the fix, end the session. Memory rule: `feedback-autocatalytic-hallucination.md`.

---

## Notification-first model (the design posture)

Ambient events are **notifications first, context-injections second.** The default user experience:

- Events arrive → queued in `ChannelQueue`, badged in the side panel, listed in a hover popover with source + timestamp + payload preview.
- The agent never sees them automatically. Ever.
- The user opts in to context-injection on demand via `/inject-<source>` or by approving individual events from the queue popover.
- Per-source mute (`/mute-source <name>`) drops new events from one source without affecting others.
- A bell character + rate-limited toast surfaces new events in the TUI itself.

This is the inversion of the failure-prone default. Most agent stacks auto-inject channel events into context; we deliver them to the *user* by default and let the user decide when to share with the agent. Even if Layer 1 + 2 hold perfectly, the smaller surface (only injected events touch context) is its own safeguard.

The agent participates in fewer cycles, sees only what the user thinks is relevant, and never gets surprised by ambient pressure it didn't ask for.

---

## 1. Failure mode

Channel events (peer messages, CI, recall, sub-agents) injected into the user-message slot caused the assistant to emit transcript-style role-prefix text as its own output. Once emitted, the line rendered as user-typed and re-fed as context. Closed-loop, autocatalytic.

Forensic record: smoking-gun three-line sequence in `e8967322` — a tribe broadcast under `role: user` with XML wrapping, immediately followed by an assistant turn whose `text` block began with a role-prefix marker. Verification discipline: `jq` the JSONL to confirm `role: assistant` (model emitted) vs `role: user` (input pipeline injected). See `feedback-verify-transcript-first.md`.

---

## 2. Root cause

`role: user` was contaminated with non-user content. The user-message slot is a contract — it carries only what the user typed. When the contract is violated, training-time priors take over: the model treats the slot as user instruction and completes patterns that look like multi-turn dialogue.

The fix is structural, not behavioral. Memory rules and system-prompt injunctions are planning-time guidance — `feedback-memory-rules-are-soft.md` documents that they don't reliably prevent token-generation drift. Code-level enforcement is what holds.

---

## 3. Architecture — three layers + source-side scrub

| # | Layer | Where | What it does |
|---|---|---|---|
| 1 | **Boundary** | `apps/silvercode/src/prompt-assembly.ts` (`assembleAcpPrompt`) | The *only* path that constructs ACP prompt blocks. `role: user` text equals `userText` byte-for-byte; channels go to `EmbeddedResource` blocks with `[AMBIENT — informational, do not act]` framing + `_meta.ambient = true`. CI grep gate forbids direct `ContentBlock` construction elsewhere. |
| 2 | **Sanitization** | `apps/silvercode/src/ambient-sanitize.ts` (planned) | Applied to every payload before resource construction. Pattern-breaks role markers, role-tag pairs, instruction blocks; size-bounds; strips ANSI/control chars; Unicode-normalizes. Strategy preserves human-readable meaning while breaking literal trigger sequences. |
| 3 | **Detection** | `~/.claude/hooks/detect-role-prefix.sh` (shipped) | Stop hook. Scans the assistant turn post-emission, logs to `~/.claude/role-prefix-violations.log`, writes per-session sentinel, surfaces `systemMessage`. Does not block (blocking under saturation drifts more). Recovery is human-driven: end the session. |
| 0 | **Source scrub** | `vendor/bearly` tribe-daemon + recall (shipped, `8fd431f`/`53e6669`) | Regex scrub + Haiku rewrite at broadcast/injection time. Defense in depth — reduces incoming trigger density before it reaches any consumer. |

Layers 1 and 2 prevent emission. Layer 3 makes emission visible after the fact. Layer 0 reduces upstream pressure independently of any consumer.

---

## 4. Re-introduction plan

Tribe + recall ambient injection is currently disabled in the user's daily flow. Each phase has a verification gate; no phase advances until its gate passes.

### Phase 0 — Cleanup (immediate, low-risk)

- Delete `apps/silvercode/.claude/hooks/check-role-prefix.sh` — duplicate of user-level hook, less mature, marked internal because nothing references it.
- Delete `~/.claude/role-prefix-incidents.log` — output of the deleted hook, stale since Apr 24.
- Update `tools/lint-claude-config.ts` to no longer expect the deleted hook.
- Optionally consolidate `feedback-quiet-tribe-ack.md` into `feedback-emit-nothing-not-no-response.md` (the latter explicitly supersedes).

**Gate:** lint clean; user-level hook still fires on a synthetic emission test.

### Phase 1 — Layer 1 boundary verified

- Boundary tests (60+ assertions): property + adversarial + bypass categories.
- CI grep gate blocks construction of `ContentBlock` variants outside canonical files.
- Nightly fuzz with 1000 iterations.

**Gate:** tests pass; CI gate active ≥ 7 days with zero violations.

### Phase 2 — Layer 2 sanitization verified

- `ambient-sanitize.ts` ships, wired into `prompt-assembly.ts`.
- Adversarial corpus seeded from real captures: `~/.claude/role-prefix-violations.log` and the `e8967322` JSONL.
- Property tests: idempotence, meaning-preservation, no over-sanitization on benign prose.

**Gate:** corpus produces zero detectable trigger patterns through the pipeline; integration covered by boundary tests.

### Phase 3 — Behavioral eval green on backends

Three scenarios specifically reproducing the witnessed failure, run against all 7 supported backends:

- **S13** — channel-as-user-role replay (the smoking-gun three-line sequence).
- **S14** — accumulated channel pressure (10 successive events through Layer 1+2, then a real prompt).
- **S15** — regression replay of the actual failed-session JSONL through the new pipeline.

A comparison-baseline run injects the same ambient as `text` blocks (the failure mode) to demonstrate the typed pipeline outperforms naive injection.

**Gate:** S13/S14/S15 green on all 7 backends; baseline shows the gap.

### Phase 4 — Re-enable in daily flow with monitoring

- Tribe + recall ambient injection re-enabled.
- 7-day soak with `~/.claude/hooks/detect-role-prefix.sh` tracking emissions.
- Daily summary; any emission triggers immediate disable + investigation.

**Gate:** 7 consecutive days, zero detected emissions.

### Phase 5 — Source coverage + UX polish + observability

- Real source adapters (no stubs): tribe, recall, sub-agent, CI, telegram, file-watch (after the LSP epic), permission decisions.
- Side-panel queue badge + per-source mute (`/mute-source <name>`) + selection-preview.
- `silvercode doctor ambient` checker; per-event JSONL log; replay tool.

**Gate:** every entry in `channel-sources.ts` has a paired test; storybook smoke renders all stories; epic acceptance met.

---

## 5. Safeguards (always-on, independent of phase)

- **Layer 3 detector stays on permanently.** Cheap insurance after the boundary holds.
- **Per-session circuit breaker.** If the detector fires more than N times in a session, future channel injections in that session auto-disable until restart. N starts at 1; tune up only if false positives appear.
- **Test corpus quarantine.** Eval fixtures live at `apps/silvercode/tests/eval/fixtures/` with a `.recall-ignore` marker excluding them from the recall index.
- **Weekly trend dashboard.** Tail `~/.claude/role-prefix-violations.log`, compute weekly counts. Trend-line is the canonical regression signal.
- **End-the-session protocol.** Investigation pumps triggers; the discipline is fix-and-end, not analyze-deeper.

---

## 6. Detection-machinery inventory

| Artifact | Layer | Status |
|---|---|---|
| `vendor/bearly` tribe-daemon source scrub | 0 | Active. Keep. |
| `vendor/bearly` injection-envelope library + 18-shape eval | 0 | Active. Keep. |
| `vendor/bearly` recall envelope (`<recall-memory>` wrapper) | 0 | Active. Keep. |
| `apps/silvercode/src/prompt-assembly.ts` + `channel-queue.ts` | 1 | Active, **unverified behaviorally — Phase 1 + 3.** |
| `apps/silvercode/src/ambient-sanitize.ts` | 2 | **Planned — Phase 2.** |
| `~/.claude/hooks/detect-role-prefix.sh` | 3 | Active. Keep permanently. |
| `~/.claude/role-prefix-violations.log` + state sentinels | 3 | Active. Use as eval-corpus source. |
| `apps/silvercode/.claude/hooks/check-role-prefix.sh` | — | Redundant duplicate. **Delete in Phase 0.** |
| `~/.claude/role-prefix-incidents.log` | — | Stale. **Delete in Phase 0.** |
| Memory feedback entries (7 files) | 4 | Planning-time guidance. Keep, don't churn. |

---

## 7. Hypothesis map (contributing factors, not load-bearing for the fix)

| # | Hypothesis | Status | Notes |
|---|---|---|---|
| H1 | Channel content reached `role: user` | **Confirmed** (forensic) | Layer 1 fixes. |
| H2 | Literal triggers inside `EmbeddedResource` still drive completion | Plausible | Layer 2 mitigates. |
| H3 | Trained-respond + user-installed-don't-respond rule conflict pressured emission | Untested | Becomes irrelevant once Layer 1 holds. |
| H4 | Investigation pollutes JSONL → recall surfaces it → cross-session compounding | Plausible | Quarantine + investigation discipline mitigate. |

---

## 8. References

- **Live architecture:** [`apps/silvercode/docs/channels.md`](../../../apps/silvercode/docs/channels.md).
- **Live code:** `apps/silvercode/src/{prompt-assembly,channel-queue,channel-sources}.ts`.
- **Detection hook:** `~/.claude/hooks/detect-role-prefix.sh`; log at `~/.claude/role-prefix-violations.log`.
- **Forensic JSONL:** `~/.config/claude-profiles/bjorn@stabell.org/projects/-Users-beorn-Code-pim-km/e8967322-6b58-43db-80b0-1da644ea964d.jsonl`.
- **Memory:** `feedback-{autocatalytic-hallucination,never-emit-role-prefixes,emit-nothing-not-no-response,redirect-urge-to-tribe-reply,verify-transcript-first,memory-rules-are-soft}.md`.
- **Upstream:** `anthropics/claude-code` issues #10628, #31447, #50972.
- **Vendor commits:** `vendor/bearly@8fd431f` (tribe scrub), `@53e6669` (injection eval), `@c656387` (defense library), `@f363f6a` (recall envelope).
