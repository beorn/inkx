/**
 * Shared backend contract runner.
 *
 * Contract tests should put assertions here, not in backend-specific test
 * bodies. The same assertion can then run against deterministic fake targets
 * by default and live targets when `SILVERCODE_BACKEND_CONTRACT=live`.
 */

import type * as acp from "@agentclientprotocol/sdk"
import { createScope, type Scope } from "@silvery/scope"
import {
  __setAcpSpawnForTesting,
  connectAcpRegistry,
  type AcpAgentSession,
  type AcpConnectOpts,
  type AcpRegistryId,
  type AcpSetSessionConfigOptionParams,
  type AcpSpawn,
} from "../acp-client.ts"
import type { SessionId } from "../events.ts"
import type { FakeAcpBackendController } from "./fake-acp-server.ts"

export type AcpBackendContractMode = "fake" | "live"

export interface FakeAcpBackendContractTarget {
  readonly mode: "fake"
  readonly registryId: AcpRegistryId
  readonly spawn: AcpSpawn
  readonly backend?: FakeAcpBackendController
  readonly cwd?: string
  readonly connect?: Partial<AcpConnectOpts>
}

export interface LiveAcpBackendContractTarget {
  readonly mode: "live"
  readonly registryId: AcpRegistryId
  readonly cwd?: string
  readonly connect?: Partial<AcpConnectOpts>
}

export type AcpBackendContractTarget = FakeAcpBackendContractTarget | LiveAcpBackendContractTarget

export interface AcpBackendContractTargets {
  readonly fake: readonly FakeAcpBackendContractTarget[]
  readonly live?: readonly LiveAcpBackendContractTarget[]
}

export interface AcpBackendContractContext {
  readonly mode: AcpBackendContractMode
  readonly registryId: AcpRegistryId
  readonly scope: Scope
  readonly session: AcpAgentSession
  readonly backend?: FakeAcpBackendController
}

export interface AcpBackendContractResult {
  readonly mode: AcpBackendContractMode
  readonly registryId: AcpRegistryId
  readonly sessionId: SessionId
}

export interface ConfigOptionRoundTripContract {
  readonly configId: string
  readonly category?: string
  readonly initialValue: string | boolean
  readonly nextValue: string | boolean
}

export interface AcpBackendContractEnv {
  readonly SILVERCODE_BACKEND_CONTRACT?: string
}

export function acpBackendContractTargetsForEnv(
  targets: AcpBackendContractTargets,
  env: AcpBackendContractEnv = process.env as AcpBackendContractEnv,
): AcpBackendContractTarget[] {
  const selected: AcpBackendContractTarget[] = [...targets.fake]
  if (env.SILVERCODE_BACKEND_CONTRACT === "live") {
    selected.push(...(targets.live ?? []))
  }
  return selected
}

export async function runAcpBackendContract(
  target: AcpBackendContractTarget,
  contract: (ctx: AcpBackendContractContext) => Promise<void> | void,
): Promise<AcpBackendContractResult> {
  const scope = createScope(`acp-contract-${target.mode}-${target.registryId}`)
  if (target.mode === "fake") __setAcpSpawnForTesting(target.spawn)

  try {
    const session = await connectAcpRegistry(scope, target.registryId, {
      cwd: target.cwd ?? process.cwd(),
      ...target.connect,
    })
    await contract({
      mode: target.mode,
      registryId: target.registryId,
      scope,
      session,
      backend: target.mode === "fake" ? target.backend : undefined,
    })
    return {
      mode: target.mode,
      registryId: target.registryId,
      sessionId: session.sessionId,
    }
  } finally {
    try {
      await scope[Symbol.asyncDispose]()
    } finally {
      if (target.mode === "fake") __setAcpSpawnForTesting(null)
    }
  }
}

export async function assertConfigOptionRoundTrip(
  ctx: AcpBackendContractContext,
  contract: ConfigOptionRoundTripContract,
): Promise<void> {
  const initial = findConfigOption(ctx.session.configOptions, contract.configId)
  if (contract.category !== undefined && initial.category !== contract.category) {
    throw new Error(
      `${ctx.registryId} ${contract.configId}: expected category ${contract.category}, got ${String(initial.category)}`,
    )
  }

  const initialValue = currentConfigValue(initial)
  if (initialValue !== contract.initialValue) {
    throw new Error(
      `${ctx.registryId} ${contract.configId}: expected initial value ${String(
        contract.initialValue,
      )}, got ${String(initialValue)}`,
    )
  }

  const params: AcpSetSessionConfigOptionParams =
    typeof contract.nextValue === "boolean"
      ? { configId: contract.configId, type: "boolean", value: contract.nextValue }
      : { configId: contract.configId, value: contract.nextValue }
  const response = await ctx.session.setSessionConfigOption(params)

  const returned = findConfigOption(response.configOptions, contract.configId)
  const handle = findConfigOption(ctx.session.configOptions, contract.configId)
  if (currentConfigValue(returned) !== contract.nextValue) {
    throw new Error(`${ctx.registryId} ${contract.configId}: response did not carry updated value`)
  }
  if (currentConfigValue(handle) !== contract.nextValue) {
    throw new Error(`${ctx.registryId} ${contract.configId}: session handle did not retain updated value`)
  }
}

function findConfigOption(options: acp.SessionConfigOption[], configId: string): acp.SessionConfigOption {
  const option = options.find((item) => item.id === configId)
  if (!option) throw new Error(`missing config option ${configId}`)
  return option
}

function currentConfigValue(option: acp.SessionConfigOption): string | boolean {
  return option.currentValue
}
