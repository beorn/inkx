import {
  mkdirSync,
  existsSync,
  symlinkSync,
  readdirSync,
  rmdirSync,
  lstatSync,
  renameSync,
  readlinkSync,
  unlinkSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { homedir, userInfo } from "node:os"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import type { Credential, QuotaInfo } from "./types.ts"
import { ensureFreshOAuth, extractPlan, fetchClaudeProfile } from "./providers/claude-oauth.ts"
import { getProvider } from "./providers/index.ts"

/**
 * Profile-based multi-account management.
 *
 * Each Claude Code profile is a separate directory under
 * `~/.config/claude-profiles/`. macOS Keychain slots are derived from a
 * sha256 hash of the absolute profile path (`Claude Code-credentials-<8hex>`),
 * which gives each profile its own OAuth session — real subscription auth in
 * parallel, no /usage downgrade, full connected-MCP server support.
 *
 * Everything under `~/.claude/` is symlinked into each profile by default;
 * only identity-bound state (see `PER_PROFILE_ITEMS` below) stays per-profile.
 * New dirs Claude Code adds over time are picked up automatically on the next
 * bootstrap — no allowlist to maintain.
 */

const DEFAULT_PROFILE_ROOT = join(homedir(), ".config", "claude-profiles")

/**
 * Items under ~/.claude/ that stay per-profile (identity-bound state).
 * Denylist instead of allowlist so future dirs Claude Code adds are shared
 * by default — an allowlist silently misses them until a feature breaks.
 */
const IDENTITY_BOUND_ITEMS = new Set<string>([".credentials.json", "statsig"])

/** Yield every ~/.claude entry that should be shared into `profileDir`. */
function* shareableEntries(profileDir: string): Generator<{ item: string; src: string; dst: string }> {
  const claudeHome = join(homedir(), ".claude")
  let entries: string[]
  try {
    entries = readdirSync(claudeHome)
  } catch {
    return
  }
  for (const item of entries) {
    if (IDENTITY_BOUND_ITEMS.has(item)) continue
    yield { item, src: join(claudeHome, item), dst: join(profileDir, item) }
  }
}

export interface ProfileInfo {
  name: string
  dir: string
  authenticated: boolean
  slot: string
  /** Email annotation for the synthetic stock row — shown dim beside the name. */
  email?: string
  /** Subscription plan (raw `organization_type` from the profile API). */
  plan?: string
}

export function profileRoot(): string {
  return process.env.CLAUDE_PROFILE_ROOT ?? DEFAULT_PROFILE_ROOT
}

/**
 * Profile name safety check. Profiles are directory names under profileRoot,
 * and that name flows into mkdirSync, renameSync, symlink targets, and
 * the Keychain slot hash. An attacker-controlled name like "../../etc"
 * would escape profileRoot and operate on arbitrary paths. Restrict to
 * a safe character class and explicitly forbid path traversal tokens.
 *
 * Email addresses (the canonical profile-name form) fit well within this:
 * `[A-Za-z0-9._+@-]+` covers the RFC 5322 practical subset.
 */
const PROFILE_NAME_RE = /^[A-Za-z0-9._+@-]+$/

export function assertSafeProfileName(name: string): void {
  if (!name || name.length > 128) {
    throw new Error(`accountly: invalid profile name (empty or too long): "${name}"`)
  }
  if (name === "." || name === ".." || name === "default") {
    throw new Error(`accountly: reserved profile name: "${name}"`)
  }
  if (!PROFILE_NAME_RE.test(name)) {
    throw new Error(
      `accountly: invalid profile name "${name}" — must match ${PROFILE_NAME_RE} (letters, digits, . _ + @ -)`,
    )
  }
  // Defense in depth: reject any name that would escape profileRoot after resolution.
  const root = resolve(profileRoot())
  const dir = resolve(join(root, name))
  if (!dir.startsWith(root + "/") || dir === root) {
    throw new Error(`accountly: profile name "${name}" escapes profileRoot`)
  }
}

export function profileDir(name: string): string {
  assertSafeProfileName(name)
  return resolve(join(profileRoot(), name))
}

/** The magic name used for the default-pointer symlink inside profileRoot. */
const DEFAULT_LINK_NAME = "default"

/** Path to the `default` pointer symlink itself (not the target). */
export function defaultLinkPath(): string {
  return join(profileRoot(), DEFAULT_LINK_NAME)
}

/** Read the current default profile name (via `default` symlink target). */
export function getDefaultProfile(): string | undefined {
  const link = defaultLinkPath()
  try {
    const s = lstatSync(link)
    if (!s.isSymbolicLink()) return undefined
    const target = readlinkSync(link)
    // symlink target is typically a bare dir name (relative) or an absolute path
    const base = target.includes("/") ? target.split("/").filter(Boolean).pop()! : target
    if (!base) return undefined
    // Defense in depth: the returned name flows into shell-eval'd output
    // (`initShell()`) and into filesystem paths. Reject anything that isn't
    // a safe profile name — an attacker who can write to profileRoot could
    // otherwise inject shell via the symlink target.
    try {
      assertSafeProfileName(base)
    } catch {
      return undefined
    }
    return base
  } catch {
    return undefined
  }
}

/** Set the default profile to <name>, replacing any existing `default` symlink. */
export function setDefaultProfile(name: string): void {
  const link = defaultLinkPath()
  const target = profileDir(name)
  if (!existsSync(target)) {
    throw new Error(`profile "${name}" does not exist at ${target}`)
  }
  // Replace any existing default pointer (symlink or real file/dir).
  try {
    const s = lstatSync(link)
    if (s.isSymbolicLink()) unlinkSync(link)
    else if (s.isDirectory()) rmdirSync(link)
    else unlinkSync(link)
  } catch {
    /* doesn't exist yet */
  }
  if (!existsSync(profileRoot())) mkdirSync(profileRoot(), { recursive: true })
  // Use a relative target so the symlink stays portable across home dir moves.
  symlinkSync(name, link)
}

/** Clear the default pointer (no-op if absent). */
export function clearDefaultProfile(): void {
  const link = defaultLinkPath()
  try {
    if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
  } catch {
    /* nothing to clear */
  }
}

/**
 * Resolve a possibly-short profile name against existing profiles so short
 * names can stand in for full email-derived names. Lookup order:
 *   1. Exact match
 *   2. Unique prefix match (`foo` → `foo@example.com`)
 *   3. Unique substring match (`bar` → `b@bar.example.com`)
 *   4. Return the input unchanged (caller will bootstrap a new profile)
 * On ambiguous matches, returns the input unchanged so the caller can decide.
 */
export function resolveProfileName(input: string): string {
  const root = profileRoot()
  if (!existsSync(root)) return input
  const names = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
  if (names.includes(input)) return input

  const lower = input.toLowerCase()
  const prefix = names.filter((n) => n.toLowerCase().startsWith(lower))
  if (prefix.length === 1) return prefix[0]!
  if (prefix.length > 1) return input // ambiguous

  const substring = names.filter((n) => n.toLowerCase().includes(lower))
  if (substring.length === 1) return substring[0]!

  return input
}

/**
 * Compute the macOS Keychain service name Claude Code uses for a given config
 * dir. Format: `Claude Code-credentials-<first 8 hex chars of sha256(path)>`.
 * Verified against claude-code 2.1.109 — see beorn's notes on the profile
 * isolation mechanism.
 */
export function keychainSlot(configDir: string): string {
  const hash = createHash("sha256").update(configDir).digest("hex").slice(0, 8)
  return `Claude Code-credentials-${hash}`
}

/** Check whether a profile has been logged into (has an entry in its Keychain slot). */
export function isLoggedIn(configDir: string): boolean {
  const slot = keychainSlot(configDir)
  const user = userInfo().username
  const res = spawnSync("security", ["find-generic-password", "-s", slot, "-a", user], {
    stdio: ["ignore", "ignore", "ignore"],
  })
  return res.status === 0
}

/** Read the credential JSON for a profile directly from its Keychain slot. */
export function readKeychainForProfile(configDir: string): Credential | undefined {
  const slot = keychainSlot(configDir)
  const user = userInfo().username
  const res = spawnSync("security", ["find-generic-password", "-s", slot, "-a", user, "-w"], {
    stdio: ["ignore", "pipe", "ignore"],
  })
  if (res.status !== 0) return undefined
  const raw = res.stdout.toString("utf-8").trim()
  try {
    return JSON.parse(raw) as Credential
  } catch {
    return undefined
  }
}

/**
 * Write a credential JSON back to a profile's Keychain slot.
 *
 * SECURITY NOTE — argv exposure:
 *
 * We pass the credential JSON via the `-w <value>` argv form, which is
 * briefly visible to same-user processes via `ps auxww`. The macOS security(1)
 * man page flags this as insecure and documents `-w` (no value, last arg) as
 * the secure stdin-prompt alternative. We CANNOT use that alternative: the
 * stdin prompt is read through a TTY line buffer with a hard limit of 128
 * bytes, which silently truncates OAuth credential JSON blobs (~450 bytes)
 * and corrupts the stored credential.
 *
 * Mitigations:
 *   - The exposure window is ~10–50ms (one spawn cycle).
 *   - Claude Code's own binary uses the same argv form for its Keychain
 *     writes, so accountly isn't introducing new exposure — it matches the
 *     baseline threat model of the environment.
 *   - Cross-user ps is not a concern (macOS hides process argv across users
 *     without elevated privileges).
 *
 * A durable fix would require an FFI binding to Security.framework (e.g.
 * @napi-rs/keyring) to bypass the `security` CLI entirely. Deferred until
 * someone wants the extra dependency.
 */
export function writeKeychainForProfile(configDir: string, credential: Credential): void {
  const slot = keychainSlot(configDir)
  const user = userInfo().username
  writeKeychainArgv(slot, user, JSON.stringify(credential))
}

/** Internal helper: delete + re-add via argv `-w`. See security note above. */
function writeKeychainArgv(slot: string, user: string, password: string): void {
  // Remove any existing entry first so add-generic-password doesn't conflict.
  spawnSync("security", ["delete-generic-password", "-s", slot, "-a", user], {
    stdio: ["ignore", "ignore", "ignore"],
  })
  spawnSync("security", ["add-generic-password", "-s", slot, "-a", user, "-w", password], {
    stdio: ["ignore", "ignore", "ignore"],
  })
}

export interface ProfileQuotaResult {
  profile: ProfileInfo
  quota?: QuotaInfo
  error?: string
}

/** Check the Claude OAuth quota for one profile, refreshing the Keychain token if expired. */
export async function checkProfileQuota(profile: ProfileInfo): Promise<ProfileQuotaResult> {
  let credential = readKeychainForProfile(profile.dir)
  if (!credential) {
    return { profile, error: "no credential in Keychain (run /login)" }
  }
  const fresh = await ensureFreshOAuth(credential, (updated) => {
    writeKeychainForProfile(profile.dir, updated)
  })
  if (fresh) credential = fresh
  const provider = getProvider("claude-oauth")
  const quota = await provider.checkQuota(credential)
  const plan = extractPlan(credential)
  if (plan) profile.plan = plan
  quota.accountName = profile.name
  return { profile, quota }
}

// ── doctor: profile health check ─────────────────────────────────────────

export interface HealthCheck {
  profile: string
  level: "ok" | "warn" | "error"
  issue: string
  fix?: string
}

/**
 * Health-check a single profile. Returns a list of findings (empty = all good).
 * Designed to produce actionable messages for `accountly claude-profile doctor`.
 */
export async function diagnoseProfile(profile: ProfileInfo): Promise<HealthCheck[]> {
  const findings: HealthCheck[] = []

  if (!existsSync(profile.dir)) {
    findings.push({
      profile: profile.name,
      level: "error",
      issue: `profile dir missing: ${profile.dir}`,
      fix: `accountly claude-profile new ${profile.name}`,
    })
    return findings
  }

  if (!profile.authenticated) {
    findings.push({
      profile: profile.name,
      level: "error",
      issue: "no credential in Keychain",
      fix: `accountly claude --user ${profile.name}  # then /login inside claude`,
    })
    return findings
  }

  const missingLinks: string[] = []
  const brokenLinks: string[] = []
  for (const { item, dst } of shareableEntries(profile.dir)) {
    try {
      const s = lstatSync(dst)
      if (!s.isSymbolicLink()) {
        missingLinks.push(item)
        continue
      }
      // Symlink present — verify it points somewhere that still exists.
      if (!existsSync(dst)) brokenLinks.push(item)
    } catch {
      missingLinks.push(item)
    }
  }
  if (missingLinks.length > 0) {
    findings.push({
      profile: profile.name,
      level: "warn",
      issue: `missing shared-state symlinks: ${missingLinks.join(", ")}`,
      fix: `accountly claude-profile new ${profile.name}  # idempotent — backfills symlinks`,
    })
  }
  if (brokenLinks.length > 0) {
    findings.push({
      profile: profile.name,
      level: "warn",
      issue: `broken shared-state symlinks: ${brokenLinks.join(", ")}`,
      fix: `check ~/.claude/ for the missing targets`,
    })
  }

  // Check credential structure + expiry.
  const credential = readKeychainForProfile(profile.dir)
  if (!credential) {
    findings.push({
      profile: profile.name,
      level: "error",
      issue: "Keychain slot exists but credential failed to read",
      fix: `accountly claude --user ${profile.name}  # then /login`,
    })
    return findings
  }
  const oauth = credential.claudeAiOauth as Record<string, unknown> | undefined
  if (!oauth) {
    findings.push({
      profile: profile.name,
      level: "error",
      issue: "credential missing claudeAiOauth block",
      fix: `accountly claude --user ${profile.name}  # then /login`,
    })
    return findings
  }
  const accessToken = oauth.accessToken as string | undefined
  const refreshToken = oauth.refreshToken as string | undefined
  const expiresAt = oauth.expiresAt as number | undefined
  if (!accessToken || !refreshToken) {
    findings.push({
      profile: profile.name,
      level: "error",
      issue: "credential missing accessToken or refreshToken",
      fix: `accountly claude --user ${profile.name}  # then /login`,
    })
    return findings
  }
  // Live check: does the stored token actually authenticate against Anthropic?
  // This refreshes the token if needed and catches the rate-limit-rotation bug
  // where the refresh token was consumed server-side but a refresh failure left
  // a stale credential on disk. It's the authoritative health signal; don't
  // emit expiry warnings when this passes (the refresh is a no-op from the
  // user's perspective).
  const email = await fetchProfileEmail(profile).catch(() => undefined)
  if (!email) {
    // Include staleness in the error message only when the refresh actually failed.
    const stalenessNote =
      typeof expiresAt === "number"
        ? ` (token expired ${Math.round((Date.now() - expiresAt) / 1000)}s ago, refresh failed)`
        : ""
    findings.push({
      profile: profile.name,
      level: "error",
      issue: `Anthropic rejected the stored credential${stalenessNote}`,
      fix: `accountly claude --user ${profile.name}  # then /login to mint a new refresh token`,
    })
  } else if (email !== profile.name) {
    findings.push({
      profile: profile.name,
      level: "warn",
      issue: `profile name does not match account email (${email})`,
      fix: `accountly claude-profile rename ${profile.name} ${email}`,
    })
  }

  return findings
}

/** Run diagnoseProfile against every profile; serialize to avoid rate limiting. */
export async function diagnoseAllProfiles(): Promise<HealthCheck[]> {
  const profiles = listProfiles()
  const all: HealthCheck[] = []
  for (const p of profiles) {
    const findings = await diagnoseProfile(p)
    all.push(...findings)
  }
  return all
}

/**
 * Check quotas for all profiles.
 *
 * Refreshes are **serialized** with a small stagger (250ms between profiles
 * that actually need to refresh). Reason: Anthropic's token refresh endpoint
 * rate-limits at the IP level — firing N parallel refreshes gets some of them
 * 429'd, but the refresh token is rotated server-side *before* the 429 response
 * reaches the client. The client then falls back to the stale credential and
 * the subsequent usage call 401s, permanently desyncing the profile's stored
 * credential from what Anthropic expects.
 *
 * Serialization is cheap (3 profiles × ~600ms ≈ 2s worst case) and eliminates
 * the rate-limit race entirely. Profiles that don't need a refresh (access
 * token still valid) pay zero serialization cost because `ensureFreshOAuth`
 * short-circuits before making a network call.
 */
export async function checkAllProfileQuotas(): Promise<ProfileQuotaResult[]> {
  const profiles = listProfiles()
  const results: ProfileQuotaResult[] = []
  let priorProfileNeededRefresh = false
  for (const profile of profiles) {
    if (priorProfileNeededRefresh) {
      await new Promise((r) => setTimeout(r, 250))
    }
    const credBefore = readKeychainForProfile(profile.dir)
    const expBefore = (credBefore?.claudeAiOauth as Record<string, unknown> | undefined)?.expiresAt as
      | number
      | undefined
    const willRefresh = typeof expBefore === "number" && Date.now() + 5 * 60 * 1000 >= expBefore
    results.push(await checkProfileQuota(profile))
    priorProfileNeededRefresh = willRefresh
  }
  return results
}

// ── stock / legacy-default ~/.claude support ─────────────────────────────
//
// Running stock `claude` with no env vars hits the original ~/.claude dir
// and its unhashed `Claude Code-credentials` Keychain slot. That's a real
// account — accountly surfaces it as a pseudo-profile named "~/.claude" so
// users can see its quota and know which account stock claude is using.

/** The legacy unhashed Keychain service name used by stock claude. */
export const LEGACY_KEYCHAIN_SLOT = "Claude Code-credentials"

/** Read the credential JSON from the legacy default Keychain slot. */
export function readLegacyKeychain(): Credential | undefined {
  const user = userInfo().username
  const res = spawnSync("security", ["find-generic-password", "-s", LEGACY_KEYCHAIN_SLOT, "-a", user, "-w"], {
    stdio: ["ignore", "pipe", "ignore"],
  })
  if (res.status !== 0) return undefined
  const raw = res.stdout.toString("utf-8").trim()
  try {
    return JSON.parse(raw) as Credential
  } catch {
    return undefined
  }
}

/** Write a credential back to the legacy default Keychain slot (used for refresh). */
export function writeLegacyKeychain(credential: Credential): void {
  const user = userInfo().username
  writeKeychainArgv(LEGACY_KEYCHAIN_SLOT, user, JSON.stringify(credential))
}

/** Synthetic ProfileInfo for the legacy ~/.claude slot, if authenticated. */
export function getLegacyDefaultProfile(): ProfileInfo | undefined {
  const cred = readLegacyKeychain()
  if (!cred) return undefined
  return {
    name: "~/.claude",
    dir: join(homedir(), ".claude"),
    authenticated: true,
    slot: LEGACY_KEYCHAIN_SLOT,
  }
}

export interface AdoptResult {
  status: "ok" | "error"
  message?: string
  email?: string
  dir?: string
  slot?: string
  clearedStock?: boolean
}

/**
 * Adopt the stock ~/.claude Keychain slot as a named profile.
 *
 * Flow:
 *   1. Read stock Keychain slot. Error if empty.
 *   2. Fetch account email via Anthropic's OAuth profile endpoint.
 *   3. Create (or refresh) a profile dir at profileRoot/<email>/.
 *   4. Copy the credential into the profile's own Keychain slot.
 *   5. Optionally clear the stock slot (default: yes).
 *
 * Idempotent: if the profile already exists and is authenticated, this just
 * overwrites its Keychain slot with the current stock credential. If the
 * stock slot is empty or the email fetch fails, returns an error result
 * instead of throwing (so the CLI caller can print a clean error).
 */
export async function adoptStockProfile(opts: { clearStock?: boolean } = {}): Promise<AdoptResult> {
  const credential = readLegacyKeychain()
  if (!credential) {
    return { status: "error", message: "stock ~/.claude Keychain slot is empty — run `claude /login` first" }
  }
  // Refresh the stock token if needed so the email fetch has a live token.
  const fresh = await ensureFreshOAuth(credential, (updated) => writeLegacyKeychain(updated))
  const live = fresh ?? credential
  const claudeInfo = await fetchClaudeProfile(live).catch(() => undefined)
  if (!claudeInfo?.email) {
    return {
      status: "error",
      message: "could not fetch account email from stock credential (token may be stale)",
    }
  }
  const email = claudeInfo.email
  try {
    assertSafeProfileName(email)
  } catch (err) {
    return { status: "error", message: `unsafe email for profile name: ${(err as Error).message}` }
  }
  // Bootstrap the profile dir (creates symlinks if fresh, backfills if existing).
  const { dir } = bootstrapProfile(email)
  // Write the credential into the profile's own Keychain slot.
  writeKeychainForProfile(dir, live)
  const slot = keychainSlot(dir)
  const clearStock = opts.clearStock ?? true
  if (clearStock) {
    const user = userInfo().username
    spawnSync("security", ["delete-generic-password", "-s", LEGACY_KEYCHAIN_SLOT, "-a", user], {
      stdio: ["ignore", "ignore", "ignore"],
    })
  }
  return { status: "ok", email, dir, slot, clearedStock: clearStock }
}

/** Quota check for the legacy ~/.claude slot. Also fetches the account email
 * and annotates the profile name so users can see which account stock claude
 * is currently billing against. */
export async function checkLegacyDefaultQuota(): Promise<ProfileQuotaResult | undefined> {
  const info = getLegacyDefaultProfile()
  if (!info) return undefined
  let credential = readLegacyKeychain()
  if (!credential) return { profile: info, error: "no credential" }
  const fresh = await ensureFreshOAuth(credential, (updated) => {
    writeLegacyKeychain(updated)
  })
  if (fresh) credential = fresh
  const provider = getProvider("claude-oauth")
  // Fetch account email + quota in parallel so stock claude's identity is visible.
  const [claudeInfo, quota] = await Promise.all([
    fetchClaudeProfile(credential).catch(() => undefined),
    provider.checkQuota(credential),
  ])
  if (claudeInfo?.email) {
    info.email = claudeInfo.email
  }
  const plan = extractPlan(credential)
  if (plan) {
    info.plan = plan
  }
  quota.accountName = info.name
  return { profile: info, quota }
}

/** Fetch the Claude account email for a logged-in profile (via OAuth profile endpoint). */
export async function fetchProfileEmail(profile: ProfileInfo): Promise<string | undefined> {
  const credential = readKeychainForProfile(profile.dir)
  if (!credential) return undefined
  const info = await fetchClaudeProfile(credential, (updated) => {
    writeKeychainForProfile(profile.dir, updated)
  })
  return info?.email
}

export interface MigrationStep {
  from: string
  to: string
  email?: string
  action: "renamed" | "skipped" | "error"
  reason?: string
}

/**
 * Rename a profile dir and rewrite its Keychain slot so the credential stays
 * accessible under the new sha256-derived slot name. Idempotent if already
 * renamed. Symlinks inside the profile use absolute paths, so they survive
 * the rename untouched.
 */
export function renameProfile(oldName: string, newName: string): MigrationStep {
  const oldDir = profileDir(oldName)
  const newDir = profileDir(newName)
  if (oldName === newName) {
    return { from: oldName, to: newName, action: "skipped", reason: "already correct" }
  }
  if (!existsSync(oldDir)) {
    return { from: oldName, to: newName, action: "error", reason: `source dir missing: ${oldDir}` }
  }
  if (existsSync(newDir)) {
    return { from: oldName, to: newName, action: "error", reason: `target dir already exists: ${newDir}` }
  }
  const credential = readKeychainForProfile(oldDir)
  if (!credential) {
    return { from: oldName, to: newName, action: "error", reason: `no Keychain credential for old slot` }
  }
  try {
    renameSync(oldDir, newDir)
  } catch (err) {
    return { from: oldName, to: newName, action: "error", reason: `rename failed: ${(err as Error).message}` }
  }
  // Write credential to new hashed slot, then drop the old slot.
  try {
    writeKeychainForProfile(newDir, credential)
  } catch (err) {
    // Roll back the directory rename so we don't leave a dir without a keychain slot.
    try {
      renameSync(newDir, oldDir)
    } catch {
      /* can't roll back — report original failure */
    }
    return {
      from: oldName,
      to: newName,
      action: "error",
      reason: `new keychain write failed: ${(err as Error).message}`,
    }
  }
  const oldSlot = keychainSlot(oldDir)
  const user = userInfo().username
  spawnSync("security", ["delete-generic-password", "-s", oldSlot, "-a", user], {
    stdio: ["ignore", "ignore", "ignore"],
  })
  return { from: oldName, to: newName, action: "renamed" }
}

/** Pick the profile with the lowest max utilization across windows. */
export function findBestProfile(results: ProfileQuotaResult[]): ProfileInfo | undefined {
  const usable = results.filter((r) => r.quota?.available && !r.quota.error && r.quota.windows.length > 0)
  if (usable.length === 0) return undefined
  const scored = usable.map((r) => ({
    profile: r.profile,
    maxUtil: Math.max(...r.quota!.windows.map((w) => w.utilization)),
  }))
  scored.sort((a, b) => a.maxUtil - b.maxUtil)
  return scored[0]!.profile
}

/** List all profiles under `profileRoot()`, with auth status. Skips the `default` pointer symlink. */
export function listProfiles(): ProfileInfo[] {
  const root = profileRoot()
  if (!existsSync(root)) return []
  const entries = readdirSync(root, { withFileTypes: true })
  const profiles: ProfileInfo[] = []
  for (const e of entries) {
    if (e.name === DEFAULT_LINK_NAME) continue // skip the default pointer
    // Accept real directories only — skip symlinks (even if they point to a dir)
    // so a stray symlink in profileRoot doesn't masquerade as a profile.
    if (!e.isDirectory() || e.isSymbolicLink()) continue
    const dir = profileDir(e.name)
    profiles.push({
      name: e.name,
      dir,
      authenticated: isLoggedIn(dir),
      slot: keychainSlot(dir),
    })
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Create or refresh a profile dir: symlink every non-denylisted item from
 * ~/.claude/ into the profile dir. Idempotent — safe to call on existing
 * profiles to backfill any entries Claude Code created in ~/.claude/ since
 * the profile was last bootstrapped.
 *
 * Never clobbers existing files or non-empty dirs; only replaces empty dirs
 * with symlinks (Claude Code may create one before the symlink is added).
 */
export function bootstrapProfile(name: string): { dir: string; fresh: boolean; linked: string[] } {
  const dir = profileDir(name)
  const fresh = !existsSync(dir)
  if (fresh) mkdirSync(dir, { recursive: true })

  const linked: string[] = []
  for (const { item, src, dst } of shareableEntries(dir)) {
    try {
      const s = lstatSync(dst)
      if (s.isSymbolicLink()) continue
      if (s.isDirectory()) {
        const contents = readdirSync(dst)
        if (contents.length === 0) {
          rmdirSync(dst)
        } else {
          continue
        }
      } else {
        continue
      }
    } catch {
      // dst does not exist — fall through and create the symlink
    }

    try {
      symlinkSync(src, dst)
      linked.push(item)
    } catch {
      // best-effort; ignore race conditions
    }
  }

  return { dir, fresh, linked }
}

/**
 * Deterministic emoji pick for a profile. Same name → same emoji across runs.
 * Used to visually distinguish cmux workspaces at a glance.
 */
export function profileEmoji(name: string): string {
  const pool = ["🦊", "🐻", "🐼", "🦁", "🐯", "🐸", "🐙", "🦄", "🐞", "🦋", "🐢", "🦉", "🐺", "🐨", "🐰", "🦇"]
  const h = parseInt(createHash("sha256").update(name).digest("hex").slice(0, 4), 16)
  return pool[h % pool.length]!
}

/** Deterministic sidebar color pick for a profile (hex). */
export function profileColor(name: string): string {
  const pool = [
    "#E57373",
    "#F06292",
    "#BA68C8",
    "#9575CD",
    "#7986CB",
    "#64B5F6",
    "#4FC3F7",
    "#4DD0E1",
    "#4DB6AC",
    "#81C784",
    "#AED581",
    "#DCE775",
    "#FFD54F",
    "#FFB74D",
    "#FF8A65",
    "#A1887F",
  ]
  const h = parseInt(createHash("sha256").update(name).digest("hex").slice(4, 8), 16)
  return pool[h % pool.length]!
}

/**
 * Run `claude` in-place pinned to a profile. Does not return — spawns claude
 * with the profile's CLAUDE_CONFIG_DIR and waits for it to exit, then exits
 * with the same code.
 */
export function runProfile(name: string, claudeArgs: string[] = []): never {
  if (!name || name === "undefined" || name === "null") {
    process.stderr.write(
      `accountly: refusing to bootstrap profile named "${name}" — check $CLAUDE_PROFILE or --user arg\n`,
    )
    process.exit(2)
  }
  name = resolveProfileName(name)
  const { dir, fresh, linked } = bootstrapProfile(name)
  if (fresh) {
    process.stderr.write(`accountly: bootstrapped profile "${name}" at ${dir}\n`)
    process.stderr.write(`accountly: run /login inside claude to authenticate this profile\n`)
  } else if (linked.length > 0) {
    process.stderr.write(`accountly: backfilled ${linked.length} missing symlink(s): ${linked.join(", ")}\n`)
  }
  process.stderr.write(`accountly: profile=${name}  dir=${dir}  action=exec-claude\n`)
  const env = { ...process.env, CLAUDE_CONFIG_DIR: dir, CLAUDE_PROFILE: name }
  const res = spawnSync("claude", claudeArgs, { stdio: "inherit", env })
  process.exit(res.status ?? 1)
}

/**
 * Spawn a new cmux workspace pinned to the profile. Tags the workspace with
 * `claude_profile=<name>`, renames it with an emoji prefix, and sets a
 * deterministic color so the sidebar is visually distinct.
 */
export function cmuxSpawn(name: string, claudeArgs: string[] = []): never {
  if (!name || name === "undefined" || name === "null") {
    process.stderr.write(
      `accountly: refusing to spawn cmux profile named "${name}" — check $CLAUDE_PROFILE or --user arg\n`,
    )
    process.exit(2)
  }
  name = resolveProfileName(name)
  const { dir, fresh, linked } = bootstrapProfile(name)
  if (fresh) {
    process.stderr.write(`accountly: bootstrapped profile "${name}" at ${dir}\n`)
  } else if (linked.length > 0) {
    process.stderr.write(`accountly: backfilled ${linked.length} missing symlink(s): ${linked.join(", ")}\n`)
  }

  const emoji = profileEmoji(name)
  const color = profileColor(name)
  const title = `${emoji} ${name}`

  // Single-quote a string for POSIX sh safely.
  const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`

  // Build the shell command string that will run in the new workspace's first
  // pane. $CMUX_WORKSPACE_ID is auto-set in that shell so rename/set-status
  // scope to the new workspace implicitly.
  const setup =
    `cmux workspace-action rename --title ${sq(title)} >/dev/null 2>&1 || true; ` +
    `cmux set-status claude_profile ${sq(name)} --color ${sq(color)} >/dev/null 2>&1 || true`
  const extra = claudeArgs.map(sq).join(" ")
  const inner = `${setup}; exec accountly claude --user ${sq(name)}${extra ? " " + extra : ""}`

  process.stderr.write(
    `accountly: profile=${name}  dir=${dir}  action=cmux-new-workspace  title="${title}"  color=${color}\n`,
  )

  const res = spawnSync("cmux", ["new-workspace", "--cwd", process.cwd(), "--command", inner], {
    stdio: "inherit",
  })
  process.exit(res.status ?? 1)
}

/**
 * Return a shell hook that, when sourced at shell startup, exports
 * CLAUDE_CONFIG_DIR based on (in priority order):
 *   1. Existing CLAUDE_CONFIG_DIR — respect explicit user choice.
 *   2. The current cmux workspace's `claude_profile` tag (if any).
 *   3. The `defaultProfile` passed to this function (if any).
 *
 * Intended use in ~/.config/zsh/zshrc:
 *
 *   eval "$(claude-as init zsh delei)"   # default profile = delei
 *   # — or —
 *   eval "$(claude-as init zsh)"         # no default; plain `claude` = ~/.claude
 *
 * After that, any new shell inherits the right profile automatically —
 * sibling cmux panes inherit from the workspace tag, and everything else
 * (plain terminals, new sessions) falls back to the default profile.
 */
/**
 * Single-quote a string for POSIX sh. Bulletproof: single-quoted strings in
 * sh don't interpolate anything. The only escape is `'\''` to embed a literal
 * quote. Use this instead of JSON.stringify when emitting shell code, since
 * JSON.stringify doesn't escape `$`, backticks, or `!` which remain active
 * inside double-quoted shell strings.
 */
function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

export function initShell(shell: string, defaultProfile?: string): string {
  if (shell !== "zsh" && shell !== "bash") {
    throw new Error(`accountly: unknown shell "${shell}" (try zsh or bash)`)
  }
  // Fall back to the `default` symlink if no explicit profile was passed.
  // Both inputs flow through assertSafeProfileName (via profileDir / getDefaultProfile)
  // so they can only be [A-Za-z0-9._+@-] — but we sh-quote anyway as defense in depth
  // since defaultDir also includes the home directory prefix which could, in theory,
  // contain shell-special characters on exotic setups.
  const effective = defaultProfile ?? getDefaultProfile()
  if (effective) assertSafeProfileName(effective)
  const defaultDir = effective ? profileDir(effective) : ""
  const defaultBlock = effective
    ? `  if [[ -z "$CLAUDE_CONFIG_DIR" && -d ${shSingleQuote(defaultDir)} ]]; then
    export CLAUDE_CONFIG_DIR=${shSingleQuote(defaultDir)}
    export CLAUDE_PROFILE=${shSingleQuote(effective)}
  fi`
    : ""
  return `# accountly shell integration — added via: eval "\$(accountly claude-profile init)"
# shell: ${shell}   default profile (resolved at install time): ${effective ?? "(none)"}
__accountly_sync() {
  # 1. Cmux workspace tag wins (set by \`accountly claude --user <name> --cmux\`).
  if [[ -n "$CMUX_WORKSPACE_ID" && -z "$CLAUDE_CONFIG_DIR" ]] && command -v cmux >/dev/null 2>&1; then
    local _prof
    _prof=$(cmux list-status 2>/dev/null | awk -F'=' '/^claude_profile=/{print $2}' | awk '{print $1}')
    if [[ -n "$_prof" && -d "$HOME/.config/claude-profiles/$_prof" ]]; then
      export CLAUDE_CONFIG_DIR="$HOME/.config/claude-profiles/$_prof"
      export CLAUDE_PROFILE="$_prof"
      return 0
    fi
  fi
  # 2. Default profile fallback (from \`init zsh <default>\`).
${defaultBlock}
}
__accountly_sync
`
}
