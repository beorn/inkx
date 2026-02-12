import type { CommandDef, CommandCategory } from "./types.ts"

/**
 * Command Registry interface.
 *
 * Manages command definitions for lookup and filtering.
 * Use createCommandRegistry() to create instances.
 */
export interface CommandRegistry {
  /** Register a single command */
  register(cmd: CommandDef): void
  /** Register multiple commands */
  registerAll(cmds: CommandDef[]): void
  /** Get a command by ID */
  get(id: string): CommandDef | undefined
  /** Get all registered commands */
  getAll(): CommandDef[]
  /** Get commands grouped by category */
  getByCategory(): Map<CommandCategory, CommandDef[]>
  /** Filter commands by fuzzy matching query */
  filter(query: string): CommandDef[]
  /** Clear all registered commands */
  clear(): void
}

/**
 * Create a new command registry instance.
 *
 * Each instance maintains its own command map, enabling test isolation.
 */
export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CommandDef>()

  return {
    register(cmd: CommandDef): void {
      commands.set(cmd.id, cmd)
    },

    registerAll(cmds: CommandDef[]): void {
      for (const cmd of cmds) {
        commands.set(cmd.id, cmd)
      }
    },

    get(id: string): CommandDef | undefined {
      return commands.get(id)
    },

    getAll(): CommandDef[] {
      return Array.from(commands.values())
    },

    getByCategory(): Map<CommandCategory, CommandDef[]> {
      const byCategory = new Map<CommandCategory, CommandDef[]>()
      for (const cmd of commands.values()) {
        const list = byCategory.get(cmd.category) || []
        list.push(cmd)
        byCategory.set(cmd.category, list)
      }
      return byCategory
    },

    filter(query: string): CommandDef[] {
      if (!query) return this.getAll()
      return this.getAll().filter(
        (cmd) => fuzzyMatch(query, cmd.name) || fuzzyMatch(query, cmd.description) || fuzzyMatch(query, cmd.id),
      )
    },

    clear(): void {
      commands.clear()
    },
  }
}

/** Fuzzy match query against target string */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// Default registry instance for backward compatibility
const defaultRegistry = createCommandRegistry()

// Legacy API - delegates to default registry
export function registerCommand(cmd: CommandDef): void {
  defaultRegistry.register(cmd)
}

export function registerCommands(cmds: CommandDef[]): void {
  defaultRegistry.registerAll(cmds)
}

export function getCommand(id: string): CommandDef | undefined {
  return defaultRegistry.get(id)
}

export function getAllCommands(): CommandDef[] {
  return defaultRegistry.getAll()
}

export function getCommandsByCategory(): Map<CommandCategory, CommandDef[]> {
  return defaultRegistry.getByCategory()
}

export function filterCommands(query: string): CommandDef[] {
  return defaultRegistry.filter(query)
}

export function clearRegistry(): void {
  defaultRegistry.clear()
}
