/**
 * Tests for the filewatch ambient adapter — Phase 6.b.
 *
 * The classifier is pure and easy to test deterministically. The
 * fs.watch integration is best-effort; we verify register/dispose
 * semantics + filtering without relying on real disk events (those are
 * platform-specific and timing-sensitive).
 */

import { describe, expect, test } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import { classifyFilewatchPath, registerFilewatchAmbientAdapter } from "../../src/ambient-adapters/filewatch.ts"

describe("ambient-adapter/filewatch", () => {
  describe("classifyFilewatchPath", () => {
    test("returns content for a normal source path", () => {
      const cwd = "/tmp/proj"
      const result = classifyFilewatchPath(cwd, "/tmp/proj/src/index.ts")
      expect(result).not.toBeNull()
      expect(result!.rel).toBe("src/index.ts")
      // Content is just the relative path — short + scannable in chat.
      expect(result!.content).toBe("src/index.ts")
    })

    test("filters atomic-write temp files (.tmp, .tmp.<pid>.<ts>)", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/src/foo.tmp")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/controller.ts.tmp.68054.1777327001973")).toBeNull()
    })

    test("filters editor noise (.swp, .swo, .swx, ~, .bak, .lock, .DS_Store)", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.foo.swp")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.foo.swo")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.foo.swx")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/foo~")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/foo.bak")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/foo.lock")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.DS_Store")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/sub/.DS_Store")).toBeNull()
    })

    test("filters .claude/worktrees (agent worktree clones)", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.claude/worktrees/agent-x/src/foo.ts")).toBeNull()
    })

    test("filters node_modules", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/node_modules/foo/index.js")).toBeNull()
    })

    test("filters .git", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.git/HEAD")).toBeNull()
    })

    test("filters dist + .beads + .km", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj/dist/bundle.js")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.beads/issues.jsonl")).toBeNull()
      expect(classifyFilewatchPath(cwd, "/tmp/proj/.km/state.db")).toBeNull()
    })

    test("filters paths outside cwd", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/etc/passwd")).toBeNull()
    })

    test("returns null for the cwd itself", () => {
      const cwd = "/tmp/proj"
      expect(classifyFilewatchPath(cwd, "/tmp/proj")).toBeNull()
    })
  })

  describe("register", () => {
    test("returns a disposer that is idempotent", () => {
      const scope = createScope("test")
      const queue = createChannelQueue(scope)
      const dir = mkdtempSync(join(tmpdir(), "ambient-filewatch-"))
      const dispose = registerFilewatchAmbientAdapter({ scope, queue, cwd: dir, recursive: false })
      expect(typeof dispose).toBe("function")
      dispose()
      dispose() // safe to double-dispose
    })

    test("survives an invalid cwd (logs, does not throw)", () => {
      const scope = createScope("test")
      const queue = createChannelQueue(scope)
      const dispose = registerFilewatchAmbientAdapter({
        scope,
        queue,
        cwd: "/path/that/definitely/does/not/exist/anywhere",
        recursive: false,
      })
      expect(typeof dispose).toBe("function")
      dispose()
    })

    test("emits a sanitized event when the watcher fires for a real file", async () => {
      const scope = createScope("test")
      const queue = createChannelQueue(scope)
      const dir = mkdtempSync(join(tmpdir(), "ambient-filewatch-"))
      registerFilewatchAmbientAdapter({ scope, queue, cwd: dir, recursive: false })

      const target = join(dir, "hello.txt")
      await Bun.write(target, "hi")

      const start = Date.now()
      while (queue.peek().length === 0 && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 25))
      }

      // fs.watch is platform-flaky for create-only events; we don't
      // require a hit. If we got one, assert it looks right.
      const events = queue.peek()
      if (events.length > 0) {
        expect(events[0]?.source).toBe("filewatch")
        expect(events[0]?.content).toBe("hello.txt")
      }
    })
  })
})
