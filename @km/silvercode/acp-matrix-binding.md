---
mentions:
  - km
aliases:
  - "@km/silvercode/acp-over-matrix"
  - "@km/silvercode/matrix-binding"
  - km-silvercode.acp-matrix-binding
  - km-silvercode-acp-matrix-binding
created_at: 2026-05-07T13:10:00.000Z
type: feature
priority: P2
---

# [ ] ACP-over-Matrix binding — federated, encrypted, multi-org agent transport @km/silvercode #P2 #feature ^acp-matrix-binding

Strategic exploration: implement ACP as a binding over the Matrix protocol, enabling federated multi-org agent collaboration, end-to-end encrypted agent sessions, and multi-device sync — capabilities that ACP-over-HTTP cannot provide without rebuilding a federation/crypto layer from scratch.

This is a third transport binding, sibling to stdio (current ACP) and HTTP/WS (proposed in `@km/silvercode/acp-http-binding`). Different audience, different deployment model, different success metrics.

## Why this is now feasible (not just speculative)

Earlier objections about Matrix being heavyweight don't hold:

1. **Matrix-over-WebSocket exists**: draft MSC + working `matrix-org/matrix-websockets-proxy` give Matrix WS-class latency. The "/sync long-poll is too slow for token streaming" worry was outdated.
2. **HG HomeServer**: pure TypeScript, single JS file, zero deps except Node.js. Designed exactly for "Matrix as backbone for custom apps." Embeddable in `silvercode serve` with minimal weight.
3. **Conduit / conduwuit**: single-binary Rust homeservers, "much faster than other implementations" — for users who want a real homeserver without Synapse complexity.
4. **Cloudflare Workers Matrix homeserver**: serverless, post-quantum, near-zero ops cost. Hosted-silvercode deploys with Workers as the Matrix backend.

Engineering cost: probably 1–2 weeks for a working prototype using HG + matrix-websockets-proxy + an event-type mapping.

## Mapping ACP onto Matrix

| ACP                         | Matrix                                                      |        |
| --------------------------- | ----------------------------------------------------------- | ------ |
| Session                     | Room                                                        |        |
| session/update notification | Custom event: m.acp.update                                  |        |
| Method request              | Custom event: m.acp.request (with method/params/id)         |        |
| Method response             | Custom event: m.acp.response (with id, result               | error) |
| Multi-observer              | Multiple users/devices joined to room — automatic           |        |
| session/list                | /joined_rooms filtered by m.acp.session tag                 |        |
| Streaming                   | /sync long-poll OR matrix-websockets-proxy WS stream        |        |
| Auth                        | Matrix access tokens + OIDC/SSO                             |        |
| Heartbeat                   | Built into /sync                                            |        |
| Resource subscribe          | State events (m.acp.resource.*)                             |        |
| History/audit               | Native — events are persisted, redactable per matrix policy |        |

JSON-RPC payloads are unchanged from stdio ACP — only the framing differs.

## Differentiating capabilities (vs HTTP/WS binding)

1. **Federation across orgs**: an agent on `silvercode.dev`'s homeserver collaborates with an agent on `bigcorp.com`'s homeserver in a shared room. Federation handles auth, transport, identity. HTTP/WS would need bespoke trust setup.
2. **End-to-end encryption (Megolm)**: enterprise compliance dream — even silvercode itself cannot see the conversation. Structurally impossible with HTTP/WS without rolling our own crypto.
3. **Multi-device sync for free**: same agent session on phone + laptop + browser, all see all events, all can post.
4. **Audit log by default**: every event is persisted, signed, redactable per matrix policy. Compliance and replay come free.
5. **Bridges**: matrix bridges to Slack/Discord/IRC/Telegram exist — drive your agent from any chat client with zero extra integration work.
6. **Bot ecosystem**: established matrix bot pattern (Mjolnir, Maubot). Agents-as-bots fits naturally.

## Acceptance

