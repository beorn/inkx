/**
 * Level Navigation Invariants Test
 *
 * Uses withInvariants to catch the incremental rendering bug where
 * content shifts after navigating up/down levels (k k j j).
 *
 * Bug: km-tui.level-nav-shift
 * The test harness buffer is correct, but inkx differential rendering
 * produces different ANSI output on the real terminal.
 *
 * ## Findings
 *
 * Synthetic data passes all tests. The bug only manifests with real vaults.
 * Real vault showed: before='Zone 1: 50-60%', after='Health & Fitness'.
 *
 * This suggests the issue may be related to:
 * - Content ordering/sorting differences
 * - Scroll position not being restored correctly
 * - State mutation during render
 *
 * ## How to reproduce locally
 *
 * 1. Create a vault with many cards in multiple columns
 * 2. Run: bun km view /path/to/vault
 * 3. Navigate k k j j (up to board, back to card)
 * 4. Content may shift to show different card than before
 */

import { describe, test, expect } from "vitest"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { withInvariants } from "inkx"
import { item } from "./helpers/board-test.ts"

describe("Level navigation invariants", () => {
	test("synthetic: k k j j incremental matches fresh", async () => {
		const nodes = item.root(
			"board",
			item("Inbox", item("Task 1"), item("Task 2"), item("Task 3")),
			item("Projects", item("Alpha"), item("Beta")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		// Wrap with invariants checking
		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1], // Skip breadcrumb (first) and status bar (last)
		})

		// Navigate up to board level (k k)
		await driver.cmd.up!()
		await driver.cmd.up!()

		// Navigate back down (j j)
		await driver.cmd.down!()
		await driver.cmd.down!()

		// If we get here without error, incremental matches fresh
		expect(driver.getState().cursor.level).toBe("card")
	})

	test("synthetic: deep navigation k k k k j j j j", async () => {
		const nodes = item.root(
			"vault",
			item(
				"Projects",
				item.folder(
					"Work",
					item("Task A"),
					item("Task B"),
				),
				item.folder(
					"Personal",
					item("Task C"),
				),
			),
			item("Inbox", item("Quick task")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "vault")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1],
		})

		// Navigate up multiple levels
		for (let i = 0; i < 4; i++) {
			await driver.cmd.up!()
		}

		// Navigate back down
		for (let i = 0; i < 4; i++) {
			await driver.cmd.down!()
		}
	})

	test("mixed navigation h/l with k/j", async () => {
		const nodes = item.root(
			"board",
			item("Col1", item("A1"), item("A2")),
			item("Col2", item("B1"), item("B2")),
			item("Col3", item("C1"), item("C2")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1],
		})

		// Move right
		await driver.cmd.right!()

		// Navigate up levels
		await driver.cmd.up!()
		await driver.cmd.up!()

		// Move left at board level
		await driver.cmd.left!()

		// Navigate back down
		await driver.cmd.down!()
		await driver.cmd.down!()
	})

	test("view mode change + level navigation", async () => {
		const nodes = item.root(
			"board",
			item("Col1", item("Task 1"), item("Task 2")),
			item("Col2", item("Task 3")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			// Note: stability check disabled because view mode change IS expected to change content
			checkStability: false,
		})

		// Change view mode
		await driver.press("v")

		// Then navigate levels (incremental should still match fresh)
		await driver.cmd.up!()
		await driver.cmd.up!()
		await driver.cmd.down!()
		await driver.cmd.down!()
	})

	test("fuzz: random level navigation", async () => {
		const nodes = item.root(
			"board",
			item("Inbox", item("Task 1"), item("Task 2"), item("Task 3"), item("Task 4")),
			item("Projects", item.folder("Alpha", item("A1"), item("A2")), item.folder("Beta", item("B1"))),
			item("Areas", item.folder("Health", item("Exercise"), item("Diet"))),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1],
		})

		// Random walk of navigation commands
		const commands = [driver.cmd.up, driver.cmd.down, driver.cmd.left, driver.cmd.right]
		const rng = { seed: 12345, next: () => (rng.seed = (rng.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff }

		for (let i = 0; i < 50; i++) {
			const cmd = commands[Math.floor(rng.next() * commands.length)]
			if (cmd) await cmd()
		}
	})

	test("many columns with similar names", async () => {
		// Try to mimic the real vault scenario with Zone/Health similar names
		const nodes = item.root(
			"board",
			item("Zone 1: 50-60%", item("Morning run"), item("Evening walk")),
			item("Health & Fitness", item("Exercise"), item("Nutrition")),
			item("Zone 2: 60-70%", item("HIIT session"), item("Cycling")),
			item("Zone 3: 70-80%", item("Sprint intervals")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1],
		})

		// Navigate through all columns then back
		for (let i = 0; i < 3; i++) await driver.cmd.right!()
		for (let i = 0; i < 3; i++) await driver.cmd.left!()

		// Then level navigation
		await driver.cmd.up!()
		await driver.cmd.up!()
		await driver.cmd.down!()
		await driver.cmd.down!()
	})

	test("columns with overflow content", async () => {
		// Create columns with more cards than can fit on screen
		const manyCards = Array.from({ length: 20 }, (_, i) => item(`Task ${i + 1}`))

		const nodes = item.root(
			"board",
			item("Overflow Column", ...manyCards),
			item("Normal Column", item("A"), item("B")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board", { rows: 15 })

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			// Disable stability check because scrolling DOES change content
			checkStability: false,
		})

		// Scroll down a lot
		for (let i = 0; i < 15; i++) await driver.cmd.down!()

		// Navigate levels
		await driver.cmd.up!()
		await driver.cmd.up!()

		// Navigate back down - cursor should restore to scrolled position
		await driver.cmd.down!()
		await driver.cmd.down!()
	})

	test("tall board with tall cards (potential bug trigger)", async () => {
		// Create a tall board with many tall cards - mimics real vault conditions
		// that might trigger the level-nav-shift bug
		const tallCol1 = Array.from({ length: 15 }, (_, i) =>
			item.folder(`Project ${i + 1}`,
				item("Subtask A"),
				item("Subtask B"),
				item("Subtask C"),
			)
		)
		const tallCol2 = Array.from({ length: 10 }, (_, i) =>
			item(`Task ${String.fromCharCode(65 + i)}`)
		)

		const nodes = item.root(
			"board",
			item("Heavy Projects", ...tallCol1),
			item("Quick Tasks", ...tallCol2),
			item("Areas", item.folder("Health", item("Exercise"), item("Diet")), item.folder("Finance", item("Budget"))),
		)

		// Use a tall terminal to maximize the board size
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board", {
			rows: 40,
			columns: 120,
		})

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			// Stability check off due to scrolling
			checkStability: false,
		})

		// Navigate deep into the first column
		for (let i = 0; i < 10; i++) await driver.cmd.down!()

		// Navigate right to second column
		await driver.cmd.right!()

		// Navigate up through levels
		await driver.cmd.up!()
		await driver.cmd.up!()

		// Navigate left at board level
		await driver.cmd.left!()

		// Navigate back down
		await driver.cmd.down!()
		await driver.cmd.down!()

		// Navigate left again
		await driver.cmd.left!()

		// Try different level patterns
		await driver.cmd.up!()
		await driver.cmd.right!()
		await driver.cmd.down!()
		await driver.cmd.down!()
	})

	test("rapid level toggling", async () => {
		const nodes = item.root(
			"board",
			item("Col1", item("A"), item("B"), item("C")),
			item("Col2", item("X"), item("Y"), item("Z")),
		)
		const baseDriver = createBoardDriver(createFakeRepo({ nodes }), "board")

		const driver = withInvariants(baseDriver, {
			checkIncremental: true,
			checkStability: true,
			skipLines: [0, -1],
		})

		// Rapidly toggle between levels
		for (let i = 0; i < 10; i++) {
			await driver.cmd.up!()
			await driver.cmd.down!()
		}

		// Then full round trip
		await driver.cmd.up!()
		await driver.cmd.up!()
		await driver.cmd.down!()
		await driver.cmd.down!()
	})
})
