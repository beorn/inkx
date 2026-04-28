# agentroom — positioning

**Status**: design doc, 2026-04-28. Extracted from [`hub/km/design/strategy-brainstorm-2026-04-28.md`](../strategy-brainstorm-2026-04-28.md). Source for full context, scoring, and family map.

---

## One-line definition

Open ACP↔Matrix bridge gateway + paid managed cloud. **Confluent → Apache Kafka shape**: open spec + reference implementation, paid managed-cloud differentiator.

## Position in the layered architecture

| Component | Role |
|---|---|
| silvery | UI to interact with agents |
| tribe | the wire — protocol + event vocabulary by which agents coordinate |
| **agentroom** | **the cloud runtime / managed gateway that runs tribe + routes ACP traffic** |
| `.brain` | the agent format |
| km | the canonical agent workspace |
| silvercode | canonical agent client |

## The four-layer venture stack

| Layer | Component | /pro v3 score | What it does |
|---|---|---|---|
| L1 | ACP↔Matrix bridge + spec authorship (#11) | 24/25 | Routes ACP into Matrix federation + direct Slack/Discord adapters; authors `org.agentroom.*` MSC. The substrate. |
| L2 | Vault session storage (#12) | 22/25 | `org.agentroom.*` events serialized as JSONL + markdown round-trip; km vault as canonical session store. |
| L3 | Coordination state (#13) | 23/25 | Derived todos / locks / decisions / findings / handoffs / asks. The "agent collaboration database." |
| L4 | Agent-in-the-middle platform (#14) | 21/25 | Cloudflare Workers analog — proxy hosts persistent sub-agents (recall-thought, critic, style-watcher) that watch ACP traffic and inject ambient observations. |

**Cluster math**: #11 alone = 24/25; #11+#12 = 24-25/25; **#11+#12+#13 = 25/25 ceiling** (the only rubric-validated 25/25 in the entire portfolio); +#14 = 25/25 qualitatively bigger.

The full rubric, prior-art map, and venture-by-venture scoring lives in [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md).

## Differentiated value props

What no competitor offers in combination:

- **Multi-machine routing** — agents on your laptop talk to agents on your colleague's laptop OR in cloud, federated via Matrix.
- **Managed-cloud SLA** — uptime guarantees, multi-region, scaling, security review, compliance posture.
- **Multi-tenant infrastructure** — auth, secrets, billing, audit trails as service-level concerns.
- **Spec-authorship moat** — whoever authors `org.agentroom.*` MSC sets the wire vocabulary (HTTP/IRC/MIME/OAuth precedent — generational scale).
- **CrossAgentState orchestration** — proprietary primitive: shared plan graph with file-claims, real-time conflict resolution, structured handoff. Self-hosters of just the open wire get a chat relay; we sell the coordination engine.
- **Compute platform (L4)** — moves up the stack from "messaging gateway" to "hosted runtime for AI sub-agents," similar to Cloudflare's CDN → Workers progression.

## Adjacency check (April 2026)

The agent-coordination layer activated significantly through 2025-2026. Per [/deep prior-art research](competitive-landscape.md), several adjacents now exist:

- **Zed ACP Registry** shipped Jan 2026. Public registry for ACP-compatible agents. Naming/distribution surface for the registry layer is now contested.
- **Open-ACP** (280 stars) — community-driven self-hosted ACP bridge to Telegram/Discord/Slack. Validates the bridge demand pattern; partially commoditizes the adapter layer.
- **Vercel AI Gateway** — production multi-provider LLM gateway with observability + caching. Strongest direct competitor for the gateway slot.
- **Helicone** (OSS observability), **Portkey** (gateway), **OpenRouter** (model routing) — each occupies a slice of the services tier.
- **LangChain Agent Middleware + LangGraph** — orchestration as production-first concept. Threat to L3 coordination state.
- **Slack + Anthropic** — deepening "agents in Slack" via MCP-connected assistants. Threat: Slack might become the canonical chat-surface bridge.

**The gap**: a credible, **SLA'd, multi-tenant control plane** that simultaneously (a) terminates ACP/MCP, (b) federates across Slack/Discord/Matrix, (c) provides cross-agent memory/recall, (d) exposes per-session observability/cost guardrails, and (e) anchors a portable-agent registry — **does not yet exist**. Several companies have pieces; no one has the integrated bundle. That's the seat agentroom can take.

agentroom's value prop sharpens accordingly — moat isn't "having Discord/Slack connectors" (Open-ACP has those for free); it's the managed-cloud + multi-machine + spec-authorship combination that requires real operational scale.

## Sequencing — utility first, standardize-to-weaponize

Per /pro 4-leg consensus and /deep prior art (Confluent, Vercel, Stripe, Auth0). The full rationale is in [`license-strategy.md`](license-strategy.md) and Phase 4 of the [strategy brainstorm](../strategy-brainstorm-2026-04-28.md#phase-4).

| Phase | Months | What | Why |
|---|---|---|---|
| Internal API | 0-3 (solo) | Treat tribe wire as INTERNAL API. Hardcode it between silvercode and gateway. Iterate fast. Build conformance harness in private. **Do NOT submit formal MSC.** | Specs are extracted from dominant implementations (Docker→OCI, S3→de-facto), not authored ahead. |
| Preview gateway | 3-6 (first hire) | Multi-machine routing, single-region, no SLA, design-partner-only. Publish wire as documentation (not formal MSC yet). | Validates the wire+gateway combo. Refines spec via real usage. |
| Production | 6-12 (small team ~5) | SLA, SOC2, multi-region, on-call rotation. **Submit formal MSC** (with dominant impl behind it). | Standardize-to-weaponize: force MSC reviewers to debate working code. |
| Scale | 12+ | Enterprise sales, scale, decide D4 (inside) vs D5 (spinout). | Signal-driven path deepening. |

## Inside vs outside the portfolio (D4 vs D5)

- **D4 (S22)** — keep agentroom inside the silvery/silvercode/km portfolio. Integrated narrative, single acquisition outcome, founder bandwidth covers everything.
- **D5 (S5/S19)** — spin out as standalone venture. Separate $3-5M seed, infrastructure-ops co-founder, separate cap table. Independent acquihire-ready (GitHub, Microsoft, Vercel, Replit). Confluent Inc shape.

**The decision is signal-driven and explicitly deferred** — *don't pre-form a separate entity for agentroom; defer formation until Family D services prove out.*

## Failure modes (Phase 5 contingency)

| Failure | Survival move |
|---|---|
| MCP extends to cover coordination | agentroom becomes MCP-extension service rather than tribe-wire gateway. Authored event vocab still has authorship moat as MCP profile. |
| ACP extends symmetrically | Position as ACP-aware bridge to Matrix federation; `org.agentroom.*` becomes ACP-extension namespace. Same business; different framing. |
| Big AI lab publishes competing portable agent format first | Drop standalone-format ambition. Keep PlainBrain as km's internal data model + interoperability profile across whichever format wins. |
| Matrix Foundation rejects/sits on MSC | Ship `org.agentroom.*` as Apache + CC BY 4.0 spec independent of Matrix governance. Adoption can still happen (HTTP/JWT/OAuth2 precedent). |
| Open-ACP eats commodity gateway layer | Retreat from "the gateway" toward "the *managed* gateway" — multi-tenant, SLA-bearing, compliance-ready. Confluent vs Apache Kafka shape. |

In every failure mode some agentroom revenue layer survives. Cluster ceiling drops 25/25 → ~18-20/25 in adverse cases; floor doesn't go to zero.

## Cross-references

- [`license-strategy.md`](license-strategy.md) — license partitioning + CLA + trademark + Certified Compatible program
- [`competitive-landscape.md`](competitive-landscape.md) — /deep prior-art findings + ongoing competitor tracking
- [`hub/km/design/strategy-brainstorm-2026-04-28.md`](../strategy-brainstorm-2026-04-28.md) — full strategic context (Phase 0-5)
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md) — 14-venture rubric, 25/25 cluster math
