/**
 * @failure Command metadata or invocation data cannot be projected across JSON surfaces.
 * @level l1
 * @consumer Silvery command adapters and applications such as Hab and Yrd.
 */
import { describe, expect, test } from "vitest"
import {
  command,
  commandNode,
  createCommandRegistry,
  defineCommandNodes,
  defineCommands,
  flattenCommandNodes,
  isCommand,
  isCommandNode,
  resolveInvocation,
} from "../src/index.ts"
import type { JsonValue } from "../src/index.ts"

describe("serializable command registry", () => {
  test("derives stable operations from a JSON command tree", () => {
    const open = command<{ branch: string }>({
      title: "Open bay",
      description: "Open a work bay from a branch",
      metadata: { access: "write", visibility: "public", adapter: { name: "yrd" } },
    })
    const status = command({
      title: "Line status",
      metadata: { access: "read", output: "json", idempotent: true },
    })
    const tree = defineCommands({ bay: { open }, line: { status } })

    expect(JSON.parse(JSON.stringify(tree))).toEqual({
      bay: {
        open: {
          kind: "command",
          title: "Open bay",
          description: "Open a work bay from a branch",
          metadata: { access: "write", visibility: "public", adapter: { name: "yrd" } },
        },
      },
      line: {
        status: {
          kind: "command",
          title: "Line status",
          metadata: { access: "read", output: "json", idempotent: true },
        },
      },
    })

    const registry = createCommandRegistry(tree)
    expect(registry.entries.map(({ op, path }) => ({ op, path }))).toEqual([
      { op: "bay.open", path: ["bay", "open"] },
      { op: "line.status", path: ["line", "status"] },
    ])
    expect(registry.commandAt("bay.open")).toBe(open)
    expect(registry.pathOf(open)).toEqual(["bay", "open"])
    expect(registry.operation(open, { branch: "main" })).toEqual({
      op: "bay.open",
      args: { branch: "main" },
    })
    expect(registry.operation(status)).toEqual({ op: "line.status" })
    expect(Object.isFrozen(registry.operation(status))).toBe(true)

    const typeContract = () => {
      // @ts-expect-error open requires its typed JSON args
      registry.operation(open)
      // @ts-expect-error status accepts no args
      registry.operation(status, { verbose: true })
    }
    expect(typeContract).toBeTypeOf("function")
  })

  test("rejects non-JSON data and ambiguous command references", () => {
    expect(() =>
      command({
        title: "Unsafe",
        metadata: { extension: () => undefined } as never,
      }),
    ).toThrow("metadata must be JSON data")

    const run = command<{ input: JsonValue }>({ title: "Run" })
    const registry = createCommandRegistry(defineCommands({ task: { run } }))
    const cyclic: Record<string, JsonValue> = {}
    cyclic.self = cyclic
    expect(() => registry.operation(run, { input: cyclic })).toThrow("args must be JSON data")

    expect(() => createCommandRegistry(defineCommands({ first: run, second: run }))).toThrow(
      "already registered",
    )
  })
})

describe("command nodes", () => {
  test("carries behavior over the substrate and resolves invocations", () => {
    const open = commandNode<{ allowed: boolean }, { branch: string }, string>({
      title: "Open bay",
      params: {
        parse: (value) => value as { branch: string },
        missing: (value) =>
          typeof value === "object" && value !== null && "branch" in value ? [] : ["branch"],
      },
      isAvailable: (ctx) => ctx.allowed || "locked",
      run: (_ctx, params) => `opened ${params.branch}`,
    })

    expect(isCommandNode(open)).toBe(true)
    expect(isCommand(open)).toBe(true)
    expect(isCommandNode(command({ title: "Data only" }))).toBe(false)

    const tree = defineCommandNodes({ bay: { open } })
    expect(flattenCommandNodes(tree)).toEqual([
      { id: "bay.open", path: ["bay", "open"], command: open },
    ])

    expect(resolveInvocation(open, { allowed: false })).toEqual({
      state: "unavailable",
      reason: "locked",
    })
    expect(resolveInvocation(open, { allowed: true })).toEqual({
      state: "prompt",
      missing: ["branch"],
    })
    expect(resolveInvocation(open, { allowed: true }, { branch: "main" })).toEqual({
      state: "ready",
      params: { branch: "main" },
    })
    expect(resolveInvocation(undefined, { allowed: true })).toEqual({ state: "unknown" })
  })
})
