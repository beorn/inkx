/**
 * Per-repo RepoId — federation Phase A scaffolding.
 *
 * See hub/km/storage-architecture.md §5.1.
 *
 *   `.km/config.yaml` per-repo carries a stable `repo.id` that survives clone.
 *   On first open we mint a ULID-shaped RepoId and persist it. Subsequent
 *   opens round-trip the same value — RepoIds are join keys for the user-
 *   local session DB (`~/.km/session.db`, §5.3) and cross-repo URL resolution.
 *
 * Storage:
 *   - Lives under the `repo:` block of `.km/config.yaml` — the single km
 *     config file. Previously stored in `.km/config.toml`; migration runs
 *     automatically on first read (see `readOrMintRepoId`).
 *   - Uses eemeli/yaml's Document API so existing user comments and
 *     formatting in `.km/config.yaml` survive the write.
 *
 * Design rules (docs/principles.md):
 *   - Factory functions only — no classes, no module-level state.
 *   - Never throws on malformed YAML — logs and treats as "mint fresh".
 *   - Idempotent — reading a well-formed config.yaml never rewrites it.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { asRepoId, type RepoId } from "@km/core"
import { createLogger } from "loggily"
import { ulid } from "ulid"
import { Document, Pair, parseDocument, Scalar, YAMLMap } from "yaml"

const log = createLogger("km:storage:federation:repo-id")

/**
 * The basename inside a repo's `.km/` directory that holds the single
 * combined km config (user-editable keys + machine-managed `repo.id`).
 */
export const CONFIG_YAML_NAME = "config.yaml"

/**
 * Legacy TOML filename. One-time migration target only — readers of
 * `.km/config.toml` exist solely to import pre-consolidation RepoIds
 * before the file is deleted. Do NOT introduce new callers.
 */
const LEGACY_CONFIG_TOML_NAME = "config.toml"

/**
 * Comment written above the `repo:` block on first mint / migration. Renders
 * once as a leading comment of the top-level `repo` key; yaml's Document
 * API preserves it across subsequent writes.
 */
const REPO_BLOCK_COMMENT = " km-managed — do not edit. Stable identity that survives clone."

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
 * Read `repo.id` from `<kmDir>/config.yaml`, mint one if missing, or migrate
 * from the legacy `<kmDir>/config.toml` file (then delete it).
 *
 * Idempotent: a second call on the same dir yields the same RepoId.
 *
 * Failure modes:
 *   - Malformed YAML → logged, fresh RepoId minted and written. We rewrite
 *     the file with a minimal `repo:` block; non-`repo` keys in the corrupt
 *     file are lost, because corrupt config means we can't trust any of it.
 *   - Missing `repo.id` key → mint and merge it into the existing yaml
 *     (preserves user comments + other keys via Document API).
 *   - Non-string `repo.id` → mint fresh, log, overwrite the key.
 *   - Legacy `.km/config.toml` present → parse it, extract `repo_id`, write
 *     into yaml, DELETE the TOML file. Logged at info. One-time; no
 *     permanent dual-read path.
 *
 * @param kmDir Absolute path to the repo's `.km/` directory. Created if
 *              missing.
 */
export function readOrMintRepoId(kmDir: string): RepoId {
  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true })
  }

  const yamlPath = join(kmDir, CONFIG_YAML_NAME)

  // Fast path: yaml exists and parses.
  if (existsSync(yamlPath)) {
    const existing = readRepoIdFromYaml(yamlPath)
    if (existing !== undefined) return existing
    // yaml exists but has no repo.id (or is malformed). Fall through to the
    // migration / mint paths which will merge or rewrite.
  }

  // Migration path: pre-consolidation vaults have the id in .km/config.toml.
  const tomlPath = join(kmDir, LEGACY_CONFIG_TOML_NAME)
  if (existsSync(tomlPath)) {
    const migrated = migrateRepoIdFromToml(tomlPath, yamlPath)
    if (migrated !== undefined) return migrated
    // Migration failed (malformed toml, missing key). Fall through to mint.
  }

  // Fresh mint.
  const minted = mintRepoId()
  writeRepoIdToYaml(yamlPath, minted)
  return minted
}

/**
 * Read `repo.id` from an existing yaml file.
 *
 * Returns the RepoId when present and valid. Returns undefined when the key
 * is missing, invalid, or the file is malformed — caller decides whether to
 * mint, migrate, or overwrite.
 */
