# CAP — Commander App Protocol

**Goal**: a protocol that CLI apps speak to shells + agents — successor to OSC 133 shell integration for the structured / AI era. The leverage point that makes "millions of apps" tractable: apps adopt the protocol once, commander + agents integrate all CAP-speaking apps generically.

## Problem

Current shell integration (OSC 133, OSC 7, OSC 9) is stream-level and text-native. Agents parsing `--help` is fragile; no typed output; no capability discovery; no bidirectional control; no live introspection. Every integration is bespoke; the long tail of tools is uneconomic to integrate.

## What CAP carries

### 1. Manifest (JSON)

On `$PREFIX/share/cap/<app>.json` or `<app> --cap-manifest`:

```json
{
  "name": "gh",
  "version": "2.45.0",
  "cap_version": "1",
  "description": "GitHub CLI",
  "subcommands": {
    "pr": {
      "description": "Pull requests",
      "subcommands": {
        "create": {
          "description": "Create a pull request",
          "intent": "open a PR from current branch",
          "flags": {
            "title": { "type": "string", "required": true },
            "body": { "type": "string" },
            "base": { "type": "branch", "default": "main" },
            "draft": { "type": "boolean" }
          },
          "permissions": ["network", "reads-git", "writes-remote"],
          "outputs": [
            { "type": "prompt", "on": "ask-user" },
            { "type": "finished", "on": "done" },
            { "type": "url", "field": "pr_url" }
          ]
        }
      }
    }
  },
  "exit_codes": { "0": "success", "1": "error", "2": "usage" }
}
```

Fields:

- Subcommands + flags + arg types (JSON Schema)
- Input / output types
- Exit codes + meanings
- Permissions required (reads-fs, writes-fs, network, spawns-child, touches-$HOME, keychain)
- Capabilities (streaming, resumable, interactive, idempotent)
- Intent description for AI ranking ("open a PR", "resize an image")

### 2. Typed streams (alongside classic stdout/stderr)

When `CAP_OUTPUT=blocks` is set in environment, the app emits JSON-lines to stdout instead of (or alongside) text output:

- **Blocks**: typed output units — `table`, `log`, `diff`, `progress`, `prompt`, `image`, `tree`, `file-entry`, `finished`
- **Events**: semantic — `started`, `step(name)`, `asks-user`, `wants-permission`, `finished`

```jsonl
{"kind":"started","when":"2026-04-23T...","pid":12345}
{"kind":"step","name":"fetching-prs"}
{"kind":"progress","current":5,"total":23,"label":"prs"}
{"kind":"table","columns":["number","title","author"],"rows":[[1234,"Fix X","alice"],...]}
{"kind":"finished","exit_code":0,"duration_ms":1234}
```

Commander / agent consumes these as typed objects, renders them with typed renderers.

### 3. Bidirectional control

- Typed input to answer `asks-user` events (without re-parsing prompt text)
- Live-state queries (progress, current-file, cancel-cost)
- Structured cancellation (not just SIGINT — "cancel at next safe point")
- Resume / suspend

Implementation: side-channel FD (3) for control messages, bidirectional JSON-RPC. Fallback to stdin/stdout when the app only has the standard streams.

### 4. Typed completion

`<app> --cap-complete <partial>` returns typed entries:

```json
{
  "completions": [
    { "value": "main", "type": "branch", "description": "default branch" },
    { "value": "feature/x", "type": "branch" },
    { "value": "1234", "type": "pr", "description": "Fix X" }
  ]
}
```

Commander picks per-type picker UI (branch picker, PR picker, file picker, etc.) instead of falling back to fuzzy string match.

### 5. App-as-MCP-server

The manifest doubles as an MCP tool schema. Agents call operations via typed tool calls, not text commands:

```typescript
// Instead of: `gh pr create --title "Fix X" --body "..."`
await tools.gh_pr_create({ title: "Fix X", body: "..." })
```

