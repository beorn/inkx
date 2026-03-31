import { describe, it, expect, beforeEach } from 'vitest'
import { createBoardDriver } from '../src/driver.ts'
import { createFakeRepo } from '@km/storage'
import { item } from './helpers/board-test.ts'

describe('Column header interactions — km-tui.title-as-card', () => {
  let driver: ReturnType<typeof createBoardDriver>

  beforeEach(() => {
    const nodes = item('board', 
      item('col1', item('task1'), item('task2')),
      item('col2', item('task3'))
    )
    const repo = createFakeRepo({ nodes })
    driver = createBoardDriver(repo, 'board')
  })

  it('should start with cursor on first card', () => {
    const state = driver.getState()
    expect(state.cursor.level).toBe('card')
    expect(state.cursor.col).toBe(0)
    expect(state.cursor.card).toBe(0)
  })

  it('pressing h from first card should move to column header', async () => {
    const stateBefore = driver.getState()
    expect(stateBefore.cursor.level).toBe('card')
    expect(stateBefore.cursor.col).toBe(0)
    expect(stateBefore.cursorNodeId).toBe('task1') // Starts at task1

    await driver.press('h')

    const stateAfter = driver.getState()
    // GAP 1 FIX: h at col=0 should position at column header
    expect(stateAfter.cursor.level).toBe('column')
    expect(stateAfter.cursor.col).toBe(0)
    expect(stateAfter.cursor.card).toBe(-1) // -1 indicates column level
    // Check that cursorNodeId is actually set to the column
    expect(stateAfter.cursorNodeId).toBe('col1')
  })

  it('pressing Enter on column header should start inline edit', async () => {
    // First move to column header
    const stateBeforeH = driver.getState()
    expect(stateBeforeH.cursor.level).toBe('card')

    await driver.press('h')

    const stateAtColumn = driver.getState()
    expect(stateAtColumn.cursor.level).toBe('column')
    const columnNodeId = stateAtColumn.selectedNodeId
    expect(columnNodeId).toBe('col1')

    // Debug: check what the cursor/selected node actually is
    expect(stateAtColumn.cursorNodeId).toBe('col1') // Should be column ID after h

    // Now press Enter to start inline edit
    await driver.press('Return')

    const stateAfterEnter = driver.getState()
    // GAP 2 FIX: Enter at column level should start inline edit with column nodeId
    // The inlineEditBlock should have been set to the column's nodeId
    expect(stateAfterEnter.inlineEditBlock).toBeDefined()
    expect(stateAfterEnter.inlineEditBlock?.nodeId).toBe('col1')
  })
})
