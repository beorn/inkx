/**
 * Notification wire-bytes verification — Phase 2 of
 * `apps/silvercode/docs/channels.md`.
 *
 * # Scope (read this before changing the test)
 *
 * silvercode does NOT speak HTTP to provider APIs. The "wire" silvercode
 * controls is the **ACP JSON-RPC `prompt` call** sent over stdio to the
 * spawned ACP server child (`@zed-industries/codex-acp`,
 * `@google/gemini-cli --acp`, `pi-acp`, `copilot`, or silvercode's own
 * `@km/claude-acp` wrapper). The provider HTTP body — Anthropic Messages
 * `system` + `messages[]`, OpenAI Responses `messages[].role:"developer"`,
 * Gemini `systemInstruction` — is constructed *inside* the spawned
 * subprocess. Silvercode does not own those subprocesses; routing within
 * them is each upstream's responsibility.
 *
 * What silvercode owns end-to-end is the boundary between the user's
 * UI text and the ACP `prompt` content array. Phase 2's wire-byte test
 * therefore asserts:
 *
 *   1. Notification events emitted from the silvercode boundary
 *      (`assembleAcpPrompt(...)`) arrive at the ACP server side as a
 *      structurally-distinct `type: "resource"` ContentBlock with
 *      `resource.uri` matching `notification://...`. They do NOT arrive
 *      flattened into the user's `type: "text"` block.
 *   2. The user text arrives as its own `type: "text"` block with the
 *      exact bytes the user typed. The notification payload does NOT appear
 *      anywhere in any text block on the wire.
 *   3. Every backend the registry resolves treats this routing
 *      identically (the registry adds spawn args, but the wire shape
 *      flowing to `agent.prompt(...)` is the same `ContentBlock[]` for
 *      every backend — the test verifies that uniformity).
 *
 * If any backend's adapter were to flatten EmbeddedResource into user-role
 * text on the wire (e.g. concatenate notification bodies into a single text
 * block before calling `agent.prompt`), this test would fail at
 * assertion 1. None do today — the harness passes the typed
 * `ContentBlock[]` straight through. This test is the regression guard
 * that keeps it that way.
 *
 * # Why these payloads
 *
 * Sample notification content reads "peer alice opened PR #42" and "CI passed"
 * — benign factual strings deliberately containing zero role-prefix
 * trigger tokens (per the content-quarantine discipline in
 * `apps/silvercode/docs/channels.md` §9). The user text is "continue", the
 * smallest plausible directive that lets us verify clean separation
 * without giving the test fixtures any other meaningful surface.
 *
 * Bead: `km-silvercode.notification-phase-2-adapter-wire`.
 */

import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import { createScope } from "@silvery/scope"
import { afterEach, describe, expect, test } from "vitest"
import {
  type AcpRegistryId,
  type AcpSpawn,
  type AcpSpawnedChild,
  __setAcpSpawnForTesting,
  connectAcpRegistry,
} from "../src/acp-client.ts"
import { assembleAcpPrompt, notificationUri, NOTIFICATION_FRAMING_PREFIX } from "../../../src/prompt-assembly.ts"
import type { ChannelEvent, ChannelQueue } from "../../../src/channel-queue.ts"

// ---------------------------------------------------------------------------
// In-memory ACP-server spawn harness — captures the wire-shape of every
// `agent.prompt(...)` call the parent makes. Mirrors the harness in
// `acp-client.test.ts` and `registry-adapters.test.ts` but exposes the
// captured prompt content for assertion.
// ---------------------------------------------------------------------------

interface PromptCapture {
  /** Each entry is the `prompt` field of one `agent.prompt(params)` call. */
  prompts: acp.ContentBlock[][]
}

