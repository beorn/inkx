import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
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

function expectBunExportsFunctions(specifier: string, names: string[]) {
  const script = `const entry = await import(${JSON.stringify(specifier)}); const missing = ${JSON.stringify(names)}.filter((name) => typeof entry[name] !== "function"); if (missing.length > 0) { console.error("Missing function exports: " + missing.join(", ")); process.exit(1) }`
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
    [`Bun failed to validate ${specifier}`, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join("\n"),
  ).toBe(0)
}

describe("contract: package entry points load under Bun", () => {
  test.each(["@silvery/ag-react", "silvery", "silvery/testing"])("%s", (specifier) => {
    expectBunCanImport(specifier)
  })

  test("silvery/testing exposes the public test harness", () => {
    expectBunExportsFunctions("silvery/testing", ["createRenderer", "createTermless", "waitFor"])
  })

  test("silvery/testing is included in the published package", () => {
    const pkg = JSON.parse(readFileSync(resolve(silveryRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>
      publishConfig?: { exports?: Record<string, unknown> }
      tsdown?: { entry?: string[] }
    }

    expect(pkg.publishConfig?.exports).toHaveProperty("./testing")
    expect(pkg.tsdown?.entry).toContain("src/testing.ts")
    expect(pkg.dependencies).toMatchObject({
      "@termless/ghostty": "^0.8.2",
      "@termless/ghostty-native": "^0.8.1",
      "@termless/xtermjs": "^0.8.1",
    })
  })
})
