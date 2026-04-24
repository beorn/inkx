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
 * Honors `$HOME` first so tests can redirect to a tmp dir via `vi.stubEnv`;
 * falls back to `os.homedir()` (which reads from passwd, not env, on macOS).
 * Production paths still resolve to the user's real home because `$HOME` is
 * set on login shells.
 */
export function accountsRoot(): string {
  const home = process.env.HOME ?? homedir()
  return join(home, ".silvercode", "accounts")
}

/**
 * Resolve an account name to its absolute config dir. Ensures the parent
 * `~/.silvercode/accounts/` exists so writes don't race on first run; does
 * NOT create the account dir itself (the user populates it by copying
 * `~/.claude/` contents — see the stderr hint in index.tsx).
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
 * List the account names under `~/.silvercode/accounts/`. Returns an empty
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
