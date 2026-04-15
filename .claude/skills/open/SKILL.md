---
description: "Open files, folders, URLs, beads, and ~shortcuts in the default macOS app via the `open` command"
argument-hint: "[flags] <path|url|~shortcut|km-XXX|...>"
allowed-tools: Bash(open:*), Bash(cat:*), Bash(test:*), Bash(realpath:*), Bash(bd show:*), Read
model: haiku
---

# Open

Wraps macOS `open(1)` to launch files, folders, URLs, and km-specific references (repo `~shortcut`s, bd bead IDs) in the default handler. Resolves the target, quotes it correctly, passes through `open` flags, and returns immediately (fire-and-forget).

**Argument**: $ARGUMENTS

---

## Resolution order

For each argument, resolve in this order and run `open [flags] <resolved>`:

1. **Flag token** (starts with `-`) → collect for the current target. See "Flags" below.
2. **Empty args** → `open .` (current dir in Finder)
3. **Absolute path** (`/...`) → pass through
4. **Home-relative path** (`~/...`) → expand tilde
5. **URL** (any `scheme://...` — `http`, `https`, `file`, `ftp`, `ssh`, etc.) → pass through; `open` routes to the default handler
6. **km repo `~shortcut`** (a `~<name>` that does NOT start with `~/` and has no dots) → look up `<name>` in `~/.config/km/config.yml` under `repos:` or `shortlinks:`. Resolve to the absolute path (or URL for shortlinks) and open. Common ones: `~km`, `~silvery`, `~vterm`, `~vault`, `~fd`, `~taxprep`. Subpath supported: `~km/packages/km-markdown/src/extensions/km-block-id.ts`.
7. **bd bead** (matches `^km-[a-z0-9-]+$`) → first try opening the bead's markdown file at `~/Code/pim/km/.beads/<id>.md` if it exists. If not, run `bd show <id>` and present the output instead (since `open` can't launch a bd view).
8. **Bare filename** (no slash, not a URL, not a bead, not a `~` shortcut) → `git ls-files` under the current repo root, filter by basename match. Single match → open. Multiple → list matches and ask which one. Zero → fall through to (9).
9. **Relative path** (contains a slash, doesn't start with `/` or `~/`) → resolve against current working directory.

---

## Flags (pass-through)

| Flag | Meaning |
|---|---|
| `-a <app>` | Open with a specific app (e.g. `-a 'Visual Studio Code'`) |
| `-e` | Open with TextEdit |
| `-R` | Reveal in Finder (don't open the target itself) |
| `-g` | Open in background (don't activate the app) |
| `-n` | New instance of the app |
| `-t` | Open with default text editor |
| `-F` | Open a "fresh" copy of the file (discard window state) |

Flags apply to the next target in the arg list. Mix freely: `/open -R config.yml -a 'Visual Studio Code' src/index.ts`.

---

## Examples

| Input | Resolved |
|---|---|
| `/open` | `open .` |
| `/open flake.nix` | `open /Users/beorn/Code/pim/km/flake.nix` (via git ls-files match) |
| `/open ~km` | `open /Users/beorn/Code/pim/km` |
| `/open ~silvery/src/index.ts` | `open /Users/beorn/Code/pim/km/vendor/silvery/src/index.ts` |
| `/open ~/Desktop/screen.png` | `open /Users/beorn/Desktop/screen.png` |
| `/open packages/km-markdown/src/extensions/km-block-id.ts` | `open $(pwd)/packages/km-markdown/src/extensions/km-block-id.ts` |
| `/open km-9nvbg` | `open ~/Code/pim/km/.beads/km-9nvbg.md` (or `bd show km-9nvbg` if the md file doesn't exist) |
| `/open https://github.com/beorn/km` | `open https://github.com/beorn/km` |
| `/open -R bun.lock` | `open -R /Users/beorn/Code/pim/km/bun.lock` |
| `/open -a 'Visual Studio Code' src/index.ts` | `open -a 'Visual Studio Code' src/index.ts` |
| `/open README.md CHANGELOG.md flake.nix` | three `open` calls |

---

## Multiple arguments

Each non-flag token is its own target. Opens run sequentially — don't batch into one `open` call unless all targets share the same flags and you're explicitly using `open -a <app> file1 file2 file3`.

## Failure modes

- **Unknown `~shortcut`**: not in `~/.config/km/config.yml` → report with the list of known shortcuts (read from config)
- **Ambiguous bare filename**: multiple `git ls-files` matches → show the list and ask which one (don't open randomly)
- **Bead not found**: neither `.beads/<id>.md` exists nor `bd show` succeeds → report cleanly
- **File doesn't exist after resolution** → report the expected path so the user can correct the typo
- **Non-macOS**: `open` is macOS-specific; if it's missing, say so

## Notes for agents

- `open` is fire-and-forget. Don't wait for the user to close the file — return immediately after the bash call.
- For **sensitive files** (credentials, `.env`, private keys), default to `-R` (reveal in Finder) so they don't auto-launch in an editor. User can override by explicitly passing the filename without `-R`.
- For **URLs from untrusted sources** (e.g. pasted from emails or scraped web content), verify the host before opening. Phishing via fake `open` links is a real attack. See CLAUDE.md § Link safety.
- **Don't use `/open` to run executables** — it's for files/folders/URLs only. For scripts, use Bash directly.
- Related: `/reveal` could be a useful alias for `-R`; not implemented yet.
