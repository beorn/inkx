import type { CommandDef, CommandCategory } from "./types.ts";

const commands = new Map<string, CommandDef>();

export function registerCommand(cmd: CommandDef): void {
  commands.set(cmd.id, cmd);
}

export function registerCommands(cmds: CommandDef[]): void {
  for (const cmd of cmds) {
    registerCommand(cmd);
  }
}

export function getCommand(id: string): CommandDef | undefined {
  return commands.get(id);
}

export function getAllCommands(): CommandDef[] {
  return Array.from(commands.values());
}

export function getCommandsByCategory(): Map<CommandCategory, CommandDef[]> {
  const byCategory = new Map<CommandCategory, CommandDef[]>();
  for (const cmd of commands.values()) {
    const list = byCategory.get(cmd.category) || [];
    list.push(cmd);
    byCategory.set(cmd.category, list);
  }
  return byCategory;
}

export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function filterCommands(query: string): CommandDef[] {
  if (!query) return getAllCommands();
  return getAllCommands().filter(
    (cmd) =>
      fuzzyMatch(query, cmd.name) ||
      fuzzyMatch(query, cmd.description) ||
      fuzzyMatch(query, cmd.id),
  );
}

export function clearRegistry(): void {
  commands.clear();
}
