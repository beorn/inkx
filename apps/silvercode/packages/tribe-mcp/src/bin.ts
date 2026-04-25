#!/usr/bin/env bun
/**
 * tribe-mcp stdio binary.
 *
 * Reads JSON-RPC requests from stdin, writes responses to stdout, stderr for
 * logs. Spawned per-session by the agent harness via the mcpServers spec.
 *
 * The session name is passed via `TRIBE_SESSION_NAME` env var so the server
 * knows whose outbox to drain and whose identity to use on send.
 *
 * Backend: reads/writes to a JSONL file specified by `TRIBE_BUS_PATH` (default
 * `~/.km/tribe-bus.jsonl`). That gives us a cross-process shared tribe
 * for the common silvercode case where all sessions are siblings under the
 * same silvercode host, without needing a daemon. A daemon-backed adapter
 * (bearly tribe) can replace this later via a BACKEND env var.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import type { Readable, Writable } from "node:stream"
import {
  createTribeMcpServer,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type TribeBackend,
  type TribeMember,
  type TribeMessage,
} from "./index.ts"

const sessionName = process.env.TRIBE_SESSION_NAME ?? "unknown"
const busPath = process.env.TRIBE_BUS_PATH ?? join(homedir(), ".km", "tribe-bus.jsonl")

function ensureBus(): void {
  const dir = dirname(busPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  if (!existsSync(busPath)) writeFileSync(busPath, "")
}

function readAllMessages(): TribeMessage[] {
  try {
    const raw = readFileSync(busPath, "utf8")
    return raw
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => {
        try {
          return JSON.parse(l) as TribeMessage
        } catch {
          return null
        }
      })
      .filter((m): m is TribeMessage => m != null)
  } catch {
    return []
  }
}

function appendMessage(msg: TribeMessage): void {
  ensureBus()
  appendFileSync(busPath, JSON.stringify(msg) + "\n")
}

const fileBackend: TribeBackend = {
  async send(opts): Promise<void> {
    appendMessage({ ...opts, ts: Date.now() })
  },
  async history(opts): Promise<TribeMessage[]> {
    const all = readAllMessages()
    const forSession = opts.forSession
    const visible = all.filter((m) => m.to === "*" || m.to === forSession || m.from === forSession)
    const limit = opts.limit ?? 50
    return visible.slice(-limit)
  },
  async members(): Promise<TribeMember[]> {
    const all = readAllMessages()
    const names = new Set<string>()
    for (const m of all) {
      names.add(m.from)
      if (m.to !== "*") names.add(m.to)
    }
    return Array.from(names).map((n) => ({ name: n, status: "online" }))
  },
}

ensureBus()

const server = createTribeMcpServer(fileBackend, sessionName)

async function run(input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  let buffer = ""
  const decoder = new TextDecoder()
  await new Promise<void>((resolve) => {
    input.on("data", async (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      let idx = buffer.indexOf("\n")
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.length > 0) {
          try {
            const msg = JSON.parse(line) as JsonRpcRequest
            const resp = await server.handle(msg)
            if (resp) output.write(JSON.stringify(resp) + "\n")
          } catch (err) {
            const errResp: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: 0,
              error: { code: -32700, message: `parse error: ${(err as Error).message}` },
            }
            output.write(JSON.stringify(errResp) + "\n")
          }
        }
        idx = buffer.indexOf("\n")
      }
    })
    input.on("end", () => resolve())
    input.on("close", () => resolve())
  })
}

await run()
