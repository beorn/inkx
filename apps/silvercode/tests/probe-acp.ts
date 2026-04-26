#!/usr/bin/env bun
/**
 * Probe: spawn any registered ACP agent (codex, gemini, github-copilot-cli,
 * pi-acp, claude-code) via connectAcpRegistry, send one prompt, dump the
 * SessionUpdate stream, print a summary on completion. Manual smoke-test
 * for ACP wire connectivity per agent.
 *
 * Usage:
 *   bun apps/silvercode/tests/probe-acp.ts <registryId> [prompt] [--resume <sessionId>]
 *
 * Examples:
 *   bun apps/silvercode/tests/probe-acp.ts claude-code 'list files in cwd'
 *   bun apps/silvercode/tests/probe-acp.ts gemini 'hello'
 *   bun apps/silvercode/tests/probe-acp.ts codex 'write hello.ts'
 *   bun apps/silvercode/tests/probe-acp.ts codex 'continue' --resume <sessionId>
 *
 * Permissions: auto-approves the first option ('selected' outcome) so the
 * probe doesn't block on UI. fs/read_text_file + fs/write_text_file are
 * served from the local filesystem (Bun.file).
 *
 * Registry ids:
 *   codex                — npx -y @zed-industries/codex-acp
 *   gemini               — npx -y @google/gemini-cli --experimental-acp
 *   github-copilot-cli   — copilot (binary on PATH)
 *   pi-acp               — npx -y pi-acp
 *   claude-code          — npx -y @km/claude-acp
 *
 * Auth notes:
 *   claude-code: CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in env
 *   codex:       ChatGPT subscription via codex-acp's OAuth flow
 *   gemini:      Sign in with Google (free tier 60/min, 1000/day)
 *   github-copilot-cli: Copilot subscription
 *   pi-acp:      pi config
 */

import {
  AcpResumeUnsupportedError,
  type AcpConnectOpts,
  connectAcp,
  connectAcpRegistry,
  type AcpRegistryId,
} from "@km/agent-harness"
import { createScope } from "@silvery/scope"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const REGISTRY_IDS: AcpRegistryId[] = ["codex", "gemini", "github-copilot-cli", "pi-acp", "claude-code"]

/**
 * Local-resolve overrides for workspace packages that aren't published to npm.
 * `@km/claude-acp` is private; the registry's `npx -y @km/claude-acp` will
 * fail until it's published. While that's pending, point at the local bin
 * via `bun` (the bin uses TS imports — node won't run it without a loader).
 */
const __dir = dirname(fileURLToPath(import.meta.url))
const LOCAL_OVERRIDES: Partial<Record<AcpRegistryId, { command: string; args: string[] }>> = {
  "claude-code": {
    command: "bun",
    args: [resolve(__dir, "../packages/claude-acp/bin/silvercode-claude-acp.js")],
  },
}

