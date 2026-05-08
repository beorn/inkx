import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { L5_SUITE, L5_SUITE_FILES, l5SuiteCommandArgs } from "../scripts/l5-suite.ts"

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..")

describe("silvercode L5 test suite gate", () => {
  test("covers the architecture risk categories required by the L5 bead", () => {
    expect(L5_SUITE.map((group) => group.category)).toEqual([
      "fakes",
      "provider-contracts",
      "replay",
      "projection",
      "queue-cancel",
      "permissions",
      "background-subagents",
      "chunk-normalization",
    ])
  })

  test("references existing test files with no duplicate execution", () => {
    expect(new Set(L5_SUITE_FILES).size).toBe(L5_SUITE_FILES.length)
    for (const file of L5_SUITE_FILES) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(true)
    }
  })

  test("is exposed as one package command", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }

    expect(pkg.scripts?.["test:silvercode:l5"]).toBe("bun apps/silvercode/scripts/l5-suite.ts")
    expect(l5SuiteCommandArgs()).toEqual(["vitest", "run", ...L5_SUITE_FILES])
  })
})
