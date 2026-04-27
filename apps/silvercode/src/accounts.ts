/**
 * Multi-account support — per-session Anthropic credential isolation.
 *
 * Silvercode's v1.1 headline differentiator: each session can bind to a
 * distinct Anthropic account (Pro, Max, work, experimental…) so heavy users
 * who juggle 2–4 accounts to route around rate limits stop having to
 * shell-alias `CLAUDE_CONFIG_DIR` by hand.
 *
 * The mechanism is simple: we point `claude` at a per-account config dir
 * via `CLAUDE_CONFIG_DIR`, which is where the CLI stashes OAuth creds,
 * session history, and settings. Everything else about the spawn is
 * unchanged. Nobody else in the coding-agent space (Cursor, Cline,
 * opencode) can do this — they're API-key-only and don't own the spawn
 * boundary.
 *
 * This module owns the filesystem side: resolving names to paths, sniffing
 * whether an account dir has been populated, and listing what's available.
 * The OAuth onboarding flow (which would create a new account dir from
 * scratch) is a follow-up — for now users copy `~/.claude/` manually.
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * Root of the silvercode account store. Mirrors `~/.claude/` layout per name.
 *
 * We use `~/.config/claude-profiles/` — the same root accountly uses — so
 * silvercode and `accountly` share profile dirs (and therefore Keychain
 * slots, since the slot is `sha256(profileDir).slice(0,8)`). Without this
 * alignment, an account created via `accountly claude-profile new <email>`
 * would have valid OAuth in the Keychain that silvercode couldn't read,
 * because silvercode's hash of the profile dir would resolve to a
 * different (empty) Keychain slot. SidePanel would then show no plan / no
 * quotas for an account the user thinks is configured.
 *
 * Honors `$HOME` first so tests can redirect to a tmp dir via `vi.stubEnv`;
 * falls back to `os.homedir()` (which reads from passwd, not env, on macOS).
 * Production paths still resolve to the user's real home because `$HOME` is
 * set on login shells.
 */
export function accountsRoot(): string {
  const home = process.env.HOME ?? homedir()
  return join(home, ".config", "claude-profiles")
}

/**
 * Resolve an account name to its absolute config dir. Ensures the parent
 * `~/.config/claude-profiles/` exists so writes don't race on first run; does
 * NOT create the account dir itself (the user populates it by copying
 * `~/.claude/` contents or via `accountly claude-profile new <email>`).
 */
export function resolveAccountDir(name: string): string {
  const root = accountsRoot()
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return join(root, name)
}

/**
 * Whether the account dir is populated enough for claude to read creds from
 * it. We look for either `settings.json` (the normal case) or
 * `.credentials.json` (what OAuth writes). Presence of the dir alone isn't
 * enough — an empty dir silently degrades to anonymous claude, which is a
 * worse UX than failing loudly.
 */
export function accountExists(name: string): boolean {
  const dir = resolveAccountDir(name)
  if (!existsSync(dir)) return false
  return existsSync(join(dir, "settings.json")) || existsSync(join(dir, ".credentials.json"))
}

/**
 * Override `process.env.CLAUDE_CONFIG_DIR` for the silvercode process so
 * SidePanel's `resolveActiveEmail()` returns the requested account.
 *
 * Without this, the spawned Claude subprocess correctly bills the
 * requested account (spawnClaude sets the env on the subprocess only),
 * but silvercode's own SidePanel reads its OWN process env — which is
 * inherited from the user's shell. The visible side-panel email then
 * disagrees with the actual account being billed.
 *
 * Pass `name` undefined to leave the env untouched (no `--account` flag
 * given → use whatever the shell set). Returns the resolved configDir
 * (or undefined) so callers can pass it through to subprocesses.
 */
export function applyActiveAccountEnv(name: string | undefined): string | undefined {
  if (name === undefined || name.length === 0) return undefined
  const dir = resolveAccountDir(name)
  process.env.CLAUDE_CONFIG_DIR = dir
  return dir
}

/**
 * List the account names under `~/.config/claude-profiles/`. Returns an empty
 * array when the root doesn't exist yet (first-run case). Only subdirectory
 * names — stray files are ignored.
 */
export function listAccounts(): string[] {
  const root = accountsRoot()
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    try {
      const st = statSync(join(root, entry))
      if (st.isDirectory()) out.push(entry)
    } catch {
      // best-effort — unreadable entries are skipped
    }
  }
  out.sort()
  return out
}
