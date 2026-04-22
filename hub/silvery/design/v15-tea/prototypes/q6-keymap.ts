/**
 * Q6 Spike: Keymap Location
 *
 * Challenge: How to bind keyboard keys to commands?
 * Two approaches:
 * 1. Separate: `app.keymap({x: app.commands.task.toggle_done, ...})`
 * 2. On command def: `{invoke: ..., key: "x", help: ...}` per command
 *
 * Context: Dispatch system (D10) routes key events to dispatch handlers.
 * Keyboard plugin (Q2 example) looks up key → command mapping.
 *
 * Verdict: Separate keymap plugin (approach 1).
 * Reason: Keymaps are mutable, composable, mode-switchable (vim, modal dialogs).
 * Commands are immutable, reusable across keymaps.
 */

import type { Command } from "./q1-nested-commands.js";

// ============================================================================
// Keymap Model
// ============================================================================

/** A keymap maps key sequences to commands. */
export interface Keymap {
  // Single key → command
  [key: string]: Command;
  // Can extend for key chords, leader keys, etc.
}

/** Plugin contributes keymaps for modes. */
export interface HasKeymaps {
  keymaps: {
    [mode: string]: Keymap;
  };
  currentMode: string;
  setMode(mode: string): void;
}

// ============================================================================
// Keymap Plugin
// ============================================================================

export function withKeymaps<A extends { commands: any }>(app: A): A & HasKeymaps {
  const keymaps: Record<string, Keymap> = {
    default: {}, // Will be populated
    insert: {},
    vim_normal: {},
  };

  let currentMode = "default";

  return {
    ...app,
    keymaps,
    currentMode,
    setMode: (mode: string) => {
      if (!keymaps[mode]) {
        console.warn(`Keymap mode not found: ${mode}`);
        return;
      }
      currentMode = mode;
    },
  };
}

// ============================================================================
// Keymap Builder Plugin
// ============================================================================

/**
 * Plugins can contribute keybindings via a dedicated plugin.
 * This keeps keymaps composable and mode-aware.
 */

export function withDefaultKeybindings<
  A extends A & {
    commands: {
      task?: { toggle_done?: Command; add?: Command };
      project?: { create?: Command; list?: Command };
      nav?: { open?: Command; close?: Command };
    };
    keymaps?: Record<string, Keymap>;
  },
>(app: A): A {
  if (!app.keymaps) {
    return app;
  }

  // Populate default mode keybindings
  app.keymaps.default = {
    x: app.commands.task?.toggle_done,
    a: app.commands.task?.add,
    p: app.commands.project?.create,
    "?": { invoke: () => ({ help: true }) }, // Show help
    q: { invoke: () => ({ quit: true }) }, // Quit
  };

  // Insert mode (text editing)
  app.keymaps.insert = {
    Escape: { invoke: () => ({ exitInsert: true }) },
  };

  // Vim-style normal mode
  app.keymaps.vim_normal = {
    x: app.commands.task?.toggle_done,
    a: app.commands.task?.add,
    h: app.commands.nav?.close,
    l: app.commands.nav?.open,
    j: { invoke: () => ({ moveDown: true }) },
    k: { invoke: () => ({ moveUp: true }) },
  };

  return app;
}

// ============================================================================
// Keyboard Dispatch Handler
// ============================================================================

export interface HasKeyboardDispatch {
  handleKeyboardEvent(key: string, mods: string[]): any;
}

export function withKeyboardDispatcher<
  A extends {
    keymaps?: Record<string, Keymap>;
    currentMode?: string;
  },
>(app: A): A & HasKeyboardDispatch {
  return {
    ...app,
    handleKeyboardEvent(key: string, mods: string[]) {
      const keymap = app.keymaps?.[app.currentMode || "default"];
      if (!keymap) return { error: `No keymap for mode: ${app.currentMode}` };

      const command = keymap[key];
      if (!command) return { error: `No binding for key: ${key}` };

      try {
        const result = command.invoke({ key, mods });
        return { success: true, result };
      } catch (error) {
        return { error: String(error) };
      }
    },
  };
}

// ============================================================================
// Advanced: Key Chords (Ctrl+S, Ctrl+Shift+P, etc.)
// ============================================================================

/**
 * For more complex keybindings (chords, leader keys, modal sequences),
 * extend the Keymap to support compound keys.
 */

