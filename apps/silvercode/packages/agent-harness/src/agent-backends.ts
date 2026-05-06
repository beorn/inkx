import type { Scope } from "@silvery/scope"
import {
  ACP_REGISTRY_IDS,
  connectAcpRegistry,
  type AcpAgentSession,
  type AcpConnectOpts,
  type AcpRegistryId,
} from "./acp-client.ts"
import {
  createFakeAcpRegistrySpawn,
  type FakeAcpBackendController,
  type FakeAcpRegistrySpawnOptions,
} from "./testing/fake-acp-server.ts"

export { ACP_REGISTRY_IDS }
export type { AcpRegistryId }

export type AgentBackendId = string
export type AgentConnection = AcpAgentSession

export type AgentBackendConnectOptions = Omit<AcpConnectOpts, "command" | "args"> & {
  /** Registry-specific args appended after the backend's default args. */
  extraArgs?: string[]
}

export type AgentBackend = {
  readonly id: AgentBackendId
  readonly label: string
  readonly protocol: "acp"
  connect(scope: Scope, opts?: AgentBackendConnectOptions): Promise<AgentConnection>
}

export type AgentBackends = ReadonlyMap<AgentBackendId, AgentBackend>
export type AgentBackendInput = Iterable<AgentBackend> | Readonly<Record<string, AgentBackend>>

export type FakeAcpAgentBackend = {
  readonly backend: AgentBackend
  readonly controller: FakeAcpBackendController
}

export type FakeAcpAgentBackends = {
  readonly backends: AgentBackends
  readonly controllers: ReadonlyMap<AcpRegistryId, FakeAcpBackendController>
}

export function createAcpAgentBackend(id: AcpRegistryId, defaults: AgentBackendConnectOptions = {}): AgentBackend {
  return {
    id,
    label: id,
    protocol: "acp",
    connect(scope, opts = {}) {
      return connectAcpRegistry(scope, id, mergeConnectOptions(defaults, opts))
    },
  }
}

export function createAgentBackends(backends: AgentBackendInput): AgentBackends {
  const out = new Map<AgentBackendId, AgentBackend>()
  for (const backend of readBackends(backends)) out.set(backend.id, backend)
  return out
}

export function createAcpAgentBackends(ids: readonly AcpRegistryId[] = ACP_REGISTRY_IDS): AgentBackends {
  return createAgentBackends(ids.map((id) => createAcpAgentBackend(id)))
}

export function createFakeAcpAgentBackend(
  id: AcpRegistryId,
  opts: FakeAcpRegistrySpawnOptions = {},
): FakeAcpAgentBackend {
  const fake = createFakeAcpRegistrySpawn(id, opts)
  return {
    backend: createAcpAgentBackend(id, { spawn: fake.spawn }),
    controller: fake.backend,
  }
}

export function createFakeAcpAgentBackends(opts: FakeAcpRegistrySpawnOptions = {}): FakeAcpAgentBackends {
  const backends: AgentBackend[] = []
  const controllers = new Map<AcpRegistryId, FakeAcpBackendController>()
  for (const id of ACP_REGISTRY_IDS) {
    const fake = createFakeAcpAgentBackend(id, {
      ...opts,
      sessionIdPrefix: opts.sessionIdPrefix ? `${opts.sessionIdPrefix}-${id}` : undefined,
    })
    backends.push(fake.backend)
    controllers.set(id, fake.controller)
  }
  return { backends: createAgentBackends(backends), controllers }
}

function mergeConnectOptions(
  base: AgentBackendConnectOptions,
  override: AgentBackendConnectOptions,
): AgentBackendConnectOptions {
  const extraArgs =
    base.extraArgs || override.extraArgs ? [...(base.extraArgs ?? []), ...(override.extraArgs ?? [])] : undefined
  return {
    ...base,
    ...override,
    env: base.env || override.env ? { ...base.env, ...override.env } : undefined,
    clientCapabilities:
      base.clientCapabilities || override.clientCapabilities
        ? { ...base.clientCapabilities, ...override.clientCapabilities }
        : undefined,
    ...(extraArgs ? { extraArgs } : {}),
  }
}

function readBackends(backends: AgentBackendInput): Iterable<AgentBackend> {
  return Symbol.iterator in backends ? backends : Object.values(backends)
}
