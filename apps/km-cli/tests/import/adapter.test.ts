/**
 * Import Adapter Interface Tests
 *
 * Tests for: adapter registry, adapter lookup, file extension matching.
 */

import { describe, expect, test, beforeEach } from "vitest"

// Import the registry functions — adapters are registered via side effect
import { getAdapter, listAdapters, findAdapterForExtension } from "../../src/import/adapter.ts"

// Register built-in adapters
import "../../src/import/adapters/index.ts"

describe("adapter registry", () => {
  test("lists registered adapters", () => {
    const ids = listAdapters()
    expect(ids).toContain("asana")
    expect(ids).toContain("csv")
  })

  test("gets adapter by id", () => {
    const asana = getAdapter("asana")
    expect(asana).toBeDefined()
    expect(asana!.id).toBe("asana")
    expect(asana!.name).toBe("Asana")

    const csv = getAdapter("csv")
    expect(csv).toBeDefined()
    expect(csv!.id).toBe("csv")
    expect(csv!.name).toBe("CSV/TSV")
  })

  test("returns undefined for unknown adapter", () => {
    expect(getAdapter("unknown")).toBeUndefined()
  })
})

describe("file extension matching", () => {
  test("finds CSV adapter for .csv", () => {
    const adapter = findAdapterForExtension(".csv")
    expect(adapter).toBeDefined()
    expect(adapter!.id).toBe("csv")
  })

  test("finds CSV adapter for .tsv", () => {
    const adapter = findAdapterForExtension(".tsv")
    expect(adapter).toBeDefined()
    expect(adapter!.id).toBe("csv")
  })

  test("finds Asana adapter for .json", () => {
    const adapter = findAdapterForExtension(".json")
    expect(adapter).toBeDefined()
    expect(adapter!.id).toBe("asana")
  })

  test("handles extension without dot", () => {
    const adapter = findAdapterForExtension("csv")
    expect(adapter).toBeDefined()
    expect(adapter!.id).toBe("csv")
  })

  test("returns undefined for unknown extension", () => {
    expect(findAdapterForExtension(".xlsx")).toBeUndefined()
  })
})

describe("adapter capabilities", () => {
  test("Asana adapter has parse and fetch", () => {
    const asana = getAdapter("asana")!
    expect(asana.parse).toBeDefined()
    expect(asana.fetch).toBeDefined()
    expect(asana.preprocess).toBeDefined()
  })

  test("CSV adapter has parse but not fetch", () => {
    const csv = getAdapter("csv")!
    expect(csv.parse).toBeDefined()
    expect(csv.fetch).toBeUndefined()
    expect(csv.preprocess).toBeUndefined()
  })
})
