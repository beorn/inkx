# agentroom — competitive landscape

**Status**: maintained. Source: /deep prior-art research 2026-04-28 ([raw output preserved as `/var/folders/x6/.../llm-618d206c-prior-art-for-the-john.txt`](mailto:beorn) — local cache, not repo). Update as the field shifts.

---

## Direct ACP/MCP layer (April 2026)

### Zed Industries

- **ACP creator + maintainer**. Uses ACP in their own editor.
- **ACP Registry** shipped January 2026 — public registry for ACP-compatible agents. *Naming/distribution surface for the registry layer is now contested.*
- Likely to ship more layers (their own gateway, hosted services) over time. They're the obvious threat to capturing the standard.

### agentclientprotocol.com/registry

- Community ACP-agent registry (NOT Zed-affiliated despite the domain).
- Lists: Claude Agent, Gemini CLI, Copilot, Cline, Cursor, goose.
- Format: `agent.json` + `icon.svg`.
- Distribution: JSON file at `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`.
- *Distribution metadata for existing agents — not a portable agent format.*

### Open-ACP (github.com/Open-ACP)

- 280 GitHub stars (as of 2026-04-28).
- Self-hosted ACP bridge to Telegram/Discord/Slack.
- Has plugin registry, adapters (Discord, Slack), workspace plugins, git monitoring, TTS.
- Community-driven; no visible Zed involvement.
- *Validates the bridge demand pattern; partially commoditizes the Discord/Slack-adapter portion of the agentroom value prop.*

## Adjacent: gateway / observability / routing layer

### Vercel AI Gateway

- Production multi-provider LLM gateway.
- Open Vercel AI SDK + proprietary AI Gateway. ~$200M ARR.
- Multi-provider integration, observability, caching, rate control.
- **Strongest direct competitor for the agentroom gateway slot.**

### Helicone

- Open-source LLM observability platform.
- Threat to the observability differentiator (#1 ship-now venture).

### Portkey

- Production LLM gateway with retries, fallbacks, caching, governance.
- Threat to the gateway value prop.

### OpenRouter

- Model aggregator and routing service. ~$1.3B valuation per /pro v3 prior art.
- Threat to the multi-vendor LLM gateway slice of the services tier.

### LangChain Agent Middleware + LangGraph

- Orchestration framework positioning multi-agent systems as production-first concepts.
- LangGraph: stateful, multi-agent graph orchestration.
- Threat to coordination-state layer (#13).

### LlamaIndex agents

- Multi-agent topology framework.
- Adjacent to coordination-layer scope.

## Adjacent: chat-surface bridges

### Slack + Anthropic

- "Agents in Slack" — MCP-connected assistants, Claude Code routes work from Slack.
- Anthropic public docs for Claude-in-Slack.
- *Threat*: Slack might become the canonical chat-surface bridge, eating part of agentroom's adapter value.

### Community MCP servers for Matrix

- Multiple community MCP servers exist for Matrix.
- DIY demand exists; no canonical, SLA'd product.

## The gap (agentroom's window)

**No public production ACP↔Matrix gateway by Zed/JetBrains exists** as of April 2026. Multiple community efforts validate demand but none provide:

- 99.9-99.99% SLA
- Multi-region failover
- Multi-tenant infrastructure
- SOC2/ISO27001 compliance
- Enterprise identity (SCIM/SSO)
- PrivateLink/VPC peering
- Audit logs, fine-grained org policy, budget caps
- Cross-agent memory/recall as managed service
- Portable-agent registry with provenance/signing/curation

**That's the seat agentroom can take.** Window is real but contested; estimated 6-12 months before Zed, Anthropic, or another well-funded player ships their version of the integrated bundle.

## Prior-art validation: the S25 pattern works

10+ companies have run the "open client/SDK + open spec + paid managed service" pattern successfully:

| Company | Open piece | Paid/managed |
|---|---|---|
| Confluent | Apache Kafka + connector ecosystem | Confluent Cloud (99.95-99.99% SLA, managed connectors, governance) + selective CCL on ksqlDB/Schema Registry |
| Vercel | Next.js + AI SDK | Vercel platform + AI Gateway |
| Stripe | OpenAPI + open SDKs | Payments + compliance + global rails |
| Temporal | MIT OSS server + SDKs | Temporal Cloud (durable execution) |
| Supabase | OSS Postgres stack | Hosted Postgres/auth/storage/realtime |
| Kong | OSS gateway | Konnect (control plane, governance, SLAs) |
| Apollo | Federation spec + open libs | GraphOS (registry, router, checks, SSO, audit) |
| GitLab | Community Edition (MIT) | EE + GitLab.com SaaS |
| Auth0 | OAuth/OIDC standards + SDKs | Identity-as-a-service (SSO, policy, audit, compliance) |
| Algolia | Open API clients + InstantSearch | Search-as-a-service |

**Pattern**: separate a freely adoptable developer experience and/or spec from an operationally heavy, compliance-bearing service.

## License-change timeline (post-launch fork-risk warnings)

| Date | Company | Change | Outcome |
|---|---|---|---|
| 2018-10-16 | MongoDB | AGPL → SSPL | AWS DocumentDB blocked from re-hosting; community fork via PR but project not split |
| 2018-12-14 | Confluent | Apache → CCL (selective: ksqlDB, Schema Registry; Kafka stays Apache) | Cleanest case — selective day-one CCL, no community fork |
| 2021-01-14 | Elastic | Apache 2.0 → Elastic License + SSPL | **AWS forked → OpenSearch** (public split) |
| 2023-08-10 | HashiCorp | MPL → BSL | **Linux Foundation forked → OpenTofu** |
| 2024-03-20 | Redis | BSD-3 → RSALv2/SSPL | **Linux Foundation forked → Valkey** |

**Lesson**: license the production server correctly day one. Switching post-adoption triggers high-profile forks. Confluent's selective day-one CCL is the cleanest model.

## Cautionary tale: spec authorship without runtime

**OpenAPI / Swagger** — spec authorship didn't capture the biggest commercial outcomes. Stoplight, Postman, Apigee built more value on top than the spec authors did.

**Lesson**: spec authorship = moat ONLY when paired with:
- Reference runtime developers touch daily (Confluent has both spec + best tooling)
- Canonical registry/distribution surface (Docker has registry gravity via Hub)
- OR operational moat (Auth0 doesn't have either; built operational moat instead)

Without (i) or (ii), the spec author captures conference keynotes, not pricing leverage.

## Re-score triggers

Update this doc when:

- Zed announces a managed agentroom-equivalent service
- Anthropic / OpenAI / Google publish a competing agent-coordination protocol or portable-agent format
- Open-ACP gets VC funding or formal corporate sponsorship
- Slack (or Notion, or Microsoft Teams) ships a deeper "agents at the chat layer" play that bypasses third-party brokers
- A new ACP↔Matrix gateway hits 1K+ stars or gets press coverage
- Vercel AI Gateway adds agent-coordination primitives (vs current LLM-routing focus)

Tracking via `bd` epic `km-tribe.recall` (and adjacent agent-coordination beads).

## Cross-references

- [`positioning.md`](positioning.md) — agentroom strategic positioning + sequencing
- [`license-strategy.md`](license-strategy.md) — license partitioning + open-source defense playbook
- [`hub/km/design/strategy-brainstorm-2026-04-28.md`](../strategy-brainstorm-2026-04-28.md) — full strategic context (Phase 0-5)
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md) — 14-venture rubric
