/**
 * Board Driver - AI/Test Automation Interface
 *
 * Provides a unified interface for driving the Board TUI programmatically,
 * enabling AI exploration, fuzz testing, and headless automation.
 *
 * Uses the existing withCommands/withKeybindings plugins from inkx and
 * extracts state from rendered DOM attributes rather than modifying Board.
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

import { Board } from "./views/Board.tsx"
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
 * Selected node info for AI decision-making
 */
export interface SelectedNodeInfo {
	id: string
	title: string
}

/**
 * Rich state for AI introspection
 */
export interface TUIDriverState extends AppState {
	/** Current cursor position */
	cursor: CursorPosition
	/** ID of the currently selected node */
	selectedNodeId: string | null
	/** Current view mode (extracted from bottom bar) */
	viewMode: string | null
	/** Active dialogs */
	dialogs: DialogState
	/** Detail pane open */
	detailPaneOpen: boolean
	/** Move mode active */
	moveMode: boolean
	/** Scroll offset for columns */
	scrollOffset: number
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
// State Extraction from DOM
// =============================================================================

/**
 * Extract cursor position from rendered DOM.
 *
 * The Board renders data attributes on elements:
 * - data-board on the root Box with data-col-index and data-card-index
 * - data-cursor on the selected element
 * - id attributes on nodes matching their node ID
 */
function extractCursorPosition(app: App): CursorPosition {
	// Find the board element with cursor indices
	const boardEl = app.locator("[data-board]")
	if (boardEl.count() === 0) {
		return { col: 0, card: 0, level: "card" }
	}

	const colIndex = Number.parseInt(boardEl.getAttribute("data-col-index") ?? "0", 10)
	const cardIndex = Number.parseInt(boardEl.getAttribute("data-card-index") ?? "0", 10)

	// Determine level from indices
	// cardIndex -1 means column level, colIndex -1 means board level
	// But actually the data attrs use 0-based positive indices
	// We detect level by checking if cursor is on board, column header, or card
	const cursorEl = app.locator("[data-cursor]")
	let level: "board" | "column" | "card" = "card"

	if (cursorEl.count() > 0) {
		// Check if the cursor element is the board root
		const cursorOnBoard = app.locator("[data-board][data-cursor]")
		if (cursorOnBoard.count() > 0) {
			level = "board"
		} else {
			// Check if cursor is on a column header (has data-column attr)
			const cursorOnColumn = app.locator("[data-column][data-cursor]")
			if (cursorOnColumn.count() > 0) {
				level = "column"
			}
		}
	}

	return { col: colIndex, card: cardIndex, level }
}

/**
 * Extract selected node ID from cursor element
 */
function extractSelectedNodeId(app: App): string | null {
	const cursorEl = app.locator("[data-cursor]")
	if (cursorEl.count() === 0) return null

	// The id attribute on the cursor element is the node ID
	return cursorEl.getAttribute("id") ?? null
}

/**
 * Extract dialog state from rendered DOM
 */
function extractDialogState(app: App): DialogState {
	return {
		search: app.locator("[data-dialog='search']").count() > 0,
		newItem: app.locator("[data-dialog='new-item']").count() > 0,
		projectPicker: app.locator("[data-dialog='project-picker']").count() > 0,
		help: app.text.includes("Keyboard Shortcuts") || app.locator("[data-help]").count() > 0,
	}
}

/**
 * Extract view mode from bottom bar
 */
function extractViewMode(app: App): string | null {
	const viewModeEl = app.locator("#view-mode")
	if (viewModeEl.count() === 0) return null
	return viewModeEl.textContent() ?? null
}

/**
 * Check if detail pane is open
 */
function extractDetailPaneOpen(app: App): boolean {
	// Detail pane is indicated by a specific width split or element
	// For now, check if there's a detail pane container
	return app.text.includes("│") && app.locator("[data-detail-pane]").count() > 0
}

/**
 * Extract scroll offset from board element
 */
function extractScrollOffset(app: App): number {
	const boardEl = app.locator("[data-board]")
	if (boardEl.count() === 0) return 0
	return Number.parseInt(boardEl.getAttribute("data-scroll-offset") ?? "0", 10)
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

	// Render Board component
	const render = createRenderer({ cols: columns, rows })
	const boardElement = React.createElement(Board, {
		initialState,
		initialViewMode: viewMode,
		dimensions: { columns, rows },
		onExit: () => {},
		layoutRegistry,
	})
	const baseApp = render(
		React.createElement(RepoProvider, {
			repo,
			children: boardElement,
		}),
	)

	// Build command context from DOM state
	const getContext = (): CommandContext => {
		const cursor = extractCursorPosition(baseApp)
		const selectedNodeId = extractSelectedNodeId(baseApp)
		const node = selectedNodeId ? repo.getNode(selectedNodeId) : null

		return {
			currentNode: node as CommandContext["currentNode"],
			currentNodeId: selectedNodeId,
			selectedNodes: [],
			viewMode: viewMode,
			siblingIndex: cursor.card,
			siblingCount: 10, // Approximation - would need to count from DOM
			columnIndex: cursor.col,
			columnCount: 5, // Approximation - would need to count from DOM
			moveMode: false,
			foldedNodes: new Set(),
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
		const cursor = extractCursorPosition(baseApp)
		const selectedNodeId = extractSelectedNodeId(baseApp)
		const dialogs = extractDialogState(baseApp)
		const viewModeText = extractViewMode(baseApp)
		const detailPaneOpen = extractDetailPaneOpen(baseApp)
		const scrollOffset = extractScrollOffset(baseApp)

		return {
			...baseState,
			cursor,
			selectedNodeId,
			viewMode: viewModeText,
			dialogs,
			detailPaneOpen,
			moveMode: false,
			scrollOffset,
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
