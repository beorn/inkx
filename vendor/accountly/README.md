# accountly

Multi-profile manager for Claude Code. Run multiple Claude accounts in parallel on one machine — each with its own OAuth session, `/usage`, connected MCP servers, and Max quota — while sharing one `~/.claude/` for memory, skills, settings, and session history.

## How it works

Each profile is a separate directory under `~/.config/claude-profiles/<email>/`. Claude Code derives the macOS Keychain slot name from a sha256 of `CLAUDE_CONFIG_DIR`, so pointing two shells at two different dirs gives you two fully-independent OAuth sessions — no env-var token hacks, no shared-slot contention, real subscription features everywhere.

Shared state (settings, skills, plugins, CLAUDE.md, projects, session index, memory, hooks) lives in `~/.claude/` and is symlinked into each profile at bootstrap. Per-session state (credentials, statsig, caches, shell snapshots) stays per-profile.

Stock `~/.claude` keeps working alongside profiles. It uses the original unhashed `Claude Code-credentials` Keychain slot and is surfaced in the listing as `~/.claude (stock → <email>)` so you always know which account plain `claude` is billing against.

## Install

```bash
# 1. Build shim (one-time):
cat > ~/.local/bin/accountly <<'EOF'
#!/usr/bin/env bash
exec bun /Users/beorn/Code/pim/km/vendor/accountly/src/cli.ts "$@"
EOF
chmod +x ~/.local/bin/accountly

# 2. Set the default profile and add shell integration:
accountly claude-profile default you@example.com    # creates `default` symlink
# Add to your shell rc (~/.config/zsh/zshrc or ~/.bashrc):
if command -v accountly >/dev/null 2>&1; then
  eval "$(accountly claude-profile init)"            # auto-detects shell + default
fi
alias claude='accountly claude'
```

After sourcing zshrc, typing `claude` routes through accountly: default profile from the `default` symlink, current cmux workspace tag if any, or explicit `--user` override.

## Commands

### `accountly` (default) / `accountly status`

Shows all Claude Code accounts as a quota table — stock `~/.claude` first, then each profile under `~/.config/claude-profiles/`. The running command's **active** row gets a `●` marker; the **default** profile (from the `default` symlink) gets a `★` marker. Each row shows utilization bars for every named quota window (5-hour, 7-day, 7-day (Sonnet), Extra usage, plus any active Anthropic A/B-test windows with >0% utilization). Also lists API-key providers from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `XAI_API_KEY` / `GEMINI_API_KEY` / `OPENROUTER_API_KEY` when present. Running `accountly` alone shows the table **and** the command help; `accountly status` shows only the table.

```bash
accountly                        # table + help
accountly status                 # table only
accountly status --json          # machine-readable
```

Example output:

```
    PROFILE                          QUOTAS
●   ~/.claude (stock → d@example.com) 5-hour: ███████░░░  70%  7-day: ████████░░  81%  …
★   you@example.com                  5-hour: ░░░░░░░░░░   0%  7-day: ░░░░░░░░░░   0%  Extra usage: ████████░░  77%
    work@example.com                 5-hour: ░░░░░░░░░░   0%  7-day: ████████░░  75%  …
    ★ default   ● active · stock ~/.claude (no profile pinned)
```

The **active marker follows the shell**: if `CLAUDE_PROFILE` is set (typically by the init-zsh hook or a cmux workspace tag), that profile row gets `●`. Otherwise the stock row gets `●` because plain `claude` uses it.

### `accountly claude [args…]` — launch claude pinned to a profile

Pins claude to a profile (by email, by `auto`, or explicitly `default` = stock `~/.claude`) and forwards remaining args to the claude binary.

```bash
accountly claude                                  # uses $CLAUDE_PROFILE or the `default` symlink
accountly claude --user you@example.com           # pin to named profile
accountly claude --user you                       # short name — fuzzy-resolves to you@example.com
accountly claude --user auto                      # pick lowest-utilization profile
accountly claude --user default                   # plain ~/.claude, no profile override
accountly claude --user work@example.com --cmux   # spawn new cmux workspace, tagged
accountly claude --user you@example.com -- --help # forward claude args after --
```

With `alias claude='accountly claude'` installed, every `claude` invocation goes through this routing. If you want extra flags baked into every call, use a shell function (not an alias) so `--user` parsing still works:

