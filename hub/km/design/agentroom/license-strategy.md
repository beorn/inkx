# agentroom — license strategy + open-source defense

**Status**: design doc, 2026-04-28. Source: /pro 4-leg consensus + /deep prior-art research. Extracted from [`strategy-brainstorm-2026-04-28.md`](../strategy-brainstorm-2026-04-28.md) Phase 1.A3 license partitioning + Phase 5 open-source defense playbook.

---

## The threat model

> *If silvery (Apache), silvercode (open reference), and tribe wire (Apache + CC BY) are all permissive, you are not building a moat — you are subsidizing the competitor's R&D.* (Kimi K2.6, /pro 4-leg)

A well-funded competitor (Vercel, an OpenTUI-backed shop, Anthropic-managed, even Open-ACP maturing from 280 stars to a YC-backed fork) can:

1. Fork silvercode (UI)
2. Reuse silvery (framework)
3. Implement tribe-compatible endpoints
4. Point default configs to **their own** "agentroom-like" backend
5. Pitch *"same UX, same wire, cheaper/faster/more reliable"*

What stops them? Six layered defenses; none alone, all together.

## License partitioning by layer

The right split, **applied day one** (not post-adoption — see fork-risk warnings below):

| Layer | License | Why |
|---|---|---|
| silvery framework + tribe client SDKs + adapters | **Apache 2.0** | Adoption funnel; permissive maximizes reach |
| tribe spec text + `org.agentroom.*` + `.brain` spec | **CC BY 4.0** | Remixability — required for becoming a standard |
| Reference parsers + reference clients | Apache 2.0 | Working code under spec to prove correctness |
| **Reference gateway** (single-user, no SLA, runnable demo) | **AGPL** | Viral copyleft scares cloud clones away from repackaging |
| **Production gateway, CrossAgentState orchestrator, ambient-safety pipeline, multi-machine router, sub-agent compute** | **BSL 1.1 OR Elastic License v2 OR Confluent Community License** | Source-available, cloud-protective. Day one. |
| All server-side repos | **CLA required** | Preserves relicense optionality |

### Picking the right server license

Three viable options for the production server, ranked:

1. **BSL 1.1** (Cockroach / Timescale style) with 3-4 year Change Date. Allows broad internal use; prohibits offering "as a service" without commercial license. Enterprise-friendly. Predictable sunset to permissive at the Change Date. **Recommended.**
2. **Elastic License v2 (ELv2)** OR **Confluent Community License (CCL)**. Explicitly prohibits providing the software as a managed service. Familiar to infra buyers; clear intent.
3. **AGPLv3** for the demo-grade reference gateway only. Viral copyleft scares enterprises off embedding — better for "toy reference" than for strategic server code.

### Why selective and day-one matters

