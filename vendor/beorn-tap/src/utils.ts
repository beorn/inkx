/**
 * Formats milliseconds into a human-readable string.
 *
 * @param ms - Time in milliseconds
 * @returns Formatted string (e.g., "142ms" or "3.5s")
 */
export function formatMs(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	return `${(ms / 1000).toFixed(1)}s`
}
