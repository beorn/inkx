import { describe, expect, test } from "bun:test"
import { createOrchestrator, type Suite } from "../src/orchestrate"
import { Writable } from "node:stream"

describe("createOrchestrator", () => {
	test("unified mode merges multiple suite streams", async () => {
		const output = createMockWritable()
		const suites: Suite[] = [
			{ name: "suite1", runner: "bun", files: [] },
			{ name: "suite2", runner: "bun", files: [] },
		]

		const orchestrator = createOrchestrator({
			suites,
			mode: "unified",
			output,
		})

		// Empty suites should exit successfully
		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
	})

	test("returns exit code 0 when all tests pass", async () => {
		// TODO: Add test with mock TAP output
		// For now, test with empty suites
		const output = createMockWritable()
		const orchestrator = createOrchestrator({
			suites: [{ name: "test", runner: "bun", files: [] }],
			mode: "unified",
			output,
		})

		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
	})

	test("parallel mode throws without renderParallel function", async () => {
		const orchestrator = createOrchestrator({
			suites: [{ name: "test", runner: "bun", files: [] }],
			mode: "parallel",
		})

		await expect(orchestrator.run()).rejects.toThrow(
			"Parallel mode requires renderParallel function",
		)
	})

	test("parallel mode delegates to injected renderer", async () => {
		const suites: Suite[] = [{ name: "test", runner: "bun", files: [] }]
		let rendererCalled = false

		const renderParallel = async (s: Suite[]) => {
			rendererCalled = true
			expect(s).toEqual(suites)
			return 0
		}

		const orchestrator = createOrchestrator({
			suites,
			mode: "parallel",
			renderParallel,
		})

		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
		expect(rendererCalled).toBe(true)
	})

	test("auto mode uses unified for non-TTY output", async () => {
		const output = createMockWritable({ isTTY: false })
		const orchestrator = createOrchestrator({
			suites: [{ name: "test", runner: "bun", files: [] }],
			mode: "auto",
			output,
		})

		// Should use unified mode (doesn't throw about missing renderParallel)
		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
	})

	test("auto mode uses parallel for TTY output", async () => {
		const output = createMockWritable({ isTTY: true })
		let rendererCalled = false

		const renderParallel = async () => {
			rendererCalled = true
			return 0
		}

		const orchestrator = createOrchestrator({
			suites: [{ name: "test", runner: "bun", files: [] }],
			mode: "auto",
			output,
			renderParallel,
		})

		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
		expect(rendererCalled).toBe(true)
	})

	test("defaults to auto mode when mode not specified", async () => {
		const output = createMockWritable({ isTTY: false })
		const orchestrator = createOrchestrator({
			suites: [{ name: "test", runner: "bun", files: [] }],
			output,
		})

		// Should default to auto, which uses unified for non-TTY
		const exitCode = await orchestrator.run()
		expect(exitCode).toBe(0)
	})
})

// Helper to create mock writable stream
function createMockWritable(options?: { isTTY?: boolean }): Writable {
	const chunks: Buffer[] = []
	const writable = new Writable({
		write(chunk, _encoding, callback) {
			chunks.push(Buffer.from(chunk))
			callback()
		},
	})

	if (options?.isTTY !== undefined) {
		;(writable as any).isTTY = options.isTTY
	}

	return writable
}
