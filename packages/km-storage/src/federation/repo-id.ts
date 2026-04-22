/**
 * Per-repo RepoId — federation Phase A scaffolding.
 *
 * See hub/km/storage-architecture.md §5.1.
 *
 *   `.km/config.toml` per-repo carries a stable `repo_id` that survives clone.
 *   On first open we mint a ULID-shaped RepoId and persist it. Subsequent
 *   opens round-trip the same value — RepoIds are join keys for the user-
 *   local session DB (`~/.km/session.db`, §5.3) and cross-repo URL resolution.
 *
 * TOML choice:
 *   - `.km/config.yaml` (cosmiconfig) already owns km's user-facing
 *     configuration; it reads via `yaml`.
 *   - Federation metadata is separate per §5.1 — different concern, different
 *     file format per design doc. We parse via Bun's built-in `Bun.TOML.parse`
 *     (zero-dep) and write flat `key = "value"` pairs by hand since
 *     `Bun.TOML` has no `stringify`. The current schema is trivially flat.
 *
 * Design rules (docs/principles.md):
 *   - Factory functions only — no classes, no module-level state.
 *   - Never throws on malformed TOML — logs and treats as "mint fresh".
 *   - Idempotent — reading a well-formed config.toml never rewrites it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { asRepoId, type RepoId } from "@km/core"
import { createLogger } from "loggily"
import { ulid } from "ulid"

const log = createLogger("km:storage:federation:repo-id")

/**
 * The basename inside a repo's `.km/` directory that holds federation metadata.
 * Separate from `.km/config.yaml` (user-facing km config) per §5.1.
 */
export const CONFIG_TOML_NAME = "config.toml"

export interface RepoConfigToml {
  /** Stable per-clone RepoId. ULID-shaped in Phase A. */
  repo_id: RepoId
}

/**
 * Mint a fresh RepoId. ULID-shaped (26 chars, Crockford base32).
 *
 * Exposed so callers can mint a RepoId for an in-memory repo without touching
 * the filesystem. Persisted callers should use `readOrMintRepoId`.
 */
export function mintRepoId(): RepoId {
  return asRepoId(ulid())
}

/**
 * Read the `repo_id` from `<kmDir>/config.toml`, or mint one and write it
 * back. Idempotent: a second call on the same dir yields the same RepoId.
 *
 * @param kmDir Absolute path to the repo's `.km/` directory. The directory
 *              must exist or be creatable (we `mkdir -p` it).
 *
 * Failure modes:
 *   - TOML syntax error → logged, fresh RepoId minted and written. We do not
 *     clobber the whole config file; we rewrite it with just the new
 *     `repo_id`, because a corrupt federation config means we've lost the
 *     repo's identity anyway. Non-federation keys in the same file would be
 *     lost, but Phase A reserves the file entirely.
 *   - Missing `repo_id` key → mint and merge it back in (preserves any other
 *     keys that happen to be present).
 *   - Non-string `repo_id` → mint fresh, log, overwrite.
 */
export function readOrMintRepoId(kmDir: string): RepoId {
  const tomlPath = join(kmDir, CONFIG_TOML_NAME)

  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true })
  }

  if (existsSync(tomlPath)) {
    try {
      const raw = readFileSync(tomlPath, "utf-8")
      const parsed = Bun.TOML.parse(raw) as Record<string, unknown>
      const existing = parsed["repo_id"]
      if (typeof existing === "string" && existing.length > 0) {
        return asRepoId(existing)
      }
      log.warn?.(`${tomlPath}: missing or invalid \`repo_id\` (got ${typeof existing}); minting fresh and persisting.`)
      const minted = mintRepoId()
      writeRepoConfigToml(tomlPath, { ...parsed, repo_id: minted })
      return minted
    } catch (err) {
      log.warn?.(`${tomlPath}: malformed TOML (${String(err)}); minting fresh RepoId and overwriting.`)
      const minted = mintRepoId()
      writeRepoConfigToml(tomlPath, { repo_id: minted })
      return minted
    }
  }

  const minted = mintRepoId()
  writeRepoConfigToml(tomlPath, { repo_id: minted })
  return minted
}

/**
 * Write a flat TOML file. Every value becomes `key = "value"` (strings only,
 * which is all Phase A needs). Unrecognized value types are stringified.
 *
 * Exported for tests; production callers should prefer `readOrMintRepoId`.
 */
export function writeRepoConfigToml(tomlPath: string, entries: Record<string, unknown>): void {
  const dir = dirname(tomlPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const lines: string[] = []
  lines.push("# km federation metadata — see hub/km/storage-architecture.md §5.1")
  lines.push("# Do not edit by hand; km manages this file.")
  lines.push("")
  for (const [key, value] of Object.entries(entries)) {
    if (value == null) continue
    lines.push(`${key} = ${quoteToml(String(value))}`)
  }
  // Trailing newline.
  writeFileSync(tomlPath, `${lines.join("\n")}\n`, "utf-8")
}

/**
 * Quote a TOML basic string. Escapes `\`, `"`, and control chars. Sufficient
 * for ULIDs, paths, and short identifiers — the only shapes we write.
 */
function quoteToml(s: string): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  return `"${escaped}"`
}
