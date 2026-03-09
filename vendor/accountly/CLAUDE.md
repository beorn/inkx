# @beorn/accountly

Multi-account manager for Claude Code and other AI providers. Manages credentials, checks quotas, and switches between accounts.

## Quick Start

```bash
accountly import personal        # Snapshot current Claude Code credentials
accountly status                 # Check all account quotas
accountly switch <name>          # Switch active account
accountly auto                   # Auto-switch to best account
```

## Architecture

```
CLI (commander) → Config + Credentials (filesystem) → Providers (quota API) → Keychain (active slot)
```

- **Config**: `~/.config/accountly/accounts.json` — account registry (no secrets)
- **Credentials**: `~/.config/accountly/credentials/<name>.json` — per-account secrets (mode 0600)
- **Keychain**: macOS Keychain `"Claude Code-credentials"` — the active slot Claude Code reads from
- **Providers**: Pluggable quota checkers (claude-oauth, anthropic-api, openai, google)

## Code Style

Factory functions, no classes, explicit types. Follows km project conventions.

## Testing

```bash
bun vitest run tests/
```

Tests use temp directories for filesystem operations and mock `fetch` for API calls. Keychain tests verify command format without actually touching Keychain.
