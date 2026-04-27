#!/usr/bin/env bun
/**
 * fuzz-crash-to-bead — convert a vitest fuzz failure into a bead.
 *
 * Reads vitest output from stdin (or from --input <file>), extracts the
 * fuzz seed + offending test file, generates a stable bead ID derived
 * from the test path + seed, and calls `bd create` with seed + repro
 * snippet + (optional) workflow run URL.
 *
 * Usage:
 *   bun packages/km-infra/scripts/fuzz-crash-to-bead.ts < vitest.log
 *   bun packages/km-infra/scripts/fuzz-crash-to-bead.ts --input vitest.log
 *   bun packages/km-infra/scripts/fuzz-crash-to-bead.ts --input vitest.log --run-url https://github.com/... --dry-run
 *
 * Designed to be invoked from .github/workflows/fuzz.yml on failure.
 *
 * Output: prints the new bead ID (or the dry-run bd command) to stdout.
 * Exit codes: 0 ok, 1 nothing extractable, 2 bd not found / failed.
 */

import { readFileSync } from "node:fs"
import { basename, dirname, relative } from "node:path"
import { spawnSync } from "node:child_process"

interface Args {
	input?: string
	runUrl?: string
	dryRun: boolean
	repoRoot: string
}

function parseArgs(argv: string[]): Args {
	const args: Args = {
		dryRun: false,
		repoRoot: process.cwd(),
	}
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === "--input") args.input = argv[++i]
		else if (a === "--run-url") args.runUrl = argv[++i]
		else if (a === "--dry-run") args.dryRun = true
		else if (a === "--repo-root") args.repoRoot = argv[++i]
		else if (!a.startsWith("--") && !args.input) {
			// Positional: treat first bare arg as input file path.
			args.input = a
		}
	}
	return args
}

function readInput(args: Args): string {
	if (args.input) return readFileSync(args.input, "utf-8")
	// Slurp stdin
	return readFileSync(0, "utf-8")
}

interface Crash {
	/** Absolute or repo-relative test file path */
	testFile: string
	/** Test name (best-effort) */
	testName: string
	/** FUZZ_SEED used to reproduce */
	seed?: number
	/** Short error excerpt */
	error: string
}

/**
 * Try to parse input as a structured JSON crash record. Used by callers
 * (e.g. orchestration scripts, manual smoke tests) that already know
 * exactly which test failed. Falls through to text parsing on miss.
 *
 * Accepted shapes:
 *   { "testFile": "...", "seed": 1234, "error": "..." }
 *   { "testFile": "...", "testName": "...", "seed": 1234, "error": "..." }
 */
function parseCrashJson(output: string): Crash | undefined {
	const trimmed = output.trim()
	if (!trimmed.startsWith("{")) return undefined
	let obj: unknown
	try {
		obj = JSON.parse(trimmed)
	} catch {
		return undefined
	}
	if (typeof obj !== "object" || obj === null) return undefined
	const o = obj as Record<string, unknown>
	if (typeof o.testFile !== "string") return undefined
	return {
		testFile: o.testFile,
		testName: typeof o.testName === "string" ? o.testName : "unknown",
		seed: typeof o.seed === "number" ? o.seed : undefined,
		error: typeof o.error === "string" ? o.error.slice(0, 2000) : "",
	}
}

/**
 * Parse vitest output for the first failed fuzz test we can extract.
 * Vitest's default reporter prints lines like:
 *   FAIL  apps/km-tui/tests/navigation-fuzz.fuzz.ts > navigation invariants
 *   Error: ...
 *   Seed: 12345 (reproduce with FUZZ_SEED=12345)
 */
function parseCrashText(output: string): Crash | undefined {
	const lines = output.split(/\r?\n/)
	let testFile: string | undefined
	let testName: string | undefined
	let seed: number | undefined
	const errorLines: string[] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]

		// FAIL <file>.fuzz.ts > <test name>
		// Matches both `FAIL ` and ` ❯ FAIL ` style prefixes.
		if (!testFile) {
			const m = line.match(/(?:FAIL|×)\s+(\S*\.fuzz\.tsx?)(?:\s+>\s+(.+?))?\s*$/)
			if (m) {
				testFile = m[1]
				testName = m[2]?.trim()
				continue
			}
		}

		// Some reporters split: file on one line, test name on next.
		if (testFile && !testName) {
			const m = line.match(/^\s*[›>]\s*(.+\S)\s*$/)
			if (m) testName = m[1].trim()
		}

		// Seed extraction — vimonkey emits `Seed: N (reproduce with FUZZ_SEED=N)`
		if (seed === undefined) {
			const m = line.match(/FUZZ_SEED=(\d+)/) ?? line.match(/Seed:\s*(\d+)/i)
			if (m) seed = Number.parseInt(m[1], 10)
		}

		// Collect first ~10 lines after FAIL as error context.
		if (testFile && errorLines.length < 10) {
			const trimmed = line.trim()
			if (trimmed.length > 0 && !trimmed.startsWith("at ")) {
				errorLines.push(line)
			}
		}
	}

	if (!testFile) return undefined
	return {
		testFile,
		testName: testName ?? "unknown",
		seed,
		error: errorLines.join("\n").slice(0, 2000),
	}
}

