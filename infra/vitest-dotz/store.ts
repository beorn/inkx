/**
 * TestStore - External state management for DotzReporter
 *
 * Subscription-based store for useSyncExternalStore. Tracks test states,
 * durations, and categories with support for test retries.
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

export interface CategoryStats extends FileStats {
  files: Map<string, FileStats>
  fileOrder: string[]
}

export interface SlowestTest {
  name: string
  file: string
  line?: number
  duration: number
}

export interface TestError {
  name: string
  file: string
  errors: Array<{ message: string; stack?: string }>
}

export interface TestStoreState {
  testStates: Map<string, TestState>
  testDurations: Map<string, number>
  testOrder: string[]
  noisyTestIds: Set<string>
  fileStats: Map<string, FileStats>
  fileOrder: string[]
  testToFile: Map<string, string>
  categoryStats: Map<string, CategoryStats>
  categoryOrder: string[]
  testToCategory: Map<string, string>
  passed: number
  failed: number
  skipped: number
  topSlowest: SlowestTest[]
  testErrors: Map<string, TestError>
  startTime: number
  isRunning: boolean
}

export interface TestStore {
  getSnapshot: () => TestStoreState
  subscribe: (listener: () => void) => () => void
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
    line: number | undefined,
    duration: number,
    threshold: number,
  ) => void
}

// =============================================================================
// Helpers
// =============================================================================

const createFileStats = (): FileStats => ({
  testIds: [],
  passed: 0,
  failed: 0,
  skipped: 0,
  duration: 0,
  slowCount: 0,
})

const createCategoryStats = (): CategoryStats => ({
  ...createFileStats(),
  files: new Map(),
  fileOrder: [],
})

/** Adjust counters for state transition (handles retries via decrement-then-increment) */
function adjustCounters(
  stats: { passed: number; failed: number; skipped: number },
  prev: TestState | undefined,
  next: TestState,
) {
  if (prev === "passed") stats.passed--
  else if (prev === "failed") stats.failed--
  else if (prev === "skipped") stats.skipped--

  if (next === "passed") stats.passed++
  else if (next === "failed") stats.failed++
  else if (next === "skipped") stats.skipped++
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

export function createTestStore(slowThreshold = 100): TestStore {
  let state = createInitialState()
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())

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

      // File stats
      let fileStat = state.fileStats.get(file)
      if (!fileStat) {
        fileStat = createFileStats()
        state.fileStats.set(file, fileStat)
        state.fileOrder.push(file)
      }
      fileStat.testIds.push(id)

      // Category stats
      let catStats = state.categoryStats.get(category)
      if (!catStats) {
        catStats = createCategoryStats()
        state.categoryStats.set(category, catStats)
        state.categoryOrder.push(category)
      }
      catStats.testIds.push(id)

      // Category file stats
      let catFileStats = catStats.files.get(file)
      if (!catFileStats) {
        catFileStats = createFileStats()
        catStats.files.set(file, catFileStats)
        catStats.fileOrder.push(file)
      }
      catFileStats.testIds.push(id)

      notify()
    },

    updateTest: (id, testState, duration, errors, isNoisy) => {
      const prevState = state.testStates.get(id)
      state.testStates.set(id, testState)
      state.testDurations.set(id, duration)

      // Update aggregate counters
      adjustCounters(state, prevState, testState)

      if (isNoisy) state.noisyTestIds.add(id)

      if (testState === "failed" && errors?.length) {
        state.testErrors.set(id, {
          name: id,
          file: state.testToFile.get(id) ?? "unknown",
          errors,
        })
      }

      const isSlow = duration >= slowThreshold
      const file = state.testToFile.get(id)
      const category = state.testToCategory.get(id)

      // Update file stats
      const fileStat = file && state.fileStats.get(file)
      if (fileStat) {
        adjustCounters(fileStat, prevState, testState)
        fileStat.duration += duration
        if (isSlow) fileStat.slowCount++
      } else if (file) {
        debug("updateTest: file not found in fileStats: %s", file)
      }

      // Update category stats
      const catStats = category && state.categoryStats.get(category)
      if (catStats) {
        adjustCounters(catStats, prevState, testState)
        catStats.duration += duration
        if (isSlow) catStats.slowCount++

        // Update category file stats
        const catFileStats = file && catStats.files.get(file)
        if (catFileStats) {
          adjustCounters(catFileStats, prevState, testState)
          catFileStats.duration += duration
          if (isSlow) catFileStats.slowCount++
        } else if (file) {
          debug("updateTest: file not found in category files: %s/%s", category, file)
        }
      } else if (category) {
        debug("updateTest: category not found in categoryStats: %s", category)
      }

      notify()
    },

    setRunning: (running) => {
      state.isRunning = running
      if (running) state.startTime = Date.now()
      notify()
    },

    updateSlowest: (name, file, line, duration, threshold) => {
      if (duration < threshold * 2) return
      debug("slow test: %s duration=%dms threshold=%dms", name, duration, threshold)
      state.topSlowest.push({ name, file, line, duration })
      state.topSlowest.sort((a, b) => b.duration - a.duration)
      if (state.topSlowest.length > 20) state.topSlowest.length = 20
      notify()
    },
  }
}
