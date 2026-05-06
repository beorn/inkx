/**
 * `km agent spawn @agent/<N>` orchestrator tests (Phase 3.3 of @km/agent/sigil-boards).
 *
 * Pins three invariants on the slot-orchestrator path:
 *   1. --dry-run prints the brief + planned exec; does NOT claim, does NOT spawn.
 *   2. The composed brief contains the persona body verbatim and the env block.
 *   3. Errors are clear when @agent/N doesn't exist or is already claimed.
 *
 * Concurrent-spawn race coverage is owned by Phase 1.3's CAS test — not duplicated here.
 */

import { afterEach, describe, expect, test } from "vitest"
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { $ } from "bun"

import { composeSessionBrief, isAgentSlotRef, buildExecCommand } from "../src/commands/agent-spawn.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = join(__dirname, "..", "src", "index.ts")

const scratch: string[] = []

afterEach(() => {
  while (scratch.length > 0) {
    const dir = scratch.pop()!
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

/** Build a fresh repo with a scaffold for @agent/<N> slot files. */
function freshRepoWithSlot(slotN: number, body = "You are slot N. Persona body."): string {
  const dir = mkdtempSync(join(tmpdir(), "kmtest-agentspawn-"))
  scratch.push(dir)
  mkdirSync(join(dir, ".km"), { recursive: true })
  mkdirSync(join(dir, "@agent"), { recursive: true })
  writeFileSync(
    join(dir, ".km", "config.yaml"),
    `beads:
  prefix: km
  roots: ["@km", "@agent"]
  default_scope: "scope"
`,
  )
  // Slot file at the @agent/<N> path. Frontmatter + body so resolveByName
  // can find it via name=@agent/<N>.
  writeFileSync(
    join(dir, "@agent", `${slotN}.md`),
    `---
type: task
priority: P2
---

# [ ] @agent/${slotN}

${body}
`,
  )
  return dir
}

async function km(repo: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await $`bun ${CLI_PATH} ${args}`
      .cwd(repo)
      .env({ ...process.env, KM_DIR: join(repo, ".km") })
      .quiet()
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
      exitCode: result.exitCode,
    }
  } catch (error: unknown) {
    const err = error as { stdout?: Buffer; stderr?: Buffer; exitCode?: number }
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exitCode: err.exitCode ?? 1,
    }
  }
}

describe("isAgentSlotRef", () => {
  test("matches @agent/<N> for single and multi-digit slots", () => {
    expect(isAgentSlotRef("@agent/0")).toBe(true)
    expect(isAgentSlotRef("@agent/9")).toBe(true)
    expect(isAgentSlotRef("@agent/12")).toBe(true)
  })

  test("rejects bare names, other sigils, and malformed refs", () => {
    expect(isAgentSlotRef("agent/0")).toBe(false)
    expect(isAgentSlotRef("@agent")).toBe(false)
    expect(isAgentSlotRef("@agent/")).toBe(false)
    expect(isAgentSlotRef("@agent/foo")).toBe(false)
    expect(isAgentSlotRef("Code Assistant")).toBe(false)
  })
})

describe("composeSessionBrief", () => {
  test("includes persona body, env block, and slot ref", () => {
    const brief = composeSessionBrief({
      slotRef: "@agent/3",
      vaultRoot: "/tmp/vault",
      personaBody: "You are the silvery engineer.",
      timestamp: "2026-05-06T00:00:00.000Z",
    })

    expect(brief).toContain("<persona>")
    expect(brief).toContain("You are the silvery engineer.")
    expect(brief).toContain("</persona>")
    expect(brief).toContain("<env>")
    expect(brief).toContain("TRIBE_NAME=@agent/3")
    expect(brief).toContain("KM_AGENT_SLOT=@agent/3")
    expect(brief).toContain("KM_VAULT_ROOT=/tmp/vault")
    expect(brief).toContain("</env>")
    expect(brief).toContain("@agent/3")
  })

  test("uses placeholder when persona body is empty", () => {
    const brief = composeSessionBrief({
      slotRef: "@agent/7",
      vaultRoot: "/tmp/vault",
      personaBody: "",
      timestamp: "2026-05-06T00:00:00.000Z",
    })
    expect(brief).toContain("(empty persona — slot @agent/7 has no body content)")
  })
})