The license-change timeline (per [/deep](competitive-landscape.md#license-change-timeline-post-launch-fork-risk-warnings)) shows what happens when you switch licenses *after* community adoption:

| Year | Company | Outcome |
|---|---|---|
| 2018 | MongoDB → SSPL | AWS DocumentDB blocked, no community fork |
| 2018 | **Confluent → selective CCL** (only ksqlDB + Schema Registry) | **No fork.** Cleanest case. |
| 2021 | Elastic → Elastic License + SSPL | AWS forked → OpenSearch |
| 2023 | HashiCorp → BSL | Linux Foundation forked → OpenTofu |
| 2024 | Redis → RSALv2/SSPL | Linux Foundation forked → Valkey |

**Lesson**: switching licenses post-launch triggers high-profile forks 4 out of 5 times. Confluent's selective day-one CCL avoided this — Kafka stayed Apache, only the value-add components got CCL.

## Open-source defense playbook (six layered defenses)

Per /pro 4-leg consensus + /deep prior art (Confluent, Vercel, Auth0, Stripe, Temporal, Supabase, Kong, Apollo, GitLab, Algolia all run variants of this), the structural defense is **layered** — no single tactic suffices.

### 1. Operational moat (strongest)

- Multi-region failover, 99.9-99.99% SLA, SOC2/ISO27001, on-call rotation, SCIM/SSO, PrivateLink/VPC peering, data residency, FedRAMP variants.
- *"You aren't defending an API; you are defending an SLA."* (Gemini 3 Pro)
- Confluent Cloud beat self-hosted Kafka via this exact playbook. Vercel beat AWS+CloudFront the same way.

### 2. Spec authorship via conformance, not text

- Conformance test suite + golden traces + replay harness + reference validator CLI.
- The repo where implementers prove correctness is the *de facto* spec editor, even when the spec sits under foundation governance.
- Norm-setting moves markets. *Specs without runnable conformance are paper shields.*

### 3. Vertical integration via "dark extensions"

- Open the wire (tribe) for chat-relay-grade message passing.
- agentroom natively handles **CrossAgentState conflict resolution + ambient-safety egress blocking + multi-device vault sync** as proprietary extensions.
- Self-hosters of the open wire get a chat relay; we sell the coordination engine.
- silvercode UI features (squad mode, hierarchy X-ray, ambient channels) are tested against agentroom Cloud — self-hosters get "supported but not certified."

### 4. Distribution defaults + trademark + Certified Compatible

- silvercode ships with `agentroom.cloud` as zero-config default + one-click auth + instant org provisioning. Most users keep defaults (AWS RDS vs MariaDB self-host pattern).
- Trademark "agentroom", "silvery", "tribe", "`.brain`" — competitors can fork code but can't use the names.
- Run a "Certified Compatible" program — anyone can implement the spec; only those who pass conformance tests get the mark. Buyers ask for the badge; we administer the tests.
- Tie certification to passing conformance tests AND published SLO/SOC2 posture — two things hobby forks won't have.

### 5. Network effect via brain registry

- `brainhub.dev` with provenance, signing, verified publishers, "Trusted Brain Publisher" curation.
- Once 10K+ brains in registry, switching to a competitor backend means losing distribution.
- *GitHub is defensible despite git being open-source because GitHub is where the repos live.* agentroom must be where the agents live.

### 6. License partitioning + CLA optionality (backstop)

- See license partitioning table above.
- CLA on server-side repos preserves relicense optionality. Use sparingly to preserve community goodwill.
- **The default should remain open**; restrictive licensing is a targeted backstop only if a specific subcomponent becomes a pure SaaS-free-rider surface.

## Pricing as deterrent

- Free single-user gateway tier with generous limits.
- Paid tiers = org / SSO / policy / SLA / analytics — things OSS clones structurally struggle to offer credibly.
- Simple, transparent, usage-based pricing with budget caps + alerts. Make it "safe to adopt" without runaway-bill fear.

## What NOT to open-source at production quality

- Multi-tenant production gateway code
- CrossAgentState orchestrator
- Ambient-safety classifier runtime (this is the GPU/inf-cost barrier — defend the *sub-agent compute*, not the bridge — per Kimi)
- Multi-machine router
- Brain registry server (the canonical impl, not the spec)
- All SOC2/SSO/SCIM/audit/policy/budget/abuse-control infrastructure

Ship a *demonstrator* AGPL reference gateway (single-user, no SLA) so the spec has runnable code. Keep the production server under BSL/CCL **from day one**.

## The bet

Standards expand TAM; the cloud captures value because it's the easiest, safest, and best-integrated place to run the standard.

> *You can't stop a fork. You can make the fork an inferior, higher-friction choice for most customers. The actual defense stack is layered: license fences at the server, spec + conformance ownership, trademarks + certification, operational credibility, sticky defaults, and UI-service co-design that feels meaningfully better with your cloud.* (GPT-5.4 Pro, /pro 4-leg)

## Cross-references

- [`positioning.md`](positioning.md) — agentroom strategic positioning + sequencing
- [`competitive-landscape.md`](competitive-landscape.md) — adjacent products, gap analysis, license-change timeline
- [`hub/km/design/strategy-brainstorm-2026-04-28.md`](../strategy-brainstorm-2026-04-28.md) — full strategic context
- [`hub/km/design/licensing-strategy.md`](../licensing-strategy.md) — broader licensing decisions across the portfolio
