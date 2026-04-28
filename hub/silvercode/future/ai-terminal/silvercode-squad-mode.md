# silvercode squad mode — the validated wedge

**Status**: 2026-04-27 strategic recommendation. Synthesis of the /deep + /pro coding-agent landscape pass (see [coding-agent-landscape.md](../../../silvery/research/coding-agent-landscape.md) "What /pro and /deep flagged" section). Filed under bead `km-all.coding-agent-landscape-2026-04-27`. **Not yet specced for implementation** — this doc is the strategic frame; a separate spec follows once the wedge is committed to.

**Frame**: silvercode's smallest validated wedge in the late-2026 coding-agent landscape. Identified as the highest-leverage move across multiple /pro voices (Kimi K2.6, GPT-5.4 Pro, Grok 4 — concurring; Gemini 3 Pro — partially concurring). Supersedes the open-ended "wrap-and-author coding agents" exploration in `02-agent-integration.md` and `03-agent-authoring.md` for *immediate* product focus, while leaving the broader exploration intact for longer-horizon work.

## The thesis in one sentence

**silvercode is the first coding-agent host designed for deterministic parallel-agent squads** — multi-pane execution where 2–4 agents work safely on the same repo, with file-level claims, shared project context, and human-readable handoffs in one TUI.

## Why this is the wedge (not "another multi-backend host")

Three converging facts from the 2026-04-27 landscape pass:

1. **"Multi-backend host" is commoditizing fast.** Kilo Code holds the #1 OpenRouter CLI position, raised $8M Cota seed (Dec 2025), and ships VS Code + JetBrains + CLI + Cloud Agents — all on opencode underneath. Within 12 months, "works with Claude/Codex/Gemini" will be table stakes. silvercode cannot win that race; Kilo can outspend us at every commodity feature.
2. **CrossAgentState + ambient-context-safety are real moats** — but only if users actually run parallel agents. Today, most users don't. The market hasn't matured to "I run four agents on my refactor." silvercode can either wait for that market to arrive (and lose first-mover advantage) or **manufacture it by shipping the first product where parallel agents are the default UX**.
3. **The "two agents editing the same file" problem is unsolved.** Cursor doesn't address it (single agent). Claude Code doesn't (single session). Kilo's Agent Manager (multi-session diff reviewer with worktree isolation) is the closest; it isolates by worktree, doesn't address shared-file claims at the host level. Symphony spawns per-issue isolated workspaces (different problem). Hermes-style swarms run in headless backgrounds without human-readable conflict handling. **No one ships in-pane real-time deterministic parallel-agent execution.** That's the hole.

## What "squad mode" looks like concretely

A silvercode session, command:

```bash
silvercode squad refactor-auth-jwt
```

opens 4 panes:

- **pane 1 (architect)** — Claude Code, planning the migration
- **pane 2 (api)** — Codex, implementing the JWT changes in `src/api/`
- **pane 3 (frontend)** — Gemini, updating the contract in `src/web/`
- **pane 4 (test)** — Qwen Code (cost-routed), writing the test suite

A shared `CrossAgentState` signal carries:

- **File claims**: `src/api/routes.ts` claimed by pane 2; pane 3 sees the claim and writes to `src/web/auth-client.ts` (no overlap), or queues a wait if it needs to read the file. First exclusive claim wins; later claims get `{ ok: false, conflictWith: "<pane>" }`.
- **Shared project index**: parsed once into the workspace's km-storage, kept current via filewatch. **Each agent does NOT pay 50k tokens to re-read the repo.** This is the cost-economic differentiator.
- **Ambient handoff stream**: pane 2's structured events ("claimed `routes.ts`", "writing tests for new endpoints") flow into other panes' context as `[AMBIENT — observation]` blocks. Pane 4 sees pane 2's progress without confusing it for an instruction.
- **Human override queue**: any tool call requiring permission surfaces in a single shared queue at the bottom of the screen — the human approves once, applies to whichever pane needs it.

Visually: silvery renders this as a 2×2 grid of panes with a kanban-style file-claim map across the top and the override queue across the bottom.

## Why this beats Kilo / Cursor / Claude Code on the dimensions that matter

