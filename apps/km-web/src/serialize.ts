/**
 * Serialization helpers for Repo RPC.
 *
 * Maps aren't JSON-serializable. Methods that return Map<K,V>
 * are serialized as { __map: true, entries: [K, V][] }.
 */

/** Methods whose return value is a Map */
const MAP_METHODS = new Set(["getNodesBatch", "getChildCounts"])

/** Serialize a Repo method result for WebSocket transport */
export function serializeResult(method: string, result: unknown): unknown {
  if (MAP_METHODS.has(method) && result instanceof Map) {
    return { __map: true, entries: [...result.entries()] }
  }
  return result
}

/** Deserialize a WebSocket result back to its original type */
export function deserializeResult(method: string, data: unknown): unknown {
  if (MAP_METHODS.has(method) && data != null && typeof data === "object" && "__map" in data && "entries" in data) {
    const { entries } = data as { entries: [unknown, unknown][] }
    return new Map(entries)
  }
  return data
}
