/**
 * L4 invariant: `Repo` does NOT expose `emitter` on its public surface.
 *
 * The emitter is wired internally by the factories and made available
 * to legitimate consumers (sync decorators, tests) via the typed escape
 * hatch `getRepoEmitter(repo)`. Direct `repo.emitter` access is forbidden:
 * it lets callers reach past `repo.apply()` / `repo.commit()` and bypass
 * the typed mutation contract.
 *
 * This test pins the invariant so future refactors can't accidentally
 * re-expose `emitter` on the public surface.
 *
 * See bead `@km/storage/sync-emitter-migration`.
 */

import { describe, test, expect } from "vitest"
import { mkdtempSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createMemDataStore, createBareRepo, getRepoEmitter, hasRepoEmitter, type Repo } from "../../src/index.ts"

describe("Repo public surface — emitter is not exposed", () => {
  test("createBareRepo returns a Repo without an `emitter` enumerable property", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    // Enumerable property check — `for…in` should NOT see `emitter`.
    const enumerableKeys = new Set<string>()
    for (const key in repo) enumerableKeys.add(key)
    expect(enumerableKeys.has("emitter")).toBe(false)

    // Object.keys (own enumerable) — same expectation.
    expect(Object.keys(repo)).not.toContain("emitter")
  })

  test("getRepoEmitter returns the registered emitter", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    const emitter = getRepoEmitter(repo)
    expect(emitter).toBeDefined()
    expect(typeof emitter.apply).toBe("function")
    expect(typeof emitter.commit).toBe("function")
    expect(typeof emitter.onApply).toBe("function")
  })

  test("hasRepoEmitter reports true for factory-built Repos", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)
    expect(hasRepoEmitter(repo)).toBe(true)
  })

  test("getRepoEmitter throws for unregistered Repo-shaped objects", () => {
    // Passing an arbitrary object that isn't a real Repo — the helper must
    // refuse rather than silently return undefined.
    const fake = {} as unknown as Repo
    expect(() => getRepoEmitter(fake)).toThrow(/no registered emitter/)
  })

  test("Repo type does not have `emitter` on its public surface (compile-time)", () => {
    // Compile-time check — if a future refactor re-adds `readonly emitter` to
    // the Repo interface, this assertion stops type-checking. The runtime
    // assertion is a no-op.
    type HasEmitter<T> = "emitter" extends keyof T ? true : false
    type RepoHasEmitter = HasEmitter<Repo>
    const _check: RepoHasEmitter = false
    expect(_check).toBe(false)
  })

  test("apply() / commit() still flow through the emitter", () => {
    const data = createMemDataStore()
    using repo = createBareRepo(data)

    const observed: Array<{ source?: string }> = []
    getRepoEmitter(repo).onApply((_change, options) => {
      observed.push({ source: options.source })
    })

    repo.apply({
      type: "node_created",
      actor: "user",
      data: { id: "test-node", type: "p", name: "test" },
    })

    // The emitter saw the change — proving repo.apply() routes through it
    // even though `repo.emitter` itself is not on the public surface.
    expect(observed.length).toBeGreaterThan(0)
  })

  test("createBareRepo with a pre-supplied emitter still routes via getRepoEmitter", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "km-emitter-pin-"))
    const { createEmitter } = await import("../../src/emitter.ts")
    const { Database } = await import("bun:sqlite")
    const { SCHEMA } = await import("../../src/db/schema.ts")
    const db = new Database(":memory:")
    db.run(SCHEMA)
    const emitter = createEmitter({ kmDir: join(tmp, ".km"), db, skipPersist: true })

    const data = createMemDataStore()
    using repo = createBareRepo(data, { emitter, configPath: tmp })

    expect(getRepoEmitter(repo)).toBe(emitter)
  })
})
