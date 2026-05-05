/**
 * repo-emitters — internal-protocol emitter accessor for `Repo`.
 *
 * The emitter is **not** part of the public `Repo` interface — exposing
 * `repo.emitter` lets callers reach past the typed mutation methods
 * (`apply`, `commit`) and bypass the contract. The L4 plateau move:
 * keep emitter wiring private, expose a typed escape hatch for the
 * legitimate consumers (sync decorators, tests).
 *
 * The escape hatch is a WeakMap keyed by Repo. Factories
 * (`createRepo`, `createBareRepo`, `createTestEnvRepo`) call
 * `registerRepoEmitter(repo, emitter)` at construction time. Consumers
 * that need the emitter call `getRepoEmitter(repo)`.
 *
 * See bead `@km/storage/sync-emitter-migration`.
 */

import type { Emitter } from "../emitter.ts"
import type { Repo } from "./repo.ts"

const REPO_EMITTERS = new WeakMap<Repo, Emitter>()

/**
 * Associate an emitter with a Repo at construction time.
 *
 * Internal-protocol — only the repo factories should call this. Throws
 * if the same repo is registered twice (catches accidental double-wires
 * during refactors).
 */
export function registerRepoEmitter(repo: Repo, emitter: Emitter): void {
  if (REPO_EMITTERS.has(repo)) {
    throw new Error("registerRepoEmitter: repo already has an emitter registered")
  }
  REPO_EMITTERS.set(repo, emitter)
}

/**
 * Retrieve the emitter for a Repo.
 *
 * Use this at sync-wire-up time (`withSync(getRepoEmitter(repo), config)(repo)`,
 * `withFsWriter(repo, getRepoEmitter(repo))`) — never as a way to bypass
 * `repo.apply()` / `repo.commit()`.
 *
 * Throws if the repo wasn't registered (caller passed a Repo that didn't
 * come from a km-storage factory).
 */
export function getRepoEmitter(repo: Repo): Emitter {
  const emitter = REPO_EMITTERS.get(repo)
  if (!emitter) {
    throw new Error("getRepoEmitter: repo has no registered emitter (was it created via createRepo/createBareRepo?)")
  }
  return emitter
}

/**
 * Check whether a Repo has an emitter registered, without throwing.
 *
 * Useful for tests and diagnostics.
 */
export function hasRepoEmitter(repo: Repo): boolean {
  return REPO_EMITTERS.has(repo)
}
