# silvercode — supporting the full ACP Registry

_Snapshot 2026-04-28. Sourced from `cdn.agentclientprotocol.com/registry/v1/latest/registry.json` (31 agents) and OpenACP's working implementation. Re-fetch before acting; the registry grows weekly._

## Goal

silvercode should consume **every agent in the [Zed ACP Registry](https://agentclientprotocol.com/get-started/registry)** as a first-class backend, the way OpenACP does today. The user picks an agent from a list inside silvercode; we install (or download), spawn, speak ACP, render. Per-vendor adapter cost should approach zero.

## Why this is realistic

The registry already publishes a structured manifest with everything needed to install + spawn each agent:

```json
{
  "id": "claude-acp",
  "name": "Claude Agent",
  "version": "0.31.3",
  "description": "...",
  "repository": "...",
  "license": "proprietary",
  "icon": "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg",
  "distribution": {
    "npx":   { "package": "@agentclientprotocol/claude-agent-acp@0.31.3", "args": ["..."], "env": {...} },
    "binary":{ "darwin-aarch64": { "archive": "...tar.gz", "cmd": "./claude-acp" }, ... }
  }
}
```

Three distribution kinds today: **npx** (Node packages, ~17 agents), **binary** (per-platform tarballs, ~12), **uvx** (Python via uv, 2 agents — `fast-agent`, `minion-code`). Each kind is mechanically resolvable to a spawn command without per-agent code.

OpenACP has shipped this. We can read their installer for the reference implementation, then ship an equivalent (cleaner / silvercode-shaped) ourselves.

## The 31 agents (snapshot 2026-04-28)

| id | version | dist | license |
|---|---|---|---|
| agoragentic-acp | 1.3.0 | npx | MIT |
| amp-acp | 0.7.0 | binary | Apache-2.0 |
| auggie | 0.24.0 | npx | proprietary |
| autohand | 0.2.1 | npx | Apache-2.0 |
| claude-acp | 0.31.3 | npx | proprietary |
| cline | 2.17.0 | npx | Apache-2.0 |
| codebuddy-code | 2.94.1 | npx | Proprietary |
| codex-acp | 0.12.0 | binary, npx | Apache-2.0 |
| cortex-code | 1.0.58 | binary | proprietary |
| corust-agent | 0.5.1 | binary | GPL-3.0-or-later |
| crow-cli | 0.1.20 | binary | Apache-2.0 |
| cursor | 2026.03.30 | binary | proprietary |
| deepagents | 0.1.7 | npx | MIT |
| dirac | 0.3.1 | npx | Apache-2.0 |
| factory-droid | 0.109.3 | npx | proprietary |
| fast-agent | 0.6.25 | uvx | Apache-2.0 |
| gemini | 0.39.1 | npx | Apache-2.0 |
| github-copilot-cli | 1.0.38 | npx | proprietary |
| goose | 1.32.0 | binary | Apache-2.0 |
| junie | 1417.47.0 | binary | proprietary |
| kilo | 7.2.25 | binary, npx | MIT |
| kimi | 1.40.0 | binary | MIT |
| minion-code | 0.1.44 | uvx | AGPL-3.0 |
| mistral-vibe | 2.8.1 | binary | Apache-2.0 |
| nova | 1.1.0 | npx | proprietary |
| opencode | 1.14.28 | binary | MIT |
| pi-acp | 0.0.26 | npx | MIT |
| poolside | 1.0.0 | binary | proprietary |
| qoder | 0.2.3 | npx | proprietary |
| qwen-code | 0.15.4 | npx | Apache-2.0 |
| stakpak | 0.3.77 | binary | Apache-2.0 |

_New since OpenACP's bundled snapshot (2026-04-28 vs ~2026-04-24): `agoragentic-acp`, `cortex-code`, `dirac`, `poolside`._

## What it takes — work breakdown

### Layer 1 — registry consumption (the easy 80%)

A `RegistryClient` and `AgentInstaller` that handle the manifest shape. ~200–400 LOC.

- **Fetch + cache**: GET `cdn.agentclientprotocol.com/registry/v1/latest/registry.json`. Cache to `~/.silvercode/registry/<sha256>.json` with ETag for revalidation. Optionally bake a snapshot at silvercode build time for offline cold-start.
- **Resolver**: given an agent id, pick the best distribution for the host (`npx` if `which node` and `>= 20`, `uvx` if `which uv`, `binary` otherwise; prefer `binary` for known-native agents like `cursor`, `goose`, `junie`).
- **Installer**: per kind:
  - `npx` → `npx <package> <args>` with `env` merged into spawn (lazy install on first use, leverages npx cache)
  - `binary` → download `archive`, verify (no checksums in registry today — limitation, see Open Questions), unpack to `~/.silvercode/agents/<id>/<version>/`, mark `cmd` executable, register
  - `uvx` → `uvx <package>` with arg/env passing
- **Spawn**: produce an `AgentSpawnSpec { cmd, args, env, cwd }` consumable by silvercode's existing ACP-server-spawning code path
- **Update flow**: re-fetch registry on demand or on schedule; show "X has v0.32 available" in UI; one-click upgrade

### Layer 2 — ACP wire (already done)

We already speak ACP via `@agentclientprotocol/sdk` (or our internal Claude wrapper, depending on the silvercode-claude-acp decision in `10-agent-router-landscape.md` §Recommended path). Once an agent's subprocess is spawned, the ACP wire is identical for all 31 agents — that's the whole point of the protocol.

**No per-agent adapter code is needed for ACP-speaking agents.** This is what we get for free from ACP adoption.

### Layer 3 — auth / capability per agent (the messy 15%)

Each agent has its own auth model and feature surface. ACP's `AgentCapabilities` declaration handles most of it, but there are real gotchas:

**Auth caveats by agent class** (verified 2026-04-26 — see `10-agent-router-landscape.md`):
- **Claude (`claude-acp`)** — explicitly **blocks Claude.ai subscription accounts** in the official wrapper (`dist/acp-agent.js:1360` throws on `subscriptionType`). API-key auth only. **For Pro/Max users we have to wrap the `claude` binary's stream-json mode ourselves** — every Registry alternative inherits the same block.
- **Codex (`codex-acp`)** — ChatGPT subscription supported; no remote-project OAuth (needs local browser).
- **Gemini** — Google account OAuth (free tier 60 req/min, 1k req/day, no API key needed).
- **Copilot (`github-copilot-cli`)** — Copilot subscription required + GitHub OAuth.
- **Most others** — bring-your-own provider config; ACP layer is auth-transparent.

**Per-agent capability flags** (from `AgentCapabilities`): `supportsResume`, `supportsThinking`, `supportsImages`, `supportsTodos`, `supportsTerminal`, `supportsBackgroundTerminal`, `supportsSlashCommands`. silvercode's UI should disable features the agent doesn't declare — surfacing a "Plan" button on an agent that doesn't ship plan updates is a worse UX than hiding it.

**License surface**: 11 of 31 are proprietary. Bundling or auto-installing them is fine (the ACP wrapper packages are public and meant to be installed); we just shouldn't ship their binaries inside silvercode's npm package. Keep installs lazy and per-user.

### Layer 4 — UI surface

A "browse agents" panel inside silvercode that shows the registry as a marketplace:

- Card per agent: icon (CDN URL), name, description, license, distribution kind, install state
- Filter by: license (open vs proprietary), distribution kind, capability (e.g. "supports thinking"), provider (Anthropic/Google/OpenAI/etc.)
- Detail view: README excerpt (fetched from `repository`), version history, dependencies (auth requirements)
- Per-session "switch agent" picker (the OpenACP `/switch` mid-conversation flow — see `openacp-deep-dive-2026-04-28.md` for the protocol)
- This already exists as bead `km-silvercode.acp-comp-marketplace-dialogs` (P4) — *Model/Provider/MCP pickers*. The registry browser fits there; the bead was scoped before we knew the registry CDN was public + structured. **Update bead with this snapshot's findings.**

## Reference implementation worth reading

OpenACP solves all of Layer 1 in `src/core/agents/agent-installer.ts`, `agent-manager.ts`, `agent-registry.ts`. ~600 LOC across three files. MIT-licensed, so we can read and adapt freely. Their distribution selection is `binary > npx > uvx` for cold-start speed; we may prefer the inverse for npm-shape consistency. Either is fine.

OpenACP's session-as-portable abstraction (`agent-switch-handler.ts`) is the prior art for our `/switch` flow — see `openacp-deep-dive-2026-04-28.md` §"The standout feature" for protocol details.

## Open questions

1. **Checksum verification for binaries.** The registry manifest does not publish SHA256s today. Downloading a binary from a vendor's GitHub release and executing it is the supply-chain risk. Options: (a) trust GitHub release infrastructure (default), (b) maintain our own per-version checksum index, (c) push for `agentclientprotocol.com/registry` to add `sha256` to the schema. (c) is the right answer; we should file an issue.
2. **uvx availability.** Two agents (`fast-agent`, `minion-code`) require `uv`. We can ship `uv` as a lazy dependency or treat those agents as opt-in.
3. **Registry update cadence.** Should silvercode poll daily / weekly / on-demand? OpenACP bakes a snapshot at build time + offers `openacp agents refresh`. We probably want the same but with a soft auto-refresh (e.g., on first session of the day).
4. **Should silvercode publish itself to the registry?** When `silvercode-claude-acp` ships as an ACP server (the Type-A4 packaging in `10-agent-router-landscape.md` §Option B), submitting it to the registry would put us in a 32-agent list shown to users of every other ACP-speaking client. Cheap acquisition channel.
5. **Subscription-blocked Claude path.** The `claude-acp` registry entry is unusable for Pro/Max subscribers. silvercode needs a fallback agent id (e.g., `silvercode-claude` not in the registry, wrapping the `claude` binary's stream-json mode) for those users — surfaced in the UI as "Claude (subscription)" alongside "Claude Agent (API key)".

## Recommended phasing

- **Phase 1** (1 session): RegistryClient + Resolver + npx-only installer. Hook into existing ACP spawn path. Ship support for the 17 npx-distributed agents.
- **Phase 2** (1 session): binary-distributed installer with archive download/extract/verify. Adds 12 more agents.
- **Phase 3** (1 session): uvx installer + browse-agents UI + per-agent capability flags wired into UI feature gating.
- **Phase 4** (separate effort, depends on `silvercode-claude-acp` decision): subscription-Claude fallback wrapper for Pro/Max users.

Total: ~3 sessions to cover all 31 registry agents + UI. Most of the work is plumbing (download / unpack / spawn), not novel design — the protocol layer already pays for itself.

## Cross-references

- [openacp-deep-dive-2026-04-28.md](openacp-deep-dive-2026-04-28.md) — registry reference impl + session-portable architecture
- [10-agent-router-landscape.md](10-agent-router-landscape.md) — full ACP wrapper ecosystem, subscription auth audit, Option B (silvercode-claude-acp) decision
- [acp-proxy.md](acp-proxy.md) — venture brainstorm
- [hub/ventures/acp-proxy-2026-04-27.md](../../../ventures/acp-proxy-2026-04-27.md) — venture scoring
- bead `km-silvercode.acp-comp-marketplace-dialogs` — UI scope (update with this snapshot)
