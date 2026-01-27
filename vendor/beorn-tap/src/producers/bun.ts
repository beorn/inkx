import { spawn, type Subprocess } from "bun"
import { PassThrough, type Readable } from "node:stream"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface BunTapOptions {
	args?: string[]
	cwd?: string
}

export interface BunTapResult {
	stdout: Readable
	proc: Subprocess
	exited: Promise<number>
}

/**
 * Runs Bun tests and converts JUnit XML output to TAP format.
 *
 * Executes `bun test` with JUnit reporter, parses the XML output, and streams
 * TAP format for unified test orchestration.
 *
 * @param options - Configuration options
 * @param options.args - Test file patterns or paths to pass to bun test
 * @param options.cwd - Working directory for test execution
 * @returns Object containing TAP stdout stream and process handle
 */
export function runBunTap(options: BunTapOptions = {}): BunTapResult {
	const output = new PassThrough()

	// Create temp dir for junit output
	const tempDir = mkdtempSync(join(tmpdir(), "bun-tap-"))
	const junitFile = join(tempDir, "results.xml")

	const args = [
		"test",
		"--reporter=junit",
		`--reporter-outfile=${junitFile}`,
		...(options.args ?? []),
	]

	const proc = spawn(["bun", ...args], {
		cwd: options.cwd,
		stdout: "pipe",
		stderr: "pipe",
	})

	// When process exits, read and convert junit XML
	proc.exited
		.then(() => {
			try {
				const xml = readFileSync(junitFile, "utf-8")
				const tap = junitToTap(xml)
				output.write(tap)
			} catch (err) {
				// No junit file means no tests ran or error
				output.write("TAP version 14\n")
				output.write("1..0\n")
			}
		})
		.catch((err) => {
			output.write(`not ok 1 - bun test error: ${err}\n`)
			output.write("1..1\n")
		})
		.finally(() => {
			// Cleanup temp dir
			try {
				rmSync(tempDir, { recursive: true, force: true })
			} catch {
				// Ignore cleanup errors
			}
			output.end()
		})

	return {
		stdout: output,
		proc,
		exited: proc.exited,
	}
}

interface TestCase {
	name: string
	classname: string
	time: number
	failure?: string
	skipped?: boolean
}

function junitToTap(xml: string): string {
	const lines: string[] = ["TAP version 14"]
	const testCases: TestCase[] = []

	// Parse testcase elements (simple regex parsing - works for bun's output)
	const testcaseRegex =
		/<testcase\s+name="([^"]+)"\s+classname="([^"]+)"\s+time="([^"]+)"[^>]*(?:\/>|>([\s\S]*?)<\/testcase>)/g

	let match
	while ((match = testcaseRegex.exec(xml)) !== null) {
		const [, name, classname, time, content] = match
		if (!name || !classname || !time) continue

		const testCase: TestCase = {
			name: decodeXmlEntities(name),
			classname: decodeXmlEntities(classname),
			time: parseFloat(time) * 1000, // Convert to ms
		}

		if (content) {
			const failureMatch = content.match(/<failure[^>]*>([\s\S]*?)<\/failure>/)
			if (failureMatch?.[1]) {
				testCase.failure = decodeXmlEntities(failureMatch[1].trim())
			}
			if (content.includes("<skipped")) {
				testCase.skipped = true
			}
		}

		testCases.push(testCase)
	}

	// Generate TAP output
	let id = 0
	for (const tc of testCases) {
		id++
		const displayName = `${tc.classname} > ${tc.name}`

		if (tc.skipped) {
			lines.push(`ok ${id} - ${displayName} # SKIP`)
		} else if (tc.failure) {
			lines.push(`not ok ${id} - ${displayName} # time=${tc.time.toFixed(0)}ms`)
			lines.push("  ---")
			lines.push(`  message: ${tc.failure.split("\n")[0]}`)
			lines.push("  ...")
		} else {
			lines.push(`ok ${id} - ${displayName} # time=${tc.time.toFixed(0)}ms`)
		}
	}

	lines.push(`1..${id}`)
	return lines.join("\n") + "\n"
}

function decodeXmlEntities(str: string): string {
	return str
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
}
