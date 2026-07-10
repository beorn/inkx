/**
 * Command tree domain model.
 *
 * This is the platform-neutral command shape shared by runtime command
 * dispatch, keybindings, tests, and future CLI / MCP projection. Nodes carry
 * behavior (`run`, `isAvailable`) on top of the serializable substrate; the
 * substrate itself stays pure data (see `serializable.ts`).
 */

import {
  command as serializableCommand,
  defineCommands as defineSerializableCommands,
  flattenCommandTree as flattenSerializableCommandTree,
  isCommand as isSerializableCommand,
  type Command as SerializableCommand,
  type CommandMetadata as SerializableCommandMetadata,
  type CommandTree as SerializableCommandTree,
} from "./serializable.ts"

export interface ParseParamSchema<TParams> {
  parse(value: unknown): TParams
  missing?(value: unknown): string[]
}

export interface StandardParamSchema<TParams> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor?: string
    readonly validate: (
      value: unknown,
    ) => { readonly value: TParams } | { readonly issues: readonly { readonly message?: string }[] }
    readonly types?: { readonly output: TParams } | undefined
  }
  missing?(value: unknown): string[]
}

export type ParamSchema<TParams> = ParseParamSchema<TParams> | StandardParamSchema<TParams>

type CommandMetadata = SerializableCommandMetadata

export type Availability = boolean | { available: boolean; reason?: string | undefined } | string

export interface CommandNode<TContext = unknown, TParams = void, TResult = unknown> {
  readonly kind: "command"
  title: string
  description?: string | undefined
  params?: ParamSchema<TParams> | undefined
  isAvailable?: ((ctx: TContext) => Availability) | undefined
  run: (ctx: TContext, params: TParams) => TResult | Promise<TResult>
  metadata?: CommandMetadata | undefined
}

export type CommandNodeTree<TContext = unknown> = {
  readonly [segment: string]: CommandNode<TContext, any, any> | CommandNodeTree<TContext>
}

export interface FlattenedCommand<TContext = unknown> {
  id: string
  path: string[]
  command: CommandNode<TContext, any, any>
}

export type Invocation<TParams = unknown> =
  | { state: "ready"; params: TParams }
  | { state: "prompt"; missing: string[] }
  | { state: "unavailable"; reason?: string | undefined }
  | { state: "invalid"; error: unknown }
  | { state: "unknown" }

export function commandNode<TContext = unknown, TParams = void, TResult = unknown>(
  node: Omit<CommandNode<TContext, TParams, TResult>, "kind">,
): CommandNode<TContext, TParams, TResult> {
  const { params, isAvailable, run, ...definition } = node
  return {
    ...serializableCommand(definition),
    ...(params === undefined ? {} : { params }),
    ...(isAvailable === undefined ? {} : { isAvailable }),
    run,
  } as CommandNode<TContext, TParams, TResult>
}

export function defineCommandNodes<TTree extends CommandNodeTree<any>>(tree: TTree): TTree {
  return defineSerializableCommands(tree as SerializableCommandTree) as TTree
}

export function isCommandNode(value: unknown): value is CommandNode<any, any, any> {
  return isSerializableCommand(value) && typeof (value as { run?: unknown }).run === "function"
}

export function flattenCommandNodes<TContext>(
  tree: CommandNodeTree<TContext>,
): FlattenedCommand<TContext>[] {
  return flattenSerializableCommandTree(tree as SerializableCommandTree).map(
    ({ op, path, command }) => ({
      id: op,
      path: [...path],
      command: command as SerializableCommand<any> as CommandNode<TContext, any, any>,
    }),
  )
}

export function resolveInvocation<TContext, TParams>(
  node: CommandNode<TContext, TParams, any> | undefined,
  ctx: TContext,
  partialParams?: unknown,
): Invocation<TParams> {
  if (!node) return { state: "unknown" }

  const availability = normalizeAvailability(node.isAvailable?.(ctx))
  if (availability && !availability.available) {
    return { state: "unavailable", reason: availability.reason }
  }

  if (!node.params) {
    return { state: "ready", params: undefined as TParams }
  }

  const missing = node.params.missing?.(partialParams ?? {})
  if (missing && missing.length > 0) {
    return { state: "prompt", missing }
  }

  try {
    return {
      state: "ready",
      params: parseParams(node.params, partialParams ?? {}),
    }
  } catch (error) {
    return { state: "invalid", error }
  }
}

function normalizeAvailability(
  availability: Availability | undefined,
): { available: boolean; reason?: string | undefined } | undefined {
  if (availability === undefined) return undefined
  if (typeof availability === "boolean") return { available: availability }
  if (typeof availability === "string") return { available: false, reason: availability }
  return availability
}

function parseParams<TParams>(schema: ParamSchema<TParams>, value: unknown): TParams {
  if ("parse" in schema) return schema.parse(value)

  const result = schema["~standard"].validate(value)
  if ("issues" in result) {
    const message = result.issues.map((issue) => issue.message ?? "invalid value").join(", ")
    throw new Error(message)
  }
  return result.value
}
