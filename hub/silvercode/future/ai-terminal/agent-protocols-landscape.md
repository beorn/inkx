# Agent protocol landscape (2026-04-27)

**Status:** design / landscape research. Maps the agent-protocol ecosystem as of April 2026, compares standards across the same dimensions, identifies gaps, and informs naming + positioning for our [ACP gateway venture](../../../ventures/acp-proxy-2026-04-27.md) (#11) and [event-type spec](./agentroom-event-spec.md).

**Why this exists:** the space stratified faster than expected. As of mid-2026 there are 9+ named protocols across 3-4 distinct problem layers, plus a load-bearing naming collision (two unrelated standards both called "ACP"). Without an explicit landscape view, our docs and venture analysis were ambiguous.

---

## Summary — three problem layers, distinct winners

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4 — Humans + agents in a shared chat room                 │
│   ❌ NO STANDARD (the niche we identified)                       │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3 — Editor / host ↔ agent (one user, one agent)            │
│   ✅ ACP-Zed (Agent Client Protocol)                             │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2 — Agent ↔ agent (two or more agents coordinate)         │
│   ✅ A2A (Agent2Agent, Google → Linux Foundation)                │
│   📛 also: ACP-IBM (Agent Communication Protocol, BeeAI)         │
│   🧪 also: ANP, AITP, Agora, LMOS (early / niche)                │
├─────────────────────────────────────────────────────────────────┤
│ Layer 1 — Agent ↔ tools                                          │
│   ✅ MCP (Model Context Protocol, Anthropic, multi-vendor)       │
└─────────────────────────────────────────────────────────────────┘

Adjacent: framework-internal (LangGraph), channel-bot (MS Bot Framework
Activity), W3C standards-track (CG draft 2026-2027).
```

The unfilled niche — Layer 4 — is the venture target. Layers 1-3 each have a clear winner; the agent-protocol space is *not* uniformly contested.

---

## Per-protocol detail

### MCP — Model Context Protocol (Layer 1)

**One-liner:** standard for connecting agents to tools, resources, and prompts.

| Dimension           | Detail                                                                  |
| ------------------- | ----------------------------------------------------------------------- |
| Owner / governance  | Anthropic, multi-vendor adopters (Microsoft, Google, OpenAI now compat) |
| Wire                | JSON-RPC 2.0 over stdio (subprocess) or SSE (HTTP)                      |
| Resource types      | Tools, Resources, Prompts                                               |
| Roles               | Server (exposes tools), Client (consumes), Host (orchestrator)          |
| Multi-agent         | None — strict 1:1 between agent (client) and tool server                |
| Multi-user          | None — not a chat protocol                                              |
| Persistence         | None defined                                                            |
| Streaming           | Yes (JSON-RPC notifications)                                            |
| Discovery           | tools/list, resources/list, prompts/list                                |
| Federation          | None                                                                    |
| Encryption          | Transport-level (TLS for SSE); no E2E                                   |
| License             | OSS, multiple SDKs (TypeScript, Python, Go, Rust)                       |
| Maturity (mid-2026) | De facto standard; 1000+ MCP servers in registry; ubiquitous            |

**Status:** won its layer. Every agent that calls tools speaks MCP or wraps it.

---

### A2A — Agent2Agent (Layer 2 winner)

**One-liner:** standard for autonomous agents to coordinate, delegate tasks, and share context across organizational/framework boundaries.

| Dimension           | Detail                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Owner / governance  | Google originated April 2025; donated to Linux Foundation; IBM and Microsoft adopting                   |
| Wire                | JSON-RPC 2.0 over HTTP + Server-Sent Events; gRPC support added 2026                                    |
| Resource types      | Tasks, Messages, Artifacts                                                                              |
| Multi-agent         | Native — that's the whole protocol                                                                      |
| Multi-user          | Limited — supports human-in-the-loop as async approval, not as chat                                     |
| Persistence         | Each agent maintains its own memory; A2A enables exchange but doesn't store                             |
| Context             | contextId — logical grouping of related Tasks/Messages for multi-turn continuity                        |
| Discovery           | Agent Card — JSON metadata advertising capabilities; signed in 2026 release                             |
| Streaming           | SSE for real-time progress                                                                              |
| Async               | Push notifications via webhook for long-running tasks                                                   |
| Task lifecycle      | pending → in-progress → completed / failed                                                              |
| Federation          | Implicit via HTTP — any A2A endpoint can call any other                                                 |
| Encryption          | TLS; signing of Agent Cards (2026); no message-level E2E                                                |
| License             | OSS, Linux Foundation hosted                                                                            |
| Maturity (mid-2026) | The Layer 2 standard. Spring AI integration, LangChain Agent Server has A2A endpoint, IBM/MSFT adoption |

**Status:** won Layer 2 by mid-2026. Linux Foundation hosting + multi-vendor adoption sealed it.

---

### ACP-Zed — Agent Client Protocol (Layer 3 winner)

**One-liner:** standard for editors / coding-agent hosts to talk to subprocess-spawned agents.

| Dimension           | Detail                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner / governance  | Zed Industries; growing third-party adoption (codex-acp, gemini-cli, claude-acp, copilot, pi-acp)                                                                                    |
| Wire                | JSON-RPC 2.0 over stdio (one process pair = one session)                                                                                                                             |
| Resource types      | Session, prompt, response, tool call, content blocks                                                                                                                                 |
| Multi-agent         | None — strict 1:1 (one client process ↔ one agent process)                                                                                                                           |
| Multi-user          | None — not a chat protocol                                                                                                                                                           |
| Persistence         | Session IDs + session/load for resume, but no session storage format defined — each agent rolls its own (Claude Code: ~/.claude/projects/<proj>/<id>.jsonl; Codex: own format; etc.) |
| Streaming           | Yes (JSON-RPC notifications)                                                                                                                                                         |
| Discovery           | initialize returns capabilities                                                                                                                                                      |
| Federation          | None                                                                                                                                                                                 |
| Encryption          | None — local stdio                                                                                                                                                                   |
| License             | OSS                                                                                                                                                                                  |
| Maturity (mid-2026) | Standard for coding-agent hosts; ~6 reference agents implement it; less ubiquitous than MCP but growing                                                                              |

**Status:** won Layer 3 within the coding-agent niche. Editor/host ↔ agent is its sole concern.

---

### ACP-IBM — Agent Communication Protocol (alternative Layer 2 / Layer 3)

**Naming collision** — same acronym as Zed's ACP, completely different protocol. Going to confuse people for years.

**One-liner:** REST-based agent runtime + discovery protocol paired with the BeeAI platform.

| Dimension           | Detail                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Owner / governance  | IBM Research; Linux Foundation hosted; paired with BeeAI                                  |
| Wire                | REST (HTTP + JSON bodies); no SDK required (curl-friendly)                                |
| Resource types      | Agents, tasks                                                                             |
| Discovery           | Offline-friendly — agents embed metadata in distribution packages, supports scale-to-zero |
| Federation          | HTTP-native                                                                               |
| Persistence         | Agent-defined                                                                             |
| Multi-agent         | Yes via BeeAI orchestration                                                               |
| Multi-user          | Limited                                                                                   |
| License             | OSS, Linux Foundation                                                                     |
| Maturity (mid-2026) | Lost the Layer 2 standards war to A2A; still active in IBM/BeeAI ecosystem                |

**Status:** likely fades into BeeAI-platform-specific use; A2A is the broader winner. Naming collision with ACP-Zed is the lasting damage.

---

### ANP — Agent Network Protocol (Layer 2 alternative, niche)

**One-liner:** DID-based protocol for open, decentralized agent networks.

| Dimension           | Detail                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Owner / governance  | Open-source community                                               |
| Identity            | DIDs (Decentralized Identifiers, W3C)                               |
| Wire                | HTTP + JSON-LD                                                      |
| Federation          | Native (decentralized by design)                                    |
| Multi-agent         | Yes                                                                 |
| Maturity (mid-2026) | Niche; appeals to web3 / decentralization advocates; not mainstream |

**Status:** alternative to A2A for users who want decentralized identity. Real but small.

---

### AITP — Agent Interaction & Transaction Protocol (Layer 2, commerce-focused)

**One-liner:** secure economic transactions between agents (payments, contracts).

| Dimension | Detail                                                      |
| --------- | ----------------------------------------------------------- |
| Focus     | Agent-to-agent commerce — payment, escrow, contract signing |
| Maturity  | Early; growing as agent commerce becomes a real category    |

**Status:** orthogonal to chat — economic-transaction semantics agents need when paying each other. Not in our space.

---

### Agora (research, Layer 2)

**One-liner:** LLM-negotiated protocols — agents agree on a wire format per conversation.

| Dimension | Detail                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Approach  | First message in a conversation negotiates the protocol; agents use LLM intelligence to settle on JSON / Protobuf / English / etc. |
| Maturity  | Research-shaped; not standardized                                                                                                  |

**Status:** interesting for "no protocol pre-agreed" scenarios but adds latency + uncertainty. Niche.

---

### LMOS — Language Model Operating System (Layer 2/3, framework)

**One-liner:** platform for orchestrating cross-framework agent interoperability.

**Status:** Eclipse Foundation project; less mindshare than A2A. More framework than protocol.

---

### MS Bot Framework Activity Schema (Layer 4-adjacent, channel bots)

**One-liner:** event-driven activity schema for chat bots across Slack/Teams/Webex/etc., with multi-agent orchestration as of April 2026.

| Dimension      | Detail                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Owner          | Microsoft                                                                                                          |
| Wire           | HTTP + Activity JSON schema                                                                                        |
| Channels       | Slack, Teams, Webex, M365 Copilot, Telegram, SMS, Email, Webchat                                                   |
| Activity types | message, conversationUpdate, event, invoke, messageReaction, handoff, trace, typing, ...                           |
| Multi-agent    | Orchestration-level (one fronting agent + N specialists), not peer-agents-in-room. GA April 2026 in Copilot Studio |
| Multi-user     | Yes (group chat in Teams)                                                                                          |
| Persistence    | Bot state via Bot Builder SDK (Cosmos / blob storage)                                                              |
| Streaming      | Limited — bots typically batch response                                                                            |
| Federation     | Per-channel (each channel is its own federation domain)                                                            |
| Maturity       | Mature; production deployments at enterprise scale                                                                 |

**Status:** the closest existing thing to "agent in a multi-user chat" today, but **bot-shaped not peer-agent-shaped**. Multi-agent in Bot Framework = "smart routing under one bot," not "N peer agents in one room talking to each other and the user."

---

### LangGraph (Layer 3-internal, framework)

**One-liner:** Python framework for stateful multi-agent systems; checkpointers persist state.

| Dimension     | Detail                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------- |
| Owner         | LangChain Inc. ($1.25B unicorn, Oct 2025)                                                      |
| Approach      | StateGraph (nodes + edges); thread_id for resumption                                           |
| Persistence   | MemorySaver / SqliteSaver / PostgresSaver / MongoDB checkpointers; AgentState Python dataclass |
| Multi-agent   | Yes — multiple nodes can be agents with shared state                                           |
| Wire protocol | None — internal Python; LangChain Agent Server now has A2A endpoint for external interop       |
| Maturity      | Mainstream framework; v1.0 milestone reached 2026                                              |

**Status:** the dominant Python multi-agent framework. Now speaks A2A externally for interop. **Not a wire protocol** — schema is Python-internal, doesn't help us.

---

### W3C AI Agent Protocol Community Group (Layer 2/4, standards-track)

**One-liner:** working toward official web standards for agent communication.

| Dimension | Detail                                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| Status    | CG (Community Group), working drafts 2026-2027                                      |
| Scope     | Likely agentic-web standards complementing existing W3C work (DID, VC, Solid, etc.) |
| Maturity  | Pre-standards; multi-year horizon                                                   |

**Status:** worth watching but won't ship in time to compete with A2A's incumbency. Likely ratifies what's already deployed.

---

## Comparison matrix

### By problem layer

| Protocol                   | L1 (tools)  | L2 (agent↔agent) | L3 (editor↔agent) | L4 (humans+agents in room) |
| -------------------------- | ----------- | ---------------- | ----------------- | -------------------------- |
| MCP                        | ✅ winner    | —                | —                 | —                          |
| A2A                        | —           | ✅ winner         | —                 | partial (HITL)             |
| ACP-Zed                    | —           | —                | ✅ winner          | —                          |
| ACP-IBM                    | —           | also             | —                 | —                          |
| ANP                        | —           | also             | —                 | —                          |
| AITP                       | —           | (commerce only)  | —                 | —                          |
| Agora                      | —           | research         | —                 | —                          |
| LMOS                       | —           | framework        | framework         | —                          |
| MS Bot Activity            | —           | (orchestration)  | —                 | partial (bot-shaped)       |
| LangGraph                  | (callable)  | (callable)       | —                 | —                          |
| org.agentroom.* (proposed) | (rides MCP) | (rides A2A)      | (rides ACP-Zed)   | ✅ target                   |

### By technical attribute

| Protocol           | Wire                         | Multi-agent   | Streaming | Federation   | Persistence            | Encryption               |
| ------------------ | ---------------------------- | ------------- | --------- | ------------ | ---------------------- | ------------------------ |
| MCP                | JSON-RPC stdio/SSE           | ❌             | ✅         | ❌            | ❌                      | TLS only                 |
| A2A                | JSON-RPC HTTP+SSE / gRPC     | ✅             | ✅         | ✅            | ❌                      | TLS + signed Agent Cards |
| ACP-Zed            | JSON-RPC stdio               | ❌             | ✅         | ❌            | session ID handle only | local stdio              |
| ACP-IBM            | REST                         | ✅             | ✅         | ✅            | ❌                      | TLS                      |
| ANP                | HTTP+JSON-LD                 | ✅             | ?         | ✅ (DID)      | ❌                      | DID-signed               |
| MS Bot Activity    | HTTP JSON                    | orchestration | limited   | per-channel  | bot-side               | TLS                      |
| LangGraph          | n/a (Python)                 | ✅             | ✅         | ❌            | ✅ checkpointers        | per-backend              |
| Matrix (transport) | HTTP+JSON                    | ✅             | ✅         | ✅ native     | ✅ event log            | E2E (Olm/Megolm)         |
| org.agentroom.*    | piggyback on Matrix or JSONL | ✅             | ✅         | ✅ via Matrix | ✅ via JSONL/vault      | E2E via Matrix           |

### By openness

| Protocol         | License                     | Governance                           | Reference SDKs                             |
| ---------------- | --------------------------- | ------------------------------------ | ------------------------------------------ |
| MCP              | OSS                         | Anthropic-led, multi-vendor adopters | TypeScript, Python, Go, Rust               |
| A2A              | OSS                         | Linux Foundation                     | Python, JS, Java, .NET                     |
| ACP-Zed          | OSS                         | Zed Industries                       | Rust (canonical), TS adapters              |
| ACP-IBM          | OSS                         | Linux Foundation (BeeAI)             | Python (BeeAI SDK)                         |
| ANP              | OSS                         | Open community                       | Python, JS                                 |
| MS Bot Framework | OSS SDK + proprietary cloud | Microsoft                            | C#, JS, Python, Java                       |
| LangGraph        | OSS                         | LangChain Inc.                       | Python (canonical), JS                     |
| Matrix           | OSS                         | matrix.org Foundation                | Many (matrix-bot-sdk, matrix-js-sdk, etc.) |

---

## Naming collision deep-dive — the two ACPs

|                 | ACP-Zed                                                         | ACP-IBM                      |
| --------------- | --------------------------------------------------------------- | ---------------------------- |
| Full name       | Agent Client Protocol                                           | Agent Communication Protocol |
| Year            | 2024                                                            | 2024                         |
| Owner           | Zed Industries                                                  | IBM Research                 |
| Hosting         | Zed's GitHub                                                    | Linux Foundation (BeeAI)     |
| Wire            | JSON-RPC over stdio                                             | REST (HTTP + JSON)           |
| Layer           | Editor↔agent (Layer 3)                                          | Agent↔agent (Layer 2)        |
| Adoption        | claude-code, codex-acp, gemini-cli, claude-acp, copilot, pi-acp | BeeAI ecosystem              |
| Status mid-2026 | Won Layer 3 (coding-agent niche)                                | Lost Layer 2 to A2A          |

**Working terminology** in this doc and our other design docs:

- "ACP" alone: ambiguous — never use unqualified
- "ACP-Zed" or "Zed ACP" or "Agent Client Protocol": the editor↔agent one (our gateway target)
- "ACP-IBM" or "IBM ACP" or "Agent Communication Protocol": the IBM one
- "A2A" or "Agent2Agent": the Layer 2 winner

---

## Layer-4 gap analysis — the unfilled niche

**Layer 4 is categorically distinct from A2A**, despite both involving multiple agents. The distinction:

- **A2A** = agents call each other (no humans in the call). Async-friendly, opaque-by-design, push-notification-shaped HITL. RPC-like.
- **Layer 4** = humans + agents share a workspace. Real-time, transparent (humans see agent activity), governance built-in, persistent timeline. Chat-room-like.

A protocol in one category cannot fill the other's role: A2A doesn't model humans-as-participants, and Layer 4 isn't an agent-runtime (the agents in a Layer 4 room may still speak A2A among themselves to delegate, but that's *inside* the workspace primitive, not the workspace itself).

What does Layer 4 actually need?

| Requirement                                                                       | Met by existing protocols?                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Multiple agents sending messages, attributed by agent_id                          | Partially — A2A has contextId but not "multi-agent in same room" semantics; MS Bot Framework is one-bot-per-conversation |
| Multiple humans participating with permission gates                               | Matrix-native; no agent-protocol gives this                                                                              |
| Tool calls visible to humans + other agents in the room                           | None do this — MCP is private agent↔server; A2A passes opaque artifacts                                                  |
| Streaming responses visible incrementally                                         | A2A has SSE for one-recipient; chat protocols have message edits                                                         |
| Federation across organizations                                                   | Matrix native; A2A native at HTTP level (different shape)                                                                |
| End-to-end encryption                                                             | Matrix native (Olm/Megolm); no agent protocol has this                                                                   |
| Persistent vault-native session storage                                           | None — every protocol punts to "agent-defined"                                                                           |
| Cross-protocol agent participation (one room, mix of A2A agents + ACP-Zed agents) | None — each protocol is its own silo                                                                                     |
| Spec-track adoption path (MSC, IETF, W3C)                                         | Possible via MSC for Matrix-shaped events                                                                                |

**The gap is Layer 4: humans-and-agents-shared-room.** Not a single existing protocol fills it. The closest is Microsoft's Bot Framework + Copilot Studio multi-agent orchestration (April 2026), but that's:

1. Bot-shaped (one fronting bot delegates to specialists, not N peer agents)
2. Microsoft-platform-locked (Teams / M365 Copilot)
3. Not federated across organizations
4. Proprietary cloud + OSS SDK split

### Two architectural primitives that are universally missing

**Agent-in-the-middle (compute platform)**: a persistent in-session LLM sub-agent co-resident with the proxy/gateway. Watches all wire traffic, maintains compiled-knowledge state via prompt caching, injects context deltas into foreground prompts. Per /deep prior-art audit (2026-04-28), **every product in the LLM-gateway category is transform-only** — OpenRouter, LiteLLM Proxy, Portkey, Helicone, Vercel AI Gateway, LangSmith. None hosts a persistent stateful sub-agent. CDN→edge-compute is the precedent (Cloudflare Workers); this is its agent-protocol analog and remains uncontested.

**Coordination layer (shared agent state)**: room-scoped derived state for shared todos, atomic claims, soft/hard locks, decisions, findings, dependencies, handoffs. Operating-system primitives (locks/queues/semaphores) and distributed-systems primitives (consensus/etcd/CRDT) at agent-protocol scale. ACP gives the *signal* (`session/update plan` notifications, Claude Code's TodoWrite) but no *layer*. Every existing protocol punts:

| Protocol         | Coordination support                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| MCP              | None — agent↔tool only                                                  |
| A2A              | contextId for grouping; no shared room state, no atomic claim, no locks |
| ACP-Zed          | Per-agent plan events; no room-scope, no claim semantics                |
| ACP-IBM          | None                                                                    |
| MS Bot Framework | Bot state per-bot; no peer-agent coordination                           |
| LangGraph        | Framework-internal AgentState; not exchangeable across agents           |

This is the second uncontested primitive. Combined with agent-in-the-middle, it forms the actual platform layer that Layer 4 needs.

---

## Matrix's agent gap — substrate built, vocabulary missing

Worth a dedicated section because Matrix is the obvious-seeming candidate to fill Layer 4 but hasn't, and understanding *why* sharpens the venture positioning.

### What Matrix has

| Capability                                                        | Status                                                                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bots via matrix-bot-sdk, matrix-nio                               | ✅ Mature; bots are users with display-name conventions                                                  |
| Application Services (matrix-appservice-*)                        | ✅ Privileged bots/bridges that own user namespaces; closest existing primitive to "managed agent fleet" |
| maubot (Python bot framework)                                     | ✅ De facto botkit                                                                                       |
| Element Widgets                                                   | ✅ Embedded UI in rooms; could host agent UI                                                             |
| Custom event types                                                | ✅ Anyone can m.send any event type — this is what org.agentroom.* rides                                 |
| Threading, edits (m.replace), reactions, redactions               | ✅ Chat-shaped features that could be repurposed for streaming/cancellation                              |
| Federation (homeserver-to-homeserver)                             | ✅ Native, mature                                                                                        |
| E2E encryption (Olm/Megolm)                                       | ✅ Per-room                                                                                              |
| Mobile clients (Element X), 3rd-party clients (Cinny, FluffyChat) | ✅ Cross-platform                                                                                        |

### What Matrix lacks

| Capability                         | Status                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Standardized "agent" identity type | ❌ Agents are just users with vibes; no Agent Card analog                  |
| First-class tool-call event type   | ❌ Bots do tool calls off-Matrix and report results as plain messages      |
| Streaming-response convention      | ❌ m.replace-edits-to-placeholder is a workaround, not a design            |
| Agent capability advertisement     | ❌ No standard "what can this bot do?" query                               |
| Agent-shaped permission model      | ❌ Power levels treat humans and bots identically; no per-tool granularity |
| Agent-targeted MSC merged          | ❌ Community discussions exist; nothing has crossed the line               |
| Element X "AI assistant"           | ⚠️ Generic ChatGPT-style sidebar, not agent-room model                    |

### Why the gap exists (best read)

1. **Matrix Foundation priorities** — heads-down on E2E encryption, Synapse → Dendrite performance, federation hardening, govt/enterprise compliance. AI agents haven't been on the roadmap.
2. **Element's enterprise focus** — they sell to governments (UK, France, Germany, NATO via Element Server Suite). Roadmap is sovereignty/compliance/scale. No incentive to push consumer AI features.
3. **AI urgency is recent** — agent UX needs (streaming, tool calls, multi-agent rooms) only became urgent post-ChatGPT (late 2022). Matrix's mental model is 2014-era ("humans communicating, bots help sometimes"). A 2-3-year cultural lag isn't surprising.
4. **MSC process is slow** — major Matrix Spec Changes take years. Even a willing author can't speedrun this.
5. **Bots-as-edge-cases** — inverting to "agents as peer participants under human governance" requires a fundamental UX rethink that Matrix hasn't done.
6. **Element X's AI assistant reinforces #5** — they shipped a generic AI chat sidebar, not an agent-room model. Single-bot integration, not ecosystem.

### Why the gap is the opportunity (and not a threat)

Matrix being silent on this is the *best* possible market condition for our venture:

- **Substrate is built, vocabulary is missing** — we don't have to build a chat protocol; we author event types on top of one that's already mature (60M users), federated, encrypted, and cross-platform-clientized.
- **Element will likely accept a well-designed MSC** — same playbook as `matrix-appservice-slack` / `matrix-appservice-irc`. They reward "working implementation + clean spec proposal" because they don't have to build it.
- **First-mover-with-good-design wins** — same dynamic that made MCP Anthropic's and A2A Google's. The vocabulary author becomes the de facto authority.
- **Element X's AI sidebar doesn't compete with us** — sidebar = "ChatGPT-in-DM"; our framing = "peer agents in shared rooms with multi-human + multi-agent governance." Different products, complementary not competitive.

### Verification before committing engineering

This thesis depends on Element / Matrix Foundation not having pre-announced an `m.agent` MSC. The thesis should be verified with a focused web search before real engineering time goes into the gateway. If they *have* shipped or pre-announced something, we either align (joint editorship) or pivot. **Default action: do this verification at venture-claim time, not now.**

---

## Implications for our work

### 1. The venture is the right shape

Layer 4 is genuinely empty. Our [acp-proxy gateway venture](../../../ventures/acp-proxy-2026-04-27.md) (#11, scoring 23/25) plus [vault-as-session-storage](../../../ventures/acp-proxy-2026-04-27.md) (#12, 22/25; combined cluster 24-25/25) targets the gap directly.

### 2. The naming should change

`org.agentroom.*` is ambiguous given the two-ACPs collision.

**`org.a2a.*` is wrong** — A2A literally means *Agent-to-Agent*. The moment a human is in the room, it's no longer A2A by definition. Naming our humans-and-agents events `org.a2a.*` would be a category error and would actively mislead implementers about what the events represent.

This rules out `org.a2a.room.*` and any A2A-prefixed namespace, regardless of A2A's standardization weight. Layer 4 is **not a sub-layer of A2A** — it's a different category of protocol:

- **A2A** is an *agent-runtime* protocol — opaque agents call each other, push notifications for async HITL approval, no concept of shared real-time workspace.
- **Layer 4** is a *workspace* protocol — humans + agents share a continuous timeline, see each other's activity in real-time, agents are first-class participants under human governance, the room itself is the unit of state.

A2A is closer in spirit to gRPC than to Slack; Layer 4 is closer to Slack than to gRPC. Same wire format family (JSON-RPC, JSON), totally different semantics.

**Viable namespaces:**

- **`org.agentroom.*`** — neutral, descriptive, signals "agents in a room with humans." The room is the abstraction; agents inside can speak A2A or ACP-Zed downstream.
- **`org.workroom.*`** — variant emphasizing collaborative workspace.
- **`org.openroom.*`** — generic; fits a hosted-product brand more than a community standard.

**Recommendation: `org.agentroom.*`** — it correctly names what the events describe (a *room* with *agents*, with humans implicit as the room's participants). The MSC submission would propose `org.agentroom.v1.*` events as Matrix room state, with explicit rationale that this is **complementary to A2A, not a layer of A2A** — A2A is what some agents in the room may speak among themselves; the room itself is the workspace primitive.

### 3. The gateway should bridge multiple protocols downstream

Original design: ACP-Zed ↔ Matrix. Revised design: **multi-protocol gateway with adapters per agent transport**:

```
                     ┌────────────────────────────────┐
                     │   Room substrate (Matrix or    │
                     │   km vault JSONL)              │
                     │   org.agentroom.* events       │
                     └────────────────────────────────┘
                            ↑      ↑      ↑
              Adapters: ┌───┘      │      └────┐
                        ↓          ↓           ↓
             ┌────────────────┐  ┌──────────┐  ┌────────────┐
             │  ACP-Zed agent │  │ A2A      │  │ MS Bot Fwk │
             │  (claude-acp,  │  │ agent    │  │ Activity   │
             │   codex-acp,   │  │ (any A2A │  │ (Teams,    │
             │   gemini-cli)  │  │ endpoint)│  │  Slack via │
             │                │  │          │  │  bridge)   │
             └────────────────┘  └──────────┘  └────────────┘
```

This is a much stronger position than ACP-only:

- **Reach** — every agent that speaks A2A (most of them by 2026) plugs in.
- **Interop** — coding-host ACP-Zed agents and headless A2A agents can be in the *same room* (something nobody else offers).
- **Hedge** — if ACP-Zed loses momentum, we keep working via A2A.
- **Standards posture** — submitting `org.agentroom.*` MSC backed by interop with both winning protocols makes adoption likely.

### 4. The km-vault-as-storage substrate is more valuable than originally scored

Every agent protocol punts on session format — MCP, A2A, ACP-Zed, ACP-IBM, ANP all leave persistence to implementations. LangGraph's checkpointer is Python-only. Bot Framework's bot state is per-bot SDK.

There is **no cross-protocol portable session format** for agent conversations. The vault-as-storage substrate (#12) fills that gap with a JSONL format using `org.agentroom.*` vocabulary. That makes it more strategically valuable than the standalone score (22/25) suggests — it's the missing universal persistence layer.

### 5. Re-cast venture #11 score and the four-piece stack

The venture analysis decomposes into four complementary pieces, each a distinct architectural primitive:

| #   | Layer                                                                                                 | Score | Notes                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------- |
| #11 | Wire (agentroom gateway, A2A + ACP-Zed bridges, org.agentroom.* MSC)                                  | 24/25 | The bridge — moves bytes, authors the spec                              |
| #12 | Storage (km vault as canonical session JSONL; rooms = KNodes)                                         | 22/25 | The disk — durable, portable, vault-native                              |
| #13 | Coordination (shared todos/locks/decisions/findings as room-scoped events)                            | 23/25 | The logic — derived state across agents; "agent collaboration database" |
| #14 | Compute platform (agent-in-the-middle: recall-thought, critic, style-watcher, test-runner sub-agents) | 21/25 | The platform — Cloudflare-Workers analog; persistent LLM sub-agents     |

Combined cluster (#11 + #12 + #13 + #14) hits **25/25 ceiling effect**. CDN→edge-compute is the right competitive reference: Cloudflare ($30B+ valuation) came from Workers, not CDN; Kong ($2B) is gateway-only. Same arc applies — substrate is the start, compute is the moat, coordination is the customer lock-in.

Original framing scored #11 alone at 23/25 as "ACP-to-Matrix gateway." Revised framing as **"agentroom gateway: humans+agents Layer 4 substrate, bridges A2A and ACP-Zed agents into a shared room, authors `org.agentroom.*` MSC"**:

| Real | Win | Worth | Wedge | Moat | Score | Kill? |
| ---- | --- | ----- | ----- | ---- | ----- | ----- |
| 5    | 5   | 5     | 4     | 5    | 24    | —     |

- **Real (5 → 5)** — A2A's standardization confirms the demand pattern at scale.
- **Win (4 → 5)** — bridging A2A *and* ACP-Zed (and providing the Layer 4 substrate they both lack) is uniquely defensible. No competitor does both protocols.
- **Worth (5 → 5)** — same TAM; arguably bigger because A2A's audience is broader than ACP-Zed's coding niche.
- **Wedge (4 → 4)** — adds adapter scope (~+1 week for A2A adapter on top of ACP-Zed); MVP still ~3 weeks not 2.
- **Moat (5 → 5)** — spec authorship of `org.agentroom.*` + multi-protocol bridging position together.

Total: **24/25**, the highest in the file. This venture is no longer "a strong product" — it's "the canonical Layer 4 substrate, authoring the only standard for the layer, bridging both winners of Layer 2 and Layer 3."

---

## Re-evaluation triggers

Re-read this landscape doc when:

- W3C AI Agent Protocol CG ships a working draft (likely 2026 H2).
- Anthropic ships a chat-room-shaped extension to MCP.
- A2A v2 ships breaking changes.
- Microsoft makes Copilot Studio multi-agent open / federated.
- Element / Matrix.org adopts an `org.agentroom.*` or `org.agentroom.*` MSC from any author.
- Cursor ships multi-agent UI.
- A new protocol enters the space with credible adoption.

Default re-read cadence: 6 months.

---

## References

- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [a2aproject/A2A on GitHub](https://github.com/a2aproject/A2A)
- [A2A donation to Linux Foundation announcement](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [O'Reilly: Designing Collaborative Multi-Agent Systems with A2A](https://www.oreilly.com/radar/designing-collaborative-multi-agent-systems-with-the-a2a-protocol/)
- [Survey of Agent Interoperability Protocols (arXiv 2505.02279)](https://arxiv.org/html/2505.02279v1) — academic consolidation
- [MCP (modelcontextprotocol.io)](https://modelcontextprotocol.io/)
- [Zed ACP (Agent Client Protocol)](https://github.com/zed-industries/agent-client-protocol)
- [IBM ACP (Agent Communication Protocol)](https://www.ibm.com/think/topics/agent-communication-protocol)
- [BeeAI platform (IBM)](https://research.ibm.com/blog/multiagent-bee-ai)
- [Microsoft Copilot Studio multi-agent (April 2026 GA)](https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/new-and-improved-multi-agent-orchestration-connected-experiences-and-faster-prompt-iteration/)
- [LangGraph state management 2026](https://docs.langchain.com/oss/python/langchain/short-term-memory)
- [W3C AI Agent Protocol Community Group](https://www.w3.org/community/ai-agent-protocol/)
- [Matrix Specification](https://spec.matrix.org/)
- [`hub/silvercode/future/ai-terminal/acp-proxy.md`](./acp-proxy.md) — gateway venture brainstorm
- [`hub/silvercode/future/ai-terminal/agentroom-event-spec.md`](./agentroom-event-spec.md) — event-type sketch (will rename `org.agentroom.*` → `org.agentroom.*` in next iteration per §3 above)
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md) — venture #11 + #12 scoring

