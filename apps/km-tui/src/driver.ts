/**
 * Board Driver - AI/Test Automation Interface
 *
 * Provides a unified interface for driving the Board TUI programmatically,
 * enabling AI exploration, fuzz testing, and headless automation.
 *
 * Uses the existing withCommands/withKeybindings plugins from inkx.
 *
 * ==========================================================================
 * WORKAROUND: This driver uses onStateCaptureREPLACE_WITH_CREATEAPP_STORE
 * callback to receive state from Board. This is TEMPORARY - see km-tui.4.
 *
 * The proper fix is to migrate this driver to use createApp() from inkx/runtime:
 *   1. Define board state + key handlers via createApp()
 *   2. Board component uses useApp(selector) for state
 *   3. Driver accesses state via app.store.getState() directly
 *   4. Delete all the REPLACE_WITH_CREATEAPP_STORE workarounds
 *
 * DO NOT extend the captured state interface - migrate to createApp() instead.
 * ==========================================================================
 *
 * @example
 * ```typescript
 * import { createBoardDriver } from './driver.ts'
 * import { createFakeRepo } from '@km/storage'
 *
 * const nodes = item("board", item("col", item("task")))
 * const repo = createFakeRepo({ nodes })
 * const driver = createBoardDriver(repo, "board")
 *
 * // Execute commands directly
 * await driver.cmd.down()
 * await driver.cmd.right()
 *
 * // Get rich state for AI decisions
 * const state = driver.getState()
 * console.log(state.cursor)       // { col: 0, card: 1, level: 'card' }
 * console.log(state.selectedNode) // { id: 'task', title: 'task' }
 *
 * // Drive via keybindings
 * await driver.press('j')  // Resolves to cursor_down
 * await driver.press('/')  // Opens search dialog
 * ```
 */

import React from "react"
import { createRenderer, type App } from "inkx/testing"
import { withCommands } from "inkx"
import type { AppWithCommands, AppState } from "inkx"
import {
	createCommandRegistry,
	allCommands,
	defaultKeybindings,
	type CommandContext,
	type CommandAction,
	type Keybinding,
	type ViewMode,
} from "@km/commands"
import type { Repo } from "@km/storage"

import { Board, type BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE } from "./views/Board.tsx"
import { RepoProvider } from "./repo-context.tsx"
import { buildBoardState } from "./state.ts"
import { createLayoutRegistry, type LayoutRegistry } from "./card-positions.ts"
import { ensureCommandSystemInitialized } from "./command-bridge.ts"

// =============================================================================
// Types
// =============================================================================

/**
 * Dialog state in the TUI
 */
export interface DialogState {
	search: boolean
	newItem: boolean
	projectPicker: boolean
	help: boolean
}

/**
 * Cursor position in the board
 */
export interface CursorPosition {
	col: number
	card: number
	level: "board" | "column" | "card"
}

/**
 * Rich state for AI introspection
 */
export interface TUIDriverState extends AppState {
	/** Current cursor position */
	cursor: CursorPosition
	/** ID of the currently selected node */
	selectedNodeId: string | null
	/** Current view mode */
	viewMode: ViewMode | null
	/** Active dialogs */
	dialogs: DialogState
	/** Detail pane open */
	detailPaneOpen: boolean
	/** Move mode active */
	moveMode: boolean
	/** Scroll offset for columns */
	scrollOffset: number
	/** Raw captured state from Board component */
	captured: BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE | null
}

/**
 * Board driver interface for AI/test automation
 */
export interface BoardDriver extends AppWithCommands {
	/** Get rich state for AI decision-making */
	getState(): TUIDriverState
	/** The underlying inkx App */
	readonly app: App
	/** Layout registry for position tracking */
	readonly layoutRegistry: LayoutRegistry
}

/**
 * Options for creating a board driver
 */
export interface CreateBoardDriverOptions {
	/** Terminal width */
	columns?: number
	/** Terminal height */
	rows?: number
	/** Initial view mode */
	viewMode?: ViewMode
}

// =============================================================================
// Driver Factory
// =============================================================================

/**
 * Create a board driver for AI/test automation.
 *
 * This renders a full Board component with command and keybinding plugins,
 * enabling programmatic control and rich state introspection.
 *
 * WORKAROUND: State is obtained via onStateCaptureREPLACE_WITH_CREATEAPP_STORE
 * callback. See km-tui.4 for proper fix using createApp() store.
 *
 * @param repo - The repository (real or fake) containing nodes
 * @param rootId - The ID of the root node to display as the board
 * @param options - Driver configuration options
 */
