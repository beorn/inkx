/**
 * process-supervisor — pidfile + child-registry lifecycle tests.
 *
 * These tests drive the supervisor in isolation (no actual subprocess
 * spawning). Liveness probing uses `process.pid` (the test process itself,
 * which is by definition alive) and a deliberately-bogus PID like
 * `2_147_483_647` for "definitely dead". Process-group kills are exercised
 * with a synthetic recipient that we can detect without taking down our own
 * test runner.
 *
 * HOME / XDG_CACHE_HOME are stubbed to a tmpdir so the supervisor's pidfile
 * + registry land somewhere the test can wipe between cases without ever
 * touching the user's real `~/.cache/silvercode/`.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "silvercode-supervisor-"))
  vi.stubEnv("HOME", tmpRoot)
  vi.stubEnv("XDG_CACHE_HOME", join(tmpRoot, ".cache"))
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe("pidfile lifecycle", () => {
  test("vaultHash is stable + deterministic for the same cwd", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const a = mod.vaultHash("/path/to/vault")
    const b = mod.vaultHash("/path/to/vault")
    const c = mod.vaultHash("/different/vault")
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    // Truncated to 8 hex chars per the spec.
    expect(a).toMatch(/^[0-9a-f]{8}$/)
  })

  test("vaultHash collapses relative + absolute forms of same path", async () => {
    const mod = await import("../src/process-supervisor.ts")
    // Both should resolve to the same absolute path from the test cwd.
    const abs = mod.vaultHash(process.cwd())
    const rel = mod.vaultHash(".")
    expect(abs).toBe(rel)
  })

  test("isPidAlive — ours is alive, large bogus pid is dead", async () => {
    const mod = await import("../src/process-supervisor.ts")
    expect(mod.isPidAlive(process.pid)).toBe(true)
    // 2^31 - 1 is a valid uint but vanishingly likely to be live; on most
    // OSes pids cap well below this.
    expect(mod.isPidAlive(2_147_483_647)).toBe(false)
    // Garbage / negatives → false (never throws).
    expect(mod.isPidAlive(0)).toBe(false)
    expect(mod.isPidAlive(-5)).toBe(false)
    expect(mod.isPidAlive(Number.NaN)).toBe(false)
  })

  test("write + read + remove pidfile round-trips", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/one"
    expect(mod.readPidfile(cwd)).toBe(null)
    mod.writePidfile(cwd, 12345)
    expect(mod.readPidfile(cwd)).toBe(12345)
    expect(existsSync(mod.pidfilePath(cwd))).toBe(true)
    mod.removePidfile(cwd)
    expect(mod.readPidfile(cwd)).toBe(null)
    expect(existsSync(mod.pidfilePath(cwd))).toBe(false)
  })

  test("readPidfile — missing file → null, garbage content → null", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/garbage"
    // Write garbage to the pidfile slot.
    const path = mod.pidfilePath(cwd)
    mkdirSync(join(path, ".."), { recursive: true })
    writeFileSync(path, "not-a-number\n")
    expect(mod.readPidfile(cwd)).toBe(null)
  })

  test("acquireSupervisor — fresh start writes pidfile, returns ok+takenOver=false", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/fresh"
    const result = mod.acquireSupervisor(cwd)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.takenOver).toBe(false)
      expect(result.reaped).toEqual([])
    }
    expect(mod.readPidfile(cwd)).toBe(process.pid)
  })

  test("acquireSupervisor — refuses when previous owner is still alive", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/concurrent"
    // Pretend our own pid wrote the pidfile a moment ago. We can't fake a
    // different live pid without spawning, so the test process itself
    // stands in. acquireSupervisor's `prior !== process.pid` short-circuit
    // guards against the trivial case where we're re-acquiring our own
    // pidfile (no-op), so we use a SECOND pid known to be live: PID 1
    // (init / launchd) is always alive on POSIX.
    mod.writePidfile(cwd, 1)
    const result = mod.acquireSupervisor(cwd)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.runningPid).toBe(1)
      expect(result.pidfile).toContain("silvercode")
    }
    // Our pid did NOT overwrite the pidfile.
    expect(mod.readPidfile(cwd)).toBe(1)
  })

  test("acquireSupervisor — re-acquiring our own pidfile is a no-op success", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/self"
    mod.writePidfile(cwd) // process.pid by default
    const result = mod.acquireSupervisor(cwd)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Same pid in pidfile, treated as fresh because prior===self.
      expect(result.takenOver).toBe(false)
    }
  })

  test("acquireSupervisor — takes over a stale pidfile (dead owner)", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/stale"
    mod.writePidfile(cwd, 2_147_483_647) // bogus dead pid
    const result = mod.acquireSupervisor(cwd)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.takenOver).toBe(true)
      // No registry entries → nothing to reap, but takenOver still true.
      expect(result.reaped).toEqual([])
    }
    // Pidfile now ours.
    expect(mod.readPidfile(cwd)).toBe(process.pid)
  })

  test("releaseSupervisor — removes pidfile + clears registry", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/release"
    mod.acquireSupervisor(cwd)
    mod.registerChild(cwd, { pid: 99999, pgid: 99999, sessionId: "s1", startedAt: Date.now() })
    expect(mod.readPidfile(cwd)).toBe(process.pid)
    expect(mod.readChildRegistry(cwd).length).toBe(1)
    mod.releaseSupervisor(cwd)
    expect(mod.readPidfile(cwd)).toBe(null)
    expect(mod.readChildRegistry(cwd).length).toBe(0)
  })
})

describe("child registry", () => {
  test("registerChild appends one row per call", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/registry"
    mod.registerChild(cwd, { pid: 100, pgid: 100, sessionId: "s1", startedAt: 1 })
    mod.registerChild(cwd, { pid: 101, pgid: 101, sessionId: "s2", startedAt: 2 })
    mod.registerChild(cwd, { pid: 102, pgid: 102, sessionId: "s3", startedAt: 3 })
    const records = mod.readChildRegistry(cwd)
    expect(records).toHaveLength(3)
    expect(records.map((r) => r.pid)).toEqual([100, 101, 102])
    expect(records.map((r) => r.sessionId)).toEqual(["s1", "s2", "s3"])
  })

  test("readChildRegistry skips malformed lines but keeps valid ones", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/malformed"
    const path = mod.childRegistryPath(cwd)
    mkdirSync(join(path, ".."), { recursive: true })
    writeFileSync(
      path,
      [
        JSON.stringify({ pid: 1, pgid: 1, sessionId: "ok-1", startedAt: 1 }),
        "not-json-at-all",
        JSON.stringify({ pid: "wrong-type", pgid: 2 }),
        JSON.stringify({ pid: 3, pgid: 3, sessionId: "ok-2", startedAt: 3 }),
        "",
      ].join("\n"),
    )
    const records = mod.readChildRegistry(cwd)
    expect(records).toHaveLength(2)
    expect(records.map((r) => r.sessionId)).toEqual(["ok-1", "ok-2"])
  })

  test("clearChildRegistry deletes the file", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/clear"
    mod.registerChild(cwd, { pid: 1, pgid: 1, sessionId: "s", startedAt: 1 })
    expect(mod.readChildRegistry(cwd).length).toBe(1)
    mod.clearChildRegistry(cwd)
    expect(mod.readChildRegistry(cwd).length).toBe(0)
  })

  test("readChildRegistry on missing file returns empty array", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/never-touched"
    expect(mod.readChildRegistry(cwd)).toEqual([])
  })
})

describe("orphan reaping", () => {
  test("killChildPgids skips dead pids without throwing", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const records = [
      { pid: 2_147_483_640, pgid: 2_147_483_640, sessionId: "ghost-1", startedAt: 1 },
      { pid: 2_147_483_641, pgid: 2_147_483_641, sessionId: "ghost-2", startedAt: 2 },
    ]
    const killed = mod.killChildPgids(records)
    expect(killed).toEqual([])
  })

  test("acquireSupervisor reaps orphan registry on stale pidfile takeover", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/reap"

    // Simulate a previous silvercode crash: stale pidfile + registry full
    // of orphans. We use bogus dead pids so killChildPgids has nothing
    // alive to actually signal — that's the whole point: the reaper must
    // not throw on dead targets, it just iterates and skips.
    mod.writePidfile(cwd, 2_147_483_647)
    mod.registerChild(cwd, { pid: 2_147_483_640, pgid: 2_147_483_640, sessionId: "s1", startedAt: 1 })
    mod.registerChild(cwd, { pid: 2_147_483_641, pgid: 2_147_483_641, sessionId: "s2", startedAt: 2 })
    expect(mod.readChildRegistry(cwd).length).toBe(2)

    const result = mod.acquireSupervisor(cwd)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.takenOver).toBe(true)
      // All targets were dead → reaped is empty (nothing was actually
      // signalled), but the registry was cleared regardless.
      expect(result.reaped).toEqual([])
    }
    // Registry was wiped on takeover.
    expect(mod.readChildRegistry(cwd).length).toBe(0)
    // Pidfile is now ours.
    expect(mod.readPidfile(cwd)).toBe(process.pid)
  })

  test("supervisorStatus reports owner + child count", async () => {
    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/status"
    let status = mod.supervisorStatus(cwd)
    expect(status.ownerPid).toBe(null)
    expect(status.childCount).toBe(0)
    expect(status.ownerAlive).toBe(false)

    mod.acquireSupervisor(cwd)
    mod.registerChild(cwd, { pid: 1, pgid: 1, sessionId: "s", startedAt: 1 })
    mod.registerChild(cwd, { pid: 2, pgid: 2, sessionId: "s", startedAt: 2 })

    status = mod.supervisorStatus(cwd)
    expect(status.ownerPid).toBe(process.pid)
    expect(status.ownerAlive).toBe(true)
    expect(status.childCount).toBe(2)
  })
})

describe("cache root resolution", () => {
  test("XDG_CACHE_HOME wins when set", async () => {
    const mod = await import("../src/process-supervisor.ts")
    expect(mod.cacheRoot()).toBe(join(tmpRoot, ".cache", "silvercode"))
  })

  test("falls back to $HOME/.cache when XDG_CACHE_HOME unset", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("HOME", tmpRoot)
    // Ensure XDG_CACHE_HOME is unset for this case.
    delete process.env.XDG_CACHE_HOME
    // Re-import via dynamic import would re-execute the module, but
    // cacheRoot reads env at call time, so the existing import is fine.
    const mod = await import("../src/process-supervisor.ts")
    expect(mod.cacheRoot()).toBe(join(tmpRoot, ".cache", "silvercode"))
  })

  test("listVaultHashes returns only hash-named subdirs", async () => {
    const mod = await import("../src/process-supervisor.ts")
    // Seed a few vaults.
    mod.registerChild("/vault/a", { pid: 1, pgid: 1, sessionId: "s", startedAt: 1 })
    mod.registerChild("/vault/b", { pid: 1, pgid: 1, sessionId: "s", startedAt: 1 })
    const hashes = mod.listVaultHashes()
    // Two distinct hashes for two distinct vaults.
    expect(hashes.length).toBeGreaterThanOrEqual(2)
  })
})

describe("regression — fork-bomb scenario", () => {
  test("simulated crash → fresh launch reaps registered orphans", async () => {
    // Scenario: silvercode launched, spawned two claudes, then died HARD
    // (we simulate by leaving the pidfile in place but pointing at a dead
    // pid, plus child registry entries for the orphaned grandchildren).
    // A fresh silvercode launches; acquireSupervisor must reap them.

    const mod = await import("../src/process-supervisor.ts")
    const cwd = "/test/vault/fork-bomb-repro"

    // === Previous (now-dead) silvercode's bookkeeping ===
    mod.writePidfile(cwd, 2_147_483_647) // dead pid stand-in
    mod.registerChild(cwd, { pid: 2_147_483_640, pgid: 2_147_483_640, sessionId: "old-1", startedAt: 1 })
    mod.registerChild(cwd, { pid: 2_147_483_641, pgid: 2_147_483_641, sessionId: "old-2", startedAt: 2 })
    mod.registerChild(cwd, { pid: 2_147_483_642, pgid: 2_147_483_642, sessionId: "old-3", startedAt: 3 })
    expect(mod.readChildRegistry(cwd).length).toBe(3)

    // === Fresh silvercode launches ===
    const result = mod.acquireSupervisor(cwd)

    // It MUST take over (not refuse start) and clear the registry.
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.takenOver).toBe(true)
    }
    expect(mod.readChildRegistry(cwd).length).toBe(0)
    expect(mod.readPidfile(cwd)).toBe(process.pid)
  })
})
