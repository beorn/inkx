/**
 * L4 plateau pin: the public Repo / SyncableRepo surface contract.
 *
 * Compile-time assertions that catch surface drift at `tsc` time, not at
 * "ghost undefined / silent any" runtime time. Companion to
 * `repo-emitter-not-public.test.ts`, which pins the single
 * `"emitter" extends keyof Repo` invariant; this file pins the rest of
 * the surface so a future refactor can't silently:
 *
 *   - re-add `emitter` (or any other private field) to `Repo` /
 *     `SyncableRepo`,
 *   - drop a load-bearing method from `Repo` (e.g. rename `apply` →
 *     `dispatch`),
 *   - flip `getRepoEmitter`'s return from `Emitter` to `Emitter |
 *     undefined`,
 *   - rearrange `withSync(emitter, config)` into `withSync(config)` (the
 *     pre-`df353f2c7` shape that allowed `repo.emitter` drift),
 *   - rename / un-export the helpers (`getRepoEmitter`, `hasRepoEmitter`,
 *     `withSync`, `withFsWriter`).
 *
 * Pattern B (conditional-type `Assert<>`) is used for consistency with
 * `repo-emitter-not-public.test.ts`. No extra deps; the tests fail at
 * `tsc --noEmit`, not at `vitest run`.
 *
 * See bead `@km/storage/typed-repo-surface-completeness-tests`.
 */

import { describe, test, expect } from "vitest"
import { getRepoEmitter, hasRepoEmitter, type Emitter, type EmitOptions, type Repo } from "../../src/index.ts"
import { withSync, withFsWriter, type SyncableRepo, type Sync, type SyncConfig } from "@km/fs-mount"
import type { Change } from "@km/core"

// ─── Type-level assertion helpers ──────────────────────────────────────────

type Assert<T extends true> = T
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
type HasKey<T, K extends string> = K extends keyof T ? true : false
type RequiredKeys<T, Keys extends readonly (keyof T)[]> = Keys[number] extends keyof T ? true : false

