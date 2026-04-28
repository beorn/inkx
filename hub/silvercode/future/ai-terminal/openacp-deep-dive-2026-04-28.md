# OpenACP — deep dive

_Snapshot 2026-04-28. Sourced from a shallow clone of `Open-ACP/OpenACP` (latest `main`), the npm package `@openacp/cli` (v2026.428.1, 120 versions), the Open-ACP GitHub org, and a Reddit r/buildinpublic comment from contributor `@dumpshoot` describing the mid-conversation switch. Re-verify before external use; the project is shipping ~3 releases/day._

## TL;DR

OpenACP is a **self-hosted bridge that connects 28+ ACP-speaking coding agents to Telegram / Discord / Slack**. It is the most mature ACP "proxy"-shaped product shipping today — but the proxy is **chat-platform-shaped, not editor-shaped, not gateway-tenant-shaped**, and emphatically self-hosted single-user. The mid-conversation `/switch` with context carry-over is real and well-implemented (the standout architectural feature). Everything else is solid systems work — middleware, plugins, permission gating, warm-pool spawn, REST API, tunnels — done in 6 weeks by a tiny pseudonymous team moving fast.

For silvercode, OpenACP is **a useful prior-art reference, not a competitor in the same lane**. It validates the gateway pattern (bridges and per-session context carry are real, demanded features) but leaves the editor surface, multi-tenant gateway, federated/Matrix, and cross-session coordination layers wide open — which is the silvercode + agentroom thesis.

## Origin & maintainership