```bash
claude() { accountly claude "$@" }
# Or with flags appended (function form preserves --user parsing):
claude() { accountly claude "$@" -- --some-flag }
```

### `accountly claude-profile <subverb>` — profile management

| Subverb | Purpose |
|---|---|
| `ls` (alias `list`) | List profiles with auth status; marks default (★) and active (●) |
| `default [profile]` | Show or set the default profile (backed by a `default` symlink in profileRoot) |
| `new <profile>` | Bootstrap a profile dir with shared-state symlinks (no launch) |
| `info <profile> [--token]` | Path, Keychain slot, email, auth; `--token` prints OAuth access token only |
| `init [profile] [--shell zsh\|bash]` | Print shell hook; auto-detects shell from `$SHELL`, reads profile from `default` symlink if omitted |
| `rename <old> <new>` | Move the dir AND rewrite the Keychain slot (handles both atomically) |
| `slot <profile>` | Print the Keychain service name for a profile |

```bash
accountly claude-profile ls                              # lists with markers, including stock
accountly claude-profile default you@example.com        # set default (creates `default` symlink)
accountly claude-profile default                         # show current default
accountly claude-profile default --clear                 # remove the default pointer
accountly claude-profile new work@example.com           # bootstrap a new profile dir
accountly claude-profile info you@example.com           # path, slot, email, auth
accountly claude-profile info you@example.com --token   # just the OAuth token (for apiKeyHelper)
accountly claude-profile rename old new@example.com     # manual one-off rename
accountly claude-profile init                            # auto-detected shell + default symlink
accountly claude-profile init you@example.com            # explicit profile, shell still auto-detected
accountly claude-profile init --shell bash               # override detected shell
accountly claude-profile init --shell bash you@example.com  # both overridden
```

### Profile name resolution

Profile names are email-derived by convention (`you@example.com`). Short names resolve via fuzzy lookup:

1. Exact match
2. Unique prefix match (`you` → `you@example.com`)
3. Unique substring match
4. Ambiguous or no match → passed through unchanged; `runProfile` bootstraps a new profile under that literal name

So `accountly claude --user you` resolves to `you@example.com` without typing the full address.

### Default profile (the `default` symlink)

The "default profile" is just a symlink inside `profileRoot`:

```
~/.config/claude-profiles/
├── you@example.com/
├── work@example.com/
└── default -> you@example.com
```

- `accountly claude-profile default <name>` creates/replaces the symlink.
- `accountly claude-profile default` (no arg) reads and prints the target.
- `accountly claude-profile default --clear` removes it.
- `accountly claude-profile init zsh` reads the target when no explicit default arg is passed, so you can change the default without editing zshrc — just `ln -sfh new@example.com default` (or use the subcommand) and re-source zshrc.
- `listProfiles()` skips the `default` entry so it doesn't appear as a phantom profile in the table.

### Stock `~/.claude` / plain `claude`

Plain `claude` with no `CLAUDE_CONFIG_DIR` / `CLAUDE_PROFILE` env vars still works — it reads `~/.claude/` and the unhashed `Claude Code-credentials` Keychain slot, just like stock Claude Code. accountly surfaces that slot as a synthetic row labeled `~/.claude (stock → <email>)` so you can see its quota and which account it's billing against.

- It's **independent** from every profile slot. No symlink, no shared credential — refreshing one never touches the other.
- If the stock slot happens to hold the same account as one of your profiles, you'll see identical quota numbers on both rows (they're the same underlying Anthropic account queried via two different OAuth slots).
- To point stock at a different account: `unset CLAUDE_PROFILE CLAUDE_CONFIG_DIR; claude /login` — that rewrites the stock slot only. Profile slots stay untouched.

## First-time setup

```bash
# 1. Bootstrap a profile and log in inside it:
accountly claude --user you@example.com
# inside claude: /login → pick your account in the browser → /exit

# 2. Set the default:
accountly claude-profile default you@example.com

# 3. Shell integration — add to your shell rc:
if command -v accountly >/dev/null 2>&1; then
  eval "$(accountly claude-profile init)"
fi
alias claude='accountly claude'

# 4. Check it worked:
accountly      # shows all accounts with quota bars, ★ on default, ● on active
claude         # launches pinned to you@example.com
```

## Architecture

