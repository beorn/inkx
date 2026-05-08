---
mentions:
  - km
aliases:
  - "@km/silvercode/acp-over-http"
  - "@km/silvercode/acp-plus-plus"
  - km-silvercode.acp-http-binding
  - km-silvercode-acp-http-binding
created_at: 2026-05-07T12:15:00.000Z
type: feature
priority: P1
---

# [ ] ACP-over-HTTP binding — propose + ship the cloud/multi-client extension to ACP @km/silvercode #P1 #feature ^acp-http-binding

Propose and reference-implement an HTTP/WebSocket transport binding for ACP, plus the additive features needed for cloud and multi-client deployment: multi-observer sessions, session enumeration, protocol-level auth, schema discovery, resource listing, heartbeat. Submit as RFC to `agentclientprotocol/agent-client-protocol`. Ship reference impl in silvercode. Then layer opencode-serve compat as a thin translator (see `@km/silvercode/parity-kilo/opencode-server-compat`).

## Why this matters

- **Today**: ACP is stdio-only and 1:1 (editor↔agent subprocess). opencode-serve is HTTP/SSE and 1:N (server with many clients). Two protocols, same problem space, ecosystem split.
- **Bet**: ACP is the standardization track (Zed + JetBrains backing it); opencode-serve is one vendor's REST surface. If ACP grows the missing pieces, opencode-serve becomes a redundant custom protocol.
- **Silvercode wedge**: first mover on "ACP-over-HTTP" reference impl + spec proposal owns the brand. Submit RFC, ship reference impl ahead of merge, and `@km/silvercode/parity-kilo/opencode-server-compat` reduces from "reverse-engineer one vendor's REST API" to "ship a thin opencode-serve→ACP-over-HTTP translator."
- **One protocol, two clients**: editor plugins (Zed, JetBrains, VS Code via ACP extension) and web/cloud (Kilo, opencode browser, Railway templates) all speak the same wire format.

## Gaps to close (vs current ACP stdio binding)

1. **Transport binding**: spec ACP-over-WebSocket (preferred for streaming) and ACP-over-HTTP+SSE (for polyglot clients). JSON-RPC payloads unchanged — only framing changes.
2. **Multi-observer sessions**: `session/attach` method (client opts into existing session by id) + fan-out semantics for `session/update` notifications. Backwards-compat: agents advertise `multiObserver: true` in `initialize` capabilities.
3. **Session enumeration**: `session/list` (filters: open/closed, since-timestamp, by-mode) and `session/info` methods. Lights up "show me all my running agents" UIs.
4. **Protocol-level auth**: Bearer-token-in-headers + OIDC for network bindings during `initialize`. Stdio binding keeps "delegate to agent" semantics. Add `authMethods` advertisement.
5. **Schema discovery**: `acp/schema` method returning JSON Schema for the session's tools/commands at current state. Agents already have this internally.
6. **Resource model**: `resource/list` + `resource/read` + `resource/subscribe` for files/state. LSP-shaped, fits naturally.
7. **Keepalive**: 30s heartbeat for network bindings (borrow opencode-serve convention).

## Acceptance

- [ ] RFC drafted as a PR to `agentclientprotocol/agent-client-protocol` with: WS binding spec, HTTP+SSE binding spec, multi-observer extension, session-list, auth, schema, resource model, heartbeat. Each as an independently mergeable section.
- [ ] Reference implementation in silvercode: `silvercode serve --acp-http` exposes the full set on a configurable port.
- [ ] Conformance suite: protocol tests that run against any agent claiming ACP-over-HTTP support. silvercode passes; reference fixtures for opencode-as-translated and Claude/Codex (when wrapped) pass.
- [ ] TypeScript SDK update: `@agentclientprotocol/sdk` gains a `ServerSideConnection` mirror that speaks WS/HTTP. Submit upstream.
- [ ] Smoke test: opencode-acp-over-http (translator) ↔ silvercode serve ↔ silvercode TUI client roundtrip.
- [ ] Smoke test: Zed (or any ACP editor) connects to silvercode-serve over WS using its ACP path and runs a session.
- [ ] Smoke test: two clients (TUI + web UI) attached to the same session see the same `session/update` stream.

## Implementation phases

1. **Phase 0 — Capture state.** Read current ACP spec + TS SDK; document the stdio/JSON-RPC shape we're inheriting unchanged. Snapshot opencode-serve's REST/SSE API for translator reference.
2. **Phase 1 — WS binding (silvercode internal).** Implement Bun.serve-based WS endpoint that frames JSON-RPC. Run existing ACP methods unchanged. Internal smoke test.
3. **Phase 2 — Multi-observer + session-list.** Add the additive methods to silvercode's ACP server. Internal tests.
4. **Phase 3 — Auth + schema + resource model.** Spec + impl.
5. **Phase 4 — RFC.** Open PR upstream. Reference impl is the persuasion artifact.
6. **Phase 5 — opencode-serve translator.** Thin adapter that maps opencode's REST endpoints onto our ACP-over-HTTP server. Closes `@km/silvercode/parity-kilo/opencode-server-compat`.
7. **Phase 6 — SDK upstream.** Submit `ServerSideConnection` to TS SDK. JetBrains/Zed adopt or fork.

## Strategic positioning

This is the **silvery / km bet on owning the standard**, not just shipping a compatible client. Three outcomes possible:

- **A (best)**: RFC merges, silvercode is the reference impl, opencode-serve becomes legacy.
- **B (good)**: RFC stalls, silvercode ships ACP-over-HTTP anyway, dual-implements opencode-serve as the translator. We own one protocol; opencode owns the other; clients pick.
- **C (still useful)**: Spec doesn't catch on, silvercode-serve is just a custom protocol with extra features. Wasted effort on RFC, but the engineering still ships opencode-server-compat.

Even outcome C ships the parity bead — so the RFC effort is a strategic upside bet on top of mandatory engineering.

## Related

- Sibling of: `@km/silvercode/acp` (closed parent — boundary adapter)
- Hard prerequisite for: `@km/silvercode/parity-kilo/opencode-server-compat` — Phase 5 above closes that bead
- Relates to: `@km/silvercode/parity-acp` (ACP feature parity tracker)
- Relates to: `@km/silvercode/acp-session-config-options`, `@km/silvercode/local-agent-subsessions` — features that benefit from multi-observer

## Out of scope

- Building our own VS Code/JetBrains plugin (we inherit Zed/JetBrains/Kilo/opencode clients via the protocol).
- Authentication backends (OIDC providers, user management) — protocol surface only.
- Multi-tenant billing / usage tracking — application-layer concern.

