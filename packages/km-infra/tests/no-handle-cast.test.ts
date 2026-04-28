/**
 * Guard: `as TickHandle` casts are forbidden outside the factories that own them.
 *
 * Why this exists: silvery's `@silvery/scope` ships an opaque-branded
 * handle pattern (`defineHandle("Foo")` + `finaliseHandle()`). The brand
 * is a per-call-site `unique symbol` — accidental object-literal
 * construction fails compile (TS2322). The runtime WeakSet inside
 * `adoptHandle()` / `Scope.use()` rejects forged handles.
 *
 * The hole the runtime gate doesn't close: `as TickHandle` casts. TS
 * accepts them silently. Per the pro/Kimi review of Phase 1: "the brand
 * is structural, not nominal" — `as`-casts compile through the brand.
 *
 * The shell script (packages/km-infra/scripts/check-no-handle-cast.sh)
 * is the convention-driven complement to the runtime gate. This test
 * pins the shell script's expected output so a regression in the script
 * (e.g. someone widens the allowlist or breaks the regex) surfaces
 * immediately, not on the next CI run.
 *
 * km-silvery.handle-cast-lint.
 */

import { describe, test, expect } from "vitest"
import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "..", "..", "..")
const SCRIPT = join(REPO_ROOT, "packages/km-infra/scripts/check-no-handle-cast.sh")

describe("no-handle-cast guard", () => {
  test("script reports clean on the current tree", () => {
    // The factory file (scoped-tick.ts) is in the allowlist; everything
    // else must not have `as TickHandle` casts.
    const out = execSync(`bash ${SCRIPT}`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    expect(out).toContain("OK: no-handle-cast clean")
  })

  test("regex catches `as TickHandle` outside factories", () => {
    // Sanity-check the regex itself by piping a synthetic offender line.
    // We can't easily stage a sabotage file (would pollute the working
    // tree), so we exercise the grep pattern directly.
    const offender = "apps/silvercode/src/foo.ts:42:const fake = {} as TickHandle"
    const matched = execSync(`printf '%s\\n' ${JSON.stringify(offender)} | grep -E ' as (TickHandle)\\b' || true`, {
      encoding: "utf8",
    })
    expect(matched.trim()).toBe(offender)
  })

  test("regex does NOT match unrelated *Handle types", () => {
    // SessionHandle, AppHandle, TextHandle, RunHandle are unrelated
    // framework concepts and must NOT be conflated with branded handles.
    const cases = [
      "apps/silvercode/storybook/support/fake-session-handle.ts:75:  } as unknown as SessionHandle",
      "vendor/silvery/examples/apps/app-todo.tsx:193:  const handle = (await app.run()) as AppHandle<State>",
      "vendor/silvery/packages/ag-term/src/runtime/run.tsx:562:/** Wrap AppHandle as RunHandle (subset of the full handle). */",
    ]
    for (const line of cases) {
      const matched = execSync(`printf '%s\\n' ${JSON.stringify(line)} | grep -E ' as (TickHandle)\\b' || true`, {
        encoding: "utf8",
      })
      expect(matched.trim()).toBe("")
    }
  })
})