function usage(msg?: string): never {
  if (msg) console.error(`error: ${msg}`)
  console.error("usage: bun apps/silvercode/tests/probe-acp.ts <registryId> [prompt]")
  console.error(`registry ids: ${REGISTRY_IDS.join(", ")}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const positional: string[] = []
let resumeSessionId: string | undefined
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === "--resume") {
    resumeSessionId = args[++i]
    if (!resumeSessionId) usage("--resume requires a sessionId argument")
  } else if (a !== undefined) {
    positional.push(a)
  }
}

const registryId = positional[0] as AcpRegistryId | undefined
const userPrompt = positional[1] ?? "Say hello in one short sentence."

if (!registryId) usage("missing <registryId>")
if (!REGISTRY_IDS.includes(registryId)) usage(`unknown registryId: ${registryId}`)

console.log(`[probe] registryId=${registryId}`)
console.log(`[probe] prompt=${JSON.stringify(userPrompt)}`)
if (resumeSessionId) console.log(`[probe] resume=${resumeSessionId}`)

await using scope = createScope("probe-acp")

const eventCounts = new Map<string, number>()
const toolCallSummary = new Map<string, { kind: string; status: string }>()
const startedAt = Date.now()

let session
const baseOpts: Omit<AcpConnectOpts, "command" | "args"> = {
  cwd: process.cwd(),
  sessionCwd: process.cwd(),
  ...(resumeSessionId ? { resume: { sessionId: resumeSessionId } } : {}),
  clientCapabilities: {
    fs: { readTextFile: true, writeTextFile: true },
  },
  fsHandler: {
    async readTextFile({ path }) {
      try {
        const content = await Bun.file(path).text()
        return { content }
      } catch (err) {
        throw new Error(`fs/read_text_file failed for ${path}: ${(err as Error).message}`)
      }
    },
    async writeTextFile({ path, content }) {
      await Bun.write(path, content)
      return {}
    },
  },
  permissionHandler: async (req) => {
    const optionId = req.options[0]?.optionId
    if (!optionId) {
      console.log("[probe] permission requested with no options — cancelling")
      return { outcome: { outcome: "cancelled" } }
    }
    console.log(`[probe] auto-approving permission via option=${optionId} (toolCall=${req.toolCall.toolCallId})`)
    return { outcome: { outcome: "selected", optionId } }
  },
}

// connectAcp's "ACP connection closed" failure mode swallows child stderr —
// pipe stderr to a buffer so we can surface it in error reports.
const stderrBuf: string[] = []
const originalStderrWrite = process.stderr.write.bind(process.stderr)
// We can't easily intercept the child's stderr through connectAcp's API.
// Instead, set silentStderr: false (the default) and listen for "error"
// AgentEvents on the session — those carry the stderr lines. But before
// connection completes, errors only surface as the "ACP connection closed"
// generic. For full diagnostics, the next iteration of connectAcp should
// surface accumulated stderr in the connect-failure error message.
// (Tracked: km-silvercode.acp-connect-stderr-surfacing.)

try {
  const override = LOCAL_OVERRIDES[registryId]
  if (override) {
    console.log(`[probe] using local override: ${override.command} ${override.args.join(" ")}`)
    session = await connectAcp(scope, { ...baseOpts, ...override })
  } else {
    session = await connectAcpRegistry(scope, registryId, baseOpts)
  }
} catch (err) {
  const e = err as Error
  if (e instanceof AcpResumeUnsupportedError) {
    console.error(`[probe] connect failed: ${e.message}`)
    console.error(
      `[probe] hint: agent '${registryId}' does not support session/load (loadSession capability false). Resume is not supported here.`,
    )
    process.exit(4)
  }
  console.error(`[probe] connect failed: ${e.message}`)
  if (e.message.includes("ENOENT") || e.message.includes("not found")) {
    console.error(
      `[probe] hint: the spawn command for '${registryId}' is not on PATH. Check the install instructions for that agent.`,
    )
  }
  if (e.message.includes("connection closed")) {
    console.error(
      `[probe] hint: the child process exited before negotiating ACP — likely auth/install failure. Run the spawn command manually:`,
    )
    if (registryId === "codex") console.error(`  bun x @zed-industries/codex-acp`)
    else if (registryId === "gemini") console.error(`  bun x @google/gemini-cli --experimental-acp`)
    else if (registryId === "pi-acp") console.error(`  bun x pi-acp`)
    else if (registryId === "github-copilot-cli") console.error(`  copilot`)
    else if (registryId === "claude-code") {
      console.error(`  bun apps/silvercode/packages/claude-acp/bin/silvercode-claude-acp.js`)
    }
  }
  process.exit(2)
}

console.log(`[probe] connected. protocolVersion=${session.protocolVersion}`)
console.log(`[probe] sessionId=${session.sessionId}`)
console.log(`[probe] capabilities=${JSON.stringify(session.capabilities)}`)
console.log(`[probe] authMethods=${session.authMethods.map((m) => m.id).join(", ") || "(none)"}`)

session.subscribe((event) => {
  eventCounts.set(event.kind, (eventCounts.get(event.kind) ?? 0) + 1)

  // Spotlight a few interesting events as they arrive.
  if (event.kind === "session-init") {
    console.log(`[event] session-init sessionId=${event.sessionId}`)
  } else if (event.kind === "tool-use") {
    toolCallSummary.set(event.id, { kind: event.name, status: "pending" })
    console.log(`[event] tool-use ${event.name} id=${event.id}`)
  } else if (event.kind === "tool-result") {
    const prior = toolCallSummary.get(event.id)
    if (prior) {
      prior.status = event.is_error ? "failed" : "completed"
    }
    console.log(`[event] tool-result id=${event.id} error=${event.is_error ?? false}`)
  } else if (event.kind === "error") {
    console.log(`[event] ERROR ${String(event.message).slice(0, 200)}`)
  } else if (event.kind === "permission-request") {
    console.log(`[event] permission-request requestId=${event.requestId} tool=${event.tool}`)
  } else if (event.kind === "session-end") {
    console.log(`[event] session-end stopReason=${event.stopReason ?? "(none)"}`)
  }
})

console.log(`[probe] sending prompt`)
let result
try {
  result = await session.prompt([{ type: "text", text: userPrompt }])
} catch (err) {
  console.error(`[probe] prompt failed: ${(err as Error).message}`)
  process.exit(3)
}

const elapsedMs = Date.now() - startedAt

console.log(`\n[probe] DONE stopReason=${result.stopReason} elapsed=${elapsedMs}ms`)
console.log(`[probe] event counts:`)
for (const [kind, count] of [...eventCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${kind.padEnd(24)} ${count}`)
}
if (toolCallSummary.size > 0) {
  console.log(`[probe] tool calls:`)
  for (const [id, info] of toolCallSummary.entries()) {
    console.log(`  ${info.kind.padEnd(20)} ${info.status.padEnd(12)} ${id}`)
  }
}