Human front-end: commander UI. Agent front-end: MCP tools. Same manifest powers both.

## AI-native specifics

- **Intent-first palette**: "resize an image" → query CAP manifests by intent, rank by context (installed? recently used? cwd relevance?), present matches. Works across tools without agent needing to memorize command names.
- **Natural-language flag forms**: `<FlagForm>` has a "describe it" field; agent fills flags; user reviews typed values; one click executes.
- **Typed composition graphs**: agent proposes DAG of CAP operations; commander type-checks at design time ("step 2 wants a `branch`, step 1 outputs a `pr` — needs `.head.branch` extractor").
- **Explainability**: blocks carry "how-I-got-here" provenance trail — full CAP call with flag values, cwd, env.
- **Conversational refinement**: a block is a queryable dataset, not frozen text. "Filter that log to errors from the last hour" is a typed op, not a re-run.

## Scale model

- **Silvery-native apps** adopt CAP natively — manifest is small, get integration free.
- **Non-silvery tools wrapped** via `cap-wrap <cmd>` — heuristic manifest derived from `--help` + output mapping. Community-curated, git-versioned, PR-reviewed.
- **Legacy tools fall through** to current behavior — protocol is opt-in, not required.
- **Flywheel**: author writes manifest → users + agents get rich experience → more authors adopt.

### cap-wrap (critical for scale)

Without `cap-wrap`, CAP adoption is per-tool hand-labor and doesn't scale. The tool:

- Parses `--help` / `-h` heuristically for common CLI styles (GNU getopt, Clap, cobra, click, argparse)
- Generates a starter manifest with detected flags + types + subcommands
- User (or agent) reviews + refines
- Publishes to community registry (`cap-registry` — git-tracked per-package manifests at a well-known repo)
- Commander auto-syncs registry on update

Day 1 experience: "I just installed `gh`. Open commander. `cap-wrap gh` runs in background. 2 seconds later, `gh` is in my CAP palette, typed, auto-completed." Adoption doesn't wait on upstream.

## v0 scope (4-6 weeks)

1. Manifest format + JSON Schema — hand-write manifests for 5-10 canonical tools (git, gh, npm, bun, docker)
2. Block stdout mode via `CAP_OUTPUT=blocks` env var — first 4 block types (log, table, progress, prompt, finished)
3. Typed completion via `--cap-complete`
4. App registry — scan PATH at palette open
5. `cap-wrap` tool — wrap classic CLIs heuristically

## Comparison

- **MCP**: same shape, but server-side/always-running. CAP apps are CLI-invoked MCP servers. Complementary, not competing.
- **Raycast extensions**: GUI-only, macOS-only, proprietary registry.
- **VS Code extensions**: tied to VS Code.
- **nushell**: structured data but no per-app protocol; wraps classics with parsers.
- **Shell integration (OSC 133)**: too thin, no manifest, no structured data.
- **zx / dax**: shell ergonomics, no typed app protocol.

## Who writes manifests

- Tool authors (preferred; ship manifest with release)
- Community (cap-registry, PR-reviewed; our team curates initially)
- Agents (generate + submit; treat as draft, human-review)
- `cap-wrap` (heuristic, lowest quality, highest coverage)

## Relation to other docs

- [06-commander.md](06-commander.md) consumes CAP manifests for palette, forms, block rendering. CAP is what makes commander interesting beyond "Warp with a pretty palette."
- [04-multiplex.md](04-multiplex.md) — CAP events flow through pane metadata; block search indexes CAP blocks.
- [02-agent-integration.md](02-agent-integration.md) — agents use CAP-as-MCP to call apps directly instead of emitting text commands.
- [03-agent-authoring.md](03-agent-authoring.md) — silvery-native agents are CAP-first from day 1.

## Origin

2026-04-23 discussion — user's "millions of apps" framing + AutoCompletor / ff as existing silvery-native tools. The leverage realization: commander is only "better Warp" without a protocol; with CAP, it's a platform.

