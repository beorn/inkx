/**
 * Workspace — mounted-repo registry for federation Phase A.
 *
 * See hub/km/storage-architecture.md §5.2.
 *
 *   A workspace is a set of mounted repos, each bound to an alias. Aliases
 *   are what `km:/<alias>/<path>` URIs resolve against. Mounts are declared
 *   in `~/.km/workspace.toml` (or the path pointed to by `KM_WORKSPACE`).
 *
 * Phase A scope:
 *   - Load workspace.toml from disk (missing file → empty workspace).
 *   - Resolve aliases and `km:/<alias>/<rest>` URIs.
 *   - Lazy RepoId discovery: we don't touch the mount's `.km/` on load; only
 *     when something asks for the repo's ID. Keeps load cheap + side-effect
 *     free; the integration bead wires live Repo handles into the workspace.
 *
 * Out of scope (deferred):
 *   - Spinning up FsMount / Repo / Sync instances per mount.
 *   - Aggregated cross-repo queries.
 *   - Workspace write-back (adding/removing mounts from disk).
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

import type { RepoId } from "@km/core"
import { createLogger } from "loggily"

import { parseKmUri } from "./km-uri.ts"
import { readOrMintRepoId } from "./repo-id.ts"

const log = createLogger("km:storage:federation:workspace")

/**
 * The workspace file basename inside `~/.km/`.
 */
export const WORKSPACE_TOML_NAME = "workspace.toml"

/**
 * A single mounted repo as declared in `workspace.toml`.
 *
 * `repoId` is `undefined` on load and gets lazily populated on first call to
 * `WorkspaceMount.repoId()`. We deliberately avoid eager discovery because:
 *   (a) a mount might be behind a slow network volume;
 *   (b) the bead explicitly defers Repo lifecycle integration.
 */
export interface WorkspaceMount {
  alias: string
  path: string
  /** Lazy-discovered RepoId. Reads / mints `.km/config.toml` inside the mount. */
  repoId(): RepoId
}

export interface WorkspaceUriResolution {
  mount: WorkspaceMount
  relPath: string
  fragment: string | null
}

export interface Workspace {
  mounts: readonly WorkspaceMount[]
  resolveAlias(alias: string): WorkspaceMount | null
  resolveKmUri(uri: string): WorkspaceUriResolution | null
}

export interface LoadWorkspaceOptions {
  /**
   * Override the full path to `workspace.toml`. Takes precedence over the
   * `KM_WORKSPACE` env var. Intended for tests + programmatic composition.
   */
  workspacePath?: string
  /**
   * Override the home directory lookup. Defaults to `os.homedir()`.
   * Ignored when `workspacePath` is set.
   */
  home?: string
}

/**
 * Resolve the path to `workspace.toml` using the same precedence model as
 * `session-db`:
 *   1. Explicit `workspacePath` option
 *   2. `KM_WORKSPACE` env var
 *   3. `<home>/.km/workspace.toml`
 */
export function resolveWorkspaceTomlPath(opts: LoadWorkspaceOptions = {}): string {
  if (opts.workspacePath) return opts.workspacePath
  const envOverride = process.env.KM_WORKSPACE
  if (envOverride && envOverride.length > 0) return envOverride
  const home = opts.home ?? homedir()
  return join(home, ".km", WORKSPACE_TOML_NAME)
}

/**
 * Factory — loads + returns a Workspace. Never throws on missing or malformed
 * files: a missing `workspace.toml` yields an empty workspace (km defaults to
 * single-repo-at-a-time); a malformed file logs + yields an empty workspace.
 *
 * Aliases are case-sensitive and must be non-empty. Duplicate aliases keep
 * the first mount and log a warning about the later one. Mounts with a
 * blank path are skipped.
 */
export function loadWorkspace(opts: LoadWorkspaceOptions = {}): Workspace {
  const tomlPath = resolveWorkspaceTomlPath(opts)
  const mounts = readMountsFromToml(tomlPath)
  return buildWorkspace(mounts)
}

/**
 * Build a Workspace from a pre-parsed mount list. Kept separate so tests +
 * callers can compose a workspace in-memory without touching the filesystem.
 */