function createCapturingAcpServer(): { spawn: AcpSpawn; capture: PromptCapture } {
  const capture: PromptCapture = { prompts: [] }

  const spawn: AcpSpawn = (_command, _args, _options) => {
    const parentToServer = pair()
    const serverToParent = pair()

    const serverWritable = Writable.toWeb(serverToParent.writable as Writable) as WritableStream<Uint8Array>
    const serverReadable = Readable.toWeb(parentToServer.readable as Readable) as unknown as ReadableStream<Uint8Array>
    const serverStream = acp.ndJsonStream(serverWritable, serverReadable)

    void new acp.AgentSideConnection(
      () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-wire-test" }
        },
        async authenticate() {
          return {}
        },
        async prompt({ prompt }) {
          // Snapshot a structural clone so subsequent mutation by the SDK
          // (if any) cannot affect what the test asserts.
          capture.prompts.push(JSON.parse(JSON.stringify(prompt)) as acp.ContentBlock[])
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
      serverStream,
    )

    const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = []
    const child = {
      pid: 31415,
      stdin: parentToServer.writable,
      stdout: serverToParent.readable,
      stderr: new Readable({
        read() {
          this.push(null)
        },
      }),
      kill(signal?: NodeJS.Signals | number): boolean {
        const s = typeof signal === "string" ? signal : ("SIGTERM" as NodeJS.Signals)
        try {
          parentToServer.writable.end()
        } catch {
          /* ignore */
        }
        try {
          serverToParent.writable.end()
        } catch {
          /* ignore */
        }
        process.nextTick(() => {
          for (const fn of exitListeners) fn(0, s)
        })
        return true
      },
      on(event: string, listener: (...args: unknown[]) => void): unknown {
        if (event === "exit") {
          exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void)
        }
        return child
      },
    }
    return child as unknown as AcpSpawnedChild
  }

  return { spawn, capture }
}

function pair(): { readable: Readable; writable: Writable } {
  const readable = new Readable({
    read() {
      // pull-driven; data arrives via writable.write below
    },
  })
  const writable = new Writable({
    write(chunk: Buffer, _enc, cb) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      readable.push(buf)
      cb()
    },
    final(cb) {
      readable.push(null)
      cb()
    },
  })
  return { readable, writable }
}

// ---------------------------------------------------------------------------
// Channel-queue test double — minimal shape needed by `assembleAcpPrompt`.
// Production queue lives at apps/silvercode/src/channel-queue.ts; this stub
// avoids pulling its full state-machine + scope wiring into the test.
// ---------------------------------------------------------------------------

function makeQueueWith(events: ChannelEvent[]): ChannelQueue {
  let buf = [...events]
  const stub: Partial<ChannelQueue> = {
    drain(): ChannelEvent[] {
      const out = buf
      buf = []
      return out
    },
    drainWhere(pred: (e: ChannelEvent) => boolean): ChannelEvent[] {
      const out = buf.filter(pred)
      buf = buf.filter((e) => !pred(e))
      return out
    },
  }
  return stub as ChannelQueue
}

// ---------------------------------------------------------------------------
// Fixtures — benign, zero-trigger-token payloads (see header comment).
// ---------------------------------------------------------------------------

const NOTIFICATION_BODY = "peer alice opened PR #42"
const USER_TEXT = "continue"

function notificationEvent(): ChannelEvent {
  return {
    id: "evt-001",
    source: "tribe",
    timestamp: 1_700_000_000_000,
    content: NOTIFICATION_BODY,
  } as ChannelEvent
}

// All registry-resolved backends silvercode supports today. The adapter wire
// silvercode controls is identical for each; the test asserts that uniformity.
//
// `claude-code` resolves to the in-tree `@km/claude-acp` wrapper bin, but the
// in-memory harness ignores the spawn command — only the JSON-RPC stream
// shape matters. So all five share the same test body.
const REGISTRY_IDS: AcpRegistryId[] = ["codex", "gemini", "pi-acp", "github-copilot-cli", "claude-code"]

afterEach(() => {
  __setAcpSpawnForTesting(null)
})

// ---------------------------------------------------------------------------
// Per-backend wire-bytes assertion
// ---------------------------------------------------------------------------

