/**
 * Standalone-suite setup (km bead @km/all/19772-system-simplification/19780).
 * Minimal environment normalization the suite depends on — mirrors the two
 * knobs km's monorepo setup provides when running these tests as a vendor:
 *   - LOG_LEVEL=warn: loggily INFO lines (e.g. `silvery:guard activated`)
 *     otherwise interleave with the console-hygiene tests' captured output
 *     and skew their counts.
 *   - isTTY=false: no spinner/progress/color branching during tests.
 *   - SILVERY_DUMP_DIR: incident dumps stay inside the run's own directory
 *     instead of bleeding into the shared system temp dir (see below).
 */

import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.LOG_LEVEL ??= "warn"
process.stdout.isTTY = false
process.stderr.isTTY = false

// Redirect crash/diagnostic dumps away from the shared system temp dir.
//
// Tests panic ON PURPOSE — `tests/pipeline/standalone-convergence-cap-recovery`
// drives a perpetual feedback edge to prove the bounded-streak guard fails
// loud — and `recordPanic` writes a dump file for every one of them. Left at
// the default, a fully GREEN suite deposits `silvery-panic-*.txt` files that
// are byte-identical to production crash evidence, and an operator triaging
// the temp directory reads them as a live runtime defect. (One did, on
// 2026-08-19.) Redirecting keeps the write path fully exercised — same code,
// same bytes — while leaving the shared directory clean.
//
// This file is inert under km's monorepo runner (km's vendor project never
// reads nested configs), so a test that ASSERTS the no-bleed contract must
// also set this itself rather than relying on the suite default.
process.env.SILVERY_DUMP_DIR ??= mkdtempSync(join(tmpdir(), "silvery-test-dumps-"))
