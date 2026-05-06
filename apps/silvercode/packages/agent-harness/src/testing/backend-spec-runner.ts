/**
 * Backend spec runner.
 *
 * Specs run against provider-injected backends. Fake targets are ordinary
 * `AgentBackend` objects whose `connect()` injects an in-process ACP fake;
 * live targets use the same provider shape without test globals.
 */

import type * as acp from "@agentclientprotocol/sdk"
import { createScope, type Scope } from "@silvery/scope"
import type { AcpSetSessionConfigOptionParams } from "../acp-client.ts"
import type { AgentBackend, AgentBackendConnectOptions, AgentBackendId, AgentConnection } from "../agent-backends.ts"
import type { AgentEvent, SessionId } from "../events.ts"
import type { FakeAcpBackendController } from "./fake-acp-server.ts"

export type AgentBackendSpecMode = "fake" | "live"

export type AgentBackendSpecTarget = {
  readonly mode: AgentBackendSpecMode
  readonly backend: AgentBackend
  readonly controller?: FakeAcpBackendController
  readonly cwd?: string
  readonly connect?: AgentBackendConnectOptions
}

export type AgentBackendSpecTargets = {
  readonly fake: readonly AgentBackendSpecTarget[]
  readonly live?: readonly AgentBackendSpecTarget[]
}

export type AgentBackendSpecContext = {
  readonly mode: AgentBackendSpecMode
  readonly backend: AgentBackend
  readonly scope: Scope
  readonly conn: AgentConnection
  readonly controller?: FakeAcpBackendController
}

export type AgentBackendSpecResult = {
  readonly mode: AgentBackendSpecMode
  readonly backendId: AgentBackendId
  readonly sessionId: SessionId
}

export type AgentBackendSpecEnv = {
  readonly SILVERCODE_BACKEND_CONTRACT?: string
  readonly SILVERCODE_BACKENDS?: string
}

export type ConfigOptionRoundTripSpec = {
  readonly configId: string
  readonly category?: string
  readonly initialValue: string | boolean
  readonly nextValue: string | boolean
}

export type PromptRoundTripSpec = {
  readonly prompt: string
  readonly expectedText?: string
}

export function agentBackendSpecTargetsForEnv(
  targets: AgentBackendSpecTargets,
  env: AgentBackendSpecEnv = process.env as AgentBackendSpecEnv,
): AgentBackendSpecTarget[] {
  const selected = new Set(parseBackendIds(env.SILVERCODE_BACKENDS))
  const include = (target: AgentBackendSpecTarget): boolean => selected.size === 0 || selected.has(target.backend.id)
  const out = targets.fake.filter(include)
  if (env.SILVERCODE_BACKEND_CONTRACT === "live") out.push(...(targets.live ?? []).filter(include))
  return out
}

export async function runAgentBackendSpec(
  target: AgentBackendSpecTarget,
  spec: (ctx: AgentBackendSpecContext) => Promise<void> | void,
): Promise<AgentBackendSpecResult> {
  const scope = createScope(`backend-spec-${target.mode}-${target.backend.id}`)
  try {
    const conn = await target.backend.connect(scope, {
      cwd: target.cwd ?? process.cwd(),
      ...target.connect,
    })
    await spec({
      mode: target.mode,
      backend: target.backend,
      scope,
      conn,
      controller: target.controller,
    })
    return {
      mode: target.mode,
      backendId: target.backend.id,
      sessionId: conn.sessionId,
    }
  } finally {
    await scope[Symbol.asyncDispose]()
  }
}

export async function assertPromptRoundTrip(ctx: AgentBackendSpecContext, spec: PromptRoundTripSpec): Promise<void> {
  const events: AgentEvent[] = []
  const unsubscribe = ctx.conn.subscribe((event) => events.push(event))
  try {
    const response = await ctx.conn.prompt([{ type: "text", text: spec.prompt }])
    if (response.stopReason !== "end_turn") {
      throw new Error(`${ctx.backend.id}: prompt stopped with ${String(response.stopReason)}`)
    }
  } finally {
    unsubscribe()
  }

  const text = events.flatMap((event) => (event.kind === "text-delta" ? [event.text] : [])).join("")
  if (text.length === 0) throw new Error(`${ctx.backend.id}: prompt produced no text-delta events`)
  if (spec.expectedText !== undefined && text !== spec.expectedText) {
    throw new Error(
      `${ctx.backend.id}: expected prompt text ${JSON.stringify(spec.expectedText)}, got ${JSON.stringify(text)}`,
    )
  }
}

export async function assertConfigOptionRoundTrip(
  ctx: AgentBackendSpecContext,
  spec: ConfigOptionRoundTripSpec,
): Promise<void> {
  const initial = findConfigOption(ctx.conn.configOptions, spec.configId)
  if (spec.category !== undefined && initial.category !== spec.category) {
    throw new Error(
      `${ctx.backend.id} ${spec.configId}: expected category ${spec.category}, got ${String(initial.category)}`,
    )
  }

  const initialValue = currentConfigValue(initial)
  if (initialValue !== spec.initialValue) {
    throw new Error(
      `${ctx.backend.id} ${spec.configId}: expected initial value ${String(spec.initialValue)}, got ${String(initialValue)}`,
    )
  }

  const params: AcpSetSessionConfigOptionParams =
    typeof spec.nextValue === "boolean"
      ? { configId: spec.configId, type: "boolean", value: spec.nextValue }
      : { configId: spec.configId, value: spec.nextValue }
  const response = await ctx.conn.setSessionConfigOption(params)

  const returned = findConfigOption(response.configOptions, spec.configId)
  const conn = findConfigOption(ctx.conn.configOptions, spec.configId)
  if (currentConfigValue(returned) !== spec.nextValue) {
    throw new Error(`${ctx.backend.id} ${spec.configId}: response did not carry updated value`)
  }
  if (currentConfigValue(conn) !== spec.nextValue) {
    throw new Error(`${ctx.backend.id} ${spec.configId}: connection did not retain updated value`)
  }
}

function parseBackendIds(value: string | undefined): AgentBackendId[] {
  if (!value) return []
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is AgentBackendId => part.length > 0)
}

function findConfigOption(options: acp.SessionConfigOption[], configId: string): acp.SessionConfigOption {
  const option = options.find((item) => item.id === configId)
  if (!option) throw new Error(`missing config option ${configId}`)
  return option
}

function currentConfigValue(option: acp.SessionConfigOption): string | boolean {
  return option.currentValue
}
