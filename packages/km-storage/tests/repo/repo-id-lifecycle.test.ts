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
 *  - Fresh disk repo → `.km/config.toml` gains `repo_id`, `repo.repoId` matches.
 *  - Reopen same repo → `repo.repoId` === previous value (idempotent).
 *  - Existing `.km/config.toml` with `repo_id` set → reads existing, does not
 *    overwrite.
 *  - Malformed `.km/config.toml` → logs warning, mints fresh (delegates to
 *    `readOrMintRepoId`'s existing fallback; see its test for the warn spy).
 *  - Memory-mode repo (`forceMemory: true`) mints a transient RepoId — not
 *    persisted anywhere, but always defined so consumers can unconditionally
 *    key by `repo.repoId`.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { runGenerator } from "@km/core"
import { createRepo } from "../../src/repo/repo.ts"
import { CONFIG_TOML_NAME } from "../../src/federation/repo-id.ts"

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
  test("fresh disk repo mints + persists RepoId; repo.repoId matches .km/config.toml", () => {
    // Precondition: no .km/ yet — first open must create it.
    expect(existsSync(kmDir)).toBe(false)
    mkdirSync(kmDir, { recursive: true })

    using repo = runGenerator(createRepo(tempRoot))

    // repo.repoId is always defined.
    expect(repo.repoId).toBeDefined()
    expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

    // .km/config.toml now exists with the same id.
    const tomlPath = join(kmDir, CONFIG_TOML_NAME)
    expect(existsSync(tomlPath)).toBe(true)
    const contents = readFileSync(tomlPath, "utf-8")
    expect(contents).toContain(`repo_id = "${String(repo.repoId)}"`)
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
    const afterFirst = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")

    using reopened = runGenerator(createRepo(tempRoot))
    expect(String(reopened.repoId)).toBe(firstId)

    const afterSecond = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
    expect(afterSecond).toBe(afterFirst)
  })

  test("existing .km/config.toml with repo_id — reads existing, does not overwrite", () => {
    mkdirSync(kmDir, { recursive: true })
    // Use a known ULID-shaped literal so we can assert an exact round-trip.
    const preset = "01HKXB2W7K9M1X4Y2Z3ABCDEFG"
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), `# existing config\nrepo_id = "${preset}"\n`, "utf-8")
    const before = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")

    using repo = runGenerator(createRepo(tempRoot))
    expect(String(repo.repoId)).toBe(preset)

    // File must not have been rewritten.
    const after = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
    expect(after).toBe(before)
  })

  test("malformed .km/config.toml mints fresh RepoId (delegates to readOrMintRepoId fallback)", () => {
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, CONFIG_TOML_NAME), "not valid = toml = broken [[", "utf-8")

    // readOrMintRepoId warns via loggily → console.warn. Silence it — the
    // warn-spy coverage lives in tests/federation/repo-id.test.ts; here we
    // only verify the lifecycle behavior (mint a valid id, persist it).
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      using repo = runGenerator(createRepo(tempRoot))
      expect(String(repo.repoId)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)

      // File was overwritten with a clean config containing the new id.
      const contents = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
      expect(contents).toContain(`repo_id = "${String(repo.repoId)}"`)
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
    expect(existsSync(join(kmDir, CONFIG_TOML_NAME))).toBe(false)

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

    const contents = readFileSync(join(kmDir, CONFIG_TOML_NAME), "utf-8")
    expect(contents).toContain(`repo_id = "${String(repo.repoId)}"`)
  })
})