describe("Repo public surface — typed completeness pins", () => {
  // ─── Repo: forbidden fields ──────────────────────────────────────────────

  test("Repo does NOT expose `emitter` on its public surface", () => {
    type _NoEmitter = Assert<Equal<HasKey<Repo, "emitter">, false>>
    const _check: _NoEmitter = true
    expect(_check).toBe(true)
  })

  // ─── SyncableRepo: forbidden fields ──────────────────────────────────────

  test("SyncableRepo does NOT expose `emitter` on its public surface", () => {
    type _NoEmitter = Assert<Equal<HasKey<SyncableRepo, "emitter">, false>>
    const _check: _NoEmitter = true
    expect(_check).toBe(true)
  })

  // ─── Repo: required public methods/fields ────────────────────────────────
  //
  // Pin the load-bearing surface so a renamer (e.g. `apply` → `dispatch`)
  // breaks `tsc` rather than producing a silently-different Repo.
  // Adding new fields to Repo is fine — extending this list is the
  // intended workflow and signals "yes, this is now part of the contract."

  test("Repo HAS the load-bearing public fields and methods", () => {
    type RequiredRepoKeys = readonly [
      // structural
      "path",
      "mode",
      "repoId",
      "data",
      "files",
      "config",
      "database",
      "version",
      // mutation contract
      "apply",
      "commit",
      "updateNode",
      "moveNode",
      "deleteNode",
      "addNode",
      // queries
      "getNode",
      "getChildren",
      "getSubtree",
      "search",
      "query",
      // sync / lifecycle
      "sync",
      "watch",
      "close",
    ]
    type _Required = Assert<RequiredKeys<Repo, RequiredRepoKeys>>
    const _check: _Required = true
    expect(_check).toBe(true)
  })

  // ─── SyncableRepo: minimal-shape pins ────────────────────────────────────
  //
  // SyncableRepo is the minimal structural type that withSync /
  // withFsWriter accept. It MUST stay minimal — adding fields here is a
  // breaking change to anyone passing a hand-rolled mini-repo (e.g.
  // `packages/km-storage/src/watcher.ts:miniRepo`).

  test("SyncableRepo HAS exactly { database, path, apply, commit }", () => {
    type _HasDatabase = Assert<HasKey<SyncableRepo, "database">>
    type _HasPath = Assert<HasKey<SyncableRepo, "path">>
    type _HasApply = Assert<HasKey<SyncableRepo, "apply">>
    type _HasCommit = Assert<HasKey<SyncableRepo, "commit">>
    // Forbid drift toward other Repo fields. Each addition here is a
    // structural break for hand-rolled SyncableRepo objects.
    type _NoFiles = Assert<Equal<HasKey<SyncableRepo, "files">, false>>
    type _NoData = Assert<Equal<HasKey<SyncableRepo, "data">, false>>
    type _NoConfig = Assert<Equal<HasKey<SyncableRepo, "config">, false>>
    type _NoVersion = Assert<Equal<HasKey<SyncableRepo, "version">, false>>
    type _NoEmitter = Assert<Equal<HasKey<SyncableRepo, "emitter">, false>>
    const _check: [
      _HasDatabase,
      _HasPath,
      _HasApply,
      _HasCommit,
      _NoFiles,
      _NoData,
      _NoConfig,
      _NoVersion,
      _NoEmitter,
    ] = [true, true, true, true, true, true, true, true, true]
    expect(_check.every(Boolean)).toBe(true)
  })

  // ─── getRepoEmitter / hasRepoEmitter signatures ──────────────────────────

  test("getRepoEmitter signature is (repo: Repo) => Emitter (NOT Emitter | undefined)", () => {
    type ExpectedGetRepoEmitter = (repo: Repo) => Emitter
    type _Sig = Assert<Equal<typeof getRepoEmitter, ExpectedGetRepoEmitter>>
    const _check: _Sig = true
    expect(_check).toBe(true)
  })

  test("hasRepoEmitter signature is (repo: Repo) => boolean", () => {
    type ExpectedHasRepoEmitter = (repo: Repo) => boolean
    type _Sig = Assert<Equal<typeof hasRepoEmitter, ExpectedHasRepoEmitter>>
    const _check: _Sig = true
    expect(_check).toBe(true)
  })

  // ─── withSync arity / shape ──────────────────────────────────────────────
  //
  // The L4 plateau move was forcing the emitter to be the FIRST positional
  // argument — explicit injection at decoration time, not a `config.emitter`
  // field that anyone could later route through `repo.emitter`. Pin it.

  test("withSync takes (emitter, config?) and returns a Sync decorator", () => {
    // First parameter must be Emitter — the explicit-injection invariant.
    type _FirstArg = Assert<Equal<Parameters<typeof withSync>[0], Emitter>>

    // Second arg is optional Partial<SyncConfig>. Pin both the type and
    // the optional-ness — making it required is a breaking change.
    type SecondArg = Parameters<typeof withSync>[1]
    type _SecondArgType = Assert<Equal<SecondArg, Partial<SyncConfig> | undefined>>

    // Return value is a decorator: (repo: SyncableRepo) => SyncableRepo & Sync.
    // Use `extends` for the bound generic so the Equal check stays strict.
    type Decorator = ReturnType<typeof withSync>
    type _DecoratorAcceptsSyncable = Assert<Parameters<Decorator>[0] extends SyncableRepo ? true : false>
    type _DecoratorReturnsSync = Assert<ReturnType<Decorator> extends Sync ? true : false>

    const _check: [_FirstArg, _SecondArgType, _DecoratorAcceptsSyncable, _DecoratorReturnsSync] = [
      true,
      true,
      true,
      true,
    ]
    expect(_check.every(Boolean)).toBe(true)
  })

  // ─── withFsWriter arity / shape ──────────────────────────────────────────

  test("withFsWriter takes (repo: SyncableRepo, emitter: Emitter) — emitter is positional", () => {
    type Args = Parameters<typeof withFsWriter>
    type _RepoArg = Assert<Args[0] extends SyncableRepo ? true : false>
    type _EmitterArg = Assert<Equal<Args[1], Emitter>>

    // Return shape pins applyChangeToFs as a (Change) => void on the result.
    type Result = ReturnType<typeof withFsWriter>
    type _HasApplyChangeToFs = Assert<HasKey<Result, "applyChangeToFs">>
    type _HasRepo = Assert<HasKey<Result, "repo">>
    type _ApplyChangeToFsSig = Assert<Equal<Result["applyChangeToFs"], (change: Change) => void>>

    const _check: [_RepoArg, _EmitterArg, _HasApplyChangeToFs, _HasRepo, _ApplyChangeToFsSig] = [
      true,
      true,
      true,
      true,
      true,
    ]
    expect(_check.every(Boolean)).toBe(true)
  })

  // ─── Mutation method shapes (apply / commit) ─────────────────────────────
  //
  // Pin the apply()/commit() signatures on Repo. A renamer that swapped
  // `change` for `event` or dropped the EmitOptions param would otherwise
  // pass type-check while producing a silently-different mutation contract.

  test("Repo.apply / Repo.commit accept (Change-without-id-ts, EmitOptions?) and return Change", () => {
    type ApplySig = Repo["apply"]
    type CommitSig = Repo["commit"]
    type ExpectedSig = (change: Omit<Change, "id" | "ts">, options?: EmitOptions) => Change
    type _Apply = Assert<Equal<ApplySig, ExpectedSig>>
    type _Commit = Assert<Equal<CommitSig, ExpectedSig>>
    const _check: [_Apply, _Commit] = [true, true]
    expect(_check.every(Boolean)).toBe(true)
  })

  // ─── Export-presence pins ────────────────────────────────────────────────
  //
  // If any of these symbols get renamed or un-exported without updating
  // this test, the import block at the top of the file fails to type-check
  // — that IS the test. The asserts below pin "the value at the import
  // site is callable" so a future refactor that turned `getRepoEmitter`
  // into a type-only export would also fail here.

  test("@km/storage exports getRepoEmitter and hasRepoEmitter as values", () => {
    expect(typeof getRepoEmitter).toBe("function")
    expect(typeof hasRepoEmitter).toBe("function")
  })

  test("@km/fs-mount exports withSync and withFsWriter as values", () => {
    expect(typeof withSync).toBe("function")
    expect(typeof withFsWriter).toBe("function")
  })
})
