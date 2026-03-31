/** Browser stub for node:events — minimal EventEmitter */
export class EventEmitter {
  private _listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  on(event: string, fn: (...args: unknown[]) => void) {
    ;(this._listeners[event] ??= []).push(fn)
    return this
  }

  off(event: string, fn: (...args: unknown[]) => void) {
    const arr = this._listeners[event]
    if (arr) this._listeners[event] = arr.filter((f) => f !== fn)
    return this
  }

  once(event: string, fn: (...args: unknown[]) => void) {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped)
      fn(...args)
    }
    return this.on(event, wrapped)
  }

  emit(event: string, ...args: unknown[]) {
    for (const fn of this._listeners[event] ?? []) fn(...args)
    return (this._listeners[event]?.length ?? 0) > 0
  }

  removeAllListeners(event?: string) {
    if (event) delete this._listeners[event]
    else this._listeners = {}
    return this
  }

  listenerCount(event: string) {
    return this._listeners[event]?.length ?? 0
  }

  addListener(event: string, fn: (...args: unknown[]) => void) {
    return this.on(event, fn)
  }

  removeListener(event: string, fn: (...args: unknown[]) => void) {
    return this.off(event, fn)
  }
}

export default EventEmitter
