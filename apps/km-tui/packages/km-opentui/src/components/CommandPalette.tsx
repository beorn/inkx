/**
 * CommandPalette Component
 *
 * Modal dialog for fuzzy search and execution of commands.
 * Shows a search input at top with filtered list of commands below.
 * Commands are grouped by category with keyboard shortcut hints.
 */

import type { CommandDef, CommandCategory } from "@km/sh-app";
import { filterCommands } from "@km/sh-app";

interface CommandPaletteProps {
  query: string;
  selectedIndex: number;
  width: number;
  height: number;
}

export function CommandPalette({
  query,
  selectedIndex,
  width,
  height,
}: CommandPaletteProps) {
  // Center the dialog
  const dialogWidth = Math.min(70, width - 4);
  const dialogHeight = Math.min(25, height - 4);
  const paddingLeft = Math.floor((width - dialogWidth) / 2);
  const paddingTop = Math.floor((height - dialogHeight) / 2);

  // Filter commands by query
  const filteredCommands = filterCommands(query);

  // Content width inside the border (accounting for padding)
  const contentWidth = dialogWidth - 4;

  // Max items to display (reserve space for header, input, hints)
  const maxVisibleItems = Math.max(1, dialogHeight - 6);
  const visibleCommands = filteredCommands.slice(0, maxVisibleItems);

  // Group commands by category for display (only when no query)
  const groupByCategory = !query;
  let displayItems: Array<{
    type: "command" | "category";
    command?: CommandDef;
    category?: CommandCategory;
    index: number;
  }> = [];

  if (groupByCategory && visibleCommands.length > 0) {
    // Build display items with category headers
    let currentCategory: CommandCategory | null = null;
    let cmdIndex = 0;
    for (const cmd of visibleCommands) {
      if (cmd.category !== currentCategory) {
        currentCategory = cmd.category;
        displayItems.push({
          type: "category",
          category: currentCategory,
          index: -1,
        });
      }
      displayItems.push({ type: "command", command: cmd, index: cmdIndex });
      cmdIndex++;
    }
  } else {
    // Flat list when searching
    displayItems = visibleCommands.map((cmd, index) => ({
      type: "command" as const,
      command: cmd,
      index,
    }));
  }

  // Limit display items to fit
  displayItems = displayItems.slice(0, maxVisibleItems);

  return (
    <box
      position="absolute"
      top={paddingTop}
      left={paddingLeft}
      width={dialogWidth}
      height={dialogHeight}
      border
      borderStyle="single"
      borderColor="cyan"
      backgroundColor="black"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
    >
      {/* Header */}
      <text color="cyan" bold>
        Command Palette
      </text>

      {/* Search input */}
      <box>
        <text color="gray">&gt; </text>
        <text color="white">{query}</text>
        <text color="cyan" inverse>
          {" "}
        </text>
      </box>

      {/* Spacer */}
      <text> </text>

      {/* Command list */}
      {displayItems.length === 0 ? (
        <text color="gray" dim>
          No matching commands
        </text>
      ) : (
        displayItems.map((item, _displayIndex) => {
          if (item.type === "category") {
            // Category header
            return (
              <text key={`cat-${item.category}`} color="yellow" dim>
                {item.category}
              </text>
            );
          }

          // Command item - command is always defined for non-category items
          if (!item.command) return null;
          const cmd = item.command;
          const isSelected = item.index === selectedIndex;

          // Format shortcut for display
          const shortcut = cmd.shortcut || "";
          const shortcutPadded = shortcut.padStart(10);

          // Truncate name if needed
          const maxNameWidth = contentWidth - shortcutPadded.length - 4;
          const displayName =
            cmd.name.length > maxNameWidth
              ? cmd.name.slice(0, maxNameWidth - 1) + "..."
              : cmd.name;

          return (
            <text
              key={cmd.id}
              backgroundColor={isSelected ? "cyan" : undefined}
              color={isSelected ? "black" : "white"}
            >
              {isSelected ? " > " : "   "}
              {displayName.padEnd(maxNameWidth)}
              <text
                color={isSelected ? "black" : "gray"}
                dim={!isSelected}
                backgroundColor={isSelected ? "cyan" : undefined}
              >
                {shortcutPadded}
              </text>
            </text>
          );
        })
      )}

      {/* Show count if there are more items */}
      {filteredCommands.length > maxVisibleItems && (
        <text color="gray" dim>
          ... and {filteredCommands.length - maxVisibleItems} more
        </text>
      )}

      {/* Spacer to push hints to bottom */}
      <box flexGrow={1} />

      {/* Selected command description */}
      {visibleCommands[selectedIndex] && (
        <text color="gray" dim>
          {visibleCommands[selectedIndex]?.description}
        </text>
      )}

      {/* Hints */}
      <text color="gray" dim>
        j/k to navigate, Enter to execute, Esc to cancel
      </text>
    </box>
  );
}

export default CommandPalette;
