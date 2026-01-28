import { useContext } from 'react'
import type { Term } from '@beorn/term'
import { TermContext } from '../render.js'

/**
 * Hook to access the Term in components.
 * Must be used within a component rendered via tui's render().
 */
export function useTerm(): Term {
  const term = useContext(TermContext)
  if (!term) {
    throw new Error('useTerm must be used within a tui render() context')
  }
  return term
}
