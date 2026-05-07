# Adapter — Codex (OpenAI)

silvercode consumes Codex via **`@zed-industries/codex-acp`** — Zed's
ACP wrapper around the Codex CLI. The package is published on npm and
listed in the Zed ACP Registry.

## Wire spawn

Registry id: **`codex`** (see `acp-client.ts#ACP_REGISTRY`).

```
npx -y @zed-industries/codex-acp
```

silvercode reaches it via:

```ts
const session = await connectAcpRegistry(scope, "codex", { cwd: process.cwd() })
```

No silvercode-side adapter code is required. The Registry table maps the
id to the spawn command; `connectAcp` handles the rest.

## Authentication

`@zed-industries/codex-acp`'s README lists three first-class auth
methods:

- **ChatGPT subscription** — paid Plus/Pro account login. Recommended for
  users who already pay for ChatGPT and want to ride that quota.
- **`CODEX_API_KEY`** — Codex-specific key.
- **`OPENAI_API_KEY`** — generic OpenAI key.

silvercode forwards env vars verbatim to the spawned child:

```ts
await connectAcpRegistry(scope, "codex", {
  cwd: process.cwd(),
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
})
```

## Caveats

- **Subscription auth doesn't work in remote projects.** Per the upstream
  README: ChatGPT subscription auth requires a local browser to complete
  OAuth. SSH / dev-container / remote-tmux scenarios fall back to the
  API-key path. silvercode does not attempt to paper over this — it
  surfaces whichever `authMethods[]` Codex returns during initialize and
  lets the UI offer the appropriate flow.
- **`npx -y` always pulls the latest published version.** For
  reproducible setups, install globally and override the registry args:

  ```ts
  await connectAcp(scope, { command: "codex-acp", cwd: ... })
  ```

  (skipping the registry entirely).

## Capabilities

Per the upstream README, the adapter supports:

- Context @-mentions
- Image inputs
- Tool calls with permission requests
- Edit review
- TODO lists
- Slash commands: `/review`, `/review-branch`, `/review-commit`, `/init`,
  `/compact`, `/logout`, plus custom prompts
- Client-side MCP servers
- "Following" (cursor follow-along)

These map onto the standard ACP `SessionUpdate` variants — silvercode
needs no Codex-specific code paths.

## Why no stream-json adapter

The original plan was to build a stateless `(codex stream-json)
→ ACP SessionUpdate` mapper, mirroring the Claude adapter. Once
`@zed-industries/codex-acp` shipped with first-class subscription auth,
that work became redundant for every common case:

| User has                 | Path                       |
| ------------------------ | -------------------------- |
| ChatGPT Plus/Pro (local) | codex-acp subscription     |
| OPENAI_API_KEY           | codex-acp API key          |
| CODEX_API_KEY            | codex-acp Codex key        |
| Remote project + sub     | Fall back to API key (any) |

A stream-json fallback is tracked at P4
(`km-silvercode.acp-adapter-codex` notes) — only relevant if a future
silvercode user has API-key access but explicitly refuses to install
`@zed-industries/codex-acp`. Until that user appears, the adapter
remains deferred.

## Tests

The Registry entry is asserted in
`tests/registry-adapters.test.ts` (test id `codex`).
