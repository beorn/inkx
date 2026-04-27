# @km/claude-acp

Standalone ACP server wrapping the Claude Code binary.
Subscription-compatible (Pro/Max OAuth) **and** API-key compatible.

## What this is

An [Agent Client Protocol](https://agentclientprotocol.com) server that
spawns the `claude` binary on `newSession` and forwards its stream-json
output as ACP `session/update` notifications. ACP-speaking clients (Zed,
Neovim via [coc-acp](https://github.com/coc-extensions/coc-acp), [OpenACP](https://github.com/openacp/openacp),
silvercode, others) can talk to it over stdio without knowing anything
about Claude's wire format.

## Why this exists

The two existing options for ACP-wrapping Claude Code both fall short:

- **[`@agentclientprotocol/claude-agent-acp`](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)**
  (Anthropic-published, Zed-shipped) **blocks Claude.ai subscriptions** at
  session-init. Anthropic policy reserves Pro/Max quota for Claude Code's
  own interactive surfaces; programmatic Agent SDK use requires API
  billing. If you're a Pro or Max subscriber, this package is unusable.

- **[`carlrannaberg/cc-acp`](https://github.com/carlrannaberg/cc-acp)**
  (the only prior community attempt at a subscription-compatible binary
  wrap) has been **abandoned for ~8 months** as of writing.

Spawning the `claude` binary directly inherits Claude Code's full auth
gate — `CLAUDE_CODE_OAUTH_TOKEN` (Pro/Max OAuth, set by `claude login`),
then `ANTHROPIC_API_KEY` (per-token API billing), then `~/.claude/auth.json`
fallback. This server packages that path as a real ACP server.

## Install

```sh
# One-shot via npx (no install)
npx @km/claude-acp

# Or install globally
npm install -g @km/claude-acp
silvercode-claude-acp
```

The bin reads JSON-RPC frames on stdin and writes them on stdout — wire it
up from any ACP client.

## Configuration

Authentication is handled by the spawned `claude` binary. Set one of:

- `CLAUDE_CODE_OAUTH_TOKEN` — Pro/Max OAuth token (set by `claude login`)
- `ANTHROPIC_API_KEY` — per-token API billing
- `~/.claude/auth.json` — whatever `claude login` persisted

before launching the server. The Claude binary handles the rest.

## ACP capabilities

At v1 this server advertises:

- `protocolVersion: 1`
- `agentCapabilities.loadSession: false` — `loadSession` is not yet wired.
- `agentCapabilities.promptCapabilities`: text only. Image / audio /
  embedded-context inputs are dropped at the wire layer.
- `authMethods`: `claude-login` (OAuth) and `anthropic-api-key`. These are
  documentation entries — the actual auth happens out-of-band via the
  `claude` binary's own login flow. Calling `authenticate(...)` is a
  no-op success.

## Limitations

- **Permissions**: Claude Code's permission flow is interactive — when this
  server's spawned `claude` triggers a `permission-request`, we don't yet
  forward it as an ACP `session/request_permission` round-trip. The
  internal silvercode adapter handles permissions via signal-state on the
  silvercode side; surfacing them as ACP requests is a v2 task.
- **Multi-modal input**: text only. Image / resource inputs are silently
  dropped.
- **HTTP/SSE MCP servers**: silently dropped at v1. Stdio MCP servers are
  forwarded through to the spawned Claude binary.
- **Compaction / skills / hooks events**: Claude-Code-specific stream-json
  events have no ACP slot. They surface in silvercode's internal adapter
  via the legacy `AgentEvent` channel; they don't traverse this ACP wire.

## Status & maintenance

silvercode is the primary maintainer. This package extracts silvercode's
internal Claude adapter as a community good — the gap left by
`@agentclientprotocol/claude-agent-acp`'s subscription block and
`carlrannaberg/cc-acp`'s abandonment.

If silvercode's internal adapter ships a feature this package doesn't
expose, file an issue — most are quick to lift. Subscription auth is the
foundational guarantee; everything else is incremental.

## Reference

- silvercode internal adapter: `apps/silvercode/packages/agent-harness/src/acp-adapter-claude.ts`
- design notes: `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`
  § "Recommended path — internal-first, extract later"
- tracking bead: `km-silvercode.acp-claude-server`

## License

Apache-2.0