export function buildWorkspace(mounts: readonly WorkspaceMount[]): Workspace {
  const byAlias = new Map<string, WorkspaceMount>()
  const kept: WorkspaceMount[] = []
  for (const mount of mounts) {
    if (byAlias.has(mount.alias)) {
      log.warn?.(`workspace: duplicate alias "${mount.alias}" at ${mount.path} — keeping first mount`)
      continue
    }
    byAlias.set(mount.alias, mount)
    kept.push(mount)
  }
  const frozen = Object.freeze(kept)

  return {
    mounts: frozen,
    resolveAlias(alias: string): WorkspaceMount | null {
      return byAlias.get(alias) ?? null
    },
    resolveKmUri(uri: string): WorkspaceUriResolution | null {
      const parsed = parseKmUri(uri)
      if (parsed?.kind !== "km-uri") return null
      const mount = byAlias.get(parsed.alias)
      if (!mount) return null
      return { mount, relPath: parsed.relPath, fragment: parsed.fragment }
    },
  }
}

/**
 * Low-level helper — read `workspace.toml`, extract + normalize the mount
 * list. Returns empty on missing/malformed files. Exported so that diagnostic
 * tools can introspect what the workspace parser saw.
 */
export function readMountsFromToml(tomlPath: string): WorkspaceMount[] {
  if (!existsSync(tomlPath)) return []

  let raw: string
  try {
    raw = readFileSync(tomlPath, "utf-8")
  } catch (err) {
    log.warn?.(`workspace: unable to read ${tomlPath}: ${String(err)}`)
    return []
  }

  let parsed: unknown
  try {
    parsed = Bun.TOML.parse(raw)
  } catch (err) {
    log.warn?.(`workspace: malformed TOML at ${tomlPath}: ${String(err)} — ignoring file.`)
    return []
  }

  if (!parsed || typeof parsed !== "object") return []

  // The bead spec accepts either `[[mount]]` (array of tables) or
  // `[mounts.<alias>]` (nested table). We support both to match the two
  // forms that appear in storage-architecture.md §5.1 and §5.2.
  const mounts: WorkspaceMount[] = []
  const record = parsed as Record<string, unknown>

  const mountArray = record["mount"]
  if (Array.isArray(mountArray)) {
    for (const entry of mountArray) {
      const built = buildMountFromRecord(entry, null)
      if (built) mounts.push(built)
    }
  }

  const mountsTable = record["mounts"]
  if (mountsTable && typeof mountsTable === "object" && !Array.isArray(mountsTable)) {
    for (const [alias, entry] of Object.entries(mountsTable as Record<string, unknown>)) {
      const built = buildMountFromRecord(entry, alias)
      if (built) mounts.push(built)
    }
  }

  return mounts
}

function buildMountFromRecord(entry: unknown, fallbackAlias: string | null): WorkspaceMount | null {
  if (!entry || typeof entry !== "object") return null
  const rec = entry as Record<string, unknown>

  const aliasCandidate = typeof rec["alias"] === "string" ? (rec["alias"] as string) : fallbackAlias
  const pathCandidate = typeof rec["path"] === "string" ? (rec["path"] as string) : null

  if (!aliasCandidate || aliasCandidate.length === 0) {
    log.warn?.(`workspace: mount entry missing \`alias\` — skipping`)
    return null
  }
  if (!pathCandidate || pathCandidate.length === 0) {
    log.warn?.(`workspace: mount "${aliasCandidate}" missing \`path\` — skipping`)
    return null
  }

  const alias = aliasCandidate
  const path = expandHome(pathCandidate)

  // Lazy RepoId read.
  let cachedRepoId: RepoId | undefined
  const repoId = (): RepoId => {
    if (cachedRepoId !== undefined) return cachedRepoId
    const kmDir = join(path, ".km")
    cachedRepoId = readOrMintRepoId(kmDir)
    return cachedRepoId
  }

  return { alias, path, repoId }
}

/**
 * Expand a leading `~` in a path. Leaves absolute or relative paths alone.
 * TOML authors conventionally write `~/...`; km respects it.
 */
function expandHome(p: string): string {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return p
}
