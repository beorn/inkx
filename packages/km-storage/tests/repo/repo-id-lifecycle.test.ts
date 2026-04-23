/**
 * Repo lifecycle wires `readOrMintRepoId` on open
 * (km-storage.federation-repo-lifecycle-wiring).
 *
 * The federation scaffolding (`readOrMintRepoId`, `parseKmUri`, workspace
 * mount) shipped in the prior bead but was orphaned — the actual Repo
 * lifecycle (`createRepo`, `createBareRepo`) never called `readOrMintRepoId`
 * so existing vaults never got a persisted RepoId. This test covers the
 * wiring:
 *
 *  - Fresh disk repo → `.km/config.yaml` gains `repo.id`, `repo.repoId` matches.
 *  - Reopen same repo → `repo.repoId` === previous value (idempotent).
 *  - Existing `.km/config.yaml` with `repo.id` set → reads existing, does not
 *    overwrite.
 *  - Malformed `.km/config.yaml` → logs warning, mints fresh (delegates to
 *    `readOrMintRepoId`'s existing fallback; see its test for the warn spy).
 *  - Memory-mode repo (`forceMemory: true`) mints a transient RepoId — not
 *    persisted anywhere, but always defined so consumers can unconditionally
 *    key by `repo.repoId`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { parseDocument } from "yaml"

import { runGenerator } from "@km/core"
import { createRepo } from "../../src/repo/repo.ts"
import { CONFIG_YAML_NAME } from "../../src/federation/repo-id.ts"

let tempRoot: string
let kmDir: string

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "km-repoid-lifecycle-"))
  kmDir = join(tempRoot, ".km")
})

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("Repo lifecycle wires readOrMintRepoId on open", () => {
  test("fresh disk repo mints + persists RepoId; repo.repoId matches .km/config.yaml", () => {
    // Precondition: no .km/ yet — first open must create it.
    expect(existsSync(kmDir)).toBe(false)
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempRoot))

    // repo.repoId is always defined.
    expect(repo.repoId).toBeDefined()
    expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    // .km/config.yaml now exists with the same id under `repo.id`.
    const yamlPath = join(kmDir, CONFIG_YAML_NAME)
    expect(existsSync(yamlPath)).toBe(true)
    const doc = parseDocument(readFileSync(yamlPath, "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(String(repo.repoId))
  })

  test("reopen returns same RepoId (idempotent round-trip)", () => {
    mkdirSync(kmDir, { recursive: true })

    let firstId: string
    {
      using repo = runGenerator(createRepo(tempRoot))
      firstId = String(repo.repoId)
    }

    // Grab file contents after first open to ensure second open does not
    // rewrite the file.
    const afterFirst = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")

    using reopened = runGenerator(createRepo(tempRoot))
    expect(String(reopened.repoId)).toBe(firstId)

    const afterSecond = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")
    expect(afterSecond).toBe(afterFirst)
  })

  test("existing .km/config.yaml with repo.id — reads existing, does not overwrite", () => {
    mkdirSync(kmDir, { recursive: true })
    // Use a known ULID-shaped literal so we can assert an exact round-trip.
    const preset = "01HKXB2W7K9M1X4Y2Z3ABCDEFG"
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), `# existing config\nrepo:\n  id: "${preset}"\n`, "utf-8")
    const before = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")

    using repo = runGenerator(createRepo(tempRoot))
    expect(String(repo.repoId)).toBe(preset)

    // File must not have been rewritten.
    const after = readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8")
    expect(after).toBe(before)
  })

  test("malformed .km/config.yaml mints fresh RepoId (delegates to readOrMintRepoId fallback)", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_YAML_NAME), "this is: not: valid: yaml:\n  - [unbalanced", "utf-8")

    // readOrMintRepoId warns via loggily → console.warn. Silence it — the
    // warn-spy coverage lives in tests/federation/repo-id.test.ts; here we
    // only verify the lifecycle behavior (mint a valid id, persist it).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      using repo = runGenerator(createRepo(tempRoot))
      expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

      // File was overwritten with a clean config containing the new id.
      const doc = parseDocument(readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8"))
      expect(doc.getIn(["repo", "id"])).toBe(String(repo.repoId))
    } finally {
      warnSpy.mockRestore()
    }
  })

  test("memory-mode repo mints a transient RepoId (not persisted)", () => {
    // forceMemory: true → no .km/ interaction, repo still gets a repoId.
    using repo = runGenerator(createRepo(tempRoot, { forceMemory: true }))
    expect(repo.mode).toBe("memory")
    expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    // Confirm nothing was persisted to disk.
    expect(existsSync(join(kmDir, CONFIG_YAML_NAME))).toBe(false)

    // Reopening memory-mode does NOT round-trip — transient means transient.
    using other = runGenerator(createRepo(tempRoot, { forceMemory: true }))
    expect(String(other.repoId)).not.toBe(String(repo.repoId))
  })

  test("loadFiles: true disk path also wires repoId", () => {
    // Exercises the `initWithFileLoading` branch (vs `initEmptyDb`).
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(tempRoot, "a.md"), "# A\n")

    using repo = runGenerator(createRepo(tempRoot, { loadFiles: true }))
    expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    const doc = parseDocument(readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(String(repo.repoId))
  })

  test("migrates legacy .km/config.toml → .km/config.yaml and deletes the toml", () => {
    mkdirSync(kmDir, { recursive: true })
    const legacy = "01HKXB2W7K9M1X4Y2Z3LEGACY99"
    const tomlPath = join(kmDir, "config.toml")
    writeFileSync(tomlPath, `repo_id = "${legacy}"\n`, "utf-8")

    using repo = runGenerator(createRepo(tempRoot))
    expect(String(repo.repoId)).toBe(legacy)

    // Legacy TOML removed; yaml carries the id.
    expect(existsSync(tomlPath)).toBe(false)
    const doc = parseDocument(readFileSync(join(kmDir, CONFIG_YAML_NAME), "utf-8"))
    expect(doc.getIn(["repo", "id"])).toBe(legacy)
  })
})
