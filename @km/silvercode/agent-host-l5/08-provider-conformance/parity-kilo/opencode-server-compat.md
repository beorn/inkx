---
mentions:
  - km
aliases:
  - "@km/silvercode/opencode-server-compat"
  - km-silvercode.opencode-server-compat
  - km-silvercode-opencode-server-compat
created_at: 2026-05-07T11:50:00.000Z
type: feature
priority: P1
---

# [ ] opencode-server HTTP API compat — silvercode as a drop-in opencode backend @km/silvercode #feature #P1

Implement the `opencode serve` HTTP/SSE API in silvercode so any opencode-server client (Kilo VS Code extension, Kilo CLI, opencode TUI, opencode web UI, Railway templates, JetBrains opencode-web-ui plugin, `hosenur/portal`, `chris-tse/opencode-web`) can point at silvercode by setting `OPENCODE_SERVER_URL=https://...` and just work.

Embrace-the-distribution play. Kilo's new VS Code extension and CLI are built on opencode-server; speaking the same wire protocol gives silvercode their entire client surface area for free, while we layer on what they can't do without rebuilding (multi-agent tribe, beads-as-task-queue, recall, workspace memory, alien-* reactive state, Claude Max + Codex subscription bridging).

## Why this is asymmetric

- **Cost moat**: silvercode rides Claude Code Max + Codex subscriptions (Anthropic legally severed that path for opencode/kilo in March 2026 via PR #18186 — "remove anthropic references per legal requests"). A user pointing Kilo VS Code at silvercode swaps from API-rate billing to subscription-rate billing for their Claude turns.
- **Workspace primitives**: km bd, recall, gbrain, tribe coordination are surfaces opencode-server doesn't model. We can expose them as opencode-shaped tool calls and MCP servers without forking the protocol.
- **Cat-and-mouse-proof**: unlike Meridian / opencode-claude-auth / opencode-with-claude (which intercept Anthropic OAuth and are explicitly prohibited), this is a clean impl of an open HTTP protocol against a first-party-blessed Claude Code path.

## Acceptance

- [ ] silvercode exposes `silvercode serve --opencode-compat` (or implicit) on a configurable port — defaults to opencode's 4096
- [ ] HTTP basic auth honoring `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`
- [ ] Session lifecycle endpoints: create / list / get / delete / fork / resume — mapped onto silvercode's session store
- [ ] Message streaming (SSE or whatever opencode uses) — agent text/thought chunks, tool calls, tool results, plan updates
- [ ] Tool registry endpoints — silvercode tools advertised in opencode's tool-shape
- [ ] MCP server pass-through — clients can register MCP servers on a session
- [ ] File ops endpoints — read/write/list mapped to silvercode's fs adapters
- [ ] Provider config endpoints — `setSessionConfigOption` and friends
- [ ] Smoke test: spin up silvercode-serve, point opencode TUI at it, run a hello-world session end-to-end
- [ ] Smoke test: spin up silvercode-serve, point Kilo VS Code at it, run a hello-world session end-to-end
- [ ] Smoke test: deploy via Railway (or equivalent), connect from opencode web UI, run a session

## Implementation sketch

1. Snapshot opencode-server's HTTP API surface — endpoints, request/response shapes, SSE event families. Pin to a specific opencode commit so we have a moving-target spec.
2. Map opencode's session model onto silvercode's existing session store (one-way translation layer first; converge later).
3. Map opencode's event families onto silvercode's canonical event contract (we already do most of this for ACP — much of it transfers).
4. Implement the HTTP server (Bun.serve) + SSE writer.
5. Conformance test fixtures: replay captured opencode-TUI ↔ opencode-server traces against silvercode and assert byte-for-byte (or shape-for-shape) compatibility.

## Related / depends on

- Parent: `@km/silvercode/agent-host-l5/08-provider-conformance/parity-kilo` — Kilo/opencode parity tracker
- Sibling-of-interest: `@km/silvercode/acp-client` — we already speak ACP; opencode-server is a parallel surface
- Sibling-of-interest: `@km/silvercode/parity-claude/canonical-agent-plan-model` — our canonical event model is the basis for the mapping layer
- Strategic context: this is one of three challenge-Kilo wedges in [hub/silvercode/future/ai-terminal/silvercode-squad-mode.md] (squad mode, opencode-server compat, outcome-aware routing)

## Out of scope (for this bead)

- Building our own VS Code or JetBrains extension — opencode-server compat means we inherit theirs.
- Implementing opencode's specific provider integrations (Zen, Black, Go) — those are auth/billing surfaces, not protocol.
- Single-binary distribution — separate bead.

