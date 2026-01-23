/**
 * Seeded Random Number Generator
 *
 * Provides reproducible random numbers for chaos tests.
 * Uses a simple Linear Congruential Generator (LCG) algorithm.
 */

export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /**
   * Returns a random number between 0 and 1
   */
  next(): number {
    // LCG algorithm with commonly used constants
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return this.seed / 2 ** 32;
  }

  /**
   * Returns a random integer between min (inclusive) and max (exclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Returns a random float between min and max
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Returns true with given probability (0-1)
   */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Pick a random element from an array
   */
  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length)];
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Shuffle elements within a sliding window
   * Each element may be swapped with another element within windowSize positions
   */
  shuffleWithinWindow<T>(array: T[], windowSize: number): T[] {
    const result = [...array];
    for (let i = 0; i < result.length; i++) {
      const maxSwap = Math.min(i + windowSize, result.length - 1);
      const j = this.nextInt(i, maxSwap + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Get the current seed (useful for debugging)
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Reset to a specific seed
   */
  reset(seed: number): void {
    this.seed = seed;
  }
}