```
CLI (commander)  →  Profile ops  →  Keychain (per-profile slot)  →  claude binary
                     │
                     └──  Shared state symlinks → ~/.claude/
```

- **Keychain slot derivation**: `Claude Code-credentials-<first 8 hex chars of sha256(profile_dir)>`. Verified against Claude Code 2.1.109. Stock `~/.claude` uses the unhashed `Claude Code-credentials` slot.
- **Profile root**: `~/.config/claude-profiles/` (override with `CLAUDE_PROFILE_ROOT`).
- **Default pointer**: `~/.config/claude-profiles/default` is a relative symlink to the chosen profile dir. `listProfiles()` filters it out; `initShell()` resolves it at hook-generation time.
- **Shared items** (symlinked from `~/.claude/` at bootstrap): `CLAUDE.md`, `settings.json`, `settings.local.json`, `skills`, `plugins`, `agents`, `commands`, `hooks`, `output-styles`, `ide`, `projects`, `sessions`, `session-index.db{,-shm,-wal}`, `todos`.
- **Bootstrap is idempotent** — running `accountly claude --user X` or `accountly claude-profile new X` refreshes symlinks for any `SHARED_ITEMS` added after the profile was created.
- **Rename safety**: `renameProfile` rolls back the directory move if writing the new Keychain slot fails.
- **Unknown quota windows**: Anthropic's usage API occasionally includes experimental window keys (e.g. `seven_day_omelette`, `iguana_necktie`). The provider filters unknown keys from the output unless they have utilization > 0, so dormant codenames don't clutter the table but live ones surface under their raw name.

## Cmux workspace integration

`accountly claude --user <name> --cmux` creates a new cmux workspace, tags it (`claude_profile=<name>`) for the sidebar, sets a deterministic color, renames it `<emoji> <name>`, then launches claude pinned to the profile in the first pane. Sibling panes inside that workspace inherit `CLAUDE_CONFIG_DIR` via the init-zsh hook, so any `git`/`lazygit`/`claude` invocation in those tabs uses the same profile.

The init-zsh hook resolution order is:

1. If `$CMUX_WORKSPACE_ID` is set and the workspace has a `claude_profile` status tag → use that profile.
2. Otherwise → fall back to the `default` symlink target (if any).
3. Otherwise → leave `CLAUDE_CONFIG_DIR` unset (plain `claude` uses stock `~/.claude`).

## Known gaps

- **`adopt` command for stock → profile migration**: currently if stock `~/.claude` holds an account that isn't in a profile yet, you have to bootstrap the profile dir and `/login` inside it separately. An `accountly claude-profile adopt` that reads the stock Keychain slot, fetches the email via the OAuth profile endpoint, creates a matching profile, and copies the credential into the new slot in one step would remove the manual step.
- **`apiKeyHelper` integration**: `accountly claude-profile info <profile> --token` prints the access token, suitable for use as `apiKeyHelper` in `settings.json`, but there's no one-shot wiring yet.
- **TS sibling typecheck noise**: `tsc --noEmit` in the km workspace surfaces pre-existing JSX config errors in `display.tsx` and `node16` moduleResolution errors in `../silvery/` — unrelated to accountly source files.

## Programmatic API

```typescript
import {
  // profile discovery & ops
  listProfiles,
  profileDir,
  profileRoot,
  keychainSlot,
  readKeychainForProfile,
  writeKeychainForProfile,
  bootstrapProfile,
  runProfile,
  cmuxSpawn,
  initShell,
  renameProfile,
  resolveProfileName,

  // stock ~/.claude support
  getLegacyDefaultProfile,
  checkLegacyDefaultQuota,
  readLegacyKeychain,
  writeLegacyKeychain,
  LEGACY_KEYCHAIN_SLOT,

  // default-pointer symlink
  getDefaultProfile,
  setDefaultProfile,
  clearDefaultProfile,
  defaultLinkPath,

  // quota checks
  checkProfileQuota,
  checkAllProfileQuotas,
  findBestProfile,

  // account metadata
  fetchProfileEmail,
  isLoggedIn,

  // cosmetic (used by --cmux)
  profileEmoji,
  profileColor,
} from "@beorn/accountly"
```

Types: `ProfileInfo`, `ProfileQuotaResult`, `MigrationStep`.

## License

MIT
