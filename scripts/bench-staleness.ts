#!/usr/bin/env bun
/**
 * Bench staleness checker — warns when benchmarks should be re-run.
 *
 * Checks:
 * 1. If >24h since last bench AND pipeline-critical files changed: yellow warning
 * 2. If >7d since last bench regardless: yellow warning
 *
 * Always exits 0 (advisory only, never blocking).
 */

const MARKER = "benchmarks/results/.last-bench";
const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const PIPELINE_GLOBS = [
	"vendor/silvery/packages/ag-term/src/pipeline/**",
	"vendor/flexily/src/layout-zero.ts",
	"vendor/flexily/src/node-zero.ts",
	"apps/km-tui/src/state/reactive*.ts",
];

async function getLastBenchTime(): Promise<number | null> {
	const file = Bun.file(MARKER);
	if (await file.exists()) {
		return (await file.stat()).mtime.getTime();
	}
	// Fall back to history.jsonl mtime
	const history = Bun.file("benchmarks/history.jsonl");
	if (await history.exists()) {
		return (await history.stat()).mtime.getTime();
	}
	return null;
}

async function pipelineFilesChanged(_sinceMs: number): Promise<boolean> {
	const proc = Bun.spawn(
		["git", "diff", "--name-only", `--diff-filter=ACMR`, "HEAD", "--", ...PIPELINE_GLOBS],
		{ stdout: "pipe", stderr: "ignore" },
	);
	const output = await new Response(proc.stdout).text();
	if (output.trim().length > 0) return true;

	// Also check uncommitted changes
	const proc2 = Bun.spawn(
		["git", "diff", "--name-only", "--diff-filter=ACMR", "--", ...PIPELINE_GLOBS],
		{ stdout: "pipe", stderr: "ignore" },
	);
	const output2 = await new Response(proc2.stdout).text();
	return output2.trim().length > 0;
}

async function main() {
	const lastBench = await getLastBenchTime();

	if (lastBench === null) {
		console.log(`${YELLOW}bench: no benchmark results found — run \`bun bench\` to establish a baseline${RESET}`);
		return;
	}

	const age = Date.now() - lastBench;
	const hours = Math.floor(age / (60 * 60 * 1000));
	const days = Math.floor(age / (24 * 60 * 60 * 1000));
	const ageStr = days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;

	if (age > DAYS_7) {
		console.log(`${YELLOW}bench: last run ${ageStr} ago — consider running \`bun bench\`${RESET}`);
		return;
	}

	if (age > HOURS_24 && (await pipelineFilesChanged(lastBench))) {
		console.log(
			`${YELLOW}bench: last run ${ageStr} ago and pipeline files changed — consider running \`bun bench\`${RESET}`,
		);
		return;
	}

	// Fresh enough — no output (silent when all is well)
}

main().catch((err: unknown) => {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`${DIM}bench-staleness: ${msg}${RESET}`);
});
