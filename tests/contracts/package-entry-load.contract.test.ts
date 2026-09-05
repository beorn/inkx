import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
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
  test("Flexily direct dependencies and override select the same pinned source", () => {
    const root = JSON.parse(readFileSync(resolve(silveryRoot, "package.json"), "utf8")) as {
      dependencies: { flexily: string }
      overrides: { flexily: string }
    }
    const term = JSON.parse(
      readFileSync(resolve(silveryRoot, "packages/ag-term/package.json"), "utf8"),
    ) as { dependencies: { flexily: string } }

    // npm rejects a direct dependency whose override has a different spec;
    // a registry version label also does not identify our Git-only layout fixes.
    expect(root.dependencies.flexily).toBe(root.overrides.flexily)
    expect(term.dependencies.flexily).toBe(root.dependencies.flexily)
    expect(root.dependencies.flexily).toMatch(/^github:beorn\/flexily#[a-f0-9]{40}$/)
  })

  test.each(["@silvery/ag-react", "silvery"])("%s", (specifier) => {
    expectBunCanImport(specifier)
  })

  test("silvery/test exposes the bundled test renderer and Termless helpers", () => {
    expectBunCanImport("silvery/test", ["createRenderer", "createTermless", "waitFor"])
  })
})