| Dimension | Kilo | Cursor | Claude Code | silvercode squad |
|---|---|---|---|---|
| Multi-backend | ✅ | partial | single | ✅ |
| **Multiple agents in parallel on same repo** | worktree-isolated, no file-claims | ❌ | ❌ | ✅ |
| **Shared project index (no per-agent re-read)** | ❌ | ❌ | ❌ | ✅ |
| **Ambient handoff between agents** | ❌ | ❌ | ❌ | ✅ |
| **Human-readable conflict resolution** | diff review | ❌ | ❌ | ✅ |
| Subscription auth | ✅ | ✅ (own) | native | ✅ |
| Polished IDE UX | ✅ | ✅ | partial | ⚠ different surface |
| Enterprise features (SSO/SCIM/audit) | ✅ | ✅ | enterprise plan | future |

The squad-mode columns are where silvercode wins; the rest are commodity.

## Why this is the *smallest* validated wedge

- **Validates `CrossAgentState`** — if no one uses squad mode in practice, the file-claims feature is irrelevant and should be killed. Cheap kill criterion, hard signal.
- **Avoids competing with Kilo on gateway/provider matrix** — only need 2 backends for MVP (Claude Code for enterprise budget, Qwen Code for cost arbitrage). Reduces adapter tax by 80%.
- **Monetizable via seat governance** — enterprises will pay for "safe parallelization compresses wall-clock time for large refactors." Individual devs won't pay for another chat UI; teams will pay for refactor velocity.
- **One-line user demo**: *"Run a 4-agent JWT migration in 12 minutes; show diffs, costs, claims, no merge conflicts."* That's a video clip the user posts on X and gets traction. Hard to demo squad mode falsely.
- **Plays to silvery's strength** — multi-pane TUI with first-class hover/click/focus is what silvery is designed for. A 2×2 squad grid with live diff streams is a flagship demo for silvery itself.

## What it doesn't do (explicit non-goals)

- **It is not an orchestrator.** silvercode does not pick which agent does what; the user does (or a Symphony-style external runtime does). silvercode is a *pane host* that loops snap into. Per /pro convergent advice: *"Don't build an orchestrator. Symphony clones are a graveyard. Build a pane host that deterministic loops snap into."*
- **It does not replace beads / Linear / Jira.** Plan management lives in km-bd or external trackers. Squad mode is execution, not planning.
- **It does not do automatic agent task-routing.** Architect / Coder / Debugger sub-modes are Kilo's Orchestrator-mode play. silvercode squad mode is human-driven role assignment per pane.
- **It does not target individual indie devs primarily.** They have Cursor / Claude Code / Aider. Squad mode targets teams that have outgrown single-agent loops and need parallel safety.

## What silvercode already has

Most pieces exist; squad mode is integration, not new infrastructure:

- ✅ **Multi-pane host** — `apps/silvercode/src/App.tsx`, `pane-layout.ts`
- ✅ **CrossAgentState** — `coordinator-mcp.ts`, `cross-agent-state.ts`
- ✅ **Ambient-context-safety pipeline** — `channel-queue.ts`, `ambient-stream.ts`, `prompt-assembly.ts`, `ambient-sanitize.ts`. Already structurally distinct via ACP `EmbeddedResource` + `_meta.ambient=true`.
- ✅ **ACP backends** — Claude (in-tree wrapper), Codex, Gemini, Copilot, opencode-via-ACP. `apps/silvercode/src/ambient-adapters/` already covers ci, filewatch, recall, subagent, tribe.
- ✅ **Subscription auth** — `accounts.ts`, `claude-account.ts`, in-tree Pro/Max wrapper.
- ✅ **silvery rendering** — multi-pane layout, hover/click/focus, scrollback, incremental rendering all shipped.
- ⚠ **Shared project index across panes** — partially exists (recall is per-vault, not per-pane); needs lifting to a CrossAgentState slot so pane-A's index reads benefit pane-B.
- ⚠ **File-claim UX** — primitive exists in `coordinator-mcp.ts`; needs the kanban-style file-claim-map silvery component.
- ⚠ **Human override queue** — composer queue exists; needs cross-pane lifting (currently per-pane).
- ❌ **CN-first routing profile** — needs Qwen + DeepSeek presets per `coding-agent-landscape.md` Chinese-ecosystem section.
- ❌ **Squad CLI command** — `silvercode squad <name>` entry point that pre-configures the 4-pane layout + role assignments + shared index.

