import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const silveryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

function expectBunCanImport(specifier: string) {
  const script = `await import(${JSON.stringify(specifier)})`
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: silveryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
    },
  })

  expect(
    result.status,
    [`Bun failed to import ${specifier}`, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join("\n"),
  ).toBe(0)
}

describe("contract: package entry points load under Bun", () => {
  test.each(["@silvery/ag-react", "silvery"])("%s", (specifier) => {
    expectBunCanImport(specifier)
  })
})
