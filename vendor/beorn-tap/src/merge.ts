import { PassThrough, type Readable } from "node:stream"
import { webStreamToNodeStream } from "./streams"
import { formatMs } from "./utils"

export interface NamedStream {
	name: string
	stream: Readable | ReadableStream<Uint8Array>
}

/**
 * Merges multiple TAP streams into a single unified TAP stream.
 *
 * Combines parallel TAP streams by:
 * - Stripping individual TAP headers (version, plan)
 * - Renumbering assertions sequentially (1..N)
 * - Adding runner names to test descriptions ([runner] test name)
 * - Preserving YAML diagnostic blocks
 * - Writing a single TAP header and final plan
 *
 * @param streams - Array of named TAP streams to merge
 * @returns ReadableStream that outputs unified TAP
 */
export function mergeStreams(streams: NamedStream[]): Readable {
	const output = new PassThrough()
	let completedCount = 0
	let totalAssertions = 0
	const runnerCounts = new Map<string, { passed: number; failed: number }>()
	const runnerTiming = new Map<string, { start: number; end?: number }>()

	// Write initial TAP header
	output.write("TAP version 14\n")

	for (const { name, stream: rawStream } of streams) {
		// Convert Web Streams to Node Streams if needed
		const stream: Readable =
			rawStream instanceof ReadableStream
				? webStreamToNodeStream(rawStream)
				: rawStream

		runnerCounts.set(name, { passed: 0, failed: 0 })
		runnerTiming.set(name, { start: performance.now() })
		let lineBuffer = ""

		stream.on("data", (chunk: Buffer | string) => {
			lineBuffer += chunk.toString()
			const lines = lineBuffer.split("\n")
			lineBuffer = lines.pop() ?? "" // Keep incomplete line in buffer

			for (const line of lines) {
				processLine(name, line, output, runnerCounts, () => totalAssertions++)
			}
		})

		stream.on("end", () => {
			// Process any remaining content
			if (lineBuffer) {
				processLine(name, lineBuffer, output, runnerCounts, () => totalAssertions++)
			}

			// Record timing
			const timing = runnerTiming.get(name)!
			timing.end = performance.now()
			const ms = timing.end - timing.start

			// Emit timing comment
			output.write(`# ${name}: ${formatMs(ms)}\n`)

			completedCount++
			if (completedCount === streams.length) {
				// Write final plan
				output.write(`1..${totalAssertions}\n`)
				output.end()
			}
		})

		stream.on("error", (err: Error) => {
			output.write(`not ok ${++totalAssertions} - ${name} stream error: ${err.message}\n`)
		})
	}

	// Handle empty streams array
	if (streams.length === 0) {
		output.write("1..0\n")
		output.end()
	}

	return output
}

function processLine(
	runner: string,
	line: string,
	output: PassThrough,
	runnerCounts: Map<string, { passed: number; failed: number }>,
	incrementTotal: () => number,
): void {
	// Skip TAP headers from individual streams
	if (line.startsWith("TAP version") || line.match(/^1\.\.\d+$/)) {
		return
	}

	// Transform ok/not ok lines to include runner context
	const assertMatch = line.match(/^(ok|not ok)\s+(\d+)\s*-?\s*(.*)$/)
	if (assertMatch) {
		const [, status, , testName] = assertMatch
		const newId = incrementTotal()
		const counts = runnerCounts.get(runner)!

		if (status === "ok") {
			counts.passed++
		} else {
			counts.failed++
		}

		// Rewrite with new ID and runner prefix
		output.write(`${status} ${newId} - [${runner}] ${testName}\n`)
		return
	}

	// Pass through YAML blocks, comments, and other content
	if (line.startsWith("  ") || line.startsWith("#") || line === "---" || line === "...") {
		output.write(line + "\n")
	}
}