function readRepoIdFromYaml(yamlPath: string): RepoId | undefined {
  try {
    const raw = readFileSync(yamlPath, "utf-8")
    const doc = parseDocument(raw)
    if (doc.errors.length > 0) {
      log.warn?.(
        `${yamlPath}: malformed YAML (${doc.errors[0]?.message ?? "parse error"}); ignoring for repo.id lookup.`,
      )
      return undefined
    }
    const repoBlock = doc.get("repo")
    if (repoBlock == null) return undefined
    // doc.getIn preserves the exact user value (string / number / etc.).
    const id = doc.getIn(["repo", "id"])
    if (typeof id !== "string" || id.length === 0) {
      if (id !== undefined) {
        log.warn?.(`${yamlPath}: invalid \`repo.id\` (got ${typeof id}); will mint fresh and overwrite.`)
      }
      return undefined
    }
    return asRepoId(id)
  } catch (err) {
    log.warn?.(`${yamlPath}: read/parse error (${String(err)}); ignoring for repo.id lookup.`)
    return undefined
  }
}

/**
 * Read `repo_id` from a legacy `.km/config.toml`, write it into yaml, and
 * delete the toml file. One-time migration path.
 *
 * Returns the RepoId on success. Returns undefined if the toml is malformed
 * or has no `repo_id` — caller falls back to minting fresh.
 */
function migrateRepoIdFromToml(tomlPath: string, yamlPath: string): RepoId | undefined {
  let legacyId: string | undefined
  try {
    const raw = readFileSync(tomlPath, "utf-8")
    const parsed = Bun.TOML.parse(raw) as Record<string, unknown>
    const candidate = parsed["repo_id"]
    if (typeof candidate === "string" && candidate.length > 0) {
      legacyId = candidate
    } else {
      log.warn?.(
        `${tomlPath}: missing or invalid \`repo_id\` during migration (got ${typeof candidate}); will mint fresh.`,
      )
    }
  } catch (err) {
    log.warn?.(`${tomlPath}: malformed TOML during migration (${String(err)}); will mint fresh.`)
  }

  if (legacyId === undefined) return undefined

  const id = asRepoId(legacyId)
  writeRepoIdToYaml(yamlPath, id)
  try {
    rmSync(tomlPath, { force: true })
  } catch (err) {
    log.warn?.(`${tomlPath}: could not remove legacy TOML after migration (${String(err)}); safe to delete manually.`)
  }
  log.info?.(`migrated repo_id from ${tomlPath} → ${yamlPath} (repo.id=${String(id)}); TOML file removed.`)
  return id
}

/**
 * Write `repo.id` into `<yamlPath>`, preserving existing content and user
 * comments via eemeli/yaml's Document API. Creates a fresh document with a
 * `repo:` block when the file does not exist or is malformed.
 *
 * Exported for tests and targeted callers; production code should use
 * `readOrMintRepoId`.
 */
export function writeRepoConfigYaml(yamlPath: string, repoId: RepoId): void {
  writeRepoIdToYaml(yamlPath, repoId)
}

function writeRepoIdToYaml(yamlPath: string, repoId: RepoId): void {
  const dir = dirname(yamlPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const doc = loadOrCreateDocument(yamlPath)
  const hadRepoBlock = doc.has("repo")

  if (!hadRepoBlock) {
    // Fresh insert: build a Pair with a Scalar key so we can attach a
    // `commentBefore` explaining the block is machine-managed. This renders
    // as a leading `# comment` line above the `repo:` key.
    const keyNode = new Scalar("repo")
    keyNode.commentBefore = REPO_BLOCK_COMMENT
    const mapNode = new YAMLMap()
    mapNode.set("id", String(repoId))
    const pair = new Pair(keyNode, mapNode)
    // doc.contents may be null for a fresh Document({}); normalize to a map.
    if (!(doc.contents instanceof YAMLMap)) {
      doc.contents = new YAMLMap()
    }
    doc.contents.items.push(pair)
  } else {
    // Merge path: set / overwrite `repo.id` but leave comments alone so
    // whatever the user (or a prior km version) wrote above the block
    // survives round-trip.
    doc.setIn(["repo", "id"], String(repoId))
  }

  writeFileSync(yamlPath, doc.toString(), "utf-8")
}

/**
 * Load `<yamlPath>` as a Document, or return a fresh empty Document when the
 * file is missing / malformed. Preserves comments and layout on round-trip.
 */
function loadOrCreateDocument(yamlPath: string): Document {
  if (!existsSync(yamlPath)) return new Document({})
  try {
    const raw = readFileSync(yamlPath, "utf-8")
    const doc = parseDocument(raw)
    if (doc.errors.length > 0) {
      log.warn?.(
        `${yamlPath}: malformed YAML (${doc.errors[0]?.message ?? "parse error"}); rewriting with a fresh \`repo:\` block. Other keys in the corrupt file will be lost.`,
      )
      return new Document({})
    }
    return doc
  } catch (err) {
    log.warn?.(`${yamlPath}: read error (${String(err)}); writing a fresh document.`)
    return new Document({})
  }
}
