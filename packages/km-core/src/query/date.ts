/**
 * Date Query Resolution
 *
 * Resolves date shortcuts and ranges for query filtering.
 */

/**
 * Date range for query resolution
 */
export interface DateRange {
  start: string;
  end: string;
}

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Date shortcut names
 */
const DATE_SHORTCUTS = [
  "today",
  "tomorrow",
  "yesterday",
  "week",
  "past",
  "overdue",
];

/**
 * Date fields in the schema
 */
const DATE_FIELDS = ["due_date", "scheduled_date", "created_at", "updated_at"];

/**
 * Check if a value is a date shortcut or date range
 */
export function isDateShortcut(value: string): boolean {
  // Check for date range pattern (YYYY-MM-DD-YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}$/.test(value)) {
    return true;
  }
  return DATE_SHORTCUTS.includes(value.toLowerCase());
}

/**
 * Check if a field is a date field
 */
export function isDateField(field: string): boolean {
  return DATE_FIELDS.includes(field);
}

/**
 * Resolve a date shortcut to a date range (YYYY-MM-DD format)
 *
 * Supported shortcuts:
 * - today: today's date
 * - tomorrow: tomorrow's date
 * - yesterday: yesterday's date
 * - week: next 7 days (including today)
 * - past: all dates before today (overdue)
 * - YYYY-MM-DD: exact date
 * - YYYY-MM-DD-YYYY-MM-DD: date range
 */
export function resolveDateQuery(value: string): DateRange | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (value.toLowerCase()) {
    case "today": {
      const dateStr = formatDate(today);
      return { start: dateStr, end: dateStr };
    }

    case "tomorrow": {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = formatDate(tomorrow);
      return { start: dateStr, end: dateStr };
    }

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = formatDate(yesterday);
      return { start: dateStr, end: dateStr };
    }

    case "week": {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return { start: formatDate(today), end: formatDate(weekEnd) };
    }

    case "past":
    case "overdue": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: "0000-01-01", end: formatDate(yesterday) };
    }

    default: {
      // Check if it's a date range pattern (YYYY-MM-DD-YYYY-MM-DD)
      const rangeMatch = value.match(
        /^(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/,
      );
      if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
        return { start: rangeMatch[1], end: rangeMatch[2] };
      }

      // Check if it's a single date pattern (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { start: value, end: value };
      }
      return null;
    }
  }
}
