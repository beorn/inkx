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
| 1b | **ACP boundary** | `apps/silvercode/packages/agent-harness/src/acp-adapter-*.ts` | The boundary silvercode owns is the ACP `prompt` content array, NOT the upstream HTTP body. Each adapter passes `EmbeddedResource` blocks (with `_meta.ambient = true`) straight through to `agent.prompt({ prompt })` over JSON-RPC stdio; the spawned ACP server child (`@zed-industries/codex-acp`, `@google/gemini-cli --acp`, `pi-acp`, `copilot`, `@km/claude-acp`) is responsible for translating that ContentBlock array into the upstream provider's distinct slot (Anthropic `system`, OpenAI `developer`, Gemini `systemInstruction`). silvercode's verification target is therefore the ACP wire — that ambient lands in `EmbeddedResource`/`type:"resource"` blocks, not `type:"text"` blocks. Verified in `apps/silvercode/packages/agent-harness/tests/ambient-wire-bytes.test.ts` (in-memory `acp.AgentSideConnection` capture). |
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

### Phase 1 — Empirical proof of the boundary thesis (single-backend) — SHIPPED 2026-04-27, GATE INFORMATIONALLY FAILED

Driver: `apps/silvercode/tests/eval/thesis-proof.ts`. Results: `docs/ambient-thesis-proof-2026-04-27.md`.

600 live Anthropic trials (3 models × 2 variants × N=100):

| Model | Variant A (typed) | Variant B (XML in role-U) |
|---|---|---|
| claude-opus-4-5 | 0/50 | 0/50 |
| claude-sonnet-4-6 | 0/100 | 0/100 |
| claude-opus-4-7 | 0/100 | 0/100 |

**Both variants emitted zero role-prefix markers.** The forensic failure mode does NOT reproduce on a minimal-viable API harness. It apparently required context the harness didn't reconstruct — long history, full CLAUDE.md, accumulated tool output, recall pollution, or some interaction we haven't isolated.

**Load-bearing implication for the design**: the safety load is NOT carried by Layer 1 (boundary). Variant B (the broken old way) is fine on a clean session. Whatever was happening in `e8967322` was emergent at depth, not at the prompt-shape level. **Layer 3 (loop-closure / re-ingestion blocker) is the load-bearing safety layer**, not Layer 1. Phase 3 should prioritize Layer 3 + Layer 4 (telemetry) over further Layer 1 hardening.

This does not invalidate Layer 1 — defense-in-depth still applies, the typed boundary still prevents the *category* of bug, and the bypass-attempt tests still earn their keep. But the empirical case for "boundary fixes the original failure" is unproven; the empirical case for "loop-closure prevents recurrence regardless of cause" is the one we ship on.

**Followup if it ever matters**: a fuller reproduction harness with a real long session (CLAUDE.md + recall + 50 prior tool calls + accumulated assistant output) would test whether the failure scales in. Not currently worth the cost — Layer 3 closes the loop regardless.

The original gate ("A < 1% AND B > 10%") is moot: the failure didn't reproduce, so the comparison is undefined. Recorded as INFORMATIONALLY FAILED in `km bd close km-silvercode.ambient-phase-1-thesis-proof` with full evidence.

### Phase 2 — ACP boundary verification — SHIPPED 2026-04-27

**Scope correction:** the original Phase 2 framing assumed silvercode constructs the upstream provider HTTP body. It does not. silvercode → ACP JSON-RPC over stdio → spawned ACP server child → upstream HTTP. The provider HTTP body is the ACP server child's responsibility (and varies per child); silvercode's owned boundary is the **ACP prompt content array**.

Verification therefore targets the ACP wire: each adapter must pass ambient as `EmbeddedResource` (`type:"resource"`) blocks distinct from `type:"text"` blocks, never flattening to text inside the role-U slot.

Captured via in-memory `acp.AgentSideConnection` (no real subprocess) at `apps/silvercode/packages/agent-harness/tests/ambient-wire-bytes.test.ts`.

Per-backend findings: `codex`, `gemini`, `pi-acp`, `github-copilot-cli`, `claude-code` (`@km/claude-acp`) all pass unchanged — `acp-client.ts`'s `AcpAgentSession.prompt` passes `ContentBlock[]` straight through.

**Gate (verified):** 7/7 ambient-wire-bytes tests green; 175/175 broader agent-harness tests green; sample payloads contain zero role-prefix triggers.

**Out of scope (separate path):** `sdk-adapter.ts` (`spawnSdk` via `@anthropic-ai/claude-agent-sdk`) is the only direct-HTTP code path silvercode owns; it is not on the ambient/channel-queue route today. If ambient is ever wired to that path, this phase needs extending to capture+verify the HTTP wire too. Tracked separately if it becomes load-bearing.

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

### Phase 6 — Source coverage + UX + observability

#### 6.a — Inline ambient display in chat — SHIPPED 2026-04-27