export interface AdvancedKeymap {
  // Simple bindings
  [key: string]: Command;
  // Compound bindings (optional)
  "ctrl+s"?: Command;
  "ctrl+shift+p"?: Command;
  "leader+v"?: Command;
}

/**
 * Example: Vim leader key pattern (space as leader)
 */
function exampleVimLeaderKeymap(): AdvancedKeymap {
  return {
    x: { invoke: () => ({ action: "toggle" }) },
    "leader+w": { invoke: () => ({ action: "save" }) },
    "leader+q": { invoke: () => ({ action: "quit" }) },
  };
}

// ============================================================================
// Mode Switching in Dispatch
// ============================================================================

/**
 * Example: How modes change based on app state.
 */

export function withModeAwareKeyboard<
  A extends { currentMode?: string; keymaps?: Record<string, Keymap> },
>(app: A): A & {
  dispatch(event: { kind: string; key?: string }): void;
} {
  return {
    ...app,
    dispatch(event: any) {
      // Switch modes based on app state
      if (event.kind === "key") {
        const currentKeymap = app.keymaps?.[app.currentMode || "default"];
        const command = currentKeymap?.[event.key!];

        // Example: 'i' key enters insert mode
        if (event.key === "i") {
          app.currentMode = "insert";
          return { mode: "insert" };
        }

        // Handle command
        if (command) {
          return command.invoke(event);
        }
      }
    },
  };
}

// ============================================================================
// Demo
// ============================================================================

console.log("=== Q6: Keymap Resolution ===\n");

const exampleApp = {
  commands: {
    task: {
      toggle_done: {
        invoke: (args: any) => ({ type: "task.toggle", id: "t1" }),
        help: "Toggle task done",
      },
      add: {
        invoke: (args: any) => ({ type: "task.add", title: "New task" }),
        help: "Add new task",
      },
    },
    project: {
      create: {
        invoke: (args: any) => ({ type: "project.create" }),
        help: "Create project",
      },
      list: {
        invoke: (args: any) => ({ type: "project.list", count: 5 }),
        help: "List projects",
      },
    },
    nav: {
      open: {
        invoke: (args: any) => ({ type: "nav.open", path: "/" }),
        help: "Open view",
      },
      close: {
        invoke: (args: any) => ({ type: "nav.close" }),
        help: "Close view",
      },
    },
  },
};

// Compose with keymap system
const app = [exampleApp]
  .reduce((a) => withKeymaps(a), exampleApp)
  .then((a: any) => withDefaultKeybindings(a))
  .then((a: any) => withKeyboardDispatcher(a));

// Test key dispatch
console.log('Key "x":', (app as any).handleKeyboardEvent("x", []));
console.log('Key "a":', (app as any).handleKeyboardEvent("a", []));
console.log('Key "p":', (app as any).handleKeyboardEvent("p", []));
console.log('Key "?":', (app as any).handleKeyboardEvent("?", []));
console.log('Key "unknown":', (app as any).handleKeyboardEvent("unknown", []));

// List keybindings for help
console.log("\n=== Default Mode Keybindings ===");
const km = (app as any).keymaps.default;
for (const [key, cmd] of Object.entries(km)) {
  console.log(`  ${key}: ${(cmd as any).help || "(no help)"}`);
}

// ============================================================================
// Q6 Resolution
// ============================================================================

/**
 * VERDICT: Separate keymap plugin (approach 1).
 *
 * ✅ Composable: Each mode is independent (default, insert, vim_normal, modal dialogs)
 * ✅ Mutable: Keymaps can change at runtime based on context
 * ✅ Decoupled: Commands don't need to know their bindings
 * ✅ Discoverable: Registry can export all bindings for help/config
 * ✅ Conflict-free: Same command can have different keys in different modes
 *
 * ✗ Approach 2 (on command def): Commands would be bloated, can't have mode-specific bindings
 *
 * Implementation:
 * 1. withKeymaps() plugin defines keymaps object with modes
 * 2. withDefaultKeybindings() populates default mode
 * 3. withKeyboardDispatcher() routes key events to commands via current keymap
 * 4. Mode switching via app.currentMode (part of dispatch logic)
 *
 * Works with:
 * ✅ Q10 (keymaps in insert mode, vim modes, modal dialogs)
 * ✅ Serialization (registry exports keybindings as {mode, key, command path})
 * ✅ Config (load keybindings from YAML, override defaults)
 * ✅ Multi-user (different users, different key preferences)
 *
 * Next: Q4 (models) or Q9 (test harness) to validate full system.
 */