- **Org**: `github.com/Open-ACP`. Created 2026-03-19. Single-product org. No website / email / location set.
- **Repo**: `Open-ACP/OpenACP`. MIT. ~280★ / 36 forks. Pushed within hours of this snapshot.
- **npm**: `@openacp/cli`. Sole publisher: `mrpeter`. Author field: `OpenACP <https://x.com/openacp_ai>`. 120 versions in ~6 weeks.
- **Lead contributor**: `0xmrpeter` ("Mr.Peter"), ~1,300 commits, ~80% of total. Account 0x-prefix + numbered-handle siblings (`peterr0x`) suggest deliberately pseudonymous identity. Top three other contributors (`dylan-112`, `EthanMiller0x`, `lngdao`) all have stripped or fictional profiles.
- Distinct from Peter Steinberger's **OpenClaw** (different transport, different org, different team). The "Peter" overlap is incidental.
- Distinct from **`agentclientprotocol/*`** (Zed's protocol org). OpenACP is a consumer of Zed's ACP, not its author.

## Stack & shape

```
src/
  cli.ts               CLI entry (start, install, plugins, --version, --help)
  main.ts              Server startup, plugin boot
  core/
    core.ts            OpenACPCore — registers adapters, routes messages, wires events
    agent-switch-handler.ts   The mid-conversation switch (see below)
    agents/            AgentInstance, registry, installer, MCP manager
    sessions/          Session, SessionManager, SessionBridge, permission-gate
    plugin/            LifecycleManager, ServiceRegistry, MiddlewareChain, PluginContext
    commands/          System chat commands (session, agents, admin, help, menu)
    adapter-primitives/  MessagingAdapter, StreamAdapter, message-formatter, send-queue
    config/, security/, doctor/, setup/
  plugins/
    telegram/          grammY adapter — forum topic per session
    slack/             @slack/bolt — Socket Mode
    speech/            Edge TTS + Groq STT
    tunnel/            Cloudflare, ngrok, bore, Tailscale
    security/          Access control, rate limiting (security-guard.ts)
    api-server/        Fastify + Swagger + Zod + SSE + JWT
    file-service/, identity/, notifications/, sse-adapter/
    context/           Conversation history (history-store, history-recorder, history-context-builder)
  data/registry-snapshot.json   Baked 28-agent ACP registry
ui/                    Web UI (Vite + Monaco, separate pnpm workspace)
packages/
  plugin-sdk/          @openacp/plugin-sdk — published types + testing utilities
```

- **Runtime**: Node ≥20, TypeScript, pnpm workspace, Vitest, tsup for publish bundle
- **Dependencies of note**: `@agentclientprotocol/sdk ^0.16.0`, `@agentclientprotocol/claude-agent-acp ^0.24.2`, `fastify ^5.8.4`, `grammy ^1.41.1`, `@slack/bolt`, `@clack/prompts`, `pino`, `nanoid`, `diff`, `fastest-levenshtein`, `micromatch`, `ignore`
- **Plugin system surface**: 19 middleware hook points (`message:incoming`, `agent:beforePrompt`, `permission:beforeRequest`, `agent:beforeSwitch`, `agent:afterSwitch`, …); 9 permission types (`events:read`, `services:register`, `commands:register`, …); per-plugin settings persisted to `~/.openacp/plugins/<name>/settings.json`
- **Channel surface**: `MessagingAdapter` framework with shared `StreamAdapter`, `SendQueue`, `OutputModeResolver` so a new platform plugin only writes the platform-specific glue
- **Operational**: warm-pool agent (~300ms first-session instead of 2–3s cold), pino structured logs with rotation, daemon mode on macOS/Linux, REST API + SSE + JWT auth, `openacp doctor` diagnostics

## The standout feature: mid-conversation `/switch` with context carry

This is the claim that brought us to OpenACP (Reddit r/buildinpublic, `@dumpshoot`: *"You can switch between Claude Code, Codex, Gemini mid-conversation and it carries the context over."*). It is real, well-engineered, and the most architecturally interesting code in the repo.

**File**: `src/core/agent-switch-handler.ts` (263 LOC)

**Protocol** (7 steps with rollback):

1. **`agent:beforeSwitch` middleware (blocking)** — plugins can veto a switch
2. **Resume-vs-spawn decision** — if the target agent (a) was used previously in this session AND (b) declares `supportsResume` in its registry capabilities, reconnect to the previous subprocess; otherwise spawn fresh
3. **Bridge teardown** — disconnect ALL `SessionBridge`s for this session; let adapter clear skill commands and clean up channel-side state (e.g., dismiss in-flight permission buttons)
4. **Atomic agent replacement** with rollback — `Session.switchAgent(toAgent, factoryFn)` replaces the agent instance; if `factoryFn` throws, session state is unchanged
5. **Context injection on fresh-spawn path** — `ContextManager.flushSession()` then `buildContext()` produces a markdown transcript of prior conversation; `session.setContext(markdown)` injects it as the new agent's first context. The `agentSwitch.labelHistory` config option labels who-said-what across the boundary. **Try/catch wrapped — best-effort, switch succeeds even if context build fails.**
6. **Bridge reconnect** to the new agent
7. **`agent:afterSwitch` middleware (non-blocking)** — for telemetry, UI hooks

**Concurrency**: per-session `Set<sessionId>` lock — `Switch already in progress` thrown on second concurrent attempt for the same session.

**Eventing**: emits `BusEvent.SESSION_AGENT_SWITCH` with `status: "starting" | "succeeded" | "failed"` plus user-visible `system_message` events ("Switching from X to Y…", "Switched to Y (resumed previous session)").

**What this means architecturally**: OpenACP has built a **session-as-first-class** abstraction that is agent-portable. The Session owns the conversation; the AgentInstance is replaceable. This is a precondition for everything in our venture #13 (coordination) and #14 (agent-in-the-middle) — if the session isn't agent-portable, "shared memory across agents" can't exist. OpenACP got this right early.

**What it does NOT do**:

- **No cross-session shared state.** Each session is its own bubble. Two sessions in the same OpenACP instance don't share memory, todos, files, or anything else. The coordination layer is empty (matches our venture #13 gap).
- **No multi-tenant.** Single user, single machine. The `identity` plugin exists but is for who-can-trigger-the-bot semantics, not multi-tenancy.
- **Context = prior turns of conversation, not vector memory.** The history store is markdown chunks; no embeddings, no recall, no long-term memory. Reasonable v1, but a real product would layer LLM-backed memory here.

## Registry consumption

`src/data/registry-snapshot.json` is a baked snapshot of the official Zed ACP Registry — **28 agents** at this snapshot:

```
amp-acp, auggie, autohand, claude-acp, cline, codebuddy-code, codex-acp,
corust-agent, crow-cli, cursor, deepagents, dimcode, factory-droid,
fast-agent, gemini, github-copilot-cli, goose, junie, kilo, kimi,
minion-code, mistral-vibe, nova, opencode, pi-acp, qoder, qwen-code, stakpak
```

Each entry carries: id, name, version, description, repository, authors, license, icon URL, **distribution map** (`binary` per-platform archives `{darwin-aarch64, darwin-x86_64, linux-aarch64, linux-x86_64, windows-x86_64}` OR `npx` package + args + env). The snapshot version is `1.0.0`; the public CDN endpoint is `cdn.agentclientprotocol.com/registry/v1/latest/...`.

`openacp agents install <name>` resolves the entry, downloads the binary or runs `npx`, registers the agent via `AgentManager`, and persists install state to `~/.openacp/agents/`.

**Implication for silvercode**: registry consumption is a solved, public-CDN-backed problem. We can either bake a snapshot at build time (OpenACP's choice — fast cold-start, version pinning) or fetch dynamically (slower first run, always-fresh). Either way it's plumbing, not novel work. **The 28-agent surface is reachable for free.**

## Production-grade systems work (the unsexy 90%)

A list of things OpenACP has built that any gateway product needs:

- **Warm pool** for default agent (one pre-spawned `AgentInstance` ready) — first session pays only the `newSession` RPC (~300ms) instead of subprocess spawn (~2–3s). 5-min idle TTL, liveness-checked before claim, refills after consumption.
- **Permission gate** — buttoned-approval for destructive actions; configurable auto-approve rules per action type (e.g., read-only ops auto, file writes manual). Plugin-extensible via `permission:beforeRequest` middleware.
- **Streaming abstraction** — `StreamAdapter` + `StreamAccumulator` + per-platform output-mode resolver. Same agent stream renders as Telegram message edits, Discord message updates, or Slack thread events — without each adapter rewriting stream logic.
- **Auto-naming** sessions — derived from first user message + LLM summarization
- **`/handoff`** — move a session between terminal and chat
- **Tunnel plugin** with four backends — solves "how do I receive Telegram webhooks behind NAT" without making the user pick.
- **Voice** — Edge TTS for output, Groq STT for input. Optional, plugin-isolated.
- **Cost tracking & budget gating** — token counting per session, monthly budget config, gate fires `budget:exceeded` middleware that can pause the session. Genuine answer to "Cline burning OpenRouter tokens" pain point quoted in their README.
- **Doctor command** — `openacp doctor` checks Node version, agent installs, channel connectivity, permission state, port conflicts, and suggests fixes. Reduces support burden.
- **Daemon mode** with auto-start on boot (macOS/Linux). Windows daemon explicitly out of scope.

These are all known-hard problems; OpenACP shipped them in 6 weeks. That's the credibility signal.

## Where OpenACP stops (the silvercode opportunity space)

| Layer | OpenACP does | OpenACP doesn't |
|-------|--------------|------------------|
| **Editor surface** | None — chat-platform first | TUI/IDE/silvercode-shaped UI is wide open |
| **Tenancy** | Self-hosted, single-user, single-machine | Multi-tenant cloud gateway is wide open |
| **Federation** | None | Matrix / federated rooms / cross-org agent rooms — wide open |
| **Coordination across sessions** | None — sessions are independent | Shared memory / shared todos / shared decisions across agents and sessions — wide open (venture #13/#14) |
| **Workspace as room** | Sessions are 1:1 with chat threads, not workspace structures | km-style "node = room" — open |
| **Per-session memory** | History store as markdown, injected at switch | LLM-backed long-term memory, retrieval, summarization — open |
| **Schema / event vocabulary** | Internal types only | Public event spec (our `agentroom-event-spec.md`) — open |
| **Cross-protocol bridges** | ACP ↔ Telegram/Discord/Slack | ACP ↔ Matrix / Email / Web / agent-to-agent — open |

**Bottom line**: the gateway pattern is validated; the gateway *product* in our wedge (multi-tenant + editor-first + workspace-shared + federation-friendly + coordination-rich) is still empty. OpenACP raises the bar on "what a chat-bridge looks like" but does not occupy any of our target territories.

## Strategic notes (for ventures #11 / #13 / #14)

- **Venture #11 (agentroom gateway, scored 24/25)**: OpenACP is the **closest direct prior art** for the bridge primitive. Confirms (a) market demand, (b) the architectural shape (per-session lifecycle + adapter framework + middleware), (c) that 6-week shipping velocity from a tiny team is feasible. Our differentiator must be tenancy + workspace + editor — not "another chat bridge."
- **Venture #13 (coordination layer)**: Wide open — OpenACP explicitly leaves cross-session state empty. The session-as-portable-context primitive in OpenACP is necessary but not sufficient; coordination needs a higher layer (shared room, shared todos, shared decisions across N sessions). Our agentroom event spec is the right shape; OpenACP gives us the underneath-layer to build on.
- **Venture #14 (agent-in-the-middle platform)**: Empty. OpenACP can switch agents but has no concept of "agent A talking through agent B" or "agent observed by agent C" or "policy-injecting middle agent." Plugin system + middleware chain are the right shape but middle-agent semantics aren't there.
- **Venture #12 (km chat rooms as JSONL sessions)**: Still wide open. OpenACP persists session history but in its own internal store, not as portable JSONL files mappable to KNodes. Our advantage: the km vault model gives us "node = room" naturally; OpenACP would have to retrofit it.

## Risks to track

- **OpenACP could grow into our space.** Plugin system is permissive enough that someone could write `@openacp/plugin-coordination` or `@openacp/plugin-matrix` and chip away at our wedge from below. Velocity is high. We should either ship before they get there or accept that the bridge layer is commoditized and our wedge has to live elsewhere (it does — it lives in the editor + workspace + coordination layers).
- **The pseudonymous team is a credibility risk.** For B2B / enterprise, "anonymous npm publisher" is a non-starter. For OSS / dev-tool / dev-self-host, less of an issue. Doesn't change the architectural story but matters for any narrative that positions OpenACP as a competitor to enterprise gateways.
- **The 6-week age + 3 releases/day cadence is not stable.** Breaking changes are explicit in the README. We should not depend on OpenACP types/APIs in any silvercode code path. Architectural inspiration only.

## How to track

- Watch `Open-ACP/OpenACP` (GitHub watch on releases). 280★ today; if it crosses 5k it's becoming a category leader and we should reassess wedge.
- Watch `@openacp/cli` npm versions (3/day cadence; spike or lull is signal).
- Watch x.com/openacp_ai for product announcements.
- Quarterly re-snapshot of `registry-snapshot.json` to see registry growth (28 today).
- Re-check this doc against `agent-switch-handler.ts` and `context-manager.ts` if either spec around context carry shifts; those are the load-bearing files.

## Cross-references

- [acp-proxy.md](acp-proxy.md) — original brainstorm doc (the venture)
- [10-agent-router-landscape.md](10-agent-router-landscape.md) — broader Type-A router landscape; OpenACP appears there as architectural peer to OpenClaw
- [agent-protocols-landscape.md](agent-protocols-landscape.md) — ACP vs A2A vs MCP vs IBM-ACP framing
- [agentroom-event-spec.md](agentroom-event-spec.md) — proposed public event vocabulary (where OpenACP's internal types could plug in)
- [hub/ventures/acp-proxy-2026-04-27.md](../../../ventures/acp-proxy-2026-04-27.md) — the worked-example venture analysis