- [ ] Spec ACP-over-Matrix event-type namespace (`m.acp.*`) — request/response/notification mapping, correlation IDs, capability negotiation in room state.
- [ ] Reference impl in silvercode: `silvercode serve --transport matrix --homeserver <url>` connects as a Matrix bot, advertises sessions as rooms, responds to ACP requests as events.
- [ ] Embedded HG HomeServer mode: `silvercode serve --transport matrix --homeserver embedded` runs HG inline so users don't need an external homeserver.
- [ ] Matrix-WebSocket transport: support `matrix-websockets-proxy` for streaming-class latency.
- [ ] Smoke test: silvercode (TUI) ↔ matrix homeserver ↔ silvercode (web) with both clients in the same session-room seeing the same `m.acp.update` stream.
- [ ] Smoke test: cross-homeserver federation — agent on `homeserver-a` joined to a room on `homeserver-b`, full ACP roundtrip works.
- [ ] Smoke test: E2EE-enabled room — silvercode encrypts/decrypts via olm/megolm without server seeing plaintext.
- [ ] Document deployment patterns: embedded HG (solo dev), Conduit (small team), Cloudflare Workers homeserver (hosted), federated Synapse (enterprise).

## Research before implementation

1. **OGP (Open Gateway Protocol)**: OpenClaw and Hermes both adopted OGP for signed cross-framework agent messages. Investigate whether ACP-over-Matrix should be OGP-compatible (extension, not replacement) or whether OGP solves a different problem (chat-routing vs RPC-protocol). If OGP is RPC-shaped, this bead may collapse into "ACP profile of OGP."
2. **Existing Matrix-AI-agent precedent**: OpenClaw + Hermes use Matrix as a *channel* (chat input/output), not a *protocol transport*. silvercode-on-Matrix would be the first serious coding agent treating Matrix as the transport layer. Ecosystem position: greenfield for coding, established for personal-assistant.
3. **`matrix-mcp-server`** (mjknowles) — MCP server that lets an LLM read/write Matrix rooms. Different angle (Matrix-as-tool rather than Matrix-as-transport) but worth understanding their primitives.
4. **Federation politics**: Matrix federation has historic complexity (room versions, server ACLs). Validate that a fresh ACP-over-Matrix deployment doesn't drag in legacy chat-room concerns we don't need.

## Strategic positioning

- **Audience**: enterprise (compliance, audit, on-prem), federated marketplaces (cross-org agent collaboration), multi-device users (phone+laptop+browser sync), decentralization advocates.
- **Not the audience**: solo devs on localhost (HTTP/WS is simpler), editor-embedded agents (stdio ACP is simpler), users who want sub-100ms streaming (still possible, but more setup than WS).
- **Long-term bet**: if `m.acp.*` event namespace gets adopted, Matrix becomes the federation layer for the agent ecosystem the way SMTP became for email. That's a much bigger play than "implement opencode's REST API."

## Three outcomes

- **A (best)**: ACP-over-Matrix becomes the federated/encrypted standard; silvercode is the reference impl; major homeserver vendors (Element, Beeper) light up agent support.
- **B (good)**: Niche adoption in compliance-heavy enterprise + decentralization community; silvercode picks up users opencode/Kilo can't reach.
- **C (sunk cost)**: Matrix as agent transport doesn't catch on; we have a working third binding with no users; engineering effort wasted but learnings transfer to ACP-over-HTTP.

Risk-adjusted: P2 not P1, because immediate parity-kilo / opencode-serve compat (ACP-over-HTTP) ships value with lower risk. Matrix is the strategic upside bet on top.

## Related

- Sibling of: `@km/silvercode/acp-http-binding` — primary binding, ships first
- Sibling of: `@km/silvercode/parity-kilo/opencode-server-compat` — opencode compat lives on HTTP, not Matrix
- Closed parent: `@km/silvercode/acp` — boundary adapter (stdio binding implementation)
- Related to: `@km/silvercode/parity-acp` (ACP feature parity tracker)
- Long-term tie: `@km/all/upstream-waiting` — track OGP / Matrix MSC progress

## Out of scope

- Replacing ACP-over-HTTP — Matrix is a third binding, not a substitute.
- Building a homeserver from scratch — embed HG / use Conduit / Cloudflare Workers. We are not in the homeserver business.
- Authentication backends, user management, billing — application-layer concerns above the protocol.
- Synapse-grade federation (room versioning, complex ACL) — out of scope; we only need the subset that ACP needs.

