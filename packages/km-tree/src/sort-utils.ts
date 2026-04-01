/**
 * Sort Order Utilities
 *
 * Centralized helpers for computing sort order positions in the tree.
 * Used by tree mutations, block operations, and outliner behaviors
 * to place nodes between siblings.
 */

/** Compute the midpoint between two sort order values. */
export function midpoint(a: number, b: number): number {
  return (a + b) / 2
}
