/**
 * QueryFieldError — query-helpful-errors.
 *
 * Before: an unknown DSL key (e.g. `scope=open`) interpolated into SQL,
 * surfaced as `SQLiteError: no such column: scope` plus a Bun stack
 * trace. Now: parser/executor catches the unknown column and throws a
 * typed error with allowlist + alias hint, so the CLI layer can render
 * a helpful message instead of leaking SQL guts.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import type { Database } from "bun:sqlite"
import { parseQuery, executeQuery, QueryFieldError } from "../src/query.ts"
import { createTestDatabase } from "./query-test-helpers.ts"

describe("QueryFieldError on unknown DSL field", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    db.close()
  })

  test("unknown field throws QueryFieldError, not SQLiteError", () => {
    const ast = parseQuery("scope=open")
    expect(() => executeQuery(db, ast)).toThrow(QueryFieldError)
  })

  test("error carries the offending field name and a hint", () => {
    const ast = parseQuery("scope=open")
    let err: unknown
    try {
      executeQuery(db, ast)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(QueryFieldError)
    const qfe = err as QueryFieldError
    expect(qfe.field).toBe("scope")
    expect(qfe.message).toContain("Unknown attribute: 'scope'")
    expect(qfe.hint).toContain("Valid attributes")
    // Aliases pointing at the canonical column are surfaced so users
    // can self-correct without grepping the schema.
    expect(qfe.hint).toContain("status (= task_status)")
  })

  test("known field still works (regression guard)", () => {
    const ast = parseQuery("status:todo")
    expect(() => executeQuery(db, ast)).not.toThrow()
  })

  test("aliased field (status) is mapped before the allowlist check", () => {
    // FIELD_ALIASES maps status → task_status; the allowlist sees the
    // mapped name. Empty result is fine — the contract is "no throw".
    const ast = parseQuery("status:done")
    expect(() => executeQuery(db, ast)).not.toThrow()
  })
})
