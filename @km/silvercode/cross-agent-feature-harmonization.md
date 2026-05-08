---
aliases:
  - km-silvercode.cross-agent-feature-harmonization
  - km-silvercode-cross-agent-feature-harmonization
created_at: 2026-05-07T22:55:26.603Z
_stub: true
props:
  blocked-by:
    type: link
    target: "@km/silvercode/binary-wrap-intercept-strategy.md"
propsRaw:
  blocked-by: "[[@km/silvercode/binary-wrap-intercept-strategy.md]]"
---

Umbrella epic. **silvercode's Type-A position lets it homogenize heterogeneous Type-M agents.** Each Type-M (Claude Code, Codex, Gemini, opencode, Kilo, Hermes, etc.) ships its own opinion about skills, permissions, plan/todo state, memory, slash commands, telemetry, MCP wiring, session persistence — formats that don't compose. silvercode-the-cockpit sits above all of them and projects a *single unified surface* the user interacts with, materializing each per-backend native format at the wire boundary at session-spawn.

The Type-A position is what makes this possible — a Type-M host can only ever be one opinion in a field of competing opinions; silvercode (no agent loop of its own) can be the harmonization layer.

## Inventory of recoverable Type-M features (see hub/silvercode/future/ai-terminal/10-agent-router-landscape.md "Type-M features silvercode recovers as Type A — the homogenization play" for full discussion)

