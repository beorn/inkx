import { describe, expect, test } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

import { runGenerator } from "@km/core"
import { createRepo } from "../../src/repo/repo.ts"

async function waitForFile(path: string, timeoutMs = 1000): Promise<void> {
  const started = Date.now()
  while (!existsSync(path)) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${path}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe("repo SQLite pragma lock handling", () => {
  test("disk repo open waits for a concurrent writer before configuring WAL", async () => {
    const root = mkdtempSync(join(tmpdir(), "km-sqlite-busy-pragmas-"))
    try {
      mkdirSync(join(root, ".km"), { recursive: true })
      {
        using _repo = runGenerator(createRepo(root, { loadFiles: false }))
      }

      const dbPath = join(root, ".km", "state.db")
      const readyPath = join(root, ".km", "writer-ready")
      const lockScript = join(root, ".km", "hold-sqlite-lock.ts")
      writeFileSync(
        lockScript,
        `
          import { Database } from "bun:sqlite"
          import { writeFileSync } from "node:fs"

          const [, , dbPath, readyPath, holdMsRaw] = process.argv
          const db = new Database(dbPath!)
          db.run("PRAGMA journal_mode = WAL")
          db.run("BEGIN EXCLUSIVE")
          db.run("CREATE TABLE IF NOT EXISTS __busy_lock (id INTEGER)")
          writeFileSync(readyPath!, "ready")
          await new Promise((resolve) => setTimeout(resolve, Number(holdMsRaw)))
          db.run("COMMIT")
          db.close()
        `,
        "utf-8",
      )

      const child = spawn(process.execPath, [lockScript, dbPath, readyPath, "350"], {
        stdio: ["ignore", "ignore", "pipe"],
      })
      const stderr: Buffer[] = []
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))

      await waitForFile(readyPath)

      expect(() => {
        using _repo = runGenerator(createRepo(root, { loadFiles: false }))
      }).not.toThrow()

      const exitCode = await new Promise<number | null>((resolve) => child.on("exit", resolve))
      expect(Buffer.concat(stderr).toString("utf-8")).toBe("")
      expect(exitCode).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
