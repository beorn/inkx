# Adapter — Gemini (Google)

silvercode consumes Gemini via **`@google/gemini-cli`**'s built-in ACP
mode. Gemini CLI ships first-party ACP support behind the
`--experimental-acp` flag — no third-party wrapper required.

## Wire spawn

Registry id: **`gemini`** (see `acp-client.ts#ACP_REGISTRY`).

```
npx -y @google/gemini-cli --experimental-acp
```

silvercode reaches it via:

```ts
const session = await connectAcpRegistry(scope, "gemini", { cwd: process.cwd() })
```

The `--experimental-acp` flag is documented in the upstream
`docs/cli/cli-reference.md`:

> `--experimental-acp` — Start in ACP (Agent Code Pilot) mode.
> **Experimental feature.**

The flag is also wired in `packages/cli/src/config/config.ts` of the
`google-gemini/gemini-cli` repo.

## Authentication

Gemini CLI supports two auth paths:

- **"Sign in with Google"** OAuth — interactive browser flow. **Free
  tier**: 60 requests/minute, 1000 requests/day. No API key required.
  This is the default path the CLI offers on first run.
- **`GEMINI_API_KEY`** — paid API key with a higher quota.

silvercode forwards env vars verbatim:

```ts
await connectAcpRegistry(scope, "gemini", {
  cwd: process.cwd(),
  env: { GEMINI_API_KEY: process.env.GEMINI_API_KEY },
})
```

If neither is configured, Gemini CLI will prompt for sign-in on the
spawned process's stdio — silvercode does not currently render that
prompt; users complete sign-in by running `gemini` directly once before
launching silvercode.

## Caveats

- **`--experimental-acp` is experimental.** Schema and capability
  surface may shift between Gemini CLI minor versions. We pin nothing
  via `npx -y` today; if the wire breaks, escalate to a pinned version
  in the registry table.
- **First-run sign-in is out-of-band.** silvercode doesn't drive the
  OAuth flow itself; users complete it via `gemini` on the terminal,
  then silvercode reuses the cached credentials.
- **`npx -y` always pulls the latest published version.** For
  reproducible setups, install globally and override the registry args.

## Customising the model

Gemini CLI accepts `--model` (and other flags) on the same command
line. Use `extraArgs`:

```ts
await connectAcpRegistry(scope, "gemini", {
  cwd: process.cwd(),
  extraArgs: ["--model", "gemini-2.5-pro"],
})
```

This produces the spawn:

```
npx -y @google/gemini-cli --experimental-acp --model gemini-2.5-pro
```

## Why no stream-json adapter

The original plan considered a stateless mapper for Gemini CLI's
non-ACP output → ACP `SessionUpdate`, plus a separate HTTP path via
the Cloud Code Assist endpoint. Once `--experimental-acp` shipped
first-party, both were redundant for the common case:

| User has         | Path                                                   |
| ---------------- | ------------------------------------------------------ |
| Google account   | `--experimental-acp` + Sign in with Google (free tier) |
| `GEMINI_API_KEY` | `--experimental-acp` + API key (paid)                  |

A stream-json fallback is tracked at P4
(`km-silvercode.acp-adapter-gemini` notes) — only relevant for users
explicitly avoiding Google account login AND avoiding the experimental
ACP flag. Until such a user appears, the adapter remains deferred.

## Tests

The Registry entry is asserted in
`tests/registry-adapters.test.ts` (test id `gemini`). Custom
`extraArgs` (e.g. `--model`) are also covered there.
