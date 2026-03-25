# accountly

Multi-account manager for Claude Code and other AI providers. Credential switching, quota monitoring, and auto-rotation.

## Install

```bash
bun add @beorn/accountly
```

## Quick Start

```bash
accountly import           # Snapshot current Claude Code credentials from Keychain
accountly status           # Check all account quotas
accountly switch <name>    # Switch active account
accountly auto             # Auto-switch to account with most remaining quota
```

## CLI Commands

| Command | Description |
|---|---|
| `accountly` | Show discovered accounts with quota status |
| `accountly status` | Show all accounts with quota usage |
| `accountly import` | Import Claude Code credentials from macOS Keychain |
| `accountly switch <name>` | Switch active Claude Code account |
| `accountly auto` | Auto-switch to account with lowest utilization |
| `accountly add <name> -p <provider>` | Add an account manually (with `--key` or `--env`) |
| `accountly rename <old> <new>` | Rename an account |
| `accountly remove <name>` | Remove an account and its credentials |
| `accountly get-token` | Output the active access token (for apiKeyHelper) |

## Supported Providers

`claude-oauth`, `anthropic-api`, `openai`, `xai` (Grok), `google` (Gemini), `openrouter`

Accounts are auto-discovered from macOS Keychain (Claude Code) and environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`).

## Programmatic API

```typescript
import { discoverAccounts, checkAllQuotas, findBestAccount, switchAccount } from "@beorn/accountly"

const discovered = discoverAccounts()
const quotas = await checkAllQuotas(discovered)
const best = findBestAccount(quotas)
if (best) await switchAccount(best.accountName)
```

### Exports

- **Config**: `readConfig`, `writeConfig`, `getAccounts`, `getAccount`, `upsertAccount`, `removeAccount`, `renameAccount`, `getActiveAccount`, `setActiveAccount`
- **Credentials**: `readCredential`, `writeCredential`, `deleteCredential`, `renameCredential`, `credentialExists`
- **Keychain**: `readKeychainCredential`, `writeKeychainCredential`, `keychainCredentialExists`
- **Quota**: `checkAccountQuota`, `checkAllQuotas`, `findBestAccount`
- **Discovery**: `discoverAccounts`, `getCredentialForAccount`
- **Switching**: `switchAccount`
- **OAuth**: `fetchClaudeProfile`, `refreshOAuthToken`, `ensureFreshOAuth`

## License

MIT