1. **Cross-agent skill defs** — single km-anchored skill format under `@km/skills/`, materialized per-backend at session-spawn (Claude's `~/.claude/skills/<name>/SKILL.md`, opencode's `.opencode/`, agentskills.io for Hermes-Type-M). **This is the canonical example.** Tracked by  (P1) — fingerprint-keyed write pattern from Paperclip's adapter-utils.
2. **Cross-agent permission policies** — define a silvercode permission policy once (e.g. *auto-approve reads inside vault, ask on writes outside, deny network outside allowlist*); project to each backend's native vocabulary at session-init. Codex sees `execute`; Claude Code sees `accept-edits` with allowed-tools list; Gemini sees its equivalent.
3. **Cross-agent plan / todo unification** — unified plan model owned by silvercode, populated by Claude's `TodoWrite` tool calls, Codex's plan format, ACP's `plan` SessionUpdate. Cross-pane shared plan in squad mode: pane 1 writes plan; peer panes see it in their own native vocabulary.
4. **Cross-agent context / memory bank** — vault-anchored memory that survives backend swaps. Replace each agent's "memory bank" (Hermes self-managed, Kilo Memory Bank, Claude's CLAUDE.md) with km vault as source of truth. Backend switches lossless.
5. **Cross-agent telemetry / SessionTrace** — adopt OpenClaw's normalized `executionTrace` shape so every backend emits the same telemetry record. Tracked by  (P1).
6. **Cross-agent slash commands / palette** — silvercode-side slash commands (`/inbox`, `/history`, `/handoff`, `/claim`) work consistently across panes. Some silvercode-native (cockpit-level), some project to backend-native (`/compact` → backend's compaction).
7. **Cross-agent capability descriptors** — silvercode-level capability profiles (e.g. "deep mode") that pick `reasoning_effort: high` for Codex panes, `ultrathink` for Claude panes. Builds on existing `apps/silvercode/src/agent-capabilities.ts`.
8. **Cross-agent MCP injection** — single silvercode MCP-server registry; per-pane materialize into agent's native config at session-init via the same fingerprint pattern.
9. **Cross-agent session persistence + resume** — unified silvercode session model (already in flight per `@km/silvercode/state-split-client-server`); per-backend storage becomes derived state.

## The cleavage line — what ACP solves vs what silvercode must own

**ACP harmonizes what happens inside a session. silvercode-side materialization harmonizes what each backend reads from disk before a session.** That divide governs phasing.

For each of the 9 items above, "how much can pure ACP wrapping deliver?":

- **Solved or mostly solved by better ACP wrapping** — the `session/*` surface already carries the harmonization; silvercode just renders:
- Item 3 (plan/todo) — adapter detects `TodoWrite` tool calls / native plan formats and re-emits as ACP `plan` SessionUpdate.
- Item 6 (slash commands) — ACP exposes per-session command list; silvercode merges into a unified palette.
- Item 7 (capability descriptors) — adapter advertises normalized capabilities (`reasoning_low/medium/high`), translates to backend-native vocab on activation.
- Item 9 (session persistence + resume) — ACP `session/load` carries the resume protocol; per-backend storage stays heterogeneous but invisible.
- **Partially solved by ACP `_meta` extensions** — protocol homogeneous, semantics silvercode-side:
- Item 2 (permission policies) — ACP's `session/request_permission` is the protocol; *policy* (which tools fall into which category) is silvercode-side. Adapter tags requests with `_meta.category`; silvercode policy engine has uniform input.
- Item 5 (telemetry / SessionTrace) — `_meta.executionTrace` extension on session/update notifications carries the OpenClaw shape; `_meta.failureFamily` carries Paperclip's typed failures.
- **Not solvable by ACP — needs silvercode-side materialization at session boundaries** — agent reads from disk *before* the ACP session opens:
- Item 1 (skills) — `~/.claude/skills/<name>/SKILL.md` loaded at agent startup.
- Item 4 (memory) — `CLAUDE.md`, memory-bank files loaded at startup.
- Item 8 (MCP injection) — `~/.claude.json` / `opencode.json` read at startup.
- One primitive (fingerprint-keyed materializer from Paperclip's adapter-utils, generalized), three deployment targets.

**Strategic implication**: items 1, 4, 8 are *the* moat layer — opencode-the-Type-M can't replicate without going Type-A, ACP can't grow into without redefining its scope. Items 3/6/7/9 are commodity wins; items 2/5 are convention-led wins; items 1/4/8 are infrastructure-led wins.

## Phasing

**Phase A — pure ACP-wrapping wins (lowest cost, fastest demo)**

Items 3 (plan), 6 (slash commands), 7 (capabilities), 9 (resume). No new abstractions. Mostly contributions to upstream ACP servers (`@agentclientprotocol/claude-agent-acp`, `@zed-industries/codex-acp`, etc.) plus polish in our `@km/claude-acp`. Where upstream maintainers won't accept normalization patches, silvercode does it client-side in its own adapter wrapper. Zero `_meta` extensions needed; everything fits inside the existing ACP surface.

**Phase B — `_meta`-extension conventions**

Items 2 (permission categories), 5 (SessionTrace + failureFamily). Define silvercode `_meta` conventions, ship in `@km/claude-acp` first, then in our codex/gemini wrappers. After they're battle-tested, propose them upstream as ACP spec extensions. The OpenClaw `executionTrace` shape and Paperclip failure-family enum are the reference designs to start from. **Three of the existing P1 borrow beads cluster here**:

- `@km/silvercode/borrow-openclaw-execution-trace` — defines the SessionTrace shape (item 5 wire format).
- `@km/silvercode/borrow-paperclip-claude-failure-types` — supplies `_meta.failureFamily` (item 5 enrichment).
- `@km/silvercode/borrow-paperclip-execution-target` — orthogonal infrastructure that supports Phase B/C wherever spawn happens.

**Phase C — silvercode-side materializer (the moat)**

Items 1 (skills), 4 (memory), 8 (MCP). The single primitive is the **fingerprint-keyed materializer**: a function that takes `{ agentHome, label, items }` and idempotently writes/revokes per-backend native files keyed by a content hash. Paperclip's `packages/adapters/acpx-local/src/server/skills.ts` + `claude-local/src/server/skills.ts` are the reference. Generalize to memory + MCP. **The remaining P1 borrow bead lives here**:

- `@km/silvercode/borrow-skills-fingerprint-materialization` — item 1 (canonical example) and the primitive that all of Phase C reuses.

This is the layer that makes silvercode genuinely defensible. Phases A + B make heterogeneous Type-M agents *look* uniform in the UI; Phase C makes them *behave* uniformly across what they read from disk before they ever reach silvercode's UI.

## Prior art from OpenClaw + Hermes — what to borrow per dimension

The harmonization play is not unprecedented. Two adjacent projects have already solved pieces of it for their own product shapes; their patterns transfer cleanly to silvercode's cockpit context.

## OpenClaw — the declarative-per-vendor-manifest precedent

OpenClaw is positioned differently (chat-bot/messaging gateway) but its **A1 stream-json adapter pattern** in `src/agents/cli-runner/{prepare,execute}.ts` is the cleanest declarative-per-vendor harness in the field. Cross-cutting lesson: per-vendor backend config is **pure declarative data**; the runner + materializer are generic. silvercode's `BUILTIN_AGENTS` map is a thinner version of the same idea; OpenClaw's `cli-backend.ts` shape `{ command, args, modelArg, sessionArg, output, input, bundleMcp, bundleMcpMode, sessionArgs?, resumeArgs }` is the target end-state. **Generalize silvercode's BUILTIN_AGENTS to absorb the OpenClaw shape** — gives Phase C materializers a uniform input.

Per dimension:

- **Item 1 (skills)** — OpenClaw's `clawhub` is their *public* skill directory ("Skill Directory for OpenClaw"). Versioned, hosted, distributable. Pattern: skills as a *first-class published-package concept*, not just per-user files. **Borrow**: silvercode's `@km/skills/` should support both vault-local skills *and* a published-skill-pack convention (think npm-style distribution). Phase C materializer reads from both.
- **Item 4 (memory)** — OpenClaw's `extensions/memory-*` family is gold:
- `memory-core` — the interface
- `memory-lancedb` — vector-store backend
- `memory-wiki` — markdown-wiki backend
- `active-memory` — running-context / short-term memory
  Pattern: **pluggable memory backends behind a uniform interface.** **Borrow**: silvercode's memory layer should expose an interface where km-vault is one backend, but vector stores (LanceDB, FAISS, etc.) and wiki/HTML stores plug in via the same shape. Don't over-fit to vault-only. Filed as a refinement to item 4 — call it *Item 4a — pluggable memory backends*.
- **Item 5 (telemetry)** — already lifted as the canonical reference. Worth taking the *full* meta envelope, not just `executionTrace`: OpenClaw's `meta: { agentMeta, executionTrace, requestShaping, completion, systemPromptReport }`. **Borrow**: silvercode's `_meta` extension should carry the entire envelope; auditable by pane.
- **Item 7 (capabilities / requestShaping)** — OpenClaw's `requestShaping` field captures *per-request normalized parameters that were applied before the per-vendor invocation* (e.g. user said "deep mode" → silvercode resolved to `reasoning_effort: high` for Codex / `ultrathink` for Claude → `requestShaping` records the resolution). **Borrow**: silvercode's normalized capability profile produces a `requestShaping` record per turn, surviving in the audit log. This is the moat layer for "what knobs did silvercode actually turn on this pane in this turn?" answerable at one query.
- **Item 8 (MCP injection)** — OpenClaw's `bundleMcpMode: "claude-config-file"` is **the exact materializer pattern, just claude-only**. **Borrow**: silvercode's MCP-injection module is OpenClaw's `bundleMcpMode` generalized. Same `bundleMcp` field in silvercode's session config; different `bundleMcpMode` per backend. Phase C primitive.
- **Item 9 (resume)** — OpenClaw's template-substitution session contract: `{ sessionArg: "--session-id", resumeArgs: ["--resume", "{sessionId}"] }`. **Borrow**: per-backend resume strategy as declarative config, not imperative code. silvercode's session-spawn module reads this from the per-backend manifest.

## Hermes — the agentskills.io + memory-consolidation precedents

Hermes is Type M (own-loop) and not a direct architectural peer, but its **memory architecture** is the closest published prior art to silvercode's mem-thought design and aligns with the harmonization frame.

- **Item 1 (skills)** — Hermes uses the published [agentskills.io](https://agentskills.io) format. **Borrow**: silvercode's authoring format should be agentskills.io-compatible; the materializer projects to per-backend native (Claude Code's `~/.claude/skills/`, opencode's `.opencode/`, etc.). Two upsides: (a) interop with Hermes's published skill library — a free corpus to pull from; (b) silvercode doesn't invent yet another format that authors have to learn. **The agentskills.io format becomes the *common* authoring surface; per-backend formats are derivations.**
- **Item 4 (memory)** — Hermes does:
- **Markdown-files-as-memory**: agent writes durable insights as markdown; system reads them back on subsequent sessions. Aligns with km-vault's source-of-truth philosophy.
- **10-turn internal review**: foreground self-review consolidates running session into structured insights extracted to memory. Pattern: the consolidation *is itself a feature*, not a side effect.
- **SQLite + FTS5 index**: same primitive bearly recall already uses. Validates choice.
  **Borrow**: silvercode runs a per-N-turn review against the active session's transcript, extracting durable lessons into vault memory **as a Type-A primitive** — agent-agnostic, runs the same way regardless of backend. This is the existing `mem-thought` Tier 4 design (`hub/silvercode/design/recall-trigger-design.md`) but framed as a *harmonization feature*: the review loop runs in silvercode (the cockpit), not in the agent (the runtime). Every backend gets the same memory consolidation regardless of whether the underlying agent supports it natively. **Filed as a refinement: Item 4b — silvercode-owned memory consolidation loop**.
- **Item 1 (execution-environment)** — *not* a harmonization dimension as I framed, but related: Hermes ships six terminal-execution backends (local / Docker / SSH / Daytona / Singularity / Modal). Direct prior art for `@km/silvercode/borrow-paperclip-execution-target`. Validates the multi-environment bet. Worth citing in that bead's body.

## Refined dimensional list

Adding to the existing 9, after this prior-art pass:

- **Item 4a — pluggable memory backends** — interface-driven memory layer (km-vault default; LanceDB / FAISS / wiki backends pluggable). Pattern from OpenClaw's `memory-*` family.
- **Item 4b — silvercode-owned memory consolidation loop** — periodic transcript review that extracts durable insights to vault memory. Pattern from Hermes's 10-turn review. Type-A primitive, agent-agnostic.
- **Item 1a — agentskills.io as authoring format** — silvercode's skill format aligns with the published standard; materializer projects to per-backend native. Pattern from Hermes.
- **Cross-cutting — declarative per-vendor manifest** — generalize `BUILTIN_AGENTS` to OpenClaw's full `cli-backend.ts` shape so Phase C materializers have uniform input. Not a dimension; an implementation discipline.

## How this affects the phased plan

- **Phase A** unchanged.
- **Phase B** unchanged (telemetry + permissions remain `_meta`-extension-shaped).
- **Phase C** absorbs Item 4a (pluggable memory backend interface) and Item 4b (consolidation loop) as additional materializer-required wins. The fingerprint primitive doesn't directly handle 4b (consolidation is a runtime loop, not a file write), so Phase C gains a sibling primitive: a **session-level transcript-review scheduler** that fires consolidation passes against the active session's transcript on a configurable cadence.
- **New Phase A.5 — adopt OpenClaw `cli-backend.ts` manifest shape** — pure-data refactor of `BUILTIN_AGENTS`. Cheap, unblocks Phase C generality. Could land before any other harmonization work.

## How this epic relates to existing P1 borrow beads

Three of the P1 borrow beads are *already* harmonization sub-beads in disguise:

- `@km/silvercode/borrow-skills-fingerprint-materialization` — item 1 above. The fingerprint pattern *is* what makes harmonization work.
- `@km/silvercode/borrow-openclaw-execution-trace` — item 5 above. SessionTrace *is* the harmonized telemetry shape.
- `@km/silvercode/borrow-paperclip-claude-failure-types` — supporting item 5 (typed failure detection feeds into the unified trace's `errorFamily`).
- `@km/silvercode/borrow-paperclip-execution-target` — orthogonal but compatible (where to spawn, while harmonization is what to inject).

This epic *re-frames* those P1 beads under a unified strategic narrative without changing their scope. Items 2-4, 6-9 above are P2 sub-beads under this epic.

## Architectural enabler

The harmonization play depends on silvercode owning the **session boundary** — every backend spawn passes through silvercode's session-init code, where materialization happens. This means:

- `@km/silvercode/state-split-client-server` (P2) is a structural prerequisite — without a clean client/server seam, materialization is a per-pane hack instead of a server-canonical capability.
- `@km/silvercode/web-desktop-shells` (P2) benefits structurally from harmonization — the more silvercode owns at the cockpit layer, the less the renderer needs to care about backend differences.
- The **fingerprint pattern is load-bearing**: idempotent writes keyed by content hash, with revoke semantics when something is dropped. Same primitive Paperclip uses for skills, generalized to all materialization.

## Acceptance — what "done" looks like

This is an epic; sub-beads land per item. Not all required for first deployable.

- [ ] Design doc `hub/silvercode/design/cross-agent-harmonization.md` — taxonomy of recoverable features, materialization model, fingerprint primitive design, per-backend native-format mapping tables.
- [ ] P1 borrow beads complete (skills materialization, executionTrace, claude failure types).
- [ ] P2 sub-beads filed for items 2-4, 6-9 (cross-agent permissions, plan/todo, memory, slash commands, capability profiles, MCP, session resume). One per item; not all need to land at once.
- [ ] One end-to-end demo: km-side skill definition + silvercode session = materialized skill in 3 different backend formats simultaneously across 3 panes.
- [ ] Update `docs/silvery-positioning-brief.md` with the harmonization frame — it sharpens silvercode's value prop beyond "multi-pane TUI for coding agents" to "the only host that homogenizes heterogeneous Type-M agents."

## Strategic framing

silvercode's architectural premise (per CLAUDE.md positioning brief) is *cross-platform UI framework with web ambitions*. Cross-platform-rendering is the *target* axis; cross-agent-harmonization is the *source* axis. Together: **the same unified content rendered across (terminal | DOM | canvas) targets, sourced from heterogeneous (Claude | Codex | Gemini | opencode | ...) agent runtimes.** silvercode is the only product positioning that gets *both* axes — Type-M hosts can't homogenize agents because they *are* agents; Type-A routers without silvery can't span render targets because they're terminal-locked.

## Notes

- Per CLAUDE.md, silvery is multi-target with web ambitions; this epic operationalizes the cross-agent half of that ambition while `@km/silvercode/web-desktop-shells` operationalizes the cross-target half.
- The harmonization frame is what makes silvercode genuinely defensible vs Kilo (Type-M, can't homogenize) or Cursor (Type-M IDE, single agent per surface) or Paperclip (Type-A but heartbeat-shaped, dashboard-not-cockpit).
- Filed 2026-05-07 from session conversation about opencode + Paperclip + cross-agent feature recovery.

