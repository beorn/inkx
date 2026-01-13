/**
 * @km/query - Query Language Parser
 *
 * Pure query parsing without database dependencies.
 * Use @km/store for executing queries against SQLite.
 */

export {
  parseQuery,
  mapFieldName,
  type QueryAST,
  type QueryCondition,
  type QueryRef,
  type QueryPath,
  type QueryOffset,
  type QueryText,
  type QueryPhrase,
} from "./parser.ts";

export {
  resolveDateQuery,
  isDateShortcut,
  isDateField,
  type DateRange,
} from "./date.ts";