The gap is small. Squad mode is **silvercode's existing parts wired into a specific UX**, not a rewrite.

## Pricing posture (per /pro Kimi)

Squad mode justifies a pricing tier. From Kimi: *"Enterprises will pay for 'safe parallelization' because it compresses wall-clock time for large refactors. Individual devs will not pay for another chat UI."* Three plausible tiers:

- **Free** — single-pane silvercode, ACP backends, BYOK
- **Squad** ($X/seat/month) — multi-pane squad mode, shared project index, file-claims, override queue, audit log
- **Enterprise** ($Y/seat/month) — SSO/SCIM/MDM, audit retention, credential pooling, on-prem option, CN routing profiles

Don't price squad until validated. Free 90-day pilot for the first 50 teams that try it; gate price on retention.

## What success looks like in 90 days

1. **`silvercode squad <name>` CLI entry point** working with 2-pane minimum (architect + coder).
2. **Shared project index across panes** — measurable: parallel agents on same repo each consume <20% of the per-agent re-read tokens vs baseline.
3. **File-claim map silvery component** — visual, hoverable, shows current claims and queued waits.
4. **Cross-pane composer override queue** — single approval flow for permission requests from any pane.
5. **One published demo video** — 4-agent multi-file refactor in 10–15 min with cost/time/diff/claim chart.
6. **5 design partners running squad mode in production** — even if non-paying. Gather telemetry on actual claim conflicts, override rates, agent-routing patterns.
7. **Decision point**: by day 90, either commit to squad as the primary product narrative OR kill it and return to "polished single-agent host" positioning.

## Risk + counter-argument

The minority /pro view (Grok 4) argues fork over ACP for runtime control and that silvercode should compete head-on with Kilo. The majority view says the host layer is closing and silvercode should narrow scope to multi-agent safety. The squad-mode wedge takes the majority view.

**The risk if wrong**: 12 months in, parallel-agent execution remains a niche pattern (most users still single-pane), and silvercode is positioned for a market that hasn't materialized. Mitigation: track the leading indicators monthly — what % of silvercode sessions have >1 active pane; what % of those have agents in different repos vs same; how often do file claims actually fire; what's the conflict-resolution rate. If these stagnate at <5% by month 6, pivot back to single-pane polish before the brand-positioning ossifies.

**The opportunity if right**: silvercode owns "the safe parallel-agent host" positioning as parallel agents become normalized — same shape Kilo owns "all-in-one" today. The category is real; the question is whether silvercode arrives early enough to define it.

## Cross-references

- **The /pro voices that converged on this wedge**: GPT-5.4 Pro (silver-trace + routing profiles), Kimi K2.6 ("smallest validated wedge: silvercode squad mode" — verbatim), Grok 4 ("Ambient Squad MVP"). Full text at `/tmp/coding-agents-pro-result-2026-04-27.md`.
- **Landscape context**: [`hub/silvery/research/coding-agent-landscape.md`](../../../silvery/research/coding-agent-landscape.md) — particularly the "What /pro and /deep flagged" + "Chinese ecosystem" + "Background-agent compute" sections added 2026-04-27.
- **ACP-not-fork decision (with tripwires)**: [`02-agent-integration.md`](02-agent-integration.md) — the integration posture squad mode rides on.
- **CrossAgentState design**: existing `apps/silvercode/src/cross-agent-state.ts` + `coordinator-mcp.ts`.
- **Ambient-context-safety**: [`hub/silvercode/design/ambient-context-safety.md`](../../design/ambient-context-safety.md) — the cost+safety differentiator squad mode amplifies.
- **silvercode-agent-future** (long-horizon vision): [`silvercode-agent-acpp.md`](silvercode-agent-acpp.md) and the broader `ai-terminal/` exploration. Squad mode is a *near-term wedge*, not the end state.

## Bead

`km-all.coding-agent-landscape-2026-04-27` (parent: `km-all`) tracks this strategic synthesis. When squad mode is committed to as a product line, file `km-silvercode.squad-mode-mvp` as an implementation epic with acceptance criteria pulled from the "What success looks like in 90 days" section above.