/**
 * Derive a bead scope from the test file path.
 * `apps/km-tui/tests/navigation-fuzz.fuzz.ts` → `km-tui`
 * `packages/km-board/tests/board-reducer.fuzz.ts` → `km-board`
 * `vendor/silvery/tests/inline-fuzz.fuzz.ts` → `km-silvery`
 * Fallback: `km-all`.
 */
function deriveScope(testFile: string): string {
	const m =
		testFile.match(/(?:^|\/)apps\/([^/]+)\//) ??
		testFile.match(/(?:^|\/)packages\/([^/]+)\//) ??
		testFile.match(/(?:^|\/)vendor\/([^/]+)\//)
	if (!m) return "km-all"
	const segment = m[1]
	if (segment.startsWith("km-")) return segment
	return `km-${segment}`
}

/**
 * Short stable hash of test-file + test-name + seed so re-runs of the
 * same crash collapse onto the same bead ID.
 */
function shortHash(s: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i)
		h = Math.imul(h, 0x01000193) >>> 0
	}
	return h.toString(36).slice(0, 6)
}

function buildBeadId(crash: Crash): string {
	const scope = deriveScope(crash.testFile)
	const hash = shortHash(`${crash.testFile}|${crash.testName}|${crash.seed ?? "noseed"}`)
	return `${scope}.fuzz-${hash}`
}

function buildTitle(crash: Crash): string {
	const file = basename(crash.testFile)
	const name = crash.testName === "unknown" ? "" : `: ${crash.testName}`
	return `Fuzz crash in ${file}${name}`
}

function buildDescription(crash: Crash, runUrl: string | undefined): string {
	const reproSeed = crash.seed !== undefined ? `FUZZ_SEED=${crash.seed} ` : ""
	const lines = [
		"Fuzz failure auto-filed by `.github/workflows/fuzz.yml`.",
		"",
		`Test file: \`${crash.testFile}\``,
		`Test name: \`${crash.testName}\``,
		crash.seed !== undefined ? `Seed: \`${crash.seed}\`` : "Seed: (not extracted)",
		"",
		"## Reproduce locally",
		"",
		"```bash",
		`${reproSeed}bun vitest run ${crash.testFile}`,
		"```",
		"",
		"## Error excerpt",
		"",
		"```",
		crash.error || "(error text not extracted from vitest output)",
		"```",
		"",
	]
	if (runUrl) {
		lines.push("## CI run", "", runUrl, "")
	}
	lines.push(
		"## Next steps",
		"",
		"1. Reproduce with the command above; capture the shrunk failing sequence from `__fuzz_cases__/`.",
		"2. Convert the minimal sequence into a deterministic regression test.",
		"3. Fix the root cause; re-run the fuzz suite to confirm.",
	)
	return lines.join("\n")
}

function callBd(args: string[], dryRun: boolean): { ok: boolean; stdout: string; stderr: string } {
	if (dryRun) {
		const printable = ["bd", ...args.map((a) => (/[\s"']/.test(a) ? JSON.stringify(a) : a))].join(
			" ",
		)
		return { ok: true, stdout: printable, stderr: "" }
	}
	const r = spawnSync("bd", args, { encoding: "utf-8" })
	return {
		ok: r.status === 0,
		stdout: (r.stdout ?? "").toString(),
		stderr: (r.stderr ?? "").toString(),
	}
}

function parseCrash(output: string): Crash | undefined {
	return parseCrashJson(output) ?? parseCrashText(output)
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	const output = readInput(args)
	const crash = parseCrash(output)

	if (!crash) {
		console.error("fuzz-crash-to-bead: no fuzz failure detected in input")
		process.exit(1)
	}

	const id = buildBeadId(crash)
	const title = buildTitle(crash)
	const description = buildDescription(crash, args.runUrl)

	const createArgs = [
		"create",
		"--id",
		id,
		"--title",
		title,
		"--type",
		"bug",
		"--priority",
		"2",
		"--description",
		description,
	]

	const created = callBd(createArgs, args.dryRun)
	if (!created.ok) {
		// `bd create --id X` fails if X already exists — that's the de-dup case.
		// Re-issue idempotent update instead.
		if (created.stderr.includes("already exists") || created.stdout.includes("already exists")) {
			console.error(`fuzz-crash-to-bead: bead ${id} already exists; appending notes`)
			const note = `Re-observed at ${new Date().toISOString()}${args.runUrl ? `\nCI run: ${args.runUrl}` : ""}`
			const upd = callBd(["update", id, "--append-notes", note], args.dryRun)
			if (!upd.ok) {
				console.error("fuzz-crash-to-bead: bd update failed:", upd.stderr || upd.stdout)
				process.exit(2)
			}
			console.log(id)
			return
		}
		console.error("fuzz-crash-to-bead: bd create failed:", created.stderr || created.stdout)
		process.exit(2)
	}

	if (args.dryRun) {
		console.log(created.stdout)
		return
	}

	// Best-effort parent assignment; not fatal if the parent doesn't exist
	// (e.g., before this PR lands the parent epic).
	callBd(["update", id, "--parent", "km-infra.continuous-fuzz"], args.dryRun)

	console.log(id)
}

main()
