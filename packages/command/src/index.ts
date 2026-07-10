const commandArgs: unique symbol = Symbol("@silvery/command/args")

type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]
export type JsonObject = { readonly [key: string]: JsonValue }

/** Adapter-owned command policy. The shared substrate only requires JSON data. */
export type CommandMetadata = JsonObject

export interface CommandDefinition {
  readonly title: string
  readonly description?: string
  readonly metadata?: CommandMetadata
}

/** Serializable command metadata. Behavior belongs in a runtime adapter. */
export interface Command<Args extends JsonValue | undefined = undefined> extends CommandDefinition {
  readonly kind: "command"
  readonly [commandArgs]?: Args
}

type AnyCommand = Command<any>
export type CommandTree = {
  readonly [segment: string]: AnyCommand | CommandTree
}

type CommandIn<Tree> =
  Tree extends Command<infer Args>
    ? Command<Args>
    : Tree extends CommandTree
      ? { [Key in keyof Tree]: CommandIn<Tree[Key]> }[keyof Tree]
      : never

type CommandArgs<Value> = Value extends Command<infer Args> ? Args : never

export interface CommandEntry<Value extends AnyCommand = AnyCommand> {
  readonly op: string
  readonly path: readonly string[]
  readonly command: Value
}

export type Operation<Args extends JsonValue | undefined = undefined> = Readonly<
  [Args] extends [undefined] ? { op: string } : { op: string; args: Args }
>

export interface CommandRegistry<Value extends AnyCommand = AnyCommand> {
  readonly entries: readonly CommandEntry<Value>[]
  commandAt(path: string | readonly string[]): Value | undefined
  pathOf(command: Value): readonly string[] | undefined
  operation<Selected extends Value>(
    command: Selected,
    ...args: [CommandArgs<Selected>] extends [undefined] ? [] : [args: CommandArgs<Selected>]
  ): Operation<CommandArgs<Selected>>
}

export function command<Args extends JsonValue | undefined = undefined>(
  definition: CommandDefinition,
): Command<Args> {
  if (typeof definition.title !== "string" || definition.title.length === 0) {
    throw new TypeError("@silvery/command: title must be a non-empty string")
  }
  if (definition.description !== undefined && typeof definition.description !== "string") {
    throw new TypeError("@silvery/command: description must be a string")
  }

  return deepFreeze({
    kind: "command",
    title: definition.title,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    ...(definition.metadata === undefined
      ? {}
      : { metadata: cloneJson(definition.metadata, "metadata") }),
  }) as Command<Args>
}

export function defineCommands<Tree extends CommandTree>(tree: Tree): Tree {
  return tree
}

export function isCommand(value: unknown): value is AnyCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "command" &&
    typeof (value as { title?: unknown }).title === "string"
  )
}

export function flattenCommandTree<Tree extends CommandTree>(
  tree: Tree,
): readonly CommandEntry<CommandIn<Tree>>[] {
  return createCommandRegistry(tree).entries
}

export function createCommandRegistry<Tree extends CommandTree>(
  tree: Tree,
): CommandRegistry<CommandIn<Tree>> {
  type Value = CommandIn<Tree>
  const entries: CommandEntry<Value>[] = []
  const byOp = new Map<string, Value>()
  const byCommand = new WeakMap<AnyCommand, readonly string[]>()

  const walk = (node: CommandTree, parent: readonly string[]): void => {
    assertNamespace(node, parent)
    for (const [segment, value] of Object.entries(node)) {
      assertSegment(segment)
      const path = Object.freeze([...parent, segment])
      if (!isCommand(value)) {
        walk(value as CommandTree, path)
        continue
      }

      const previous = byCommand.get(value)
      if (previous !== undefined) {
        throw new Error(
          `@silvery/command: command '${previous.join(".")}' is already registered; cannot also register '${path.join(".")}'`,
        )
      }
      const op = path.join(".")
      const commandValue = value as Value
      byCommand.set(value, path)
      byOp.set(op, commandValue)
      entries.push(Object.freeze({ op, path, command: commandValue }))
    }
  }

  walk(tree, [])
  const frozenEntries = Object.freeze(entries)

  return Object.freeze({
    entries: frozenEntries,
    commandAt(pathInput: string | readonly string[]) {
      return byOp.get(normalizePath(pathInput).join("."))
    },
    pathOf(commandValue: Value) {
      return byCommand.get(commandValue)
    },
    operation(commandValue: Value, ...args: readonly JsonValue[]) {
      const path = byCommand.get(commandValue)
      if (path === undefined) {
        throw new Error("@silvery/command: command is not registered in this registry")
      }
      const op = path.join(".")
      return deepFreeze(args.length === 0 ? { op } : { op, args: cloneJson(args[0], "args") })
    },
  }) as CommandRegistry<Value>
}

const COMMAND_SEGMENT = /^[A-Za-z][A-Za-z0-9_-]*$/
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

function assertSegment(segment: string): void {
  if (!COMMAND_SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment)) {
    throw new Error(`@silvery/command: invalid command segment '${segment}'`)
  }
}

function normalizePath(path: string | readonly string[]): readonly string[] {
  const segments = typeof path === "string" ? path.split(".") : [...path]
  if (segments.length === 0) throw new Error("@silvery/command: command path must not be empty")
  for (const segment of segments) assertSegment(segment)
  return segments
}

function assertNamespace(value: unknown, path: readonly string[]): asserts value is CommandTree {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(
      `@silvery/command: '${path.join(".") || "<root>"}' must be a command namespace`,
    )
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`@silvery/command: '${path.join(".") || "<root>"}' must be a plain object`)
  }
}

function cloneJson(value: unknown, label: string): JsonValue {
  try {
    const encoded = JSON.stringify(value, (_key, child: unknown) => {
      const type = typeof child
      if (
        child === undefined ||
        type === "function" ||
        type === "symbol" ||
        type === "bigint" ||
        (type === "number" && !Number.isFinite(child))
      ) {
        throw new TypeError("non-JSON value")
      }
      return child
    })
    if (encoded === undefined) throw new TypeError("non-JSON value")
    return JSON.parse(encoded) as JsonValue
  } catch (cause) {
    throw new TypeError(`@silvery/command: ${label} must be JSON data`, { cause })
  }
}

function deepFreeze<Value>(value: Value): Readonly<Value> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}