export function createBoardDriver(
	repo: Repo,
	rootId: string,
	options: CreateBoardDriverOptions = {},
): BoardDriver {
	const { columns = 80, rows = 24, viewMode = "cards" } = options

	// Initialize command system
	ensureCommandSystemInitialized()

	// Create command registry
	const registry = createCommandRegistry()
	registry.registerAll(allCommands)

	// Create layout registry for position tracking
	const layoutRegistry = createLayoutRegistry()

	// Build initial board state
	const initialState = buildBoardState(repo, rootId)

	// WORKAROUND: State capture callback - see km-tui.4 for proper fix via createApp()
	let capturedState: BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE | null = null

	// Render Board component with state capture
	const render = createRenderer({ cols: columns, rows })
	const boardElement = React.createElement(Board, {
		initialState,
		initialViewMode: viewMode,
		dimensions: { columns, rows },
		onExit: () => {},
		layoutRegistry,
		// WORKAROUND: Replace this driver with createApp() - see km-tui.4
		onStateCaptureREPLACE_WITH_CREATEAPP_STORE: (state: BoardCapturedState_REPLACE_WITH_CREATEAPP_STORE) => {
			capturedState = state
		},
	})
	const baseApp = render(
		React.createElement(RepoProvider, {
			repo,
			children: boardElement,
		}),
	)

	// Build command context from captured state
	const getContext = (): CommandContext => {
		if (!capturedState) {
			// Fallback if state not yet captured
			return {
				currentNode: null,
				currentNodeId: null,
				selectedNodes: [],
				viewMode: viewMode,
				siblingIndex: 0,
				siblingCount: 0,
				columnIndex: 0,
				columnCount: 0,
				moveMode: false,
				foldedNodes: new Set(),
			}
		}

		const { layout, boardState, selectedNode, ui } = capturedState
		const column = layout.columns[layout.colIndex]

		return {
			currentNode: selectedNode as CommandContext["currentNode"],
			currentNodeId: selectedNode?.id ?? null,
			selectedNodes: Array.from(boardState.selectedNodes),
			viewMode: ui.viewMode,
			siblingIndex: layout.cardIndex,
			siblingCount: column?.cards.length ?? 0,
			columnIndex: layout.colIndex,
			columnCount: layout.columns.length,
			moveMode: boardState.moveMode,
			foldedNodes: boardState.foldedNodes,
		}
	}

	// Handle actions - just log for now, actual state changes happen via press()
	const handleAction = (_action: CommandAction): void => {
		// Commands executed via cmd.* are informational only.
		// Actual state updates happen through the Board's useInput handlers.
	}

	// Get keybindings for command metadata
	const getKeybindings = (): Keybinding[] => defaultKeybindings

	// Apply withCommands plugin for introspection only
	// Note: We don't use withKeybindings because the Board component already
	// has its own useInput handler that processes keys through the command system.
	// The driver's press() goes directly to the base app's press(), which
	// triggers the Board's useInput, which processes keys via command-bridge.ts
	const appWithCmd = withCommands(baseApp, {
		registry,
		getContext,
		handleAction,
		getKeybindings,
	})

	// Build rich getState for AI introspection
	const getState = (): TUIDriverState => {
		const baseState = appWithCmd.getState()

		if (!capturedState) {
			// Fallback if state not yet captured
			return {
				...baseState,
				cursor: { col: 0, card: 0, level: "card" },
				selectedNodeId: null,
				viewMode: viewMode,
				dialogs: { search: false, newItem: false, projectPicker: false, help: false },
				detailPaneOpen: false,
				moveMode: false,
				scrollOffset: 0,
				captured: null,
			}
		}

		const { layout, boardState, selectedNode, ui } = capturedState

		return {
			...baseState,
			cursor: {
				col: layout.colIndex,
				card: layout.cardIndex,
				level: capturedState.selectionLevel,
			},
			selectedNodeId: selectedNode?.id ?? null,
			viewMode: ui.viewMode,
			dialogs: {
				search: ui.showSearchDialog,
				newItem: ui.showNewItemDialog,
				projectPicker: ui.showProjectPicker,
				help: ui.showHelp,
			},
			detailPaneOpen: ui.showDetailPane,
			moveMode: boardState.moveMode,
			scrollOffset: 0, // TODO: extract from layout if needed
			captured: capturedState,
		}
	}

	// Return driver with all capabilities
	// The press() method from baseApp triggers the Board's useInput handler
	return {
		...appWithCmd,
		getState,
		app: baseApp,
		layoutRegistry,
	}
}