describe("notification wire-bytes — every backend routes notification as resource ContentBlock, never as user text", () => {
  for (const id of REGISTRY_IDS) {
    test(`${id}: assembleAcpPrompt → agent.prompt wire shape`, async () => {
      const { spawn, capture } = createCapturingAcpServer()
      __setAcpSpawnForTesting(spawn)

      await using scope = createScope(`test-notification-wire-${id}`)
      const session = await connectAcpRegistry(scope, id, { cwd: "/tmp/wire-test" })

      // Build the prompt the same way silvercode's controller does — through
      // assembleAcpPrompt with autoInject so the queued notification event is
      // routed as a typed EmbeddedResource block, not flattened into text.
      const queue = makeQueueWith([notificationEvent()])
      const blocks = assembleAcpPrompt(USER_TEXT, queue, { autoInject: true })

      await session.prompt(blocks)

      // ----- Structural assertions -----
      expect(capture.prompts).toHaveLength(1)
      const wire = capture.prompts[0]!
      expect(wire).toHaveLength(2) // [resource, text]

      const notificationBlock = wire[0]!
      const userBlock = wire[1]!

      // 1. Notification lands in `type: "resource"` (EmbeddedResource), not text.
      expect(notificationBlock.type).toBe("resource")
      if (notificationBlock.type !== "resource") throw new Error("unreachable")
      // The resource carries `text` (TextResourceContents) with the framing
      // prefix prepended. URI is the canonical notification:// scheme.
      const resource = notificationBlock.resource
      expect(resource.uri).toBe(notificationUri("tribe", "evt-001"))
      expect("text" in resource ? resource.text : "").toContain(NOTIFICATION_BODY)
      expect("text" in resource ? resource.text : "").toContain(NOTIFICATION_FRAMING_PREFIX)

      // 2. User text lands in its own `type: "text"` block, byte-for-byte.
      expect(userBlock.type).toBe("text")
      if (userBlock.type !== "text") throw new Error("unreachable")
      expect(userBlock.text).toBe(USER_TEXT)

      // 3. Notification payload does NOT appear in the user-text block. This is
      //    the load-bearing assertion — if any adapter flattened notification
      //    into role-U text, NOTIFICATION_BODY would show up here.
      expect(userBlock.text).not.toContain(NOTIFICATION_BODY)
      expect(userBlock.text).not.toContain(NOTIFICATION_FRAMING_PREFIX)

      // 4. No other text block on the wire carries the notification payload —
      //    even if the wire shape were extended with extra blocks later, the
      //    invariant "notification bytes never inhabit a text ContentBlock" must
      //    hold.
      for (const block of wire) {
        if (block.type === "text") {
          expect(block.text).not.toContain(NOTIFICATION_BODY)
        }
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Sanity: the boundary itself routes notification correctly even with no autoInject
// (i.e. the `[text]`-only path leaks nothing). This pins the boundary shape so
// a future controller change can't silently bypass routing by skipping
// assembleAcpPrompt.
// ---------------------------------------------------------------------------

describe("notification wire-bytes — boundary invariants", () => {
  test("autoInject:false → only user text on the wire (no notification leak)", async () => {
    const { spawn, capture } = createCapturingAcpServer()
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-notification-wire-no-inject")
    const session = await connectAcpRegistry(scope, "codex", { cwd: "/tmp/wire-test" })

    const queue = makeQueueWith([notificationEvent()])
    const blocks = assembleAcpPrompt(USER_TEXT, queue, { autoInject: false })

    await session.prompt(blocks)

    expect(capture.prompts).toHaveLength(1)
    const wire = capture.prompts[0]!
    expect(wire).toHaveLength(1)
    expect(wire[0]!.type).toBe("text")
    if (wire[0]!.type === "text") {
      expect(wire[0]!.text).toBe(USER_TEXT)
      expect(wire[0]!.text).not.toContain(NOTIFICATION_BODY)
    }
  })

  test("multiple notification events all route as resource, none flatten to text", async () => {
    const { spawn, capture } = createCapturingAcpServer()
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-notification-wire-multi")
    const session = await connectAcpRegistry(scope, "gemini", { cwd: "/tmp/wire-test" })

    const events: ChannelEvent[] = [
      { id: "e1", source: "tribe", timestamp: 1, content: NOTIFICATION_BODY } as ChannelEvent,
      { id: "e2", source: "ci", timestamp: 2, content: "CI passed" } as ChannelEvent,
    ]
    const queue = makeQueueWith(events)
    const blocks = assembleAcpPrompt(USER_TEXT, queue, { autoInject: true })

    await session.prompt(blocks)

    const wire = capture.prompts[0]!
    expect(wire).toHaveLength(3)
    expect(wire[0]!.type).toBe("resource")
    expect(wire[1]!.type).toBe("resource")
    expect(wire[2]!.type).toBe("text")
    if (wire[2]!.type === "text") {
      expect(wire[2]!.text).toBe(USER_TEXT)
      expect(wire[2]!.text).not.toContain(NOTIFICATION_BODY)
      expect(wire[2]!.text).not.toContain("CI passed")
    }
  })
})
