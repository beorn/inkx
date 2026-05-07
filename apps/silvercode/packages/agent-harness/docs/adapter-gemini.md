# Adapter — Gemini (Google)

silvercode consumes Gemini via **`@google/gemini-cli`**'s built-in ACP
mode. Gemini CLI ships first-party ACP support behind the `--acp` flag
(formerly `--experimental-acp`) — no third-party wrapper required.

## Wire spawn

Registry id: **`gemini`** (see `acp-client.ts#ACP_REGISTRY`).

```
bun x @google/gemini-cli --acp
```

silvercode reaches it via:

```ts
const session = await connectAcpRegistry(scope, "gemini", { cwd: process.cwd() })
```

The `--acp` flag is documented in the upstream `docs/cli/cli-reference.md`.
`--experimental-acp` is accepted but deprecated as of gemini-cli 0.38+; the
registry uses `--acp`.

The registry also sets `GEMINI_CLI_TRUST_WORKSPACE=true` automatically
(same effect as `--skip-trust`). Without this, gemini-cli writes an info
notice to stdout in ACP mode that corrupts the ndJSON-RPC stream. See
"Stdout pollution" below for the full analysis.

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

## Stdout pollution

**Root cause (analysed 2026-04-26):** In ACP mode, `@google/gemini-cli`
calls `createNonInteractiveUI()` for slash-command processing. That
function writes `info`-level feedback directly to `process.stdout`
(not stderr), bypassing the ndJSON stream guard. The specific line that
triggered the bug:

```
Skipping project agents due to untrusted folder. To enable, ensure that the project root is trusted.
```

Emitted by `coreEvents.emitFeedback("info", ...)` during agent-registry
startup when the working directory is not in the gemini trust list.

**Fix #1 — env var (specific):** `GEMINI_CLI_TRUST_WORKSPACE=true` tells
gemini-cli to skip the trust check, which prevents this particular
`info` message from being emitted. Injected automatically by the
registry (same effect as `--skip-trust` on the CLI).

**Fix #2 — stdout filter (general):** `connectAcp` wraps the child's
stdout with `buildNonJsonLineFilter` before handing it to `acp.ndJsonStream`.
The filter passes only lines starting with `{`; all other non-empty lines
are routed to `onDropped`, which emits them as `error` AgentEvents so
they remain visible in the UI's error panel. This protects against any
current or future info-level stdout noise from any ACP server.

## Caveats

- **`--experimental-acp` is deprecated.** The flag still works but
  prefer `--acp` (canonical as of 0.38+). The registry uses `--acp`.
- **Schema surface may shift between minor versions.** We pin nothing
  via `bun x` today; if the wire breaks, escalate to a pinned version
  in the registry table.
- **First-run sign-in is out-of-band.** silvercode doesn't drive the
  OAuth flow itself; users complete it via `gemini` on the terminal,
  then silvercode reuses the cached credentials.
- **`bun x` always pulls the latest published version.** For
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
bun x @google/gemini-cli --acp --model gemini-2.5-pro
```

## Why no stream-json adapter

The original plan considered a stateless mapper for Gemini CLI's
non-ACP output → ACP `SessionUpdate`, plus a separate HTTP path via
the Cloud Code Assist endpoint. Once `--acp` shipped first-party, both
were redundant for the common case:

| User has       | Path                                    |
| -------------- | --------------------------------------- |
| Google account | --acp + Sign in with Google (free tier) |
| GEMINI_API_KEY | --acp + API key (paid)                  |

A stream-json fallback is tracked at P4
(`km-silvercode.acp-adapter-gemini` notes) — only relevant for users
explicitly avoiding Google account login AND avoiding the ACP flag.
Until such a user appears, the adapter remains deferred.

## Tests

The Registry entry is asserted in
`tests/registry-adapters.test.ts` (test id `gemini`). Custom
`extraArgs` (e.g. `--model`) are also covered there.
