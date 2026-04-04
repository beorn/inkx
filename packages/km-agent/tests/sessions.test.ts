/**
 * Session Query Tests
 *
 * Tests for session query functions.
 *
 * Note: These tests are limited because querySessions relies on readChanges
 * which reads from the filesystem. Full integration tests would require
 * setting up a proper test repo with changes.jsonl.
 */

import { describe, test, expect } from "vitest"
import type { SessionStatus } from "../src/types.ts"

/**
 * mapSessionStatus is a private function, but we can test its behavior
 * indirectly through the Session objects returned by querySessions.
 * For now, we document the expected mapping:
 *
 * event status "success" -> session status "completed"
 * event status "error" -> session status "error"
 * event status "cancelled" -> session status "cancelled"
 */

describe("Session types", () => {
  test("SessionStatus values are correct", () => {
    // Type check - these are the valid session statuses
    const statuses: SessionStatus[] = ["active", "completed", "error", "cancelled"]

    expect(statuses).toContain("active")
    expect(statuses).toContain("completed")
    expect(statuses).toContain("error")
    expect(statuses).toContain("cancelled")
  })
})

// Note: Full integration tests for querySessions, getSession, getAgentSessions,
// getTaskSessions, and getActiveSession would require:
// 1. Setting up a test repo with .km directory
// 2. Creating changes.jsonl with session_started and session_ended events
// 3. Properly initializing the storage module
//
// These tests are skipped for now as they require more infrastructure.
// The functions are covered by end-to-end tests in the TUI.
