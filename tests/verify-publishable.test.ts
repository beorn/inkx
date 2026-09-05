/**
 * @failure The gate measures source instead of the pnpm artifact, or accepts an unmeasured size.
 * @level l3
 * @consumer Release maintainers and Verify Publishable CI.
 * retire-when: The release gate no longer shells out to npm for tarball sizes.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { expect, test } from "vitest"

const ROOT = resolve(import.meta.dirname, "..")
const LIMIT = 25 * 1024 * 1024

test.each([
  {
    name: "failed pnpm pack",
    stage: "pack",
    status: 42,
    stdout: "prepack output",
    stderr: "prepack failed",
    reason: "prepack failed",
    accepted: false,
  },
  {
    name: "pack produced no artifact",
    stage: "pack",
    status: 0,
    stdout: "prepack output without a tarball",
    stderr: "",
    reason: "one tarball",
    accepted: false,
  },
  {
    name: "failed query",
    status: 42,
    stdout: JSON.stringify([{ unpackedSize: 1 }]),
    stderr: "\nEOVERRIDE: conflicting override",
    reason: "EOVERRIDE",
    accepted: false,
  },
  {
    name: "malformed JSON",
    status: 0,
    stdout: "not-json",
    stderr: "",
    reason: "invalid",
    accepted: false,
  },
  {
    name: "missing size",
    status: 0,
    stdout: "[{}]",
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "non-numeric size",
    status: 0,
    stdout: '[{"unpackedSize":"1"}]',
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "negative size",
    status: 0,
    stdout: '[{"unpackedSize":-1}]',
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "oversized package",
    status: 0,
    stdout: JSON.stringify([{ unpackedSize: LIMIT + 1 }]),
    stderr: "",
    reason: "limit 25",
    accepted: false,
  },
  {
    name: "exact size limit",
    status: 0,
    stdout: JSON.stringify([{ unpackedSize: LIMIT }]),
    stderr: "",
    reason: "",
    accepted: true,
  },
])("size gate: $name", (scenario) => {
  const { status, stdout, stderr, reason, accepted } = scenario
  const packStage = "stage" in scenario && scenario.stage === "pack"
  const bin = mkdtempSync(join(tmpdir(), "silvery-pack-gate-"))
  try {
    writeFileSync(join(bin, "pack-calls"), "")
    // Exercise the real CLI and package traversal; only the external commands
    // are fixtures. Refuse npm init so no test can install or publish anything.
    writeFileSync(
      join(bin, "npm"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
if [ "$1" != "pack" ]; then echo "fixture: registry work forbidden" >&2; exit 99; fi
if [ ! -f "$2" ] || [ "$PWD" = "$PACK_TEST_ROOT" ]; then
  echo "fixture: measure the pnpm artifact, not the source" >&2; exit 98
fi
if [ "$(cat "$2")" = "$PACK_TEST_ROOT" ]; then
  printf '%s' "$PACK_TEST_STDOUT"
  printf '%s' "$PACK_TEST_STDERR" >&2
  exit "$PACK_TEST_STATUS"
fi
printf '[{"unpackedSize":1}]'
`,
      { mode: 0o755 },
    )
    writeFileSync(
      join(bin, "pnpm"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
if [ "$1" != "pack" ] || [ "$2" != "--pack-destination" ] || [ ! -d "$3" ]; then
  echo "fixture: expected pnpm pack with fresh destination" >&2; exit 97
fi
printf '%s\n' "$PWD" >> "$PACK_TEST_CALLS"
if [ "$PWD" = "$PACK_TEST_ROOT" ] && [ "$PACK_TEST_STAGE" = "pack" ]; then
  if [ "$PACK_TEST_STATUS" != "0" ]; then printf '%s' "$PWD" > "$3/fixture.tgz"; fi
  printf '%s' "$PACK_TEST_STDOUT"
  printf '%s' "$PACK_TEST_STDERR" >&2
  exit "$PACK_TEST_STATUS"
fi
printf '%s' "$PWD" > "$3/fixture.tgz"
printf 'prepack lifecycle output\nTarball Contents\nfixture.tgz\n'
`,
      { mode: 0o755 },
    )
    const result = spawnSync("bun", [join(ROOT, "scripts/verify-publishable.ts"), "--no-build"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PACK_TEST_ROOT: ROOT,
        PACK_TEST_STDOUT: stdout,
        PACK_TEST_STDERR: stderr,
        PACK_TEST_STATUS: String(status),
        PACK_TEST_STAGE: packStage ? "pack" : "measure",
        PACK_TEST_CALLS: join(bin, "pack-calls"),
      },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    expect(readFileSync(join(bin, "pack-calls"), "utf8").split("\n")).toContain(ROOT)
    if (accepted) {
      expect(result.stdout).toContain("✓ silvery: 25.0 MB")
      expect(result.stderr).toContain("fixture: registry work forbidden")
    } else {
      expect(result.stdout).not.toContain("Installing verdaccio")
      expect(result.stderr).toContain("silvery")
      expect(result.stderr).toContain(reason)
      if (scenario.name === "oversized package") {
        expect(result.stderr).toMatch(/artifact .*silvery-pack-.*\/fixture\.tgz/)
        expect(result.stderr).toContain("Re-run with --keep")
      }
      if (status !== 0) {
        expect(result.stderr).toContain("42")
        expect(result.stderr).toContain(stdout)
        expect(result.stderr).toContain(packStage ? ROOT : "silvery-pack-")
        expect(result.stderr).toContain(packStage ? "pnpm pack" : "npm pack")
      }
    }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})
