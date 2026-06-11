/**
 * Self-tests for the autofit-to-box-fitwidth codemod.
 *
 * For each fixture pair under __fixtures__/ (NN-name.input.tsx +
 * NN-name.expected.tsx), copy the input to a temp file, run the codemod
 * against the copy, then assert the result matches the expected file
 * byte-for-byte (apart from trailing whitespace).
 *
 * Bead: @km/silvery/responsive-layout-architecture-reframe (A0.7).
 */

import { spawnSync } from "node:child_process"
import { readFileSync, readdirSync, copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { describe, expect, test, afterEach } from "vitest"
import { transformFile } from "./autofit-to-box-fitwidth"

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__")

function formatFile(path: string): void {
  const result = spawnSync("oxfmt", ["--write", path], { encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `oxfmt failed for ${path}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
  }
}

function listFixturePairs(): { name: string; input: string; expected: string }[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".input.tsx"))
  return files.map((f) => {
    const base = f.replace(/\.input\.tsx$/, "")
    return {
      name: base,
      input: join(FIXTURES_DIR, `${base}.input.tsx`),
      expected: join(FIXTURES_DIR, `${base}.expected.tsx`),
    }
  })
}

describe("autofit-to-box-fitwidth codemod", () => {
  let workdir: string | null = null

  afterEach(() => {
    if (workdir) {
      rmSync(workdir, { recursive: true, force: true })
      workdir = null
    }
  })

  for (const fixture of listFixturePairs()) {
    test(`fixture: ${fixture.name}`, () => {
      workdir = mkdtempSync(join(tmpdir(), "autofit-codemod-"))
      const target = join(workdir, "input.tsx")
      copyFileSync(fixture.input, target)

      const result = transformFile(target, {})
      formatFile(target)
      const actual = readFileSync(target, "utf8").trimEnd()
      const expected = readFileSync(fixture.expected, "utf8").trimEnd()

      expect(actual).toBe(expected)
      expect(result.rewrites).toBeGreaterThan(0)
    })
  }

  test("dry mode leaves the file unchanged on disk but reports rewrites", () => {
    workdir = mkdtempSync(join(tmpdir(), "autofit-codemod-"))
    const target = join(workdir, "input.tsx")
    const fixture = listFixturePairs()[0]
    if (!fixture) throw new Error("expected at least one fixture pair")
    copyFileSync(fixture.input, target)

    const originalText = readFileSync(target, "utf8")
    const result = transformFile(target, { dry: true })
    const afterText = readFileSync(target, "utf8")

    expect(afterText).toBe(originalText)
    expect(result.rewrites).toBeGreaterThan(0)
    expect(result.source).not.toBe(originalText)
  })
})
