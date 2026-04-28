# ACP-as-proxy — what protocol-host moments unlock

**Status:** future-doc / brainstorm. Not committed work. The goal is to map the opportunity space that opens up when an ACP proxy/host layer becomes the control plane for coding-agent traffic, by analogy to the protocol-proxy moments that preceded it.

**Tracking (if this gels into work):** `km-tribe.acp-proxy` (not yet filed).

**Related current state:** `apps/silvercode/packages/agent-harness/` (the per-backend ACP clients), `vendor/bearly/plugins/tribe/` (the daemon), `hub/silvercode/design/ambient-context-safety.md` (the ambient pipeline that's already proxy-shaped).

---

## 1. The pattern

When a hot protocol gets a transparent proxy or host layer, the proxy becomes the **control plane** where N×M problems collapse to 1×M (and 1×N), and entire feature categories that used to require every endpoint to ship them become free for every endpoint.

Three reference points worth comparing — all three are <20 years old, all three created multi-billion-dollar categories of products that didn't exist before the proxy moment.

### 1.a HTTP — CDN / reverse-proxy / service-mesh

nginx, Cloudflare, Akamai, Fastly, Envoy, Istio, Linkerd, oauth2-proxy, Pomerium.

What the HTTP proxy moment unlocked, none of which the upstream HTTP server had to ship:

- TLS termination + cert management (Let's Encrypt as infrastructure).
- Edge caching, compression, image transformation.
- Rate limiting, DDoS protection, WAF.
- Geo routing / Anycast.
- A/B testing, canary routing, blue-green deploys.
- HTTP/2 / HTTP/3 translation transparent to origin.
- Edge compute (Workers, Lambda@Edge).
- mTLS, retries, circuit breakers (service mesh).
- Auth-as-infrastructure (oauth2-proxy, Pomerium): apps stopped shipping their own auth.
- Request tracing, distributed tracing (W3C Trace Context, OpenTelemetry).

The originating insight: HTTP was already standardized; the value capture was in the layer above each endpoint.

### 1.b LLM APIs — OpenRouter / LiteLLM / Helicone / Vercel AI Gateway / Portkey

A 2-year-old category that's already a billion-dollar segment. What the LLM proxy moment unlocked:

- Model routing — pick cheapest/best per request.
- Failover when a provider degrades or goes down.
- Provider abstraction (OpenAI-compatible API for Claude, Gemini, DeepSeek, local models).
- Prompt caching (Anthropic, OpenAI cache hit-rate optimization at the proxy).
- Spend caps, cost alerts, per-team budgets.
- Logging / tracing for prompts (LangSmith, Helicone).
- Prompt redaction / PII removal in flight.
- Fine-tune dispatch.
- Privacy proxying — own the data, none reaches OpenAI directly.
- Egress firewall — block secret leaks at the proxy boundary.

**Critical observation** (per /deep prior-art audit 2026-04-28, knowledge cutoff Oct 2024): every product in this category is **transform-only**. None of OpenRouter / LiteLLM Proxy / Portkey / Helicone / Vercel AI Gateway / LangSmith hosts a persistent stateful LLM sub-agent. They route, cache, redact, log, and observe. No agent-in-the-middle. The gap is wide open — see §3.4 and §6.

The originating insight: dozens of LLM providers, hundreds of consumers; the cross product is impossible without a routing layer.

### 1.c LSP — the editor-side analogue

Once Microsoft standardized Language Server Protocol in 2016, every editor got every language's intelligence essentially for free. LSP-multiplexers exist (combine multiple language servers behind one client); LSP-augmenting AI proxies (Cody, Cursor, Continue) sit at the same layer. The LSP moment was less about commerce and more about democratization — dozens of small-team languages got VS Code support without writing a VS Code extension.

The originating insight: standardize the seam, ship the integrations once.

---

## 2. ACP — the next protocol-host moment

ACP (Agent Client Protocol) is to coding-agent traffic what OpenRouter is to LLM-API traffic and what LSP is to language traffic.

silvercode today is **already** a proxy in shape, just not in name:
- Speaks ACP downstream (to spawned codex-acp, gemini-cli, claude-acp, copilot, pi-acp).
- Owns the conversation with the user.
- Aggregates cross-session state (CrossAgentState).
- Delivers ambient context.
- Has a typed boundary that classifies user vs ambient bytes.

The "what changes if we name it a proxy" is mostly about *strategy and roadmap* rather than architecture.

### 2.1 Two flavours of proxy: transform-in-the-middle vs agent-in-the-middle

Most of §3 below describes **transform-in-the-middle** capabilities — stateless or short-lived operations on the ACP traffic (route, cache, redact, validate, observe, normalize). These are CDN / API-gateway shapes — well-understood, large surface area, mostly engineering.

§3.4 introduces a different shape: **agent-in-the-middle**. The proxy hosts a *persistent LLM sub-agent* that thinks alongside the foreground agent and augments its prompts with delta injections. This is closer to "edge-compute platform" than "byte-pipe."

Both shapes coexist and reinforce each other. The transform layer is the substrate; the agent-in-the-middle is the moat.

---

## 3. Categories of opportunity

Ordered roughly by leverage. Not all are silvercode's first move; they're the map of the territory.

### 3.1 Swarm-enable any agent

Today: each ACP agent runs in its own silo, oblivious to peers. With a proxy: any agent — even an old one with zero peer-awareness — gets tribe broadcasts, recall hits, sub-agent results, file-watch events injected as `[AMBIENT — observation]` blocks. The agent doesn't change; the proxy makes it a swarm member.

Load-bearing for silvercode's positioning. This is the wedge feature the ambient-context-safety pipeline already implements.

### 3.2 Security + governance

Read-only mode (proxy strips write tools). Per-tool permission policy enforced centrally — "ask for writes, auto-approve reads" applies to every agent without each shipping its own consent UI. Egress firewall blocks tool calls to disallowed paths/URLs. Outgoing prompt scanning for secret patterns; redact before reaching upstream. Compliance logging: every tool call recorded immutably for SOC2/HIPAA.

The agent never has to know any of this. The proxy enforces.

### 3.3 Observability per agent and across agents

Per-session timeline of every prompt + tool call + response. Cost dashboard per agent per task. Latency tracing — is the agent slow, the tool slow, or the model slow? Tool-call heatmap. Auto-judge quality scoring against a rubric. Drift detection across model versions ("Claude Sonnet 4.6 → 4.7 changed completion distribution; here's how").

silvercode already proxies every JSON-RPC message; surfacing this is the cheapest available wedge. Zero new architecture.

### 3.4 Memory / cross-session continuity (and the broader "agent-in-the-middle" pattern)

Today recall lives in `vendor/bearly` and is silvercode-specific. With a proxy: any agent talking through the proxy gets recall injection. Codex/Gemini/Copilot all gain "Memory" without each shipping it. Project-scoped memory ("work on `pim/km` recalls past `pim/km` sessions"). User-controlled remember/forget enforced at proxy layer.

But there's a bigger architectural pattern here than "inject memory snippets." The proxy can host a **persistent in-session sub-agent** — a separate LLM with its own prompt-cached context — that watches all ACP traffic, maintains compiled-knowledge state, and augments the foreground agent's prompts with delta injections. **Agent-in-the-middle**, not just transform-in-the-middle.

See [`hub/tribe/design/recall-thought.md`](../../../tribe/design/recall-thought.md) for the full design — the mem-thought (Tier 3) sub-agent. Originally framed as a local silvercode adapter; the proxy reframe is "this could live in the cloud as part of the ACP proxy."

What the proxy-hosted memory sub-agent gets that a local one doesn't:

- **Cross-machine continuity** — same user's sessions on laptop A and laptop B share memory state without local sync
- **Centralized LSP / repo context** — proxy holds the repo (mounted, synced via git, or remote LSP), sub-agent loads symbol tables once, reuses across sessions
- **Resource isolation** — heavy 50K-token cached LLM context maintained server-side, doesn't drain client RAM
- **Multi-agent coverage by default** — every spawned agent (Claude/Codex/Gemini/Copilot) inherits the same memory layer; no per-agent integration
- **Scale economics** — multi-tenant deployment amortizes the LLM cost of memory maintenance across users; cache hits cross sessions
- **Stronger durability** — sub-agent state survives client crashes, network drops, OS reboots

What it costs:

- **Privacy/compliance** — source code visible to cloud (mitigated by self-host option, end-to-end encryption of prompts, or local-first hybrid)
- **Network latency on every event** — augmenting prompts adds RTT (mitigated by colocating proxy with model API)
- **Multi-tenant isolation** — per-user state, per-project scope, leak prevention
- **Cold-start cost when context cache evicts** — re-priming a 50K compiled-knowledge cache is expensive (mitigated by warm pools, persistent cache layers)

This is qualitatively different from §3.1–3.3 (transforms, security, observability) — those are mostly stateless. A persistent LLM sub-agent in the proxy is a **new architectural primitive**: not a rule, not a route, not a cache — a co-resident agent that thinks alongside the foreground agent and pushes deltas into its prompt.

Other candidates for proxy-hosted persistent sub-agents (same shape, different purpose):
- **Compiler / type-check / lint sub-agent** — watches edits, runs checkers, surfaces issues as ambient
- **Critic sub-agent** — second opinion on every plan, raises concerns when it disagrees (`/pro`-as-always-on)
- **Style/convention sub-agent** — knows the codebase's patterns, flags drift before commit
- **Test-runner sub-agent** — watches code changes, runs relevant tests, surfaces failures
- **Documentation sub-agent** — keeps docs in sync with code, suggests doc edits when code changes

The proxy as **agent-in-the-middle host** is potentially the biggest architectural shift in the ACP era — analogous to CDNs evolving from byte-pipes to edge-compute platforms. The byte-pipe was the start; the compute platform was the moat.

### 3.5 Conformance + capability normalization

Probe an agent's capabilities at session-init; normalize to a baseline. Agent doesn't expose tool X? Proxy emulates X from primitives the agent does have. ACP v1 ↔ v2 translation through the proxy means clients and agents upgrade independently. JSON-RPC schema validation catches integration bugs at the boundary instead of in production.

### 3.6 Auto-routing / model arbitrage

Classify the incoming task — "rename a variable" vs "design a system" — and route to the right tier (cheap codex-low for the rename, expensive claude-ultrathink for the design). Failover when a backend degrades. Per-tier billing enforced at the proxy ("you have N high-tier requests/day; the rest go to the cheap tier"). The classifier is itself a tiny model running in the proxy, trained on accept/reject signals.

bearly's `bun llm pro` already has the dual-/triple-model dispatch pattern. Generalizes naturally.

### 3.7 Cost control

Budget caps per session / project / day. Cost alerts mid-task ("this session has spent $12; continue?"). Per-tool cost accounting (LLM tokens + network calls + sandbox compute). Cost-aware routing (covered above).

### 3.8 Compaction / efficiency

Auto-compact long histories before sending. Dedupe repeated context — same file read 5 times → reference once. Diff-based context: if the file changed since the last read, send the diff, not a full re-read. Maximize prompt-cache hit-rate by stable message ordering. "Token diet" mode for cheap-tier agents (strip whitespace, compress JSON, etc.).

### 3.9 A/B testing + replay + shadow

Send the same prompt to two agents in parallel; show the user the better response (or auto-pick via judge). Replay a past session against a different agent / different model to compare. Shadow mode — new agent runs alongside production, no user-visible effect, enables measurement before cutover. Regression-test agent quality on yesterday's task corpus when a new model ships.

### 3.10 Caching

Tool-call cache: file unchanged since last read → cached read response, saves a tool round-trip. Subagent-result cache: a sub-agent did this lookup yesterday → cached, no re-run. Semantic prompt cache: prompt is semantically close to a recent one → reuse response with confirmation.

### 3.11 Tool governance / federation

Single MCP tool registry visible to every agent. Audit log of every tool call. Auto-approve / auto-deny rules ("approve all reads, prompt for writes") configured once at the proxy, applied universally. Tool execution containerized + gated by proxy — agents can't escape the sandbox even if the tool itself is buggy.

### 3.12 Multi-surface output

Proxy speaks ACP downstream, but upstream surfaces are pluggable: REST API, webhook stream, voice interface, Slack bot, IDE extension. Agent runs once, surfaces N ways. Multiple clients on one session = collaborative coding (two humans + one Claude on the same conversation).

### 3.13 Federation / multi-tenant

One proxy serves a team. Per-user quotas, per-team policies, per-project access. Cross-team tribe coordination through federated proxies (matrix-shape direction). Your team's silvercode talks to your team's tribe; your team's tribe federates with mine.

### 3.14 Compliance / data residency

Route by data classification — sensitive code stays in-region, non-sensitive routes to cheap-and-far. Audit logs satisfy SOC2/HIPAA. "Local-only mode" never leaves the network — the proxy enforces, the agent has no choice.

### 3.15 Personalization / preference learning

Track which responses the user accepts vs rejects across all agents. "User likes terse code, dislikes emojis, prefers tests-first" learned at the proxy from accept/reject patterns and applied to every agent the user uses. Independent of which agent is currently spawned.

### 3.16 Provenance / signing

Every tool call signed with the agent's session id. Cryptographic provenance: "this commit was generated by Codex on 2026-04-27 from this prompt sequence." Useful for code-review attestation, post-incident forensics, and compliance.

### 3.17 Long-running task management

Resume an interrupted session from any client. Background task queue holds work while the user closes the laptop; resumes when they open it. Distribute a long-running task across multiple agent sessions (chunked map-reduce: "review these 50 files in parallel, here's the summary").

### 3.18 Continuous improvement / training data

Proxy collects (prompt → response → outcome) tuples across all sessions. Used to train a router classifier ("this kind of prompt → use this agent at this tier"). Exported as eval datasets (PII-redacted) for fine-tuning custom routing models.

### 3.19 Deterministic replay

Every JSON-RPC message logged with timestamp + nonce. Replay session deterministically — fix bugs that only happened once. Bisect "where did Claude go wrong in this run." Same superpower as time-travel debugging in Redux, applied to coding-agent sessions.

### 3.20 Cross-product reuse

The same proxy infrastructure is used by silvercode (coding), km (knowledge work), pam (personal assistant), other future products. Agent capability + memory + tribe + governance shared across products. The user has one identity, one memory, one set of policies — independent of which product surface they're using right now.

---

## 4. Should tribe be the proxy?

**Yes.** silvercode is a UI app; tribe is infrastructure; infrastructure should host the proxy. Concretely:

### 4.1 tribe already has every property a control plane needs

- **Daemon shape.** Per-user UDS, lifecycle, idle-quit, hot-reload, plugin registration. Already there.
- **JSON-RPC substrate.** UDS-side JSON-RPC; ACP is JSON-RPC over stdio. Translation is a thin shim.
- **Cross-cutting state.** Recall (memory), broadcast / DM (ambient), federation roadmap (matrix-shape). All four of {memory, governance, observability, swarm} want to live where the user's existing tribe state already is.
- **Plugin composition.** `pipe(...)` + `withX` factories landed in `km-tribe.composition-pipe`. Each proxy capability becomes a `withX` plugin: `withRouting()`, `withCache()`, `withRedaction()`, `withAudit()`, `withReplay()`. Adding a capability = one line in the pipe.
- **Federation roadmap.** matrix-shape (`km-tribe.matrix-shape`) is on the books. A cross-machine ACP proxy is the natural extension of that direction, not a new architecture.

### 4.2 What changes structurally

```
TODAY                         FUTURE (tribe-as-acp-proxy)

silvercode                    silvercode
  ↓ ACP/stdio                   ↓ ACP/UDS
  spawned codex-acp             tribe (proxy + plugins)
  spawned gemini-cli              ↓ ACP/stdio (or pooled)
  spawned claude-acp              spawned agents (managed pool)
  spawned copilot
  spawned pi-acp
                              other clients (km, pam, voice, REST)
                                also speak ACP/UDS to tribe
```

- silvercode stops spawning agent subprocesses. Instead it opens an ACP session against tribe's UDS.
- tribe owns the agent fleet — pools, lifecycles, restarts, version pinning.
- The seven `acp-adapter-*.ts` files collapse to one ACP client (tribe-side router picks the upstream).
- Per-session timeline, cost dashboard, recall injection, governance rules become tribe plugins.

### 4.3 What stays in silvercode

- The UI. Composer, scrollback, side panel, inline ambient rows, mode chips, capability popovers.
- The user's mental model: "my coding workspace."
- Per-session UI state (which pane, which mode, which model selected — the *display* of these settings).

silvercode keeps its identity as the user-facing coding workspace; tribe gains a control-plane identity behind the scenes.

### 4.4 What this enables that's hard otherwise

- **Other products instantly become agent-capable.** km wants to ask an agent something? It opens an ACP session against the same tribe. pam wants to schedule a code-review job? Same. The proxy is the fan-in point.
- **Voice / Slack / web client surfaces.** Trivial once the proxy speaks ACP universally and exposes other surfaces as plugins.
- **Cross-product memory.** If recall is a tribe plugin, every product gets recall. Today recall is silvercode-only.
- **Cross-machine swarms.** matrix-shape + ACP proxy = my silvercode and yours coordinate through federated tribes; agents in either fleet can be tasked from either client.

### 4.5 Risks and open questions

- **Scope expansion.** tribe was per-project per-machine. Becoming a global agent proxy expands scope. Mitigation: each capability is a plugin; adoption is gradual; the per-project per-machine shape stays the default until federation is proven.
- **Lifecycle responsibility.** Today silvercode owns spawning. Moving spawn to tribe means crash recovery, version pinning, agent-fleet operations all become tribe concerns. Treat as a "structured concurrency" problem and use `@silvery/scope` patterns.
- **Latency tax.** Every proxy adds round-trip ms. Local UDS is ~µs; the tax is negligible. Cross-machine federation does add real ms — only invoke when needed.
- **Trust envelope.** The proxy sees every prompt + response + tool call. Highest-value attack target. Encryption at rest + immutable audit logs are table stakes. Key rotation + HSM for SOC2 if/when that becomes a real customer ask.
- **Agent-vendor relations.** Anthropic clarified the Claude Code header-spoofing rule already; if tribe spoofs as an "official" client to upstream, that's a violation. Solution: tribe is its own client; users authenticate to tribe; tribe authenticates to providers as itself.
- **Schema drift.** ACP is young. v2 will break things. The proxy is precisely where v1↔v2 translation lives during the transition window — this is a feature of being the proxy, not a downside.

---

## 5. The smallest shippable wedge

Don't build the whole proxy at once. Layer on opportunities in increasing order of payoff:

1. **Observability is free.** silvercode already proxies every JSON-RPC message; surface it as a per-session timeline + cost dashboard. Zero new architecture, immediate differentiator. Already most of the way there with `apps/silvercode/storybook/stories/UsageMeter.full.story.tsx`.
2. **Swarm injection** — already shipping in the ambient pipeline (km-silvercode.ambient-context-excellence). Phase 6.a inline display landed today.
3. **Cross-agent recall** — promote recall from silvercode-internal to a tribe-side plugin so any ACP client gets it.
4. **Auto-routing** — task classifier + tier routing. Pull from `bun llm pro` patterns.
5. **Tool governance** — single MCP registry behind tribe; one consent UI for all agents.
6. **Cross-product reuse** — open km / pam / future products to tribe's ACP listener.
7. **Cross-machine federation** — matrix-shape, when it exists.

Steps 1–3 don't require structural change to silvercode. Step 4+ start to need tribe to own agent spawning.

---

## 6. Strategic implications

### 6.a What becomes possible that wasn't before

- An agent that didn't ship Memory now has Memory.
- An agent that didn't ship telemetry is now observable.
- An agent that costs --15 per request can be auto-routed to a $0.50 alternative for 80% of tasks.
- Two agents talking to one user (collaborative review). Two users talking to one agent (pair programming). N agents in a swarm coordinated through one tribe (multi-agent orchestration).

### 6.b What gets commoditized

- Per-vendor "agent UI" apps (each agent vendor's bespoke client). The proxy + a thin universal UI replaces them.
- Per-vendor session management. The proxy owns sessions; vendor agents are stateless executors.
- Per-vendor billing. The proxy is the spend record; vendors are paid contractors.

### 6.c What gets newly valuable

- Routing intelligence. The classifier that picks the right agent for a task is the new product surface.
- Memory + recall infrastructure. Owns the user's relationship with their AI workflow over years.
- Cross-product agent identity. One memory across coding, knowledge work, personal assistance.

### 6.d Prior-art audit confirms the agent-in-the-middle category is open (2026-04-28)

A /deep prior-art audit on the persistent-sub-agent composition found **no exact match** in the gateway/proxy market. Specifically:

| Product | Category | Hosts persistent stateful sub-agent? |
|---|---|---|
| OpenRouter | LLM router | ❌ stateless |
| LiteLLM Proxy | LLM gateway | ❌ stateless |
| Portkey | LLM gateway | ❌ stateless |
| Helicone | LLM observability | ❌ stateless |
| Vercel AI Gateway | LLM gateway | ❌ stateless |
| LangSmith | tracing/observability | ❌ stateless |
| LangGraph Cloud | stateful agent graphs | ⚠️ could *build* it, not packaged |
| MCP servers / Continue | client-side orchestration | ❌ no proxy |

The gap is unique to the agent-protocol layer (ACP/MCP). LLM-API gateways exist; agent-protocol *transform* gateways exist (the §3.1–3.3 capabilities). What doesn't exist: gateways that **host persistent LLM sub-agents** that watch session events and emit deltas to the foreground agent.

If silvercode + tribe are the first to ship this composition: first-mover claim on a new category — "stateful agent gateways" or "agent-in-the-middle platforms."

Caveat: GPT-5.4 knowledge cutoff is Oct 2024. The 2025–2026 window has not been web-swept. Worth running an actual Deep Research API search before treating the category as definitively open.

Full audit: [`hub/tribe/design/recall-thought-prior-art-deep.md`](../../../tribe/design/recall-thought-prior-art-deep.md). Composition design: [`hub/tribe/design/recall-thought.md`](../../../tribe/design/recall-thought.md).

---

## 7. References

- **Live silvercode positioning:** `apps/silvercode/README.md` — "Multi-agent in one host" + "Use the subscription you already pay for."
- **Live ambient pipeline:** `hub/silvercode/design/ambient-context-safety.md`.
- **Live tribe composition:** `vendor/bearly/tools/lib/tribe/compose/` — the `withX` factories.
- **matrix-shape direction:** `km-tribe.matrix-shape` (cross-machine federation).
- **OpenRouter / LiteLLM / Helicone** — the LLM-proxy reference category. All transform-only — no persistent sub-agents.
- **Envoy / Istio** — the service-mesh reference category.
- **LSP** — `microsoft/language-server-protocol` — the editor-side proxy moment.
- **mem-thought composition design** — [`hub/tribe/design/recall-thought.md`](../../../tribe/design/recall-thought.md) — the persistent sub-agent that materializes the "agent-in-the-middle" pattern.
- **Prior-art audit** — [`hub/tribe/design/recall-thought-prior-art-deep.md`](../../../tribe/design/recall-thought-prior-art-deep.md) — /deep verdict: no exact match for the 6-trait composition (Oct 2024 knowledge cutoff caveat noted).
- **Generative Agents** (Stanford 2023) — closest conceptual cluster: agents with episodic memory, reflection, push observations to environment. Validates the "background mind-wandering" idea, doesn't preempt the IDE+proxy composition.
- **LangGraph Cloud** — could build this composition (stateful graphs + checkpoints), but not packaged with this shape.

---

## 8. Decision items if this gels into work

- File `km-tribe.acp-proxy` epic, with phase children for each wedge (1–7 above).
- Decide: tribe spawns agents, or silvercode keeps spawning and tribe is a transparent JSON-RPC pass-through? (Probably: tribe spawns once a real second client appears; silvercode-only continues to spawn until then.)
- Decide: what's the upstream protocol for tribe? Pure ACP, ACP++ (with `_meta` extensions), or a tribe-native superset that translates to ACP downstream?
- Coordinate with bearly maintainership — adding ACP listener + plugins materially expands tribe's surface area.

---

## 9. Naming — reserved namespaces (2026-04-27)

### 9.a Names actually grabbed (published as 0.0.1 placeholders by `beorno`)

24 unscoped names + 1 scoped, all registered on npm on 2026-04-27. All live, all owned by `beorno <bjorn@stabell.org>`, all parked at version `0.0.1`. Source of truth: [`.claude/skills/release/npm-packages.md`](../../../../.claude/skills/release/npm-packages.md) "Name Reservations" section.

- **First batch (17, ACP-direct + agent-prefix + ly-suffix + ambient + location-aware)**: see table 9.a-i below.
- **Second batch (8, expansion: numeric / observation / pool variants)**: see table 9.a-ii below.

Verify ownership of any one with `npm view <pkg> maintainers`. Verify the whole set with:

```bash
for pkg in acproxy acplane acplex acpdock acpmux proxyacp \
           agentplex agentward interagent crossagent agentanywhere \
           fleetly brokerly overhear overheard aiwhere aianywhere \
           agent7 agent9 agentall agentorb agentsea agentsee seegent; do
  echo "$pkg: $(npm view "$pkg" version 2>/dev/null) — $(npm view "$pkg" maintainers 2>/dev/null | head -1)"
done
# scoped:
npm view @beorno/chatly version
```

| Theme | Reserved (all live, all `0.0.1`) | What it evokes |
|---|---|---|
| **ACP-direct** | `acproxy`, `acplane`, `acplex`, `acpdock`, `acpmux`, `proxyacp` | Literal — what the thing is. Highest signal-to-search-friction. `acproxy` is the simplest. |
| **Agent-prefix** | `agentplex`, `agentward`, `interagent`, `crossagent`, `agentanywhere` | Broader brand — works if upstream goes beyond ACP (e.g., A2A, future agent protocols). |
| **`-ly` suffix family** | `fleetly`, `brokerly` | Matches `silvery` / `bearly` / `loggily` / `accountly`. Best continuity with the existing house style. |
| **Ambient / observation** | `overhear`, `overheard` | "I overheard that…" — the framing the agent uses for ambient blocks. Brandable beyond ACP into general observation infrastructure. |
| **Location-aware** | `aiwhere`, `aianywhere` | The "AI runs anywhere" pitch — works if cross-machine federation matures. |

**Maintenance note**: these are placeholder publishes. They have no `repository` field, no real `package.json` content, no README. When the actual product ships, the chosen name's published artifact gets replaced with a real package; the unused names stay as 0.0.1 squats. If a real owner emerges who wants one of the unused names and contacts us, transfer is cheap and worth doing.

### 9.b Top-3 recommended for the actual product (when it ships)

1. **`overhear`** — the user-facing brand. Captures the posture (the agent overhears peer activity, doesn't get instructions from it). Domain memorable. Works in marketing copy: "your agents overhear each other."
2. **`acproxy`** — the technical/CLI name. Direct, searchable, what it is. Ships as `acproxy` binary; the `overhear` brand is the product wrapper.
3. **`fleetly`** — strong fallback if a single-name product makes more sense than a brand+CLI split. Evokes "fleet management for agents," continuous with the existing namespace family.

**Naming heuristic** (from prior projects in this namespace):

- Library / primitive → ends in `-ly` or `-less` (loggily, termless).
- App / brand → noun (silvercode, accountly, kimmi).
- Daemon / tool → short and command-line-friendly (bd, tribe, recall, llm).

By that heuristic, an ACP proxy product would be:

- `overhear` (brand / product noun) — grabbed
- `acproxy` (CLI) — grabbed
- `@bearly/proxy` (npm package; lives under existing bearly scope) — not grabbed yet, scope is owned so it's available on demand

The proxy plugin code itself can live in `vendor/bearly/plugins/proxy/` — same shape as `vendor/bearly/plugins/tribe/`, `vendor/bearly/plugins/recall/`, `vendor/bearly/plugins/llm/`. No new repo needed for the implementation; the standalone names are reserved for marketing surfaces (homepage, npm search, CLI binary).

### 9.c Considered but NOT grabbed (still available)

These were on the candidate list but skipped — either because the unscoped name was similarity-blocked by an existing package or because the value proposition was lower than the 17 above. All remain available as `@beorno/<name>` if we want to claim them later.

- `acpd` — similarity-blocked unscoped (collides with `acdc`-class names); `@beorno/acpd` available.
- `agentfleet`, `agenthub`, `openacp`, `anyagent` — all bare-similarity-blocked unscoped; all available as `@beorno/<name>`.

### 9.d Rejected (taken or actively-published — would need npm dispute)

- `acp` — `samt` 2022 alpha. Could be disputed but takes weeks.
- `multiagent` — `ahelmberger` 2.1.0 (2022 — dormant but published, dispute uncertain).
- `agentx` — `jacksontian` 1.10.8 (2022, multi-maintainer, likely active).
- `overai` — `overai` 1.4.31 (2026-02 — actively published, off-limits).
- `aigent` — `eumemic` 0.0.1 (2023 — dormant single-version; disputable).
- `xagent` — `hyj1991` 0.0.0 (2022 — placeholder; disputable).
- `ensemble`, `murmur`, `acdc` — 2022-era abandoned but published.
