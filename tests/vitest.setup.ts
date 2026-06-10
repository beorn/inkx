/**
 * Standalone-suite setup (km bead @km/all/19772-system-simplification/19780).
 * Minimal environment normalization the suite depends on — mirrors the two
 * knobs km's monorepo setup provides when running these tests as a vendor:
 *   - LOG_LEVEL=warn: loggily INFO lines (e.g. `silvery:guard activated`)
 *     otherwise interleave with the console-hygiene tests' captured output
 *     and skew their counts.
 *   - isTTY=false: no spinner/progress/color branching during tests.
 */
process.env.LOG_LEVEL ??= "warn"
process.stdout.isTTY = false
process.stderr.isTTY = false
