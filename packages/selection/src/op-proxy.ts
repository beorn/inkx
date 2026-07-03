/**
 * op() — Operations as Data proxy.
 *
 * Wraps any object with a Proxy that intercepts method calls and routes them
 * through an `apply` callback as serializable OpDescriptor data. Property reads
 * pass through transparently. Nested object access accumulates the path.
 *
 * ```ts
 * op(sel, apply).node.select(["C"])
 * // → apply({ type: "model-op", path: ["node", "select"], args: [["C"]], run: ... })
 * ```
 *
 * See hub/silvery/design/v15-tea/app.md § "op() Proxy — Operations as Data"
 */

/** A serializable descriptor of a method call captured by op(). */
export type OpDescriptor = {
  readonly type: "model-op"
  readonly path: string[]
  readonly args: unknown[]
  readonly run: () => unknown
}

/** Callback that receives each intercepted method call. */
export type OpApply = (descriptor: OpDescriptor) => unknown

/**
 * Wrap `target` with a Proxy that intercepts method calls as OpDescriptors.
 *
 * - **Method calls**: intercepted → routed through `apply` as `{ type, path, args, run }`
 * - **Nested objects**: return another proxy that accumulates the path
 * - **Primitive reads**: pass through unchanged
 * - **Symbol properties**: pass through unchanged (iterators, toStringTag, etc.)
 */
export function op<T extends object>(target: T, apply: OpApply): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      // Let symbols pass through — iterators, toStringTag, toPrimitive, etc.
      if (typeof prop === "symbol") {
        return Reflect.get(obj, prop, receiver)
      }

      const val = Reflect.get(obj, prop, receiver)

      if (typeof val === "function") {
        const fn = val as (...a: unknown[]) => unknown
        return (...args: unknown[]) =>
          apply({
            type: "model-op",
            path: [prop],
            args,
            run: () => fn.apply(obj, args),
          })
      }

      if (typeof val === "object" && val !== null) {
        return op(val, (desc) =>
          apply({
            ...desc,
            path: [prop, ...desc.path],
          }),
        )
      }

      return val
    },
  }) as T
}
