/**
 * Unit tests for resolveAssignee — shared helper used by bd claim and tasks claim.
 *
 * Priority: git config user.name → process.env.USER → "unknown".
 * All results are kebab-cased + lowercased.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"

// Mock node:child_process so we can simulate git success/failure deterministically.
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}))

import { execSync } from "node:child_process"
import { resolveAssignee } from "../src/utils/assignee.ts"

const mockedExecSync = execSync as unknown as ReturnType<typeof vi.fn>

describe("resolveAssignee", () => {
  const originalUser = process.env.USER

  beforeEach(() => {
    mockedExecSync.mockReset()
  })

  afterEach(() => {
    if (originalUser === undefined) {
      delete process.env.USER
    } else {
      process.env.USER = originalUser
    }
  })

  test("returns kebab-cased git name when set", () => {
    mockedExecSync.mockReturnValue("Bjørn Stabell\n")
    expect(resolveAssignee()).toBe("bjrn-stabell")
  })

  test("lowercases simple git name", () => {
    mockedExecSync.mockReturnValue("Alice\n")
    expect(resolveAssignee()).toBe("alice")
  })

  test("collapses multiple spaces in git name", () => {
    mockedExecSync.mockReturnValue("First   Last\n")
    expect(resolveAssignee()).toBe("first-last")
  })

  test("falls back to env.USER when git unavailable", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git not found")
    })
    process.env.USER = "beorn"
    expect(resolveAssignee()).toBe("beorn")
  })

  test("falls back to env.USER when git returns empty", () => {
    mockedExecSync.mockReturnValue("\n")
    process.env.USER = "Beorn-Test"
    expect(resolveAssignee()).toBe("beorn-test")
  })

  test("returns 'unknown' when neither git nor env.USER available", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git not found")
    })
    delete process.env.USER
    expect(resolveAssignee()).toBe("unknown")
  })

  test("strips non-alphanumeric chars from env.USER fallback", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git not found")
    })
    process.env.USER = "user_name!"
    expect(resolveAssignee()).toBe("username")
  })
})