`AmbientEventRow` renders ambient events inline in the chat scrollback as styled observation rows between turns (per the auto-deliver / observation-framed posture). Source icon + label, timestamp, payload preview with expand toggle, hover popover with full body, per-source mute toggles in the side panel.

- Component: `apps/silvercode/src/components/AmbientEventRow.tsx`
- Storybook: `apps/silvercode/storybook/stories/AmbientEventRow.story.tsx`
- Mute state: `apps/silvercode/src/hooks/use-ambient-stream.ts` (`useAmbientMuteState`)
- Design: `hub/silvercode/design/ambient-inline-display.md`

Mute toggles are visual filter only — agent still receives all ambient events; the mute hides them from the user's inline view.

#### 6.b — Real source adapters + observability (planned)

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
| `apps/silvercode/src/prompt-assembly.ts` + `channel-queue.ts` | 1 | Boundary tests landed (`apps/silvercode/tests/prompt-assembly-boundary.test.ts`). Behavioral test (Phase 1) ran — failure mode did NOT reproduce on minimal harness; safety load reassigned to Layer 3. |
| `apps/silvercode/src/ambient-sanitize.ts` | 2 | **SHIPPED.** Deterministic regex floor — pattern-break role-markers, size-bound, ANSI strip, NFC normalize. Wired into `prompt-assembly.ts`. Adversarial corpus from binary-blob fixtures. |
| `apps/silvercode/src/transcript.ts` (loop-closure) | 3 | **SHIPPED — load-bearing per Phase 1 finding.** `safeAppendAssistantTurn` rejects role-prefix-starting assistant text from being re-parsed as synthetic user turn. |
| `apps/silvercode/packages/agent-harness/src/acp-adapter-*.ts` | 1b | **ACP wire verified — Phase 2 SHIPPED.** All 7 adapters pass `EmbeddedResource` through unchanged (`apps/silvercode/packages/agent-harness/tests/ambient-wire-bytes.test.ts`). |
| `apps/silvercode/src/components/AmbientEventRow.tsx` + storybook | UX | **Phase 6.a SHIPPED.** Inline ambient display in chat scrollback. |
| `apps/silvercode/src/system-prompt.ts` (`AMBIENT_FRAMING_SYSTEM_CLAUSE`) | 1 | **SHIPPED.** Three-precept system clause: read as memory, mention when relevant, ask before acting on ambiguous content. Injected once per session. |
| `tools/check-prompt-boundary.ts` | 1 (CI gate) | **SHIPPED.** Wired into `bun fix` and `bun verify-boundary`. Two-stage detection: imports + literal `ContentBlock` construction outside the canonical seam. |
| `~/.claude/hooks/detect-role-prefix.sh` | 4 | Active. Keep permanently. |
| `~/.claude/role-prefix-violations.log` + state sentinels | 4 | Active. Listed in `.recall-ignore` (Phase 0). Use as binary-blob eval-corpus source. |
| `apps/silvercode/.claude/hooks/check-role-prefix.sh` | — | Confirmed non-existent (silvercode has no `.claude/` dir). |
| `~/.claude/role-prefix-incidents.log` | — | Deleted Phase 0 (2026-04-27). |
| Memory feedback entries (7 files) | — | Planning-time guidance. Keep, don't churn. Not load-bearing for the fix. |

---

## 7. Hypothesis map (contributing factors)

| # | Hypothesis | Status | Notes |
|---|---|---|---|
| H1 | Ambient content reached role-U slot | **Forensic-confirmed; minimal-harness did NOT reproduce** | Phase 1 (600 trials) showed Variant B (XML-in-role-U) emits 0/100 on a clean session. Failure was emergent at depth, not at prompt-shape. Layer 1 still earns its keep as defense-in-depth + bypass-attempt prevention; not the load-bearing safety layer. |
| H2 | Literal triggers inside `EmbeddedResource` still drive completion | Did not reproduce on minimal harness | Layer 2 still ships as deterministic floor. |
| H3 | Trained-respond + user-installed-don't-respond rule conflict pressured emission | Untested; deprioritized | Layer 3 closes the loop regardless. |
| H4 | Investigation pollutes JSONL → recall surfaces it → cross-session compounding | **Confirmed** | Phase 0 quarantine. |
| H5 | Re-ingestion: assistant text re-parsed as user turn | **Load-bearing — confirmed by elimination** | Phase 1 failed to reproduce Bug A on a clean session, so the original failure must have required either depth context or a re-ingestion loop. Layer 3 closes the loop categorically — fix holds regardless of the original cause. |
| H6 | Adapter flattens typed boundary to plain user-role text on the wire | **Refuted — but only for the ACP wire we own** | Phase 2 verified all 7 adapters preserve `EmbeddedResource` blocks across the silvercode↔ACP boundary. The upstream HTTP body is the spawned ACP server child's responsibility; we don't own that wire. |
| H7 | Failure required emergent context (long history + CLAUDE.md + tool-call accumulation + recall) | New, untested | A fuller reproduction harness could test this. Not currently worth the cost since Layer 3 holds regardless of cause. |

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
