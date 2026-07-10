/**
 * @silvery/commands — Command registry, keymaps, and invocation.
 *
 * Provides the command infrastructure for silvery apps:
 * - Command registry with when() availability guards
 * - Keymap resolution with context-dependent bindings
 * - Plugin composition (withCommands, withKeybindings)
 *
 * The platform-neutral command model (substrate + nodes) lives in
 * @silvery/command; this package re-exports it under its historical names and
 * adds the silvery-app integration layer.
 *
 * @packageDocumentation
 */

// Command model (canonical home: @silvery/command)
export {
  commandNode as command,
  defineCommandNodes as defineCommands,
  flattenCommandNodes as flattenCommandTree,
  isCommandNode,
  resolveInvocation,
  type Availability,
  type CommandMetadata,
  type CommandNode,
  type CommandNodeTree as CommandTree,
  type FlattenedCommand,
  type Invocation,
  type ParamSchema,
  type ParseParamSchema,
  type StandardParamSchema,
} from "@silvery/command"

// Serializable, platform-neutral substrate used by this runtime adapter.
export {
  createCommandRegistry as createCommandTreeRegistry,
  type Command as SerializableCommand,
  type CommandEntry as SerializableCommandEntry,
  type CommandRegistry as SerializableCommandRegistry,
  type JsonObject,
  type JsonValue,
  type Operation,
} from "@silvery/command"

export {
  createCommandRegistry,
  type CommandDefInput,
  type CommandDefs,
} from "./create-command-registry"

// withCommands plugin
export {
  withCommands,
  type CommandableApp,
  type CommandDef,
  type CommandRegistryLike,
  type AppWithCommands,
  type WithCommandsOptions,
} from "./with-commands"

// withKeybindings plugin
export { withKeybindings, type WithKeybindingsOptions } from "./with-keybindings"

// Key parsing (canonical: @silvery/ag/keys)
export { parseHotkey } from "@silvery/ag/keys"
