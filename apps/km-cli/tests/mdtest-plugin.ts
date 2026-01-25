// mdtest plugin for km CLI - in-process command execution
// Enables fast testing without subprocess overhead

import type {
  Plugin,
  PluginFactory,
  FileOpts,
  BlockOpts,
} from "../../../vendor/beorn-mdtest/src/types.js";

/**
 * km CLI mdtest plugin
 * Executes km commands in-process for fast testing
 */
export default function kmPlugin(opts: FileOpts): Plugin {
  // TODO: Implement in-process execution
  // For now, return null to fall back to bash
  // This will be implemented in Phase 4-5

  return {
    block(opts: BlockOpts) {
      // Only handle console blocks
      if (opts.type !== "console") return null;

      // Parse commands to check if all are km commands
      const lines = opts.content.split("\n");
      const commands = lines
        .filter((l) => l.startsWith("$"))
        .map((l) => l.slice(1).trim());

      // Check if all commands start with 'km '
      const hasKmCommands = commands.some((c) => c.startsWith("km "));
      const hasOtherCommands = commands.some((c) => !c.startsWith("km "));

      // Only handle pure km command blocks
      if (!hasKmCommands) return null;

      // For mixed commands, fall back to bash
      if (hasOtherCommands) return null;

      // TODO: Return in-process executor
      // For now, fall back to bash
      return null;
    },
  };
}
