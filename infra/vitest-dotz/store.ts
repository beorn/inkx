/**
 * TestStore - External state management for DotzReporter
 *
 * Provides a subscription-based store that:
 * - Holds all test state (results, durations, categories, etc.)
 * - Exposes subscribe/getSnapshot API for useSyncExternalStore
 * - Updated by Reporter class lifecycle methods
 * - Triggers React re-renders on state changes
 */

import createDebug from "debug"
const debug = createDebug("km:vitest-dotz:store")

// =============================================================================
// Types
// =============================================================================

export type TestState = "pending" | "passed" | "failed" | "skipped"

export interface FileStats {
  testIds: string[]
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
}

export interface CategoryStats {
  testIds: string[]
  passed: number
  failed: number
  skipped: number
  duration: number
  slowCount: number
  files: Map<string, FileStats>
  fileOrder: string[]
}

export interface SlowestTest {
  name: string
  file: string
  duration: number
}

export interface TestError {
  name: string
  file: string
  errors: Array<{ message: string; stack?: string }>
}

export interface TestStoreState {
  // Test-level
  testStates: Map<string, TestState>
  testDurations: Map<string, number>
  testOrder: string[]
  noisyTestIds: Set<string>

  // File-level
  fileStats: Map<string, FileStats>
  fileOrder: string[]
  testToFile: Map<string, string>

  // Package-level
  categoryStats: Map<string, CategoryStats>
  categoryOrder: string[]
  testToCategory: Map<string, string>

  // Aggregates
  passed: number
  failed: number
  skipped: number
  topSlowest: SlowestTest[]
  testErrors: Map<string, TestError>

  // Session
  startTime: number
  isRunning: boolean
}

export interface TestStore {
  // useSyncExternalStore API
  getSnapshot: () => TestStoreState
  subscribe: (listener: () => void) => () => void

  // Mutation methods (called by Reporter class)
  reset: () => void
  addTest: (id: string, category: string, file: string) => void
  updateTest: (
    id: string,
    state: TestState,
    duration: number,
    errors?: TestError["errors"],
    isNoisy?: boolean,
  ) => void
  setRunning: (running: boolean) => void
  updateSlowest: (
    name: string,
    file: string,
    duration: number,
    threshold: number,
  ) => void
}

// =============================================================================
// Factory
// =============================================================================

function createInitialState(): TestStoreState {
  return {
    testStates: new Map(),
    testDurations: new Map(),
    testOrder: [],
    noisyTestIds: new Set(),
    fileStats: new Map(),
    fileOrder: [],
    testToFile: new Map(),
    categoryStats: new Map(),
    categoryOrder: [],
    testToCategory: new Map(),
    passed: 0,
    failed: 0,
    skipped: 0,
    topSlowest: [],
    testErrors: new Map(),
    startTime: Date.now(),
    isRunning: false,
  }
}

export function createTestStore(slowThreshold: number = 100): TestStore {
  let state: TestStoreState = createInitialState()
  const listeners = new Set<() => void>()

  function notify() {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSnapshot: () => state,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    reset: () => {
      state = createInitialState()
      notify()
    },

    addTest: (id, category, file) => {
      if (state.testStates.has(id)) return

      state.testStates.set(id, "pending")
      state.testOrder.push(id)
      state.testToCategory.set(id, category)
      state.testToFile.set(id, file)

      // Track file-level stats
      let fileStat = state.fileStats.get(file)
      if (!fileStat) {
        fileStat = {
          testIds: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          slowCount: 0,
        }
        state.fileStats.set(file, fileStat)
        state.fileOrder.push(file)
      }
      fileStat.testIds.push(id)

      // Track category-level stats
      let catStats = state.categoryStats.get(category)
      if (!catStats) {
        catStats = {
          testIds: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          slowCount: 0,
          files: new Map(),
          fileOrder: [],
        }
        state.categoryStats.set(category, catStats)
        state.categoryOrder.push(category)
      }
      catStats.testIds.push(id)

      // Track files within category
      let catFileStats = catStats.files.get(file)
      if (!catFileStats) {
        catFileStats = {
          testIds: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0,
          slowCount: 0,
        }
        catStats.files.set(file, catFileStats)
        catStats.fileOrder.push(file)
      }
      catFileStats.testIds.push(id)

      notify()
    },

    updateTest: (id, testState, duration, errors, isNoisy) => {
      state.testStates.set(id, testState)
      state.testDurations.set(id, duration)

      // Update aggregates
      if (testState === "passed") state.passed++
      else if (testState === "failed") state.failed++
      else if (testState === "skipped") state.skipped++

      // Track noisy tests
      if (isNoisy) {
        state.noisyTestIds.add(id)
      }

      // Track errors
      if (testState === "failed" && errors && errors.length > 0) {
        const file = state.testToFile.get(id) ?? "unknown"
        state.testErrors.set(id, {
          name: id,
          file,
          errors,
        })
      }

      const isSlow = duration >= slowThreshold
      const file = state.testToFile.get(id)
      const category = state.testToCategory.get(id)

      // Update file stats
      if (file) {
        const fileStat = state.fileStats.get(file)
        if (fileStat) {
          fileStat.duration += duration
          if (testState === "passed") fileStat.passed++
          else if (testState === "failed") fileStat.failed++
          else if (testState === "skipped") fileStat.skipped++
          if (isSlow) fileStat.slowCount++
        }
      }

      // Update category stats
      if (category) {
        const catStats = state.categoryStats.get(category)
        if (catStats) {
          catStats.duration += duration
          if (testState === "passed") catStats.passed++
          else if (testState === "failed") catStats.failed++
          else if (testState === "skipped") catStats.skipped++
          if (isSlow) catStats.slowCount++

          // Update file stats within category
          if (file) {
            const catFileStats = catStats.files.get(file)
            if (catFileStats) {
              catFileStats.duration += duration
              if (testState === "passed") catFileStats.passed++
              else if (testState === "failed") catFileStats.failed++
              else if (testState === "skipped") catFileStats.skipped++
              if (isSlow) catFileStats.slowCount++
            }
          }
        }
      }

      notify()
    },

    setRunning: (running) => {
      state.isRunning = running
      if (running) {
        state.startTime = Date.now()
      }
      notify()
    },

    updateSlowest: (name, file, duration, threshold) => {
      // Show tests that are at least 2x the threshold (e.g., 200ms for 100ms threshold)
      const minDuration = threshold * 2
      if (duration >= minDuration) {
        debug(
          "slow test: %s duration=%dms minDuration=%dms",
          name,
          duration,
          minDuration,
        )
        state.topSlowest.push({ name, file, duration })
        state.topSlowest.sort((a, b) => b.duration - a.duration)
        // Keep only top entries (will be limited in display)
        if (state.topSlowest.length > 20) {
          state.topSlowest = state.topSlowest.slice(0, 20)
        }
        notify()
      }
    },
  }
}
