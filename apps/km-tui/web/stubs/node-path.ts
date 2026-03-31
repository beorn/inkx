/** Browser stub for node:path */
export function join(...parts: string[]) {
  return parts.join("/").replace(/\/+/g, "/")
}
export function resolve(...parts: string[]) {
  return join(...parts)
}
export function basename(p: string, ext?: string) {
  const base = p.split("/").pop() ?? ""
  return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base
}
export function dirname(p: string) {
  const parts = p.split("/")
  parts.pop()
  return parts.join("/") || "."
}
export function extname(p: string) {
  const base = basename(p)
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot) : ""
}
export function relative(from: string, to: string) {
  return to
}
export function normalize(p: string) {
  return p
}
export const sep = "/"
export const posix = { join, resolve, basename, dirname, extname, relative, normalize, sep }
export default { join, resolve, basename, dirname, extname, relative, normalize, sep, posix }
