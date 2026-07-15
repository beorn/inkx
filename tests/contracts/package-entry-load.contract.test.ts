import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const silveryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

function expectBunCanImport(specifier: string, expectedExports: string[] = []) {
  const script = `
    const module = await import(${JSON.stringify(specifier)})
    for (const name of ${JSON.stringify(expectedExports)}) {
      if (typeof module[name] !== "function") throw new TypeError(${JSON.stringify(specifier)} + " must export " + name)
    }
  `
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

  test("silvery/test exposes the bundled test renderer and Termless helpers", () => {
    expectBunCanImport("silvery/test", ["createRenderer", "createTermless", "waitFor"])
  })
})
