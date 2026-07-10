/**
 * @silvery/command — the platform-neutral command model.
 *
 * Two layers, one package:
 *
 * - Serializable substrate (`serializable.ts`): pure-data commands, trees,
 *   registries, and `{op, args}` operations. Everything is JSON; behavior
 *   belongs to runtime adapters.
 * - Command nodes (`command-tree.ts`): the substrate plus behavior —
 *   `run`, `isAvailable`, param schemas, and invocation resolution — still
 *   free of any UI or platform dependency.
 *
 * UI/application integration (keybindings, app plugins) lives in the private
 * `@silvery/commands` adapter package, which re-exports this surface.
 */

// Serializable substrate — pure data
export {
  command,
  createCommandRegistry,
  defineCommands,
  flattenCommandTree,
  isCommand,
  type Command,
  type CommandDefinition,
  type CommandEntry,
  type CommandMetadata,
  type CommandRegistry,
  type CommandTree,
  type JsonObject,
  type JsonValue,
  type Operation,
} from "./serializable.ts"

// Command nodes — substrate + behavior, still platform-neutral
export {
  commandNode,
  defineCommandNodes,
  flattenCommandNodes,
  isCommandNode,
  resolveInvocation,
  type Availability,
  type CommandNode,
  type CommandNodeTree,
  type FlattenedCommand,
  type Invocation,
  type ParamSchema,
  type ParseParamSchema,
  type StandardParamSchema,
} from "./command-tree.ts"