describe("buildExecCommand", () => {
  test("silvercode default: --system-prompt-file + --working-dir", () => {
    const exec = buildExecCommand({ agent: "silvercode", briefPath: "/tmp/b.md", vaultRoot: "/tmp/v" })
    expect(exec.cmd).toBe("silvercode")
    expect(exec.args).toEqual(["--system-prompt-file", "/tmp/b.md", "--working-dir", "/tmp/v"])
  })

  test("claude: --append-system-prompt + --cwd", () => {
    const exec = buildExecCommand({ agent: "claude", briefPath: "/tmp/b.md", vaultRoot: "/tmp/v" })
    expect(exec.cmd).toBe("claude")
    expect(exec.args[0]).toBe("--append-system-prompt")
    expect(exec.args[2]).toBe("--cwd")
    expect(exec.args[3]).toBe("/tmp/v")
  })

  test("pi and headless-acp emit TODO notes", () => {
    const pi = buildExecCommand({ agent: "pi", briefPath: "/tmp/b.md", vaultRoot: "/tmp/v" })
    expect(pi.note).toMatch(/TODO/)
    const acp = buildExecCommand({ agent: "headless-acp", briefPath: "/tmp/b.md", vaultRoot: "/tmp/v" })
    expect(acp.note).toMatch(/TODO/)
  })
})

describe("km agent spawn @agent/<N> --dry-run", () => {
  test("prints the brief + planned exec without claiming or spawning", async () => {
    const repo = freshRepoWithSlot(3, "Slot 3 persona — silvery engineer.")
    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    // Capture the slot file before the dry-run so we can prove no mutation.
    const slotPath = join(repo, "@agent", "3.md")
    const before = readFileSync(slotPath, "utf-8")

    const result = await km(repo, ["agent", "spawn", "@agent/3", "--dry-run"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)

    // Brief content surfaces in stdout.
    expect(result.stdout).toContain("[dry-run]")
    expect(result.stdout).toContain("@agent/3")
    expect(result.stdout).toContain("<persona>")
    expect(result.stdout).toContain("Slot 3 persona — silvery engineer.")
    expect(result.stdout).toContain("TRIBE_NAME=@agent/3")
    expect(result.stdout).toContain("KM_AGENT_SLOT=@agent/3")
    expect(result.stdout).toContain("KM_VAULT_ROOT=")
    // Planned exec line surfaces.
    expect(result.stdout).toContain("silvercode")
    expect(result.stdout).toContain("--system-prompt-file")

    // Invariant: slot file unchanged (no claim happened).
    const after = readFileSync(slotPath, "utf-8")
    expect(after).toBe(before)
  })

  test("--agent claude composes the claude exec form", async () => {
    const repo = freshRepoWithSlot(1)
    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    const result = await km(repo, ["agent", "spawn", "@agent/1", "--dry-run", "--agent", "claude"])
    expect(result.exitCode, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain("agent=claude")
    expect(result.stdout).toContain("claude")
    expect(result.stdout).toContain("--append-system-prompt")
  })

  test("errors clearly when @agent/N doesn't exist", async () => {
    const repo = freshRepoWithSlot(0) // only slot 0 scaffolded
    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    const result = await km(repo, ["agent", "spawn", "@agent/8", "--dry-run"])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("Slot not found")
    expect(result.stderr).toContain("@agent/8")
  })

  test("errors clearly when slot is already claimed (non-dry-run)", async () => {
    const repo = freshRepoWithSlot(2)
    const sync = await km(repo, ["sync"])
    expect(sync.exitCode, sync.stderr || sync.stdout).toBe(0)

    // Pre-claim the slot via the canonical lifecycle path so the planClaim
    // stop-gap reports "already claimed by <other>".
    const claim = await km(repo, ["task", "claim", "@agent/2"])
    expect(claim.exitCode, claim.stderr || claim.stdout).toBe(0)

    // Now attempt a slot spawn under a different actor identity.
    // We fake actor by overriding TRIBE_NAME so defaultActor() picks a fresh one.
    const result = await $`bun ${CLI_PATH} agent spawn @agent/2`
      .cwd(repo)
      .env({
        ...process.env,
        KM_DIR: join(repo, ".km"),
        TRIBE_NAME: "claude:other-session",
      })
      .quiet()
      .nothrow()
    expect(result.exitCode).not.toBe(0)
    const stderr = result.stderr.toString()
    expect(stderr).toContain("claim failed")
    expect(stderr).toContain("held by")
  }, 30000)
})
