/**
 * BoardTestHarness - Test helper for km-tui board component
 *
 * Provides a Playwright-inspired API for testing the TUI board:
 * - Visual capture via screenshot()
 * - Input simulation via press()
 * - DOM queries via getByText(), getByTestId()
 * - State access via getState(), getCursor()
 *
 * @example
 * ```typescript
 * import { createBoardTest } from "@km/tui/testing";
 *
 * const board = await createBoardTest("/tmp/vault", { file: "tasks.md" });
 *
 * // Navigate and assert
 * board.press("j");  // Move down
 * expect(board.getCursor()).toEqual([0, 1]);
 *
 * // Visual assertion
 * expect(board.screenshot()).toContain("Task 1");
 *
 * // DOM query
 * const selected = board.locator('[data-selected]');
 * expect(selected.count()).toBe(1);
 *
 * board.unmount();
 * ```
 */

import React from "react";
import {
  createTestRenderer,
  bufferToText,
  bufferToStyledText,
  createLocator,
  type InkxLocator,
} from "inkx/testing";
import type { KNode } from "@km/core";
import type { BoardState } from "./types.ts";
import { InkBoardTestable } from "./views/index.ts";

/**
 * Options for creating a board test harness
 */
export interface BoardTestOptions {
  /** Specific file to view (relative to vault) */
  file?: string;
  /** Terminal width in columns */
  width?: number;
  /** Terminal height in rows */
  height?: number;
  /** Initial view mode */
  viewMode?: "cards" | "columns" | "list";
}

/**
 * Test harness for km board component
 */
export interface BoardTestHarness extends InkxLocator {
  // Visual capture
  /** Get plain text screenshot (no ANSI codes) */
  screenshot(): string;
  /** Get styled screenshot (with ANSI codes) */
  screenshotAnsi(): string;

  // Input simulation
  /** Press a single key */
  press(key: string): void;
  /** Press multiple keys in sequence */
  pressMultiple(keys: string[]): void;
  /** Type text character by character */
  type(text: string): void;

  // State access
  /** Get the current board state */
  getState(): BoardState;
  /** Get the current cursor position [colIndex, cardIndex] */
  getCursor(): [number, number];
  /** Get the currently selected node, if any */
  getSelectedNode(): KNode | null;

  // Lifecycle
  /** Unmount the component and clean up */
  unmount(): void;
}

/**
 * Create a board test harness with a loaded vault
 *
 * @param vaultPath - Path to the vault directory
 * @param options - Test configuration options
 * @returns Harness with query and input methods
 *
 * @example
 * ```typescript
 * // Test with a specific file
 * const board = await createBoardTest("/tmp/vault", { file: "tasks.md" });
 *
 * // Test with custom dimensions
 * const board = await createBoardTest("/tmp/vault", { width: 120, height: 40 });
 * ```
 */
export async function createBoardTest(
  vaultPath: string,
  options: BoardTestOptions = {},
): Promise<BoardTestHarness> {
  const { file, width = 80, height = 24 } = options;

  // Import storage module
  const storageModule = await import("@km/storage");

  // Load vault and get reference
  // searchAncestors: false prevents finding .km in parent directories (e.g., project root)
  const vault = storageModule.runGenerator(
    storageModule.createVault(vaultPath, { searchAncestors: false }),
  );

  // Resolve the file reference to a node ID if provided
  let rootNodeId: string | undefined;
  if (file) {
    const resolved = storageModule.resolvePathArg(file, vaultPath);
    if (resolved.nodeRef) {
      // resolveNode converts filename/path/ID to actual node
      const node = storageModule.resolveNode(resolved.nodeRef);
      rootNodeId = node?.id;
    }
  }

  // Import TUI module for state initialization
  const tuiModule = await import("./index.ts");

  // Initialize board state
  const state = storageModule.runGenerator(
    tuiModule.initBoardStateGenerator(vault, rootNodeId),
  );

  if (!state) {
    throw new Error(`Failed to initialize board state for ${vaultPath}`);
  }

  state.rootPath = vaultPath;

  // Create test renderer
  const render = createTestRenderer({ columns: width, rows: height });

  // Render the board
  const result = render(
    React.createElement(InkBoardTestable, {
      initialState: state,
      testWidth: width,
      testHeight: height,
      vault,
    }),
  );

  // Current state - updated after each input
  const currentState = state;

  // Create locator for DOM queries
  const getLocator = () => createLocator(result.getContainer());

  // Build harness object that extends InkxLocator
  const harness: BoardTestHarness = {
    // InkxLocator methods - delegate to current locator
    getByText(text) {
      return getLocator().getByText(text);
    },
    getByTestId(id) {
      return getLocator().getByTestId(id);
    },
    locator(selector) {
      return getLocator().locator(selector);
    },
    first() {
      return getLocator().first();
    },
    last() {
      return getLocator().last();
    },
    nth(index) {
      return getLocator().nth(index);
    },
    resolve() {
      return getLocator().resolve();
    },
    resolveAll() {
      return getLocator().resolveAll();
    },
    count() {
      return getLocator().count();
    },
    textContent() {
      return getLocator().textContent();
    },
    getAttribute(name) {
      return getLocator().getAttribute(name);
    },
    boundingBox() {
      return getLocator().boundingBox();
    },
    isVisible() {
      return getLocator().isVisible();
    },

    // Visual capture
    screenshot() {
      const buffer = result.lastBuffer();
      if (!buffer) return "";
      return bufferToText(buffer);
    },

    screenshotAnsi() {
      const buffer = result.lastBuffer();
      if (!buffer) return "";
      return bufferToStyledText(buffer);
    },

    // Input simulation
    press(key) {
      // Map common key names to their escape sequences
      const keyMap: Record<string, string> = {
        enter: "\r",
        return: "\r",
        escape: "\x1b",
        esc: "\x1b",
        tab: "\t",
        backspace: "\x7f",
        delete: "\x1b[3~",
        up: "\x1b[A",
        down: "\x1b[B",
        right: "\x1b[C",
        left: "\x1b[D",
        arrowup: "\x1b[A",
        arrowdown: "\x1b[B",
        arrowright: "\x1b[C",
        arrowleft: "\x1b[D",
        home: "\x1b[H",
        end: "\x1b[F",
        pageup: "\x1b[5~",
        pagedown: "\x1b[6~",
        space: " ",
      };

      const normalized = key.toLowerCase();
      const sequence = keyMap[normalized] ?? key;
      result.stdin.write(sequence);
    },

    pressMultiple(keys) {
      for (const key of keys) {
        this.press(key);
      }
    },

    type(text) {
      for (const char of text) {
        result.stdin.write(char);
      }
    },

    // State access
    getState() {
      // TODO: We need a way to get the current state from the rendered component
      // For now return the initial state - this is a limitation
      return currentState;
    },

    getCursor() {
      const s = this.getState();
      return [s.colIndex, s.cardIndex];
    },

    getSelectedNode() {
      const s = this.getState();
      const col = s.columns[s.colIndex];
      if (!col) return null;
      const card = col.cards[s.cardIndex];
      return card?.node ?? null;
    },

    // Lifecycle
    unmount() {
      result.unmount();
    },
  };

  return harness;
}
