/**
 * App Commands
 *
 * Application-level commands for TUI modals and dialogs.
 * These commands are specific to the TUI application layer.
 *
 * Layer Model:
 *   App (this file) → Board (@km/sh-app) → Tree (@km/tree)
 *
 * Command palette aggregates from both layers:
 *   - Board commands from @km/sh-app (navigation, selection, folding, view)
 *   - App commands from here (search, help, modals)
 */

import type { AppUIAction } from "./appState.ts";

/**
 * App command definition (app-specific UI commands).
 */
export interface AppCommandDef {
  /** Unique identifier (snake_case) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Brief description */
  description: string;
  /** Keyboard shortcut (for display) */
  shortcut?: string;
  /** Category for grouping */
  category: AppCommandCategory;
  /** The action to dispatch (or null if requires context) */
  action: AppUIAction | null;
  /** Whether this command needs additional context */
  needsContext?: boolean;
}

export type AppCommandCategory = "Search" | "Modal" | "Edit";

/**
 * All app-level commands.
 * Order matters for display in command palette.
 */
export const appCommands: AppCommandDef[] = [
  // === Search ===
  {
    id: "toggle_search",
    name: "Toggle Search",
    description: "Open or close search mode",
    shortcut: "/",
    category: "Search",
    action: { type: "TOGGLE_SEARCH_MODE" },
  },

  // === Modal ===
  {
    id: "toggle_help",
    name: "Toggle Help",
    description: "Show or hide help overlay",
    shortcut: "?",
    category: "Modal",
    action: { type: "TOGGLE_HELP_MODE" },
  },
  {
    id: "toggle_new_item",
    name: "New Item",
    description: "Open new item dialog",
    shortcut: "n",
    category: "Modal",
    action: { type: "TOGGLE_NEW_ITEM_MODE" },
  },
  {
    id: "toggle_project_picker",
    name: "Project Picker",
    description: "Open project picker",
    shortcut: "p",
    category: "Modal",
    action: { type: "TOGGLE_PROJECT_PICKER" },
  },
  {
    id: "toggle_detail_pane",
    name: "Toggle Detail Pane",
    description: "Show or hide detail pane",
    shortcut: "d",
    category: "Modal",
    action: { type: "TOGGLE_DETAIL_PANE" },
  },
  {
    id: "toggle_command_palette",
    name: "Command Palette",
    description: "Open command palette",
    shortcut: "Cmd+K",
    category: "Modal",
    action: { type: "TOGGLE_COMMAND_PALETTE" },
  },

  // === Edit ===
  {
    id: "add_child",
    name: "Add Child",
    description: "Add a new child to current node",
    shortcut: "a",
    category: "Edit",
    action: null,
    needsContext: true,
  },
  {
    id: "add_sibling",
    name: "Add Sibling",
    description: "Add a new sibling after current node",
    shortcut: "A",
    category: "Edit",
    action: null,
    needsContext: true,
  },
  {
    id: "edit_node",
    name: "Edit Node",
    description: "Edit current node title",
    shortcut: "e",
    category: "Edit",
    action: null,
    needsContext: true,
  },
  {
    id: "delete_node",
    name: "Delete Node",
    description: "Delete current node",
    shortcut: "x",
    category: "Edit",
    action: null,
    needsContext: true,
  },
];

/**
 * Get app commands by category.
 */
export function getAppCommandsByCategory(): Map<
  AppCommandCategory,
  AppCommandDef[]
> {
  const byCategory = new Map<AppCommandCategory, AppCommandDef[]>();
  for (const cmd of appCommands) {
    const list = byCategory.get(cmd.category) || [];
    list.push(cmd);
    byCategory.set(cmd.category, list);
  }
  return byCategory;
}

/**
 * Get an app command by ID.
 */
export function getAppCommandById(id: string): AppCommandDef | undefined {
  return appCommands.find((cmd) => cmd.id === id);
}

/**
 * Simple fuzzy match for command palette.
 * Returns true if all characters in query appear in target in order.
 */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    }
  }
  return qi === q.length;
}

/**
 * Filter app commands by fuzzy search query.
 */
export function filterAppCommands(query: string): AppCommandDef[] {
  if (!query) return appCommands;
  return appCommands.filter(
    (cmd) =>
      fuzzyMatch(query, cmd.name) ||
      fuzzyMatch(query, cmd.description) ||
      fuzzyMatch(query, cmd.id),
  );
}
