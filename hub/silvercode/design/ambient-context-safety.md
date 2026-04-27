# Ambient Context Safety

**Purpose:** the durable design + re-introduction plan for silvercode's ambient-context pipeline, after the role-prefix-emission failure surfaced in forensic session `e8967322` (2026-04-22). The trigger token in this doc is intentionally written in description form (`role-prefix marker`, `role-A vs role-U slot`) rather than as a literal — see §9 on content quarantine.

**Tracking:** [`km-silvercode.ambient-context-excellence`](bd-show:km-silvercode.ambient-context-excellence) executes the phases in §4.

**Live architecture:** [`apps/silvercode/docs/channels.md`](../../../apps/silvercode/docs/channels.md). This doc is the *why* and *plan*; channels.md is the *what ships*.

---

## Posture: auto-deliver, framed as observation

Ambient events are **delivered to the agent automatically** — tribe broadcasts, recall hits, sub-agent results, CI events, file-watch, permission decisions. The user does not approve, route, or batch them. They have no bandwidth for that and the product premise is autonomous coordination, not a Slack inbox.

The structural fix is not "stop delivering" — it's "deliver with unambiguous framing so the agent reads ambient blocks as **memories of past activity**, not as **active user instructions**." Two parts:

1. **Wire-shape**: ambient events never inhabit the role-U slot. They land in a structurally distinct ACP construct (`EmbeddedResource` with `_meta.ambient = true`), and the per-backend adapter emits them in a corresponding distinct API construct (system context block, tool-result block, or strongly-framed text block — *whichever the backend's wire actually distinguishes from user input*).
2. **Framing**: each ambient block is wrapped with a fixed prefix that names it as an observation, plus a system-prompt clause that defines how ambient is read. The agent treats these like it treats `cat`'d log lines or git history — informational context, not directives.

The agent never has to ask "did the user just tell me X?" — the wire shape and framing answer it deterministically.

---

## 1. Failure mode

Channel events (peer messages, CI, recall, sub-agents) were injected into the role-U slot of the prompt. The assistant model then emitted transcript-style role-prefix text as its OWN output. Once emitted, the offending line was re-parsed by the transcript builder into a pseudo-user turn and re-fed as context. Closed-loop, autocatalytic.

Forensic record: smoking-gun three-line sequence in `e8967322` — a tribe broadcast under role-U with XML wrapping, immediately followed by an assistant turn whose text block began with a role-prefix marker. Verification discipline: jq the JSONL to confirm role-A (model emitted) vs role-U (input pipeline injected). See `feedback-verify-transcript-first.md`.

---

## 2. Root cause — two bugs, not one

The autocatalysis required **both** of:

**Bug A — slot contamination.** Non-user content reached the role-U slot. The model treated it as user instruction (training-time priors) and completed patterns matching multi-turn dialogue, including emitting role-prefix tokens as part of its assistant text.

**Bug B — re-ingestion.** The transcript serializer that builds `messages[]` from session JSONL did not reject assistant text starting with a role-prefix pattern. The literal characters got parsed back as a synthetic user turn next round, closing the loop.

Bug A is what the prior architecture targeted (Layers 0–3 below). **Bug B was missed.** Even with perfect Layer 1+2, a single Layer-3 detection event leaves the offending bytes in JSONL, which next session's transcript builder happily turns into a fresh user turn unless explicitly hardened. Loop-closure prevention is now a first-class layer.

The fix at every layer is structural, not behavioral. Memory rules and system-prompt injunctions are planning-time guidance — `feedback-memory-rules-are-soft.md` documents that they don't reliably prevent token-generation drift under trigger saturation.

---

## 3. Architecture — five layers + source-side scrub

| # | Layer | Where | What it does |
|---|---|---|---|
| 0 | **Source scrub** | `vendor/bearly` tribe-daemon + recall (shipped, `8fd431f`/`53e6669`) | Regex scrub + Haiku rewrite at broadcast/injection time. Defense in depth — reduces incoming trigger density before it reaches any consumer. |
| 1 | **Boundary** | `apps/silvercode/src/prompt-assembly.ts` (`assembleAcpPrompt`) | The *only* path that constructs ACP prompt blocks. role-U text equals `userText` byte-for-byte; ambient events go to `EmbeddedResource` blocks with `_meta.ambient = true` and a fixed observation-frame prefix. CI gate forbids direct `ContentBlock` construction elsewhere. |
| 1b | **Adapter wire-bytes** | `apps/silvercode/packages/agent-harness/src/acp-adapter-*.ts` | Each per-backend adapter MUST emit ambient blocks in a wire construct the backend distinguishes from user input (Anthropic: a system content block or distinct tool-result block; OpenAI: developer message or function-result; Gemini: system instruction part). Verified by capturing literal HTTP bodies. If an adapter has no such distinction, ambient is suppressed for that backend until one exists. |
| 2 | **Sanitization** | `apps/silvercode/src/ambient-sanitize.ts` (planned) | Cheap regex pass on every payload before resource construction: pattern-breaks role markers + role-tag pairs, size-bounds, strips ANSI/control chars, Unicode-normalizes. Layer 0 owns semantic-equivalent handling (Haiku rewrite); Layer 2 is the deterministic floor. |
| 3 | **Loop-closure** | `apps/silvercode/src/transcript.ts` (planned) | Transcript serializer rejects assistant text starting with a role-prefix pattern from being parsed back as a user turn. Quarantines the literal bytes inline and replaces with a sentinel. **This is the layer that prevents Bug B and was missing from the prior design.** |
| 4 | **Detection** | `~/.claude/hooks/detect-role-prefix.sh` (shipped) | Stop hook. Scans the assistant turn post-emission, logs to `~/.claude/role-prefix-violations.log`, writes per-session sentinel, surfaces `systemMessage`. Does not block. With Layer 3 in place, detection becomes telemetry — the loop is already closed. |

Layers 1+1b prevent slot contamination. Layer 2 hardens the payload. Layer 3 prevents re-ingestion. Layer 4 makes residual events visible. Layer 0 reduces upstream pressure.

---

## 4. Re-introduction plan

Tribe + recall ambient injection is currently disabled in the user's daily flow. Each phase has a verification gate; no phase advances until its gate passes.

### Phase 0 — Forensic-content quarantine (immediate, highest leverage) — SHIPPED 2026-04-27

Stop the active cross-session compounding hazard before doing anything else.

**Canonical quarantine mechanism: `~/.claude/.recall-ignore`** (one path/glob per line, `~/` expansion, `**` globs, `#` comments). Implemented in `vendor/bearly/plugins/recall/src/history/indexer.ts` via `loadRecallIgnore()` + `pruneIgnoredSessions()` — applied both at scan time (skip in `findSessionFiles`) and at incremental-rebuild time (prune sessions whose stored `jsonl_path` now matches an ignore entry).

Phase 0 actions:

- Forensic JSONL added to `.recall-ignore`: `~/.config/claude-profiles/bjorn@stabell.org/projects/-Users-beorn-Code-pim-km/e8967322-6b58-43db-80b0-1da644ea964d.jsonl` (and its hardlinked twin under `~/.claude/projects/`).
- Active log added to `.recall-ignore`: `~/.claude/role-prefix-violations.log` (defensive — not currently in any indexer's scan path, but listed for any future indexer).
- Literal trigger tokens already removed from this design + bead descriptions (this revision).
- Redundant project-level hook `apps/silvercode/.claude/hooks/check-role-prefix.sh` confirmed non-existent (silvercode has no `.claude/` dir); `tools/lint-claude-config.ts` does not reference it. Stale `~/.claude/role-prefix-incidents.log` deleted.

**Gate (verified):** `bun recall index --incremental` evicted the forensic session from the FTS5 index (`SELECT id FROM sessions WHERE jsonl_path LIKE '%e8967322%'` returns zero rows); `bun recall --raw "autocatalytic"` returns 10 results, none from the forensic JSONL session id; `bun tools/lint-claude-config.ts` clean; user-level hook fires on a synthetic emission test (logged + sentinel created + `systemMessage` emitted).

### Phase 1 — Empirical proof of the boundary thesis (single-backend)

Before building infrastructure, prove the thesis: that a properly-shaped ACP prompt (Variant A) prevents the model from emitting the role-prefix pattern even when fed the smoking-gun S13 sequence on Claude.

- Hardcode Variant A locally in a one-off test driver.
- Replay the S13 sequence (the three-line forensic capture, sanitized) directly to the Anthropic API.
- Compare against Variant B (the failure-mode shape: ambient as XML inside role-U).
- Capture: rate of role-prefix emission per 100 trials, per variant.

**Gate:** Variant A emission rate < 1% AND Variant B emission rate > 10%. If A doesn't beat B by >10×, the boundary thesis is wrong; revisit before proceeding.

### Phase 2 — Adapter wire-byte verification

For each of the 7 supported backends:

- Capture the literal HTTP body silvercode sends when an ambient block is in the prompt.
- Verify the ambient bytes are NOT inside the backend's user-input field. If they are (adapter flattens `EmbeddedResource` to user-role text), fix the adapter.
- If a backend has no construct distinguishable from user input, document and disable ambient for that backend.

**Gate:** all 7 backends verified; no backend ships ambient via user-input wire field.

### Phase 3 — Boundary + Layer 2 + Loop-closure shipped

- `prompt-assembly.ts` boundary tests (60+ assertions: property + adversarial + bypass).
- `ambient-sanitize.ts` ships with adversarial corpus seeded from quarantined captures (binary-blob, not human-readable text).
- `transcript.ts` loop-closure: never split assistant text on a role-prefix pattern; quarantine + sentinel-replace inline.
- CI gate forbids `ContentBlock` construction outside canonical files.
- Property tests on Layer 2: idempotence, meaning-preservation, no over-sanitization.

**Gate:** all three layers' tests pass; CI gate active ≥ 7 days, zero violations.

### Phase 4 — Behavioral eval on Anthropic, then 7-backend roll-out

- S13 (smoking-gun replay), S14 (accumulated channel pressure, 10 successive events then a real prompt), S15 (regression replay of the sanitized failed-session JSONL).
- Run on Anthropic first (the priors-driven failure was Claude-specific).
- A vs B comparison baseline measures the gap.
- Roll out to remaining 6 backends only after Anthropic is green.

**Gate:** S13/S14/S15 green on Anthropic; baseline shows A >10× B. Other backends green or ambient disabled per Phase 2 decision.

### Phase 5 — Re-enable in daily flow with monitoring

- Tribe + recall ambient injection re-enabled, auto-delivered to the agent.
- 7-day soak with `~/.claude/hooks/detect-role-prefix.sh` tracking telemetry. Layer 3 should now be silent — any emission is a regression.
- Daily summary; any emission triggers immediate disable + investigation.

**Gate:** 7 consecutive days, zero detected emissions.

### Phase 6 — Source coverage + observability

- Real source adapters (no stubs): tribe, recall, sub-agent, CI, telegram, file-watch, permission decisions.
- Per-source rate-limit + circuit breaker (auto-disable a source if its content keeps tripping detection).
- `silvercode doctor ambient` checker; per-event JSONL log (binary-blob, recall-ignored); replay tool.

**Gate:** every entry in `channel-sources.ts` has a paired test; storybook smoke renders all stories; epic acceptance met.

---

## 5. Safeguards (always-on, independent of phase)

- **Layer 4 detector stays on permanently.** With Layer 3, it becomes pure telemetry; cheap insurance.
- **Per-session circuit breaker.** If detection fires more than N times in a session, ambient injection in that session auto-disables until restart. N starts at 1; tune up only if false positives appear.
- **Test corpus quarantine.** Eval fixtures live at `apps/silvercode/tests/eval/fixtures/` as binary blobs (NOT human-readable markdown), with a `.recall-ignore` marker. Trigger literals never appear as plain text anywhere in the repo.
- **Weekly trend dashboard.** Tail `~/.claude/role-prefix-violations.log`, compute weekly counts. Trend-line is the canonical regression signal.

---

## 6. Detection-machinery inventory

| Artifact | Layer | Status |
|---|---|---|
| `vendor/bearly` tribe-daemon source scrub | 0 | Active. Keep. |
| `vendor/bearly` injection-envelope library + 18-shape eval | 0 | Active. Keep. |
| `vendor/bearly` recall envelope (`<recall-memory>` wrapper) | 0 | Active. Keep. |
| `apps/silvercode/src/prompt-assembly.ts` + `channel-queue.ts` | 1 | Active, **unverified behaviorally — Phase 1 + 4.** |
| `apps/silvercode/packages/agent-harness/src/acp-adapter-*.ts` | 1b | Active, **wire bytes never verified — Phase 2.** |
| `apps/silvercode/src/ambient-sanitize.ts` | 2 | **Planned — Phase 3.** |
| `apps/silvercode/src/transcript.ts` (loop-closure) | 3 | **Planned — Phase 3. New layer.** |
| `~/.claude/hooks/detect-role-prefix.sh` | 4 | Active. Keep permanently. |
| `~/.claude/role-prefix-violations.log` + state sentinels | 4 | Active. Listed in `.recall-ignore` (Phase 0). Use as binary-blob eval-corpus source. |
| `apps/silvercode/.claude/hooks/check-role-prefix.sh` | — | Confirmed non-existent (silvercode has no `.claude/` dir). |
| `~/.claude/role-prefix-incidents.log` | — | Deleted Phase 0 (2026-04-27). |
| Memory feedback entries (7 files) | — | Planning-time guidance. Keep, don't churn. Not load-bearing for the fix. |

---

## 7. Hypothesis map (contributing factors)

| # | Hypothesis | Status | Notes |
|---|---|---|---|
| H1 | Ambient content reached role-U slot | **Confirmed** (forensic) | Layer 1 + 1b fix. |
| H2 | Literal triggers inside `EmbeddedResource` still drive completion | Plausible | Layer 2 mitigates. Test in Phase 1. |
| H3 | Trained-respond + user-installed-don't-respond rule conflict pressured emission | Untested | Becomes irrelevant once Layer 1+1b hold. |
| H4 | Investigation pollutes JSONL → recall surfaces it → cross-session compounding | **Confirmed** | Phase 0 quarantine. |
| H5 | Re-ingestion: assistant text re-parsed as user turn | **Plausible — load-bearing** | Layer 3 fix. Was missing from prior design. |
| H6 | Adapter flattens typed boundary to plain user-role text on the wire | **Plausible** | Phase 2 verifies per-backend. If true, Layer 1 is illusory until adapters are fixed. |

---

## 8. Vector scope

This design hardens the ambient-channel injection path. The same vulnerability pattern (zero-click prompt injection via tool output containing role-prefix tokens) applies to:

- File reads (`cat`, `Read` tool) hitting a doc/log/repo containing trigger literals.
- LSP/code-context tool outputs.
- Web fetches (curl, WebFetch, Firecrawl) on adversarial pages.
- Recall results (already partly addressed by `<recall-memory>` envelope; verify scope).

**Layer 3 (loop-closure) and Layer 4 (telemetry) are vector-agnostic** — they catch any emission regardless of source. Layers 1, 1b, 2 are channel-specific. A follow-on epic (`km-silvercode.context-isolation-universal`) extends the boundary discipline to all tool outputs once the ambient path is proven.

---

## 9. Content quarantine for this design itself

The prior revision of this doc contained literal role-prefix tokens. Those tokens are themselves the trigger; storing them in repo files indexed by recall feeds the next investigation context with the failure pattern.

This revision uses descriptions: `role-prefix marker`, `role-U slot`, `role-A turn`. Adversarial corpora are binary blobs in `tests/eval/fixtures/` with `.recall-ignore`. The forensic JSONL is `.recall-ignore`d in Phase 0. Any future addition of literal trigger tokens to this doc is a Layer-9 violation and should be reverted.

The fresh-session protocol from the prior design is **demoted to soft hygiene**, not load-bearing. Content quarantine is the actual fix.

---

## 10. References

- **Live architecture:** [`apps/silvercode/docs/channels.md`](../../../apps/silvercode/docs/channels.md).
- **Live code:** `apps/silvercode/src/{prompt-assembly,channel-queue,channel-sources}.ts`.
- **Detection hook:** `~/.claude/hooks/detect-role-prefix.sh`; log at `~/.claude/role-prefix-violations.log`.
- **Forensic JSONL** (quarantined in Phase 0): `~/.config/claude-profiles/bjorn@stabell.org/projects/-Users-beorn-Code-pim-km/e8967322-6b58-43db-80b0-1da644ea964d.jsonl`.
- **Memory:** `feedback-{autocatalytic-hallucination,never-emit-role-prefixes,emit-nothing-not-no-response,redirect-urge-to-tribe-reply,verify-transcript-first,memory-rules-are-soft}.md`.
- **Upstream:** `anthropics/claude-code` issues #10628, #31447, #50972.
- **Vendor commits:** `vendor/bearly@8fd431f` (tribe scrub), `@53e6669` (injection eval), `@c656387` (defense library), `@f363f6a` (recall envelope).
- **Pro review (2026-04-27)**: dual-pro DeepSeek R1 + Kimi K2.6 + Gemini 3 Pro; judge winner Kimi K2.6 (loop-closure / re-ingestion identified). Output at `/tmp/llm-4de4a3ab-critique-this-ambient-context-safety-rerf.txt`.
